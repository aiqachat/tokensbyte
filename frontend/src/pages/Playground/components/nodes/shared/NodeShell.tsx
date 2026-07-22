/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 高级节点共享外壳组件
 * 统一封装：标题栏（图标 + 标题 + 徽章） + 关闭按钮 + 暗色/亮色背景
 * 消除各节点中重复 6 次的标题栏 + 关闭按钮模式
 */
import React from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { nodeBackground, borderColor, titleColor, secondaryColor } from './nodeStyles';

interface NodeShellProps {
  /** 节点图标（emoji） */
  icon: string;
  /** 节点标题 */
  title: string;
  /** 徽章文字（如 'MediaKit', 'System'） */
  badge?: string;
  /** 徽章颜色 */
  badgeColor?: string;
  /** 关闭回调 */
  onClose: () => void;
  /** 亮色主题 */
  isLight: boolean;
  /** 容器额外样式 */
  style?: React.CSSProperties;
  children: React.ReactNode;
}

const NodeShell: React.FC<NodeShellProps> = ({
  icon, title, badge, badgeColor = '#1677ff',
  onClose, isLight, style, children,
}) => {
  return (
    <div style={{
      padding: '12px',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      background: nodeBackground(isLight),
      color: titleColor(isLight),
      borderRadius: 12,
      ...style,
    }}>
      {/* 标题栏 */}
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        borderBottom: `1px solid ${borderColor(isLight)}`,
        paddingTop: 4,
        paddingBottom: 6,
        color: titleColor(isLight),
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{icon} {title}</span>
          {badge && (
            <span style={{
              fontSize: 11,
              color: badgeColor,
              background: `${badgeColor}1a`,
              padding: '0 4px',
              borderRadius: 2,
            }}>
              {badge}
            </span>
          )}
        </div>
        {/* 关闭按钮 */}
        <div
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            cursor: 'pointer',
            color: secondaryColor(isLight),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = titleColor(isLight);
            e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = secondaryColor(isLight);
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <CloseOutlined style={{ fontSize: 12 }} />
        </div>
      </div>

      {/* 内容区域 */}
      {children}
    </div>
  );
};

export default React.memo(NodeShell);
