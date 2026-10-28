/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PetDisplay } from '@process/pet/petPlacement';

type MenuItem = {
  label?: string;
  click?: () => void | Promise<void>;
  submenu?: MenuItem[];
};

type FakeWindow = {
  kind: 'pet' | 'hit';
  visible: boolean;
  destroyed: boolean;
};

const testEnv = vi.hoisted(() => {
  const env = {
    store: new Map<string, unknown>(),
    ipcHandlers: new Map<string, (...args: unknown[]) => void>(),
    contextMenu: [] as MenuItem[],
    trayMenu: [] as MenuItem[],
    windows: [] as FakeWindow[],
    displays: [] as PetDisplay[],
    configSet: vi.fn(async (key: string, value: unknown) => {
      env.store.set(key, value);
    }),
  };
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
    visible = true;
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
      testEnv.windows.push(this);
    }

    setPosition(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }

    getPosition(): [number, number] {
      return [this.x, this.y];
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
      return this.visible && !this.destroyed;
    }

    hide(): void {
      this.visible = false;
    }

    show(): void {
      this.visible = true;
    }

    showInactive(): void {
      this.visible = true;
    }

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
      this.visible = false;
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
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
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
  },
}));

type PetModule = typeof import('@process/pet/petManager');
type TrayModule = typeof import('@process/utils/tray');

let pet: PetModule;
let tray: TrayModule;

const petToggle = (): MenuItem | undefined => {
  const root = testEnv.trayMenu.find((item) => item.label === '🐾 pet.desktopPet');
  return root?.submenu?.[0];
};

const waitForToggleLabel = async (label: string): Promise<void> => {
  await vi.waitFor(() => {
    expect(petToggle()?.label).toBe(label);
  });
};

const clickToggle = async (): Promise<void> => {
  const item = petToggle();
  if (!item?.click) throw new Error('tray pet toggle is missing');
  await item.click();
};

const openContextMenu = (): void => {
  const handler = testEnv.ipcHandlers.get('pet:context-menu');
  if (!handler) throw new Error('context menu handler was not registered');
  handler();
};

const findItem = (items: MenuItem[] | undefined, label: string): MenuItem | undefined => {
  if (!items) return undefined;
  for (const item of items) {
    if (item.label === label) return item;
    const nested = findItem(item.submenu, label);
    if (nested) return nested;
  }
  return undefined;
};

describe('tray pet show/hide', () => {
  beforeEach(async () => {
    vi.resetModules();
    testEnv.store.clear();
    testEnv.configSet.mockClear();
    testEnv.ipcHandlers.clear();
    testEnv.contextMenu = [];
    testEnv.trayMenu = [];
    testEnv.windows.length = 0;
    testEnv.displays.splice(0, testEnv.displays.length, primaryDisplay);

    pet = await import('@process/pet/petManager');
    tray = await import('@process/utils/tray');
  });

  afterEach(() => {
    tray?.destroyTray();
    pet?.destroyPetWindow();
  });

  it('labels a visible pet Hide and hides it without changing pet.enabled', async () => {
    testEnv.store.set('pet.enabled', true);
    await pet.openPetFromSavedPreferences();
    tray.createOrUpdateTray();
    await waitForToggleLabel('pet.hide');

    await clickToggle();
    await waitForToggleLabel('common.show');

    expect(pet.isPetWindowVisible()).toBe(false);
    expect(testEnv.store.get('pet.enabled')).toBe(true);
    expect(testEnv.configSet).not.toHaveBeenCalled();
  });

  it('labels a hidden pet Show and shows it again', async () => {
    await pet.openPetFromSavedPreferences();
    pet.hidePetWindow();
    tray.createOrUpdateTray();
    await waitForToggleLabel('common.show');

    await clickToggle();
    await waitForToggleLabel('pet.hide');

    expect(pet.isPetWindowVisible()).toBe(true);
    expect(testEnv.configSet).not.toHaveBeenCalled();
  });

  it('does not create a pet when Show is used and no pet windows exist', async () => {
    testEnv.store.set('pet.enabled', false);
    tray.createOrUpdateTray();
    await waitForToggleLabel('common.show');

    await clickToggle();

    expect(testEnv.windows).toHaveLength(0);
    expect(testEnv.store.get('pet.enabled')).toBe(false);
    expect(pet.isPetWindowVisible()).toBe(false);
  });

  it('rebuilds the tray label when the pet context menu hides the pet', async () => {
    await pet.openPetFromSavedPreferences();
    tray.createOrUpdateTray();
    await waitForToggleLabel('pet.hide');
    openContextMenu();

    findItem(testEnv.contextMenu, 'pet.hide')?.click?.();
    await waitForToggleLabel('common.show');

    expect(pet.isPetWindowVisible()).toBe(false);
  });

  it('rebuilds the tray label when the pet is created', async () => {
    tray.createOrUpdateTray();
    await waitForToggleLabel('common.show');

    await pet.openPetFromSavedPreferences();
    await waitForToggleLabel('pet.hide');

    expect(pet.isPetWindowVisible()).toBe(true);
  });

  it('rebuilds the tray label when the pet windows are destroyed', async () => {
    await pet.openPetFromSavedPreferences();
    tray.createOrUpdateTray();
    await waitForToggleLabel('pet.hide');

    pet.destroyPetWindow();
    await waitForToggleLabel('common.show');

    expect(testEnv.configSet).not.toHaveBeenCalled();
  });
});
