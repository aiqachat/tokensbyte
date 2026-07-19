/**
 * 高级节点共享样式常量
 * 消除各节点中重复定义的 selectStyle、codeBlockStyle 等
 */
import React from 'react';

/** 下拉选择框统一样式（volc_enhance, ai_video, ai_image, agent 共用） */
export const selectStyle = (isLight: boolean): React.CSSProperties => ({
  background: isLight ? '#f4f4f5' : '#2c2d30',
  border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}`,
  color: isLight ? '#09090b' : '#fff',
  fontSize: '12px',
  borderRadius: '4px',
  padding: '3px 6px',
  cursor: 'pointer',
  outline: 'none',
});

/** 代码块/JSON 显示区域样式 */
export const codeBlockStyle = (isLight: boolean): React.CSSProperties => ({
  margin: 0,
  padding: '6px',
  background: isLight ? '#f4f4f5' : '#141416',
  borderRadius: '4px',
  border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
  color: isLight ? '#374151' : '#a9b2c3',
  fontSize: '11px',
  fontFamily: 'Consolas, Monaco, monospace',
  width: '100%',
  boxSizing: 'border-box' as const,
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const,
  maxHeight: '120px',
  overflowY: 'auto' as const,
});

/** 区块标签行样式 */
export const sectionLabelStyle = (isLight: boolean): React.CSSProperties => ({
  fontSize: '11px',
  color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

/** 节点容器背景色 */
export const nodeBackground = (isLight: boolean) => isLight ? '#ffffff' : '#18181b';

/** 分割线颜色 */
export const borderColor = (isLight: boolean) => isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';

/** 标题文字颜色 */
export const titleColor = (isLight: boolean) => isLight ? '#09090b' : '#fff';

/** 次要文字颜色 */
export const secondaryColor = (isLight: boolean) => isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';

/** 表单行容器样式（左右对齐，用于下拉配置项） */
export const formRowStyle = (isLight: boolean): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '12px',
});

/** 表单列容器样式（上下结构） */
export const formColStyle = (isLight: boolean): React.CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

/** 表单标签文字样式 */
export const formLabelStyle = (isLight: boolean): React.CSSProperties => ({
  fontSize: '12px',
  color: isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)',
});

/** 通用多行输入框 textarea 样式 */
export const textareaStyle = (isLight: boolean): React.CSSProperties => ({
  width: '100%',
  background: isLight ? '#f4f4f5' : '#141416',
  border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
  borderRadius: '6px',
  color: isLight ? '#09090b' : '#fff',
  padding: '8px',
  fontSize: '13px',
  resize: 'none',
  outline: 'none',
  lineHeight: '1.5',
});

/** 边框聚焦与失焦状态辅助函数 */
export const handleInputFocus = (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
  e.currentTarget.style.borderColor = 'rgba(22,119,255,0.5)';
};

export const handleInputBlur = (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>, isLight: boolean) => {
  e.currentTarget.style.borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
};

/** 主操作按钮样式 (立即生成/处理等) */
export const primaryButtonStyle = (isLight: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '6px',
  fontSize: '13px',
  background: '#1677ff',
  border: 'none',
  color: '#fff',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 600,
  transition: 'background 0.2s',
});

export const handleButtonMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, isProcessing = false) => {
  if (!isProcessing) {
    e.currentTarget.style.background = '#4096ff';
  }
};

export const handleButtonMouseLeave = (e: React.MouseEvent<HTMLButtonElement>, isProcessing = false) => {
  if (!isProcessing) {
    e.currentTarget.style.background = '#1677ff';
  }
};

/** 虚线辅助按钮样式 (展开/收起等) */
export const dashedButtonStyle = (isLight: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '4px 6px',
  fontSize: '12px',
  background: 'transparent',
  border: `1px dashed ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
  color: isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)',
  borderRadius: '4px',
  cursor: 'pointer',
  marginTop: '2px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  transition: 'all 0.2s',
});

export const handleDashedButtonMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, isLight: boolean) => {
  e.currentTarget.style.borderColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)';
  e.currentTarget.style.color = isLight ? '#000' : '#fff';
};

export const handleDashedButtonMouseLeave = (e: React.MouseEvent<HTMLButtonElement>, isLight: boolean) => {
  e.currentTarget.style.borderColor = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)';
  e.currentTarget.style.color = isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
};

/** 辅助/说明灰色小字样式 */
export const helpTextStyle = (isLight: boolean): React.CSSProperties => ({
  fontSize: '11px',
  color: isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)',
  lineHeight: '1.5',
});

/** 红色警示操作按钮样式 (删除节点等) - 暂未启用 */
// dangerButtonStyle, handleDangerButtonMouseEnter, handleDangerButtonMouseLeave 暂无引用，若后续需要使用可重新在此补充定义。

/** 毛玻璃元数据属性面板样式 - 暂未启用 */
// glassPanelStyle, glassPanelLabelStyle 暂无引用，若后续需要使用可重新在此补充定义。
