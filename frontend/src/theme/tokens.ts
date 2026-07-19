/**
 * shadcn / zinc 黑白灰设计令牌
 * Ant Design ConfigProvider 与页面内联强调色统一从此取色，避免再写 #1677ff。
 */
const SHADCN = {
  zinc50: '#fafafa',
  zinc100: '#f4f4f5',
  zinc200: '#e4e4e7',
  zinc300: '#d4d4d8',
  zinc400: '#a1a1aa',
  zinc500: '#71717a',
  zinc600: '#52525b',
  zinc700: '#3f3f46',
  zinc800: '#27272a',
  zinc900: '#18181b',
  zinc950: '#09090b',
} as const;

export type ThemeMode = 'light' | 'dark';

/** Ant Design 全局 token（主色 = 近黑 / 近白） */
export function getAntdThemeTokens(mode: ThemeMode) {
  if (mode === 'light') {
    return {
      colorPrimary: SHADCN.zinc900,
      colorPrimaryHover: SHADCN.zinc800,
      colorPrimaryActive: SHADCN.zinc950,
      colorLink: SHADCN.zinc900,
      colorInfo: SHADCN.zinc900,
      /** 深色实心底上的浅色字（Tooltip / Tag 等）；勿改成深色 */
      colorTextLightSolid: SHADCN.zinc50,
      borderRadius: 8,
      colorBgLayout: '#fafafa',
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorTextBase: SHADCN.zinc900,
      colorBorder: SHADCN.zinc300,
      colorBorderSecondary: SHADCN.zinc200,
      controlOutline: 'rgba(24, 24, 27, 0.12)',
    };
  }

  return {
    colorPrimary: SHADCN.zinc50,
    colorPrimaryHover: SHADCN.zinc200,
    colorPrimaryActive: '#ffffff',
    colorLink: SHADCN.zinc50,
    colorInfo: SHADCN.zinc50,
    /** 必须保持浅色：Menu hover / 折叠 Tooltip 都依赖此 token */
    colorTextLightSolid: '#ffffff',
    borderRadius: 8,
    colorBgLayout: SHADCN.zinc950,
    colorBgContainer: '#141414',
    colorBgElevated: '#1c1c1f',
    controlOutline: 'rgba(250, 250, 250, 0.16)',
  };
}

/** Ant Design 组件级 token：菜单选中等不用主色蓝底 */
export function getAntdComponentTokens(mode: ThemeMode) {
  const isLight = mode === 'light';
  const primary = isLight ? SHADCN.zinc900 : SHADCN.zinc50;
  const onPrimary = isLight ? SHADCN.zinc50 : SHADCN.zinc900;
  const darkMenuBg = '#141414';
  const darkMenuElevated = '#1c1c1f';

  return {
    Layout: {
      siderBg: isLight ? '#fafafa' : darkMenuBg,
      headerBg: isLight ? '#ffffff' : darkMenuBg,
      bodyBg: isLight ? '#fafafa' : SHADCN.zinc950,
    },
    Menu: {
      itemHeight: 50,
      iconSize: 20,
      itemMarginInline: 12,
      // 覆盖 Ant 默认 #001529 / #000c17 深蓝；弹层内外统一色避免双层感
      darkItemBg: darkMenuBg,
      darkPopupBg: darkMenuElevated,
      darkSubMenuItemBg: darkMenuBg,
      darkItemColor: 'rgba(255, 255, 255, 0.65)',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
      darkItemSelectedBg: 'rgba(255, 255, 255, 0.12)',
      darkItemSelectedColor: '#ffffff',
      darkGroupTitleColor: 'rgba(255, 255, 255, 0.45)',
      itemHoverBg: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
      itemSelectedBg: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)',
      itemActiveBg: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.16)',
      itemSelectedColor: isLight ? SHADCN.zinc900 : '#ffffff',
      itemHoverColor: isLight ? SHADCN.zinc900 : '#ffffff',
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
      /** 暗色主按钮用深色字；不污染 colorTextLightSolid */
      primaryColor: onPrimary,
    },
    Tooltip: {
      colorTextLightSolid: '#ffffff',
    },
    Radio: {
      buttonSolidCheckedBg: primary,
      buttonSolidCheckedColor: onPrimary,
      buttonSolidCheckedHoverBg: isLight ? SHADCN.zinc800 : SHADCN.zinc200,
    },
    Card: {
      colorBorderSecondary: isLight ? SHADCN.zinc200 : '#303030',
    },
  };
}

/** 侧栏菜单局部覆盖（更紧凑的 item 高度） */
export function getSiderMenuTokens(mode: ThemeMode) {
  const isLight = mode === 'light';
  const darkMenuBg = '#141414';
  const darkMenuElevated = '#1c1c1f';
  return {
    itemHeight: 36,
    itemMarginInline: 8,
    itemMarginBlock: 2,
    itemHoverBg: isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
    itemSelectedBg: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)',
    itemActiveBg: isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.16)',
    itemSelectedColor: isLight ? SHADCN.zinc900 : '#ffffff',
    itemHoverColor: isLight ? SHADCN.zinc900 : '#ffffff',
    itemColor: isLight ? SHADCN.zinc600 : 'rgba(255, 255, 255, 0.65)',
    darkItemBg: darkMenuBg,
    darkPopupBg: darkMenuElevated,
    darkSubMenuItemBg: darkMenuBg,
    darkItemSelectedBg: 'rgba(255, 255, 255, 0.12)',
    darkItemSelectedColor: '#ffffff',
    darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
    darkItemHoverColor: '#ffffff',
    darkItemColor: 'rgba(255, 255, 255, 0.65)',
    darkGroupTitleColor: 'rgba(255, 255, 255, 0.45)',
  };
}

/** 置顶标签 / 弱强调 chip，替代原蓝色半透明 */
export function softAccent(mode: ThemeMode) {
  if (mode === 'light') {
    return {
      background: 'rgba(24, 24, 27, 0.06)',
      color: SHADCN.zinc900,
      border: '1px solid rgba(24, 24, 27, 0.12)',
    };
  }
  return {
    background: 'rgba(250, 250, 250, 0.1)',
    color: SHADCN.zinc50,
    border: '1px solid rgba(250, 250, 250, 0.18)',
  };
}

/** 头像等实心强调块 */
export function solidAccent(mode: ThemeMode) {
  return mode === 'light'
    ? { background: SHADCN.zinc900, color: SHADCN.zinc50 }
    : { background: SHADCN.zinc200, color: SHADCN.zinc900 };
}
