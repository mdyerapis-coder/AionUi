/**
 * Tests for startWebHost.
 *
 * startWebHost is a thin orchestrator: start backend, start static-server,
 * return the combined handle. No credentials, no config file reads — the caller
 * resolves port / allowRemote from its own source of truth.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('startWebHost', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('returns a handle without initialPassword', async () => {
    vi.doMock('./backend-launcher.js', () => ({
      startBackend: vi.fn().mockResolvedValue({
        port: 55555,
        stop: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    vi.doMock('./static-server.js', () => ({
      startStaticServer: vi.fn().mockResolvedValue({
        port: 33000,
        url: 'http://127.0.0.1:33000',
        localUrl: 'http://127.0.0.1:33000',
        stop: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    const { startWebHost } = await import('./index.js');

    const handle = await startWebHost({
      app: {
        version: '1.0.0',
        isPackaged: false,
        resourcesPath: '/app',
        userDataPath: '/tmp/test-data',
      },
      staticDir: '/tmp/static',
      backend: {
        kind: 'ownBackend',
        resolveBackend: () => '/bin/backend',
      },
    });

    // Admin credentials flow through the backend reset-password route,
    // not through startWebHost.
    expect('initialPassword' in handle).toBe(false);
    expect(handle.port).toBe(33000);
    expect(handle.backendPort).toBe(55555);

    await handle.stop();
  });
});
