import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import { isElectronDesktop, resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { type IExtensionSettingsTab } from '@/common/adapter/ipcBridge';
import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';
import { useExtensionSettingsTabs } from '@/renderer/hooks/system/useExtensionSettingsTabs';
import {
  Cat,
  ChartLine,
  Communication,
  Computer,
  Earth,
  Inbox,
  Info,
  Lightning,
  LinkCloud,
  People,
  Puzzle,
  Speed,
  System,
  Toolkit,
} from '@icon-park/react';
import classNames from 'classnames';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tooltip } from '@arco-design/web-react';
import { getSiderTooltipProps } from '@/renderer/utils/ui/siderTooltip';

/** Builtin settings tab IDs in display order (must match router paths). */
export const BUILTIN_TAB_IDS = [
  'agent',
  'model',
  'resourceTracker',
  'teamModels',
  'skills',
  'tools',
  'appearance',
  'webui',
  'pet',
  'system',
  'archived',
  'about',
] as const;

/**
 * Legacy anchor IDs that have been merged into other tabs.
 * When an extension anchors to one of these, it is redirected to the new host.
 * This keeps older extensions working without requiring them to update.
 */
export const LEGACY_ANCHOR_REMAP: Record<string, string> = {
  'skills-hub': 'skills',
  capabilities: 'skills',
  display: 'appearance',
};

/**
 * Group headers displayed above specific builtin tabs.
 * The header is rendered once, immediately before the first item whose id matches.
 * Extension tabs anchored between these builtins inherit the enclosing group visually.
 */
const GROUP_HEADER_BEFORE: Record<string, string> = {
  agent: 'settings.groupAiCore',
  appearance: 'settings.groupApp',
  archived: 'settings.archived.title',
  about: 'settings.groupAbout',
};

export type SettingsNavItem = {
  id: string;
  label: string;
  icon: React.ReactElement;
  isImageIcon?: boolean;
  /** Route path segment — for builtins: `/settings/{path}`, for extensions: `/settings/ext/{id}` */
  path: string;
};

type TranslateFn = (key: string, options?: { defaultValue?: string }) => string;

const navIcon = (
  Icon: React.ComponentType<{ theme?: string; size?: string | number; strokeWidth?: number }>
): React.ReactElement => <Icon theme='outline' size='16' strokeWidth={3} />;

export type SettingsNavList = {
  items: SettingsNavItem[];
  /**
   * How many extension tabs were spliced immediately before each builtin anchor.
   * The sider uses this to place a group header above those leading tabs.
   */
  leadingExtensionCount: ReadonlyMap<string, number>;
};

/**
 * Ordered settings navigation shared by the desktop sider and the mobile top nav.
 * `pet` is desktop-only. Off desktop, the WebUI item uses the remote-session icon.
 * Extension tabs are spliced at their anchors; unknown anchors land before System.
 */
export function buildSettingsNavItems(
  isDesktop: boolean,
  t: TranslateFn,
  extensionTabs: readonly IExtensionSettingsTab[],
  resolveExtTabName: (tab: IExtensionSettingsTab) => string
): SettingsNavList {
  const builtinMap: Record<string, SettingsNavItem> = {
    model: { id: 'model', label: t('settings.model'), icon: navIcon(LinkCloud), path: 'model' },
    resourceTracker: {
      id: 'resourceTracker',
      label: t('settings.resourceTracker'),
      icon: navIcon(ChartLine),
      path: 'resourceTracker',
    },
    teamModels: {
      id: 'teamModels',
      label: t('settings.teamModels', { defaultValue: 'Team Models' }),
      icon: navIcon(People),
      path: 'teamModels',
    },
    agent: {
      id: 'agent',
      label: t('settings.agents', { defaultValue: 'Agents' }),
      icon: navIcon(Speed),
      path: 'agent',
    },
    skills: {
      id: 'skills',
      label: t('settings.skills', { defaultValue: 'Skills' }),
      icon: navIcon(Lightning),
      path: 'skills',
    },
    tools: {
      id: 'tools',
      label: t('settings.tools', { defaultValue: 'Tools' }),
      icon: navIcon(Toolkit),
      path: 'tools',
    },
    appearance: {
      id: 'appearance',
      label: t('settings.appearancePanel'),
      icon: navIcon(Computer),
      path: 'appearance',
    },
    webui: {
      id: 'webui',
      label: t('settings.webui'),
      icon: navIcon(isDesktop ? Earth : Communication),
      path: 'webui',
    },
    pet: { id: 'pet', label: t('pet.desktopPet'), icon: navIcon(Cat), path: 'pet' },
    system: { id: 'system', label: t('settings.system'), icon: navIcon(System), path: 'system' },
    archived: {
      id: 'archived',
      label: t('settings.archived.navLabel'),
      icon: navIcon(Inbox),
      path: 'archived',
    },
    about: { id: 'about', label: t('settings.about'), icon: navIcon(Info), path: 'about' },
  };

  const items: SettingsNavItem[] = BUILTIN_TAB_IDS.filter((id) => isDesktop || id !== 'pet').map(
    (id) => builtinMap[id]
  );

  const beforeMap = new Map<string, IExtensionSettingsTab[]>();
  const afterMap = new Map<string, IExtensionSettingsTab[]>();
  const unanchored: IExtensionSettingsTab[] = [];

  for (const tab of extensionTabs) {
    if (!tab.position) {
      unanchored.push(tab);
      continue;
    }
    const { relativeTo: rawAnchor, placement } = tab.position;
    const anchor = LEGACY_ANCHOR_REMAP[rawAnchor] ?? rawAnchor;
    if (!items.some((item) => item.id === anchor)) {
      unanchored.push(tab);
      continue;
    }
    const map = placement === 'before' ? beforeMap : afterMap;
    let list = map.get(anchor);
    if (!list) {
      list = [];
      map.set(anchor, list);
    }
    list.push(tab);
  }

  const toNavItem = (tab: IExtensionSettingsTab): SettingsNavItem => {
    const resolvedIcon = resolveExtensionAssetUrl(tab.icon) || tab.icon;
    return {
      id: tab.id,
      label: resolveExtTabName(tab),
      icon: resolvedIcon ? <img src={resolvedIcon} alt='' className='w-full h-full object-contain' /> : navIcon(Puzzle),
      isImageIcon: Boolean(resolvedIcon),
      path: `ext/${tab.id}`,
    };
  };

  for (let i = items.length - 1; i >= 0; i--) {
    const builtinId = items[i].id;
    const afters = afterMap.get(builtinId);
    if (afters) {
      items.splice(i + 1, 0, ...afters.map(toNavItem));
    }
    const befores = beforeMap.get(builtinId);
    if (befores) {
      items.splice(i, 0, ...befores.map(toNavItem));
    }
  }

  if (unanchored.length > 0) {
    const systemIdx = items.findIndex((item) => item.id === 'system');
    const insertIdx = systemIdx >= 0 ? systemIdx : items.length;
    items.splice(insertIdx, 0, ...unanchored.map(toNavItem));
  }

  const leadingExtensionCount = new Map<string, number>();
  for (const [anchor, tabs] of beforeMap) {
    leadingExtensionCount.set(anchor, tabs.length);
  }

  return { items, leadingExtensionCount };
}

const SettingsSider: React.FC<{ collapsed?: boolean; tooltipEnabled?: boolean }> = ({
  collapsed = false,
  tooltipEnabled = false,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isDesktop = isElectronDesktop();

  const extensionTabs = useExtensionSettingsTabs();
  const { resolveExtTabName } = useExtI18n();

  const { menus, groupHeaderAt } = useMemo(() => {
    const { items, leadingExtensionCount } = buildSettingsNavItems(isDesktop, t, extensionTabs, resolveExtTabName);

    // A header must appear before the first *visible* item of its group, which may
    // be an extension tab anchored with placement='before' to the group's first
    // builtin — not the builtin itself. Otherwise such an extension would render
    // above the header and visually belong to the previous group.
    const headerAt = new Map<number, string>();
    for (const [builtinId, headerKey] of Object.entries(GROUP_HEADER_BEFORE)) {
      const builtinIdx = items.findIndex((item) => item.id === builtinId);
      if (builtinIdx < 0) continue;
      const beforeCount = leadingExtensionCount.get(builtinId) ?? 0;
      headerAt.set(builtinIdx - beforeCount, headerKey);
    }

    return { menus: items, groupHeaderAt: headerAt };
  }, [t, isDesktop, extensionTabs, resolveExtTabName]);

  const siderTooltipProps = getSiderTooltipProps(tooltipEnabled);
  return (
    <div
      className={classNames('h-full settings-sider flex flex-col gap-2px overflow-y-auto overflow-x-hidden', {
        'settings-sider--collapsed': collapsed,
      })}
    >
      {menus.map((item, index) => {
        const isSelected = pathname.includes(item.path);
        const groupHeaderKey = groupHeaderAt.get(index);
        const groupHeader =
          groupHeaderKey && !collapsed ? (
            <div className='settings-sider__group-header px-12px mt-8px h-28px flex items-center text-14px font-[500] text-t-tertiary select-none'>
              {t(groupHeaderKey)}
            </div>
          ) : null;
        return (
          <React.Fragment key={item.id}>
            {groupHeader}
            <Tooltip {...siderTooltipProps} content={item.label} position='right'>
              <div
                data-settings-id={item.id}
                data-settings-path={item.path}
                className={classNames(
                  'settings-sider__item h-34px rd-8px flex items-center gap-8px group cursor-pointer relative overflow-hidden shrink-0 conversation-item [&.conversation-item+&.conversation-item]:mt-2px transition-colors',
                  collapsed ? 'w-full justify-center px-0' : 'justify-start px-10px',
                  {
                    'hover:bg-fill-3': !isSelected,
                    '!bg-fill-3': isSelected,
                  }
                )}
                onClick={() => {
                  Promise.resolve(navigate(`/settings/${item.path}`, { replace: true })).catch((error) => {
                    console.error('Navigation failed:', error);
                  });
                }}
              >
                {/* Leading icon — 22px slot to align with main sider rows */}
                <span className='size-22px flex items-center justify-center shrink-0 line-height-0'>
                  {item.isImageIcon ? (
                    <span className='w-16px h-16px flex items-center justify-center'>{item.icon}</span>
                  ) : (
                    React.cloneElement(
                      item.icon as React.ReactElement<{
                        theme?: string;
                        size?: string | number;
                        className?: string;
                        strokeWidth?: number;
                      }>,
                      {
                        theme: 'outline',
                        size: '16',
                        strokeWidth: 3,
                        className: 'block leading-none text-t-secondary',
                      }
                    )
                  )}
                </span>
                <FlexFullContainer className='h-24px collapsed-hidden'>
                  <div className='settings-sider__item-label text-nowrap overflow-hidden inline-block w-full text-14px font-[500] lh-24px whitespace-nowrap text-t-primary'>
                    {item.label}
                  </div>
                </FlexFullContainer>
              </div>
            </Tooltip>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default SettingsSider;
