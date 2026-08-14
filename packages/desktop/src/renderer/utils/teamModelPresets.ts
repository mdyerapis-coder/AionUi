/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Team Model Presets & Smart Suggestion Engine
 *
 * Defines preset "team archetypes" where each role in an AI workflow is
 * assigned an optimal model. The smart suggestion engine recommends models
 * based on each role's capability requirements and the user's available
 * provider/model list.
 */

import type { IProvider, ModelType } from '@/common/config/storage';

// ==================== Types ====================

/**
 * Capability tags used to describe what a role needs from a model.
 * Maps to ModelType from storage.ts plus some higher-level hints.
 */
export type RoleCapabilityRequirement = ModelType | 'fast' | 'cheap' | 'creative' | 'precise';

/**
 * A single role within a team archetype.
 */
export interface ITeamRole {
  /** Stable id for this role (unique within a team) */
  id: string;
  /** Display name for the role (i18n key or plain string) */
  name: string;
  /** Short description of what this role does */
  description: string;
  /** Icon name (icon-park icon name) */
  icon: string;
  /** What capabilities this role requires from its model */
  requirements: RoleCapabilityRequirement[];
  /** Assigned model — format: "providerId::modelName" or empty */
  modelRef: string;
}

/**
 * A team archetype (preset or user-created).
 */
export interface ITeamSet {
  /** Unique id */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Icon (icon-park icon name or emoji) */
  icon: string;
  /** Whether this is a built-in preset (cannot be deleted) */
  isPreset: boolean;
  /** Roles in this team */
  roles: ITeamRole[];
  /** Creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
}

/**
 * A model suggestion with rationale.
 */
export interface IModelSuggestion {
  /** providerId::modelName reference */
  modelRef: string;
  /** Provider display name */
  providerName: string;
  /** Model display name */
  modelName: string;
  /** Score 0-100 indicating how well this model fits the role */
  score: number;
  /** Human-readable reason for the suggestion */
  rationale: string;
  /** Whether this model passed a recent health check */
  isHealthy: boolean;
}

// ==================== Preset Team Archetypes ====================

/**
 * Built-in team archetypes. Each is a curated set of roles with sensible
 * default assignments. Model assignments are left empty — the smart
 * suggestion engine fills them at runtime based on available providers.
 */
export const PRESET_TEAMS: Omit<ITeamSet, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'preset-software-dev',
    name: 'teamModelsConfig.preset.softwareDev.name',
    description: 'teamModelsConfig.preset.softwareDev.desc',
    icon: 'Code',
    isPreset: true,
    roles: [
      {
        id: 'architect',
        name: 'teamModelsConfig.role.architect',
        description: 'teamModelsConfig.role.architect.desc',
        icon: 'Block',
        requirements: ['reasoning', 'function_calling', 'precise'],
        modelRef: '',
      },
      {
        id: 'coder',
        name: 'teamModelsConfig.role.coder',
        description: 'teamModelsConfig.role.coder.desc',
        icon: 'CodeBrackets',
        requirements: ['text', 'function_calling', 'precise'],
        modelRef: '',
      },
      {
        id: 'reviewer',
        name: 'teamModelsConfig.role.reviewer',
        description: 'teamModelsConfig.role.reviewer.desc',
        icon: 'PreviewOpen',
        requirements: ['reasoning', 'text', 'precise'],
        modelRef: '',
      },
      {
        id: 'summarizer',
        name: 'teamModelsConfig.role.summarizer',
        description: 'teamModelsConfig.role.summarizer.desc',
        icon: 'DocSearch',
        requirements: ['text', 'fast', 'cheap'],
        modelRef: '',
      },
    ],
  },
  {
    id: 'preset-content-creation',
    name: 'teamModelsConfig.preset.contentCreation.name',
    description: 'teamModelsConfig.preset.contentCreation.desc',
    icon: 'Edit',
    isPreset: true,
    roles: [
      {
        id: 'copywriter',
        name: 'teamModelsConfig.role.copywriter',
        description: 'teamModelsConfig.role.copywriter.desc',
        icon: 'Write',
        requirements: ['text', 'creative'],
        modelRef: '',
      },
      {
        id: 'editor',
        name: 'teamModelsConfig.role.editor',
        description: 'teamModelsConfig.role.editor.desc',
        icon: 'CheckCorrect',
        requirements: ['text', 'precise'],
        modelRef: '',
      },
      {
        id: 'researcher',
        name: 'teamModelsConfig.role.researcher',
        description: 'teamModelsConfig.role.researcher.desc',
        icon: 'Search',
        requirements: ['web_search', 'text', 'reasoning'],
        modelRef: '',
      },
      {
        id: 'translator',
        name: 'teamModelsConfig.role.translator',
        description: 'teamModelsConfig.role.translator.desc',
        icon: 'Translate',
        requirements: ['text', 'fast', 'cheap'],
        modelRef: '',
      },
    ],
  },
  {
    id: 'preset-research-analysis',
    name: 'teamModelsConfig.preset.researchAnalysis.name',
    description: 'teamModelsConfig.preset.researchAnalysis.desc',
    icon: 'Analysis',
    isPreset: true,
    roles: [
      {
        id: 'data-analyst',
        name: 'teamModelsConfig.role.dataAnalyst',
        description: 'teamModelsConfig.role.dataAnalyst.desc',
        icon: 'ChartLine',
        requirements: ['reasoning', 'function_calling', 'precise'],
        modelRef: '',
      },
      {
        id: 'literature-reviewer',
        name: 'teamModelsConfig.role.literatureReviewer',
        description: 'teamModelsConfig.role.literatureReviewer.desc',
        icon: 'BookOpen',
        requirements: ['text', 'reasoning'],
        modelRef: '',
      },
      {
        id: 'report-writer',
        name: 'teamModelsConfig.role.reportWriter',
        description: 'teamModelsConfig.role.reportWriter.desc',
        icon: 'FileWord',
        requirements: ['text', 'precise'],
        modelRef: '',
      },
      {
        id: 'triage',
        name: 'teamModelsConfig.role.triage',
        description: 'teamModelsConfig.role.triage.desc',
        icon: 'Filter',
        requirements: ['text', 'fast', 'cheap'],
        modelRef: '',
      },
    ],
  },
];

// ==================== Smart Suggestion Engine ====================

/**
 * Capability scoring map — how well each ModelType satisfies each
 * RoleCapabilityRequirement. Higher = better fit.
 */
const CAPABILITY_SCORE_MAP: Record<RoleCapabilityRequirement, Partial<Record<ModelType, number>>> = {
  text: { text: 100 },
  vision: { vision: 100 },
  function_calling: { function_calling: 100 },
  image_generation: { image_generation: 100 },
  web_search: { web_search: 100 },
  reasoning: { reasoning: 100, text: 30 },
  embedding: { embedding: 100 },
  rerank: { rerank: 100 },
  excludeFromPrimary: { excludeFromPrimary: 0 },
  // Soft requirements — scored heuristically
  fast: { text: 60 },
  cheap: { text: 60 },
  creative: { text: 70 },
  precise: { reasoning: 80, function_calling: 60, text: 40 },
};

/**
 * Generate model suggestions for a given role based on available providers.
 *
 * @param role - The team role to find models for
 * @param providers - The user's configured providers
 * @returns Sorted list of model suggestions (best first)
 */
export function generateSuggestions(role: ITeamRole, providers: IProvider[]): IModelSuggestion[] {
  const suggestions: IModelSuggestion[] = [];

  for (const provider of providers) {
    if (provider.enabled === false) continue;

    for (const modelName of provider.models) {
      // Skip disabled models
      if (provider.model_enabled?.[modelName] === false) continue;

      const modelRef = `${provider.id}::${modelName}`;

      // Calculate score based on role requirements vs model capabilities
      let totalScore = 0;
      let matchCount = 0;

      for (const req of role.requirements) {
        const scoreMap = CAPABILITY_SCORE_MAP[req];
        if (!scoreMap) continue;

        // Check model capabilities from provider
        const modelCapabilities = provider.capabilities || [];
        let bestMatch = 0;

        for (const cap of modelCapabilities) {
          const capScore = scoreMap[cap.type];
          if (capScore !== undefined && capScore > bestMatch) {
            bestMatch = capScore;
          }
        }

        // If no explicit capability match, use heuristics
        if (bestMatch === 0) {
          // All text models get a base score for soft requirements
          if (['fast', 'cheap', 'creative', 'precise'].includes(req)) {
            bestMatch = 30;
          }
          // Models with no capability tags get a small base score
          if (modelCapabilities.length === 0) {
            bestMatch = 20;
          }
        }

        totalScore += bestMatch;
        matchCount++;
      }

      const avgScore = matchCount > 0 ? Math.round(totalScore / matchCount) : 10;

      // Health status
      const health = provider.model_health?.[modelName];
      const isHealthy = health?.status === 'healthy';

      // Boost healthy models slightly
      const finalScore = Math.min(100, avgScore + (isHealthy ? 5 : 0));

      // Generate rationale
      const rationale = generateRationale(role, provider, modelName);

      suggestions.push({
        modelRef,
        providerName: provider.name,
        modelName,
        score: finalScore,
        rationale,
        isHealthy,
      });
    }
  }

  // Sort by score descending, healthy models first
  suggestions.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.isHealthy !== b.isHealthy) return a.isHealthy ? -1 : 1;
    return 0;
  });

  return suggestions;
}

/**
 * Generate a human-readable rationale for why a model is suggested for a role.
 */
function generateRationale(role: ITeamRole, provider: IProvider, modelName: string): string {
  const reqs = role.requirements;
  const parts: string[] = [];

  if (reqs.includes('reasoning')) {
    parts.push('Strong reasoning capabilities');
  }
  if (reqs.includes('function_calling')) {
    parts.push('Reliable tool/function calling');
  }
  if (reqs.includes('creative')) {
    parts.push('Creative output quality');
  }
  if (reqs.includes('precise')) {
    parts.push('Precise and structured output');
  }
  if (reqs.includes('fast')) {
    parts.push('Fast response times');
  }
  if (reqs.includes('cheap')) {
    parts.push('Cost-effective for high-volume tasks');
  }
  if (reqs.includes('text')) {
    parts.push('General text generation');
  }

  // Check health
  const health = provider.model_health?.[modelName];
  if (health?.status === 'healthy' && health.latency) {
    parts.push(`Verified healthy (${health.latency}ms)`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Available in your provider list';
}

/**
 * Auto-assign best models to all roles in a team set based on smart suggestions.
 *
 * @param team - The team set to populate
 * @param providers - Available providers
 * @returns A new team set with model assignments filled in
 */
export function autoAssignModels(team: ITeamSet, providers: IProvider[]): ITeamSet {
  // Track which models are already assigned to avoid duplicates
  const assigned = new Set<string>();

  const updatedRoles = team.roles.map((role) => {
    // Skip if already assigned
    if (role.modelRef) {
      assigned.add(role.modelRef);
      return role;
    }

    const suggestions = generateSuggestions(role, providers);

    // Pick the best unassigned suggestion, or the best overall
    const best = suggestions.find((s) => !assigned.has(s.modelRef)) || suggestions[0];

    if (best) {
      assigned.add(best.modelRef);
      return { ...role, modelRef: best.modelRef };
    }

    return role;
  });

  return { ...team, roles: updatedRoles, updatedAt: Date.now() };
}

/**
 * Parse a model reference into provider ID and model name.
 */
export function parseModelRef(ref: string): { providerId: string; modelName: string } | null {
  if (!ref || !ref.includes('::')) return null;
  const [providerId, ...rest] = ref.split('::');
  return { providerId, modelName: rest.join('::') };
}

/**
 * Format a model reference for display.
 */
export function formatModelRef(ref: string): string {
  const parsed = parseModelRef(ref);
  if (!parsed) return 'Not assigned';
  return parsed.modelName;
}

/**
 * Look up a model reference in the provider list and return the provider name.
 */
export function getProviderNameForRef(ref: string, providers: IProvider[]): string {
  const parsed = parseModelRef(ref);
  if (!parsed) return '';
  const provider = providers.find((p) => p.id === parsed.providerId);
  return provider?.name || parsed.providerId;
}
