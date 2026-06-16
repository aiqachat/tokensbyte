import React from 'react';
import { Avatar, Popover, Button } from 'antd';
import { DashboardOutlined, WalletOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../store/auth';
import { useThemeStore } from '../../store/theme';

interface UserAvatarMenuProps {
  isUserEnd?: boolean;
  agreement?: any;
}

const UserAvatarMenu: React.FC<UserAvatarMenuProps> = ({ isUserEnd = true, agreement }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  const showAgreement = (type: 'tos' | 'privacy') => {
    const isEn = i18n.language && i18n.language.startsWith('en');

    if (!agreement) {
      window.open(`/legal/${type === 'tos' ? 'terms' : 'privacy'}`, '_blank');
      return;
    }
    
    if (type === 'tos') {
      const mode = isEn ? agreement.tos_mode_en : agreement.tos_mode;
      const link = isEn && agreement.tos_link_en ? agreement.tos_link_en : agreement.tos_link;
      if (mode === 'link' && link) {
        window.open(link, '_blank');
      } else {
        window.open('/legal/terms', '_blank');
      }
    } else {
      const mode = isEn ? agreement.privacy_mode_en : agreement.privacy_mode;
      const link = isEn && agreement.privacy_link_en ? agreement.privacy_link_en : agreement.privacy_link;
      if (mode === 'link' && link) {
        window.open(link, '_blank');
      } else {
        window.open('/legal/privacy', '_blank');
      }
    }
  };

  const handleLogout = () => {
    logout();
    if (isUserEnd) {
      navigate('/login');
    } else {
      navigate('/admin0755');
    }
  };

  const userInitial = user?.nickname?.charAt(0)?.toUpperCase() || user?.username?.charAt(0)?.toUpperCase() || '?';
  const displayName = user?.nickname || user?.username || 'User';

  // Theme-aware colors
  const tc = {
    text: isLight ? '#1f2937' : '#e5e5e5',
    textSub: isLight ? '#6b7280' : 'rgba(255,255,255,0.45)',
    textMuted: isLight ? '#9ca3af' : 'rgba(255,255,255,0.2)',
    btnBg: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
    btnBorder: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)',
    btnText: isLight ? '#374151' : '#e5e5e5',
    btnHoverBg: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
    btnHoverBorder: isLight ? '#d1d5db' : 'rgba(255,255,255,0.2)',
    btnHoverText: isLight ? '#111827' : '#fff',
    popBg: isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 30, 30, 0.45)',
    popBorder: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)',
    popShadow: isLight
      ? 'inset 0 1px 1px rgba(255,255,255,0.6), 0 24px 48px rgba(0,0,0,0.12)'
      : 'inset 0 1px 1px rgba(255,255,255,0.1), 0 24px 48px rgba(0,0,0,0.6)',
    avatarHoverBg: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
    levelBg: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
    levelBorder: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
    levelText: isLight ? '#4b5563' : '#e5e5e5',
  };

  const profileContent = (
    <div style={{ width: 300, padding: '12px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ marginTop: 8, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '0 8px' }}>
        <Avatar 
          size={56} 
          style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 24, flexShrink: 0, cursor: 'pointer' }}
          onClick={() => { navigate('/profile'); }}
        >
          {userInitial}
        </Avatar>
        <div style={{ overflow: 'hidden', flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 16, color: tc.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
            {user?.level_name && (
              <span style={{ 
                fontSize: 11, padding: '0 6px', background: tc.levelBg, 
                color: tc.levelText, borderRadius: 4, fontWeight: 'normal', flexShrink: 0,
                border: `1px solid ${tc.levelBorder}`, lineHeight: '18px',
                userSelect: 'none'
              }}>
                {user.level_name}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: tc.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
            {t('profile.uid', '用户 UID')}:{user?.uid || '-'}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {isUserEnd && (
          <Button 
            type="default"
            style={{ 
              height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tc.btnBg, borderColor: tc.btnBorder, color: tc.btnText, fontSize: 15,
              transition: 'all 0.2s'
            }}
            className="hover-bright-btn"
            icon={<DashboardOutlined style={{ fontSize: 18 }} />}
            onClick={() => { navigate('/dashboard'); }}
          >
            {t('menu.dashboard')}
          </Button>
        )}

        {isUserEnd && (
          <Button 
            type="default"
            style={{ 
              height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tc.btnBg, borderColor: tc.btnBorder, color: tc.btnText, fontSize: 15,
              transition: 'all 0.2s'
            }}
            className="hover-bright-btn"
            icon={<WalletOutlined style={{ fontSize: 18 }} />}
            onClick={() => { navigate('/wallet'); }}
          >
            {t('menu.wallet', '我的钱包')}
          </Button>
        )}
        
        <Button 
          type="default"
          style={{ 
            height: 48, borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: tc.btnBg, borderColor: tc.btnBorder, color: tc.btnText, fontSize: 15,
            transition: 'all 0.2s'
          }}
          className="hover-bright-btn"
          icon={<LogoutOutlined style={{ fontSize: 18 }} />}
          onClick={handleLogout}
        >
          {t('common.logout', '退出登录')}
        </Button>
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 24, width: '100%' }}>
        <Button type="link" onClick={() => showAgreement('privacy')} style={{ color: tc.textSub, fontSize: 12, padding: 0 }}>{t('common.privacy_policy', '隐私政策')}</Button>
        <span style={{ color: tc.textMuted }}>•</span>
        <Button type="link" onClick={() => showAgreement('tos')} style={{ color: tc.textSub, fontSize: 12, padding: 0 }}>{t('common.terms_of_service', '服务条款')}</Button>
      </div>
    </div>
  );

  return (
    <>
      <style>
        {`
          .hover-bright-btn:hover {
            background: ${tc.btnHoverBg} !important;
            border-color: ${tc.btnHoverBorder} !important;
            color: ${tc.btnHoverText} !important;
          }
          .header-avatar-btn:hover {
            background: ${tc.avatarHoverBg};
          }
          .custom-premium-popover {
            transform-origin: 50% 50% !important;
          }
          .popover-center-scale-enter,
          .popover-center-scale-appear {
            opacity: 0;
            transform: scale(0.82);
            transform-origin: 50% 50% !important;
          }
          .popover-center-scale-enter-active,
          .popover-center-scale-appear-active {
            opacity: 1;
            transform: scale(1);
            transition: all 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
            transform-origin: 50% 50% !important;
          }
          .popover-center-scale-leave {
            opacity: 1;
            transform: scale(1);
            transform-origin: 50% 50% !important;
          }
          .popover-center-scale-leave-active {
            opacity: 0;
            transform: scale(0.88);
            transition: all 0.2s cubic-bezier(0.4, 0, 1, 1);
            transform-origin: 50% 50% !important;
          }
        `}
      </style>
      <Popover 
        content={profileContent} 
        trigger="click" 
        placement="bottomRight"
        overlayClassName="custom-premium-popover"
        forceRender
        destroyTooltipOnHide={false}
        overlayInnerStyle={{ 
          padding: 0, 
          borderRadius: 20, 
          background: tc.popBg,
          backdropFilter: 'blur(30px) saturate(200%)',
          WebkitBackdropFilter: 'blur(30px) saturate(200%)',
          border: `1px solid ${tc.popBorder}`, 
          boxShadow: tc.popShadow,
          transform: 'translateZ(0)',
        }}
        arrow={false}
      >
        <div 
          className="header-avatar-btn"
          style={{ 
            display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px', 
            borderRadius: '50%', transition: 'background 0.2s',
            border: '2px solid transparent'
          }} 
        >
          <Avatar size={34} style={{ backgroundColor: '#1677ff', color: '#fff', fontSize: 16 }}>
            {userInitial}
          </Avatar>
        </div>
      </Popover>
    </>
  );
};

export default UserAvatarMenu;
