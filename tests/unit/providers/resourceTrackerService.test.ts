import { describe, expect, it, vi } from 'vitest';
import { ResourceTrackerService } from '@/process/services/resource-tracker/ResourceTrackerService';
import type { ResourceTrackerProviderId, ResourceTrackerSnapshot } from '@/common/types/provider/resourceTracker';
import type { CredentialVault, SnapshotHistory } from '@/process/services/resource-tracker/persistence';
import type { ResourceProviderAdapter } from '@/process/services/resource-tracker/providers';

const createHarness = (inspect = vi.fn<ResourceProviderAdapter['inspect']>()) => {
  const keys = new Map<ResourceTrackerProviderId, string>();
  const snapshots = new Map<ResourceTrackerProviderId, ResourceTrackerSnapshot[]>();
  const vault: CredentialVault = {
    get: async (id) => keys.get(id),
    has: async (id) => keys.has(id),
    set: async (id, key) => void keys.set(id, key),
    remove: async (id) => void keys.delete(id),
  };
  const history: SnapshotHistory = {
    get: async (id) => snapshots.get(id) ?? [],
    append: async (snapshot) =>
      void snapshots.set(snapshot.providerId, [...(snapshots.get(snapshot.providerId) ?? []), snapshot]),
  };
  const adapters: ResourceProviderAdapter[] = [
    { id: 'openrouter', dashboardUrl: 'https://example.com/openrouter', inspect },
    {
      id: 'deepseek',
      dashboardUrl: 'https://example.com/deepseek',
      inspect: vi.fn().mockResolvedValue({ status: 'available', balances: [], modelCount: 1 }),
    },
  ];
  return { service: new ResourceTrackerService(adapters, vault, history), keys, snapshots, inspect };
};

describe('ResourceTrackerService', () => {
  it('lists providers without attempting network checks for missing keys', async () => {
    const { service, inspect } = createHarness();

    const providers = await service.list();

    expect(providers.every(({ status }) => status === 'unconfigured')).toBe(true);
    expect(inspect).not.toHaveBeenCalled();
  });

  it('trims credentials before storing them and never returns key material', async () => {
    const { service, keys } = createHarness();

    await service.saveCredential('openrouter', '  secret-key  ');
    const provider = (await service.list()).find(({ providerId }) => providerId === 'openrouter');

    expect(keys.get('openrouter')).toBe('secret-key');
    expect(provider?.status).toBe('unchecked');
    expect(provider).not.toHaveProperty('apiKey');
  });

  it('records a sanitized invalid-key snapshot when a provider rejects credentials', async () => {
    const error = Object.assign(new Error('Unauthorized response body'), { status: 401 });
    const inspect = vi.fn<ResourceProviderAdapter['inspect']>().mockRejectedValue(error);
    const { service, snapshots } = createHarness(inspect);
    await service.saveCredential('openrouter', 'bad-key');

    const providers = await service.refresh('openrouter');

    expect(providers.find(({ providerId }) => providerId === 'openrouter')).toMatchObject({
      configured: true,
      status: 'error',
      detail: 'invalidKey',
    });
    expect(JSON.stringify(snapshots.get('openrouter'))).not.toContain('Unauthorized response body');
  });

  it('rejects empty credentials without changing the vault', async () => {
    const { service, keys } = createHarness();

    await expect(service.saveCredential('deepseek', '   ')).rejects.toThrow('API key is required');
    expect(keys.size).toBe(0);
  });
});
