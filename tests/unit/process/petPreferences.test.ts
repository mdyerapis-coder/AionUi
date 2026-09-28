/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetDisplay } from '@process/pet/petPlacement';

type MenuItem = {
  label?: string;
  checked?: boolean;
  click?: (item?: { checked: boolean }) => void | Promise<void>;
  submenu?: MenuItem[];
};

type FakeWindow = {
  kind: 'pet' | 'hit';
  x: number;
  y: number;
  width: number;
  height: number;
  destroyed: boolean;
  webContents: { send: ReturnType<typeof vi.fn>; isDestroyed: () => boolean };
  setPosition: (x: number, y: number) => void;
  getPosition: () => [number, number];
  getSize: () => [number, number];
  setBounds: (bounds: { x: number; y: number; width: number; height: number }) => void;
  isDestroyed: () => boolean;
  isVisible: () => boolean;
  destroy: () => void;
};

const testEnv = vi.hoisted(() => {
  const env = {
    store: new Map<string, unknown>(),
    failKeys: new Set<string>(),
    ipcHandlers: new Map<string, (...args: unknown[]) => void>(),
    contextMenu: [] as MenuItem[],
    trayMenu: [] as MenuItem[],
    windows: [] as FakeWindow[],
    cursor: { x: 0, y: 0 },
    displays: [] as PetDisplay[],
    positionNoop: false,
    positionIgnored: false,
    landOffset: null as { x: number; y: number } | null,
    positionThrows: false,
    configSet: vi.fn(async (_key: string, _value: unknown) => undefined),
  };
  env.configSet.mockImplementation(async (key: string, value: unknown) => {
    if (env.failKeys.has(key)) throw new Error(`fail ${key}`);
    env.store.set(key, value);
  });
  return env;
});

const primaryDisplay: PetDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
};

vi.mock('electron', () => {
  class FakeBrowserWindow {
    kind: 'pet' | 'hit';
    x: number;
    y: number;
    width: number;
    height: number;
    destroyed = false;
    webContents = {
      send: vi.fn(),
      isDestroyed: () => this.destroyed,
    };

    constructor(options: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      webPreferences?: { preload?: string };
    }) {
      this.kind = options.webPreferences?.preload?.includes('petHit') ? 'hit' : 'pet';
      this.x = options.x ?? 0;
      this.y = options.y ?? 0;
      this.width = options.width ?? 0;
      this.height = options.height ?? 0;
      testEnv.windows.push(this as unknown as FakeWindow);
    }

    setPosition(x: number, y: number): void {
      if (testEnv.positionThrows) throw new Error('setPosition failed');
      if (testEnv.positionNoop || testEnv.positionIgnored) return;
      this.x = x + (testEnv.landOffset?.x ?? 0);
      this.y = y + (testEnv.landOffset?.y ?? 0);
    }

    getPosition(): [number, number] {
      if (testEnv.positionThrows) throw new Error('getPosition failed');
      if (testEnv.positionNoop) return [0, 0];
      return [this.x, this.y];
    }

    getBounds(): { x: number; y: number; width: number; height: number } {
      const [x, y] = this.getPosition();
      return { x, y, width: this.width, height: this.height };
    }

    getSize(): [number, number] {
      return [this.width, this.height];
    }

    setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
      this.x = bounds.x;
      this.y = bounds.y;
      this.width = bounds.width;
      this.height = bounds.height;
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    isVisible(): boolean {
      return true;
    }

    hide(): void {}
    show(): void {}
    showInactive(): void {}
    focus(): void {}
    setAlwaysOnTop(): void {}
    setIgnoreMouseEvents(): void {}
    loadURL(): Promise<void> {
      return Promise.resolve();
    }
    loadFile(): Promise<void> {
      return Promise.resolve();
    }
    on(): void {}
    destroy(): void {
      this.destroyed = true;
    }

    static getAllWindows(): Array<{
      isDestroyed: () => boolean;
      getPosition: () => [number, number];
      getSize: () => [number, number];
    }> {
      return [
        {
          isDestroyed: () => false,
          getPosition: () => [0, 0],
          getSize: () => [800, 600],
        },
      ];
    }
  }

  return {
    app: {
      isPackaged: true,
      commandLine: { getSwitchValue: () => '' },
    },
    BrowserWindow: FakeBrowserWindow,
    ipcMain: {
      on: (channel: string, handler: (...args: unknown[]) => void) => {
        testEnv.ipcHandlers.set(channel, handler);
      },
      removeAllListeners: (channel: string) => {
        testEnv.ipcHandlers.delete(channel);
      },
      handle: vi.fn(),
    },
    Menu: {
      buildFromTemplate: (template: MenuItem[]) => {
        testEnv.contextMenu = template;
        return { popup: () => undefined };
      },
    },
    screen: {
      getAllDisplays: () => testEnv.displays,
      getPrimaryDisplay: () => testEnv.displays[0],
      getDisplayNearestPoint: () => testEnv.displays[0],
      getCursorScreenPoint: () => testEnv.cursor,
    },
  };
});

vi.mock('@/common/electronSafe', () => ({
  electronApp: { isPackaged: false, dock: null },
  electronMenu: {
    buildFromTemplate: (template: MenuItem[]) => {
      testEnv.trayMenu = template;
      return { popup: () => undefined };
    },
  },
  electronNativeImage: {
    createFromPath: () => ({ resize: () => ({}) }),
  },
  electronTray: class {
    setToolTip(): void {}
    setContextMenu(): void {}
    on(): void {}
    destroy(): void {}
  },
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: {
    get: async (key: string) => testEnv.store.get(key),
    set: (key: string, value: unknown) => testEnv.configSet(key, value),
  },
}));

vi.mock('@process/services/i18n', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('@/common/adapter/main', () => ({
  setPetNotifyHook: vi.fn(),
}));

vi.mock('@process/pet/petConfirmManager', () => ({
  initPetConfirmManager: vi.fn(),
  updateAnchorBounds: vi.fn(),
  destroyPetConfirmManager: vi.fn(),
  unhookPetConfirm: vi.fn(),
}));

vi.mock('@process/pet/petIdleTicker', () => ({
  PetIdleTicker: class {
    start(): void {}
    stop(): void {}
    resetIdle(): void {}
    setPetBounds(): void {}
    onEyeMove(): void {}
  },
}));

vi.mock('@process/pet/petEventBridge', () => ({
  PetEventBridge: class {
    handleBridgeMessage(): void {}
    dispose(): void {}
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: { invoke: async () => ({ items: [] }) },
    },
    conversation: {
      activeCount: { invoke: async () => ({ count: 0 }) },
    },
    systemSettings: {
      petPreferencesChanged: { emit: vi.fn() },
    },
  },
}));

type PetModule = typeof import('@process/pet/petManager');
type SettingsModule = typeof import('@/common/adapter/ipcBridge');

let pet: PetModule;
let preferenceChanges: Array<{ size?: number; dnd?: boolean }>;
let unsubscribePreferences: (() => void) | null = null;

const fallbackFor = (size: number): { x: number; y: number } => ({
  x: primaryDisplay.workArea.x + primaryDisplay.workArea.width - size - 20,
  y: primaryDisplay.workArea.y + primaryDisplay.workArea.height - size - 20,
});

const findItem = (items: MenuItem[] | undefined, label: string): MenuItem | undefined => {
  if (!items) return undefined;
  for (const item of items) {
    if (item.label === label) return item;
    const nested = findItem(item.submenu, label);
    if (nested) return nested;
  }
  return undefined;
};

const latestPet = (): FakeWindow => {
  const win = [...testEnv.windows].reverse().find((item) => item.kind === 'pet' && !item.destroyed);
  if (!win) throw new Error('pet window was not created');
  return win;
};

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
};

const openContextMenu = (): void => {
  const handler = testEnv.ipcHandlers.get('pet:context-menu');
  if (!handler) throw new Error('context menu handler was not registered');
  handler();
};

describe('pet preference persistence', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
    vi.resetModules();
    testEnv.store.clear();
    testEnv.failKeys.clear();
    testEnv.ipcHandlers.clear();
    testEnv.contextMenu = [];
    testEnv.trayMenu = [];
    testEnv.windows.length = 0;
    testEnv.cursor.x = 0;
    testEnv.cursor.y = 0;
    testEnv.displays.splice(0, testEnv.displays.length, primaryDisplay);
    testEnv.positionNoop = false;
    testEnv.positionIgnored = false;
    testEnv.landOffset = null;
    testEnv.positionThrows = false;
    testEnv.configSet.mockClear();

    // Main-process emits only reach renderer listeners after the bridge adapter
    // loops them back. Install that loop so the test sees petPreferencesChanged.
    const platform = await import('@/common/platform/bridge');
    let loopback: { emit: (name: string, data?: unknown) => unknown } | null = null;
    platform.adapter({
      emit(name, data) {
        loopback?.emit(name, data);
      },
      on(emitter) {
        loopback = emitter;
      },
    });
    const bridge: SettingsModule = await import('@/common/adapter/ipcBridge');
    preferenceChanges = [];
    unsubscribePreferences = bridge.systemSettings.petPreferencesChanged.on((change) => {
      preferenceChanges.push(change);
    });
    pet = await import('@process/pet/petManager');
  });

  afterEach(() => {
    pet?.destroyPetWindow();
    unsubscribePreferences?.();
    unsubscribePreferences = null;
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('applies saved size, do-not-disturb, and position when the pet opens', async () => {
    testEnv.store.set('pet.size', 360);
    testEnv.store.set('pet.dnd', true);
    testEnv.store.set('pet.position', { x: 40, y: 50 });

    await pet.openPetFromSavedPreferences();

    const win = latestPet();
    expect(win.width).toBe(360);
    expect(win.height).toBe(360);
    expect({ x: win.x, y: win.y }).toEqual({ x: 40, y: 50 });

    openContextMenu();
    expect(findItem(testEnv.contextMenu, 'pet.dnd')?.checked).toBe(true);
    expect(findItem(testEnv.contextMenu, 'pet.sizeLarge')?.checked).toBe(true);
  });

  it('restores saved preferences after the pet is disabled and enabled again', async () => {
    testEnv.store.set('pet.size', 200);
    testEnv.store.set('pet.dnd', true);
    testEnv.store.set('pet.position', { x: 80, y: 90 });
    await pet.openPetFromSavedPreferences();
    pet.destroyPetWindow();

    testEnv.store.set('pet.size', 360);
    testEnv.store.set('pet.dnd', false);
    testEnv.store.set('pet.position', { x: 120, y: 30 });
    await pet.openPetFromSavedPreferences();

    const win = latestPet();
    expect(win.width).toBe(360);
    expect({ x: win.x, y: win.y }).toEqual({ x: 120, y: 30 });
    openContextMenu();
    expect(findItem(testEnv.contextMenu, 'pet.dnd')?.checked).toBe(false);
  });

  it('ignores an invalid saved size and uses the default', async () => {
    testEnv.store.set('pet.size', 128);
    await pet.openPetFromSavedPreferences();

    expect(latestPet().width).toBe(280);
  });

  it('falls back to the default corner when the saved position is off every display', async () => {
    testEnv.store.set('pet.position', { x: 9000, y: 9000 });
    await pet.openPetFromSavedPreferences();

    expect({ x: latestPet().x, y: latestPet().y }).toEqual(fallbackFor(280));
    expect(testEnv.store.get('pet.position')).toEqual({ x: 9000, y: 9000 });
  });

  it('clamps a saved position that would hang off the display', async () => {
    testEnv.store.set('pet.size', 280);
    testEnv.store.set('pet.position', { x: 1800, y: 1000 });
    await pet.openPetFromSavedPreferences();

    expect({ x: latestPet().x, y: latestPet().y }).toEqual({ x: 1640, y: 800 });
  });

  it('persists a size chosen from the pet context menu and notifies the renderer', async () => {
    await pet.openPetFromSavedPreferences();
    openContextMenu();

    await findItem(testEnv.contextMenu, 'pet.sizeSmall')?.click?.();
    await flush();

    expect(testEnv.store.get('pet.size')).toBe(200);
    expect(latestPet().width).toBe(200);
    expect(preferenceChanges).toContainEqual({ size: 200 });
  });

  it('persists do-not-disturb chosen from the pet context menu', async () => {
    await pet.openPetFromSavedPreferences();
    openContextMenu();
    const dnd = findItem(testEnv.contextMenu, 'pet.dnd');

    await dnd?.click?.({ checked: true });
    await flush();

    expect(testEnv.store.get('pet.dnd')).toBe(true);
    expect(preferenceChanges).toContainEqual({ dnd: true });
  });

  it('reverts the pet size when saving it fails', async () => {
    await pet.openPetFromSavedPreferences();
    testEnv.failKeys.add('pet.size');
    openContextMenu();

    await findItem(testEnv.contextMenu, 'pet.sizeLarge')?.click?.();
    await flush();

    expect(latestPet().width).toBe(280);
    expect(testEnv.store.has('pet.size')).toBe(false);
    expect(preferenceChanges).toEqual([]);
  });

  it('persists a size chosen from the tray menu', async () => {
    const { createOrUpdateTray } = await import('@process/utils/tray');
    createOrUpdateTray();
    await flush();

    const large = findItem(testEnv.trayMenu, 'pet.sizeLarge');
    await large?.click?.();
    await flush();

    expect(testEnv.store.get('pet.size')).toBe(360);
    expect(preferenceChanges).toContainEqual({ size: 360 });
  });

  it('saves the position when a drag finishes', async () => {
    await pet.openPetFromSavedPreferences();
    const win = latestPet();
    const startX = win.x;
    const startY = win.y;
    testEnv.cursor = { x: startX + 10, y: startY + 12 };
    testEnv.ipcHandlers.get('pet:drag-start')?.();
    testEnv.cursor = { x: startX + 10 + 45, y: startY + 12 + 30 };
    await vi.advanceTimersByTimeAsync(20);
    testEnv.ipcHandlers.get('pet:drag-end')?.();
    await flush();

    expect(testEnv.store.get('pet.position')).toEqual({ x: startX + 45, y: startY + 30 });
  });

  it('saves the default corner when the user resets the position', async () => {
    testEnv.store.set('pet.position', { x: 40, y: 50 });
    await pet.openPetFromSavedPreferences();
    openContextMenu();

    await findItem(testEnv.contextMenu, 'pet.resetPosition')?.click?.();
    await flush();

    expect(testEnv.store.get('pet.position')).toEqual(fallbackFor(280));
    expect({ x: latestPet().x, y: latestPet().y }).toEqual(fallbackFor(280));
  });

  it('does not save a position when setPosition is a no-op', async () => {
    testEnv.store.set('pet.position', { x: 40, y: 50 });
    await pet.openPetFromSavedPreferences();
    testEnv.positionNoop = true;
    const win = latestPet();
    testEnv.cursor = { x: win.x + 10, y: win.y + 10 };
    testEnv.ipcHandlers.get('pet:drag-start')?.();
    testEnv.cursor = { x: win.x + 200, y: win.y + 200 };
    await vi.advanceTimersByTimeAsync(20);
    testEnv.ipcHandlers.get('pet:drag-end')?.();
    await flush();

    expect(testEnv.store.get('pet.position')).toEqual({ x: 40, y: 50 });
  });

  it('does not save a position when setPosition is ignored and the window stays put', async () => {
    testEnv.store.set('pet.position', { x: 40, y: 50 });
    await pet.openPetFromSavedPreferences();
    testEnv.positionIgnored = true;
    const win = latestPet();
    testEnv.cursor = { x: win.x + 10, y: win.y + 10 };
    testEnv.ipcHandlers.get('pet:drag-start')?.();
    testEnv.cursor = { x: win.x + 200, y: win.y + 200 };
    await vi.advanceTimersByTimeAsync(20);
    testEnv.ipcHandlers.get('pet:drag-end')?.();
    await flush();

    expect(testEnv.store.get('pet.position')).toEqual({ x: 40, y: 50 });
    expect({ x: win.x, y: win.y }).toEqual({ x: 40, y: 50 });
  });

  it('saves the point the window landed on when that differs from the request', async () => {
    await pet.openPetFromSavedPreferences();
    testEnv.landOffset = { x: -15, y: 22 };
    const win = latestPet();
    const startX = win.x;
    const startY = win.y;
    testEnv.cursor = { x: startX + 10, y: startY + 12 };
    testEnv.ipcHandlers.get('pet:drag-start')?.();
    testEnv.cursor = { x: startX + 10 + 45, y: startY + 12 + 30 };
    await vi.advanceTimersByTimeAsync(20);
    testEnv.ipcHandlers.get('pet:drag-end')?.();
    await flush();

    expect(testEnv.store.get('pet.position')).toEqual({ x: startX + 45 - 15, y: startY + 30 + 22 });
  });

  it('does not throw when position calls fail during a drag or reset', async () => {
    await pet.openPetFromSavedPreferences();
    testEnv.positionThrows = true;

    expect(() => testEnv.ipcHandlers.get('pet:drag-start')?.()).not.toThrow();
    expect(() => testEnv.ipcHandlers.get('pet:drag-end')?.()).not.toThrow();
    openContextMenu();
    expect(() => findItem(testEnv.contextMenu, 'pet.resetPosition')?.click?.()).not.toThrow();
    await flush();

    expect(testEnv.store.has('pet.position')).toBe(false);
  });
});
