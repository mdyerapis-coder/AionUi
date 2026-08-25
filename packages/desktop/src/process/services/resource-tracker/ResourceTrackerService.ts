/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RESOURCE_TRACKER_PROVIDER_IDS,
  type ResourceTrackerProvider,
  type ResourceTrackerProviderId,
  type ResourceTrackerSnapshot,
} from '@/common/types/provider/resourceTracker';
import type { CredentialVault, SnapshotHistory } from './persistence';
import type { ResourceProviderAdapter } from './providers';

const unconfiguredSnapshot = (providerId: ResourceTrackerProviderId): ResourceTrackerSnapshot => ({
  providerId,
  configured: false,
  status: 'unconfigured',
  balances: [],
  modelCount: 0,
});

const uncheckedSnapshot = (providerId: ResourceTrackerProviderId): ResourceTrackerSnapshot => ({
  providerId,
  configured: true,
  status: 'unchecked',
  balances: [],
  modelCount: 0,
});

const detailForError = (error: unknown): ResourceTrackerSnapshot['detail'] => {
  const status =
    typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status
      : undefined;
  return status === 401 || status === 403 ? 'invalidKey' : 'networkError';
};

export class ResourceTrackerService {
  private readonly adapters: Map<ResourceTrackerProviderId, ResourceProviderAdapter>;

  constructor(
    adapters: ResourceProviderAdapter[],
    private readonly vault: CredentialVault,
    private readonly history: SnapshotHistory,
    private readonly timeoutMs = 10_000
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  }

  async list(): Promise<ResourceTrackerProvider[]> {
    return Promise.all(
      RESOURCE_TRACKER_PROVIDER_IDS.map(async (providerId) => {
        const adapter = this.requireAdapter(providerId);
        const history = await this.history.get(providerId);
        const configured = await this.vault.has(providerId);
        const latest = history.at(-1);
        return {
          ...(latest
            ? { ...latest, configured }
            : configured
              ? uncheckedSnapshot(providerId)
              : unconfiguredSnapshot(providerId)),
          dashboardUrl: adapter.dashboardUrl,
          history,
        };
      })
    );
  }

  async saveCredential(providerId: ResourceTrackerProviderId, apiKey: string): Promise<void> {
    const normalized = apiKey.trim();
    if (!normalized) throw new Error('API key is required');
    this.requireAdapter(providerId);
    await this.vault.set(providerId, normalized);
  }

  async removeCredential(providerId: ResourceTrackerProviderId): Promise<void> {
    this.requireAdapter(providerId);
    await this.vault.remove(providerId);
  }

  async refresh(providerId?: ResourceTrackerProviderId): Promise<ResourceTrackerProvider[]> {
    const ids = providerId ? [providerId] : [...RESOURCE_TRACKER_PROVIDER_IDS];
    await Promise.all(ids.map((id) => this.refreshOne(id)));
    return this.list();
  }

  private async refreshOne(providerId: ResourceTrackerProviderId): Promise<void> {
    const adapter = this.requireAdapter(providerId);
    const apiKey = await this.vault.get(providerId);
    if (!apiKey) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let snapshot: ResourceTrackerSnapshot;
    try {
      const inspection = await adapter.inspect(apiKey, controller.signal);
      snapshot = { providerId, configured: true, checkedAt: Date.now(), ...inspection };
    } catch (error) {
      snapshot = {
        providerId,
        configured: true,
        status: 'error',
        balances: [],
        modelCount: 0,
        checkedAt: Date.now(),
        detail: detailForError(error),
      };
    } finally {
      clearTimeout(timeout);
    }
    await this.history.append(snapshot);
  }

  private requireAdapter(providerId: ResourceTrackerProviderId): ResourceProviderAdapter {
    const adapter = this.adapters.get(providerId);
    if (!adapter) throw new Error(`Unsupported provider: ${providerId}`);
    return adapter;
  }
}
