/**
 * Helpers for the desktop pet overlay specs.
 *
 * Agent events go through `__AIONUI_E2E_PET__.emitAgentEvent`, which calls
 * `bridge.emit` in the main process — the same adapter path that notifies the
 * pet. Specs must not call the state machine directly.
 */
import { execFileSync } from 'node:child_process';
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { invokeBridge, navigateTo } from '../helpers';

export type PetBounds = { x: number; y: number; width: number; height: number };

export type PetWindowSnap = {
  role: 'draw' | 'hit' | 'confirm';
  url: string;
  visible: boolean;
  alwaysOnTop: boolean;
  focusable: boolean;
  frame: boolean | null;
  transparent: boolean | null;
  backgroundColor: string;
  ignoreMouseEvents: boolean;
  bounds: PetBounds;
};

export type PetSnapshot = {
  state: string | null;
  renderedState: string | null;
  dnd: boolean;
  size: number;
  confirmBubbleEnabled: boolean;
  ozonePlatform: string;
  cursor: { x: number; y: number };
  primaryWorkArea: PetBounds;
  displayCount: number;
  saved: { enabled: boolean; size: number; dnd: boolean };
  windows: PetWindowSnap[];
};

type PetE2EApi = {
  snapshot: () => Promise<PetSnapshot>;
  emitAgentEvent: (name: string, data: unknown) => void;
  invokeContextItem: (which: string) => void;
  invokeTrayItem: (which: string) => Promise<void>;
  dragStart: () => Promise<void>;
  dragEnd: () => Promise<void>;
  clickBody: (data: { side: string; count: number }) => Promise<void>;
  forceHitIgnore: (ignore: boolean) => boolean;
  reset: () => Promise<void>;
};

declare global {
  var __AIONUI_E2E_PET__: PetE2EApi | undefined;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function petSnapshot(electronApp: ElectronApplication): Promise<PetSnapshot> {
  return electronApp.evaluate(async () => {
    const api = globalThis.__AIONUI_E2E_PET__;
    if (!api) throw new Error('Pet E2E API is not installed');
    return api.snapshot();
  });
}

export async function resetPet(page: Page, electronApp: ElectronApplication): Promise<void> {
  await invokeBridge<void>(page, 'system-settings:set-pet-enabled', { enabled: false });
  await electronApp.evaluate(async () => {
    const api = globalThis.__AIONUI_E2E_PET__;
    if (!api) throw new Error('Pet E2E API is not installed');
    await api.reset();
  });
}

export function petWindow(snap: PetSnapshot, role: PetWindowSnap['role']): PetWindowSnap {
  const found = snap.windows.find((win) => win.role === role);
  if (!found) {
    throw new Error(`No ${role} pet window. Open windows: ${snap.windows.map((win) => win.role).join(', ') || 'none'}`);
  }
  return found;
}

export async function waitForPetWindows(electronApp: ElectronApplication, timeoutMs = 15_000): Promise<PetSnapshot> {
  const start = Date.now();
  let last: PetSnapshot | null = null;
  while (Date.now() - start < timeoutMs) {
    last = await petSnapshot(electronApp);
    const draw = last.windows.find((win) => win.role === 'draw');
    const hit = last.windows.find((win) => win.role === 'hit');
    if (draw?.visible && hit?.visible && last.renderedState) return last;
    await sleep(100);
  }
  throw new Error(`Pet windows did not appear: ${JSON.stringify(last)}`);
}

export async function enablePet(page: Page, electronApp: ElectronApplication): Promise<PetSnapshot> {
  await invokeBridge<void>(page, 'system-settings:set-pet-enabled', { enabled: true });
  return waitForPetWindows(electronApp);
}

export async function emitAgentEvent(electronApp: ElectronApplication, name: string, data: unknown): Promise<void> {
  await electronApp.evaluate(
    (_electron, payload) => {
      const api = globalThis.__AIONUI_E2E_PET__;
      if (!api) throw new Error('Pet E2E API is not installed');
      api.emitAgentEvent(payload.name, payload.data);
    },
    { name, data }
  );
}

export function streamMessage(type: string): {
  type: string;
  conversation_id: string;
  msg_id: string;
  data: Record<string, never>;
} {
  return {
    type,
    conversation_id: 'e2e-pet',
    msg_id: `e2e-${type}`,
    data: {},
  };
}

export async function readPetAppearance(
  electronApp: ElectronApplication
): Promise<{ state: string | null; rendered: string | null }> {
  const snap = await petSnapshot(electronApp);
  return { state: snap.state, rendered: snap.renderedState };
}

export async function invokeContextItem(electronApp: ElectronApplication, which: string): Promise<void> {
  await electronApp.evaluate((_electron, action) => {
    const api = globalThis.__AIONUI_E2E_PET__;
    if (!api) throw new Error('Pet E2E API is not installed');
    api.invokeContextItem(action);
  }, which);
}

export async function invokeTrayItem(electronApp: ElectronApplication, which: string): Promise<void> {
  await electronApp.evaluate(async (_electron, action) => {
    const api = globalThis.__AIONUI_E2E_PET__;
    if (!api) throw new Error('Pet E2E API is not installed');
    await api.invokeTrayItem(action);
  }, which);
}

export async function clickPet(electronApp: ElectronApplication, count: number, side = 'left'): Promise<void> {
  await electronApp.evaluate(
    async (_electron, click) => {
      const api = globalThis.__AIONUI_E2E_PET__;
      if (!api) throw new Error('Pet E2E API is not installed');
      await api.clickBody(click);
    },
    { side, count }
  );
}

export async function forceHitIgnore(electronApp: ElectronApplication, ignore: boolean): Promise<boolean> {
  return electronApp.evaluate((_electron, next) => {
    const api = globalThis.__AIONUI_E2E_PET__;
    if (!api) throw new Error('Pet E2E API is not installed');
    return api.forceHitIgnore(next);
  }, ignore);
}

export async function dragStart(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(async () => {
    const api = globalThis.__AIONUI_E2E_PET__;
    if (!api) throw new Error('Pet E2E API is not installed');
    await api.dragStart();
  });
}

export async function dragEnd(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(async () => {
    const api = globalThis.__AIONUI_E2E_PET__;
    if (!api) throw new Error('Pet E2E API is not installed');
    await api.dragEnd();
  });
}

export function moveCursor(x: number, y: number): void {
  execFileSync('xdotool', ['mousemove', '--sync', String(Math.round(x)), String(Math.round(y))], {
    stdio: 'pipe',
  });
}

export async function dragPetBy(
  electronApp: ElectronApplication,
  dx: number,
  dy: number
): Promise<{ beforeDraw: PetBounds; afterDraw: PetBounds; beforeHit: PetBounds; afterHit: PetBounds }> {
  const before = await petSnapshot(electronApp);
  const draw = petWindow(before, 'draw');
  const hit = petWindow(before, 'hit');
  const anchorX = draw.bounds.x + 40;
  const anchorY = draw.bounds.y + 40;
  moveCursor(anchorX, anchorY);
  await sleep(80);

  const seen = (await petSnapshot(electronApp)).cursor;
  if (Math.abs(seen.x - anchorX) > 40 || Math.abs(seen.y - anchorY) > 40) {
    throw new Error(
      `Electron cursor (${seen.x}, ${seen.y}) did not follow xdotool (${anchorX}, ${anchorY}). Drag cannot be driven.`
    );
  }

  await dragStart(electronApp);
  await sleep(40);
  const during = (await petSnapshot(electronApp)).cursor;
  moveCursor(during.x + dx, during.y + dy);

  const start = Date.now();
  let settled = before;
  while (Date.now() - start < 2_000) {
    settled = await petSnapshot(electronApp);
    const moved = petWindow(settled, 'draw');
    if (
      Math.abs(moved.bounds.x - (draw.bounds.x + dx)) <= 12 &&
      Math.abs(moved.bounds.y - (draw.bounds.y + dy)) <= 12
    ) {
      break;
    }
    await sleep(40);
  }

  await dragEnd(electronApp);
  await sleep(80);
  settled = await petSnapshot(electronApp);
  return {
    beforeDraw: draw.bounds,
    afterDraw: petWindow(settled, 'draw').bounds,
    beforeHit: hit.bounds,
    afterHit: petWindow(settled, 'hit').bounds,
  };
}

export async function waitForDrawWindow(electronApp: ElectronApplication, timeoutMs = 20_000): Promise<PetSnapshot> {
  const start = Date.now();
  let lastError = 'pet api missing';
  while (Date.now() - start < timeoutMs) {
    try {
      const snap = await petSnapshot(electronApp);
      if (snap.windows.some((win) => win.role === 'draw' && win.visible)) return snap;
      lastError = `open roles: ${snap.windows.map((win) => win.role).join(', ') || 'none'}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(200);
  }
  throw new Error(`Pet draw window did not come back: ${lastError}`);
}

export async function openPetSettings(page: Page): Promise<void> {
  try {
    await page.locator('.sider-footer').first().waitFor({ state: 'visible', timeout: 45_000 });
    await navigateTo(page, '#/guid');
    await navigateTo(page, '#/settings/pet');
    await page.getByText('Enable Desktop Pet', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  } catch (error) {
    const diag = await page
      .evaluate(() => ({
        hash: window.location.hash,
        text: (document.body?.innerText || '').slice(0, 400),
      }))
      .catch((diagError: unknown) => String(diagError));
    throw new Error(`Could not open pet settings. Page: ${JSON.stringify(diag)}`, { cause: error });
  }
  await expect(page.locator('.arco-switch-loading')).toHaveCount(0);
}

export function petSwitch(page: Page, index: number) {
  return page.locator('.arco-switch').nth(index);
}
