/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PetStateMachine } from '@process/pet/petStateMachine';
import type { PetState } from '@process/pet/petTypes';

describe('pet state machine', () => {
  let sm: PetStateMachine;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    sm = new PetStateMachine();
  });

  afterEach(() => {
    sm.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('done yields to new activity', () => {
    it.each(['thinking', 'working', 'notification', 'error'] as const)(
      'shows %s immediately while done is still holding the screen',
      (state) => {
        sm.requestState('done');
        vi.advanceTimersByTime(500);

        expect(sm.requestState(state)).toBe(state);
        expect(sm.getCurrentState()).toBe(state);
      }
    );

    it('does not let an idle animation cut done short', () => {
      sm.requestState('done');
      vi.advanceTimersByTime(500);

      expect(sm.requestState('yawning')).toBeNull();
      expect(sm.getCurrentState()).toBe('done');
    });

    it('still waits out the minimum display before an equal-priority pat', () => {
      sm.requestState('done');

      expect(sm.requestState('happy')).toBeNull();
      vi.advanceTimersByTime(3_499);
      expect(sm.getCurrentState()).toBe('done');

      vi.advanceTimersByTime(1);
      expect(sm.getCurrentState()).toBe('happy');
    });
  });

  describe('repeating a state refreshes its timers', () => {
    it('does not replay working or keep a stale done return', () => {
      const seen: PetState[] = [];
      sm.onStateChange((state) => seen.push(state));
      sm.requestState('done');
      vi.advanceTimersByTime(3_500);

      expect(sm.requestState('working')).toBe('working');
      sm.requestState('working');

      expect(seen).toEqual(['done', 'working']);
      vi.advanceTimersByTime(10_000);
      expect(sm.getCurrentState()).toBe('working');
    });

    it('stays on error past the original return when error is requested again', () => {
      const seen: PetState[] = [];
      sm.onStateChange((state) => seen.push(state));
      sm.requestState('error');
      vi.advanceTimersByTime(4_000);

      sm.requestState('error');

      expect(seen).toEqual(['error']);
      vi.advanceTimersByTime(4_000);
      expect(sm.getCurrentState()).toBe('error');
      vi.advanceTimersByTime(1_000);
      expect(sm.getCurrentState()).toBe('idle');
    });

    it('returns error to idle when nothing refreshes it', () => {
      sm.requestState('error');
      vi.advanceTimersByTime(4_999);
      expect(sm.getCurrentState()).toBe('error');

      vi.advanceTimersByTime(1);
      expect(sm.getCurrentState()).toBe('idle');
    });

    it('postpones a queued pat when done is requested again', () => {
      sm.requestState('done');
      vi.advanceTimersByTime(3_000);
      expect(sm.requestState('happy')).toBeNull();

      sm.requestState('done');
      vi.advanceTimersByTime(500);
      expect(sm.getCurrentState()).toBe('done');

      vi.advanceTimersByTime(3_000);
      expect(sm.getCurrentState()).toBe('happy');
    });

    it('still allows idle to fall asleep', () => {
      expect(sm.requestState('yawning')).toBe('yawning');
      expect(sm.getCurrentState()).toBe('yawning');
    });
  });
});
