/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const ADAPTER_BRIDGE_EVENT_KEY = 'office-ai-bridge-adapter';

/**
 * Backend `/ws` channel names the desktop pet and the renderer emitters share.
 * Changing a value here moves both sides together; registering a different
 * literal in `ipcBridge` fails the pet realtime test.
 */
export const REALTIME_CHANNELS = {
  messageStream: 'message.stream',
  userCreated: 'message.userCreated',
  turnCompleted: 'turn.completed',
  confirmationAdd: 'confirmation.add',
  teamChildTurnStarted: 'team.childTurnStarted',
  teamChildTurnCompleted: 'team.childTurnCompleted',
  teamRunStarted: 'team.runStarted',
  teamRunCompleted: 'team.runCompleted',
  teamRunFailed: 'team.runFailed',
  cronJobExecuted: 'cron.job-executed',
} as const;
