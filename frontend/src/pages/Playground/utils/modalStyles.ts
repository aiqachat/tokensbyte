import React from 'react';

/**
 * 获取无限画布统一的 Modal 弹窗样式（反馈弹窗同款毛玻璃效果）
 * @param isLight 是否为浅色模式
 */
export function getSharedModalStyles(isLight: boolean) {
  const bg = isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(20, 20, 22, 0.8)';
  const border = isLight ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid rgba(255, 255, 255, 0.08)';
  const shadow = isLight 
    ? '0 10px 40px -10px rgba(0, 0, 0, 0.1)' 
    : '0 15px 50px -12px rgba(0, 0, 0, 0.5)';

  return {
    styles: {
      content: {
        background: bg,
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        border: border,
        borderRadius: 20,
        boxShadow: shadow,
      },
      header: {
        background: 'transparent',
      },
      body: {
        background: 'transparent',
      },
      mask: {
        background: isLight ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.4)',
      }
    },
    okButtonProps: {
      style: {
        color: isLight ? undefined : '#000000'
      }
    }
  };
}
