/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import React from 'react';

/**
 * ChatLayout's right-sider content. File browsing lives on the project-level
 * Explorer host, which mounts only after a conversation has a `project_id`.
 * ChatLayout and TeamPage mount this sider only while `workspaceEnabled` is
 * true, and that flag is false whenever `project_id` is set, so this column
 * has nothing to render.
 */
const ChatSlider: React.FC<{
  conversation?: TChatConversation;
}> = () => {
  return <div />;
};

export default ChatSlider;
