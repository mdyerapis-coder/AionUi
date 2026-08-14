/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * TeamModelSettings — "Whole Team Model Set" page.
 *
 * A settings page that allows users to select or create curated "model teams"
 * where each role in an AI workflow is assigned an optimal model with smart
 * suggestions based on that role's specific strengths.
 *
 * Features:
 * - Preset team archetypes (Software Dev, Content Creation, Research)
 * - Custom team builder
 * - Role cards with model dropdowns and smart suggestion badges
 * - Auto-assign best models
 * - Save/load/switch between team sets
 */

import { Button, Divider, Dropdown, Menu, Message, Popconfirm, Tag } from '@arco-design/web-react';
import {
  Add,
  ApplicationMenu,
  Code,
  Copy,
  DeleteFour,
  Edit,
  Lightning,
  Refresh,
  Star,
} from '@icon-park/react';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeamModels } from '@/renderer/hooks/useTeamModels';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import SettingsPageHeader from './components/SettingsPageHeader';
import TeamRoleCard from './components/TeamRoleCard';
import CreateTeamModal from './components/CreateTeamModal';

// ==================== Team Icon Map ====================

const TEAM_ICON_MAP: Record<string, React.ReactNode> = {
  Code: <Code theme='outline' size='20' />,
  Edit: <Edit theme='outline' size='20' />,
  Analysis: <ApplicationMenu theme='outline' size='20' />,
  Custom: <Star theme='outline' size='20' />,
};

// ==================== Component ====================

const TeamModelSettingsInner: React.FC = () => {
  const { t } = useTranslation();

  const {
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
  } = useTeamModels();

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editTeam, setEditTeam] = useState<ReturnType<typeof useTeamModels>['teams'][number] | null>(null);
  const [messageApi, messageContext] = Message.useMessage();

  // Separate presets and custom teams
  const presetTeams = useMemo(() => teams.filter((team) => team.isPreset), [teams]);
  const customTeams = useMemo(() => teams.filter((team) => !team.isPreset), [teams]);

  /**
   * Handle creating a new custom team.
   */
  const handleCreateTeam = useCallback(
    (teamData: Parameters<typeof createTeam>[0]) => {
      createTeam(teamData);
      setCreateModalVisible(false);
      messageApi.success(t('teamModelsConfig.teamCreated'));
    },
    [createTeam, messageApi, t]
  );

  /**
   * Handle editing a team.
   */
  const handleEditTeam = useCallback(
    (teamData: Parameters<typeof createTeam>[0]) => {
      if (editTeam) {
        updateTeam(editTeam.id, teamData);
        setEditTeam(null);
        messageApi.success(t('teamModelsConfig.teamUpdated'));
      }
    },
    [editTeam, updateTeam, messageApi, t]
  );

  /**
   * Handle auto-assigning models to a team.
   */
  const handleAutoAssign = useCallback(
    (teamId: string) => {
      autoAssign(teamId);
      messageApi.success(t('teamModelsConfig.modelsAssigned'));
    },
    [autoAssign, messageApi, t]
  );

  /**
   * Handle resetting a team's assignments.
   */
  const handleReset = useCallback(
    (teamId: string) => {
      resetTeam(teamId);
      messageApi.success(t('teamModelsConfig.teamReset'));
    },
    [resetTeam, messageApi, t]
  );

  /**
   * Handle deleting a custom team.
   */
  const handleDelete = useCallback(
    (teamId: string) => {
      deleteTeam(teamId);
      messageApi.success(t('teamModelsConfig.teamDeleted'));
    },
    [deleteTeam, messageApi, t]
  );

  // No providers configured state
  if (!isLoading && (!providers || providers.length === 0)) {
    return (
      <div className='flex flex-col gap-16px'>
        {messageContext}
        <SettingsPageHeader
          title={t('settings.teamModels')}
          description={t('teamModelsConfig.description')}
        />
        <div className='flex flex-col items-center justify-center py-60px'>
          <Star theme='outline' size='48' className='text-t-secondary mb-16px' />
          <h3 className='text-16px font-500 text-t-primary mb-8px'>
            {t('teamModelsConfig.noProviders')}
          </h3>
          <p className='text-14px text-t-secondary text-center max-w-400px'>
            {t('teamModelsConfig.noProvidersDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-16px'>
      {messageContext}

      {/* Page Header */}
      <SettingsPageHeader
        title={t('settings.teamModels')}
        description={t('teamModelsConfig.description')}
        actions={
          <Button
            type='primary'
            icon={<Add size='16' />}
            onClick={() => {
              setEditTeam(null);
              setCreateModalVisible(true);
            }}
          >
            {t('teamModelsConfig.createTeam')}
          </Button>
        }
      />

      <div className='flex gap-16px min-h-0 flex-1'>
        {/* Left: Team List Sidebar */}
        <div className='w-240px shrink-0 flex flex-col gap-8px'>
          <AionScrollArea className='flex-1 min-h-0'>
            {/* Preset Teams */}
            <div className='mb-12px'>
              <div className='text-11px font-600 text-t-secondary uppercase tracking-wider px-8px mb-6px'>
                {t('teamModelsConfig.presetTeams')}
              </div>
              {presetTeams.map((team) => (
                <TeamListItem
                  key={team.id}
                  team={team}
                  isActive={activeTeamId === team.id}
                  onClick={() => setActiveTeamId(team.id)}
                />
              ))}
            </div>

            {/* Custom Teams */}
            {customTeams.length > 0 && (
              <div>
                <div className='text-11px font-600 text-t-secondary uppercase tracking-wider px-8px mb-6px'>
                  {t('teamModelsConfig.customTeams')}
                </div>
                {customTeams.map((team) => (
                  <TeamListItem
                    key={team.id}
                    team={team}
                    isActive={activeTeamId === team.id}
                    onClick={() => setActiveTeamId(team.id)}
                    onDelete={() => handleDelete(team.id)}
                    onEdit={() => {
                      setEditTeam(team);
                      setCreateModalVisible(true);
                    }}
                    onDuplicate={() => duplicateTeam(team.id)}
                  />
                ))}
              </div>
            )}
          </AionScrollArea>
        </div>

        <Divider type='vertical' className='!h-auto !mx-0' />

        {/* Right: Team Detail */}
        <div className='flex-1 min-w-0'>
          <AionScrollArea className='h-full'>
            {activeTeam ? (
              <TeamDetailView
                team={activeTeam}
                providers={providers || []}
                onAssignModel={(roleId, modelRef) => assignModel(activeTeam.id, roleId, modelRef)}
                onAutoAssign={() => handleAutoAssign(activeTeam.id)}
                onReset={() => handleReset(activeTeam.id)}
              />
            ) : (
              <div className='flex flex-col items-center justify-center py-60px'>
                <Star theme='outline' size='48' className='text-t-secondary mb-16px' />
                <h3 className='text-16px font-500 text-t-primary mb-8px'>
                  {t('teamModelsConfig.selectTeam')}
                </h3>
                <p className='text-14px text-t-secondary text-center max-w-400px'>
                  {t('teamModelsConfig.selectTeamDesc')}
                </p>
              </div>
            )}
          </AionScrollArea>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <CreateTeamModal
        visible={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          setEditTeam(null);
        }}
        onSubmit={editTeam ? handleEditTeam : handleCreateTeam}
        editTeam={editTeam}
      />
    </div>
  );
};

// ==================== Team List Item ====================

interface TeamListItemProps {
  team: { id: string; name: string; description: string; icon: string; isPreset: boolean; roles: { id: string }[] };
  isActive: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
}

const TeamListItem: React.FC<TeamListItemProps> = ({
  team,
  isActive,
  onClick,
  onDelete,
  onEdit,
  onDuplicate,
}) => {
  const { t } = useTranslation();
  const icon = TEAM_ICON_MAP[team.icon] || <Code theme='outline' size='16' />;

  const moreMenu = (
    <Menu>
      {onDuplicate && (
        <Menu.Item key='duplicate' onClick={onDuplicate}>
          <div className='flex items-center gap-6px'>
            <Copy size='14' />
            {t('teamModelsConfig.duplicate')}
          </div>
        </Menu.Item>
      )}
      {onEdit && (
        <Menu.Item key='edit' onClick={onEdit}>
          <div className='flex items-center gap-6px'>
            <Edit size='14' />
            {t('common.edit')}
          </div>
        </Menu.Item>
      )}
      {onDelete && (
        <Popconfirm title={t('teamModelsConfig.confirmDelete')} onOk={onDelete}>
          <Menu.Item key='delete'>
            <div className='flex items-center gap-6px text-red-500'>
              <DeleteFour size='14' />
              {t('common.delete')}
            </div>
          </Menu.Item>
        </Popconfirm>
      )}
    </Menu>
  );

  const hasActions = onDelete || onEdit || onDuplicate;

  return (
    <div
      className={`flex items-center gap-10px px-10px py-8px rd-8px cursor-pointer transition-colors group ${
        isActive
          ? 'bg-[rgba(var(--primary-6),0.1)] text-[rgb(var(--primary-6))]'
          : 'hover:bg-[var(--fill-0)] text-t-secondary'
      }`}
      onClick={onClick}
    >
      <span className={`text-16px ${isActive ? 'text-[rgb(var(--primary-6))]' : 'text-t-secondary'}`}>
        {icon}
      </span>
      <div className='flex-1 min-w-0'>
        <div className={`text-13px font-500 truncate ${isActive ? 'text-[rgb(var(--primary-6))]' : 'text-t-primary'}`}>
          {team.name.startsWith('teamModels.') ? t(team.name) : team.name}
        </div>
        <div className='text-11px text-t-secondary truncate'>
          {t('teamModelsConfig.roleCount', { count: team.roles.length })}
        </div>
      </div>

      {hasActions && (
        <Dropdown droplist={moreMenu} trigger='click' position='br'>
          <Button
            type='text'
            size='mini'
            className='!opacity-0 group-hover:!opacity-100 transition-opacity !w-24px !h-24px !min-w-24px'
            onClick={(e) => e.stopPropagation()}
          >
            ⋯
          </Button>
        </Dropdown>
      )}
    </div>
  );
};

// ==================== Team Detail View ====================

interface TeamDetailViewProps {
  team: ReturnType<typeof useTeamModels>['teams'][number];
  providers: NonNullable<ReturnType<typeof useTeamModels>['providers']>;
  onAssignModel: (roleId: string, modelRef: string) => void;
  onAutoAssign: () => void;
  onReset: () => void;
}

const TeamDetailView: React.FC<TeamDetailViewProps> = ({
  team,
  providers,
  onAssignModel,
  onAutoAssign,
  onReset,
}) => {
  const { t } = useTranslation();

  // Count how many roles have models assigned
  const assignedCount = team.roles.filter((r) => r.modelRef && r.modelRef !== '').length;
  const totalCount = team.roles.length;
  const allAssigned = assignedCount === totalCount;

  return (
    <div className='flex flex-col gap-16px'>
      {/* Team Header */}
      <div className='flex items-start justify-between gap-16px'>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-10px mb-4px'>
            <h2 className='text-18px font-600 text-t-primary m-0'>
              {team.name.startsWith('teamModels.') ? t(team.name) : team.name}
            </h2>
            {team.isPreset && (
              <Tag size='small' color='blue'>
                {t('teamModelsConfig.preset')}
              </Tag>
            )}
            <Tag size='small' color={allAssigned ? 'green' : 'orange'}>
              {assignedCount}/{totalCount} {t('teamModelsConfig.assigned')}
            </Tag>
          </div>
          <p className='text-13px text-t-secondary m-0 leading-20px'>
            {team.description.startsWith('teamModels.') ? t(team.description) : team.description}
          </p>
        </div>

        <div className='flex items-center gap-8px shrink-0'>
          <Button
            type='outline'
            size='small'
            icon={<Lightning size='14' />}
            onClick={onAutoAssign}
          >
            {t('teamModelsConfig.autoAssign')}
          </Button>
          <Popconfirm title={t('teamModelsConfig.confirmReset')} onOk={onReset}>
            <Button
              type='text'
              size='small'
              icon={<Refresh size='14' />}
              className='!text-t-secondary'
            >
              {t('teamModelsConfig.reset')}
            </Button>
          </Popconfirm>
        </div>
      </div>

      <Divider className='!my-0' />

      {/* Role Cards Grid */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-12px'>
        {team.roles.map((role) => (
          <TeamRoleCard
            key={role.id}
            role={role}
            providers={providers}
            modelRef={role.modelRef}
            onAssignModel={(modelRef) => onAssignModel(role.id, modelRef)}
          />
        ))}
      </div>
    </div>
  );
};

/** Main component wrapped with SettingsPageWrapper for proper context */
const TeamModelSettings: React.FC = () => (
  <SettingsPageWrapper>
    <TeamModelSettingsInner />
  </SettingsPageWrapper>
);

export default TeamModelSettings;
