/**
 * Pet reactions to an agent run.
 *
 * Frames are published on the backend WebSocket the app is connected to
 * (`/ws`), in the shapes aioncore sends: `{ name, data }` and `{ event, payload }`.
 * Hermes, Claude Code, and Codex share ACP `message.stream`. The pet main
 * process does not subscribe to that socket today, so a reaction that should
 * leave idle is `test.fail()`. Assertions that correctly stay idle are real
 * passes: marking them failing would go red for the wrong reason.
 *
 * A follow-up will teach the pet a failed tool stays working, a cancelled
 * team turn returns to idle, a cron error, a disconnect during a running
 * turn, and a stop after `cancelling`. Those are `test.fail()` too. Staying
 * idle for cron `skipped` / `missed`, a disconnect while idle, and team
 * mailbox or task changes is already correct, so those stay real passes.
 *
 * Claude's AskUserQuestion is its own `ask` frame (`message.stream` type
 * `ask`), not `acp_permission`. `acp_permission` data is untagged and arrives
 * as either a request (`tool_call` plus `options`) or a converted confirmation
 * (`id`, `call_id`, no `tool_call`). Both, and an `ask` mid-turn, must show
 * needs-confirmation. Upstream v2.2.2 no longer sends `confirmation.add`, so
 * nothing new depends on that channel.
 *
 * A dropped `/ws` in the middle of a turn loses the terminal frame. After
 * reconnect the pet must leave `working` for idle within a few seconds.
 * Deleting that conversation (`conversation.listChanged`, `action: 'deleted'`)
 * must drop its state and show the other live conversation, or idle when it
 * was the only one. Both are `test.fail()` until the pet is on `/ws` and
 * those resets exist.
 *
 * Nothing here calls the state machine or `bridge.emit`.
 */
import { test, expect, type ElectronApplication } from '../fixtures';
import { invokeBridge } from '../helpers';
import {
  clickPet,
  dropBackendSockets,
  enablePet,
  invokeContextItem,
  petSnapshot,
  publishWsFrame,
  readPetAppearance,
  resetPet,
} from './helpers';

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page, electronApp }) => {
  await resetPet(page, electronApp);
});

test.afterAll(async ({ page, electronApp }) => {
  await resetPet(page, electronApp).catch(() => undefined);
});

const idle = { state: 'idle', rendered: 'idle' };

/** pet does not subscribe to backend /ws yet */
const NOT_SUBSCRIBED = 'pet does not subscribe to backend /ws yet';

async function expectAppearance(
  electronApp: ElectronApplication,
  appearance: { state: string; rendered: string },
  timeout = 2_000
): Promise<void> {
  await expect.poll(async () => readPetAppearance(electronApp), { timeout }).toEqual(appearance);
}

/** Idle, and the pet never showed done or error on the way there. */
async function expectSettledIdle(electronApp: ElectronApplication, timeout = 2_000): Promise<void> {
  let sawDone = false;
  let sawError = false;
  await expect
    .poll(
      async () => {
        const appearance = await readPetAppearance(electronApp);
        if (appearance.state === 'done' || appearance.rendered === 'done') sawDone = true;
        if (appearance.state === 'error' || appearance.rendered === 'error') sawError = true;
        return {
          sawIdle: appearance.state === 'idle' && appearance.rendered === 'idle',
          sawDone,
          sawError,
        };
      },
      { timeout }
    )
    .toEqual({ sawIdle: true, sawDone: false, sawError: false });
}

type Envelope = 'name' | 'event';

async function publish(
  electronApp: ElectronApplication,
  channel: string,
  data: unknown,
  envelope: Envelope = 'name'
): Promise<void> {
  if (envelope === 'event') {
    await publishWsFrame(electronApp, { event: channel, payload: data });
    return;
  }
  await publishWsFrame(electronApp, { name: channel, data });
}

function stream(
  type: string,
  options?: { conversationId?: string; turnId?: string; msgId?: string; data?: unknown }
): Record<string, unknown> {
  return {
    type,
    conversation_id: options?.conversationId ?? 'e2e-pet',
    msg_id: options?.msgId ?? `e2e-${type}-${options?.turnId ?? 'turn-1'}`,
    turn_id: options?.turnId ?? 'turn-1',
    data: options?.data ?? {},
  };
}

function userCreated(hidden: boolean): Record<string, unknown> {
  return {
    conversation_id: 'e2e-pet',
    msg_id: hidden ? 'e2e-user-hidden' : 'e2e-user',
    content: 'hello',
    position: 'right',
    status: 'finish',
    hidden,
    created_at: Date.now(),
  };
}

function turnCompleted(state: string, turnId: string, conversationId = 'e2e-pet'): Record<string, unknown> {
  return {
    conversation_id: conversationId,
    session_id: conversationId,
    turn_id: turnId,
    status: 'finished',
    state,
  };
}

const toolCall = stream('acp_tool_call', {
  data: {
    update: {
      sessionUpdate: 'tool_call',
      status: 'in_progress',
      toolCallId: 'call-1',
      title: 'Read file',
    },
  },
});

const toolGroup = stream('tool_group', {
  data: [
    {
      call_id: 'call-1',
      description: 'list files',
      name: 'shell',
      render_output_as_markdown: false,
      status: 'Executing',
    },
  ],
});

const permission = stream('acp_permission', {
  data: {
    session_id: 'e2e-pet',
    options: [{ option_id: 'allow', name: 'Allow', kind: 'allow_once' }],
    tool_call: { tool_call_id: 'call-1', title: 'Run command', status: 'pending' },
  },
});

/** Request shape from `AcpPermissionRequestData`. `title` is optional. */
const permissionRequest = stream('acp_permission', {
  data: {
    session_id: 'e2e-pet',
    tool_call: {
      tool_call_id: 'call-request',
      title: 'Run tests',
      kind: 'execute',
      raw_input: { command: 'bun test' },
    },
    options: [
      { option_id: 'allow-once', name: 'Allow once', kind: 'allow_once' },
      { option_id: 'allow-always', name: 'Allow always', kind: 'allow_always' },
      { option_id: 'reject-once', name: 'Reject once', kind: 'reject_once' },
      { option_id: 'reject-always', name: 'Reject always', kind: 'reject_always' },
    ],
  },
});

/** Converted `Confirmation`. No `tool_call`. Options are `{ label, value }`. */
const permissionConfirmation = stream('acp_permission', {
  data: {
    id: 'conf-request',
    call_id: 'call-request',
    title: 'Run tests',
    description: 'Allow bun test?',
    command_type: 'execute',
    options: [
      { label: 'Allow once', value: 'allow-once' },
      { label: 'Reject once', value: 'reject-once' },
    ],
  },
});

/** Claude AskUserQuestion. Wire tag `ask`, not `acp_permission`. */
const askQuestion = stream('ask', {
  turnId: 'turn-ask',
  data: {
    session_id: 'e2e-pet',
    request_id: 'req-ask-1',
    questions: [
      {
        question: 'Which file should I edit?',
        header: 'File',
        multi_select: false,
        options: [{ label: 'a.ts', description: 'the module' }, { label: 'b.ts' }],
      },
    ],
  },
});

const confirmation = {
  id: 'conf-1',
  call_id: 'call-1',
  conversation_id: 'e2e-pet',
  description: 'Allow this command?',
  options: [{ label: 'Allow', value: 'allow' }],
};

function teamRun(status: 'running' | 'cancelled'): Record<string, unknown> {
  return {
    team_id: 'team-1',
    team_run_id: 'run-1',
    source: 'user_message',
    has_user_intervention: false,
    target_slot_id: 'slot-1',
    target_role: 'lead',
    status,
    queued_intent_count: 0,
    starting_batch_count: 0,
    running_batch_count: status === 'running' ? 1 : 0,
    active_enqueue_lease_count: 0,
    slot_work: [],
  };
}

function childTurn(status: 'running' | 'cancelled'): Record<string, unknown> {
  return {
    team_id: 'team-1',
    team_run_id: 'run-1',
    slot_id: 'slot-1',
    role: 'teammate',
    conversation_id: 'e2e-pet',
    turn_id: 'turn-child',
    status,
  };
}

test.describe('pet agent reactions', () => {
  test('a new pet starts idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await expectAppearance(electronApp, idle);
  });

  test('an install-progress event leaves the pet idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'runtime.statusChanged', {
      resource: 'node',
      scope: { kind: 'app', id: 'e2e' },
      phase: 'installing',
    });
    await expectAppearance(electronApp, idle, 800);
  });

  test('a hidden user message leaves the pet idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.userCreated', userCreated(true));
    // Stays idle today because nothing is listening. After the pet subscribes,
    // hidden userCreated is still not a user send.
    await expectAppearance(electronApp, idle, 800);
  });

  test('shows thinking when the user sends a message', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // { event, payload } so a client that only reads `name` / `data` still fails.
    await publish(electronApp, 'message.userCreated', userCreated(false), 'event');
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'thinking', rendered: 'thinking' });
  });

  test('shows thinking while the agent is thinking', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', stream('thinking', { data: { content: 'hmm', status: 'thinking' } }));
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'thinking', rendered: 'thinking' });
  });

  test('shows working while the agent is streaming text', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', stream('text', { data: { content: 'partial answer' } }));
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('shows working during an acp tool call', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', toolCall);
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('shows working during a tool group', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', toolGroup, 'event');
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('shows the needs-confirmation state for an acp permission', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', permission);
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'notification', rendered: 'notification' });
  });

  test('an ask frame mid-turn shows the needs-confirmation state', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'message.stream',
      stream('thinking', { turnId: 'turn-ask', data: { content: 'need a choice', status: 'thinking' } })
    );
    // pet does not subscribe to backend /ws yet. After it does, Claude's
    // AskUserQuestion arrives as message.stream type `ask`, not acp_permission,
    // and a question during a running turn must show needs-confirmation.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'thinking', rendered: 'thinking' });
    await publish(electronApp, 'message.stream', askQuestion);
    await expectAppearance(electronApp, { state: 'notification', rendered: 'notification' });
  });

  test('shows the needs-confirmation state for an acp permission request', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', permissionRequest);
    // pet does not subscribe to backend /ws yet. After it does, the request
    // shape (tool_call with kind and raw_input, options with option_id) must
    // show needs-confirmation. title on tool_call is optional.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'notification', rendered: 'notification' });
  });

  test('shows the needs-confirmation state for an acp permission converted to a confirmation', async ({
    page,
    electronApp,
  }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', permissionConfirmation, 'event');
    // pet does not subscribe to backend /ws yet. After it does, the converted
    // confirmation shape (id, call_id, title, description, command_type,
    // options as label/value, and no tool_call) must show needs-confirmation.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'notification', rendered: 'notification' });
  });

  test('shows the needs-confirmation state for confirmation.add', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'confirmation.add', confirmation, 'event');
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'notification', rendered: 'notification' });
  });

  test('opens the confirm bubble when a tool needs confirmation', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', permission);
    // pet does not subscribe to backend /ws yet. showConfirmation is also never
    // called, so the bubble stays closed after the socket lands until that path runs.
    test.fail(true, NOT_SUBSCRIBED);
    await expect
      .poll(
        async () => {
          const snap = await petSnapshot(electronApp);
          return snap.windows.some((win) => win.role === 'confirm' && win.visible);
        },
        { timeout: 2_000 }
      )
      .toBe(true);
  });

  test('shows done when the agent finishes the turn', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', stream('finish'));
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'done', rendered: 'done' });
  });

  test('shows done when the turn completes', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'turn.completed', turnCompleted('ai_waiting_input', 'turn-1'));
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'done', rendered: 'done' });
  });

  test('shows error when the agent stream reports an error', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', stream('error', { data: { message: 'boom' } }), 'event');
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'error', rendered: 'error' });
  });

  test('a stopped turn is not an error', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'turn.completed', turnCompleted('stopped', 'turn-stopped'), 'event');
    // Idle today. After the pet subscribes, stopped must resolve to idle or done, never error.
    await expect
      .poll(
        async () => {
          const appearance = await readPetAppearance(electronApp);
          if (appearance.state === 'error' || appearance.rendered === 'error') return 'error';
          if (
            (appearance.state === 'idle' || appearance.state === 'done') &&
            (appearance.rendered === 'idle' || appearance.rendered === 'done')
          ) {
            return 'settled';
          }
          return appearance.state;
        },
        { timeout: 800 }
      )
      .toBe('settled');
  });

  test('shows new activity on another turn right after done', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', stream('finish', { turnId: 'turn-done' }));
    await publish(
      electronApp,
      'message.stream',
      stream('content', { conversationId: 'conv-next', turnId: 'turn-next', data: { content: 'still going' } })
    );
    // pet does not subscribe to backend /ws yet. After it does, done (priority 5, held 3500ms)
    // still swallows a following working state until that hold ends.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('a repeated done refreshes its timer', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', stream('finish', { turnId: 'turn-done-1' }));
    await new Promise((resolve) => setTimeout(resolve, 150));
    const mark = Date.now();
    await publish(electronApp, 'message.stream', stream('finish', { turnId: 'turn-done-2' }));
    // pet does not subscribe to backend /ws yet. requestState also ignores a repeat
    // of the current state, so changedAt will stay put until a repeat refreshes it.
    test.fail(true, NOT_SUBSCRIBED);
    await expect
      .poll(
        async () => {
          const snap = await petSnapshot(electronApp);
          return {
            state: snap.state,
            rendered: snap.renderedState,
            refreshed: snap.stateChangedAt !== null && snap.stateChangedAt >= mark,
          };
        },
        { timeout: 2_000 }
      )
      .toEqual({ state: 'done', rendered: 'done', refreshed: true });
  });

  test('ignores Codex tool frames that arrive after that turn finished', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    const turnId = 'turn-codex';
    await publish(electronApp, 'message.stream', stream('finish', { turnId }));
    // pet does not subscribe to backend /ws yet. The tool frame is sent only after
    // done has returned to idle: during done, working loses on priority, so a frame
    // published in that window cannot prove it was ignored.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'done', rendered: 'done' });
    await expectAppearance(electronApp, idle, 6_000);
    await publish(electronApp, 'message.stream', {
      ...toolCall,
      turn_id: turnId,
      msg_id: 'e2e-codex-tool',
    });
    await expectAppearance(electronApp, idle, 1_000);
  });

  test('shows the most urgent state across two conversations', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // Order is needs-confirmation, then error, then working, then done.
    // A later done must not replace a confirmation that is still current.
    // The state machine today ranks error above notification, so this stays wrong
    // after the socket lands until that order is what the pet uses.
    await publish(electronApp, 'message.stream', stream('finish', { conversationId: 'conv-a', turnId: 'turn-a-done' }));
    await publish(
      electronApp,
      'message.stream',
      stream('text', { conversationId: 'conv-b', turnId: 'turn-b-text', data: { content: 'working' } })
    );
    await publish(
      electronApp,
      'message.stream',
      stream('error', { conversationId: 'conv-a', turnId: 'turn-a-error', data: { message: 'boom' } })
    );
    await publish(electronApp, 'message.stream', {
      ...permission,
      conversation_id: 'conv-b',
      turn_id: 'turn-b-permission',
      msg_id: 'e2e-permission-b',
    });
    await publish(electronApp, 'turn.completed', turnCompleted('ai_waiting_input', 'turn-a-done-again', 'conv-a'));
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'notification', rendered: 'notification' });
  });

  test('reconnects after the backend socket drops and still reacts', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'message.stream',
      stream('thinking', { turnId: 'turn-before', data: { content: 'before', status: 'thinking' } })
    );
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'thinking', rendered: 'thinking' });
    await dropBackendSockets(electronApp);
    // Renderer reconnect backoff starts at 1s. The pet client has to be back before this publish.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await publish(
      electronApp,
      'message.stream',
      stream('text', { turnId: 'turn-after', data: { content: 'after the restart' } })
    );
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('a dropped socket mid-turn does not leave the pet stuck working', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'message.stream',
      stream('text', { turnId: 'turn-drop', data: { content: 'partial reply' } })
    );
    // pet does not subscribe to backend /ws yet. After it does, the finish
    // frame is not sent: the drop ate it. Reconnect must leave working for
    // idle within this wait, not stay stuck.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
    await dropBackendSockets(electronApp);
    await expectAppearance(electronApp, idle, 5_000);
  });

  test('deleting a working conversation shows the other live conversation', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'message.stream',
      stream('finish', { conversationId: 'conv-done', turnId: 'turn-done' })
    );
    await publish(
      electronApp,
      'message.stream',
      stream('text', { conversationId: 'conv-work', turnId: 'turn-work', data: { content: 'partial reply' } })
    );
    // pet does not subscribe to backend /ws yet. After it does, deleting
    // conv-work must clear that conversation and show conv-done. With only
    // one conversation, the same delete returns to idle.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
    await publish(electronApp, 'conversation.listChanged', {
      conversation_id: 'conv-work',
      action: 'deleted',
    });
    await expectAppearance(electronApp, { state: 'done', rendered: 'done' });
  });

  test('a failed acp tool call stays working and is not an error', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'message.stream', toolCall);
    // pet does not subscribe to backend /ws yet. A later status `failed` must
    // keep the working animation. It must not become error.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
    await publish(electronApp, 'message.stream', {
      ...toolCall,
      msg_id: 'e2e-acp-tool-failed',
      data: {
        update: {
          sessionUpdate: 'tool_call_update',
          status: 'failed',
          toolCallId: 'call-1',
          title: 'Read file',
        },
      },
    });
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('a cancelled team run returns that conversation to idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'team.runStarted', teamRun('running'), 'event');
    // pet does not subscribe to backend /ws yet. Cancel must leave idle with
    // no done animation and no error, not a completion.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
    await publish(electronApp, 'team.runCancelled', teamRun('cancelled'), 'event');
    await expectSettledIdle(electronApp);
  });

  test('a cancelled team child turn returns that conversation to idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'team.childTurnStarted', childTurn('running'));
    // pet does not subscribe to backend /ws yet. Cancel must leave idle with
    // no done animation and no error, not a completion.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
    await publish(electronApp, 'team.childTurnCancelled', childTurn('cancelled'));
    await expectSettledIdle(electronApp);
  });

  test('a cron job that failed shows error', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'cron.job-executed',
      { job_id: 'job-1', status: 'error', error: 'the job failed' },
      'event'
    );
    // pet does not subscribe to backend /ws yet
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'error', rendered: 'error' });
  });

  test('a skipped or missed cron job leaves the pet idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(electronApp, 'cron.job-executed', { job_id: 'job-1', status: 'skipped' });
    await publish(electronApp, 'cron.job-executed', { job_id: 'job-2', status: 'missed' }, 'event');
    // Idle today, and still the right result after the pet subscribes.
    // skipped and missed are not a completion and not an error.
    await expectAppearance(electronApp, idle, 800);
  });

  test('agent_status disconnected is ignored while the pet is idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'message.stream',
      stream('agent_status', {
        data: { backend: 'claude', status: 'disconnected' },
      })
    );
    // Idle today, and still the right result after the pet subscribes.
    // A disconnect with no running turn is not an error.
    await expectAppearance(electronApp, idle, 800);
  });

  test('agent_status disconnected shows error during a running turn', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'message.stream',
      stream('thinking', { turnId: 'turn-live', data: { content: 'working on it', status: 'thinking' } })
    );
    // pet does not subscribe to backend /ws yet. Disconnect is an error only
    // while this conversation still has a running turn.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'thinking', rendered: 'thinking' });
    await publish(
      electronApp,
      'message.stream',
      stream('agent_status', {
        conversationId: 'e2e-pet',
        turnId: 'turn-live',
        data: { backend: 'claude', status: 'disconnected' },
      }),
      'event'
    );
    await expectAppearance(electronApp, { state: 'error', rendered: 'error' });
  });

  test('cancelling changes nothing until a stopped turn returns to idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await publish(
      electronApp,
      'message.stream',
      stream('text', { turnId: 'turn-stop', data: { content: 'still running' } })
    );
    // pet does not subscribe to backend /ws yet. runtime.state cancelling must
    // not change the animation. The following turn.completed with stopped must
    // return to idle, with no done animation and no error. The looser
    // "stopped is not an error" case still allows done.
    test.fail(true, NOT_SUBSCRIBED);
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
    await publish(electronApp, 'turn.completed', {
      ...turnCompleted('ai_generating', 'turn-stop'),
      status: 'running',
      runtime: {
        state: 'cancelling',
        can_send_message: false,
        has_task: true,
        is_processing: true,
        pending_confirmations: 0,
        turn_id: 'turn-stop',
      },
    });
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
    await publish(electronApp, 'turn.completed', turnCompleted('stopped', 'turn-stop'), 'event');
    await expectSettledIdle(electronApp);
  });

  test('team mailbox and task changes leave the pet idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    const message = {
      id: 'mail-1',
      team_id: 'team-1',
      from_agent_id: 'lead',
      to_agent_id: 'teammate',
      msg_type: 'message',
      content: 'status',
      files: [],
      read: false,
      created_at: Date.now(),
    };
    const task = {
      id: 'task-1',
      team_id: 'team-1',
      subject: 'Write the notes',
      status: 'open',
      blocked_by: [],
      blocks: [],
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await publish(electronApp, 'team.mailboxChanged', { team_id: 'team-1', message, change: 'created' });
    await publish(electronApp, 'team.mailboxChanged', {
      team_id: 'team-1',
      message: { ...message, read: true },
      change: 'read',
    });
    await publish(electronApp, 'team.taskChanged', { team_id: 'team-1', task, change: 'created' }, 'event');
    await publish(electronApp, 'team.taskChanged', {
      team_id: 'team-1',
      task: { ...task, status: 'done' },
      change: 'updated',
    });
    // Idle today, and still the right result after the pet subscribes.
    // Mailbox and task board updates never drive the pet.
    await expectAppearance(electronApp, idle, 800);
  });
});

test.describe('pet do-not-disturb', () => {
  test('do-not-disturb returns the pet to idle instead of freezing the current animation', async ({
    page,
    electronApp,
  }) => {
    await enablePet(page, electronApp);
    await clickPet(electronApp, 1);
    await expectAppearance(electronApp, { state: 'attention', rendered: 'attention' });

    await invokeContextItem(electronApp, 'dnd');
    await expect.poll(async () => (await petSnapshot(electronApp)).dnd, { timeout: 1_000 }).toBe(true);
    const armed = await petSnapshot(electronApp);
    expect(armed.state).toBe('attention');

    // Do-not-disturb must leave the attention auto-return running. That delay
    // is 3000ms from when attention started, not from when DND was turned on,
    // and not an instant jump to idle. Wait until that deadline plus a short
    // bound. On the current build setDnd clears the timer, so attention is
    // still showing when the deadline passes.
    const attentionStartedAt = armed.stateChangedAt ?? Date.now();
    const attentionAutoReturnMs = 3_000;
    const idleDeadlineMs = attentionStartedAt + attentionAutoReturnMs + 1_500 - Date.now();
    test.fail(
      true,
      'Bug: turning on do-not-disturb freezes the current animation instead of returning the pet to idle.'
    );
    await expectAppearance(electronApp, idle, Math.max(idleDeadlineMs, 500));
  });

  test('do-not-disturb ignores a later agent event', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeBridge<void>(page, 'system-settings:set-pet-dnd', { dnd: true });
    await expect.poll(async () => (await petSnapshot(electronApp)).dnd, { timeout: 2_000 }).toBe(true);
    await publish(
      electronApp,
      'message.stream',
      stream('thinking', { data: { content: 'ignored', status: 'thinking' } })
    );

    // Stays idle today because the pet is not on /ws. After it subscribes,
    // requestState still rejects every state except dragging while DND is on.
    await expectAppearance(electronApp, idle, 800);
  });
});
