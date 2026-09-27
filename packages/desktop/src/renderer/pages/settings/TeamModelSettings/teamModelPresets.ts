/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, ModelType } from '@/common/config/storage';

export type RoleCapabilityRequirement = ModelType | 'fast' | 'cheap' | 'creative' | 'precise';

export const ROLE_ICON_NAMES = [
  'Block',
  'CodeBrackets',
  'PreviewOpen',
  'DocSearch',
  'Write',
  'CheckCorrect',
  'Search',
  'Translate',
  'ChartLine',
  'BookOpen',
  'FileWord',
  'Filter',
  'Edit',
] as const;

export type RoleIconName = (typeof ROLE_ICON_NAMES)[number];

export const TEAM_ICON_NAMES = ['Code', 'Edit', 'Analysis', 'Custom'] as const;

export type TeamIconName = (typeof TEAM_ICON_NAMES)[number];

export type ITeamRole = {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirements: RoleCapabilityRequirement[];
  modelRef: string;
};

export type ITeamSet = {
  id: string;
  name: string;
  description: string;
  icon: string;
  isPreset: boolean;
  roles: ITeamRole[];
  createdAt: number;
  updatedAt: number;
};

export type IModelSuggestion = {
  modelRef: string;
  providerName: string;
  modelName: string;
  isHealthy: boolean;
};

type PresetTeam = Omit<ITeamSet, 'createdAt' | 'updatedAt'>;

export const PRESET_TEAMS: PresetTeam[] = [
  {
    id: 'preset-software-dev',
    name: 'settings.teamModelsConfig.preset.softwareDev.name',
    description: 'settings.teamModelsConfig.preset.softwareDev.desc',
    icon: 'Code',
    isPreset: true,
    roles: [
      {
        id: 'architect',
        name: 'settings.teamModelsConfig.role.architect.name',
        description: 'settings.teamModelsConfig.role.architect.desc',
        icon: 'Block',
        requirements: ['reasoning', 'function_calling', 'precise'],
        modelRef: '',
      },
      {
        id: 'coder',
        name: 'settings.teamModelsConfig.role.coder.name',
        description: 'settings.teamModelsConfig.role.coder.desc',
        icon: 'CodeBrackets',
        requirements: ['text', 'function_calling', 'precise'],
        modelRef: '',
      },
      {
        id: 'reviewer',
        name: 'settings.teamModelsConfig.role.reviewer.name',
        description: 'settings.teamModelsConfig.role.reviewer.desc',
        icon: 'PreviewOpen',
        requirements: ['reasoning', 'text', 'precise'],
        modelRef: '',
      },
      {
        id: 'summarizer',
        name: 'settings.teamModelsConfig.role.summarizer.name',
        description: 'settings.teamModelsConfig.role.summarizer.desc',
        icon: 'DocSearch',
        requirements: ['text', 'fast', 'cheap'],
        modelRef: '',
      },
    ],
  },
  {
    id: 'preset-content-creation',
    name: 'settings.teamModelsConfig.preset.contentCreation.name',
    description: 'settings.teamModelsConfig.preset.contentCreation.desc',
    icon: 'Edit',
    isPreset: true,
    roles: [
      {
        id: 'copywriter',
        name: 'settings.teamModelsConfig.role.copywriter.name',
        description: 'settings.teamModelsConfig.role.copywriter.desc',
        icon: 'Write',
        requirements: ['text', 'creative'],
        modelRef: '',
      },
      {
        id: 'editor',
        name: 'settings.teamModelsConfig.role.editor.name',
        description: 'settings.teamModelsConfig.role.editor.desc',
        icon: 'CheckCorrect',
        requirements: ['text', 'precise'],
        modelRef: '',
      },
      {
        id: 'researcher',
        name: 'settings.teamModelsConfig.role.researcher.name',
        description: 'settings.teamModelsConfig.role.researcher.desc',
        icon: 'Search',
        requirements: ['web_search', 'text', 'reasoning'],
        modelRef: '',
      },
      {
        id: 'translator',
        name: 'settings.teamModelsConfig.role.translator.name',
        description: 'settings.teamModelsConfig.role.translator.desc',
        icon: 'Translate',
        requirements: ['text', 'fast', 'cheap'],
        modelRef: '',
      },
    ],
  },
  {
    id: 'preset-research-analysis',
    name: 'settings.teamModelsConfig.preset.researchAnalysis.name',
    description: 'settings.teamModelsConfig.preset.researchAnalysis.desc',
    icon: 'Analysis',
    isPreset: true,
    roles: [
      {
        id: 'data-analyst',
        name: 'settings.teamModelsConfig.role.dataAnalyst.name',
        description: 'settings.teamModelsConfig.role.dataAnalyst.desc',
        icon: 'ChartLine',
        requirements: ['reasoning', 'function_calling', 'precise'],
        modelRef: '',
      },
      {
        id: 'literature-reviewer',
        name: 'settings.teamModelsConfig.role.literatureReviewer.name',
        description: 'settings.teamModelsConfig.role.literatureReviewer.desc',
        icon: 'BookOpen',
        requirements: ['text', 'reasoning'],
        modelRef: '',
      },
      {
        id: 'report-writer',
        name: 'settings.teamModelsConfig.role.reportWriter.name',
        description: 'settings.teamModelsConfig.role.reportWriter.desc',
        icon: 'FileWord',
        requirements: ['text', 'precise'],
        modelRef: '',
      },
      {
        id: 'triage',
        name: 'settings.teamModelsConfig.role.triage.name',
        description: 'settings.teamModelsConfig.role.triage.desc',
        icon: 'Filter',
        requirements: ['text', 'fast', 'cheap'],
        modelRef: '',
      },
    ],
  },
];

/** Whether `id` belongs to a built-in preset. */
export function isPresetTeamId(id: string): boolean {
  return PRESET_TEAMS.some((preset) => preset.id === id);
}

/**
 * Preset overlays are saved under the preset id. Fold each overlay onto that
 * preset so the id appears once and `teams.find` sees the saved assignment.
 */
export function buildFullList(customTeams: ITeamSet[]): ITeamSet[] {
  const now = Date.now();
  const overlayById = new Map<string, ITeamSet>();
  const customOnly: ITeamSet[] = [];

  for (const team of customTeams) {
    if (isPresetTeamId(team.id)) {
      overlayById.set(team.id, team);
    } else {
      customOnly.push(team);
    }
  }

  const presets = PRESET_TEAMS.map((preset) => mergePreset(preset, overlayById.get(preset.id), now));
  return [...presets, ...customOnly];
}

function mergePreset(preset: PresetTeam, overlay: ITeamSet | undefined, now: number): ITeamSet {
  if (!overlay) {
    return {
      ...preset,
      roles: preset.roles.map((role) => ({ ...role })),
      createdAt: now,
      updatedAt: now,
    };
  }

  const modelRefByRole = new Map(overlay.roles.map((role) => [role.id, role.modelRef]));
  return {
    ...preset,
    isPreset: true,
    roles: preset.roles.map((role) => ({
      ...role,
      modelRef: modelRefByRole.get(role.id) ?? role.modelRef,
    })),
    createdAt: overlay.createdAt,
    updatedAt: overlay.updatedAt,
  };
}

/** Rank enabled models, with healthy models first. */
export function generateSuggestions(providers: IProvider[]): IModelSuggestion[] {
  const suggestions: IModelSuggestion[] = [];

  for (const provider of providers) {
    if (provider.enabled === false) continue;

    for (const modelName of provider.models) {
      if (provider.model_enabled?.[modelName] === false) continue;

      suggestions.push({
        modelRef: `${provider.id}::${modelName}`,
        providerName: provider.name,
        modelName,
        isHealthy: provider.model_health?.[modelName]?.status === 'healthy',
      });
    }
  }

  suggestions.sort((left, right) => {
    if (left.isHealthy === right.isHealthy) return 0;
    return left.isHealthy ? -1 : 1;
  });

  return suggestions;
}

/** Fill empty role assignments from the enabled-model ranking, skipping refs already used. */
export function autoAssignModels(team: ITeamSet, providers: IProvider[]): ITeamSet {
  const assigned = new Set<string>();
  const suggestions = generateSuggestions(providers);

  const roles = team.roles.map((role) => {
    if (role.modelRef) {
      assigned.add(role.modelRef);
      return role;
    }

    const best = suggestions.find((suggestion) => !assigned.has(suggestion.modelRef)) ?? suggestions[0];
    if (!best) return role;

    assigned.add(best.modelRef);
    return { ...role, modelRef: best.modelRef };
  });

  return { ...team, roles, updatedAt: Date.now() };
}

/** Split `providerId::modelName`, or return null when the ref is empty or malformed. */
export function parseModelRef(ref: string): { providerId: string; modelName: string } | null {
  if (!ref || !ref.includes('::')) return null;
  const [providerId, ...rest] = ref.split('::');
  if (!providerId || rest.length === 0) return null;
  return { providerId, modelName: rest.join('::') };
}

/** Model name from a ref, or an empty string when nothing is assigned. */
export function formatModelRef(ref: string): string {
  return parseModelRef(ref)?.modelName ?? '';
}

/** Provider display name for a model ref. */
export function getProviderNameForRef(ref: string, providers: IProvider[]): string {
  const parsed = parseModelRef(ref);
  if (!parsed) return '';
  const provider = providers.find((item) => item.id === parsed.providerId);
  return provider?.name || parsed.providerId;
}

/**
 * Map a stored team or role label to a `settings.*` key.
 * Plain custom names return null. Legacy role names without `.name` are completed.
 */
export function toTeamLabelKey(value: string): string | null {
  if (!value) return null;
  const key = value.startsWith('teamModelsConfig.') ? `settings.${value}` : value;
  if (!key.startsWith('settings.teamModelsConfig.')) return null;
  if (/^settings\.teamModelsConfig\.role\.[^.]+$/.test(key)) {
    return `${key}.name`;
  }
  return key;
}

/** Icon name the role card can render. Unknown names fall back to CodeBrackets. */
export function resolveRoleIconName(icon: string): RoleIconName {
  return (ROLE_ICON_NAMES as readonly string[]).includes(icon) ? (icon as RoleIconName) : 'CodeBrackets';
}

/** Icon name the team list can render. */
export function resolveTeamIconName(icon: string): TeamIconName {
  return (TEAM_ICON_NAMES as readonly string[]).includes(icon) ? (icon as TeamIconName) : 'Code';
}
