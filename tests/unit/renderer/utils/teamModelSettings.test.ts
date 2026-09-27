import { describe, expect, it } from 'vitest';
import type { IProvider } from '@/common/config/storage';
import {
  PRESET_TEAMS,
  type ITeamSet,
  buildFullList,
  formatModelRef,
  generateSuggestions,
  resolveRoleIconName,
  toTeamLabelKey,
} from '@/renderer/pages/settings/TeamModelSettings/teamModelPresets';

function provider(overrides: Partial<IProvider> & Pick<IProvider, 'id' | 'name' | 'models'>): IProvider {
  return {
    platform: 'openai',
    base_url: 'https://example.test',
    api_key: 'key',
    ...overrides,
  };
}

function overlay(presetId: string, modelRefs: Record<string, string>): ITeamSet {
  const preset = PRESET_TEAMS.find((team) => team.id === presetId);
  if (!preset) throw new Error(`missing preset ${presetId}`);
  return {
    ...preset,
    roles: preset.roles.map((role) => ({ ...role, modelRef: modelRefs[role.id] ?? '' })),
    createdAt: 10,
    updatedAt: 20,
  };
}

describe('preset model assignments', () => {
  it('keeps a saved preset assignment on the single row teams.find returns', () => {
    const teams = buildFullList([overlay('preset-software-dev', { architect: 'openai::gpt-4' })]);
    const found = teams.find((team) => team.id === 'preset-software-dev');

    expect(teams.filter((team) => team.id === 'preset-software-dev')).toHaveLength(1);
    expect(found?.isPreset).toBe(true);
    expect(found?.roles.find((role) => role.id === 'architect')?.modelRef).toBe('openai::gpt-4');
  });

  it('leaves the preset unassigned when the saved row is a different team', () => {
    const custom: ITeamSet = {
      ...overlay('preset-software-dev', { coder: 'openai::gpt-4' }),
      id: 'custom-1',
      isPreset: false,
      name: 'Mine',
    };
    const teams = buildFullList([custom]);
    const preset = teams.find((team) => team.id === 'preset-software-dev');

    expect(preset?.roles.every((role) => role.modelRef === '')).toBe(true);
    expect(teams.find((team) => team.id === 'custom-1')?.roles.find((role) => role.id === 'coder')?.modelRef).toBe(
      'openai::gpt-4'
    );
  });
});

describe('model suggestions', () => {
  it('lists healthy models ahead of unhealthy ones', () => {
    const suggestions = generateSuggestions([
      provider({
        id: 'slow',
        name: 'Slow',
        models: ['old'],
        model_health: { old: { status: 'unhealthy' } },
      }),
      provider({
        id: 'fast',
        name: 'Fast',
        models: ['new'],
        model_health: { new: { status: 'healthy' } },
      }),
    ]);

    expect(suggestions.map((item) => item.modelRef)).toEqual(['fast::new', 'slow::old']);
  });

  it('drops disabled providers and disabled models', () => {
    const suggestions = generateSuggestions([
      provider({ id: 'off', name: 'Off', models: ['hidden'], enabled: false }),
      provider({
        id: 'on',
        name: 'On',
        models: ['kept', 'skipped'],
        model_enabled: { skipped: false },
      }),
    ]);

    expect(suggestions.map((item) => item.modelRef)).toEqual(['on::kept']);
  });

  it('returns no suggestions when nothing is configured', () => {
    expect(generateSuggestions([])).toEqual([]);
  });

  it('returns an empty model name when the ref is missing', () => {
    expect(formatModelRef('')).toBe('');
    expect(formatModelRef('not-a-ref')).toBe('');
  });
});

describe('role icons', () => {
  it('keeps every preset role icon on a mapped name, including the architect Block icon', () => {
    const icons = PRESET_TEAMS.flatMap((team) => team.roles.map((role) => role.icon));
    const architect = PRESET_TEAMS.flatMap((team) => team.roles).find((role) => role.id === 'architect');

    expect(architect?.icon).toBe('Block');
    expect(icons.map((icon) => resolveRoleIconName(icon))).toEqual(icons);
  });

  it('falls back when the icon name is not mapped', () => {
    expect(resolveRoleIconName('Architecture')).toBe('CodeBrackets');
    expect(resolveRoleIconName('')).toBe('CodeBrackets');
  });
});

describe('team label keys', () => {
  it('prefixes legacy preset keys with the settings module', () => {
    expect(toTeamLabelKey('teamModelsConfig.preset.softwareDev.name')).toBe(
      'settings.teamModelsConfig.preset.softwareDev.name'
    );
  });

  it('completes a legacy role name so the nested label resolves', () => {
    expect(toTeamLabelKey('teamModelsConfig.role.architect')).toBe('settings.teamModelsConfig.role.architect.name');
  });

  it('leaves a custom team name as plain text', () => {
    expect(toTeamLabelKey('My team')).toBeNull();
  });
});
