/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

describe('main-process bridge', () => {
  it('no longer exposes a pet notify hook', async () => {
    const main = await import('@/common/adapter/main');
    expect(main).not.toHaveProperty('setPetNotifyHook');
  });

  it('still emits bridge events after the pet hook is removed', async () => {
    await import('@/common/adapter/main');
    const { bridge } = await import('@/common/platform/bridge');
    expect(() => bridge.emit('theme.changed', { mode: 'dark' })).not.toThrow();
  });
});
