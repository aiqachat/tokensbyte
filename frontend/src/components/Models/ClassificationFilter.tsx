import React from 'react';
import { Space, Tag, Typography, Button, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { type ModelProvider, type ModelType, type ClassificationCount } from '../../types';

const { Text } = Typography;

interface ClassificationFilterProps {
  providers: ClassificationCount[];
  types: ClassificationCount[];
  selectedProvider: number | null;
  selectedType: number | null;
  onProviderChange: (id: number | null) => void;
  onTypeChange: (id: number | null) => void;
  onManageProviders: () => void;
  onManageTypes: () => void;
  totalModels: number;
}

const ClassificationFilter: React.FC<ClassificationFilterProps> = ({
  providers,
  types,
  selectedProvider,
  selectedType,
  onProviderChange,
  onTypeChange,
  onManageProviders,
  onManageTypes,
  totalModels,
}) => {
  const { t } = useTranslation();

  const renderFilterRow = (
    label: string,
    items: ClassificationCount[],
    selectedValue: number | null,
    onSelect: (id: number | null) => void,
    onManage: () => void
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, padding: '4px 0' }}>
      <Text type="secondary" style={{ width: 80, flexShrink: 0 }}>{label}</Text>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, flexGrow: 1 }}>
        <div
          onClick={() => onSelect(null)}
          style={{ 
            padding: '4px 12px', 
            borderRadius: 16,
            fontSize: '14px',
            backgroundColor: selectedValue === null ? '#1677ff' : '#1d1d1d',
            color: selectedValue === null ? '#fff' : 'rgba(255, 255, 255, 0.65)',
            border: '1px solid #303030',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            transition: 'all 0.2s',
          }}
        >
          {t('common.all')} <span style={{ opacity: 0.6, marginLeft: 4 }}>{totalModels}</span>
        </div>
        {items.map(item => (
          <div
            key={item.id}
            onClick={() => onSelect(item.id)}
            style={{ 
              padding: '4px 12px', 
              borderRadius: 16,
              fontSize: '14px',
              backgroundColor: selectedValue === item.id ? '#1677ff' : '#1d1d1d',
              color: selectedValue === item.id ? '#fff' : 'rgba(255, 255, 255, 0.65)',
              border: '1px solid #303030',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
          >
            {item.logo && (
              <img src={`/assets/icons/lobe/${item.logo}.svg`} alt="" style={{ width: 16, height: 16, objectFit: 'contain', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {item.name} <span style={{ opacity: 0.6, marginLeft: 4 }}>{item.count}</span>
            </div>
          </div>
        ))}
        <Tooltip title={t('common.manage')}>
          <Button 
            type="text" 
            size="small" 
            icon={<SettingOutlined style={{ color: '#1677ff' }} />} 
            onClick={onManage}
            style={{ marginLeft: 8 }}
          />
        </Tooltip>
      </div>
    </div>
  );

  return (
    <div style={{ 
      backgroundColor: '#141414', 
      padding: '20px 24px', 
      borderRadius: 12, 
      marginBottom: 24,
      border: '1px solid #303030'
    }}>
      {renderFilterRow(t('models.provider'), providers, selectedProvider, onProviderChange, onManageProviders)}
      {renderFilterRow(t('models.type'), types, selectedType, onTypeChange, onManageTypes)}
    </div>
  );
};

export default ClassificationFilter;
