import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialVault, createSnapshotHistory } from '@/process/services/resource-tracker/persistence';

const directories: string[] = [];

const snapshot = (checkedAt: number) => ({
  providerId: 'openrouter' as const,
  configured: true,
  status: 'available' as const,
  balances: [],
  modelCount: 1,
  checkedAt,
});

const createDirectory = async (): Promise<string> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aionui-resource-tracker-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('resource tracker persistence', () => {
  it('round-trips encrypted credentials without writing plaintext and keeps files private', async () => {
    const directory = await createDirectory();
    const vault = createCredentialVault(directory);

    await vault.set('openrouter', 'top-secret-value');

    expect(await vault.get('openrouter')).toBe('top-secret-value');
    expect(await fs.readFile(path.join(directory, 'credentials.json'), 'utf8')).not.toContain('top-secret-value');
    expect((await fs.stat(path.join(directory, 'credentials.json'))).mode & 0o777).toBe(0o600);
    expect((await fs.stat(path.join(directory, '.vault-key'))).mode & 0o777).toBe(0o600);
  });

  it('fails closed when encrypted credential data is tampered with', async () => {
    const directory = await createDirectory();
    const vault = createCredentialVault(directory);
    await vault.set('deepseek', 'secret');
    const filePath = path.join(directory, 'credentials.json');
    const stored = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
      deepseek: { value: string };
    };
    stored.deepseek.value = Buffer.from('tampered').toString('base64');
    await fs.writeFile(filePath, JSON.stringify(stored));

    await expect(vault.get('deepseek')).rejects.toThrow();
  });

  it('keeps only the configured number of recent snapshots', async () => {
    const directory = await createDirectory();
    const history = createSnapshotHistory(directory, 2);
    await history.append(snapshot(1));
    await history.append(snapshot(2));
    await history.append(snapshot(3));

    expect((await history.get('openrouter')).map(({ checkedAt }) => checkedAt)).toEqual([2, 3]);
  });
});
