/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Desktop-pet view of a permission request arriving on `/ws`.
 *
 * AionCore serializes `AgentStreamEvent::AcpPermission` as an untagged enum
 * (`crates/aionui-ai-agent/src/protocol/events/permission.rs`), so
 * `message.stream` frames with `type: "acp_permission"` carry one of two
 * payloads:
 *
 * 1. Request — `AcpPermissionRequestData`, matching `AcpPermissionRequest` in
 *    `packages/desktop/src/common/types/platform/acpTypes.ts`. ACP sessions
 *    emit this from `permission_request_to_event_data`. Options have
 *    `option_id`, `name`, and `kind` (`allow_once | allow_always |
 *    reject_once | reject_always`).
 * 2. Confirmation — `aionui_common::Confirmation`. The aionrs protocol sink
 *    emits `AcpPermission(Confirmation(...))` (`backend_protocol_sink.rs`).
 *    Options have `label` and `value` (for example `proceed_once`).
 *
 * The older `permission` frame (`AgentStreamEvent::Permission`) still uses
 * the confirmation shape when it arrives. Both shapes are answered on
 * `POST /api/conversations/{id}/confirmations/{call_id}/confirm`, which is
 * what the main chat uses: a request sends the option id string
 * (`conversation.confirmMessage`); a confirmation sends `{ value }`
 * (`conversation.confirmation.confirm`).
 */

export const PET_PERMISSION_FALLBACK_TITLE_KEY = 'messages.permissionRequest';

/** Kinds declared on `AcpPermissionOption` / `AcpPermissionOptionKind`. */
export const ACP_PERMISSION_OPTION_KINDS = ['allow_once', 'allow_always', 'reject_once', 'reject_always'] as const;

export type AcpPermissionOptionKind = (typeof ACP_PERMISSION_OPTION_KINDS)[number];

export type PetPermissionTone = 'allow' | 'deny' | 'neutral';

export type PetPermissionShape = 'request' | 'confirmation';

export type PetPermissionOptionView = {
  optionId: string;
  label: string;
  kind?: string;
  tone: PetPermissionTone;
  params?: Record<string, string>;
};

export type PetPermissionBubble = {
  /** Matches `confirmation.remove` `id` (request: tool call id; confirmation: confirmation id). */
  id: string;
  conversationId: string;
  msgId: string;
  callId: string;
  title: string;
  description: string;
  shape: PetPermissionShape;
  options: PetPermissionOptionView[];
};

/** Payload the confirm window renders. Labels are already translated. */
export type PetPermissionConfirmView = {
  id: string;
  title: string;
  description: string;
  options: Array<{
    optionId: string;
    label: string;
    tone: PetPermissionTone;
  }>;
};

export type PetPermissionRequestAnswer = {
  shape: 'request';
  confirm_key: string;
  msg_id: string;
  conversation_id: string;
  call_id: string;
};

export type PetPermissionConfirmationAnswer = {
  shape: 'confirmation';
  conversation_id: string;
  msg_id: string;
  call_id: string;
  data: { value: string };
  always_allow: boolean;
};

export type PetPermissionAnswer = PetPermissionRequestAnswer | PetPermissionConfirmationAnswer;

const ALLOW_KINDS = new Set<string>(['allow_once', 'allow_always']);
const DENY_KINDS = new Set<string>(['reject_once', 'reject_always']);

/** Confirmation-shaped values the chat UI already classifies as allow or deny. */
const ALLOW_CONFIRMATION_VALUES = new Set<string>([
  'allow_once',
  'allow_always',
  'proceed_once',
  'proceed_always',
  'proceed_always_server',
  'proceed_always_tool',
]);
const DENY_CONFIRMATION_VALUES = new Set<string>(['reject_once', 'reject_always', 'cancel', 'deny']);

/** Colour an ACP option from its `kind`. Unknown kinds stay neutral. */
export function permissionOptionTone(kind: string | undefined): PetPermissionTone {
  if (kind && ALLOW_KINDS.has(kind)) return 'allow';
  if (kind && DENY_KINDS.has(kind)) return 'deny';
  return 'neutral';
}

export function petPermissionButtonClass(tone: PetPermissionTone): 'option-allow' | 'option-deny' | 'option-neutral' {
  if (tone === 'allow') return 'option-allow';
  if (tone === 'deny') return 'option-deny';
  return 'option-neutral';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = nonEmpty(record[key]);
    if (value) return value;
  }
  return undefined;
}

function readToolCall(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const toolCall = data.tool_call ?? data.toolCall;
  return isRecord(toolCall) ? toolCall : undefined;
}

function optionValue(value: unknown): string | undefined {
  if (typeof value === 'string') return nonEmpty(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function readParams(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const params: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') params[key] = entry;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function confirmationTone(value: string): PetPermissionTone {
  if (ALLOW_KINDS.has(value) || ALLOW_CONFIRMATION_VALUES.has(value)) return 'allow';
  if (DENY_KINDS.has(value) || DENY_CONFIRMATION_VALUES.has(value)) return 'deny';
  return 'neutral';
}

function parseRequestOptions(options: unknown): PetPermissionOptionView[] {
  if (!Array.isArray(options)) return [];
  const views: PetPermissionOptionView[] = [];
  options.forEach((option, index) => {
    if (!isRecord(option)) return;
    const optionId = readString(option, ['option_id', 'optionId']) ?? `option_${index}`;
    const label = readString(option, ['name', 'label']) ?? optionId;
    const kind = readString(option, ['kind']);
    views.push({
      optionId,
      label,
      ...(kind ? { kind } : {}),
      tone: permissionOptionTone(kind),
    });
  });
  return views;
}

function parseConfirmationOptions(options: unknown): PetPermissionOptionView[] {
  if (!Array.isArray(options)) return [];
  const views: PetPermissionOptionView[] = [];
  for (const option of options) {
    if (!isRecord(option)) continue;
    const optionId = optionValue(option.value);
    if (!optionId) continue;
    const label = nonEmpty(option.label) ?? optionId;
    const kind = ALLOW_KINDS.has(optionId) || DENY_KINDS.has(optionId) ? optionId : undefined;
    const params = readParams(option.params);
    views.push({
      optionId,
      label,
      ...(kind ? { kind } : {}),
      ...(params ? { params } : {}),
      tone: confirmationTone(optionId),
    });
  }
  return views;
}

function parseRequest(frame: Record<string, unknown>, data: Record<string, unknown>): PetPermissionBubble | null {
  const toolCall = readToolCall(data);
  if (!toolCall) return null;
  const options = parseRequestOptions(data.options);
  if (options.length === 0) return null;

  const callId = readString(toolCall, ['tool_call_id', 'toolCallId']) ?? readString(frame, ['msg_id', 'msgId']);
  const conversationId =
    readString(frame, ['conversation_id', 'conversationId']) ?? readString(data, ['session_id', 'sessionId']);
  const msgId = readString(frame, ['msg_id', 'msgId']) ?? callId;
  if (!callId || !conversationId || !msgId) return null;

  const title = readString(toolCall, ['title']) ?? readString(toolCall, ['kind']) ?? PET_PERMISSION_FALLBACK_TITLE_KEY;
  const rawInput = toolCall.raw_input ?? toolCall.rawInput;
  const description = isRecord(rawInput) ? (nonEmpty(rawInput.description) ?? '') : '';

  return {
    id: callId,
    conversationId,
    msgId,
    callId,
    title,
    description: description === title ? '' : description,
    shape: 'request',
    options,
  };
}

function parseConfirmation(frame: Record<string, unknown>, data: Record<string, unknown>): PetPermissionBubble | null {
  const options = parseConfirmationOptions(data.options);
  if (options.length === 0) return null;

  const callId = readString(data, ['call_id', 'callId']);
  const id = readString(data, ['id']) ?? callId;
  const conversationId =
    readString(frame, ['conversation_id', 'conversationId']) ?? readString(data, ['conversation_id']);
  const msgId = readString(frame, ['msg_id', 'msgId']) ?? id;
  if (!callId || !id || !conversationId || !msgId) return null;

  const title =
    readString(data, ['title']) ??
    readString(data, ['action']) ??
    readString(data, ['description']) ??
    PET_PERMISSION_FALLBACK_TITLE_KEY;
  const description = readString(data, ['description']) ?? '';

  return {
    id,
    conversationId,
    msgId,
    callId,
    title,
    description: description === title ? '' : description,
    shape: 'confirmation',
    options,
  };
}

/**
 * Parse one `message.stream` envelope whose `type` is `acp_permission` or
 * `permission`. Returns null when the frame is not a permission, or when it
 * has no answerable option.
 */
export function parsePetPermissionFrame(frame: unknown): PetPermissionBubble | null {
  if (!isRecord(frame)) return null;
  const type = frame.type;
  if (type !== 'acp_permission' && type !== 'permission') return null;
  if (!isRecord(frame.data)) return null;
  if (readToolCall(frame.data)) return parseRequest(frame, frame.data);
  return parseConfirmation(frame, frame.data);
}

/**
 * Body the main chat UI posts for this option.
 * Request shape → option id string (`confirmMessage`).
 * Confirmation shape → `{ value: optionId }` (`confirmation.confirm`).
 */
export function buildPetPermissionAnswer(bubble: PetPermissionBubble, optionId: string): PetPermissionAnswer | null {
  const option = bubble.options.find((item) => item.optionId === optionId);
  if (!option) return null;
  if (bubble.shape === 'request') {
    return {
      shape: 'request',
      confirm_key: option.optionId,
      msg_id: bubble.msgId,
      conversation_id: bubble.conversationId,
      call_id: bubble.callId,
    };
  }
  return {
    shape: 'confirmation',
    conversation_id: bubble.conversationId,
    msg_id: bubble.msgId,
    call_id: bubble.callId,
    data: { value: option.optionId },
    always_allow: option.optionId === 'proceed_always',
  };
}

export type PetPermissionClients = {
  confirmRequest: (answer: PetPermissionRequestAnswer) => Promise<void>;
  confirmConfirmation: (answer: PetPermissionConfirmationAnswer) => Promise<void>;
};

/** Send the chosen option through the chat UI's confirm endpoint. */
export async function answerPetPermission(
  bubble: PetPermissionBubble,
  optionId: string,
  clients: PetPermissionClients
): Promise<boolean> {
  const answer = buildPetPermissionAnswer(bubble, optionId);
  if (!answer) return false;
  if (answer.shape === 'request') {
    await clients.confirmRequest(answer);
    return true;
  }
  await clients.confirmConfirmation(answer);
  return true;
}

/**
 * Ids of pending bubbles closed by a `confirmation.remove` frame.
 * The backend sends the confirmation `id`, which for a request equals the
 * tool call id and for a confirmation is distinct from `call_id`.
 */
export function permissionIdsClosedByRemove(pending: readonly PetPermissionBubble[], event: unknown): string[] {
  if (!isRecord(event)) return [];
  const eventId = readString(event, ['id']);
  const eventCallId = readString(event, ['call_id', 'callId']);
  const conversationId = readString(event, ['conversation_id', 'conversationId']);
  if (!eventId && !eventCallId) return [];
  return pending
    .filter((bubble) => {
      if (conversationId && bubble.conversationId !== conversationId) return false;
      if (eventId && (bubble.id === eventId || bubble.callId === eventId)) return true;
      if (eventCallId && (bubble.callId === eventCallId || bubble.id === eventCallId)) return true;
      return false;
    })
    .map((bubble) => bubble.id);
}
