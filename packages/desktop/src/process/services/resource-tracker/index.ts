/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { getDataPath } from '@process/utils/utils';
import { createCredentialVault, createSnapshotHistory } from './persistence';
import { createProviderAdapters } from './providers';
import { ResourceTrackerService } from './ResourceTrackerService';

let service: ResourceTrackerService | undefined;

export const getResourceTrackerService = (): ResourceTrackerService => {
  if (service) return service;
  const directory = path.join(getDataPath(), 'resource-tracker');
  service = new ResourceTrackerService(
    createProviderAdapters(),
    createCredentialVault(directory),
    createSnapshotHistory(directory)
  );
  return service;
};

export { ResourceTrackerService } from './ResourceTrackerService';
export { createProviderAdapters } from './providers';
