/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @internal
 *
 * Null-safe Electron shim. Import ONLY from:
 *   - src/process/utils/tray.ts
 *   - src/common/platform/ElectronPlatformServices.ts (imports 'electron' directly, not this file)
 *
 * All other modules must use getPlatformServices() from '@/common/platform' instead.
 */

// import type is erased at compile time — safe to use in this file
import type {
  Menu as MenuClass,
  NativeImage as NativeImageClass,
  Notification as NotificationClass,
  Tray as TrayClass,
} from 'electron';

type ElectronModule = {
  app: Electron.App;
  Menu: typeof MenuClass;
  nativeImage: { createFromPath(path: string): NativeImageClass };
  Notification: typeof NotificationClass;
  Tray: typeof TrayClass;
};

function loadElectron(): ElectronModule | null {
  if (process.versions?.electron) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('electron') as ElectronModule;
  }
  return null;
}

const _electron = loadElectron();

export const electronApp: Electron.App | null = _electron?.app ?? null;

export const electronNotification: typeof NotificationClass | null = _electron?.Notification ?? null;

export const electronMenu: typeof MenuClass | null = _electron?.Menu ?? null;

export const electronNativeImage: {
  createFromPath(path: string): NativeImageClass;
} | null = _electron?.nativeImage ?? null;

export const electronTray: typeof TrayClass | null = _electron?.Tray ?? null;
