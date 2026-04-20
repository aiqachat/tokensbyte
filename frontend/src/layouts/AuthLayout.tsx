import React from 'react';
import { Card, Typography, Space, ConfigProvider, theme, Divider, Tooltip, Button } from 'antd';
import { RocketOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export interface AuthMethodOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  brandColor?: string;
  onClick?: () => void;
}

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  logo?: string | null;
  children: React.ReactNode;
  bottomLinks?: React.ReactNode;
  
  methodsLabel?: string;
  methods?: AuthMethodOption[];
  activeMethod?: string;
  onMethodChange?: (key: string) => void;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  subtitle,
  logo,
  children,
  bottomLinks,
  methodsLabel,
  methods,
  activeMethod,
  onMethodChange,
}) => {
  const renderIconBtn = (method: AuthMethodOption) => {
    const isActive = activeMethod === method.key;
    const { brandColor } = method;
    const activeColor = brandColor || '#1677ff';
    
    return (
      <Tooltip key={method.key} title={method.label}>
        <div
          onClick={method.onClick ? method.onClick : () => onMethodChange?.(method.key)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            borderRadius: '50%',
            cursor: 'pointer',
            background: isActive ? activeColor : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${isActive ? activeColor : 'rgba(255, 255, 255, 0.1)'}`,
            color: isActive ? '#fff' : (brandColor || '#8c8c8c'),
            fontSize: 20,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: isActive ? `0 4px 14px ${activeColor}66` : 'none',
          }}
          onMouseEnter={(e) => {
            if (!isActive) {
              e.currentTarget.style.borderColor = activeColor;
              e.currentTarget.style.color = activeColor;
              e.currentTarget.style.boxShadow = `0 4px 12px ${activeColor}33`;
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isActive) {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = brandColor || '#8c8c8c';
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'none';
            }
          }}
        >
          {method.icon}
        </div>
      </Tooltip>
    );
  };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={{
        minHeight: '100vh', padding: '40px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', backgroundImage: 'radial-gradient(circle at 50% 50%, #1677ff22 0%, #000 100%)',
      }}>
        <Card style={{
          width: 'min(420px, 92vw)', borderRadius: 16, background: '#141414',
          border: '1px solid #303030', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <Space direction="vertical" size={4}>
              {logo ? (
                <img src={logo} alt="logo" style={{ width: 48, height: 48, objectFit: 'contain' }} />
              ) : (
                <RocketOutlined style={{ fontSize: 48, color: '#1677ff' }} />
              )}
              <Title level={3} style={{ margin: 0 }}>{title}</Title>
              {subtitle && <Text type="secondary">{subtitle}</Text>}
            </Space>
          </div>

          {children}

          {bottomLinks && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
              {bottomLinks}
            </div>
          )}

          {methods && methods.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0 16px' }}>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15))' }} />
                <span style={{ padding: '0 12px', color: '#777', fontSize: 13, letterSpacing: 1 }}>{methodsLabel || '切换方式'}</span>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, rgba(255,255,255,0.15))' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                {methods.map(renderIconBtn)}
              </div>
            </>
          )}
        </Card>
      </div>
    </ConfigProvider>
  );
};

export default AuthLayout;
