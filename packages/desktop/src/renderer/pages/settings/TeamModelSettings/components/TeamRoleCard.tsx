/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';
import { Button, Select, Tag } from '@arco-design/web-react';
import {
  Block,
  BookOpen,
  ChartLine,
  CheckCorrect,
  CodeBrackets,
  DocSearch,
  Edit,
  FileWord,
  Filter,
  PreviewOpen,
  Search,
  Star,
  Translate,
  Write,
} from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type IModelSuggestion,
  type ITeamRole,
  type RoleIconName,
  formatModelRef,
  generateSuggestions,
  getProviderNameForRef,
  resolveRoleIconName,
  toTeamLabelKey,
} from '../teamModelPresets';

const ROLE_ICON_MAP: Record<RoleIconName, React.ReactNode> = {
  Block: <Block theme='outline' size='20' />,
  CodeBrackets: <CodeBrackets theme='outline' size='20' />,
  PreviewOpen: <PreviewOpen theme='outline' size='20' />,
  DocSearch: <DocSearch theme='outline' size='20' />,
  Write: <Write theme='outline' size='20' />,
  CheckCorrect: <CheckCorrect theme='outline' size='20' />,
  Search: <Search theme='outline' size='20' />,
  Translate: <Translate theme='outline' size='20' />,
  ChartLine: <ChartLine theme='outline' size='20' />,
  BookOpen: <BookOpen theme='outline' size='20' />,
  FileWord: <FileWord theme='outline' size='20' />,
  Filter: <Filter theme='outline' size='20' />,
  Edit: <Edit theme='outline' size='20' />,
};

type TeamRoleCardProps = {
  role: ITeamRole;
  providers: IProvider[];
  modelRef: string;
  onAssignModel: (modelRef: string) => void;
};

const TeamRoleCard: React.FC<TeamRoleCardProps> = ({ role, providers, modelRef, onAssignModel }) => {
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const label = (value: string) => {
    const key = toTeamLabelKey(value);
    return key ? t(key) : value;
  };

  const modelOptions = useMemo(() => {
    const options: Array<{ label: string; value: string }> = [];

    for (const provider of providers) {
      if (provider.enabled === false) continue;

      for (const modelName of provider.models) {
        if (provider.model_enabled?.[modelName] === false) continue;
        options.push({
          label: `${provider.name} / ${modelName}`,
          value: `${provider.id}::${modelName}`,
        });
      }
    }

    return options;
  }, [providers]);

  const suggestions = useMemo(() => generateSuggestions(providers), [providers]);
  const topSuggestion = suggestions[0];
  const currentModelName = formatModelRef(modelRef);
  const currentProviderName = getProviderNameForRef(modelRef, providers);
  const isAssigned = modelRef !== '';
  const roleIcon = ROLE_ICON_MAP[resolveRoleIconName(role.icon)];

  return (
    <div className='flex flex-col gap-12px p-16px rd-12px border border-b-base bg-2 hover:border-b-light transition-colors'>
      <div className='flex items-start gap-12px'>
        <div className='flex items-center justify-center w-40px h-40px rd-10px bg-primary-light-1 text-primary-6 shrink-0'>
          {roleIcon}
        </div>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-15px font-600 text-t-primary'>{label(role.name)}</span>
            {topSuggestion && (
              <Tag size='small' color='purple' className='shrink-0 flex items-center gap-2px'>
                <Star size='12' />
                {t('settings.teamModelsConfig.smartSuggestion')}
              </Tag>
            )}
          </div>
          <p className='text-13px text-t-secondary mt-2px leading-20px'>{label(role.description)}</p>
        </div>
      </div>

      <div className='flex flex-col gap-8px'>
        <div className='flex items-center justify-between'>
          <span className='text-12px font-500 text-t-secondary uppercase tracking-wide'>
            {t('settings.teamModelsConfig.assignedModel')}
          </span>
          {topSuggestion && (
            <Button
              type='text'
              size='mini'
              className='!text-primary-6 !text-12px'
              icon={<Star size='12' />}
              onClick={() => onAssignModel(topSuggestion.modelRef)}
            >
              {t('settings.teamModelsConfig.applyBest')}
            </Button>
          )}
        </div>

        <Select
          value={isAssigned ? modelRef : undefined}
          placeholder={t('settings.teamModelsConfig.selectModel')}
          onChange={(value) => onAssignModel(value as string)}
          allowClear
          onClear={() => onAssignModel('')}
          showSearch
          filterOption={(inputValue, option) => {
            const props = (option as React.ReactElement)?.props as { value?: string; children?: string };
            const optionLabel = props?.children ?? String(props?.value ?? '');
            return optionLabel.toLowerCase().includes(inputValue.toLowerCase());
          }}
          className='w-full'
          size='default'
          triggerProps={{
            autoAlignPopupWidth: false,
            autoAlignPopupMinWidth: true,
            position: 'bl',
          }}
        >
          {modelOptions.map((option) => (
            <Select.Option key={option.value} value={option.value}>
              <div className='flex items-center justify-between gap-8px'>
                <span className='truncate'>{option.label}</span>
              </div>
            </Select.Option>
          ))}
        </Select>

        {isAssigned && (
          <div className='flex items-center gap-6px text-12px text-t-secondary'>
            <div className='w-6px h-6px rd-full bg-success shrink-0' />
            <span className='truncate'>
              {currentProviderName ? `${currentProviderName} — ` : ''}
              {currentModelName || t('settings.teamModelsConfig.notAssigned')}
            </span>
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div>
          <Button
            type='text'
            size='mini'
            className='!px-0 !text-12px !text-primary-6 hover:!text-primary-5'
            icon={<Star size='11' />}
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            {showSuggestions
              ? t('settings.teamModelsConfig.hideSuggestions')
              : t('settings.teamModelsConfig.showSuggestions', { count: Math.min(suggestions.length, 5) })}
          </Button>

          {showSuggestions && (
            <div className='mt-8px space-y-6px'>
              {suggestions.slice(0, 5).map((suggestion) => (
                <SuggestionRow
                  key={suggestion.modelRef}
                  suggestion={suggestion}
                  isActive={modelRef === suggestion.modelRef}
                  onSelect={() => onAssignModel(suggestion.modelRef)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type SuggestionRowProps = {
  suggestion: IModelSuggestion;
  isActive: boolean;
  onSelect: () => void;
};

const SuggestionRow: React.FC<SuggestionRowProps> = ({ suggestion, isActive, onSelect }) => {
  return (
    <div
      className={`flex items-center gap-8px p-8px rd-8px cursor-pointer transition-colors ${
        isActive ? 'bg-primary-light-1 border border-primary' : 'bg-fill-0 hover:bg-fill-1 border border-transparent'
      }`}
      onClick={onSelect}
    >
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-6px'>
          <span className='text-13px font-500 text-t-primary truncate'>{suggestion.modelName}</span>
          <span className='text-11px text-t-secondary shrink-0'>{suggestion.providerName}</span>
        </div>
      </div>
      <div className={`w-6px h-6px rd-full shrink-0 ${suggestion.isHealthy ? 'bg-success' : 'bg-t-disabled'}`} />
    </div>
  );
};

export default TeamRoleCard;
