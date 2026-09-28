/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron';
import { systemSettings } from '@/common/adapter/ipcBridge';
import i18n from '@process/services/i18n';
import { ProcessConfig } from '@process/utils/initStorage';
import { PetStateMachine } from './petStateMachine';
import { PetIdleTicker } from './petIdleTicker';
import { PetEventBridge } from './petEventBridge';
import { setPetNotifyHook } from '../../common/adapter/main';
import {
  initPetConfirmManager,
  updateAnchorBounds,
  destroyPetConfirmManager,
  unhookPetConfirm,
} from './petConfirmManager';
import {
  isPetPoint,
  normalizePetSize,
  resolvePetPosition,
  shouldPersistPetPosition,
  type PetPoint,
} from './petPlacement';
import type { PetSize, PetState } from './petTypes';
import { publishPetOverlayVisible } from './petVisibility';

/**
 * Check whether the current environment can support desktop pet windows.
 * Returns false on Linux headless (ozone-platform=headless) where creating
 * and destroying BrowserWindows triggers fatal D-Bus / shutdown crashes.
 */
export function isPetSupported(): boolean {
  if (process.platform === 'linux') {
    const ozonePlatform = app.commandLine.getSwitchValue('ozone-platform');
    if (ozonePlatform === 'headless') {
      return false;
    }
  }
  return true;
}

// petManager is dynamically imported → rollup places it in out/main/chunks/,
// so __dirname is out/main/chunks/ and we need '../..' to reach out/.
const PRELOAD_DIR = path.join(__dirname, '..', '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer', 'pet');

let petWindow: BrowserWindow | null = null;
let petHitWindow: BrowserWindow | null = null;
let stateMachine: PetStateMachine | null = null;
let idleTicker: PetIdleTicker | null = null;
let eventBridge: PetEventBridge | null = null;
let currentSize: PetSize = 280;
let currentDnd = false;
let savedPosition: PetPoint | null = null;
/** Last coordinates setPosition was asked to apply during the current drag. */
let lastRequestedPosition: PetPoint | null = null;
let dragTimer: ReturnType<typeof setInterval> | null = null;
let dragWatchdog: ReturnType<typeof setTimeout> | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let preDragState: PetState | null = null;

// Tick interval for the drag-follow timer (~60 FPS).
const DRAG_TICK_MS = 16;
// Hard timeout: if drag-end never arrives within this window, the main process
// force-ends the drag. Belt-and-braces against the renderer dropping pointerup
// (Windows transparent + frameless windows can lose pointer capture across a
// resize/move, leaving the pet stuck following the cursor with no way to stop
// short of restarting the app). 8s is generous enough that a real human drag
// — even one with a pause to think — completes well before then.
const DRAG_WATCHDOG_MS = 8000;
// Master-process safety watchdog for the hit window's ignore-mouse-events
// state. The renderer manages this toggle to implement click-through, but if
// the renderer crashes, hangs, or loses a critical mousemove, the hit window
// can stay in non-ignore mode forever and swallow every click on the screen
// (the window is `screen-saver` level and alwaysOnTop) — forcing the user to
// force-quit the app. This watchdog polls the real cursor position against
// the circular hit region and forces ignore=true whenever the cursor is
// clearly outside, independent of any renderer code path.
const HIT_WATCHDOG_INTERVAL_MS = 250;
// Allow 20% slack beyond the renderer's hit radius so the watchdog never
// races with the renderer on the exact circle boundary. The renderer owns
// the fine-grained toggle; the watchdog only kicks in once the cursor is
// clearly outside.
const HIT_WATCHDOG_RADIUS_SLACK = 1.2;
let hitIgnoreWatchdog: ReturnType<typeof setInterval> | null = null;
// Last ignore state the hit window was set to (tracked via the IPC handler so
// the watchdog can tell whether it's already safe).
let lastHitIgnoreState = true;
// Whether tool-call confirmations should be routed to the pet's bubble window.
// When false, the pet still runs normally but confirmation requests stay in the
// main chat window. Updated at runtime via setPetConfirmEnabled() and read on
// createPetWindow() so the initial value picked up from ProcessConfig at startup
// (see src/index.ts) is honored even though createPetWindow itself is sync.
let confirmBubbleEnabled = true;

// States that should be restored after drag ends (AI activity / notifications).
// User-interaction states (attention/poke/happy) and idle/sleep states are NOT restored.
const RESTORABLE_STATES: ReadonlySet<PetState> = new Set<PetState>(['thinking', 'working', 'error', 'notification']);

/**
 * Create pet windows (rendering window + hit detection window).
 */
export function createPetWindow(): void {
  if (!isPetSupported()) {
    console.warn('[Pet] Desktop pet is not supported in headless mode');
    return;
  }

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.show();
    petWindow.focus();
    syncPetOverlayVisibility();
    return;
  }

  const { x, y } = resolveStartupPosition(currentSize);

  // Rendering window (transparent, always on top, ignores mouse events)
  petWindow = new BrowserWindow({
    width: currentSize,
    height: currentSize,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'petPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    petWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    petWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  petWindow.setIgnoreMouseEvents(true);

  // Hit detection window (body area only, 60% of pet size)
  const hitSize = Math.round(currentSize * 0.6);
  const hitOffset = Math.round(currentSize * 0.2);

  petHitWindow = new BrowserWindow({
    width: hitSize,
    height: hitSize,
    x: x + hitOffset,
    y: y + hitOffset,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'petHitPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    petHitWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    petHitWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  petHitWindow.setIgnoreMouseEvents(true, { forward: true });

  // Initialize state machine, idle ticker, and event bridge
  stateMachine = new PetStateMachine();
  stateMachine.setDnd(currentDnd);
  idleTicker = new PetIdleTicker(stateMachine);
  eventBridge = new PetEventBridge(stateMachine, idleTicker);

  stateMachine.onStateChange((state: PetState) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:state-changed', state);
    }
  });

  idleTicker.onEyeMove((data) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:eye-move', data);
    }
  });

  idleTicker.setPetBounds(x, y, currentSize, currentSize);

  setPetNotifyHook((name: string, data: unknown) => {
    if (eventBridge) {
      eventBridge.handleBridgeMessage(name, data);
    }
  });

  idleTicker.start();
  registerIpcHandlers();
  startHitIgnoreWatchdog();
  loadContent();

  // Initialize confirm manager only if the user opted in.
  // When disabled, AI tool-call confirmations remain in the main chat window
  // instead of being routed to a pet bubble.
  if (confirmBubbleEnabled) {
    initPetConfirmManager({ x, y, width: currentSize, height: currentSize });
  }

  petWindow.on('closed', () => {
    destroyPetWindow();
  });

  console.log('[Pet] Pet windows created');
  syncPetOverlayVisibility();
}

/**
 * Destroy pet windows and clean up resources.
 */
export function destroyPetWindow(): void {
  clearDragTimer();
  stopHitIgnoreWatchdog();

  // Destroy confirm manager
  destroyPetConfirmManager();

  if (eventBridge) {
    eventBridge.dispose();
    eventBridge = null;
  }

  if (idleTicker) {
    idleTicker.stop();
    idleTicker = null;
  }

  if (stateMachine) {
    stateMachine.dispose();
    stateMachine = null;
  }

  setPetNotifyHook(null);
  unregisterIpcHandlers();

  if (petHitWindow && !petHitWindow.isDestroyed()) {
    petHitWindow.destroy();
  }
  petHitWindow = null;

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.destroy();
  }
  petWindow = null;

  console.log('[Pet] Pet windows destroyed');
  syncPetOverlayVisibility();
}

/** True when the pet render window exists and is showing. */
export function isPetWindowVisible(): boolean {
  return Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
}

export function showPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) petWindow.show();
  if (petHitWindow && !petHitWindow.isDestroyed()) petHitWindow.show();
  syncPetOverlayVisibility();
}

export function hidePetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide();
  if (petHitWindow && !petHitWindow.isDestroyed()) petHitWindow.hide();
  syncPetOverlayVisibility();
}

/**
 * Publish overlay visibility for the tray menu.
 * This does not write `pet.enabled`. Settings creates or destroys the windows;
 * show and hide only change whether those windows are on screen.
 */
function syncPetOverlayVisibility(): void {
  publishPetOverlayVisible(isPetWindowVisible());
}

export function getEventBridge(): PetEventBridge | null {
  return eventBridge;
}

export function resizePetWindow(size: PetSize): void {
  void commitPetSize(size).catch(() => {
    // commitPetSize already logged the failure and restored the previous size.
  });
}

export function setPetDndMode(dnd: boolean): void {
  void commitPetDnd(dnd).catch(() => {
    // commitPetDnd already logged the failure and restored the previous mode.
  });
}

/**
 * Read saved size, do-not-disturb, and position, then show the pet.
 * Used at startup and when the user turns the pet back on, so a disable/enable
 * toggle restores the same preferences as a restart.
 */
export async function openPetFromSavedPreferences(): Promise<void> {
  await loadAndApplySavedPetPreferences();
  createPetWindow();
}

/** Load pet.size, pet.dnd, and pet.position into the in-memory pet state. */
export async function loadAndApplySavedPetPreferences(): Promise<void> {
  const [size, dnd, position] = await Promise.all([
    ProcessConfig.get('pet.size'),
    ProcessConfig.get('pet.dnd'),
    ProcessConfig.get('pet.position'),
  ]);
  const normalized = normalizePetSize(size);
  if (normalized) currentSize = normalized;
  if (typeof dnd === 'boolean') currentDnd = dnd;
  savedPosition = isPetPoint(position) ? { x: position.x, y: position.y } : null;
}

/**
 * Apply a size from Settings, the pet menu, or the tray, and persist it.
 * The main process is the only writer; the renderer hears about it through
 * `petPreferencesChanged`.
 */
export async function commitPetSize(size: number): Promise<void> {
  const normalized = normalizePetSize(size);
  if (!normalized) {
    throw new Error(`Invalid pet size: ${String(size)}`);
  }
  const previous = currentSize;
  resizePet(normalized);
  try {
    await ProcessConfig.set('pet.size', normalized);
  } catch (error) {
    console.error('[Pet] Failed to persist pet size:', error);
    resizePet(previous);
    throw error;
  }
  systemSettings.petPreferencesChanged.emit({ size: normalized });
}

/** Apply do-not-disturb from Settings or the pet menu, and persist it. */
export async function commitPetDnd(dnd: boolean): Promise<void> {
  const previous = currentDnd;
  applyDnd(dnd);
  try {
    await ProcessConfig.set('pet.dnd', dnd);
  } catch (error) {
    console.error('[Pet] Failed to persist pet do-not-disturb:', error);
    applyDnd(previous);
    throw error;
  }
  systemSettings.petPreferencesChanged.emit({ dnd });
}

function applyDnd(dnd: boolean): void {
  currentDnd = dnd;
  stateMachine?.setDnd(dnd);
}

/**
 * Enable or disable the pet's confirm-bubble window for AI tool-call
 * confirmations. When disabled, future confirmations stay in the main chat
 * window. Any confirmation already on-screen is left alone so the user can
 * finish responding to it — only the next request takes the new setting.
 */
export function setPetConfirmEnabled(enabled: boolean): void {
  confirmBubbleEnabled = enabled;

  // Pet not running → just remember the value for the next createPetWindow().
  if (!petWindow || petWindow.isDestroyed()) return;

  if (enabled) {
    // Late-enable: install the hook so future confirmations route to the bubble.
    // Use the current pet bounds as the initial anchor. A failed position read
    // (native Wayland can no-op these calls) skips the anchor instead of throwing.
    const position = readPetPosition();
    if (!position) return;
    initPetConfirmManager({ x: position.x, y: position.y, width: currentSize, height: currentSize });
  }
  // Late-disable: leave the existing confirm window (if any) alone — it will
  // self-destroy after the user responds to the current confirmation. New
  // confirmations will not reach it because we unhook here.
  else {
    unhookPetConfirm();
  }
}

/**
 * Default bottom-right placement on the display that currently hosts the main
 * AionUi window. Falls back to the primary display when no main window is
 * found (e.g. tray-only scenarios).
 */
function computeInitialPosition(size: number): PetPoint {
  const margin = 20;

  // Prefer the display under the main window's center so multi-monitor users
  // always see the pet appear on the same screen as the app. The first window
  // that isn't the (not-yet-created) pet window itself is treated as main —
  // since createPetWindow is called after the main window exists, that's a
  // safe assumption here.
  const candidate = BrowserWindow.getAllWindows().find(
    (w) => w !== petWindow && w !== petHitWindow && !w.isDestroyed()
  );

  let workArea;
  if (candidate) {
    const [mx, my] = candidate.getPosition();
    const [mw, mh] = candidate.getSize();
    const center = { x: mx + Math.floor(mw / 2), y: my + Math.floor(mh / 2) };
    workArea = screen.getDisplayNearestPoint(center).workArea;
  } else {
    workArea = screen.getPrimaryDisplay().workArea;
  }

  return {
    x: workArea.x + workArea.width - size - margin,
    y: workArea.y + workArea.height - size - margin,
  };
}

/** Saved position when it still fits on a display; otherwise the default corner. */
function resolveStartupPosition(size: number): PetPoint {
  return resolvePetPosition({
    saved: savedPosition,
    size,
    displays: screen.getAllDisplays().map((display) => ({
      bounds: display.bounds,
      workArea: display.workArea,
    })),
    fallback: computeInitialPosition(size),
  });
}

// ---------------------------------------------------------------------------
// Window content loading
// ---------------------------------------------------------------------------

function loadContent(): void {
  if (!petWindow || !petHitWindow) return;
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (!app.isPackaged && rendererUrl) {
    petWindow.loadURL(`${rendererUrl}/pet/pet.html`).catch((error) => {
      console.error('[Pet] loadURL failed for pet window:', error);
    });
    petHitWindow.loadURL(`${rendererUrl}/pet/pet-hit.html`).catch((error) => {
      console.error('[Pet] loadURL failed for pet-hit window:', error);
    });
  } else {
    petWindow.loadFile(path.join(RENDERER_DIR, 'pet.html')).catch((error) => {
      console.error('[Pet] loadFile failed for pet window:', error);
    });
    petHitWindow.loadFile(path.join(RENDERER_DIR, 'pet-hit.html')).catch((error) => {
      console.error('[Pet] loadFile failed for pet-hit window:', error);
    });
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers(): void {
  ipcMain.on('pet:drag-start', () => {
    if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) return;

    // Defensive: if a previous drag never reached drag-end (e.g. dropped
    // pointerup), the timer/watchdog could still be live. Tear it down through
    // endDrag() — not just clearDragTimer() — so the leftover preDragState and
    // state machine are also reset before we snapshot the new drag below.
    if (dragTimer || dragWatchdog) {
      endDrag();
    }

    const cursor = screen.getCursorScreenPoint();
    const windowPos = readPetPosition();
    // Position APIs can throw or no-op on native Wayland. Skip the drag rather
    // than computing an offset from garbage coordinates.
    if (!windowPos) return;
    dragOffsetX = cursor.x - windowPos.x;
    dragOffsetY = cursor.y - windowPos.y;

    // Snapshot AI activity state so we can restore it after drag ends
    const cur = stateMachine?.getCurrentState();
    preDragState = cur && RESTORABLE_STATES.has(cur) ? cur : null;

    stateMachine?.forceState('dragging');

    dragTimer = setInterval(() => {
      if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) {
        endDrag();
        return;
      }

      try {
        const dragCursor = screen.getCursorScreenPoint();
        const newX = dragCursor.x - dragOffsetX;
        const newY = dragCursor.y - dragOffsetY;
        const moved = safeSetPosition(petWindow, newX, newY);
        const hitOffset = Math.round(currentSize * 0.2);
        safeSetPosition(petHitWindow, newX + hitOffset, newY + hitOffset);
        if (!moved) return;
        lastRequestedPosition = { x: newX, y: newY };
        idleTicker?.setPetBounds(newX, newY, currentSize, currentSize);
      } catch (error) {
        console.warn('[Pet] drag tick failed:', error);
      }
    }, DRAG_TICK_MS);

    dragWatchdog = setTimeout(() => {
      console.warn('[Pet] drag-end not received in', DRAG_WATCHDOG_MS, 'ms — force-ending drag');
      endDrag();
      // The renderer almost certainly has stale drag state too (since we never
      // got pointerup). Reset it so the user can start a fresh drag.
      if (petHitWindow && !petHitWindow.isDestroyed()) {
        petHitWindow.webContents.send('pet:hit-reset');
      }
    }, DRAG_WATCHDOG_MS);
  });

  ipcMain.on('pet:drag-end', () => {
    endDrag();
  });

  ipcMain.on('pet:click', (_event, data: { side: string; count: number }) => {
    if (!stateMachine || !idleTicker) return;

    idleTicker.resetIdle();

    // Click reactions — keep `error` reserved for genuine AI errors so the user
    // can distinguish "I poked the pet a lot" from "the agent just failed".
    // 1 click  → attention (small surprise)
    // 2 clicks → poke left/right (directional wobble)
    // 4+       → juggling (overwhelmed / flustered)
    // 3        → still poke — nothing interesting happens but we avoid the old
    //            error misfire; the next click bumps into the 4+ bucket.
    if (data.count >= 4) {
      stateMachine.requestState('juggling');
    } else if (data.count >= 2) {
      stateMachine.requestState(data.side === 'left' ? 'poke-left' : 'poke-right');
    } else if (data.count === 1) {
      stateMachine.requestState('attention');
    }
  });

  ipcMain.on('pet:context-menu', () => {
    if (!petHitWindow || petHitWindow.isDestroyed()) return;

    const sizeKeys = { 200: 'pet.sizeSmall', 280: 'pet.sizeMedium', 360: 'pet.sizeLarge' } as const;
    const menu = Menu.buildFromTemplate([
      {
        label: i18n.t('pet.pat'),
        click: () => {
          if (stateMachine && idleTicker) {
            idleTicker.resetIdle();
            stateMachine.requestState('happy');
          }
        },
      },
      { type: 'separator' },
      {
        label: i18n.t('pet.size'),
        submenu: ([200, 280, 360] as PetSize[]).map((size) => ({
          label: i18n.t(sizeKeys[size], { px: size }),
          type: 'radio' as const,
          checked: currentSize === size,
          click: () => {
            void commitPetSize(size).catch(() => {
              // commitPetSize already logged the failure and restored the previous size.
            });
          },
        })),
      },
      { type: 'separator' },
      {
        label: i18n.t('pet.dnd'),
        type: 'checkbox',
        checked: stateMachine?.getDnd() ?? currentDnd,
        click: (menuItem) => {
          void commitPetDnd(menuItem.checked).catch(() => {
            // commitPetDnd already logged the failure and restored the previous mode.
          });
        },
      },
      { type: 'separator' },
      {
        label: i18n.t('pet.resetPosition'),
        click: () => resetPosition(),
      },
      {
        label: i18n.t('pet.hide'),
        click: () => hidePetWindow(),
      },
    ]);

    menu.popup({ window: petHitWindow });
  });

  ipcMain.on('pet:set-ignore-mouse-events', (_event, ignore: boolean, options?: { forward: boolean }) => {
    if (!petHitWindow || petHitWindow.isDestroyed()) return;
    petHitWindow.setIgnoreMouseEvents(ignore, options);
    lastHitIgnoreState = ignore;
  });
}

function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('pet:drag-start');
  ipcMain.removeAllListeners('pet:drag-end');
  ipcMain.removeAllListeners('pet:click');
  ipcMain.removeAllListeners('pet:context-menu');
  ipcMain.removeAllListeners('pet:set-ignore-mouse-events');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resize a transparent BrowserWindow on Windows reliably.
 *
 * Background: on Windows, calling setSize() / setBounds() on a window created
 * with `transparent: true` and `frame: false` updates the window-handle bounds
 * but does not always reflow the rendered content area. The user sees the pet
 * staying its original size while the hit-region (and the WM's idea of the
 * window) shrinks/grows underneath. This is the root cause of the
 * "win11 改大小后实际显示不变" report — see electron/electron#20729.
 *
 * Workaround: hide → setBounds → show. Hiding releases the DWM composition
 * cache for the window so the next show() rebuilds it at the new size. This is
 * a one-frame flicker but it's the only reliable cross-Electron-version fix.
 *
 * macOS / Linux don't suffer this bug, so we keep the cheap setBounds-only
 * path there to avoid the show/hide flicker.
 */
function applyTransparentResize(win: BrowserWindow, bounds: Electron.Rectangle): void {
  if (process.platform !== 'win32') {
    win.setBounds(bounds, false);
    return;
  }
  const wasVisible = win.isVisible();
  if (wasVisible) win.hide();
  win.setBounds(bounds, false);
  if (wasVisible) {
    // showInactive() avoids stealing focus from the user's current app, which
    // matters because the pet window has focusable: false but show() can still
    // reorder z-stack on Windows.
    win.showInactive();
  }
}

function clearDragTimer(): void {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  if (dragWatchdog) {
    clearTimeout(dragWatchdog);
    dragWatchdog = null;
  }
}

/**
 * End the current drag: stop the follow timer + watchdog, restore the
 * pre-drag AI state (or idle), reset idle tracking, and update the confirm
 * window anchor. Single source of truth — invoked by the pet:drag-end IPC,
 * the watchdog timeout, and resizePet's mid-drag guard.
 *
 * IMPORTANT: callers must guarantee a drag is actually in progress (or that
 * the windows are about to be destroyed). This unconditionally forces the
 * state machine to `restoreTo`, which will clobber any AI-driven state if
 * called outside a drag — every existing call site either checks dragTimer
 * first or only runs from a drag-related code path.
 */
function endDrag(): void {
  clearDragTimer();
  const restoreTo: PetState = preDragState ?? 'idle';
  preDragState = null;
  const requested = lastRequestedPosition;
  lastRequestedPosition = null;
  stateMachine?.forceState(restoreTo);
  idleTicker?.resetIdle();
  if (petWindow && !petWindow.isDestroyed()) {
    const actual = readPetPosition();
    if (actual) {
      updateAnchorBounds({ x: actual.x, y: actual.y, width: currentSize, height: currentSize });
    }
    persistPositionIfReliable(requested, actual);
  }
}

/**
 * Main-process safety watchdog for hit-window click-through.
 *
 * The renderer in petHitRenderer.ts toggles setIgnoreMouseEvents based on
 * whether the cursor is inside the pet's circular body. That works fine when
 * the renderer is healthy, but if it ever gets stuck in non-ignore mode (lost
 * mousemove, renderer hang, pointer-capture glitch), the hit window — which
 * is alwaysOnTop at screen-saver level — will swallow every click on the
 * screen until the user force-quits the app. This has happened in practice.
 *
 * This watchdog runs in the main process, reads the real cursor position via
 * `screen.getCursorScreenPoint()` (no renderer involvement), and forces the
 * hit window back to ignore=true whenever the cursor is clearly outside the
 * pet's circular body. It is deliberately conservative: it only *enables*
 * ignore (the safe state) and never disables it, so it cannot interfere with
 * legitimate interactions.
 */
function startHitIgnoreWatchdog(): void {
  stopHitIgnoreWatchdog();
  hitIgnoreWatchdog = setInterval(() => {
    if (!petHitWindow || petHitWindow.isDestroyed()) return;
    // Skip while a drag is in progress — the drag timer owns window position
    // and the window must stay interactive to keep receiving the drag.
    if (dragTimer) return;
    // Already in the safe state — nothing to recover.
    if (lastHitIgnoreState) return;

    // The hit window is currently in non-ignore mode. If the real cursor is
    // no longer inside the pet's circular body (plus slack), force it back
    // to ignore.
    const cursor = screen.getCursorScreenPoint();
    let wx: number;
    let wy: number;
    let ww: number;
    let wh: number;
    try {
      [wx, wy] = petHitWindow.getPosition();
      [ww, wh] = petHitWindow.getSize();
    } catch (error) {
      console.warn('[Pet] hit watchdog skipped; position read failed:', error);
      return;
    }
    const cxw = wx + ww / 2;
    const cyw = wy + wh / 2;
    const radius = (Math.min(ww, wh) / 2) * HIT_WATCHDOG_RADIUS_SLACK;
    const dx = cursor.x - cxw;
    const dy = cursor.y - cyw;

    if (dx * dx + dy * dy > radius * radius) {
      petHitWindow.setIgnoreMouseEvents(true, { forward: true });
      lastHitIgnoreState = true;
    }
  }, HIT_WATCHDOG_INTERVAL_MS);
}

function stopHitIgnoreWatchdog(): void {
  if (hitIgnoreWatchdog) {
    clearInterval(hitIgnoreWatchdog);
    hitIgnoreWatchdog = null;
  }
  lastHitIgnoreState = true;
}

function resizePet(size: PetSize): void {
  currentSize = size;
  if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) return;

  // If the user resizes mid-drag, the in-flight drag timer would keep moving the
  // pet using the *new* hitOffset against the *old* drag origin → window jumps.
  // Cancel the drag cleanly first; the renderer will be reset via pet:hit-reset
  // below so subsequent pointerdown starts fresh.
  if (dragTimer) {
    endDrag();
  }

  const read = readPetPosition();
  if (!read) {
    if (!petWindow.isDestroyed()) {
      petWindow.webContents.send('pet:resize', size);
    }
    return;
  }
  const { x, y } = read;

  applyTransparentResize(petWindow, { x, y, width: size, height: size });

  const hitSize = Math.round(size * 0.6);
  const hitOffset = Math.round(size * 0.2);
  applyTransparentResize(petHitWindow, {
    x: x + hitOffset,
    y: y + hitOffset,
    width: hitSize,
    height: hitSize,
  });

  idleTicker?.setPetBounds(x, y, size, size);

  // Update confirm window anchor
  updateAnchorBounds({ x, y, width: size, height: size });

  if (!petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:resize', size);
  }

  // Notify hit window to reset transient drag state and re-evaluate the (now
  // smaller/larger) hit circle. Without this, Windows users hit a stale-geometry
  // bug where after shrinking the pet they could only start a drag near the
  // *old* center, and a pointer capture lost during resize would leave the hit
  // window stuck in `dragging` cursor mode.
  if (!petHitWindow.isDestroyed()) {
    petHitWindow.webContents.send('pet:hit-reset');
  }
}

function resetPosition(): void {
  if (!petWindow || petWindow.isDestroyed() || !petHitWindow || petHitWindow.isDestroyed()) return;

  // Reset puts the pet back where createPetWindow would have put it for a
  // fresh launch — the bottom-right of the display that currently hosts the
  // main AionUi window.
  const target = computeInitialPosition(currentSize);
  const moved = safeSetPosition(petWindow, target.x, target.y);

  const hitOffset = Math.round(currentSize * 0.2);
  safeSetPosition(petHitWindow, target.x + hitOffset, target.y + hitOffset);

  idleTicker?.setPetBounds(target.x, target.y, currentSize, currentSize);

  // Update confirm window anchor
  updateAnchorBounds({ x: target.x, y: target.y, width: currentSize, height: currentSize });
  if (moved) {
    persistPositionIfReliable(target, readPetPosition());
  }
}

function readPetPosition(): PetPoint | null {
  if (!petWindow || petWindow.isDestroyed()) return null;
  try {
    const [x, y] = petWindow.getPosition();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch (error) {
    console.warn('[Pet] getPosition failed:', error);
    return null;
  }
}

function safeSetPosition(win: BrowserWindow, x: number, y: number): boolean {
  try {
    win.setPosition(Math.round(x), Math.round(y), false);
    return true;
  } catch (error) {
    console.warn('[Pet] setPosition failed:', error);
    return false;
  }
}

function persistPositionIfReliable(requested: PetPoint | null, actual: PetPoint | null): void {
  if (!actual || !shouldPersistPetPosition(requested, actual)) return;
  const point = { x: actual.x, y: actual.y };
  const previous = savedPosition;
  savedPosition = point;
  void ProcessConfig.set('pet.position', point).catch((error) => {
    savedPosition = previous;
    console.error('[Pet] Failed to persist pet position:', error);
  });
}
