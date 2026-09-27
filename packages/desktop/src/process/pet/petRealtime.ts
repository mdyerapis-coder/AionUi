/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebSocket, type ClientOptions, type RawData } from 'ws';
import {
  getRealtimeHandshake,
  parseRealtimeFrame,
  type RealtimeFrame,
  type RealtimeSocketHandshake,
} from '@/common/adapter/httpBridge';
import type { PetEventBridge } from './petEventBridge';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;
/** How often to re-read the backend port (and any future token) while connected. */
const HANDSHAKE_WATCH_MS = 250;

export type PetRealtimeClient = {
  /** Stop reconnecting and close the socket. Safe to call more than once. */
  close: () => void;
};

export type PetRealtimeClientOptions = {
  bridge: PetEventBridge;
  /**
   * Called before every connection attempt. Defaults to the desktop renderer
   * handshake (`getRealtimeHandshake`), which is re-read so a restarted
   * backend's new port is picked up. Tests pass a fixed URL instead.
   */
  url?: string;
  /** Replaces `url` when the test needs the endpoint to change over time. */
  resolveHandshake?: () => RealtimeSocketHandshake;
  /** Called after a frame parses, including frames the pet ignores. */
  onFrame?: (frame: RealtimeFrame) => void;
};

/**
 * Subscribe the Electron main process to the backend realtime socket and
 * forward frames to the pet.
 *
 * The socket uses the same handshake as the Electron renderer: loopback
 * `/ws`, no subprotocol, no cookie, and no auth header. The URL is resolved
 * again on each attempt and while the socket is open. A backend restart that
 * publishes a new port (or, if one is ever added, a new token) closes the
 * stale socket and connects to the new endpoint. A dropped socket on the
 * same endpoint still reconnects with backoff.
 *
 * Renderer `wsEmitter` listeners never run here: `ensureWs()` returns
 * immediately when `window` is undefined, and `bridge.adapter.emit` only
 * sees main-process bridge events. This client is the pet's only source.
 */
export function startPetRealtimeClient(options: PetRealtimeClientOptions): PetRealtimeClient {
  const fixedUrl = options.url;
  const resolveHandshake =
    options.resolveHandshake ?? (fixedUrl !== undefined ? () => ({ url: fixedUrl }) : getRealtimeHandshake);
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  /** Bumped each time a new socket is opened, so a replaced socket cannot reconnect. */
  let generation = 0;
  let activeKey = '';

  const scheduleReconnect = (): void => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
    attempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = (): void => {
    if (stopped) return;
    let handshake: RealtimeSocketHandshake;
    try {
      handshake = resolveHandshake();
    } catch (error) {
      console.warn('[PetRealtime] failed to resolve handshake:', error);
      scheduleReconnect();
      return;
    }
    const key = handshakeKey(handshake);
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) &&
      key === activeKey
    ) {
      return;
    }
    activeKey = key;
    const currentGeneration = ++generation;
    const previous = socket;
    socket = null;
    if (previous && previous.readyState !== WebSocket.CLOSED) {
      previous.close();
    }

    let current: WebSocket;
    try {
      current = openSocket(handshake);
    } catch (error) {
      console.warn('[PetRealtime] failed to open socket:', error);
      scheduleReconnect();
      return;
    }
    socket = current;

    current.on('open', () => {
      if (generation !== currentGeneration) return;
      attempt = 0;
    });

    current.on('message', (data) => {
      if (stopped || generation !== currentGeneration) return;
      const text = rawDataToString(data);
      if (text === null) return;
      const frame = parseRealtimeFrame(text);
      if (!frame) return;
      options.onFrame?.(frame);
      if (frame.name === 'ping') {
        if (current.readyState === WebSocket.OPEN) {
          current.send(JSON.stringify({ name: 'pong', data: { timestamp: Date.now() } }));
        }
        return;
      }
      try {
        options.bridge.handleRealtimeEvent(frame.name, frame.data);
      } catch (error) {
        console.warn('[PetRealtime] failed to apply frame:', error);
      }
    });

    current.on('error', (error: Error) => {
      if (generation !== currentGeneration) return;
      console.warn('[PetRealtime] socket error:', error.message);
    });

    current.on('close', () => {
      if (generation !== currentGeneration) return;
      if (socket === current) socket = null;
      if (!stopped) scheduleReconnect();
    });
  };

  const followHandshake = (): void => {
    if (stopped) return;
    let nextKey: string;
    try {
      nextKey = handshakeKey(resolveHandshake());
    } catch (error) {
      console.warn('[PetRealtime] failed to resolve handshake:', error);
      return;
    }
    if (nextKey === activeKey) return;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    attempt = 0;
    connect();
  };

  const watchTimer = setInterval(followHandshake, HANDSHAKE_WATCH_MS);
  connect();

  return {
    close() {
      if (stopped) return;
      stopped = true;
      generation += 1;
      clearInterval(watchTimer);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const current = socket;
      socket = null;
      if (current && current.readyState !== WebSocket.CLOSED) {
        current.close();
      }
    },
  };
}

/**
 * Open `/ws` the way the Electron renderer does.
 *
 * A URL alone becomes `new WebSocket(url)`: no subprotocol and no headers.
 * Protocols or headers are applied only when the handshake actually carries
 * them, so a later token is sent on the next attempt and not on the first.
 */
function openSocket(handshake: RealtimeSocketHandshake): WebSocket {
  const { url, protocols, headers } = handshake;
  const hasProtocols = Array.isArray(protocols) ? protocols.length > 0 : Boolean(protocols);
  const headerNames = headers ? Object.keys(headers) : [];
  const options: ClientOptions | undefined = headerNames.length > 0 ? { headers } : undefined;
  if (hasProtocols && options) return new WebSocket(url, protocols, options);
  if (hasProtocols) return new WebSocket(url, protocols);
  if (options) return new WebSocket(url, options);
  return new WebSocket(url);
}

function handshakeKey(handshake: RealtimeSocketHandshake): string {
  const protocols = Array.isArray(handshake.protocols) ? handshake.protocols.join(',') : (handshake.protocols ?? '');
  const headers = handshake.headers ?? {};
  const headerPart = Object.keys(headers)
    .toSorted()
    .map((name) => `${name}=${headers[name]}`)
    .join('&');
  return `${handshake.url}\n${protocols}\n${headerPart}`;
}

function rawDataToString(data: RawData): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return Buffer.concat(data).toString('utf8');
}
