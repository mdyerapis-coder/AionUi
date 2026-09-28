/**
 * Pet reactions to an agent run.
 *
 * Events are emitted with `bridge.emit` on the channels a real run uses
 * (`message.stream`, `message.userCreated`, `turn.completed`). The assertions
 * name the animation the pet should show. Where the bridge still listens on
 * the old channel names, or never opens the confirm window, the test is marked
 * `test.fail()` so the suite stays green until that fix lands.
 */
import { test, expect } from '../fixtures';
import { invokeBridge } from '../helpers';
import {
  clickPet,
  emitAgentEvent,
  enablePet,
  invokeContextItem,
  petSnapshot,
  readPetAppearance,
  resetPet,
  streamMessage,
} from './helpers';

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page, electronApp }) => {
  await resetPet(page, electronApp);
});

test.afterAll(async ({ page, electronApp }) => {
  await resetPet(page, electronApp).catch(() => undefined);
});

const idle = { state: 'idle', rendered: 'idle' };

async function expectAppearance(
  electronApp: Parameters<typeof readPetAppearance>[0],
  appearance: { state: string; rendered: string },
  timeout = 2_000
): Promise<void> {
  await expect.poll(async () => readPetAppearance(electronApp), { timeout }).toEqual(appearance);
}

test.describe('pet agent reactions', () => {
  test('a new pet starts idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await expectAppearance(electronApp, idle);
  });

  test('an unrelated bridge event leaves the pet idle', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await emitAgentEvent(electronApp, 'not.a.pet.channel', streamMessage('thinking'));
    await expectAppearance(electronApp, idle, 800);
  });

  test('shows thinking when the user sends a message', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // Bug: the bridge never handles message.userCreated, so a sent message does not wake the pet.
    test.fail(true, 'Bug: petEventBridge ignores message.userCreated, so a sent message never shows thinking.');
    await emitAgentEvent(electronApp, 'message.userCreated', {
      conversation_id: 'e2e-pet',
      msg_id: 'e2e-user',
      content: 'hello',
      position: 'right',
      status: 'finish',
      hidden: false,
      created_at: Date.now(),
    });
    await expectAppearance(electronApp, { state: 'thinking', rendered: 'thinking' });
  });

  test('shows thinking while the agent is thinking', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // Bug: the bridge listens on chat.response.stream / openclaw.response.stream, not message.stream.
    test.fail(true, 'Bug: petEventBridge listens on the old stream channels, not message.stream.');
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('thinking'));
    await expectAppearance(electronApp, { state: 'thinking', rendered: 'thinking' });
  });

  test('shows working while the agent is streaming text', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    test.fail(true, 'Bug: petEventBridge listens on the old stream channels, not message.stream.');
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('text'));
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('shows working during a tool call', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // Bug: tool-call frames on message.stream are not mapped to an animation.
    test.fail(true, 'Bug: petEventBridge does not map tool-call frames (acp_tool_call) on message.stream.');
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('acp_tool_call'));
    await expectAppearance(electronApp, { state: 'working', rendered: 'working' });
  });

  test('shows the notification animation when a tool needs confirmation', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // Bug: real permission requests arrive as message.stream types, which the bridge does not read.
    test.fail(
      true,
      'Bug: petEventBridge does not map message.stream permission frames (acp_permission) to notification.'
    );
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('acp_permission'));
    await expectAppearance(electronApp, { state: 'notification', rendered: 'notification' });
  });

  test('opens the confirm bubble when a tool needs confirmation', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // Bug: showConfirmation is never called, so the confirm window stays uncreated.
    test.fail(true, 'Bug: showConfirmation is dead code, so a permission request never opens the confirm bubble.');
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('acp_permission'));
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
    test.fail(true, 'Bug: petEventBridge listens on the old stream channels, not message.stream.');
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('finish'));
    await expectAppearance(electronApp, { state: 'done', rendered: 'done' });
  });

  test('shows done when the turn-completed event arrives', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    // Bug: turn.completed is not mapped; handleTurnCompleted is never called from the bridge.
    test.fail(true, 'Bug: petEventBridge does not map turn.completed, so a finished turn never shows done.');
    await emitAgentEvent(electronApp, 'turn.completed', {
      conversation_id: 'e2e-pet',
      session_id: 'e2e-pet',
      turn_id: 'turn-1',
      status: 'finished',
      state: 'ai_waiting_input',
    });
    await expectAppearance(electronApp, { state: 'done', rendered: 'done' });
  });

  test('shows error when the agent stream reports an error', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    test.fail(true, 'Bug: petEventBridge listens on the old stream channels, not message.stream.');
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('error'));
    await expectAppearance(electronApp, { state: 'error', rendered: 'error' });
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

    // Bug: setDnd clears the auto-return timer and rejects new states, so the current animation stays on screen.
    test.fail(
      true,
      'Bug: turning on do-not-disturb freezes the current animation instead of returning the pet to idle.'
    );
    await expectAppearance(electronApp, idle, 1_000);
  });

  test('do-not-disturb ignores a later agent event', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeBridge<void>(page, 'system-settings:set-pet-dnd', { dnd: true });
    await expect.poll(async () => (await petSnapshot(electronApp)).dnd, { timeout: 2_000 }).toBe(true);
    await emitAgentEvent(electronApp, 'message.stream', streamMessage('thinking'));

    // Stays idle today because the stream channel is not wired. After that fix,
    // the same assertion is the do-not-disturb guard inside requestState.
    await expectAppearance(electronApp, idle, 800);
  });
});
