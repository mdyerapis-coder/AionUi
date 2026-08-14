/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * TeamRoleCard — Visual role card with model dropdown and smart suggestion.
 *
 * Displays an agent role (e.g., Architect, Coder, Reviewer) with:
 * - Role icon, name, and description
 * - A dropdown to select the assigned model from available providers
 * - A "Smart Suggestion" badge that shows the top recommended model
 * - A tooltip explaining why the model is recommended
 */

import type { IProvider } from '@/common/config/storage';
import { Button, Select, Tag, Tooltip } from '@arco-design/web-react';
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
import type { ITeamRole, IModelSuggestion } from '@/renderer/utils/teamModelPresets';
import { formatModelRef, generateSuggestions, getProviderNameForRef } from '@/renderer/utils/teamModelPresets';

// ==================== Icon Map ====================

const ROLE_ICON_MAP: Record<string, React.ReactNode> = {
  Architecture: <Block theme='outline' size='20' />,
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

// ==================== Component ====================

interface TeamRoleCardProps {
  /** The role configuration */
  role: ITeamRole;
  /** Available providers for model selection */
  providers: IProvider[];
  /** Currently assigned model ref */
  modelRef: string;
  /** Callback when model assignment changes */
  onAssignModel: (modelRef: string) => void;
}

const TeamRoleCard: React.FC<TeamRoleCardProps> = ({ role, providers, modelRef, onAssignModel }) => {
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Build model options for the dropdown
  const modelOptions = useMemo(() => {
    const options: Array<{ label: string; value: string; providerName: string }> = [];

    for (const provider of providers) {
      if (provider.enabled === false) continue;

      for (const modelName of provider.models) {
        if (provider.model_enabled?.[modelName] === false) continue;

        options.push({
          label: `${provider.name} / ${modelName}`,
          value: `${provider.id}::${modelName}`,
          providerName: provider.name,
        });
      }
    }

    return options;
  }, [providers]);

  // Generate suggestions for this role
  const suggestions = useMemo(() => generateSuggestions(role, providers), [role, providers]);

  // Top suggestion for the badge
  const topSuggestion = suggestions[0];

  // Currently assigned model display
  const currentModelName = formatModelRef(modelRef);
  const currentProviderName = getProviderNameForRef(modelRef, providers);
  const isAssigned = !!modelRef && modelRef !== '';

  // Icon for the role
  const roleIcon = ROLE_ICON_MAP[role.icon] || <CodeBrackets theme='outline' size='20' />;

  return (
    <div className='flex flex-col gap-12px p-16px rd-12px border border-[var(--color-border-2)] bg-[var(--color-bg-2)] hover:border-[var(--color-border-3)] transition-colors'>
      {/* Role Header */}
      <div className='flex items-start gap-12px'>
        <div className='flex items-center justify-center w-40px h-40px rd-10px bg-[rgba(var(--primary-6),0.1)] text-[rgb(var(--primary-6))] shrink-0'>
          {roleIcon}
        </div>
        <div className='flex-1 min-w-0'>
          <div className='flex items-center gap-8px'>
            <span className='text-15px font-600 text-t-primary'>{t(role.name)}</span>
            {topSuggestion && topSuggestion.score >= 60 && (
              <Tooltip
                content={
                  <div className='max-w-280px'>
                    <div className='font-500 mb-4px'>{topSuggestion.modelName}</div>
                    <div className='text-12px opacity-80'>{topSuggestion.rationale}</div>
                    <div className='text-12px mt-4px opacity-60'>
                      Match score: {topSuggestion.score}%
                    </div>
                  </div>
                }
              >
                <Tag
                  size='small'
                  color='purple'
                  className='cursor-help shrink-0 flex items-center gap-2px'
                >
                  <Star size='12' />
                  {t('teamModelsConfig.smartSuggestion')}
                </Tag>
              </Tooltip>
            )}
          </div>
          <p className='text-13px text-t-secondary mt-2px leading-20px'>{t(role.description)}</p>
        </div>
      </div>

      {/* Model Selector */}
      <div className='flex flex-col gap-8px'>
        <div className='flex items-center justify-between'>
          <span className='text-12px font-500 text-t-secondary uppercase tracking-wide'>
            {t('teamModelsConfig.assignedModel')}
          </span>
          {topSuggestion && (
            <Button
              type='text'
              size='mini'
              className='!text-[rgb(var(--primary-6))] !text-12px'
              icon={<Star size='12' />}
              onClick={() => {
                if (topSuggestion.modelRef) {
                  onAssignModel(topSuggestion.modelRef);
                }
              }}
            >
              {t('teamModelsConfig.applyBest')}
            </Button>
          )}
        </div>

        <Select
          value={isAssigned ? modelRef : undefined}
          placeholder={t('teamModelsConfig.selectModel')}
          onChange={(value) => onAssignModel(value as string)}
          allowClear
          onClear={() => onAssignModel('')}
          showSearch
          filterOption={(inputValue, option) => {
            const props = (option as React.ReactElement)?.props as { value?: string; children?: string };
            const label = props?.children ?? String(props?.value ?? '');
            return label.toLowerCase().includes(inputValue.toLowerCase());
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

        {/* Assigned model indicator */}
        {isAssigned && currentProviderName && (
          <div className='flex items-center gap-6px text-12px text-t-secondary'>
            <div className='w-6px h-6px rd-full bg-green-500 shrink-0' />
            <span className='truncate'>
              {currentProviderName} — {currentModelName}
            </span>
          </div>
        )}
      </div>

      {/* Suggestions List (expandable) */}
      {suggestions.length > 0 && (
        <div>
          <button
            className='text-12px text-[rgb(var(--primary-6))] hover:text-[rgb(var(--primary-5))] cursor-pointer bg-transparent border-0 p-0 flex items-center gap-4px'
            onClick={() => setShowSuggestions(!showSuggestions)}
          >
            <Star size='11' />
            {showSuggestions
              ? t('teamModelsConfig.hideSuggestions')
              : t('teamModelsConfig.showSuggestions', { count: Math.min(suggestions.length, 5) })}
          </button>

          {showSuggestions && (
            <div className='mt-8px space-y-6px'>
              {suggestions.slice(0, 5).map((s) => (
                <SuggestionRow
                  key={s.modelRef}
                  suggestion={s}
                  isActive={modelRef === s.modelRef}
                  onSelect={() => onAssignModel(s.modelRef)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== Suggestion Row ====================

interface SuggestionRowProps {
  suggestion: IModelSuggestion;
  isActive: boolean;
  onSelect: () => void;
}

const SuggestionRow: React.FC<SuggestionRowProps> = ({ suggestion, isActive, onSelect }) => {
  return (
    <div
      className={`flex items-center gap-8px p-8px rd-8px cursor-pointer transition-colors ${
        isActive
          ? 'bg-[rgba(var(--primary-6),0.1)] border border-[rgba(var(--primary-6),0.3)]'
          : 'bg-[var(--fill-0)] hover:bg-[var(--fill-1)] border border-transparent'
      }`}
      onClick={onSelect}
    >
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-6px'>
          <span className='text-13px font-500 text-t-primary truncate'>
            {suggestion.modelName}
          </span>
          <span className='text-11px text-t-secondary shrink-0'>
            {suggestion.providerName}
          </span>
        </div>
        <div className='text-11px text-t-secondary mt-2px truncate'>{suggestion.rationale}</div>
      </div>

      <div className='flex items-center gap-6px shrink-0'>
        {/* Health indicator */}
        <div
          className={`w-6px h-6px rd-full ${suggestion.isHealthy ? 'bg-green-500' : 'bg-gray-400'}`}
        />
        {/* Score badge */}
        <div
          className={`text-11px font-500 px-6px py-2px rd-4px ${
            suggestion.score >= 80
              ? 'bg-green-100 text-green-700'
              : suggestion.score >= 50
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-600'
          }`}
        >
          {suggestion.score}%
        </div>
      </div>
    </div>
  );
};

export default TeamRoleCard;
