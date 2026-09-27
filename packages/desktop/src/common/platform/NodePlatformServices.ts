import { readFileSync } from 'fs';
import os from 'os';
import path from 'path';
import type { IPlatformServices } from './IPlatformServices';

// Read name + version from package.json once at module load.
const _pkg = (() => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      name?: string;
      version?: string;
    };
  } catch {
    return { name: 'aionui', version: '0.0.0' };
  }
})();

export class NodePlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => process.env.DATA_DIR ?? path.join(os.homedir(), '.aionui-server'),
    getTempDir: () => os.tmpdir(),
    getHomeDir: () => os.homedir(),
    getLogsDir: () => process.env.LOGS_DIR ?? path.join(os.homedir(), '.aionui-server', 'logs'),
    getAppPath: (): string | null => process.cwd(),
    isPackaged: () => process.env.IS_PACKAGED === 'true',
    getSystemPath: (_name: 'desktop' | 'home' | 'downloads'): string | null => null,
    getName: () => _pkg.name ?? 'aionui',
    getVersion: () => _pkg.version ?? '0.0.0',
    needsCliSafeSymlinks: () => false,
  };

  notification = {
    send: (_opts: { title: string; body: string; icon?: string }): void => {},
  };

  network = {
    fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> => fetch(input, init),
  };
}
