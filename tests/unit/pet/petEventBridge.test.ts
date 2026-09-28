/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REALTIME_CHANNELS } from '@/common/adapter/constant';
import { PetEventBridge } from '@process/pet/petEventBridge';
import type { PetIdleTicker } from '@process/pet/petIdleTicker';
import { PetStateMachine } from '@process/pet/petStateMachine';
import type { PetState } from '@process/pet/petTypes';

type Harness = {
  sm: PetStateMachine;
  bridge: PetEventBridge;
};

function createHarness(): Harness {
  const sm = new PetStateMachine();
  const bridge = new PetEventBridge(sm, { resetIdle() {} } as PetIdleTicker);
  return { sm, bridge };
}

function stream(type: string, conversationId: string, turnId?: string): Record<string, unknown> {
  return {
    type,
    data: null,
    msg_id: 'msg-1',
    conversation_id: conversationId,
    ...(turnId ? { turn_id: turnId } : {}),
  };
}

describe('pet event bridge activity', () => {
  let sm: PetStateMachine;
  let bridge: PetEventBridge;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    ({ sm, bridge } = createHarness());
  });

  afterEach(() => {
    bridge.dispose();
    sm.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('turn guard', () => {
    it('ignores a late confirmation for a turn that already finished', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));
      expect(sm.getCurrentState()).toBe('done');

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('acp_permission', 'conv-a', 'turn-1'));

      expect(sm.getCurrentState()).toBe('done');
      expect(bridge.getActivityContext()).toEqual({ conversationId: 'conv-a', turnId: 'turn-1' });
    });

    it('ignores a late working frame after that finish has returned to idle', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));
      vi.advanceTimersByTime(4_000);
      expect(sm.getCurrentState()).toBe('idle');

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-1'));

      expect(sm.getCurrentState()).toBe('idle');
    });

    it('shows a new turn id immediately, including while done is on screen', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-2'));

      expect(sm.getCurrentState()).toBe('working');
    });

    it('lets a user send on the finished turn start over', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.turnCompleted, {
        session_id: 'conv-a',
        turn_id: 'turn-1',
        status: 'finished',
        state: 'ai_waiting_input',
      });
      expect(sm.getCurrentState()).toBe('done');

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.userCreated, {
        conversation_id: 'conv-a',
        turn_id: 'turn-1',
        hidden: false,
      });

      expect(sm.getCurrentState()).toBe('thinking');
    });

    it('applies a frame that has no turn id', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a'));

      expect(sm.getCurrentState()).toBe('working');
    });

    it('does not let a send in another conversation reopen the finished turn', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.userCreated, {
        conversation_id: 'conv-b',
        turn_id: 'turn-9',
        hidden: false,
      });
      expect(sm.getCurrentState()).toBe('thinking');

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-1'));

      expect(sm.getCurrentState()).toBe('thinking');
    });

    it('still shows a late error for the finished turn', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('error', 'conv-a', 'turn-1'));

      expect(sm.getCurrentState()).toBe('error');
    });

    it('ignores a stream payload that is not a frame', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, null);

      expect(sm.getCurrentState()).toBe('idle');
    });
  });

  describe('one state per conversation', () => {
    it('ranks confirmation above error, then working, then done', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-done', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-work', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('error', 'conv-err', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('ask', 'conv-ask', 'turn-1'));

      expect(sm.getCurrentState()).toBe('notification');
    });

    it('keeps a confirmation above a newer error', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('ask', 'conv-ask', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('error', 'conv-err', 'turn-1'));

      expect(sm.getCurrentState()).toBe('notification');
    });

    it('does not hide a conversation that is still working when another finishes', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-b', 'turn-1'));

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));

      expect(sm.getCurrentState()).toBe('working');
    });

    it('shows the next conversation when the louder one returns to idle', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('error', 'conv-err', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('ask', 'conv-ask', 'turn-1'));
      expect(sm.getCurrentState()).toBe('notification');

      vi.advanceTimersByTime(3_500);
      expect(sm.getCurrentState()).toBe('error');

      vi.advanceTimersByTime(1_500);
      expect(sm.getCurrentState()).toBe('idle');
    });

    it('follows the latest of two conversations that are both working or thinking', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('thinking', 'conv-a', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-b', 'turn-1'));
      expect(sm.getCurrentState()).toBe('working');

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('thinking', 'conv-a', 'turn-1'));
      expect(sm.getCurrentState()).toBe('thinking');
    });

    it('does not let a finished cron run hide a conversation that is still working', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-1'));

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.cronJobExecuted, { job_id: 'job-1', status: 'skipped' });
      expect(sm.getCurrentState()).toBe('working');

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.cronJobExecuted, { job_id: 'job-1', status: 'ok' });
      expect(sm.getCurrentState()).toBe('working');

      vi.advanceTimersByTime(4_000);
      expect(sm.getCurrentState()).toBe('working');
    });

    it('extends error when the same conversation errors again without replaying it', () => {
      const seen: PetState[] = [];
      sm.onStateChange((state) => seen.push(state));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('error', 'conv-a', 'turn-1'));
      vi.advanceTimersByTime(4_000);

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('error', 'conv-a', 'turn-1'));

      expect(seen).toEqual(['error']);
      vi.advanceTimersByTime(4_000);
      expect(sm.getCurrentState()).toBe('error');
      vi.advanceTimersByTime(1_000);
      expect(sm.getCurrentState()).toBe('idle');
    });

    it('does not replay a second working frame for the same turn', () => {
      const seen: PetState[] = [];
      sm.onStateChange((state) => seen.push(state));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-1'));
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-1'));

      expect(seen).toEqual(['working']);
      vi.advanceTimersByTime(30_000);
      expect(sm.getCurrentState()).toBe('working');
    });

    it('comes back to the active conversation after a pat', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('text', 'conv-a', 'turn-1'));
      expect(sm.requestState('happy')).toBe('happy');

      vi.advanceTimersByTime(4_000);

      expect(sm.getCurrentState()).toBe('working');
    });

    it('drops activity while do-not-disturb is on', () => {
      sm.setDnd(true);

      bridge.handleRealtimeEvent(REALTIME_CHANNELS.userCreated, {
        conversation_id: 'conv-a',
        turn_id: 'turn-1',
        hidden: false,
      });

      expect(sm.getCurrentState()).toBe('idle');
    });

    it('does not leave done while do-not-disturb is on', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));
      expect(sm.getCurrentState()).toBe('done');

      sm.setDnd(true);
      vi.advanceTimersByTime(10_000);

      expect(sm.getCurrentState()).toBe('done');
    });

    it('does not return to idle after the bridge is disposed', () => {
      bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, stream('finish', 'conv-a', 'turn-1'));
      bridge.dispose();

      vi.advanceTimersByTime(5_000);

      expect(sm.getCurrentState()).toBe('done');
    });
  });
});
