#!/usr/bin/env node
/**
 * E2E stand-in for the aioncore binary.
 *
 * Electron is pointed at this file via AIONUI_BACKEND_BIN. The real aioncore
 * binary is AIONUI_E2E_AIONCORE_BIN. This process binds the port Electron
 * asked for, forwards HTTP and WebSocket traffic to aioncore, and accepts two
 * localhost-only controls:
 *
 *   POST /__e2e/ws-publish   body is a backend frame, broadcast to every /ws client
 *   POST /__e2e/ws-drop      close every /ws client (a backend restart, from the client's side)
 *
 * aioncore does not rebroadcast a frame a client sends, so tests cannot inject
 * agent events by opening a second socket. Publishing here is the stream the
 * renderer already subscribes to, and the stream a main-process pet client
 * will subscribe to. Frames are forwarded unchanged (`name`/`event`, `data`/`payload`).
 *
 * stdout must look like aioncore: one `AIONCORE_LISTENING {"host","port"}` line
 * for THIS port, then `AIONCORE_READY`. The child's own marker lines are swallowed
 * so the launcher does not adopt the upstream port.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';

const LISTENING_PREFIX = 'AIONCORE_LISTENING ';
const READY_MARKER = 'AIONCORE_READY';

const bin = process.env.AIONUI_E2E_AIONCORE_BIN;
if (!bin) {
  console.error('backendWsProxy: AIONUI_E2E_AIONCORE_BIN is not set');
  process.exit(1);
}

const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const publicPort = portFlag >= 0 ? Number(argv[portFlag + 1]) : NaN;
if (!Number.isInteger(publicPort) || publicPort <= 0) {
  console.error('backendWsProxy: missing --port');
  process.exit(1);
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

const upstreamPort = await reservePort();
const childArgs = argv.slice();
childArgs[portFlag + 1] = String(upstreamPort);

const clients = new Set();
let announced = false;
let childReady = false;
let proxyListening = false;
let shuttingDown = false;

const child = spawn(bin, childArgs, {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});

function killChild(signal) {
  if (child.exitCode !== null || child.signalCode) return;
  try {
    child.kill(signal);
  } catch {
    // already gone
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  killChild('SIGTERM');
  const timer = setTimeout(() => {
    killChild('SIGKILL');
    process.exit(code);
  }, 500);
  timer.unref();
  child.once('exit', () => process.exit(code));
}

process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));
process.on('exit', () => killChild('SIGKILL'));

child.on('error', (error) => {
  console.error('backendWsProxy: failed to spawn aioncore', error);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (shuttingDown) return;
  const status = code ?? (signal ? 1 : 0);
  process.exit(announced ? status : status || 1);
});

function announce() {
  if (announced || !proxyListening || !childReady) return;
  announced = true;
  process.stdout.write(`${LISTENING_PREFIX}${JSON.stringify({ host: '127.0.0.1', port: publicPort })}\n`);
  process.stdout.write(`${READY_MARKER}\n`);
}

function forwardChildStdout(chunk) {
  let rest = chunk.toString();
  forwardChildStdout.pending = (forwardChildStdout.pending ?? '') + rest;
  const lines = forwardChildStdout.pending.split('\n');
  forwardChildStdout.pending = lines.pop() ?? '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith(LISTENING_PREFIX)) continue;
    if (trimmed === READY_MARKER) {
      childReady = true;
      announce();
      continue;
    }
    process.stdout.write(`${line}\n`);
  }
}

child.stdout.on('data', forwardChildStdout);
child.stdout.on('end', () => {
  const tail = (forwardChildStdout.pending ?? '').trim();
  forwardChildStdout.pending = '';
  if (tail.startsWith(LISTENING_PREFIX)) return;
  if (tail === READY_MARKER) {
    childReady = true;
    announce();
  }
});
child.stderr.on('data', (chunk) => process.stderr.write(chunk));

const server = http.createServer(async (req, res) => {
  try {
    const pathOnly = (req.url ?? '/').split('?')[0];
    if ((pathOnly === '/__e2e/ws-publish' || pathOnly === '/__e2e/ws-drop') && !isLoopback(req.socket.remoteAddress)) {
      sendJson(res, 403, { ok: false });
      return;
    }
    if (req.method === 'POST' && pathOnly === '/__e2e/ws-publish') {
      const raw = await readBody(req);
      let frame;
      try {
        frame = JSON.parse(raw.toString('utf8'));
      } catch {
        sendJson(res, 400, { ok: false, error: 'invalid json' });
        return;
      }
      if (!frame || typeof frame !== 'object' || Array.isArray(frame)) {
        sendJson(res, 400, { ok: false, error: 'frame must be an object' });
        return;
      }
      const text = JSON.stringify(frame);
      let delivered = 0;
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(text);
          delivered += 1;
        }
      }
      sendJson(res, 200, { ok: true, delivered });
      return;
    }
    if (req.method === 'POST' && pathOnly === '/__e2e/ws-drop') {
      await readBody(req);
      for (const client of clients) {
        try {
          client.close(1012, 'backend restart');
        } catch {
          // already closed
        }
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    const headers = { ...req.headers, host: `127.0.0.1:${upstreamPort}` };
    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: upstreamPort,
        path: req.url,
        method: req.method,
        headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on('error', () => {
      if (!res.headersSent) sendJson(res, 502, { ok: false, error: 'upstream unavailable' });
      else res.end();
    });
    req.pipe(proxyReq);
  } catch (error) {
    if (!res.headersSent)
      sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : 'proxy error' });
    else res.end();
  }
});

const wss = new WebSocketServer({ noServer: true });

function bridgeSocket(client, requestUrl) {
  clients.add(client);
  const upstream = new WebSocket(`ws://127.0.0.1:${upstreamPort}${requestUrl}`);
  const pending = [];
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    clients.delete(client);
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) client.close();
    if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close();
  };

  client.on('message', (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    else pending.push({ data, isBinary });
  });
  upstream.on('open', () => {
    for (const item of pending) upstream.send(item.data, { binary: item.isBinary });
    pending.length = 0;
  });
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  client.on('close', finish);
  upstream.on('close', finish);
  client.on('error', finish);
  upstream.on('error', finish);
}

function proxyUpgrade(req, socket, head) {
  const target = net.connect(upstreamPort, '127.0.0.1', () => {
    let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) raw += `${key}: ${item}\r\n`;
    }
    raw += '\r\n';
    target.write(raw);
    if (head.length > 0) target.write(head);
    socket.pipe(target);
    target.pipe(socket);
  });
  const fail = () => {
    socket.destroy();
    target.destroy();
  };
  target.on('error', fail);
  socket.on('error', fail);
}

server.on('upgrade', (req, socket, head) => {
  const pathOnly = (req.url ?? '/').split('?')[0];
  if (pathOnly === '/ws') {
    wss.handleUpgrade(req, socket, head, (client) => bridgeSocket(client, req.url ?? '/ws'));
    return;
  }
  proxyUpgrade(req, socket, head);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(publicPort, '127.0.0.1', () => {
    proxyListening = true;
    resolve();
  });
});

const readyTimeout = setTimeout(() => {
  console.error('backendWsProxy: upstream aioncore did not become ready');
  shutdown(1);
}, 55_000);
readyTimeout.unref();
announce();
