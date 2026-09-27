// This is the only file in src/common/platform/ permitted to import from 'electron'.
import { app, net, Notification } from 'electron';
import path from 'path';
import type { IPlatformServices } from './IPlatformServices';

export class ElectronPlatformServices implements IPlatformServices {
  paths = {
    getDataDir: () => app.getPath('userData'),
    getTempDir: () => app.getPath('temp'),
    getHomeDir: () => app.getPath('home'),
    getLogsDir: () => {
      try {
        return app.getPath('logs');
      } catch {
        return path.join(app.getPath('userData'), 'logs');
      }
    },
    getAppPath: () => app.getAppPath(),
    isPackaged: () => app.isPackaged,
    getSystemPath: (name: 'desktop' | 'home' | 'downloads') => app.getPath(name),
    getName: () => app.getName(),
    getVersion: () => app.getVersion(),
    needsCliSafeSymlinks: () => process.platform === 'darwin',
  };

  notification = {
    send: ({ title, body }: { title: string; body: string; icon?: string }): void => {
      new Notification({ title, body }).show();
    },
  };

  network = {
    fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
      net.fetch(input instanceof URL ? input.toString() : input, init),
  };
}
