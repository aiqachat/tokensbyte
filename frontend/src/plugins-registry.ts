/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { lazy } from 'react';

// Safely lazy load a component, returning a dummy if the file doesn't exist
// By using import.meta.glob, Vite will not throw build errors if the target directory is deleted.
const pluginComponents = import.meta.glob('./pages/Plugins/**/*.tsx');
const pageComponents = import.meta.glob('./pages/**/*.tsx');

const missingModule = () =>
  React.createElement(
    'div',
    { style: { padding: '20px', textAlign: 'center', color: '#666' } },
    'Plugin module is not installed or has been removed.'
  );

const loadPluginComponent = (path: string) => {
  const importFn = pluginComponents[`./pages/Plugins/${path}`];
  if (importFn) {
    return lazy(importFn as any);
  }
  return missingModule;
};

const loadPageComponent = (path: string) => {
  const importFn = pageComponents[`./pages/${path}`];
  if (importFn) {
    return lazy(importFn as any);
  }
  return missingModule;
};

export const RelayAPI = loadPluginComponent('DocsApi/RelayAPI.tsx');
export const PluginsList = loadPluginComponent('PluginsList.tsx');
export const PluginConfig = loadPluginComponent('PluginConfig.tsx');
export const ArkUserDashboard = loadPluginComponent('VolcengineArkMonitor/ArkUserDashboard.tsx');

// PluginConfig internal dependencies
export const AdminPresetAssets = loadPluginComponent('AssetManager/AdminPresetAssets.tsx');
export const RelayConvertAssets = loadPluginComponent('AssetManager/RelayConvertAssets.tsx');
export const ApiProxyAssets = loadPluginComponent('AssetManager/ApiProxyAssets.tsx');
export const ApiAccessConfig = loadPluginComponent('AssetManager/ApiAccessConfig.tsx');

export const TeamConfig = loadPluginComponent('TeamMarketing/TeamConfig.tsx');
export const SiteIconsManager = loadPluginComponent('SiteIcons/SiteIconsManager.tsx');
export const PortalManager = loadPluginComponent('SitePortal/PortalManager.tsx');
export const PortalStyleSelection = loadPluginComponent('SitePortal/PortalStyleSelection.tsx');
export const HappyHorseManager = loadPluginComponent('HappyHorse/HappyHorseManager.tsx');
export const DocsManager = loadPluginComponent('DocsApi/DocsManager.tsx');

// Commercial-only pages (物理剥离后仍可安全编译)
export const UserAssets = loadPageComponent('UserAssets/UserAssets.tsx');
export const AdvancedMarketing = loadPageComponent('AdvancedMarketing/AdvancedMarketing.tsx');
