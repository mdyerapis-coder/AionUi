/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { REALTIME_CHANNELS } from '@/common/adapter/constant';
import {
  PET_PERMISSION_FALLBACK_TITLE_KEY,
  answerPetPermission,
  parsePetPermissionFrame,
  permissionOptionTone,
  petPermissionButtonClass,
  type PetPermissionBubble,
} from '@/common/chat/petPermission';
import { PetEventBridge } from '@process/pet/petEventBridge';
import type { PetIdleTicker } from '@process/pet/petIdleTicker';
import { PetStateMachine } from '@process/pet/petStateMachine';

function requestFrame(toolCall: Record<string, unknown> = {}, options?: unknown): Record<string, unknown> {
  return {
    type: 'acp_permission',
    conversation_id: 'conv-1',
    msg_id: 'msg-1',
    turn_id: 'turn-1',
    data: {
      session_id: 'conv-1',
      tool_call: {
        tool_call_id: 'tool-1',
        title: 'Write notes.txt',
        kind: 'edit',
        raw_input: { description: 'Write a note' },
        ...toolCall,
      },
      options: options ?? [
        { option_id: 'allow-once', name: 'Allow once', kind: 'allow_once' },
        { option_id: 'allow-always', name: 'Allow always', kind: 'allow_always' },
        { option_id: 'reject-once', name: 'Reject', kind: 'reject_once' },
        { option_id: 'reject-always', name: 'Reject always', kind: 'reject_always' },
      ],
    },
  };
}

function confirmationFrame(type: 'acp_permission' | 'permission' = 'acp_permission'): Record<string, unknown> {
  return {
    type,
    conversation_id: 'conv-1',
    msg_id: 'msg-2',
    data: {
      id: 'conf-1',
      call_id: 'call-9',
      title: 'edit wants to use: Write',
      action: 'Write',
      description: 'Write file /tmp/test.txt',
      options: [
        { label: 'messages.confirmation.yesAllowOnce', value: 'proceed_once' },
        { label: 'messages.confirmation.yesAllowAlways', value: 'proceed_always' },
        { label: 'messages.confirmation.no', value: 'cancel' },
      ],
    },
  };
}

const openMachines: PetStateMachine[] = [];
const openBridges: PetEventBridge[] = [];

afterEach(() => {
  for (const bridge of openBridges.splice(0)) bridge.dispose();
  for (const machine of openMachines.splice(0)) machine.dispose();
});

function openBridge(): {
  sm: PetStateMachine;
  bridge: PetEventBridge;
  onOpen: ReturnType<typeof vi.fn<(bubble: PetPermissionBubble) => void>>;
  onClose: ReturnType<typeof vi.fn<(ids: string[]) => void>>;
} {
  const sm = new PetStateMachine();
  const bridge = new PetEventBridge(sm, { resetIdle() {} } as PetIdleTicker);
  openMachines.push(sm);
  openBridges.push(bridge);
  const onOpen = vi.fn<(bubble: PetPermissionBubble) => void>();
  const onClose = vi.fn<(ids: string[]) => void>();
  bridge.setPermissionHooks({ onOpen, onClose });
  return { sm, bridge, onOpen, onClose };
}

describe('ACP request payload', () => {
  it('uses tool_call.title as the bubble title', () => {
    const bubble = parsePetPermissionFrame(requestFrame());
    expect(bubble?.title).toBe('Write notes.txt');
    expect(bubble?.shape).toBe('request');
    expect(bubble?.callId).toBe('tool-1');
  });

  it('falls back to the tool call kind when the title is missing', () => {
    const bubble = parsePetPermissionFrame(requestFrame({ title: undefined }));
    expect(bubble?.title).toBe('edit');
  });

  it('uses the generic permission label when title and kind are both missing', () => {
    const bubble = parsePetPermissionFrame(requestFrame({ title: '  ', kind: '' }));
    expect(bubble?.title).toBe(PET_PERMISSION_FALLBACK_TITLE_KEY);
  });

  it('colours each button from the option kind the ACP types define', () => {
    const bubble = parsePetPermissionFrame(requestFrame());
    expect(bubble?.options.map((option) => [option.kind, option.tone, petPermissionButtonClass(option.tone)])).toEqual([
      ['allow_once', 'allow', 'option-allow'],
      ['allow_always', 'allow', 'option-allow'],
      ['reject_once', 'deny', 'option-deny'],
      ['reject_always', 'deny', 'option-deny'],
    ]);
  });

  it('leaves an unknown option kind neutral', () => {
    expect(permissionOptionTone('ask')).toBe('neutral');
    expect(petPermissionButtonClass('neutral')).toBe('option-neutral');
    const bubble = parsePetPermissionFrame(requestFrame({}, [{ option_id: 'custom', name: 'Custom', kind: 'ask' }]));
    expect(bubble?.options[0]?.tone).toBe('neutral');
  });

  it('ignores a request that has no answerable option', () => {
    expect(parsePetPermissionFrame(requestFrame({}, []))).toBeNull();
    expect(parsePetPermissionFrame({ type: 'acp_permission', data: null })).toBeNull();
  });

  it('reads a camelCase ACP request the same way as the snake_case wire', () => {
    const bubble = parsePetPermissionFrame({
      type: 'acp_permission',
      conversationId: 'conv-camel',
      msgId: 'msg-camel',
      data: {
        sessionId: 'conv-camel',
        toolCall: { toolCallId: 'tool-camel', title: 'Fetch docs', kind: 'read' },
        options: [{ optionId: 'allow-1', name: 'Allow once', kind: 'allow_once' }],
      },
    });
    expect(bubble?.callId).toBe('tool-camel');
    expect(bubble?.options[0]?.optionId).toBe('allow-1');
  });

  it('sends the chosen option id through the ACP confirm path', async () => {
    const bubble = parsePetPermissionFrame(requestFrame());
    if (!bubble) throw new Error('expected a bubble');
    const confirmRequest = vi.fn().mockResolvedValue(undefined);
    const confirmConfirmation = vi.fn().mockResolvedValue(undefined);

    const sent = await answerPetPermission(bubble, 'reject-once', { confirmRequest, confirmConfirmation });

    expect(sent).toBe(true);
    expect(confirmRequest).toHaveBeenCalledWith({
      shape: 'request',
      confirm_key: 'reject-once',
      msg_id: 'msg-1',
      conversation_id: 'conv-1',
      call_id: 'tool-1',
    });
    expect(confirmConfirmation).not.toHaveBeenCalled();
  });

  it('does not send an option id that was not offered', async () => {
    const bubble = parsePetPermissionFrame(requestFrame());
    if (!bubble) throw new Error('expected a bubble');
    const confirmRequest = vi.fn().mockResolvedValue(undefined);

    const sent = await answerPetPermission(bubble, 'missing', {
      confirmRequest,
      confirmConfirmation: vi.fn(),
    });

    expect(sent).toBe(false);
    expect(confirmRequest).not.toHaveBeenCalled();
  });
});

describe('confirmation payload', () => {
  it('reads the aionrs confirmation shape carried on acp_permission', () => {
    const bubble = parsePetPermissionFrame(confirmationFrame());
    expect(bubble?.shape).toBe('confirmation');
    expect(bubble?.id).toBe('conf-1');
    expect(bubble?.callId).toBe('call-9');
    expect(bubble?.title).toBe('edit wants to use: Write');
    expect(bubble?.options.map((option) => option.optionId)).toEqual(['proceed_once', 'proceed_always', 'cancel']);
  });

  it('reads the older permission frame as the same confirmation shape', () => {
    const bubble = parsePetPermissionFrame(confirmationFrame('permission'));
    expect(bubble?.shape).toBe('confirmation');
    expect(bubble?.callId).toBe('call-9');
  });

  it('colours allow-like confirmation values as allow and reject-like values as deny', () => {
    const bubble = parsePetPermissionFrame(confirmationFrame());
    expect(
      bubble?.options.map((option) => [option.optionId, option.tone, petPermissionButtonClass(option.tone)])
    ).toEqual([
      ['proceed_once', 'allow', 'option-allow'],
      ['proceed_always', 'allow', 'option-allow'],
      ['cancel', 'deny', 'option-deny'],
    ]);
  });

  it('sends the confirmation option id as { value } and marks proceed_always', async () => {
    const bubble = parsePetPermissionFrame(confirmationFrame());
    if (!bubble) throw new Error('expected a bubble');
    const confirmConfirmation = vi.fn().mockResolvedValue(undefined);
    const confirmRequest = vi.fn().mockResolvedValue(undefined);

    await answerPetPermission(bubble, 'proceed_always', { confirmRequest, confirmConfirmation });

    expect(confirmRequest).not.toHaveBeenCalled();
    expect(confirmConfirmation).toHaveBeenCalledWith({
      shape: 'confirmation',
      conversation_id: 'conv-1',
      msg_id: 'msg-2',
      call_id: 'call-9',
      data: { value: 'proceed_always' },
      always_allow: true,
    });
  });

  it('does not mark a one-time confirmation as always allow', async () => {
    const bubble = parsePetPermissionFrame(confirmationFrame());
    if (!bubble) throw new Error('expected a bubble');
    const confirmConfirmation = vi.fn().mockResolvedValue(undefined);

    await answerPetPermission(bubble, 'proceed_once', {
      confirmRequest: vi.fn(),
      confirmConfirmation,
    });

    expect(confirmConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ always_allow: false, data: { value: 'proceed_once' } })
    );
  });

  it('ignores a confirmation that has no call id', () => {
    const frame = confirmationFrame();
    const data = frame.data as Record<string, unknown>;
    delete data.call_id;
    expect(parsePetPermissionFrame(frame)).toBeNull();
  });
});

describe('bubble lifetime', () => {
  it('opens the bubble and moves the pet to notification while the request is pending', () => {
    const { sm, bridge, onOpen } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, requestFrame());
    expect(onOpen.mock.calls[0]?.[0].title).toBe('Write notes.txt');
    expect(sm.getCurrentState()).toBe('notification');
    expect(bridge.getPendingPermissions()).toHaveLength(1);
  });

  it('does not open a bubble for confirmation.add or an empty permission', () => {
    const { bridge, onOpen } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.confirmationAdd, {
      id: 'confirm-1',
      conversation_id: 'conv-1',
      call_id: 'call-1',
      description: 'Allow command',
      options: [{ label: 'Allow', value: 'allow' }],
    });
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, requestFrame({}, []));
    expect(onOpen).not.toHaveBeenCalled();
    expect(bridge.getPendingPermissions()).toEqual([]);
  });

  it('closes the bubble when the same request is answered elsewhere', () => {
    const { bridge, onClose } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, requestFrame());
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.confirmationRemove, {
      conversation_id: 'conv-1',
      id: 'tool-1',
    });
    expect(onClose).toHaveBeenCalledWith(['tool-1']);
    expect(bridge.getPendingPermissions()).toEqual([]);
  });

  it('closes a confirmation-shaped bubble by its confirmation id', () => {
    const { bridge, onClose } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, confirmationFrame());
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.confirmationRemove, {
      conversation_id: 'conv-1',
      id: 'conf-1',
    });
    expect(onClose).toHaveBeenCalledWith(['conf-1']);
  });

  it('keeps the bubble when a different conversation answers a permission', () => {
    const { bridge, onClose } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, requestFrame());
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.confirmationRemove, {
      conversation_id: 'conv-other',
      id: 'tool-1',
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(bridge.getPendingPermissions()).toHaveLength(1);
  });

  it('closes the bubble when the turn finishes', () => {
    const { bridge, onClose } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, requestFrame());
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, {
      type: 'finish',
      data: {},
      conversation_id: 'conv-1',
      msg_id: 'msg-1',
    });
    expect(onClose).toHaveBeenCalledWith(['tool-1']);
    expect(bridge.getPendingPermissions()).toEqual([]);
  });

  it('closes the bubble when the turn is cancelled', () => {
    const { bridge, onClose } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, requestFrame());
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.turnCompleted, {
      session_id: 'conv-1',
      turn_id: 'turn-1',
      status: 'finished',
      state: 'stopped',
    });
    expect(onClose).toHaveBeenCalledWith(['tool-1']);
    expect(bridge.getPendingPermissions()).toEqual([]);
  });

  it('does not close a bubble when a different conversation finishes', () => {
    const { bridge, onClose } = openBridge();
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.messageStream, requestFrame());
    bridge.handleRealtimeEvent(REALTIME_CHANNELS.turnCompleted, {
      session_id: 'conv-other',
      turn_id: 'turn-other',
      status: 'finished',
      state: 'ai_waiting_input',
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(bridge.getPendingPermissions()).toHaveLength(1);
  });
});
