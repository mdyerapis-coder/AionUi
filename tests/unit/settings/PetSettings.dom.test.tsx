/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { getPetEnabledMock, setPetEnabledMock, getPetSizeMock, getPetDndMock, preferenceListeners, configServiceMock } =
  vi.hoisted(() => ({
    getPetEnabledMock: vi.fn(),
    setPetEnabledMock: vi.fn(() => Promise.resolve()),
    getPetSizeMock: vi.fn(() => Promise.resolve(280)),
    getPetDndMock: vi.fn(() => Promise.resolve(false)),
    preferenceListeners: new Set<(change: { size?: number; dnd?: boolean }) => void>(),
    configServiceMock: {
      get: vi.fn(() => undefined as unknown),
      setLocal: vi.fn(),
      set: vi.fn(() => Promise.resolve()),
    },
  }));

vi.mock('@/common/adapter/ipcBridge', () => ({
  systemSettings: {
    getPetEnabled: { invoke: getPetEnabledMock },
    setPetEnabled: { invoke: setPetEnabledMock },
    getPetSize: { invoke: getPetSizeMock },
    setPetSize: { invoke: vi.fn(() => Promise.resolve()) },
    getPetDnd: { invoke: getPetDndMock },
    setPetDnd: { invoke: vi.fn(() => Promise.resolve()) },
    petPreferencesChanged: {
      on: (callback: (change: { size?: number; dnd?: boolean }) => void) => {
        preferenceListeners.add(callback);
        return () => {
          preferenceListeners.delete(callback);
        };
      },
    },
    setPetConfirmEnabled: { invoke: vi.fn(() => Promise.resolve()) },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow', () => ({
  default: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div data-testid={`row-${label}`}>{children}</div>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

import PetSettings from '@/renderer/pages/settings/PetSettings';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const getEnableSwitch = () => within(screen.getByTestId('row-pet.enable')).getByRole('switch');

describe('PetSettings enable switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preferenceListeners.clear();
    getPetSizeMock.mockResolvedValue(280);
    getPetDndMock.mockResolvedValue(false);
    configServiceMock.get.mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('AC2: sources the initial value from systemSettings.getPetEnabled, not the configService cache', async () => {
    getPetEnabledMock.mockResolvedValue(false);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getPetEnabledMock).toHaveBeenCalledTimes(1);
    });
    expect(configServiceMock.get).not.toHaveBeenCalledWith('pet.enabled');
  });

  it('AC7: does not flicker to a definite ON state before the authoritative value resolves', async () => {
    const deferred = createDeferred<boolean>();
    getPetEnabledMock.mockReturnValue(deferred.promise);
    render(<PetSettings />);

    const initialSwitch = getEnableSwitch();
    expect(initialSwitch).toBeDisabled();
    expect(initialSwitch.getAttribute('aria-checked')).toBe('false');

    deferred.resolve(true);

    await waitFor(() => {
      expect(getEnableSwitch().getAttribute('aria-checked')).toBe('true');
    });
    expect(getEnableSwitch()).not.toBeDisabled();
  });

  it('AC1/AC5: renders OFF and enabled when the authoritative value resolves false', async () => {
    getPetEnabledMock.mockResolvedValue(false);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });
    expect(getEnableSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('AC1/AC5: renders ON when the authoritative value resolves true', async () => {
    getPetEnabledMock.mockResolvedValue(true);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch().getAttribute('aria-checked')).toBe('true');
    });
  });

  it('AC3: toggling ON persists through the setPetEnabled IPC boundary', async () => {
    getPetEnabledMock.mockResolvedValue(false);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });

    fireEvent.click(getEnableSwitch());

    await waitFor(() => {
      expect(setPetEnabledMock).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it('falls back to OFF (never ON) when getPetEnabled rejects', async () => {
    getPetEnabledMock.mockRejectedValue(new Error('ipc failure'));
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });
    expect(getEnableSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('shows the saved size from the main process when the config cache is stale', async () => {
    getPetEnabledMock.mockResolvedValue(true);
    getPetSizeMock.mockResolvedValue(360);
    configServiceMock.get.mockImplementation((key: string) => (key === 'pet.size' ? 200 : undefined));
    render(<PetSettings />);

    await waitFor(() => {
      expect(within(screen.getByTestId('row-pet.size')).getByRole('radio', { name: 'pet.sizeLarge' })).toBeChecked();
    });
  });

  it('shows saved do-not-disturb from the main process when the config cache is stale', async () => {
    getPetEnabledMock.mockResolvedValue(true);
    getPetDndMock.mockResolvedValue(true);
    configServiceMock.get.mockImplementation((key: string) => (key === 'pet.dnd' ? false : undefined));
    render(<PetSettings />);

    await waitFor(() => {
      expect(within(screen.getByTestId('row-pet.dnd')).getByRole('switch')).toBeChecked();
    });
  });

  it('updates size and do-not-disturb when the main process reports a menu change', async () => {
    getPetEnabledMock.mockResolvedValue(true);
    render(<PetSettings />);

    await waitFor(() => {
      expect(preferenceListeners.size).toBe(1);
    });

    const listener = [...preferenceListeners][0];
    await act(async () => {
      listener({ size: 200, dnd: true });
    });

    expect(within(screen.getByTestId('row-pet.size')).getByRole('radio', { name: 'pet.sizeSmall' })).toBeChecked();
    expect(within(screen.getByTestId('row-pet.dnd')).getByRole('switch')).toBeChecked();
    expect(configServiceMock.setLocal).toHaveBeenCalledWith('pet.size', 200);
    expect(configServiceMock.setLocal).toHaveBeenCalledWith('pet.dnd', true);
  });

  it('keeps the cached size when the authoritative size read fails', async () => {
    getPetEnabledMock.mockResolvedValue(true);
    getPetSizeMock.mockRejectedValue(new Error('ipc failure'));
    configServiceMock.get.mockImplementation((key: string) => (key === 'pet.size' ? 360 : undefined));
    render(<PetSettings />);

    await waitFor(() => {
      expect(getPetSizeMock).toHaveBeenCalled();
    });
    expect(within(screen.getByTestId('row-pet.size')).getByRole('radio', { name: 'pet.sizeLarge' })).toBeChecked();
  });

  it('AC5: maps an undefined authoritative value to OFF at the UI', async () => {
    getPetEnabledMock.mockResolvedValue(undefined);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });
    expect(getEnableSwitch().getAttribute('aria-checked')).toBe('false');
  });
});
