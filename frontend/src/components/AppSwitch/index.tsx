import React from 'react';
import { Switch as AntSwitch } from 'antd';
import type { SwitchProps } from 'antd';

/**
 * 全局统一开关：与「令牌」页同一套 Ant Design Switch + index.css 灰阶样式。
 * 新页面请用本组件，勿再手写蓝色 Tailwind toggle。
 */
const AppSwitch = React.forwardRef<HTMLButtonElement, SwitchProps>((props, ref) => {
  return <AntSwitch ref={ref as any} {...props} />;
});

AppSwitch.displayName = 'AppSwitch';

export default AppSwitch;
