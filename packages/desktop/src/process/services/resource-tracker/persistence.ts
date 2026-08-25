/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ResourceTrackerProviderId, ResourceTrackerSnapshot } from '@/common/types/provider/resourceTracker';

type EncryptedCredential = { iv: string; tag: string; value: string };
type CredentialFile = Partial<Record<ResourceTrackerProviderId, EncryptedCredential>>;
type HistoryFile = Partial<Record<ResourceTrackerProviderId, ResourceTrackerSnapshot[]>>;

const readJson = async <T extends object>(filePath: string): Promise<T> => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {} as T;
    throw error;
  }
};

const writePrivateJson = async (filePath: string, value: object): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tempPath, filePath);
  await fs.chmod(filePath, 0o600);
};

export type CredentialVault = {
  get: (providerId: ResourceTrackerProviderId) => Promise<string | undefined>;
  has: (providerId: ResourceTrackerProviderId) => Promise<boolean>;
  set: (providerId: ResourceTrackerProviderId, apiKey: string) => Promise<void>;
  remove: (providerId: ResourceTrackerProviderId) => Promise<void>;
};

export type SnapshotHistory = {
  get: (providerId: ResourceTrackerProviderId) => Promise<ResourceTrackerSnapshot[]>;
  append: (snapshot: ResourceTrackerSnapshot) => Promise<void>;
};

export const createCredentialVault = (directory: string): CredentialVault => {
  const credentialsPath = path.join(directory, 'credentials.json');
  const keyPath = path.join(directory, '.vault-key');

  const loadKey = async (): Promise<Buffer> => {
    try {
      return Buffer.from(await fs.readFile(keyPath, 'utf8'), 'base64');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const key = randomBytes(32);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      try {
        await fs.writeFile(keyPath, key.toString('base64'), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        return key;
      } catch (writeError) {
        if ((writeError as NodeJS.ErrnoException).code !== 'EEXIST') throw writeError;
        return Buffer.from(await fs.readFile(keyPath, 'utf8'), 'base64');
      }
    }
  };

  return {
    async get(providerId) {
      const record = (await readJson<CredentialFile>(credentialsPath))[providerId];
      if (!record) return undefined;
      const decipher = createDecipheriv('aes-256-gcm', await loadKey(), Buffer.from(record.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(record.value, 'base64')), decipher.final()]).toString('utf8');
    },
    async has(providerId) {
      return Boolean((await readJson<CredentialFile>(credentialsPath))[providerId]);
    },
    async set(providerId, apiKey) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', await loadKey(), iv);
      const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
      const credentials = await readJson<CredentialFile>(credentialsPath);
      credentials[providerId] = {
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        value: encrypted.toString('base64'),
      };
      await writePrivateJson(credentialsPath, credentials);
    },
    async remove(providerId) {
      const credentials = await readJson<CredentialFile>(credentialsPath);
      delete credentials[providerId];
      await writePrivateJson(credentialsPath, credentials);
    },
  };
};

export const createSnapshotHistory = (directory: string, limit = 30): SnapshotHistory => {
  const historyPath = path.join(directory, 'history.json');
  return {
    async get(providerId) {
      return (await readJson<HistoryFile>(historyPath))[providerId] ?? [];
    },
    async append(snapshot) {
      const history = await readJson<HistoryFile>(historyPath);
      history[snapshot.providerId] = [...(history[snapshot.providerId] ?? []), snapshot].slice(-limit);
      await writePrivateJson(historyPath, history);
    },
  };
};
