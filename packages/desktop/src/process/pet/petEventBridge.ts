/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { REALTIME_CHANNELS } from '@/common/adapter/constant';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { isErrorTipMessage } from '@/common/chat/chatLib';
import {
  parsePetPermissionFrame,
  permissionIdsClosedByRemove,
  type PetPermissionBubble,
} from '@/common/chat/petPermission';
import type { PetStateMachine } from './petStateMachine';
import type { PetIdleTicker } from './petIdleTicker';
import type { PetState } from './petTypes';

/** Bubble open/close signals. The confirm window lives outside this bridge. */
export type PetPermissionHooks = {
  onOpen: (bubble: PetPermissionBubble) => void;
  onClose: (ids: string[]) => void;
};

/**
 * Conversation and turn that produced the latest mapped frame.
 * A follow-up can ignore stale Codex frames for the same `turnId` without
 * parsing the socket payload again. This bridge does not apply that guard.
 */
export type PetActivityContext = {
  conversationId?: string;
  turnId?: string;
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
  private permissionHooks: PetPermissionHooks | null = null;
  private openPermissions = new Map<string, PetPermissionBubble>();

  constructor(
    private sm: PetStateMachine,
    private ticker: PetIdleTicker
  ) {}

  /** Receive permission bubbles parsed from `/ws`. Replaces any previous hooks. */
  setPermissionHooks(hooks: PetPermissionHooks | null): void {
    this.permissionHooks = hooks;
  }

  /** Permissions currently waiting on the user. */
  getPendingPermissions(): PetPermissionBubble[] {
    return [...this.openPermissions.values()];
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
      case REALTIME_CHANNELS.confirmationRemove:
        this.closeRemovedPermissions(data);
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
      default:
        return;
    }
  }

  /** User send, or a stream `start` when no user bubble was emitted. */
  handleUserSendMessage(context?: PetActivityContext): void {
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

  dispose(): void {
    this.disposed = true;
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
    if (type === 'acp_permission' || type === 'permission') {
      this.presentPermission(data);
      this.handleConfirmationAdd(context);
      return;
    }
    if (type === 'ask') {
      this.handleConfirmationAdd(context);
      return;
    }
    if (type === 'finish') {
      this.closePermissionsForConversation(context?.conversationId);
      this.handleTurnCompleted(context);
      return;
    }
    if (type === 'error' || isTipsError(data) || isAgentStatusError(data)) {
      if (type === 'error') this.closePermissionsForConversation(context?.conversationId);
      this.apply('error', context);
    }
  }

  private onTurnCompleted(data: unknown): void {
    const context = readActivityContext(data);
    const outcome = turnOutcome(data);
    if (outcome === 'error') {
      this.closePermissionsForConversation(context?.conversationId);
      this.apply('error', context);
      return;
    }
    if (outcome === 'done' || outcome === 'cancel') {
      this.closePermissionsForConversation(context?.conversationId);
      this.handleTurnCompleted(context);
    }
  }

  private presentPermission(frame: unknown): void {
    const bubble = parsePetPermissionFrame(frame);
    if (!bubble) return;
    this.openPermissions.set(bubble.id, bubble);
    this.permissionHooks?.onOpen(bubble);
  }

  private closeRemovedPermissions(event: unknown): void {
    this.closePermissionIds(permissionIdsClosedByRemove(this.getPendingPermissions(), event));
  }

  /** Drop pending bubbles for one conversation. Missing id closes every pending bubble. */
  private closePermissionsForConversation(conversationId?: string): void {
    const ids = this.getPendingPermissions()
      .filter((bubble) => !conversationId || bubble.conversationId === conversationId)
      .map((bubble) => bubble.id);
    this.closePermissionIds(ids);
  }

  private closePermissionIds(ids: string[]): void {
    const closed = ids.filter((id) => this.openPermissions.delete(id));
    if (closed.length > 0) this.permissionHooks?.onClose(closed);
  }

  private apply(state: PetState, context?: PetActivityContext): void {
    if (this.disposed) return;
    if (context) this.activity = context;
    this.ticker.resetIdle();
    this.sm.requestState(state);
  }
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
