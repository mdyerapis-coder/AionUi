/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { ipcBridge } from '@/common';
import {
  answerPetPermission,
  type PetPermissionBubble,
  type PetPermissionConfirmView,
} from '@/common/chat/petPermission';
import i18n from '@process/services/i18n';
import { getCachedTheme, onThemeChanged } from '@process/bridge/themeBridge';

// petConfirmManager is dynamically imported → rollup places it in out/main/chunks/,
// so __dirname is out/main/chunks/ and we need '../..' to reach out/.
const PRELOAD_DIR = path.join(__dirname, '..', '..', 'preload');
const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer', 'pet');

let confirmWindow: BrowserWindow | null = null;
let bubbles = new Map<string, PetPermissionBubble>();
let visibleId: string | null = null;
let accepting = false;
let anchorBounds: { x: number; y: number; width: number; height: number } | null = null;
let pendingViews: PetPermissionConfirmView[] = [];
let windowReady = false;
// User-overridden confirm window position (set when user drags the window).
// Persists for the current app session only; cleared on destroy.
let userPosition: { x: number; y: number } | null = null;

/**
 * Initialize pet confirm manager with anchor bounds (pet window position).
 * Safe to call multiple times — handlers are unregistered first to prevent
 * stacking listeners when the user toggles the confirm-bubble setting.
 */
export function initPetConfirmManager(bounds: { x: number; y: number; width: number; height: number }): void {
  anchorBounds = bounds;
  accepting = true;
  unregisterIpcHandlers();
  registerIpcHandlers();
}

/**
 * Update anchor bounds when pet window moves.
 * Note: confirm window position is independent of pet position — it stays where the
 * user last placed it (or the default bottom-right corner). We only track anchor for
 * potential future use, but no longer reposition the confirm window when the pet moves.
 */
export function updateAnchorBounds(bounds: { x: number; y: number; width: number; height: number }): void {
  anchorBounds = bounds;
}

/**
 * Destroy confirm manager and clean up resources.
 */
export function destroyPetConfirmManager(): void {
  accepting = false;
  unregisterIpcHandlers();
  destroyConfirmWindow();
  bubbles.clear();
  visibleId = null;
  anchorBounds = null;
  userPosition = null;
}

/**
 * Stop routing future confirmations to the bubble while leaving any open
 * confirm window alive so the user can finish responding to it. Used when the
 * "pet confirm bubble" toggle is turned off at runtime.
 */
export function unhookPetConfirm(): void {
  // Leave any bubble already on screen. Later acp_permission frames are ignored.
  accepting = false;
}

/**
 * Show a permission bubble parsed from `acp_permission` or `permission`.
 * Ignored while the pet confirm setting is off.
 */
export function showPetPermission(bubble: PetPermissionBubble): void {
  if (!accepting) return;
  bubbles.set(bubble.id, bubble);
  displayBubble(bubble);
}

/** Close bubbles that were answered elsewhere or whose turn ended. */
export function dismissPetPermissions(ids: string[]): void {
  let visibleClosed = false;
  for (const id of ids) {
    if (!bubbles.delete(id)) continue;
    if (id === visibleId) visibleClosed = true;
  }
  pendingViews = pendingViews.filter((view) => bubbles.has(view.id));
  if (!visibleClosed) return;

  const closedId = visibleId;
  const next = [...bubbles.values()].at(-1);
  if (next) {
    displayBubble(next);
    return;
  }
  visibleId = null;
  if (confirmWindow && !confirmWindow.isDestroyed() && closedId) {
    confirmWindow.webContents.send('pet:confirm-remove', { id: closedId });
  }
  destroyConfirmWindow();
}

function translateText(text: string, params?: Record<string, string>): string {
  return i18n.t(text, { ...params, defaultValue: text });
}

/** Translate title, description, and option labels before they reach the window. */
function toConfirmView(bubble: PetPermissionBubble): PetPermissionConfirmView {
  const title = translateText(bubble.title);
  const description = bubble.description ? translateText(bubble.description) : '';
  return {
    id: bubble.id,
    title,
    description: description === title ? '' : description,
    options: bubble.options.map((option) => ({
      optionId: option.optionId,
      label: translateText(option.label, option.params),
      tone: option.tone,
    })),
  };
}

function displayBubble(bubble: PetPermissionBubble): void {
  visibleId = bubble.id;
  const view = toConfirmView(bubble);
  if (!confirmWindow || confirmWindow.isDestroyed()) {
    createConfirmWindow();
  }
  if (!confirmWindow || confirmWindow.isDestroyed()) return;
  if (windowReady) {
    confirmWindow.webContents.send('pet:confirm-add', view);
    captureConfirmPage();
  } else {
    pendingViews.push(view);
  }
}

/** Write a page capture when the live check asks for one. A screen grab of this
 * transparent window is a black square under Xvfb. */
function captureConfirmPage(): void {
  const dir = process.env.AIONUI_PET_CONFIRM_CAPTURE_DIR;
  if (!dir || !confirmWindow || confirmWindow.isDestroyed()) return;
  const target = confirmWindow;
  setTimeout(() => {
    if (target.isDestroyed()) return;
    void target.webContents
      .capturePage()
      .then((image) => {
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `pet-confirm-${Date.now()}.png`);
        fs.writeFileSync(file, image.toPNG());
        console.log('[PetConfirm] captured', file);
      })
      .catch((error: unknown) => {
        console.error('[PetConfirm] capturePage failed:', error);
      });
  }, 500);
}

/**
 * Create confirm window anchored to the bottom-right corner of the pet's display,
 * or at the user's last dragged position if overridden this session.
 */
function createConfirmWindow(): void {
  if (confirmWindow && !confirmWindow.isDestroyed()) {
    confirmWindow.show();
    return;
  }

  // Window size = content area (320×280) + 12px on each axis for shadow padding
  // (#container uses 6px padding to match). Window itself can touch the screen
  // edge (margin = 0 below), so the shadow padding on the outer side overflows
  // off-screen — the card visually sits ~4px from the screen corner.
  const windowWidth = 332;
  const windowHeight = 292;

  // Position priority:
  //   1. userPosition (if user has dragged the window this session)
  //   2. Default bottom-right corner of the display where the pet currently lives
  //
  // When restoring a user-provided position, clamp within the display nearest to
  // that position so the window stays on the monitor where the user placed it.
  // Otherwise, use the display nearest to the pet's center point so the default
  // placement appears on the same screen as the pet (multi-monitor safe).
  // Falls back to the primary display when no anchor is known yet.
  const petCenter = anchorBounds
    ? {
        x: anchorBounds.x + Math.round(anchorBounds.width / 2),
        y: anchorBounds.y + Math.round(anchorBounds.height / 2),
      }
    : null;
  // margin = 0: the window itself touches the screen edge. The 6px shadow
  // padding inside the renderer keeps the visible card ~6px from the edge,
  // which matches clawd-on-desk's tight bottom-right anchoring.
  const margin = 0;

  let workArea: Electron.Rectangle;
  let rawX: number;
  let rawY: number;

  if (userPosition) {
    // Clamp to the display where the user last placed the window, not the pet's display
    rawX = userPosition.x;
    rawY = userPosition.y;
    workArea = screen.getDisplayNearestPoint({ x: rawX, y: rawY }).workArea;
  } else {
    workArea = petCenter ? screen.getDisplayNearestPoint(petCenter).workArea : screen.getPrimaryDisplay().workArea;
    rawX = workArea.x + workArea.width - windowWidth - margin;
    rawY = workArea.y + workArea.height - windowHeight - margin;
  }

  const x = Math.max(workArea.x, Math.min(rawX, workArea.x + workArea.width - windowWidth));
  const y = Math.max(workArea.y, Math.min(rawY, workArea.y + workArea.height - windowHeight));

  confirmWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    webPreferences: {
      preload: path.join(PRELOAD_DIR, 'petConfirmPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.platform === 'darwin') {
    confirmWindow.setAlwaysOnTop(true, 'screen-saver');
  } else {
    confirmWindow.setAlwaysOnTop(true, 'pop-up-menu');
  }

  windowReady = false;
  loadContent();

  const offTheme = onThemeChanged((theme) => {
    if (confirmWindow && !confirmWindow.isDestroyed()) {
      confirmWindow.webContents.send('pet:confirm-theme', theme);
    }
  });

  confirmWindow.webContents.on('did-finish-load', () => {
    windowReady = true;

    // Send current theme to confirm window
    const currentTheme = getCachedTheme();
    if (currentTheme && confirmWindow && !confirmWindow.isDestroyed()) {
      confirmWindow.webContents.send('pet:confirm-theme', currentTheme);
    }

    // Flush any confirmations queued before the page finished loading
    for (const view of pendingViews) {
      if (confirmWindow && !confirmWindow.isDestroyed()) {
        confirmWindow.webContents.send('pet:confirm-add', view);
      }
    }
    pendingViews = [];
    captureConfirmPage();
  });

  confirmWindow.on('closed', () => {
    offTheme();
    confirmWindow = null;
    windowReady = false;
  });

  console.log('[PetConfirm] Confirm window created');
}

/**
 * Destroy confirm window.
 */
function destroyConfirmWindow(): void {
  if (confirmWindow && !confirmWindow.isDestroyed()) {
    confirmWindow.destroy();
  }
  confirmWindow = null;
  windowReady = false;
  pendingViews = [];
  console.log('[PetConfirm] Confirm window destroyed');
}

/**
 * Load HTML content into confirm window.
 */
function loadContent(): void {
  if (!confirmWindow || confirmWindow.isDestroyed()) return;

  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];

  if (!app.isPackaged && rendererUrl) {
    confirmWindow.loadURL(`${rendererUrl}/pet/pet-confirm.html`).catch((error) => {
      console.error('[PetConfirm] loadURL failed:', error);
    });
  } else {
    confirmWindow.loadFile(path.join(RENDERER_DIR, 'pet-confirm.html')).catch((error) => {
      console.error('[PetConfirm] loadFile failed:', error);
    });
  }
}

/**
 * Register IPC handlers for renderer communication.
 */
function registerIpcHandlers(): void {
  // Drag support for confirm window
  let confirmDragOffsetX = 0;
  let confirmDragOffsetY = 0;
  let confirmDragTimer: ReturnType<typeof setInterval> | null = null;

  ipcMain.on('pet:confirm-drag-start', () => {
    if (!confirmWindow || confirmWindow.isDestroyed()) return;
    // Clear any stale timer from a previous drag-start that missed its drag-end
    if (confirmDragTimer) {
      clearInterval(confirmDragTimer);
      confirmDragTimer = null;
    }
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = confirmWindow.getPosition();
    confirmDragOffsetX = cursor.x - wx;
    confirmDragOffsetY = cursor.y - wy;

    confirmDragTimer = setInterval(() => {
      if (!confirmWindow || confirmWindow.isDestroyed()) {
        if (confirmDragTimer) clearInterval(confirmDragTimer);
        confirmDragTimer = null;
        return;
      }
      const cur = screen.getCursorScreenPoint();
      confirmWindow.setPosition(cur.x - confirmDragOffsetX, cur.y - confirmDragOffsetY, false);
    }, 16);
  });

  ipcMain.on('pet:confirm-drag-end', () => {
    if (confirmDragTimer) {
      clearInterval(confirmDragTimer);
      confirmDragTimer = null;
    }
    // Remember user-chosen position for the rest of this session
    if (confirmWindow && !confirmWindow.isDestroyed()) {
      const [px, py] = confirmWindow.getPosition();
      userPosition = { x: px, y: py };
    }
  });

  ipcMain.on('pet:confirm-respond', (_event, data: { id?: string; optionId?: string }) => {
    const id = typeof data?.id === 'string' ? data.id : '';
    const optionId = typeof data?.optionId === 'string' ? data.optionId : '';
    const bubble = bubbles.get(id);
    if (!bubble || !optionId) return;

    void answerPetPermission(bubble, optionId, {
      confirmRequest: (answer) =>
        ipcBridge.conversation.confirmMessage.invoke({
          confirm_key: answer.confirm_key,
          msg_id: answer.msg_id,
          conversation_id: answer.conversation_id,
          call_id: answer.call_id,
        }),
      confirmConfirmation: (answer) =>
        ipcBridge.conversation.confirmation.confirm.invoke({
          conversation_id: answer.conversation_id,
          msg_id: answer.msg_id,
          call_id: answer.call_id,
          data: answer.data,
          always_allow: answer.always_allow,
        }),
    })
      .then((sent) => {
        if (!sent) return;
        dismissPetPermissions([bubble.id]);
      })
      .catch((error: unknown) => {
        console.error('[PetConfirm] permission answer failed:', error);
        if (confirmWindow && !confirmWindow.isDestroyed()) {
          confirmWindow.webContents.send('pet:confirm-error', { id: bubble.id });
        }
      });
  });
}

/**
 * Unregister IPC handlers.
 */
function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('pet:confirm-respond');
  ipcMain.removeAllListeners('pet:confirm-drag-start');
  ipcMain.removeAllListeners('pet:confirm-drag-end');
}
