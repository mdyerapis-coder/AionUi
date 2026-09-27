/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { login } = vi.hoisted(() => ({
  login: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/renderer/services/i18n', () => ({
  changeLanguage: vi.fn(() => Promise.resolve()),
}));

vi.mock('@renderer/assets/logos/brand/app.png', () => ({ default: 'logo.png' }));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    status: 'unauthenticated',
    login,
  }),
}));

import LoginPage from '@/renderer/pages/login';

const fillCredentials = () => {
  fireEvent.change(screen.getByLabelText('login.username'), { target: { value: 'ada' } });
  fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'secret' } });
};

describe('login csrfError message', () => {
  beforeEach(() => {
    login.mockReset();
  });

  it('maps a csrfError result to the localized login error instead of the raw message', async () => {
    login.mockResolvedValue({
      success: false,
      code: 'csrfError',
      message: 'Security token expired. Please try again.',
    });
    render(<LoginPage />);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('login.errors.csrfError');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Security token expired. Please try again.');
  });

  it('keeps an unknown failure on the server message', async () => {
    login.mockResolvedValue({
      success: false,
      code: 'unknown',
      message: 'raw server text',
    });
    render(<LoginPage />);
    fillCredentials();
    fireEvent.click(screen.getByRole('button', { name: 'login.submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('raw server text');
  });
});
