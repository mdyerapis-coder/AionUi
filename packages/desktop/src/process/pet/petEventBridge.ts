/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { REALTIME_CHANNELS } from '@/common/adapter/constant';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { isErrorTipMessage } from '@/common/chat/chatLib';
import type { PetStateMachine } from './petStateMachine';
import type { PetIdleTicker } from './petIdleTicker';
import { AUTO_RETURN, type PetState, type StateChangeCallback } from './petTypes';

/**
 * Conversation and turn that produced the latest mapped frame.
 * Once that turn is finished, later non-terminal frames with the same
 * `turnId` are ignored. Frames with no `turnId` skip the guard.
 */
export type PetActivityContext = {
  conversationId?: string;
  turnId?: string;
};

/** Frames that are not a finished or failed turn. Late copies of these are ignored. */
const NON_TERMINAL_STATES: ReadonlySet<PetState> = new Set(['thinking', 'working', 'notification']);

/**
 * What the pet should show when several conversations are active.
 * Needs confirmation, then error, then working or thinking (latest event wins
 * a tie), then done. Idle means the conversation is not in the set.
 */
const ACTIVITY_RANK: Partial<Record<PetState, number>> = {
  notification: 4,
  error: 3,
  working: 2,
  thinking: 2,
  done: 1,
};

/** Events with no conversation id share one slot, matching the old single pet. */
const ANONYMOUS_CONVERSATION = '\0';

type ActivitySlot = {
  state: PetState;
  seq: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const ACP_TOOL_ACTIVE = new Set(['pending', 'in_progress']);
const TOOL_GROUP_WORKING = new Set(['Executing', 'Pending']);

/**
 * Maps backend realtime frames onto the desktop pet.
 *
 * Frames arrive from the main-process `/ws` client (`petRealtime.ts`). The
 * main-process `bridge.adapter.emit` path does not carry these events.
 */
export class PetEventBridge {
  private disposed = false;
  private activity: PetActivityContext | undefined;
  private readonly slots = new Map<string, ActivitySlot>();
  private readonly finishedTurns = new Set<string>();
  private seq = 0;
  /** True while this bridge is itself changing the machine, so restore does not recurse. */
  private publishing = false;
  private readonly onMachineState: StateChangeCallback;

  constructor(
    private sm: PetStateMachine,
    private ticker: PetIdleTicker
  ) {
    this.onMachineState = (state) => {
      this.restoreActivityAfterLocalIdle(state);
    };
    this.sm.onStateChange(this.onMachineState);
  }

  /**
   * Latest frame that mapped to a pet state.
   * `conversationId` / `turnId` are copied so callers cannot mutate the bridge.
   */
  getActivityContext(): PetActivityContext | undefined {
    return this.activity ? { ...this.activity } : undefined;
  }

  /** Apply one backend realtime frame (`name` + payload). */
  handleRealtimeEvent(name: string, data: unknown): void {
    if (this.disposed) return;

    switch (name) {
      case REALTIME_CHANNELS.userCreated:
        this.onUserCreated(data);
        return;
      case REALTIME_CHANNELS.messageStream:
        this.onStream(data);
        return;
      case REALTIME_CHANNELS.turnCompleted:
        this.onTurnCompleted(data);
        return;
      case REALTIME_CHANNELS.confirmationAdd:
        this.handleConfirmationAdd(readActivityContext(data));
        return;
      case REALTIME_CHANNELS.teamChildTurnStarted:
      case REALTIME_CHANNELS.teamRunStarted:
        this.apply('working', readActivityContext(data));
        return;
      case REALTIME_CHANNELS.teamChildTurnCompleted:
      case REALTIME_CHANNELS.teamRunCompleted:
        this.handleTurnCompleted(readActivityContext(data));
        return;
      case REALTIME_CHANNELS.teamRunFailed:
        this.apply('error', readActivityContext(data));
        return;
      case REALTIME_CHANNELS.cronJobExecuted:
        if (isRecord(data) && data.status === 'ok') {
          this.handleTurnCompleted(readActivityContext(data));
        }
        return;
      case REALTIME_CHANNELS.conversationListChanged:
        this.onConversationListChanged(data);
        return;
      default:
        return;
    }
  }

  /** User send, or a stream `start` when no user bubble was emitted. A send starts the turn fresh. */
  handleUserSendMessage(context?: PetActivityContext): void {
    if (!this.disposed && !this.sm.getDnd() && context?.conversationId && context.turnId) {
      this.finishedTurns.delete(finishedTurnKey(context.conversationId, context.turnId));
    }
    this.apply('thinking', context);
  }

  /** Turn finished or cancelled. Cancel is `done`, never `error`. */
  handleTurnCompleted(context?: PetActivityContext): void {
    this.apply('done', context);
  }

  /** Permission or question that needs the user. */
  handleConfirmationAdd(context?: PetActivityContext): void {
    this.apply('notification', context);
  }

  /**
   * A reconnect after the first successful `/ws` open.
   * In-flight turns never get their terminal frame replayed, so drop every
   * conversation back to idle instead of pinning the pet on `working`.
   */
  resetAfterReconnect(): void {
    if (this.disposed) return;
    this.clearAllSlots();
    this.finishedTurns.clear();
    this.activity = undefined;
    this.publish();
  }

  dispose(): void {
    this.disposed = true;
    this.sm.offStateChange(this.onMachineState);
    this.clearAllSlots();
  }

  private onUserCreated(data: unknown): void {
    if (!isRecord(data) || data.hidden === true) return;
    this.handleUserSendMessage(readActivityContext(data));
  }

  private onStream(data: unknown): void {
    if (!isRecord(data) || typeof data.type !== 'string') return;
    const context = readActivityContext(data);
    const type = data.type;

    if (type === 'start') {
      this.handleUserSendMessage(context);
      return;
    }
    if (type === 'thinking' || type === 'thought') {
      this.apply('thinking', context);
      return;
    }
    if (type === 'text' || type === 'content') {
      this.apply('working', context);
      return;
    }
    if (type === 'acp_tool_call' && ACP_TOOL_ACTIVE.has(acpToolStatus(data.data) ?? '')) {
      this.apply('working', context);
      return;
    }
    if (type === 'tool_group') {
      const statuses = toolGroupStatuses(data.data);
      if (statuses.includes('Confirming')) {
        this.handleConfirmationAdd(context);
        return;
      }
      if (statuses.some((status) => TOOL_GROUP_WORKING.has(status))) {
        this.apply('working', context);
      }
      return;
    }
    if (type === 'acp_permission' || type === 'permission' || type === 'ask') {
      this.handleConfirmationAdd(context);
      return;
    }
    if (type === 'finish') {
      this.handleTurnCompleted(context);
      return;
    }
    if (type === 'error' || isTipsError(data) || isAgentStatusError(data)) {
      this.apply('error', context);
    }
  }

  private onConversationListChanged(data: unknown): void {
    if (!isRecord(data) || data.action !== 'deleted') return;
    const conversationId = readString(data, ['conversation_id', 'conversationId', 'session_id', 'sessionId']);
    if (!conversationId) return;
    this.forgetConversation(conversationId);
  }

  /** The chat is gone. Drop its state and show whoever is still active. */
  private forgetConversation(conversationId: string): void {
    if (this.disposed) return;
    const slot = this.slots.get(conversationId);
    if (slot?.timer) clearTimeout(slot.timer);
    const removed = this.slots.delete(conversationId);
    this.clearTurnGuards(conversationId);
    if (this.activity?.conversationId === conversationId) this.activity = undefined;
    if (!removed) return;
    this.publish();
  }

  private clearTurnGuards(conversationId: string): void {
    const prefix = `${conversationId}\0`;
    for (const key of this.finishedTurns) {
      if (key.startsWith(prefix)) this.finishedTurns.delete(key);
    }
  }

  private clearAllSlots(): void {
    for (const slot of this.slots.values()) {
      if (slot.timer) clearTimeout(slot.timer);
    }
    this.slots.clear();
  }

  private onTurnCompleted(data: unknown): void {
    const context = readActivityContext(data);
    const outcome = turnOutcome(data);
    if (outcome === 'error') {
      this.apply('error', context);
      return;
    }
    if (outcome === 'done' || outcome === 'cancel') {
      this.handleTurnCompleted(context);
    }
  }

  private apply(state: PetState, context?: PetActivityContext): void {
    if (this.disposed) return;
    // Do-not-disturb already rejects the visual change inside the state machine.
    // Keep the same side effect as before: remember the frame, do not track it.
    if (this.sm.getDnd()) {
      this.ticker.resetIdle();
      if (context) this.activity = context;
      return;
    }
    if (this.isLateFrame(state, context)) return;

    this.ticker.resetIdle();
    if (context) this.activity = context;
    if (context?.conversationId && context.turnId && (state === 'done' || state === 'error')) {
      this.finishedTurns.add(finishedTurnKey(context.conversationId, context.turnId));
    }
    this.upsertSlot(context?.conversationId, state);
    this.publish();
  }

  /** A finished turn ignores later thinking, working, and confirmation frames with that id. */
  private isLateFrame(state: PetState, context?: PetActivityContext): boolean {
    const conversationId = context?.conversationId;
    const turnId = context?.turnId;
    if (!conversationId || !turnId) return false;
    if (!NON_TERMINAL_STATES.has(state)) return false;
    return this.finishedTurns.has(finishedTurnKey(conversationId, turnId));
  }

  private upsertSlot(conversationId: string | undefined, state: PetState): void {
    const key = conversationId ?? ANONYMOUS_CONVERSATION;
    const previous = this.slots.get(key);
    if (previous?.timer) clearTimeout(previous.timer);
    const slot: ActivitySlot = { state, seq: ++this.seq, timer: null };
    this.slots.set(key, slot);
    this.armSlotTimer(key, slot);
  }

  private armSlotTimer(key: string, slot: ActivitySlot): void {
    const ar = AUTO_RETURN[slot.state];
    if (!ar) return;
    const seq = slot.seq;
    slot.timer = setTimeout(() => {
      if (this.disposed) return;
      const current = this.slots.get(key);
      if (!current || current.seq !== seq) return;
      current.timer = null;
      this.slots.delete(key);
      // setDnd already froze the on-screen return. Skip publishing so that
      // pose stays put. The slot is gone, so it cannot reappear later.
      if (this.sm.getDnd()) return;
      this.publish();
    }, ar.delayMs);
  }

  private publish(): void {
    const winner = this.pickWinner();
    this.publishing = true;
    try {
      this.sm.presentActivity(winner ?? 'idle');
    } finally {
      this.publishing = false;
    }
  }

  /**
   * A pat, poke, or other local pose returns to idle on its own timer.
   * If a conversation is still active, show it again instead of leaving the pet idle.
   */
  private restoreActivityAfterLocalIdle(state: PetState): void {
    if (this.publishing || this.disposed || state !== 'idle') return;
    const winner = this.pickWinner();
    if (!winner) return;
    this.publishing = true;
    try {
      this.sm.presentActivity(winner);
    } finally {
      this.publishing = false;
    }
  }

  private pickWinner(): PetState | null {
    let best: { state: PetState; rank: number; seq: number } | null = null;
    for (const slot of this.slots.values()) {
      const rank = ACTIVITY_RANK[slot.state] ?? 0;
      if (!best || rank > best.rank || (rank === best.rank && slot.seq > best.seq)) {
        best = { state: slot.state, rank, seq: slot.seq };
      }
    }
    return best?.state ?? null;
  }
}

function finishedTurnKey(conversationId: string, turnId: string): string {
  return `${conversationId}\0${turnId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function readActivityContext(data: unknown): PetActivityContext | undefined {
  if (!isRecord(data)) return undefined;
  const conversationId = readString(data, ['conversation_id', 'conversationId', 'session_id', 'sessionId']);
  const turnId = readString(data, ['turn_id', 'turnId']);
  if (!conversationId && !turnId) return undefined;
  return {
    ...(conversationId ? { conversationId } : {}),
    ...(turnId ? { turnId } : {}),
  };
}

function acpToolStatus(data: unknown): string | undefined {
  if (!isRecord(data) || !isRecord(data.update)) return undefined;
  return typeof data.update.status === 'string' ? data.update.status : undefined;
}

function toolGroupStatuses(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => (isRecord(item) && typeof item.status === 'string' ? [item.status] : []));
}

function isTipsError(data: Record<string, unknown>): boolean {
  return isErrorTipMessage(data as unknown as IResponseMessage);
}

function isAgentStatusError(data: Record<string, unknown>): boolean {
  return data.type === 'agent_status' && isRecord(data.data) && data.data.status === 'error';
}

/** `cancel` is a stopped turn: show `done`, never `error`. */
function turnOutcome(data: unknown): 'error' | 'cancel' | 'done' | null {
  if (!isRecord(data)) return null;
  const state = typeof data.state === 'string' ? data.state : undefined;
  const status = typeof data.status === 'string' ? data.status : undefined;
  if (state === 'error') return 'error';
  if (state === 'stopped') return 'cancel';
  if (status === 'finished' || state === 'ai_waiting_input') return 'done';
  return null;
}
