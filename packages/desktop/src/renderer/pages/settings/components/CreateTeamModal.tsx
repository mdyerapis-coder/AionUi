/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * CreateTeamModal — Modal for creating or editing custom team sets.
 *
 * Allows users to:
 * - Name and describe their custom team
 * - Add/remove roles with custom names and capability requirements
 * - Choose an icon for each role
 */

import { Button, Divider, Input, Modal, Select } from '@arco-design/web-react';
import { DeleteFour, Plus } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ITeamRole, ITeamSet, RoleCapabilityRequirement } from '@/renderer/utils/teamModelPresets';

// ==================== Constants ====================

/** Available role icons */
const ROLE_ICONS = [
  { value: 'Architecture', label: 'Architecture' },
  { value: 'CodeBrackets', label: 'Code' },
  { value: 'PreviewOpen', label: 'Review' },
  { value: 'DocSearch', label: 'Document' },
  { value: 'Write', label: 'Write' },
  { value: 'CheckCorrect', label: 'Check' },
  { value: 'Search', label: 'Search' },
  { value: 'Translate', label: 'Translate' },
  { value: 'ChartLine', label: 'Chart' },
  { value: 'BookOpen', label: 'Book' },
  { value: 'FileWord', label: 'File' },
  { value: 'Filter', label: 'Filter' },
  { value: 'Edit', label: 'Edit' },
];

/** Available capability requirements */
const CAPABILITY_OPTIONS: Array<{ value: RoleCapabilityRequirement; label: string }> = [
  { value: 'text', label: 'Text Generation' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'function_calling', label: 'Tool Calling' },
  { value: 'vision', label: 'Vision' },
  { value: 'creative', label: 'Creative' },
  { value: 'precise', label: 'Precise' },
  { value: 'fast', label: 'Fast' },
  { value: 'cheap', label: 'Cost-Effective' },
  { value: 'web_search', label: 'Web Search' },
];

// ==================== Component ====================

interface CreateTeamModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (team: Omit<ITeamSet, 'id' | 'createdAt' | 'updatedAt' | 'isPreset'>) => void;
  /** If editing an existing team, pass it here */
  editTeam?: ITeamSet | null;
}

const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ visible, onCancel, onSubmit, editTeam }) => {
  const { t } = useTranslation();

  const [name, setName] = useState(editTeam?.name || '');
  const [description, setDescription] = useState(editTeam?.description || '');
  const [icon, setIcon] = useState(editTeam?.icon || 'Code');
  const [roles, setRoles] = useState<ITeamRole[]>(
    editTeam?.roles || [
      {
        id: `role-${Date.now()}`,
        name: '',
        description: '',
        icon: 'CodeBrackets',
        requirements: ['text'],
        modelRef: '',
      },
    ]
  );

  // Reset form when modal opens/closes or editTeam changes
  React.useEffect(() => {
    if (visible) {
      setName(editTeam?.name || '');
      setDescription(editTeam?.description || '');
      setIcon(editTeam?.icon || 'Code');
      setRoles(
        editTeam?.roles || [
          {
            id: `role-${Date.now()}`,
            name: '',
            description: '',
            icon: 'CodeBrackets',
            requirements: ['text'],
            modelRef: '',
          },
        ]
      );
    }
  }, [visible, editTeam]);

  const addRole = useCallback(() => {
    setRoles((prev) => [
      ...prev,
      {
        id: `role-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: '',
        description: '',
        icon: 'CodeBrackets',
        requirements: ['text'],
        modelRef: '',
      },
    ]);
  }, []);

  const removeRole = useCallback((roleId: string) => {
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
  }, []);

  const updateRole = useCallback((roleId: string, updates: Partial<ITeamRole>) => {
    setRoles((prev) => prev.map((r) => (r.id === roleId ? { ...r, ...updates } : r)));
  }, []);

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (roles.length === 0) return;
    if (roles.some((r) => !r.name.trim())) return;

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      icon,
      roles,
    });
  };

  const isValid = name.trim() && roles.length > 0 && roles.every((r) => r.name.trim());

  return (
    <Modal
      visible={visible}
      onCancel={onCancel}
      title={editTeam ? t('teamModelsConfig.editTeam') : t('teamModelsConfig.createTeam')}
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
      <div className='flex flex-col gap-16px max-h-60vh overflow-y-auto pr-8px'>
        {/* Team Name */}
        <div>
          <label className='text-13px font-500 text-t-secondary mb-6px block'>
            {t('teamModelsConfig.teamName')} *
          </label>
          <Input
            value={name}
            onChange={setName}
            placeholder={t('teamModelsConfig.teamNamePlaceholder')}
            maxLength={50}
          />
        </div>

        {/* Team Description */}
        <div>
          <label className='text-13px font-500 text-t-secondary mb-6px block'>
            {t('teamModelsConfig.teamDescription')}
          </label>
          <Input.TextArea
            value={description}
            onChange={setDescription}
            placeholder={t('teamModelsConfig.teamDescriptionPlaceholder')}
            maxLength={200}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </div>

        {/* Team Icon */}
        <div>
          <label className='text-13px font-500 text-t-secondary mb-6px block'>
            {t('teamModelsConfig.teamIcon')}
          </label>
          <Select value={icon} onChange={setIcon} className='w-full'>
            {ROLE_ICONS.map((opt) => (
              <Select.Option key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Option>
            ))}
          </Select>
        </div>

        <Divider className='!my-4px' />

        {/* Roles */}
        <div>
          <div className='flex items-center justify-between mb-12px'>
            <label className='text-13px font-500 text-t-secondary'>
              {t('teamModelsConfig.roles')} *
            </label>
            <Button type='text' size='mini' icon={<Plus size='14' />} onClick={addRole}>
              {t('teamModelsConfig.addRole')}
            </Button>
          </div>

          <div className='space-y-12px'>
            {roles.map((role, index) => (
              <div
                key={role.id}
                className='p-12px rd-8px border border-[var(--color-border-2)] bg-[var(--fill-0)]'
              >
                <div className='flex items-center justify-between mb-8px'>
                  <span className='text-12px font-500 text-t-secondary'>
                    {t('teamModelsConfig.role')} {index + 1}
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
                    <div>
                      <label className='text-12px text-t-secondary mb-4px block'>
                        {t('teamModelsConfig.roleName')} *
                      </label>
                      <Input
                        value={role.name}
                        onChange={(val) => updateRole(role.id, { name: val })}
                        placeholder={t('teamModelsConfig.roleNamePlaceholder')}
                        size='small'
                      />
                    </div>
                    <div>
                      <label className='text-12px text-t-secondary mb-4px block'>
                        {t('teamModelsConfig.roleIcon')}
                      </label>
                      <Select
                        value={role.icon}
                        onChange={(val) => updateRole(role.id, { icon: val })}
                        size='small'
                        className='w-full'
                      >
                        {ROLE_ICONS.map((opt) => (
                          <Select.Option key={opt.value} value={opt.value}>
                            {opt.label}
                          </Select.Option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div>
                    <label className='text-12px text-t-secondary mb-4px block'>
                      {t('teamModelsConfig.roleDescription')}
                    </label>
                    <Input
                      value={role.description}
                      onChange={(val) => updateRole(role.id, { description: val })}
                      placeholder={t('teamModelsConfig.roleDescriptionPlaceholder')}
                      size='small'
                    />
                  </div>

                  <div>
                    <label className='text-12px text-t-secondary mb-4px block'>
                      {t('teamModelsConfig.capabilityRequirements')}
                    </label>
                    <Select
                      mode='multiple'
                      value={role.requirements}
                      onChange={(val) => updateRole(role.id, { requirements: val as RoleCapabilityRequirement[] })}
                      size='small'
                      className='w-full'
                      maxTagCount={4}
                    >
                      {CAPABILITY_OPTIONS.map((opt) => (
                        <Select.Option key={opt.value} value={opt.value}>
                          {opt.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CreateTeamModal;
