/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ResourceTrackerBalance,
  ResourceTrackerProviderId,
  ResourceTrackerSnapshot,
  ResourceTrackerUsage,
} from '@/common/types/provider/resourceTracker';

type FetchClient = typeof fetch;

export type ProviderInspection = Pick<
  ResourceTrackerSnapshot,
  'status' | 'balances' | 'usage' | 'modelCount' | 'detail'
>;

export type ResourceProviderAdapter = {
  id: ResourceTrackerProviderId;
  dashboardUrl: string;
  inspect: (apiKey: string, signal: AbortSignal) => Promise<ProviderInspection>;
};

type ModelsResponse = { data?: Array<{ id?: string }> };

const getJson = async <T>(fetchClient: FetchClient, url: string, apiKey: string, signal: AbortSignal): Promise<T> => {
  const response = await fetchClient(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!response.ok) {
    const error = new Error(`Provider request failed with status ${response.status}`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return (await response.json()) as T;
};

const statusOf = (error: unknown): number | undefined =>
  typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;

const balancesFromDeepSeek = (items: DeepSeekBalanceResponse['balance_infos']): ResourceTrackerBalance[] =>
  (items ?? []).flatMap((item) => {
    const amount = Number(item.total_balance);
    return Number.isFinite(amount) ? [{ currency: item.currency, amount }] : [];
  });

type DeepSeekBalanceResponse = {
  is_available?: boolean;
  balance_infos?: Array<{ currency: string; total_balance: string }>;
};

type OpenRouterCreditsResponse = {
  data?: { total_credits?: number; total_usage?: number };
};

const openRouterCredits = (
  response: OpenRouterCreditsResponse
): {
  balances: ResourceTrackerBalance[];
  usage?: ResourceTrackerUsage;
} => {
  const totalCredits = Number(response.data?.total_credits);
  const totalUsage = Number(response.data?.total_usage);
  if (!Number.isFinite(totalCredits) || !Number.isFinite(totalUsage)) return { balances: [] };
  return {
    balances: [{ currency: 'USD', amount: Math.max(0, totalCredits - totalUsage) }],
    usage: { currency: 'USD', amount: totalUsage },
  };
};

export const createProviderAdapters = (fetchClient: FetchClient = fetch): ResourceProviderAdapter[] => [
  {
    id: 'openrouter',
    dashboardUrl: 'https://openrouter.ai/settings/credits',
    async inspect(apiKey, signal) {
      const models = await getJson<ModelsResponse>(fetchClient, 'https://openrouter.ai/api/v1/models', apiKey, signal);
      try {
        const credits = await getJson<OpenRouterCreditsResponse>(
          fetchClient,
          'https://openrouter.ai/api/v1/credits',
          apiKey,
          signal
        );
        return { status: 'available', modelCount: models.data?.length ?? 0, ...openRouterCredits(credits) };
      } catch (error) {
        if (statusOf(error) === 401) throw error;
        return {
          status: 'available',
          balances: [],
          modelCount: models.data?.length ?? 0,
          detail: 'balanceUnavailable',
        };
      }
    },
  },
  {
    id: 'deepseek',
    dashboardUrl: 'https://platform.deepseek.com/usage',
    async inspect(apiKey, signal) {
      const [models, balance] = await Promise.all([
        getJson<ModelsResponse>(fetchClient, 'https://api.deepseek.com/models', apiKey, signal),
        getJson<DeepSeekBalanceResponse>(fetchClient, 'https://api.deepseek.com/user/balance', apiKey, signal),
      ]);
      return {
        status: balance.is_available === false ? 'unavailable' : 'available',
        balances: balancesFromDeepSeek(balance.balance_infos),
        modelCount: models.data?.length ?? 0,
      };
    },
  },
];
