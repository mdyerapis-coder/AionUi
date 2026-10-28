#!/usr/bin/env node
/**
 * Local ACP agent for pet e2e. No model and no CLI.
 *
 * Speaks newline-delimited JSON-RPC on stdio. AionCore's health check marks
 * the agent online after `initialize` and `session/new`. A `session/prompt`
 * then emits a thought chunk, a message chunk, and `stopReason: end_turn`,
 * which the backend publishes on `/ws` as thinking, working, and finish.
 */
import readline from 'node:readline';

const SESSION_ID = 'stub-session-1';
const THOUGHT = 'stub-thought';
const REPLY = 'stub-reply-ok';

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: '2.0', id, result: value });
}

function notify(method, params) {
  send({ jsonrpc: '2.0', method, params });
}

function chunk(sessionUpdate, text) {
  notify('session/update', {
    sessionId: SESSION_ID,
    update: {
      sessionUpdate,
      content: { type: 'text', text },
    },
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function handle(message) {
  const { id, method } = message;
  if (!method) return;

  if (method === 'initialize') {
    result(id, {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: false,
        promptCapabilities: { image: false, audio: false, embeddedContext: false },
      },
      agentInfo: { name: 'e2e-stub-acp', version: '0.0.1' },
    });
    return;
  }

  if (method === 'session/new' || method === 'session/load') {
    result(id, { sessionId: SESSION_ID });
    return;
  }

  if (method === 'session/prompt') {
    // Hold each chunk long enough for the pet renderer to paint it.
    chunk('agent_thought_chunk', THOUGHT);
    await sleep(800);
    chunk('agent_message_chunk', REPLY);
    await sleep(800);
    result(id, { stopReason: 'end_turn' });
    return;
  }

  if (method === 'session/cancel') {
    result(id, {});
    return;
  }

  if (id !== undefined) {
    result(id, {});
  }
}

const lines = readline.createInterface({ input: process.stdin });
lines.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    return;
  }
  void handle(message);
});
