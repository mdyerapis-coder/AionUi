/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { Theme } from '@/common/theme/types';

contextBridge.exposeInMainWorld('petConfirmAPI', {
  onConfirmationAdd: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-add', (_event, data) => callback(data));
  },
  onConfirmationUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-update', (_event, data) => callback(data));
  },
  onConfirmationRemove: (callback: (data: { id: string }) => void) => {
    ipcRenderer.on('pet:confirm-remove', (_event, data) => callback(data));
  },
  onConfirmError: (callback: (data: { id: string }) => void) => {
    ipcRenderer.on('pet:confirm-error', (_event, data) => callback(data));
  },
  onThemeChange: (callback: (theme: Theme) => void) => {
    ipcRenderer.on('pet:confirm-theme', (_event, theme) => callback(theme));
  },
  respond: (data: { id: string; optionId: string }) => {
    ipcRenderer.send('pet:confirm-respond', data);
  },
  dragStart: () => {
    ipcRenderer.send('pet:confirm-drag-start');
  },
  dragEnd: () => {
    ipcRenderer.send('pet:confirm-drag-end');
  },
});
