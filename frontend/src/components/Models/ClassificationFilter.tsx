/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { Space, Tag, Typography, Button, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { type ModelProvider, type ModelType, type ClassificationCount } from '../../types';
import { useThemeStore } from '../../store/theme';
import { Image as ImageIcon, Video, AudioLines, MessageSquare, Cuboid, LayoutGrid, ListOrdered, Sparkles } from 'lucide-react';
import SmartSvgIcon from '../SmartSvgIcon';

const { Text } = Typography;

interface ClassificationFilterProps {
  providers: ClassificationCount[];
  apiProviders?: ClassificationCount[];
  types: ClassificationCount[];
  selectedProvider: number | null;
  selectedApiProvider?: number | null;
  selectedType: number | null;
  onProviderChange: (id: number | null) => void;
  onApiProviderChange?: (id: number | null) => void;
  onTypeChange: (id: number | null) => void;
  onManageProviders?: () => void;
  onManageApiProviders?: () => void;
  onManageTypes?: () => void;
}

const ClassificationFilter: React.FC<ClassificationFilterProps> = ({
  providers,
  apiProviders,
  types,
  selectedProvider,
  selectedApiProvider,
  selectedType,
  onProviderChange,
  onApiProviderChange,
  onTypeChange,
  onManageProviders,
  onManageApiProviders,
  onManageTypes,
}) => {
  const { t, i18n } = useTranslation();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const isEn = i18n.language === 'en';

  const renderSystemIcon = (name: string, isLight: boolean, isSelected: boolean) => {
    const lowerName = name.toLowerCase();
    const style = { color: isSelected ? '#fff' : (isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)') };
    if (lowerName.includes('视频增强') || lowerName.includes('videoenhance') || lowerName.includes('video-enhance') || lowerName.includes('video_enhance')) return <Sparkles size={14} style={style} />;
    if (lowerName.includes('图片') || lowerName.includes('image')) return <ImageIcon size={14} style={style} />;
    if (lowerName.includes('视频') || lowerName.includes('video')) return <Video size={14} style={style} />;
    if (lowerName.includes('音频') || lowerName.includes('audio')) return <AudioLines size={14} style={style} />;
    if (lowerName.includes('聊天') || lowerName.includes('chat') || lowerName.includes('text')) return <MessageSquare size={14} style={style} />;
    if (lowerName.includes('embedding') || lowerName.includes('向量')) return <Cuboid size={14} style={style} />;
    if (lowerName.includes('rerank') || lowerName.includes('排序')) return <ListOrdered size={14} style={style} />;
    return null;
  };

  const renderFilterRow = (
    label: string,
    items: ClassificationCount[],
    selectedValue: number | null,
    onSelect: (id: number | null) => void,
    onManage?: () => void
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, padding: 0 }}>
      <Text type="secondary" style={{ width: 80, flexShrink: 0, fontSize: '13px' }}>{label}</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flexGrow: 1 }}>
        <div
          onClick={() => onSelect(null)}
          style={{ 
            padding: '4px 12px', 
            borderRadius: 16,
            fontSize: '14px',
            backgroundColor: selectedValue === null ? '#1677ff' : (isLight ? '#f0f0f0' : '#1d1d1d'),
            color: selectedValue === null ? '#fff' : (isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255, 255, 255, 0.65)'),
            border: isLight ? '1px solid #d9d9d9' : '1px solid #303030',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>
            <LayoutGrid size={14} style={{ color: selectedValue === null ? '#fff' : (isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)') }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {t('common.all')} <span style={{ opacity: 0.6, marginLeft: 4 }}>{items.reduce((acc, item) => acc + item.count, 0)}</span>
          </div>
        </div>
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{ 
              padding: '4px 12px', 
              borderRadius: 16,
              fontSize: '14px',
              backgroundColor: selectedValue === item.id ? '#1677ff' : (isLight ? '#f0f0f0' : '#1d1d1d'),
              color: selectedValue === item.id ? '#fff' : (isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255, 255, 255, 0.65)'),
              border: isLight ? '1px solid #d9d9d9' : '1px solid #303030',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
          >
            {(() => {
              const sysIcon = renderSystemIcon(item.name_en || item.name, isLight, selectedValue === item.id);
              if (sysIcon) {
                return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16 }}>{sysIcon}</div>;
              }
              if (item.logo) {
                return <SmartSvgIcon src={`/assets/icons/lobe/${item.logo}.svg`} alt="" style={{ width: 16, height: 16, objectFit: 'contain', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
              }
              return <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>{(item.name_en || item.name).charAt(0)}</div>;
            })()}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {(isEn && item.name_en) ? item.name_en : item.name} <span style={{ opacity: 0.6, marginLeft: 4 }}>{item.count}</span>
            </div>
          </div>
        ))}
        {onManage && (
          <Tooltip title={t('common.manage')}>
            <Button 
              type="text" 
              size="small" 
              icon={<SettingOutlined style={{ color: '#1677ff' }} />} 
              onClick={onManage}
              style={{ marginLeft: 8 }}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ 
      backgroundColor: isLight ? '#fafafa' : '#141414', 
      padding: '12px 16px', 
      borderRadius: 8, 
      marginBottom: 16,
      border: isLight ? '1px solid #e8e8e8' : '1px solid #303030'
    }}>
      {renderFilterRow(t('models.provider', '官方服务商'), providers, selectedProvider, onProviderChange, onManageProviders)}
      {apiProviders && onApiProviderChange && renderFilterRow(t('models.api_provider', 'API服务商'), apiProviders, selectedApiProvider ?? null, onApiProviderChange, onManageApiProviders)}
      {renderFilterRow(t('models.type', '类型'), types, selectedType, onTypeChange, onManageTypes)}
    </div>
  );
};

export default ClassificationFilter;
