/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { resourceTracker } from '@/common/adapter/ipcBridge';
import type { ResourceTrackerProvider, ResourceTrackerProviderId } from '@/common/types/provider/resourceTracker';

export const useResourceTracker = () => {
  const [providers, setProviders] = useState<ResourceTrackerProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<ResourceTrackerProviderId>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProviders(await resourceTracker.refresh.invoke({}));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runForProvider = useCallback(async (providerId: ResourceTrackerProviderId, operation: () => Promise<void>) => {
    setBusyProvider(providerId);
    try {
      await operation();
      setProviders(await resourceTracker.list.invoke());
    } finally {
      setBusyProvider(undefined);
    }
  }, []);

  return {
    providers,
    loading,
    busyProvider,
    refreshAll: load,
    saveCredential: (providerId: ResourceTrackerProviderId, apiKey: string) =>
      runForProvider(providerId, async () => {
        await resourceTracker.saveCredential.invoke({ providerId, apiKey });
        setProviders(await resourceTracker.refresh.invoke({ providerId }));
      }),
    removeCredential: (providerId: ResourceTrackerProviderId) =>
      runForProvider(providerId, () => resourceTracker.removeCredential.invoke({ providerId })),
    refreshProvider: (providerId: ResourceTrackerProviderId) =>
      runForProvider(providerId, async () => {
        setProviders(await resourceTracker.refresh.invoke({ providerId }));
      }),
  };
};
