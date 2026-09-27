/**
 * Path resolution and app metadata.
 * Replaces all app.getPath() / app.getAppPath() / app.getName() / app.getVersion() calls.
 */
export interface IPlatformPaths {
  /** Persistent user data directory. Equivalent to app.getPath('userData'). */
  getDataDir(): string;
  /** OS temp directory. */
  getTempDir(): string;
  /** User home directory. */
  getHomeDir(): string;
  /**
   * Application log directory.
   * In non-Electron mode respects LOGS_DIR env var, falls back to <tmpdir>/aionui-logs.
   */
  getLogsDir(): string;
  /**
   * Root path of the application bundle.
   * Returns null in non-Electron mode (no bundle concept).
   */
  getAppPath(): string | null;
  /**
   * True when running from a packaged Electron build.
   * In non-Electron mode controlled by IS_PACKAGED env var (default false).
   */
  isPackaged(): boolean;
  /**
   * Well-known system paths (desktop, home, downloads).
   * Returns null in non-Electron mode.
   */
  getSystemPath(name: 'desktop' | 'home' | 'downloads'): string | null;
  /** Application name used for MCP client identification. */
  getName(): string;
  /** Application version string used for MCP client identification. */
  getVersion(): string;
  /**
   * Whether CLI-safe symlinks should be created in the home directory.
   * True only for Electron on macOS, where userData lives under "Application Support" (contains spaces).
   * False for non-Electron mode, where data dir has no spaces.
   */
  needsCliSafeSymlinks(): boolean;
}

/**
 * System notification. Replaces Electron Notification class.
 *
 * In non-Electron mode: silent no-op (intentional degradation).
 * Notification lifecycle events (click, failed, close) are Electron-only
 * and are NOT modelled here.
 */
export interface INotificationService {
  send(options: { title: string; body: string; icon?: string }): void;
}

/**
 * Network primitives that vary by runtime.
 *
 * Electron should use `net.fetch()` to preserve Chromium networking behavior.
 * Non-Electron mode should use the runtime's global `fetch()`.
 */
export interface INetworkService {
  fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

/** Top-level aggregate injected at process startup. */
export interface IPlatformServices {
  paths: IPlatformPaths;
  notification: INotificationService;
  network: INetworkService;
}
