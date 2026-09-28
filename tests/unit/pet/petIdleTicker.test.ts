/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetIdleTicker } from '@process/pet/petIdleTicker';
import { PetStateMachine } from '@process/pet/petStateMachine';

vi.mock('electron', () => ({
  screen: {
    getCursorScreenPoint: () => ({ x: 10, y: 10 }),
  },
}));

describe('pet idle ticker', () => {
  let sm: PetStateMachine;
  let ticker: PetIdleTicker;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    sm = new PetStateMachine();
    ticker = new PetIdleTicker(sm);
  });

  afterEach(() => {
    ticker.stop();
    sm.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not treat a long working turn as time spent idle', () => {
    ticker.start();
    sm.requestState('working');
    vi.advanceTimersByTime(120_000);
    sm.requestState('done');
    vi.advanceTimersByTime(4_000);
    expect(sm.getCurrentState()).toBe('idle');

    vi.advanceTimersByTime(50);

    expect(sm.getCurrentState()).toBe('idle');
  });

  it('yawns after a minute of real stillness once the pet is idle', () => {
    ticker.start();
    vi.advanceTimersByTime(60_000);

    expect(sm.getCurrentState()).toBe('yawning');
  });
});
