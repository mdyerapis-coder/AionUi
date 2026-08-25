/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const RESOURCE_TRACKER_PROVIDER_IDS = ['openrouter', 'deepseek'] as const;

export type ResourceTrackerProviderId = (typeof RESOURCE_TRACKER_PROVIDER_IDS)[number];

export type ResourceTrackerBalance = {
  currency: string;
  amount: number;
};

export type ResourceTrackerUsage = {
  currency: string;
  amount: number;
};

export type ResourceTrackerStatus = 'unconfigured' | 'unchecked' | 'available' | 'unavailable' | 'error';

export type ResourceTrackerSnapshot = {
  providerId: ResourceTrackerProviderId;
  configured: boolean;
  status: ResourceTrackerStatus;
  balances: ResourceTrackerBalance[];
  usage?: ResourceTrackerUsage;
  modelCount: number;
  checkedAt?: number;
  detail?: 'balanceUnavailable' | 'invalidKey' | 'networkError';
};

export type ResourceTrackerProvider = ResourceTrackerSnapshot & {
  dashboardUrl: string;
  history: ResourceTrackerSnapshot[];
};

export type SaveResourceTrackerCredentialParams = {
  providerId: ResourceTrackerProviderId;
  apiKey: string;
};

export type RemoveResourceTrackerCredentialParams = {
  providerId: ResourceTrackerProviderId;
};

export type RefreshResourceTrackerParams = {
  providerId?: ResourceTrackerProviderId;
};
