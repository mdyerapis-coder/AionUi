/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * useTeamModels — State management hook for Team Model Sets.
 *
 * Provides CRUD operations for team configurations, persistence via
 * localStorage, and integration with the smart suggestion engine.
 */

import { useCallback, useEffect, useState } from 'react';
import type { IProvider } from '@/common/config/storage';
import {
  type ITeamSet,
  type ITeamRole,
  PRESET_TEAMS,
  autoAssignModels,
  generateSuggestions,
} from '@/renderer/utils/teamModelPresets';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';

/** localStorage key for persisted team sets */
const STORAGE_KEY = 'team-model-sets';

/**
 * Load persisted custom team sets from localStorage.
 */
function loadPersistedTeams(): ITeamSet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ITeamSet[];
  } catch {
    return [];
  }
}

/**
 * Persist custom team sets to localStorage.
 */
function persistTeams(teams: ITeamSet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch (error) {
    console.error('[useTeamModels] Failed to persist team sets:', error);
  }
}

/**
 * Build the full list of teams: presets (with current timestamps) + custom.
 */
function buildFullList(customTeams: ITeamSet[]): ITeamSet[] {
  const now = Date.now();
  const presets: ITeamSet[] = PRESET_TEAMS.map((p) => ({
    ...p,
    createdAt: now,
    updatedAt: now,
  }));
  return [...presets, ...customTeams];
}

// ==================== Hook ====================

export interface UseTeamModelsReturn {
  /** All teams (presets + custom) */
  teams: ITeamSet[];
  /** Currently active/selected team ID */
  activeTeamId: string | null;
  /** Set the active team */
  setActiveTeamId: (id: string | null) => void;
  /** Get the currently active team object */
  activeTeam: ITeamSet | undefined;
  /** Available providers from the model config */
  providers: IProvider[] | undefined;
  /** Whether providers are still loading */
  isLoading: boolean;
  /** Create a new custom team */
  createTeam: (team: Omit<ITeamSet, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => void;
  /** Update an existing team (custom only) */
  updateTeam: (id: string, updates: Partial<ITeamSet>) => void;
  /** Delete a custom team */
  deleteTeam: (id: string) => void;
  /** Update a role's model assignment within a team */
  assignModel: (teamId: string, roleId: string, modelRef: string) => void;
  /** Auto-assign models to all roles in a team using smart suggestions */
  autoAssign: (teamId: string) => void;
  /** Get smart suggestions for a specific role */
  getSuggestions: (role: ITeamRole) => ReturnType<typeof generateSuggestions>;
  /** Reset a preset team's assignments (clear model refs) */
  resetTeam: (teamId: string) => void;
  /** Duplicate a team (creates a custom copy) */
  duplicateTeam: (teamId: string) => void;
}

export function useTeamModels(): UseTeamModelsReturn {
  const { data: providers, isLoading } = useProvidersQuery();
  const [customTeams, setCustomTeams] = useState<ITeamSet[]>(() => loadPersistedTeams());
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  // Persist custom teams whenever they change
  useEffect(() => {
    persistTeams(customTeams);
  }, [customTeams]);

  // Build the full team list
  const teams = buildFullList(customTeams);

  // Derive active team
  const activeTeam = teams.find((t) => t.id === activeTeamId);

  /**
   * Create a new custom team.
   */
  const createTeam = useCallback(
    (teamData: Omit<ITeamSet, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => {
      const now = Date.now();
      const newTeam: ITeamSet = {
        ...teamData,
        id: `custom-${now}-${Math.random().toString(36).slice(2, 8)}`,
        isPreset: false,
        createdAt: now,
        updatedAt: now,
      };
      setCustomTeams((prev) => [...prev, newTeam]);
      setActiveTeamId(newTeam.id);
    },
    []
  );

  /**
   * Update an existing custom team.
   */
  const updateTeam = useCallback((id: string, updates: Partial<ITeamSet>) => {
    setCustomTeams((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t))
    );
  }, []);

  /**
   * Delete a custom team.
   */
  const deleteTeam = useCallback(
    (id: string) => {
      setCustomTeams((prev) => prev.filter((t) => t.id !== id));
      if (activeTeamId === id) {
        setActiveTeamId(null);
      }
    },
    [activeTeamId]
  );

  /**
   * Assign a model to a specific role within a team.
   * For presets, we store the assignment in custom teams (overlay pattern).
   */
  const assignModel = useCallback(
    (teamId: string, roleId: string, modelRef: string) => {
      const isPreset = PRESET_TEAMS.some((p) => p.id === teamId);

      if (isPreset) {
        // For presets, create or update an overlay in custom teams
        setCustomTeams((prev) => {
          const existing = prev.find((t) => t.id === teamId);
          if (existing) {
            return prev.map((t) => {
              if (t.id !== teamId) return t;
              return {
                ...t,
                roles: t.roles.map((r) => (r.id === roleId ? { ...r, modelRef } : r)),
                updatedAt: Date.now(),
              };
            });
          } else {
            // Create an overlay entry for this preset
            const preset = PRESET_TEAMS.find((p) => p.id === teamId)!;
            const now = Date.now();
            const overlay: ITeamSet = {
              ...preset,
              roles: preset.roles.map((r) => (r.id === roleId ? { ...r, modelRef } : r)),
              createdAt: now,
              updatedAt: now,
            };
            return [...prev, overlay];
          }
        });
      } else {
        setCustomTeams((prev) =>
          prev.map((t) => {
            if (t.id !== teamId) return t;
            return {
              ...t,
              roles: t.roles.map((r) => (r.id === roleId ? { ...r, modelRef } : r)),
              updatedAt: Date.now(),
            };
          })
        );
      }
    },
    []
  );

  /**
   * Auto-assign models to all roles in a team.
   */
  const autoAssign = useCallback(
    (teamId: string) => {
      if (!providers) return;

      const team = teams.find((t) => t.id === teamId);
      if (!team) return;

      const updated = autoAssignModels(team, providers);

      const isPreset = PRESET_TEAMS.some((p) => p.id === teamId);
      if (isPreset) {
        setCustomTeams((prev) => {
          const existing = prev.find((t) => t.id === teamId);
          if (existing) {
            return prev.map((t) => (t.id === teamId ? updated : t));
          } else {
            return [...prev, updated];
          }
        });
      } else {
        setCustomTeams((prev) => prev.map((t) => (t.id === teamId ? updated : t)));
      }
    },
    [providers, teams]
  );

  /**
   * Get smart suggestions for a specific role.
   */
  const getSuggestions = useCallback(
    (role: ITeamRole) => {
      return generateSuggestions(role, providers || []);
    },
    [providers]
  );

  /**
   * Reset a team's model assignments (clear all model refs).
   */
  const resetTeam = useCallback(
    (teamId: string) => {
      const isPreset = PRESET_TEAMS.some((p) => p.id === teamId);

      if (isPreset) {
        // Remove overlay if it exists
        setCustomTeams((prev) => prev.filter((t) => t.id !== teamId));
      } else {
        setCustomTeams((prev) =>
          prev.map((t) => {
            if (t.id !== teamId) return t;
            return {
              ...t,
              roles: t.roles.map((r) => ({ ...r, modelRef: '' })),
              updatedAt: Date.now(),
            };
          })
        );
      }
    },
    []
  );

  /**
   * Duplicate a team (creates a custom copy).
   */
  const duplicateTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((t) => t.id === teamId);
      if (!team) return;

      const now = Date.now();
      const copy: ITeamSet = {
        ...team,
        id: `custom-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: `${team.name} (Copy)`,
        isPreset: false,
        createdAt: now,
        updatedAt: now,
      };
      setCustomTeams((prev) => [...prev, copy]);
      setActiveTeamId(copy.id);
    },
    [teams]
  );

  return {
    teams,
    activeTeamId,
    setActiveTeamId,
    activeTeam,
    providers,
    isLoading,
    createTeam,
    updateTeam,
    deleteTeam,
    assignModel,
    autoAssign,
    getSuggestions,
    resetTeam,
    duplicateTeam,
  };
}
