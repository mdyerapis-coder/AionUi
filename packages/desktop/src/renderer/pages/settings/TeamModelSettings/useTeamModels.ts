/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { IProvider } from '@/common/config/storage';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import {
  type ITeamSet,
  PRESET_TEAMS,
  autoAssignModels,
  buildFullList,
  isPresetTeamId,
  toTeamLabelKey,
} from './teamModelPresets';

const STORAGE_KEY = 'team-model-sets';

function loadPersistedTeams(): ITeamSet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ITeamSet[];
  } catch {
    return [];
  }
}

function persistTeams(teams: ITeamSet[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(teams));
  } catch (error) {
    console.error('[useTeamModels] Failed to persist team sets:', error);
  }
}

export type UseTeamModelsReturn = {
  teams: ITeamSet[];
  activeTeamId: string | null;
  setActiveTeamId: (id: string | null) => void;
  activeTeam: ITeamSet | undefined;
  providers: IProvider[] | undefined;
  isLoading: boolean;
  createTeam: (team: Omit<ITeamSet, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => void;
  updateTeam: (id: string, updates: Partial<ITeamSet>) => void;
  deleteTeam: (id: string) => void;
  assignModel: (teamId: string, roleId: string, modelRef: string) => void;
  autoAssign: (teamId: string) => void;
  resetTeam: (teamId: string) => void;
  duplicateTeam: (teamId: string) => void;
};

function upsertPresetOverlay(prev: ITeamSet[], teamId: string, next: ITeamSet): ITeamSet[] {
  if (prev.some((team) => team.id === teamId)) {
    return prev.map((team) => (team.id === teamId ? next : team));
  }
  return [...prev, next];
}

export function useTeamModels(): UseTeamModelsReturn {
  const { t } = useTranslation();
  const { data: providers, isLoading } = useProvidersQuery();
  const [customTeams, setCustomTeams] = useState<ITeamSet[]>(() => loadPersistedTeams());
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  useEffect(() => {
    persistTeams(customTeams);
  }, [customTeams]);

  const teams = buildFullList(customTeams);
  const activeTeam = teams.find((team) => team.id === activeTeamId);

  const createTeam = useCallback((teamData: Omit<ITeamSet, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => {
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
  }, []);

  const updateTeam = useCallback((id: string, updates: Partial<ITeamSet>) => {
    setCustomTeams((prev) =>
      prev.map((team) => (team.id === id ? { ...team, ...updates, updatedAt: Date.now() } : team))
    );
  }, []);

  const deleteTeam = useCallback(
    (id: string) => {
      setCustomTeams((prev) => prev.filter((team) => team.id !== id));
      if (activeTeamId === id) {
        setActiveTeamId(null);
      }
    },
    [activeTeamId]
  );

  const assignModel = useCallback((teamId: string, roleId: string, modelRef: string) => {
    if (isPresetTeamId(teamId)) {
      setCustomTeams((prev) => {
        const existing = prev.find((team) => team.id === teamId);
        if (existing) {
          return prev.map((team) => {
            if (team.id !== teamId) return team;
            return {
              ...team,
              roles: team.roles.map((role) => (role.id === roleId ? { ...role, modelRef } : role)),
              updatedAt: Date.now(),
            };
          });
        }

        const preset = PRESET_TEAMS.find((item) => item.id === teamId);
        if (!preset) return prev;
        const now = Date.now();
        const overlay: ITeamSet = {
          ...preset,
          roles: preset.roles.map((role) => (role.id === roleId ? { ...role, modelRef } : role)),
          createdAt: now,
          updatedAt: now,
        };
        return [...prev, overlay];
      });
      return;
    }

    setCustomTeams((prev) =>
      prev.map((team) => {
        if (team.id !== teamId) return team;
        return {
          ...team,
          roles: team.roles.map((role) => (role.id === roleId ? { ...role, modelRef } : role)),
          updatedAt: Date.now(),
        };
      })
    );
  }, []);

  const autoAssign = useCallback(
    (teamId: string) => {
      if (!providers) return;

      const team = teams.find((item) => item.id === teamId);
      if (!team) return;

      const updated = autoAssignModels(team, providers);
      if (isPresetTeamId(teamId)) {
        setCustomTeams((prev) => upsertPresetOverlay(prev, teamId, updated));
        return;
      }

      setCustomTeams((prev) => prev.map((item) => (item.id === teamId ? updated : item)));
    },
    [providers, teams]
  );

  const resetTeam = useCallback((teamId: string) => {
    if (isPresetTeamId(teamId)) {
      setCustomTeams((prev) => prev.filter((team) => team.id !== teamId));
      return;
    }

    setCustomTeams((prev) =>
      prev.map((team) => {
        if (team.id !== teamId) return team;
        return {
          ...team,
          roles: team.roles.map((role) => ({ ...role, modelRef: '' })),
          updatedAt: Date.now(),
        };
      })
    );
  }, []);

  const duplicateTeam = useCallback(
    (teamId: string) => {
      const team = teams.find((item) => item.id === teamId);
      if (!team) return;

      const now = Date.now();
      const label = (value: string) => {
        const key = toTeamLabelKey(value);
        return key ? t(key) : value;
      };
      const roles = team.roles.map((role) => ({
        ...role,
        name: label(role.name),
        description: label(role.description),
      }));
      const copy: ITeamSet = {
        ...team,
        id: `custom-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: t('settings.teamModelsConfig.copySuffix', { name: label(team.name) }),
        description: label(team.description),
        isPreset: false,
        roles,
        createdAt: now,
        updatedAt: now,
      };
      setCustomTeams((prev) => [...prev, copy]);
      setActiveTeamId(copy.id);
    },
    [t, teams]
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
    resetTeam,
    duplicateTeam,
  };
}
