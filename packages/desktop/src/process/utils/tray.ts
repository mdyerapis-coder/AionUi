/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow, Tray as TrayInstance } from 'electron';
import {
  electronApp as app,
  electronMenu as Menu,
  electronNativeImage as nativeImage,
  electronTray as Tray,
} from '@/common/electronSafe';
import * as path from 'path';
import { ipcBridge } from '@/common';
import i18n from '@process/services/i18n';

let tray: TrayInstance | null = null;
let closeToTrayEnabled = false;
let isQuitting = false;
let mainWindowRef: BrowserWindow | null = null;
let cachedActiveCount = 0;

export const setTrayMainWindow = (win: BrowserWindow): void => {
  mainWindowRef = win;
};

export const getCloseToTrayEnabled = (): boolean => closeToTrayEnabled;

export const setCloseToTrayEnabled = (enabled: boolean): void => {
  closeToTrayEnabled = enabled;
};

export const getIsQuitting = (): boolean => isQuitting;

export const setIsQuitting = (quitting: boolean): void => {
  isQuitting = quitting;
};

/**
 * Pure decision helper: when tray icon is activated, should we show or hide?
 * Visible + not minimized → hide; otherwise show/focus.
 * Exported for unit tests.
 */
export const shouldShowFromTray = (isVisible: boolean, isMinimized: boolean): boolean => {
  return !isVisible || isMinimized;
};

const showAndFocusMainWindow = (): void => {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  if (process.platform === 'darwin' && app.dock) {
    void app.dock.show();
  }
  if (mainWindowRef.isMinimized()) {
    mainWindowRef.restore();
  }
  mainWindowRef.show();
  mainWindowRef.focus();
};

const hideMainWindowToTray = (): void => {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  mainWindowRef.hide();
  if (process.platform === 'darwin' && app.dock) {
    void app.dock.hide();
  }
};

/**
 * Toggle main window visibility from the tray icon (show if hidden/minimized, hide if visible).
 */
export const toggleMainWindowFromTray = (): void => {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  if (shouldShowFromTray(mainWindowRef.isVisible(), mainWindowRef.isMinimized())) {
    showAndFocusMainWindow();
  } else {
    hideMainWindowToTray();
  }
};

/**
 * Get tray icon.
 * macOS uses Template image to adapt to dark/light menu bar.
 */
const getTrayIcon = (): Electron.NativeImage => {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(process.cwd(), 'resources');
  const icon = nativeImage.createFromPath(path.join(resourcesPath, 'app.png'));
  if (process.platform === 'darwin') {
    return icon.resize({ width: 16, height: 16 });
  }
  return icon.resize({ width: 32, height: 32 });
};

/**
 * Build tray context menu (async to support dynamic content).
 */
const buildTrayContextMenu = async (): Promise<Electron.Menu> => {
  const getRecentConversations = async (): Promise<Array<{ id: string; title: string }>> => {
    try {
      const result = await ipcBridge.database.getUserConversations.invoke({ limit: 5 });
      return (result.items || []).slice(0, 5).map((conv) => ({
        id: conv.id,
        title: conv.name || i18n.t('common.tray.untitled'),
      }));
    } catch {
      return [];
    }
  };

  const getRunningTasksCount = (): number => cachedActiveCount;

  const recentConversations = await getRecentConversations();
  const runningTasksCount = getRunningTasksCount();

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: i18n.t('common.tray.showWindow'),
      click: showAndFocusMainWindow,
    },
    {
      label: i18n.t('common.tray.closeToTray'),
      click: hideMainWindowToTray,
    },
    { type: 'separator' },
    {
      label: i18n.t('common.tray.newChat'),
      click: () => {
        showAndFocusMainWindow();
        mainWindowRef?.webContents.send('tray:navigate-to-guid');
      },
    },
  ];

  if (recentConversations.length > 0) {
    template.push({ type: 'separator' });
    template.push({
      label: i18n.t('common.tray.recentChats'),
      enabled: false,
    });
    for (const conv of recentConversations) {
      const displayTitle = conv.title.length > 20 ? conv.title.slice(0, 20) + '...' : conv.title;
      template.push({
        label: displayTitle,
        click: () => {
          showAndFocusMainWindow();
          mainWindowRef?.webContents.send('tray:navigate-to-conversation', {
            conversation_id: conv.id,
          });
        },
      });
    }
  }

  template.push({ type: 'separator' });
  template.push({
    label: `${i18n.t('common.tray.runningTasks')}: ${runningTasksCount}`,
    enabled: false,
  });
  template.push({
    label: i18n.t('common.tray.pauseAll'),
    click: () => {
      showAndFocusMainWindow();
      mainWindowRef?.webContents.send('tray:pause-all-tasks');
    },
  });

  template.push({ type: 'separator' });
  template.push({
    label: `🐾 ${i18n.t('pet.desktopPet')}`,
    submenu: [
      {
        label: i18n.t('pet.showHide'),
        click: async () => {
          try {
            const petManager = await import('../pet/petManager');
            // Toggle: if pet windows exist, hide; otherwise show/create
            petManager.showPetWindow();
          } catch {
            /* pet not available */
          }
        },
      },
      { type: 'separator' as const },
      {
        label: i18n.t('pet.sizeSmall', { px: 200 }),
        click: async () => {
          try {
            const { resizePetWindow } = await import('../pet/petManager');
            resizePetWindow(200);
          } catch {
            /* ignore */
          }
        },
      },
      {
        label: i18n.t('pet.sizeMedium', { px: 280 }),
        click: async () => {
          try {
            const { resizePetWindow } = await import('../pet/petManager');
            resizePetWindow(280);
          } catch {
            /* ignore */
          }
        },
      },
      {
        label: i18n.t('pet.sizeLarge', { px: 360 }),
        click: async () => {
          try {
            const { resizePetWindow } = await import('../pet/petManager');
            resizePetWindow(360);
          } catch {
            /* ignore */
          }
        },
      },
    ],
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.checkUpdate'),
    click: () => {
      showAndFocusMainWindow();
      mainWindowRef?.webContents.send('tray:check-update');
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.about'),
    click: () => {
      showAndFocusMainWindow();
      mainWindowRef?.webContents.send('tray:open-about');
    },
  });
  template.push({
    label: i18n.t('common.tray.restart'),
    click: () => {
      isQuitting = true;
      app.relaunch();
      app.exit(0);
    },
  });
  template.push({ type: 'separator' });
  template.push({
    label: i18n.t('common.tray.quit'),
    click: () => {
      isQuitting = true;
      app.quit();
    },
  });

  return Menu.buildFromTemplate(template);
};

/**
 * Create system tray (idempotent — no-op if already exists).
 */
export const createOrUpdateTray = (): void => {
  if (tray) {
    return;
  }
  try {
    const icon = getTrayIcon();
    tray = new Tray(icon);
    tray.setToolTip('AionUi');
    void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));

    // Double-click: always show/focus (Windows/Linux; macOS rarely fires this).
    tray.on('double-click', () => {
      showAndFocusMainWindow();
    });

    // Left-click: toggle show/hide on Windows & Linux (Discord/Slack pattern).
    // macOS convention is click → context menu only, so skip toggle there.
    tray.on('click', () => {
      if (process.platform === 'darwin') {
        void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));
        return;
      }
      toggleMainWindowFromTray();
    });

    void fetchActiveCountAndMaybeRebuild();
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err);
  }
};

/**
 * Rebuild tray menu with current cached state (synchronous wrapper).
 */
const rebuildTrayMenu = (): void => {
  if (!tray) return;
  void buildTrayContextMenu().then((menu) => tray?.setContextMenu(menu));
};

/**
 * Fetch active count from backend, update cache if changed, and rebuild menu.
 */
const fetchActiveCountAndMaybeRebuild = async (): Promise<void> => {
  try {
    const { count } = await ipcBridge.conversation.activeCount.invoke();
    if (count !== cachedActiveCount) {
      cachedActiveCount = count;
      rebuildTrayMenu();
    }
  } catch {
    // Keep last cached value on error
  }
};

/**
 * Refresh tray context menu labels (called on language change).
 * Immediately rebuilds with current cache, then fetches latest count.
 */
export const refreshTrayMenu = async (): Promise<void> => {
  rebuildTrayMenu();
  await fetchActiveCountAndMaybeRebuild();
};

/**
 * Destroy system tray.
 */
export const destroyTray = (): void => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
};

type TrayPetAction = 'show-hide' | 'size-200' | 'size-280' | 'size-360';

const findTrayMenuItem = (menu: Electron.Menu, label: string): Electron.MenuItem | undefined => {
  for (const item of menu.items) {
    if (item.label === label) return item;
    if (item.submenu) {
      const nested = findTrayMenuItem(item.submenu, label);
      if (nested) return nested;
    }
  }
  return undefined;
};

const assertE2ETrayAccess = (): void => {
  if (process.env.AIONUI_E2E_TEST !== '1') {
    throw new Error('Tray pet actions can only be invoked from E2E');
  }
};

/**
 * Show/hide item inside the Desktop Pet submenu.
 *
 * The label is `pet.showHide` until the tray tracks visibility. A later build
 * uses `pet.hide` while the overlay is showing and `common.show` otherwise.
 * Matching all three keeps this hook working on both menus. The search stays
 * inside the pet submenu so a conversation titled "Show" cannot win.
 */
const findPetShowHideItem = (menu: Electron.Menu): Electron.MenuItem | undefined => {
  const marker = i18n.t('pet.desktopPet');
  const labels = new Set([i18n.t('pet.showHide'), i18n.t('pet.hide'), i18n.t('common.show')]);
  for (const item of menu.items) {
    if (!item.label.includes(marker) || !item.submenu) continue;
    return item.submenu.items.find((entry) => labels.has(entry.label));
  }
  return undefined;
};

/** Label of the tray Desktop Pet show/hide item. E2E only. */
export const e2eReadTrayPetShowHideLabel = async (): Promise<string> => {
  assertE2ETrayAccess();
  const menu = await buildTrayContextMenu();
  const item = findPetShowHideItem(menu);
  if (!item) {
    throw new Error('Tray menu is missing the pet show/hide item');
  }
  return item.label;
};

/**
 * Activate one Desktop Pet item on the tray menu.
 *
 * E2E only. xvfb has no status-icon host, and the suite turns the tray off at
 * startup, so tests cannot click the icon. This still runs the menu item's
 * own click handler (checkbox/radio state included) rather than a copy of it.
 */
export const e2eInvokeTrayPetItem = async (which: TrayPetAction): Promise<void> => {
  assertE2ETrayAccess();
  const menu = await buildTrayContextMenu();
  const sizeLabel =
    which === 'size-200'
      ? i18n.t('pet.sizeSmall', { px: 200 })
      : which === 'size-280'
        ? i18n.t('pet.sizeMedium', { px: 280 })
        : i18n.t('pet.sizeLarge', { px: 360 });
  const item = which === 'show-hide' ? findPetShowHideItem(menu) : findTrayMenuItem(menu, sizeLabel);
  if (!item) {
    throw new Error(`Tray menu is missing ${which}`);
  }
  item.click();
  // The show/hide and resize handlers import petManager asynchronously.
  // Give that import a turn so callers can observe the window change.
  await new Promise((resolve) => setTimeout(resolve, 50));
};
