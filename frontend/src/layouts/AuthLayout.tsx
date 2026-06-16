import { Card, Typography, Space, ConfigProvider, theme, Divider, Tooltip, Button, Dropdown } from 'antd';
import { RocketOutlined, GlobalOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/theme';
import useSettingsStore from '../store/settings';

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
  loading?: boolean;
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
  loading,
  children,
  bottomLinks,
  methodsLabel,
  methods,
  activeMethod,
  onMethodChange,
}) => {
  const { i18n, t } = useTranslation();
  const { themeMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();
  const enableThemeToggle = settings?.site?.enable_theme_toggle !== false;
  const enableMultilingual = settings?.site?.enable_multilingual !== false;

  const langNameMap: Record<string, string> = {
    zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어',
    fr: 'Français', de: 'Deutsch', es: 'Español', pt: 'Português',
    ru: 'Русский', ar: 'العربية',
  };

  const supportedLanguages = settings?.site?.supported_languages?.length ? settings.site.supported_languages : ['zh', 'en'];
  const implementedLangs = i18n.options.resources ? Object.keys(i18n.options.resources) : ['zh', 'en'];

  const langItems = supportedLanguages
    .filter(lng => implementedLangs.includes(lng))
    .map(lng => ({
      key: lng,
      label: langNameMap[lng] || lng,
      onClick: () => {
        i18n.changeLanguage(lng);
        localStorage.setItem('i18nextLng', lng);
      },
    }));

  const getLanguageLabel = () => {
    return langNameMap[i18n.language] || i18n.language.toUpperCase();
  };
  const renderIconBtn = (method: AuthMethodOption) => {
    const isActive = activeMethod === method.key;
    const { brandColor } = method;
    const activeColor = brandColor || '#1677ff';
    
    return (
      <Tooltip key={method.key} title={method.label} color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
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
            background: isActive ? activeColor : (themeMode === 'light' ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.04)'),
            border: `1px solid ${isActive ? activeColor : (themeMode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)')}`,
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
              e.currentTarget.style.borderColor = themeMode === 'light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
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
    <ConfigProvider theme={{  }}>
      <div style={{
        minHeight: '100vh', padding: '40px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: themeMode === 'light'
          ? '#f0f4f9 radial-gradient(circle at 50% 50%, #1677ff15 0%, #f0f4f9 100%)'
          : '#000 radial-gradient(circle at 50% 50%, #1677ff22 0%, #000 100%)',
        position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 24, right: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          {enableThemeToggle && (
          <Tooltip title={themeMode === 'light' ? '切换暗色模式' : '切换亮色模式'} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
            <Button 
              type="text" 
              shape="circle" 
              onClick={toggleTheme}
              icon={
                themeMode === 'light' 
                ? <MoonOutlined style={{ fontSize: 18 }} /> 
                : <SunOutlined style={{ fontSize: 18 }} />
              } 
              style={{ color: themeMode === 'light' ? '#1f2937' : 'rgba(255,255,255,0.65)' }} 
            />
          </Tooltip>
          )}
          {enableMultilingual && (
            <Dropdown
              menu={{ items: langItems }}
              placement="bottomRight"
            >
              <Button type="text" icon={<GlobalOutlined />} style={{ color: themeMode === 'light' ? '#1f2937' : 'rgba(255,255,255,0.65)' }}>
                {getLanguageLabel()}
              </Button>
            </Dropdown>
          )}
        </div>

        <Card style={{
          width: 'min(420px, 92vw)', borderRadius: 16, background: themeMode === 'light' ? '#ffffff' : '#141414',
          border: themeMode === 'light' ? '1px solid #e5e7eb' : '1px solid #303030',
          boxShadow: themeMode === 'light' ? '0 8px 32px 0 rgba(0, 0, 0, 0.08)' : '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
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

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <Text type="secondary">{t('common.loading')}</Text>
            </div>
          ) : (
            <>
              {children}

              {bottomLinks && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 16 }}>
                  {bottomLinks}
                </div>
              )}

              {methods && methods.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0 16px' }}>
                    <div style={{ flex: 1, height: 1, background: themeMode === 'light' ? 'linear-gradient(90deg, transparent, rgba(0,0,0,0.1))' : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15))' }} />
                    <span style={{ padding: '0 12px', color: themeMode === 'light' ? '#999' : '#777', fontSize: 13, letterSpacing: 1 }}>{methodsLabel || t('auth.switch_method')}</span>
                    <div style={{ flex: 1, height: 1, background: themeMode === 'light' ? 'linear-gradient(270deg, transparent, rgba(0,0,0,0.1))' : 'linear-gradient(270deg, transparent, rgba(255,255,255,0.15))' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                    {methods.map(renderIconBtn)}
                  </div>
                </>
              )}
            </>
          )}
        </Card>

        {settings?.site?.copyright && (
          <div style={{
            position: 'absolute',
            bottom: 16,
            left: 0,
            right: 0,
            textAlign: 'center',
          }}>
            <Text style={{
              color: themeMode === 'light' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.3)',
              fontSize: 12,
            }}>
              {settings.site.copyright}
            </Text>
          </div>
        )}
      </div>
    </ConfigProvider>
  );
};

export default AuthLayout;
