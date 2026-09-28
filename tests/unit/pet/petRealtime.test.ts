/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment node
 */

import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { conversation, cron, team } from '@/common/adapter/ipcBridge';
import { realtimeChannelOf, type RealtimeFrame } from '@/common/adapter/httpBridge';
import { PetEventBridge } from '@process/pet/petEventBridge';
import { startPetRealtimeClient, type PetRealtimeClient } from '@process/pet/petRealtime';
import type { PetIdleTicker } from '@process/pet/petIdleTicker';
import { PetStateMachine } from '@process/pet/petStateMachine';
import type { PetState } from '@process/pet/petTypes';

const openClients: PetRealtimeClient[] = [];
const openServers: WebSocketServer[] = [];

afterEach(() => {
  for (const client of openClients.splice(0)) client.close();
  for (const server of openServers.splice(0)) {
    for (const socket of server.clients) socket.terminate();
    server.close();
  }
});

type Fixture = {
  sm: PetStateMachine;
  bridge: PetEventBridge;
  server: WebSocketServer;
  send: (emitter: object, data: unknown) => Promise<RealtimeFrame>;
  sendEnvelope: (emitter: object, data: unknown) => Promise<RealtimeFrame>;
  sendRaw: (raw: string) => void;
  connectionCount: () => number;
  dropAndWaitForReconnect: () => Promise<void>;
};

function channelOf(emitter: object): string {
  const name = realtimeChannelOf(emitter);
  if (!name) throw new Error('realtime emitter is missing its channel name');
  return name;
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const sm = new PetStateMachine();
  const bridge = new PetEventBridge(sm, { resetIdle() {} } as PetIdleTicker);
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  openServers.push(server);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  const address = server.address() as AddressInfo;

  let connections = 0;
  let active: WebSocket | undefined;
  let pending: ((frame: RealtimeFrame) => void) | null = null;
  const firstConnection = new Promise<void>((resolve) => {
    server.on('connection', (socket) => {
      connections += 1;
      active = socket;
      if (connections === 1) resolve();
    });
  });

  const client = startPetRealtimeClient({
    bridge,
    url: `ws://127.0.0.1:${address.port}/ws`,
    onFrame(frame) {
      const resolve = pending;
      pending = null;
      resolve?.(frame);
    },
  });
  openClients.push(client);
  await firstConnection;

  const waitForFrame = (): Promise<RealtimeFrame> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a realtime frame')), 2000);
      pending = (frame) => {
        clearTimeout(timer);
        resolve(frame);
      };
    });

  const deliver = (body: unknown): Promise<RealtimeFrame> => {
    const socket = active;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('pet socket is not open');
    }
    const frame = waitForFrame();
    socket.send(JSON.stringify(body));
    return frame;
  };

  try {
    await run({
      sm,
      bridge,
      server,
      send: (emitter, data) => deliver({ name: channelOf(emitter), data }),
      sendEnvelope: (emitter, data) => deliver({ event: channelOf(emitter), payload: data }),
      sendRaw: (raw) => {
        const socket = active;
        if (!socket) throw new Error('pet socket is not open');
        socket.send(raw);
      },
      connectionCount: () => connections,
      dropAndWaitForReconnect: async () => {
        const previous = connections;
        active?.terminate();
        await vi.waitFor(
          () => {
            expect(connections).toBe(previous + 1);
            expect(active?.readyState).toBe(WebSocket.OPEN);
          },
          { timeout: 4000 }
        );
      },
    });
  } finally {
    client.close();
    bridge.dispose();
    sm.dispose();
  }
}

function stream(type: string, data: unknown = null, extra: Record<string, unknown> = {}) {
  return {
    type,
    data,
    msg_id: 'msg-1',
    conversation_id: 'conv-1',
    turn_id: 'turn-1',
    ...extra,
  };
}

function userMessage(extra: Record<string, unknown> = {}) {
  return {
    conversation_id: 'conv-1',
    msg_id: 'msg-user',
    content: 'hello',
    position: 'right' as const,
    status: 'finish' as const,
    hidden: false,
    created_at: 1_700_000_000_000,
    ...extra,
  };
}

function turnCompleted(extra: Record<string, unknown> = {}) {
  return {
    session_id: 'conv-1',
    turn_id: 'turn-1',
    status: 'finished' as const,
    state: 'ai_waiting_input' as const,
    detail: '',
    can_send_message: true,
    runtime: {
      state: 'idle' as const,
      can_send_message: true,
      has_task: false,
      is_processing: false,
      pending_confirmations: 0,
      turn_id: 'turn-1',
    },
    workspace: '/tmp/workspace',
    model: { platform: 'claude', name: 'Claude', use_model: 'claude' },
    last_message: { id: 'msg-1', type: 'text', content: 'done', status: 'finish', created_at: 1_700_000_000_001 },
    ...extra,
  };
}

function teamRun(status: 'running' | 'completed' | 'failed') {
  return {
    team_id: 'team-1',
    team_run_id: 'run-1',
    source: 'user_message' as const,
    has_user_intervention: false,
    target_slot_id: 'slot-1',
    target_role: 'lead' as const,
    status,
    queued_intent_count: 0,
    starting_batch_count: 0,
    running_batch_count: status === 'running' ? 1 : 0,
    active_enqueue_lease_count: 0,
    slot_work: [],
  };
}

function childTurn(status: 'running' | 'completed') {
  return {
    team_id: 'team-1',
    team_run_id: 'run-1',
    slot_id: 'slot-1',
    role: 'teammate' as const,
    conversation_id: 'conv-child',
    turn_id: 'turn-child',
    status,
  };
}

function toolGroup(status: string) {
  return stream('tool_group', [
    {
      call_id: 'call-1',
      description: 'list files',
      name: 'shell',
      render_output_as_markdown: false,
      status,
    },
  ]);
}

function acpTool(status: 'pending' | 'in_progress' | 'completed' | 'failed') {
  return stream('acp_tool_call', {
    session_id: 'conv-1',
    update: {
      sessionUpdate: status === 'pending' ? 'tool_call' : 'tool_call_update',
      tool_call_id: 'call-1',
      status,
      title: 'Read file',
      kind: 'read',
    },
  });
}

async function listen(servers: WebSocketServer[]): Promise<WebSocketServer> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  return server;
}

function portOf(server: WebSocketServer): number {
  return (server.address() as AddressInfo).port;
}

async function closeServer(server: WebSocketServer, servers: WebSocketServer[]): Promise<void> {
  const index = servers.indexOf(server);
  if (index >= 0) servers.splice(index, 1);
  if (server.address() === null) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function waitForOpenClient(server: WebSocketServer): Promise<WebSocket> {
  const openClient = (): WebSocket | undefined =>
    [...server.clients].find((socket) => socket.readyState === WebSocket.OPEN);
  await vi.waitFor(
    () => {
      expect(openClient()).toBeTruthy();
    },
    { timeout: 4000 }
  );
  const socket = openClient();
  if (!socket) throw new Error('pet socket disappeared');
  return socket;
}

function sendFrame(
  socket: WebSocket,
  readPending: () => ((frame: RealtimeFrame) => void) | null,
  writePending: (pending: ((frame: RealtimeFrame) => void) | null) => void,
  body: unknown
): Promise<RealtimeFrame> {
  const frame = new Promise<RealtimeFrame>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for a realtime frame')), 2000);
    writePending((next) => {
      clearTimeout(timer);
      resolve(next);
    });
    if (readPending() === null) {
      clearTimeout(timer);
      reject(new Error('frame waiter was replaced before the socket send'));
    }
  });
  socket.send(JSON.stringify(body));
  return frame;
}

async function expectState(sm: PetStateMachine, state: PetState): Promise<void> {
  await vi.waitFor(() => {
    expect(sm.getCurrentState()).toBe(state);
  });
}

describe('pet realtime socket', () => {
  describe('connection', () => {
    it('applies a stream frame sent on the channel the renderer bridge registers', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('thinking', { content: 'hmm', status: 'thinking' }));
        await expectState(sm, 'thinking');
      });
    });

    it('accepts the event/payload envelope the parser shares with the renderer', async () => {
      await withFixture(async ({ sm, sendEnvelope }) => {
        await sendEnvelope(
          conversation.responseStream,
          stream('thought', { subject: 'Looking', description: 'files' })
        );
        await expectState(sm, 'thinking');
      });
    });

    it('ignores a malformed frame and still applies the next one', async () => {
      await withFixture(async ({ sm, send, sendRaw }) => {
        sendRaw('not-json');
        await send(conversation.responseStream, stream('thinking', { content: 'hmm', status: 'thinking' }));
        await expectState(sm, 'thinking');
      });
    });

    it('answers server pings and does not treat them as activity', async () => {
      await withFixture(async ({ sm, server }) => {
        const socket = [...server.clients][0];
        const pong = new Promise<string>((resolve) => {
          socket.once('message', (data) => resolve(data.toString()));
        });
        socket.send(JSON.stringify({ name: 'ping', data: { timestamp: 1 } }));
        expect(JSON.parse(await pong).name).toBe('pong');
        expect(sm.getCurrentState()).toBe('idle');
      });
    });

    it('reconnects after the backend drops the socket', async () => {
      await withFixture(async ({ sm, send, dropAndWaitForReconnect, connectionCount }) => {
        await dropAndWaitForReconnect();
        expect(connectionCount()).toBe(2);
        await send(conversation.userCreated, userMessage());
        await expectState(sm, 'thinking');
      });
    });

    it('reacts again after the backend is replaced on a new port', async () => {
      const globals = globalThis as typeof globalThis & { __backendPort?: number };
      const previousPort = globals.__backendPort;
      const sm = new PetStateMachine();
      const bridge = new PetEventBridge(sm, { resetIdle() {} } as PetIdleTicker);
      const first = await listen(openServers);
      let replacement: WebSocketServer | undefined;
      const firstPort = portOf(first);
      globals.__backendPort = firstPort;
      let pending: ((frame: RealtimeFrame) => void) | null = null;
      const client = startPetRealtimeClient({
        bridge,
        onFrame(frame) {
          const resolve = pending;
          pending = null;
          resolve?.(frame);
        },
      });
      openClients.push(client);
      try {
        const socket = await waitForOpenClient(first);
        await sendFrame(
          socket,
          () => pending,
          (next) => {
            pending = next;
          },
          {
            name: channelOf(conversation.responseStream),
            data: stream('thinking', { content: 'hmm', status: 'thinking' }),
          }
        );
        await expectState(sm, 'thinking');

        for (const open of first.clients) open.terminate();
        await closeServer(first, openServers);
        replacement = await listen(openServers);
        const replacementPort = portOf(replacement);
        expect(replacementPort).not.toBe(firstPort);
        globals.__backendPort = replacementPort;

        const next = await waitForOpenClient(replacement);
        await sendFrame(
          next,
          () => pending,
          (nextPending) => {
            pending = nextPending;
          },
          { name: channelOf(conversation.responseStream), data: stream('text', { content: 'hello' }) }
        );
        await expectState(sm, 'working');
      } finally {
        if (previousPort === undefined) delete globals.__backendPort;
        else globals.__backendPort = previousPort;
        bridge.dispose();
        sm.dispose();
      }
    });

    it('moves to a new backend port while the old socket is still open', async () => {
      const globals = globalThis as typeof globalThis & { __backendPort?: number };
      const previousPort = globals.__backendPort;
      const sm = new PetStateMachine();
      const bridge = new PetEventBridge(sm, { resetIdle() {} } as PetIdleTicker);
      const first = await listen(openServers);
      const replacement = await listen(openServers);
      globals.__backendPort = portOf(first);
      let pending: ((frame: RealtimeFrame) => void) | null = null;
      const client = startPetRealtimeClient({
        bridge,
        onFrame(frame) {
          const resolve = pending;
          pending = null;
          resolve?.(frame);
        },
      });
      openClients.push(client);
      try {
        const socket = await waitForOpenClient(first);
        await sendFrame(
          socket,
          () => pending,
          (next) => {
            pending = next;
          },
          {
            name: channelOf(conversation.responseStream),
            data: stream('thinking', { content: 'hmm', status: 'thinking' }),
          }
        );
        await expectState(sm, 'thinking');

        expect(portOf(replacement)).not.toBe(portOf(first));
        globals.__backendPort = portOf(replacement);
        const next = await waitForOpenClient(replacement);
        expect(next.readyState).toBe(WebSocket.OPEN);
        await sendFrame(
          next,
          () => pending,
          (nextPending) => {
            pending = nextPending;
          },
          { name: channelOf(conversation.responseStream), data: stream('text', { content: 'hello' }) }
        );
        await expectState(sm, 'working');
      } finally {
        if (previousPort === undefined) delete globals.__backendPort;
        else globals.__backendPort = previousPort;
        bridge.dispose();
        sm.dispose();
      }
    });

    it('does not reconnect after the pet client is closed', async () => {
      const sm = new PetStateMachine();
      const bridge = new PetEventBridge(sm, { resetIdle() {} } as PetIdleTicker);
      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      openServers.push(server);
      await new Promise<void>((resolve) => server.once('listening', () => resolve()));
      const { port } = server.address() as AddressInfo;
      let connections = 0;
      const first = new Promise<void>((resolve) => {
        server.on('connection', () => {
          connections += 1;
          if (connections === 1) resolve();
        });
      });
      const client = startPetRealtimeClient({
        bridge,
        url: `ws://127.0.0.1:${port}/ws`,
      });
      await first;
      client.close();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(connections).toBe(1);
      bridge.dispose();
      sm.dispose();
    });
  });

  describe('user send and assistant text', () => {
    it('walks thinking, working, done, and idle across one turn', async () => {
      await withFixture(async ({ sm, send }) => {
        const seen: PetState[] = [];
        sm.onStateChange((state) => seen.push(state));

        await send(conversation.userCreated, userMessage());
        await send(conversation.responseStream, stream('content', { content: 'Hello' }));
        await send(conversation.responseStream, stream('finish', null));

        await vi.waitFor(
          () => {
            expect(seen).toEqual(['thinking', 'working', 'done', 'idle']);
          },
          { timeout: 6000 }
        );
      });
    });

    it('ignores a hidden user message', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.userCreated, userMessage({ hidden: true }));
        expect(sm.getCurrentState()).toBe('idle');
      });
    });

    it('treats stream start as thinking when the turn has no user bubble', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('start', null));
        await expectState(sm, 'thinking');
      });
    });

    it('treats text as working', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('text', 'partial'));
        await expectState(sm, 'working');
      });
    });

    it('does not treat a user_content echo as working', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('user_content', 'hello', { position: 'right' }));
        expect(sm.getCurrentState()).toBe('idle');
      });
    });
  });

  describe('tools and confirmation', () => {
    it('treats a pending acp tool call as working', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, acpTool('pending'));
        await expectState(sm, 'working');
      });
    });

    it('treats an in-progress acp tool call as working', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, acpTool('in_progress'));
        await expectState(sm, 'working');
      });
    });

    it('ignores a completed acp tool call', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, acpTool('completed'));
        expect(sm.getCurrentState()).toBe('idle');
      });
    });

    it('treats an executing tool group as working', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, toolGroup('Executing'));
        await expectState(sm, 'working');
      });
    });

    it('treats a pending tool group as working', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, toolGroup('Pending'));
        await expectState(sm, 'working');
      });
    });

    it('treats a confirming tool group as a notification', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, toolGroup('Confirming'));
        await expectState(sm, 'notification');
      });
    });

    it('treats stream permission requests as notifications', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('acp_permission', { session_id: 'conv-1' }));
        await expectState(sm, 'notification');
      });
    });

    it('treats a permission card as a notification', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(
          conversation.responseStream,
          stream('permission', { id: 'perm-1', description: 'Allow', call_id: 'call-1', options: [] })
        );
        await expectState(sm, 'notification');
      });
    });

    it('treats an ask card as a notification from idle', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(
          conversation.responseStream,
          stream('ask', { session_id: 'conv-1', request_id: 'ask-1', questions: [] })
        );
        await expectState(sm, 'notification');
      });
    });

    it('treats confirmation.add as a notification', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.confirmation.add, {
          id: 'confirm-1',
          conversation_id: 'conv-1',
          call_id: 'call-1',
          description: 'Allow command',
          title: 'Permission',
          options: [{ label: 'Allow', value: 'allow' }],
        });
        await expectState(sm, 'notification');
      });
    });
  });

  describe('turn end, errors, and cancel', () => {
    it('moves to done when turn.completed is finished', async () => {
      await withFixture(async ({ sm, bridge, send }) => {
        await send(conversation.turnCompleted, turnCompleted());
        await expectState(sm, 'done');
        expect(bridge.getActivityContext()).toEqual({ conversationId: 'conv-1', turnId: 'turn-1' });
      });
    });

    it('moves to done when turn.completed is waiting for input', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.turnCompleted, turnCompleted({ status: 'running', state: 'ai_waiting_input' }));
        await expectState(sm, 'done');
      });
    });

    it('moves to done from camelCase turn ids on a finished turn', async () => {
      await withFixture(async ({ sm, bridge, send }) => {
        await send(conversation.turnCompleted, {
          sessionId: 'conv-camel',
          turnId: 'turn-camel',
          status: 'finished',
          state: 'ai_waiting_input',
        });
        await expectState(sm, 'done');
        expect(bridge.getActivityContext()).toEqual({ conversationId: 'conv-camel', turnId: 'turn-camel' });
      });
    });

    it('ignores a turn.completed that is still running', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.turnCompleted, turnCompleted({ status: 'running', state: 'ai_generating' }));
        expect(sm.getCurrentState()).toBe('idle');
      });
    });

    it('moves to error on a stream error', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('error', { message: 'backend exploded' }));
        await expectState(sm, 'error');
      });
    });

    it('moves to error on an error tip and ignores an info tip', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('tips', { content: 'heads up', type: 'info' }));
        expect(sm.getCurrentState()).toBe('idle');
        await send(conversation.responseStream, stream('tips', { content: 'boom', type: 'error' }));
        await expectState(sm, 'error');
      });
    });

    it('moves to error when agent_status is error and ignores session warmup', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('agent_status', { backend: 'claude', status: 'connecting' }));
        expect(sm.getCurrentState()).toBe('idle');
        await send(conversation.responseStream, stream('agent_status', { backend: 'claude', status: 'error' }));
        await expectState(sm, 'error');
      });
    });

    it('moves to error when turn.completed reports an error, even if status is finished', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.turnCompleted, turnCompleted({ status: 'finished', state: 'error' }));
        await expectState(sm, 'error');
      });
    });

    it('treats a stopped turn as done and not as an error', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('text', 'partial'));
        await expectState(sm, 'working');
        await send(conversation.turnCompleted, turnCompleted({ status: 'finished', state: 'stopped' }));
        await expectState(sm, 'done');
      });
    });

    it('maps team run and child-turn start to working and completion to done', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(team.runStarted, teamRun('running'));
        await expectState(sm, 'working');
      });
    });

    it('maps a completed team run to done', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(team.runCompleted, teamRun('completed'));
        await expectState(sm, 'done');
      });
    });

    it('maps a started child turn to working and records its conversation', async () => {
      await withFixture(async ({ sm, bridge, send }) => {
        await send(team.childTurnStarted, childTurn('running'));
        await expectState(sm, 'working');
        expect(bridge.getActivityContext()).toEqual({ conversationId: 'conv-child', turnId: 'turn-child' });
      });
    });

    it('maps a completed child turn to done', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(team.childTurnCompleted, childTurn('completed'));
        await expectState(sm, 'done');
      });
    });

    it('maps a failed team run to error', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(team.runFailed, teamRun('failed'));
        await expectState(sm, 'error');
      });
    });

    it('maps a successful cron execution to done and ignores a skipped one', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(cron.onJobExecuted, { job_id: 'job-1', status: 'skipped' });
        expect(sm.getCurrentState()).toBe('idle');
        await send(cron.onJobExecuted, { job_id: 'job-1', status: 'ok' });
        await expectState(sm, 'done');
      });
    });
  });

  describe('stacked activity', () => {
    it('shows a live conversation ahead of a finished turn on the same socket', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('finish', null));
        await expectState(sm, 'done');

        await send(
          conversation.responseStream,
          stream('text', 'still going', { conversation_id: 'conv-2', turn_id: 'turn-2' })
        );
        await expectState(sm, 'working');

        await send(conversation.responseStream, stream('acp_permission', { session_id: 'conv-1' }));
        expect(sm.getCurrentState()).toBe('working');
      });
    });
  });

  describe('reconnect and delete', () => {
    it('leaves the pet idle when the socket drops mid-turn and reconnects', async () => {
      await withFixture(async ({ sm, send, dropAndWaitForReconnect }) => {
        await send(conversation.responseStream, stream('text', 'partial'));
        await expectState(sm, 'working');

        await dropAndWaitForReconnect();

        await expectState(sm, 'idle');
      });
    });

    it('clears a confirmation when the socket reconnects', async () => {
      await withFixture(async ({ sm, send, dropAndWaitForReconnect }) => {
        await send(
          conversation.responseStream,
          stream('text', 'partial', { conversation_id: 'conv-work', turn_id: 'turn-work' })
        );
        await send(
          conversation.responseStream,
          stream('ask', { questions: [] }, { conversation_id: 'conv-ask', turn_id: 'turn-ask' })
        );
        await expectState(sm, 'notification');

        await dropAndWaitForReconnect();

        await expectState(sm, 'idle');
      });
    });

    it('does not clear activity on the first connect', async () => {
      const sm = new PetStateMachine();
      const bridge = new PetEventBridge(sm, { resetIdle() {} } as PetIdleTicker);
      bridge.handleRealtimeEvent(channelOf(conversation.responseStream), stream('text', 'partial'));
      expect(sm.getCurrentState()).toBe('working');

      const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
      openServers.push(server);
      await new Promise<void>((resolve) => {
        server.once('listening', () => resolve());
      });
      const { port } = server.address() as AddressInfo;
      const opened = new Promise<void>((resolve) => {
        server.once('connection', () => resolve());
      });
      const client = startPetRealtimeClient({
        bridge,
        url: `ws://127.0.0.1:${port}/ws`,
      });
      openClients.push(client);
      try {
        await opened;
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(sm.getCurrentState()).toBe('working');
      } finally {
        client.close();
        bridge.dispose();
        sm.dispose();
      }
    });

    it('falls back to the next conversation when a working one is deleted', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(
          conversation.responseStream,
          stream('finish', null, { conversation_id: 'conv-done', turn_id: 'turn-done' })
        );
        await send(
          conversation.responseStream,
          stream('text', 'partial', { conversation_id: 'conv-work', turn_id: 'turn-work' })
        );
        await expectState(sm, 'working');

        await send(conversation.listChanged, { conversation_id: 'conv-work', action: 'deleted' });

        await expectState(sm, 'done');
      });
    });

    it('returns to idle when the deleted conversation was the only one', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('text', 'partial'));
        await expectState(sm, 'working');

        await send(conversation.listChanged, { conversation_id: 'conv-1', action: 'deleted' });

        await expectState(sm, 'idle');
      });
    });

    it('ignores a conversation list update that is not a deletion', async () => {
      await withFixture(async ({ sm, send }) => {
        await send(conversation.responseStream, stream('text', 'partial'));
        await expectState(sm, 'working');

        await send(conversation.listChanged, { conversation_id: 'conv-1', action: 'updated' });

        expect(sm.getCurrentState()).toBe('working');
      });
    });
  });
});
