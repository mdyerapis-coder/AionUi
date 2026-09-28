/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetStateMachine } from '@process/pet/petStateMachine';
import { AUTO_RETURN } from '@process/pet/petTypes';

const notificationReturnMs = (): number => {
  const delayMs = AUTO_RETURN.notification?.delayMs;
  if (delayMs === undefined) {
    throw new Error('notification must return to idle on a timer');
  }
  return delayMs;
};

describe('pet do-not-disturb', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('does not enter an activity state while do-not-disturb is on', () => {
    const machine = new PetStateMachine();
    machine.setDnd(true);

    expect(machine.requestState('error')).toBeNull();
    expect(machine.getCurrentState()).toBe('idle');

    machine.dispose();
  });

  it('does not replace the current animation with new activity during do-not-disturb', () => {
    const machine = new PetStateMachine();
    machine.requestState('notification');
    machine.setDnd(true);

    expect(machine.requestState('error')).toBeNull();
    expect(machine.getCurrentState()).toBe('notification');

    machine.dispose();
  });

  it('returns a transient state to idle on its original timer after do-not-disturb turns on', () => {
    const delayMs = notificationReturnMs();
    const elapsed = Math.floor(delayMs / 2);
    const machine = new PetStateMachine();
    machine.requestState('notification');
    vi.advanceTimersByTime(elapsed);
    machine.setDnd(true);

    expect(machine.getCurrentState()).toBe('notification');

    vi.advanceTimersByTime(delayMs - elapsed);
    expect(machine.getCurrentState()).toBe('idle');

    machine.dispose();
  });

  it('accepts activity again after do-not-disturb is turned off', () => {
    const machine = new PetStateMachine();
    machine.setDnd(true);
    machine.setDnd(false);

    expect(machine.requestState('working')).toBe('working');

    machine.dispose();
  });

  it('still allows a drag while do-not-disturb is on', () => {
    const machine = new PetStateMachine();
    machine.setDnd(true);

    expect(machine.requestState('dragging')).toBe('dragging');

    machine.dispose();
  });
});
