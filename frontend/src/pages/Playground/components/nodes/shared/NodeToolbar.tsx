/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { Tooltip } from 'antd';
import {
  DownloadOutlined,
  CopyOutlined,
  ExpandAltOutlined,
  ProfileOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import { useThemeStore } from '../../../../../store/theme';

interface NodeToolbarProps {
  onDuplicate?: () => void;
  onDownload?: () => void;
  onZoomToFit?: () => void;
  onShowProperties?: () => void;
  onRemove?: () => void;
  canDownload?: boolean;
}

const NodeToolbar: React.FC<NodeToolbarProps> = ({
  onDuplicate,
  onDownload,
  onZoomToFit,
  onShowProperties,
  onRemove,
  canDownload = false,
}) => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  // 主题变量 (Shadcn 风格)
  const bg = isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(24, 24, 27, 0.85)';
  const border = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';
  const iconColor = isLight ? '#52525b' : '#a1a1aa'; // zinc-600 : zinc-400
  const iconHoverColor = isLight ? '#09090b' : '#fafafa'; // zinc-950 : zinc-50
  const hoverBg = isLight ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.06)';
  const dividerBg = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';

  const dangerColor = '#ef4444';
  const dangerHoverBg = isLight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(239, 68, 68, 0.15)';

  const renderButton = (
    icon: React.ReactNode,
    title: string,
    onClick?: () => void,
    isDanger?: boolean
  ) => {
    return (
      <Tooltip title={title}>
        <div
          onClick={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 6,
            cursor: 'pointer',
            color: isDanger ? dangerColor : iconColor,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isDanger ? dangerHoverBg : hoverBg;
            if (!isDanger) e.currentTarget.style.color = iconHoverColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            if (!isDanger) e.currentTarget.style.color = iconColor;
          }}
        >
          {icon}
        </div>
      </Tooltip>
    );
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()} // 防止点击穿透到节点导致节点被误选/拖拽
      style={{
        position: 'absolute',
        top: -50,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        padding: '4px',
        gap: '2px',
        background: bg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRadius: 8,
        border: `1px solid ${border}`,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.08)',
        zIndex: 1000,
      }}
    >
      {onZoomToFit && renderButton(<ExpandAltOutlined style={{ fontSize: 16 }} />, '缩放匹配', onZoomToFit)}
      {onShowProperties && renderButton(<ProfileOutlined style={{ fontSize: 16 }} />, '查看属性', onShowProperties)}
      {onDuplicate && renderButton(<CopyOutlined style={{ fontSize: 16 }} />, '创建实例', onDuplicate)}
      {canDownload && onDownload && renderButton(<DownloadOutlined style={{ fontSize: 16 }} />, '下载素材', onDownload)}
      
      {(onZoomToFit || onShowProperties || onDuplicate || canDownload) && onRemove && (
        <div style={{ width: 1, height: 16, backgroundColor: dividerBg, margin: '0 4px' }} />
      )}
      
      {onRemove && renderButton(<DeleteOutlined style={{ fontSize: 16 }} />, '删除节点', onRemove, true)}
    </div>
  );
};

export default React.memo(NodeToolbar);
