/**
 * One real AionCore turn through a local stub ACP agent.
 *
 * The other pet specs publish scripted frames on the dev `/ws` proxy. This
 * one does not. It registers `stubAcpAgent.mjs` with `POST /api/agents/custom`.
 * AionCore's health check marks that agent online after a real `initialize`
 * and `session/new`. Sending a message then runs `session/prompt` in the
 * backend, which publishes thinking, working, and finish on `/ws`.
 *
 * The agent going online and the assistant reply `stub-reply-ok` are real
 * assertions. They run before `test.fail()`, so a stub that never finishes is
 * a harness failure. The pet sequence is `test.fail()` because the pet does
 * not subscribe to backend `/ws` yet.
 *
 * Screenshots, when `PET_E2E_CAPTURE_DIR` is set, come from
 * `webContents.capturePage()` on the pet page. An X11 `import -window root`
 * of that transparent window under Xvfb is a black square and is not a
 * transparency failure.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type ElectronApplication } from '../fixtures';
import { httpDelete, httpGet, httpPost } from '../helpers';
import { enablePet, readPetAppearance, resetPet } from './helpers';

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page, electronApp }) => {
  await resetPet(page, electronApp);
});

test.afterAll(async ({ page, electronApp }) => {
  await resetPet(page, electronApp).catch(() => undefined);
});

/** pet does not subscribe to backend /ws yet */
const NOT_SUBSCRIBED = 'pet does not subscribe to backend /ws yet';

const STUB_PATH = path.resolve('tests/e2e/pet/stubAcpAgent.mjs');
const REPLY = 'stub-reply-ok';
const SETTLE = new Set(['idle', 'yawning', 'dozing', 'sleeping']);

type AgentMetadata = { id: string; name: string };
type AgentHealth = { status?: string };
type AssistantRow = { id: string; agent_status?: string };
type MessagePage = {
  items?: Array<{ type?: string; position?: string; content?: { content?: string } }>;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function assistantReply(page: MessagePage): string {
  return (page.items ?? [])
    .filter((item) => item.position === 'left' && item.type === 'text')
    .map((item) => item.content?.content ?? '')
    .join('\n');
}

async function capturePetPage(electronApp: ElectronApplication, filePath: string): Promise<void> {
  const base64 = await electronApp.evaluate(async (electron) => {
    const win = electron.BrowserWindow.getAllWindows().find((candidate) => {
      if (candidate.isDestroyed()) return false;
      const url = candidate.webContents.getURL();
      // pet-hit.html contains "/pet/pet", so a substring check would capture the
      // transparent hit window (no SVG) instead of the draw page.
      if (url.includes('pet-hit') || url.includes('pet-confirm')) return false;
      return url.includes('pet.html') || url.includes('/pet/pet');
    });
    if (!win) return null;
    const image = await win.webContents.capturePage();
    return image.toPNG().toString('base64');
  });
  if (!base64) return;
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
}

test('a real aioncore turn through a stub agent shows thinking, working, done, then idle', async ({
  page,
  electronApp,
}) => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-stub-turn-'));
  const captureDir = process.env.PET_E2E_CAPTURE_DIR;
  if (captureDir) fs.mkdirSync(captureDir, { recursive: true });

  let customAgentId: string | undefined;
  const seen: string[] = [];

  const note = async (): Promise<void> => {
    const appearance = await readPetAppearance(electronApp);
    const label = appearance.rendered ?? appearance.state;
    if (!label || seen[seen.length - 1] === label) return;
    seen.push(label);
    if (!captureDir) return;
    const filePath = path.join(captureDir, `${String(seen.length).padStart(2, '0')}-${label}.png`);
    await capturePetPage(electronApp, filePath).catch(() => undefined);
  };

  try {
    await enablePet(page, electronApp);
    await note();

    const agent = await httpPost<AgentMetadata>(page, '/api/agents/custom', {
      name: 'e2e stub acp',
      command: process.execPath,
      args: [STUB_PATH],
      env: [],
    });
    customAgentId = agent.id;

    await expect
      .poll(
        async () => {
          const health = await httpPost<AgentHealth>(page, `/api/agents/${encodeURIComponent(agent.id)}/health-check`);
          return health.status ?? '';
        },
        { timeout: 30_000 }
      )
      .toBe('online');

    const assistants = await httpGet<AssistantRow[]>(page, '/api/assistants');
    const assistant = assistants.find((row) => row.id === `bare:${agent.id}`);
    expect(assistant?.agent_status, JSON.stringify(assistant)).toBe('online');

    const conversation = await httpPost<{ id: string }>(page, '/api/conversations', {
      name: 'pet live check',
      assistant: { id: `bare:${agent.id}` },
      extra: { workspace },
    });

    let reply = '';
    const sendAt = Date.now();
    await httpPost(page, `/api/conversations/${conversation.id}/messages`, {
      content: 'hello pet',
      files: [],
    });

    await expect
      .poll(
        async () => {
          await note();
          const messages = await httpGet<MessagePage>(
            page,
            `/api/conversations/${conversation.id}/messages?limit=20&content_mode=full`
          );
          reply = assistantReply(messages);
          return reply.includes(REPLY);
        },
        { timeout: 40_000 }
      )
      .toBe(true);
    expect(reply).toContain(REPLY);

    const settleUntil = Date.now() + 8_000;
    while (Date.now() < settleUntil) {
      await note();
      const doneAt = seen.lastIndexOf('done');
      if (doneAt >= 0 && seen.slice(doneAt + 1).some((state) => SETTLE.has(state))) break;
      await sleep(80);
    }
    await note();

    test.fail(true, NOT_SUBSCRIBED);

    let cursor = -1;
    for (const name of ['thinking', 'working', 'done']) {
      const at = seen.indexOf(name, cursor + 1);
      expect(at, `states after ${Date.now() - sendAt}ms: ${seen.join(' -> ') || 'none'}`).toBeGreaterThan(cursor);
      cursor = at;
    }
    const settled = seen.slice(cursor + 1).some((state) => SETTLE.has(state));
    expect(settled, `states: ${seen.join(' -> ')}`).toBe(true);
  } finally {
    if (customAgentId) {
      await httpDelete(page, `/api/agents/custom/${customAgentId}`).catch(() => undefined);
    }
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
