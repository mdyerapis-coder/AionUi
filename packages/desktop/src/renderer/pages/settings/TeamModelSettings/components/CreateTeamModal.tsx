/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Divider, Form, Input, Modal, Select } from '@arco-design/web-react';
import { DeleteFour, Plus } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ITeamRole,
  type ITeamSet,
  type RoleCapabilityRequirement,
  type RoleIconName,
  type TeamIconName,
  ROLE_ICON_NAMES,
  TEAM_ICON_NAMES,
} from '../teamModelPresets';

const TEAM_ICON_OPTIONS: Array<{ value: TeamIconName; labelKey: string }> = [
  { value: 'Code', labelKey: 'settings.teamModelsConfig.teamIconOption.code' },
  { value: 'Edit', labelKey: 'settings.teamModelsConfig.teamIconOption.edit' },
  { value: 'Analysis', labelKey: 'settings.teamModelsConfig.teamIconOption.analysis' },
  { value: 'Custom', labelKey: 'settings.teamModelsConfig.teamIconOption.custom' },
];

const ROLE_ICON_OPTIONS: Array<{ value: RoleIconName; labelKey: string }> = [
  { value: 'Block', labelKey: 'settings.teamModelsConfig.roleIconOption.block' },
  { value: 'CodeBrackets', labelKey: 'settings.teamModelsConfig.roleIconOption.codeBrackets' },
  { value: 'PreviewOpen', labelKey: 'settings.teamModelsConfig.roleIconOption.previewOpen' },
  { value: 'DocSearch', labelKey: 'settings.teamModelsConfig.roleIconOption.docSearch' },
  { value: 'Write', labelKey: 'settings.teamModelsConfig.roleIconOption.write' },
  { value: 'CheckCorrect', labelKey: 'settings.teamModelsConfig.roleIconOption.checkCorrect' },
  { value: 'Search', labelKey: 'settings.teamModelsConfig.roleIconOption.search' },
  { value: 'Translate', labelKey: 'settings.teamModelsConfig.roleIconOption.translate' },
  { value: 'ChartLine', labelKey: 'settings.teamModelsConfig.roleIconOption.chartLine' },
  { value: 'BookOpen', labelKey: 'settings.teamModelsConfig.roleIconOption.bookOpen' },
  { value: 'FileWord', labelKey: 'settings.teamModelsConfig.roleIconOption.fileWord' },
  { value: 'Filter', labelKey: 'settings.teamModelsConfig.roleIconOption.filter' },
  { value: 'Edit', labelKey: 'settings.teamModelsConfig.roleIconOption.edit' },
];

const CAPABILITY_OPTIONS: Array<{ value: RoleCapabilityRequirement; labelKey: string }> = [
  { value: 'text', labelKey: 'settings.teamModelsConfig.capability.text' },
  { value: 'reasoning', labelKey: 'settings.teamModelsConfig.capability.reasoning' },
  { value: 'function_calling', labelKey: 'settings.teamModelsConfig.capability.functionCalling' },
  { value: 'vision', labelKey: 'settings.teamModelsConfig.capability.vision' },
  { value: 'creative', labelKey: 'settings.teamModelsConfig.capability.creative' },
  { value: 'precise', labelKey: 'settings.teamModelsConfig.capability.precise' },
  { value: 'fast', labelKey: 'settings.teamModelsConfig.capability.fast' },
  { value: 'cheap', labelKey: 'settings.teamModelsConfig.capability.cheap' },
  { value: 'web_search', labelKey: 'settings.teamModelsConfig.capability.webSearch' },
];

type CreateTeamModalProps = {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (team: Omit<ITeamSet, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => void;
  editTeam?: ITeamSet | null;
};

function blankRole(): ITeamRole {
  return {
    id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    description: '',
    icon: 'CodeBrackets',
    requirements: ['text'],
    modelRef: '',
  };
}

function teamIconValue(icon: string | undefined): TeamIconName {
  return (TEAM_ICON_NAMES as readonly string[]).includes(icon ?? '') ? (icon as TeamIconName) : 'Code';
}

function roleIconValue(icon: string): RoleIconName {
  return (ROLE_ICON_NAMES as readonly string[]).includes(icon) ? (icon as RoleIconName) : 'CodeBrackets';
}

const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ visible, onCancel, onSubmit, editTeam }) => {
  const { t } = useTranslation();

  const [name, setName] = useState(editTeam?.name || '');
  const [description, setDescription] = useState(editTeam?.description || '');
  const [icon, setIcon] = useState<TeamIconName>(teamIconValue(editTeam?.icon));
  const [roles, setRoles] = useState<ITeamRole[]>(editTeam?.roles || [blankRole()]);

  React.useEffect(() => {
    if (!visible) return;
    setName(editTeam?.name || '');
    setDescription(editTeam?.description || '');
    setIcon(teamIconValue(editTeam?.icon));
    setRoles(editTeam?.roles?.length ? editTeam.roles : [blankRole()]);
  }, [visible, editTeam]);

  const addRole = useCallback(() => {
    setRoles((prev) => [...prev, blankRole()]);
  }, []);

  const removeRole = useCallback((roleId: string) => {
    setRoles((prev) => prev.filter((role) => role.id !== roleId));
  }, []);

  const updateRole = useCallback((roleId: string, updates: Partial<ITeamRole>) => {
    setRoles((prev) => prev.map((role) => (role.id === roleId ? { ...role, ...updates } : role)));
  }, []);

  const handleSubmit = () => {
    if (!name.trim() || roles.length === 0 || roles.some((role) => !role.name.trim())) return;

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      icon,
      roles,
    });
  };

  const isValid = Boolean(name.trim() && roles.length > 0 && roles.every((role) => role.name.trim()));

  return (
    <Modal
      visible={visible}
      onCancel={onCancel}
      title={editTeam ? t('settings.teamModelsConfig.editTeam') : t('settings.teamModelsConfig.createTeam')}
      style={{ width: 640 }}
      footer={
        <div className='flex justify-end gap-8px'>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button type='primary' onClick={handleSubmit} disabled={!isValid}>
            {editTeam ? t('common.save') : t('common.create')}
          </Button>
        </div>
      }
    >
      <Form layout='vertical' className='max-h-60vh overflow-y-auto pr-8px'>
        <Form.Item label={t('settings.teamModelsConfig.teamName')} required className='!mb-16px'>
          <Input
            value={name}
            onChange={setName}
            placeholder={t('settings.teamModelsConfig.teamNamePlaceholder')}
            maxLength={50}
          />
        </Form.Item>

        <Form.Item label={t('settings.teamModelsConfig.teamDescription')} className='!mb-16px'>
          <Input.TextArea
            value={description}
            onChange={setDescription}
            placeholder={t('settings.teamModelsConfig.teamDescriptionPlaceholder')}
            maxLength={200}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </Form.Item>

        <Form.Item label={t('settings.teamModelsConfig.teamIcon')} className='!mb-16px'>
          <Select value={icon} onChange={setIcon} className='w-full'>
            {TEAM_ICON_OPTIONS.map((option) => (
              <Select.Option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        <Divider className='!my-4px' />

        <Form.Item label={t('settings.teamModelsConfig.roles')} required className='!mb-0'>
          <div className='flex justify-end mb-12px -mt-4px'>
            <Button type='text' size='mini' icon={<Plus size='14' />} onClick={addRole}>
              {t('settings.teamModelsConfig.addRole')}
            </Button>
          </div>

          <div className='space-y-12px'>
            {roles.map((role, index) => (
              <div key={role.id} className='p-12px rd-8px border border-b-base bg-fill-0'>
                <div className='flex items-center justify-between mb-8px'>
                  <span className='text-12px font-500 text-t-secondary'>
                    {t('settings.teamModelsConfig.roleHeading')} {index + 1}
                  </span>
                  {roles.length > 1 && (
                    <Button
                      type='text'
                      size='mini'
                      status='danger'
                      icon={<DeleteFour size='14' />}
                      onClick={() => removeRole(role.id)}
                    />
                  )}
                </div>

                <div className='flex flex-col gap-8px'>
                  <div className='grid grid-cols-2 gap-8px'>
                    <Form.Item label={t('settings.teamModelsConfig.roleName')} required className='!mb-0'>
                      <Input
                        value={role.name}
                        onChange={(val) => updateRole(role.id, { name: val })}
                        placeholder={t('settings.teamModelsConfig.roleNamePlaceholder')}
                        size='small'
                      />
                    </Form.Item>
                    <Form.Item label={t('settings.teamModelsConfig.roleIcon')} className='!mb-0'>
                      <Select
                        value={roleIconValue(role.icon)}
                        onChange={(val) => updateRole(role.id, { icon: val })}
                        size='small'
                        className='w-full'
                      >
                        {ROLE_ICON_OPTIONS.map((option) => (
                          <Select.Option key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </div>

                  <Form.Item label={t('settings.teamModelsConfig.roleDescription')} className='!mb-0'>
                    <Input
                      value={role.description}
                      onChange={(val) => updateRole(role.id, { description: val })}
                      placeholder={t('settings.teamModelsConfig.roleDescriptionPlaceholder')}
                      size='small'
                    />
                  </Form.Item>

                  <Form.Item label={t('settings.teamModelsConfig.capabilityRequirements')} className='!mb-0'>
                    <Select
                      mode='multiple'
                      value={role.requirements}
                      onChange={(val) => updateRole(role.id, { requirements: val as RoleCapabilityRequirement[] })}
                      size='small'
                      className='w-full'
                      maxTagCount={4}
                    >
                      {CAPABILITY_OPTIONS.map((option) => (
                        <Select.Option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </div>
              </div>
            ))}
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateTeamModal;
