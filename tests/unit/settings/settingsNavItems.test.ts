/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { buildSettingsNavItems, type SettingsNavItem } from '@/renderer/pages/settings/components/SettingsSider';
import { Cat, Communication, Earth, People, Puzzle, Speed } from '@icon-park/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

const DESKTOP_BUILTIN_IDS = [
  'agent',
  'model',
  'resourceTracker',
  'teamModels',
  'skills',
  'tools',
  'appearance',
  'webui',
  'pet',
  'system',
  'about',
];

const t = (key: string): string => key;

const resolveExtTabName = (tab: IExtensionSettingsTab): string => tab.label;

function extensionTab(id: string, position?: IExtensionSettingsTab['position'], icon?: string): IExtensionSettingsTab {
  return {
    id,
    label: id,
    url: `/ext/${id}`,
    order: 0,
    extensionName: 'demo',
    icon,
    position,
  };
}

function idsOf(isDesktop: boolean, tabs: readonly IExtensionSettingsTab[] = []): string[] {
  return buildSettingsNavItems(isDesktop, t, tabs, resolveExtTabName).items.map((item) => item.id);
}

function itemById(items: readonly SettingsNavItem[], id: string): SettingsNavItem {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new Error(`missing nav item ${id}`);
  return item;
}

function iconType(icon: ReactElement): unknown {
  return icon.type;
}

describe('buildSettingsNavItems', () => {
  it('includes teamModels and pet in the desktop builtin order', () => {
    expect(idsOf(true)).toEqual(DESKTOP_BUILTIN_IDS);
  });

  it('includes teamModels and omits pet off desktop', () => {
    expect(idsOf(false)).toEqual(DESKTOP_BUILTIN_IDS.filter((id) => id !== 'pet'));
  });

  it('uses the desktop sider glyphs for agent, team models, pet, and WebUI', () => {
    const items = buildSettingsNavItems(true, t, [], resolveExtTabName).items;

    expect(iconType(itemById(items, 'agent').icon)).toBe(Speed);
    expect(iconType(itemById(items, 'teamModels').icon)).toBe(People);
    expect(iconType(itemById(items, 'pet').icon)).toBe(Cat);
    expect(iconType(itemById(items, 'webui').icon)).toBe(Earth);
  });

  it('swaps the WebUI icon off desktop', () => {
    const items = buildSettingsNavItems(false, t, [], resolveExtTabName).items;

    expect(iconType(itemById(items, 'webui').icon)).toBe(Communication);
    expect(itemById(items, 'webui').path).toBe('webui');
  });

  it('splices extension tabs before and after an anchor without reordering builtins', () => {
    const { items, leadingExtensionCount } = buildSettingsNavItems(
      true,
      t,
      [
        extensionTab('before-b', { relativeTo: 'skills', placement: 'before' }),
        extensionTab('before-a', { relativeTo: 'skills', placement: 'before' }),
        extensionTab('after-skills', { relativeTo: 'skills', placement: 'after' }),
      ],
      resolveExtTabName
    );
    const ids = items.map((item) => item.id);
    const skillsAt = ids.indexOf('skills');

    expect(ids.slice(skillsAt - 2, skillsAt + 2)).toEqual(['before-b', 'before-a', 'skills', 'after-skills']);
    expect(itemById(items, 'before-a').path).toBe('ext/before-a');
    expect(leadingExtensionCount.get('skills')).toBe(2);
    expect(ids.filter((id) => DESKTOP_BUILTIN_IDS.includes(id))).toEqual(DESKTOP_BUILTIN_IDS);
  });

  it('keeps a legacy anchor beside the builtin that replaced it', () => {
    const ids = idsOf(true, [extensionTab('after-display', { relativeTo: 'display', placement: 'after' })]);
    const appearanceAt = ids.indexOf('appearance');

    expect(ids[appearanceAt + 1]).toBe('after-display');
  });

  it('places a tab anchored to a missing id before system', () => {
    const ids = idsOf(true, [
      extensionTab('orphan', { relativeTo: 'assistants', placement: 'before' }),
      extensionTab('loose'),
    ]);
    const systemAt = ids.indexOf('system');

    expect(ids).not.toContain('assistants');
    expect(ids.slice(systemAt - 2, systemAt + 1)).toEqual(['orphan', 'loose', 'system']);
  });

  it('drops an extension anchored to pet from the pet slot when pet itself is hidden', () => {
    const ids = idsOf(false, [extensionTab('pet-ext', { relativeTo: 'pet', placement: 'after' })]);
    const systemAt = ids.indexOf('system');

    expect(ids).not.toContain('pet');
    expect(ids[systemAt - 1]).toBe('pet-ext');
    expect(ids).toContain('teamModels');
  });

  it('falls back to the puzzle icon when an extension tab has no icon', () => {
    const items = buildSettingsNavItems(
      true,
      t,
      [extensionTab('pictured', undefined, 'https://cdn.example/icon.svg'), extensionTab('plain')],
      resolveExtTabName
    ).items;
    const pictured = itemById(items, 'pictured');
    const plain = itemById(items, 'plain');

    expect(pictured.isImageIcon).toBe(true);
    expect(pictured.icon.props.src).toBe('https://cdn.example/icon.svg');
    expect(plain.isImageIcon).toBe(false);
    expect(iconType(plain.icon)).toBe(Puzzle);
  });
});
