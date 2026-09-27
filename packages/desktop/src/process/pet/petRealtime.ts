/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { WebSocket, type RawData } from 'ws';
import { getRealtimeWebSocketUrl, parseRealtimeFrame, type RealtimeFrame } from '@/common/adapter/httpBridge';
import type { PetEventBridge } from './petEventBridge';

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

export type PetRealtimeClient = {
  /** Stop reconnecting and close the socket. Safe to call more than once. */
  close: () => void;
};

export type PetRealtimeClientOptions = {
  bridge: PetEventBridge;
  /** Defaults to the backend `/ws` URL. Tests pass a local server URL. */
  url?: string;
  /** Called after a frame parses, including frames the pet ignores. */
  onFrame?: (frame: RealtimeFrame) => void;
};

/**
 * Subscribe the Electron main process to the backend realtime socket and
 * forward frames to the pet.
 *
 * Renderer `wsEmitter` listeners never run here: `ensureWs()` returns
 * immediately when `window` is undefined, and `bridge.adapter.emit` only
 * sees main-process bridge events. This client is the pet's only source.
 */
export function startPetRealtimeClient(options: PetRealtimeClientOptions): PetRealtimeClient {
  const url = options.url ?? getRealtimeWebSocketUrl();
  let stopped = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

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
    let current: WebSocket;
    try {
      current = new WebSocket(url);
    } catch (error) {
      console.warn('[PetRealtime] failed to open socket:', error);
      scheduleReconnect();
      return;
    }
    socket = current;

    current.on('open', () => {
      attempt = 0;
    });

    current.on('message', (data) => {
      if (stopped || socket !== current) return;
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
      console.warn('[PetRealtime] socket error:', error.message);
    });

    current.on('close', () => {
      if (socket === current) socket = null;
      if (!stopped) scheduleReconnect();
    });
  };

  connect();

  return {
    close() {
      if (stopped) return;
      stopped = true;
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

function rawDataToString(data: RawData): string | null {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return Buffer.concat(data).toString('utf8');
}
