/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * How long to wait for an in-flight aionrs turn to leave `running` before a
 * model change is allowed to kill the agent.
 */
export const AIONRS_TURN_SETTLE_TIMEOUT_MS = 8_000;

/** How long a replacement aionrs runtime may take to come back after a model change. */
export const AIONRS_RUNTIME_ENSURE_TIMEOUT_MS = 30_000;

/**
 * Silence budget for the first prompt after a model or permission switch.
 * Any stream activity disarms it; only a prompt the new session never
 * acknowledges is stopped.
 */
export const AIONRS_SWITCH_REPLY_TIMEOUT_MS = 90_000;

const SWITCH_REPLY_POLL_MS = 200;

export type AionrsTurnRuntimeSnapshot = {
  isProcessing: boolean;
  turnId: string | null;
};

export type AionrsModelSwitchOutcome =
  | { status: 'updated'; runtimeReady: boolean }
  | { status: 'rejected' }
  | { status: 'busy' };

export type ReinitializeAionrsAfterModelChangeInput = {
  /** Turn that must finish before the backend is asked to kill the agent. */
  activeTurnId: string | null;
  /** Processing with no turn id cannot be stopped safely, so the switch is refused. */
  blockBecauseBusy?: boolean;
  stopTurn?: (turnId: string) => Promise<void>;
  waitUntilIdle?: (turnId: string) => Promise<boolean>;
  updateModel: () => Promise<boolean>;
  ensureRuntime?: () => Promise<void>;
};

/**
 * Stop a live turn, persist the new model only after that turn has settled,
 * then rebuild the aionrs runtime so the next prompt is not written at a
 * session the model change just killed.
 *
 * A failed model write does not rebuild. A failed rebuild after a successful
 * write still reports `updated` — the server model has already changed — with
 * `runtimeReady: false` so the caller can warn instead of pretending the
 * assistant is ready.
 */
export async function reinitializeAionrsAfterModelChange(
  input: ReinitializeAionrsAfterModelChangeInput
): Promise<AionrsModelSwitchOutcome> {
  if (input.blockBecauseBusy) return { status: 'busy' };

  if (input.activeTurnId && input.stopTurn) {
    await input.stopTurn(input.activeTurnId);
  }
  if (input.activeTurnId && input.waitUntilIdle) {
    const idle = await input.waitUntilIdle(input.activeTurnId);
    if (!idle) return { status: 'busy' };
  }

  let updated = false;
  try {
    updated = await input.updateModel();
  } catch {
    return { status: 'rejected' };
  }
  if (!updated) return { status: 'rejected' };

  if (!input.ensureRuntime) return { status: 'updated', runtimeReady: true };
  try {
    await input.ensureRuntime();
    return { status: 'updated', runtimeReady: true };
  } catch {
    return { status: 'updated', runtimeReady: false };
  }
}

export async function waitForTurnToSettle(options: {
  turnId: string;
  readRuntime: () => Promise<AionrsTurnRuntimeSnapshot | null>;
  timeoutMs?: number;
  pollMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
}): Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? AIONRS_TURN_SETTLE_TIMEOUT_MS;
  const pollMs = options.pollMs ?? SWITCH_REPLY_POLL_MS;
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const startedAt = now();

  while (now() - startedAt < timeoutMs) {
    try {
      const runtime = await options.readRuntime();
      if (!runtime?.isProcessing || runtime.turnId !== options.turnId) return true;
    } catch {
      // A single read failure is not proof the turn ended.
    }
    await delay(pollMs);
  }
  return false;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

type SwitchReplyWatch = {
  phase: 'armed' | 'running';
  startedAt: number | null;
  turnId: string | null;
  sawActivity: boolean;
  deadlineMs: number;
};

const switchReplyWatches = new Map<string, SwitchReplyWatch>();

export function armAionrsSwitchReply(
  conversationId: string,
  deadlineMs: number = AIONRS_SWITCH_REPLY_TIMEOUT_MS
): void {
  switchReplyWatches.set(conversationId, {
    phase: 'armed',
    startedAt: null,
    turnId: null,
    sawActivity: false,
    deadlineMs,
  });
}

/** Start the silence clock for a send that follows a switch. Returns false when no switch is pending. */
export function beginAionrsSwitchReply(conversationId: string, turnId: string, now: number): boolean {
  const watch = switchReplyWatches.get(conversationId);
  if (!watch) return false;
  switchReplyWatches.set(conversationId, {
    ...watch,
    phase: 'running',
    startedAt: now,
    turnId,
    sawActivity: false,
  });
  return true;
}

export function noteAionrsSwitchReplyActivity(conversationId: string, turnId?: string): void {
  const watch = switchReplyWatches.get(conversationId);
  if (!watch || watch.phase !== 'running') return;
  if (turnId && watch.turnId && turnId !== watch.turnId) return;
  switchReplyWatches.set(conversationId, { ...watch, sawActivity: true });
}

/**
 * A terminal stream event ends a watch that has already started.
 * An armed watch (switch saved, next prompt not sent yet) is left in place so
 * a late finish from the turn we just stopped cannot disarm the next send.
 * A terminal event for a different turn is ignored.
 */
export function acknowledgeAionrsSwitchReply(conversationId: string, turnId?: string): void {
  const watch = switchReplyWatches.get(conversationId);
  if (!watch || watch.phase !== 'running') return;
  if (turnId && watch.turnId && turnId !== watch.turnId) return;
  switchReplyWatches.delete(conversationId);
}

export function aionrsSwitchReplyDecision(conversationId: string, now: number): 'idle' | 'wait' | 'give_up' {
  const watch = switchReplyWatches.get(conversationId);
  if (!watch || watch.phase !== 'running' || watch.startedAt === null || watch.sawActivity) return 'idle';
  if (now - watch.startedAt >= watch.deadlineMs) return 'give_up';
  return 'wait';
}

/** Drop the watch and return the turn that should be cancelled, if any. */
export function takeAionrsSwitchReplyTurn(conversationId: string): string | null {
  const turnId = switchReplyWatches.get(conversationId)?.turnId ?? null;
  switchReplyWatches.delete(conversationId);
  return turnId;
}

export function clearAionrsSwitchReply(conversationId: string): void {
  switchReplyWatches.delete(conversationId);
}

export function resetAionrsSwitchReplyStateForTests(): void {
  switchReplyWatches.clear();
}
