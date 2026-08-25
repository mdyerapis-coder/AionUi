/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Button, Input, Message, Popconfirm, Space, Table, Tag, Typography } from '@arco-design/web-react';
import { Link, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { shell } from '@/common/adapter/ipcBridge';
import type { ResourceTrackerProvider, ResourceTrackerProviderId } from '@/common/types/provider/resourceTracker';
import SettingsPageHeader from '../../components/SettingsPageHeader';
import SettingsPageWrapper from '../../components/SettingsPageWrapper';
import { useResourceTracker } from './useResourceTracker';

const PROVIDER_NAMES: Record<ResourceTrackerProviderId, string> = {
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
};

const formatMoney = (amount: number, currency: string): string =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);

const ResourceTracker: React.FC = () => {
  const { t } = useTranslation();
  const [message, messageContext] = Message.useMessage();
  const [keys, setKeys] = useState<Partial<Record<ResourceTrackerProviderId, string>>>({});
  const { providers, loading, busyProvider, refreshAll, saveCredential, removeCredential, refreshProvider } =
    useResourceTracker();

  const rows = useMemo(
    () =>
      providers.map((provider) => ({
        ...provider,
        providerName: PROVIDER_NAMES[provider.providerId],
      })),
    [providers]
  );

  const statusTag = (provider: ResourceTrackerProvider) => {
    const colors = {
      unconfigured: 'gray',
      unchecked: 'blue',
      available: 'green',
      unavailable: 'orange',
      error: 'red',
    } as const;
    return <Tag color={colors[provider.status]}>{t(`settings.resourceTrackerConfig.status.${provider.status}`)}</Tag>;
  };

  const handleSave = async (providerId: ResourceTrackerProviderId) => {
    const apiKey = keys[providerId]?.trim();
    if (!apiKey) {
      message.warning(t('settings.resourceTrackerConfig.keyRequired'));
      return;
    }
    try {
      await saveCredential(providerId, apiKey);
      setKeys((current) => ({ ...current, [providerId]: '' }));
      message.success(t('settings.resourceTrackerConfig.saved'));
    } catch {
      message.error(t('settings.resourceTrackerConfig.operationFailed'));
    }
  };

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      {messageContext}
      <SettingsPageHeader
        title={t('settings.resourceTracker')}
        description={t('settings.resourceTrackerConfig.description')}
        actions={
          <Button icon={<Refresh />} loading={loading} onClick={() => void refreshAll()}>
            {t('common.refresh')}
          </Button>
        }
      />

      <div className='mt-24px'>
        <Table
          rowKey='providerId'
          loading={loading}
          pagination={false}
          data={rows}
          scroll={{ x: 1080 }}
          columns={[
            {
              title: t('settings.resourceTrackerConfig.provider'),
              dataIndex: 'providerName',
              width: 130,
            },
            {
              title: t('common.status'),
              width: 130,
              render: (_value, provider) => statusTag(provider),
            },
            {
              title: t('settings.resourceTrackerConfig.balance'),
              width: 170,
              render: (_value, provider) =>
                provider.balances.length > 0
                  ? provider.balances.map((balance) => formatMoney(balance.amount, balance.currency)).join(', ')
                  : t(
                      provider.detail === 'balanceUnavailable'
                        ? 'settings.resourceTrackerConfig.balanceUnavailable'
                        : 'settings.resourceTrackerConfig.notAvailable'
                    ),
            },
            {
              title: t('settings.resourceTrackerConfig.usage'),
              width: 130,
              render: (_value, provider) =>
                provider.usage
                  ? formatMoney(provider.usage.amount, provider.usage.currency)
                  : t('settings.resourceTrackerConfig.notAvailable'),
            },
            {
              title: t('settings.resourceTrackerConfig.models'),
              dataIndex: 'modelCount',
              width: 90,
            },
            {
              title: t('settings.resourceTrackerConfig.lastChecked'),
              width: 180,
              render: (_value, provider) =>
                provider.checkedAt
                  ? new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(
                      provider.checkedAt
                    )
                  : t('settings.resourceTrackerConfig.never'),
            },
            {
              title: t('settings.apiKey'),
              width: 300,
              render: (_value, provider) => (
                <Space direction='vertical' className='w-full'>
                  <Input.Password
                    value={keys[provider.providerId] ?? ''}
                    placeholder={
                      provider.configured
                        ? t('settings.resourceTrackerConfig.replaceKeyPlaceholder')
                        : t('settings.apiKeyPlaceholder')
                    }
                    onChange={(value) => setKeys((current) => ({ ...current, [provider.providerId]: value }))}
                  />
                  <Space wrap>
                    <Button
                      type='primary'
                      size='small'
                      loading={busyProvider === provider.providerId}
                      onClick={() => void handleSave(provider.providerId)}
                    >
                      {t('common.save')}
                    </Button>
                    <Button
                      size='small'
                      icon={<Refresh />}
                      disabled={!provider.configured}
                      loading={busyProvider === provider.providerId}
                      onClick={() => void refreshProvider(provider.providerId)}
                    >
                      {t('common.refresh')}
                    </Button>
                    <Button
                      size='small'
                      icon={<Link />}
                      onClick={() => void shell.openExternal.invoke(provider.dashboardUrl)}
                    >
                      {t('settings.resourceTrackerConfig.dashboard')}
                    </Button>
                    {provider.configured ? (
                      <Popconfirm
                        title={t('settings.resourceTrackerConfig.removeConfirm')}
                        onOk={() => void removeCredential(provider.providerId)}
                      >
                        <Button size='small' status='danger'>
                          {t('common.remove')}
                        </Button>
                      </Popconfirm>
                    ) : null}
                  </Space>
                  {provider.detail ? (
                    <Typography.Text type={provider.status === 'error' ? 'error' : 'secondary'}>
                      {t(`settings.resourceTrackerConfig.detail.${provider.detail}`)}
                    </Typography.Text>
                  ) : null}
                </Space>
              ),
            },
          ]}
        />
        <Typography.Paragraph type='secondary' className='mt-16px'>
          {t('settings.resourceTrackerConfig.securityNote')}
        </Typography.Paragraph>
      </div>
    </SettingsPageWrapper>
  );
};

export default ResourceTracker;
