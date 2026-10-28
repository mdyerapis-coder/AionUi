/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acknowledgeAionrsSwitchReply,
  aionrsSwitchReplyDecision,
  armAionrsSwitchReply,
  beginAionrsSwitchReply,
  noteAionrsSwitchReplyActivity,
  reinitializeAionrsAfterModelChange,
  resetAionrsSwitchReplyStateForTests,
  takeAionrsSwitchReplyTurn,
  waitForTurnToSettle,
  withTimeout,
} from '@/renderer/pages/conversation/platforms/aionrs/aionrsRuntimeSwitch';

describe('reinitializeAionrsAfterModelChange', () => {
  it('refuses a busy turn before the model write can kill the agent', async () => {
    const updateModel = vi.fn(async () => true);
    const outcome = await reinitializeAionrsAfterModelChange({
      activeTurnId: null,
      blockBecauseBusy: true,
      updateModel,
    });
    expect(outcome).toEqual({ status: 'busy' });
    expect(updateModel).not.toHaveBeenCalled();
  });

  it('does not write the model when the stopped turn never goes idle', async () => {
    const updateModel = vi.fn(async () => true);
    const outcome = await reinitializeAionrsAfterModelChange({
      activeTurnId: 'turn-1',
      stopTurn: async () => undefined,
      waitUntilIdle: async () => false,
      updateModel,
    });
    expect(outcome).toEqual({ status: 'busy' });
    expect(updateModel).not.toHaveBeenCalled();
  });

  it('does not rebuild the runtime when the model write is rejected', async () => {
    const ensureRuntime = vi.fn(async () => undefined);
    const outcome = await reinitializeAionrsAfterModelChange({
      activeTurnId: null,
      updateModel: async () => false,
      ensureRuntime,
    });
    expect(outcome).toEqual({ status: 'rejected' });
    expect(ensureRuntime).not.toHaveBeenCalled();
  });

  it('does not rebuild the runtime when the model write throws', async () => {
    const ensureRuntime = vi.fn(async () => undefined);
    const outcome = await reinitializeAionrsAfterModelChange({
      activeTurnId: null,
      updateModel: async () => {
        throw new Error('patch failed');
      },
      ensureRuntime,
    });
    expect(outcome).toEqual({ status: 'rejected' });
    expect(ensureRuntime).not.toHaveBeenCalled();
  });

  it('reports the saved model when the replacement runtime fails to come back', async () => {
    const outcome = await reinitializeAionrsAfterModelChange({
      activeTurnId: 'turn-1',
      stopTurn: async () => undefined,
      waitUntilIdle: async () => true,
      updateModel: async () => true,
      ensureRuntime: async () => {
        throw new Error('ensure timed out');
      },
    });
    expect(outcome).toEqual({ status: 'updated', runtimeReady: false });
  });

  it('rebuilds the runtime only after the previous turn is stopped and idle', async () => {
    const order: string[] = [];
    const outcome = await reinitializeAionrsAfterModelChange({
      activeTurnId: 'turn-1',
      stopTurn: async () => {
        order.push('stop');
      },
      waitUntilIdle: async () => {
        order.push('idle');
        return true;
      },
      updateModel: async () => {
        order.push('update');
        return true;
      },
      ensureRuntime: async () => {
        order.push('ensure');
      },
    });
    expect(order).toEqual(['stop', 'idle', 'update', 'ensure']);
    expect(outcome).toEqual({ status: 'updated', runtimeReady: true });
  });
});

describe('waitForTurnToSettle', () => {
  it('treats a turn id change as settled', async () => {
    const settled = await waitForTurnToSettle({
      turnId: 'turn-1',
      now: () => 0,
      delay: async () => undefined,
      readRuntime: async () => ({ isProcessing: true, turnId: 'turn-2' }),
    });
    expect(settled).toBe(true);
  });

  it('returns false when the same turn is still processing at the deadline', async () => {
    let clock = 0;
    const settled = await waitForTurnToSettle({
      turnId: 'turn-1',
      timeoutMs: 1_000,
      pollMs: 400,
      now: () => clock,
      delay: async (ms) => {
        clock += ms;
      },
      readRuntime: async () => ({ isProcessing: true, turnId: 'turn-1' }),
    });
    expect(settled).toBe(false);
  });

  it('does not treat a failed runtime read as the turn having ended', async () => {
    let clock = 0;
    const settled = await waitForTurnToSettle({
      turnId: 'turn-1',
      timeoutMs: 500,
      pollMs: 500,
      now: () => clock,
      delay: async (ms) => {
        clock += ms;
      },
      readRuntime: async () => {
        throw new Error('offline');
      },
    });
    expect(settled).toBe(false);
  });
});

describe('aionrs switch reply watch', () => {
  beforeEach(() => {
    resetAionrsSwitchReplyStateForTests();
  });

  it('does not start a silence clock when no switch was armed', () => {
    expect(beginAionrsSwitchReply('conv-1', 'turn-2', 1_000)).toBe(false);
    expect(aionrsSwitchReplyDecision('conv-1', 100_000)).toBe('idle');
  });

  it('gives up only after a started watch stays silent past its deadline', () => {
    armAionrsSwitchReply('conv-1', 90_000);
    expect(aionrsSwitchReplyDecision('conv-1', 90_000)).toBe('idle');
    expect(beginAionrsSwitchReply('conv-1', 'turn-2', 1_000)).toBe(true);
    expect(aionrsSwitchReplyDecision('conv-1', 90_999)).toBe('wait');
    expect(aionrsSwitchReplyDecision('conv-1', 91_000)).toBe('give_up');
    expect(takeAionrsSwitchReplyTurn('conv-1')).toBe('turn-2');
    expect(aionrsSwitchReplyDecision('conv-1', 200_000)).toBe('idle');
  });

  it('keeps waiting once the new session acknowledges the prompt', () => {
    armAionrsSwitchReply('conv-1', 90_000);
    beginAionrsSwitchReply('conv-1', 'turn-2', 1_000);
    noteAionrsSwitchReplyActivity('conv-1', 'turn-2');
    expect(aionrsSwitchReplyDecision('conv-1', 200_000)).toBe('idle');
  });

  it('ignores stream events from a different turn', () => {
    armAionrsSwitchReply('conv-1', 90_000);
    beginAionrsSwitchReply('conv-1', 'turn-2', 1_000);
    noteAionrsSwitchReplyActivity('conv-1', 'turn-1');
    expect(aionrsSwitchReplyDecision('conv-1', 91_000)).toBe('give_up');
  });

  it('leaves an armed watch in place when the previous turn finishes late', () => {
    armAionrsSwitchReply('conv-1', 90_000);
    acknowledgeAionrsSwitchReply('conv-1', 'turn-1');
    expect(beginAionrsSwitchReply('conv-1', 'turn-2', 1_000)).toBe(true);
  });

  it('clears a running watch when that turn finishes', () => {
    armAionrsSwitchReply('conv-1', 90_000);
    beginAionrsSwitchReply('conv-1', 'turn-2', 1_000);
    acknowledgeAionrsSwitchReply('conv-1', 'turn-1');
    expect(aionrsSwitchReplyDecision('conv-1', 91_000)).toBe('give_up');
    acknowledgeAionrsSwitchReply('conv-1', 'turn-2');
    expect(aionrsSwitchReplyDecision('conv-1', 91_000)).toBe('idle');
  });
});

describe('withTimeout', () => {
  it('rejects when the runtime rebuild never resolves', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => undefined), 30, new Error('aionrs runtime ensure timed out'));
    const assertion = expect(pending).rejects.toThrow('aionrs runtime ensure timed out');
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    vi.useRealTimers();
  });
});
