/**
 * 体验中心 - 项目列表首页 (Stitch Style)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getAnnouncementLabel } from '../../utils/announcement';
import {
  parseNotificationPreferences,
  shouldShowWebNotifications,
  maybeShowBrowserPush,
} from '../../utils/notificationPrefs';
import { useNavigate } from 'react-router-dom';
import { ConfigProvider, theme, Input, Tooltip, message, Popover, Avatar, Button, Modal, App, Dropdown, Badge, Space, List, type MenuProps } from 'antd';
import {
  SearchOutlined, PlusOutlined, DeleteOutlined, EditOutlined,
  AppstoreOutlined, TeamOutlined, AudioOutlined, ArrowUpOutlined,
  ThunderboltOutlined, FileTextOutlined, MobileOutlined, DesktopOutlined, RocketOutlined,
  DashboardOutlined, WalletOutlined, LogoutOutlined, SunOutlined, MoonOutlined, CheckOutlined,
  ExclamationCircleOutlined, ReloadOutlined, MoreOutlined, EllipsisOutlined,
  FolderOutlined, DownOutlined, RightOutlined, ScheduleOutlined, BellOutlined, DatabaseOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, UnorderedListOutlined, SortAscendingOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { Sidebar as SidebarIcon } from 'lucide-react';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';
import useAuthStore from '../../store/auth';
import useSettingsStore from '../../store/settings';
import UserAvatarMenu from '../../components/UserAvatarMenu';
import CanvasParticles from './components/CanvasParticles';
import { formatApiDateTime, parseApiTimeAsUtc, resolveTimedisplay } from '../../utils/timedisplay';

interface ProjectItem {
  id: number;
  uid: string;
  name: string;
  description: string;
  cover_url: string;
  canvas_data: string;
  created_at: string;
  updated_at: string;
  asset_count?: number;
  is_pinned?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const getFullUrl = (url: string) => {
  if (!url) return '';
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

const formatDateZh = (dateStr: string) => formatApiDateTime(dateStr, 'YYYY年M月D日');

const formatDateEn = (dateStr: string) => {
  const d = parseApiTimeAsUtc(dateStr);
  if (!d) return '-';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: resolveTimedisplay(),
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d);
  }
};

const getRelativeTimeAgo = (dateStr: string, currentLang: string) => {
  const date = parseApiTimeAsUtc(dateStr);
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isZh = currentLang === 'zh';

  if (diffMins < 1) {
    return isZh ? '刚刚' : 'just now';
  }
  if (diffMins < 60) {
    return isZh ? `${diffMins} 分钟前` : `${diffMins} mins ago`;
  }
  if (diffHours < 24) {
    return isZh ? `${diffHours} 小时前` : `${diffHours} hrs ago`;
  }
  if (diffDays < 30) {
    return isZh ? `${diffDays} 天前` : `${diffDays} days ago`;
  }
  return formatDateZh(dateStr);
};

const getProjectStats = (canvasDataStr: string) => {
  let assetCount = 0;
  let creditCount = 0;
  try {
    if (canvasDataStr) {
      const data = JSON.parse(canvasDataStr);
      if (data && Array.isArray(data.nodes)) {
        assetCount = data.nodes.filter((n: any) => n.status === 'success' || n.resultData?.file_url).length;
        data.nodes.forEach((n: any) => {
          if (n.taskData?.cost_credits) {
            creditCount += Number(n.taskData.cost_credits);
          } else if (n.taskData?.credits_used) {
            creditCount += Number(n.taskData.credits_used);
          } else if (n.resultData?.cost) {
            creditCount += Number(n.resultData.cost);
          }
        });
      }
    }
  } catch (e) {
    // ignore
  }
  return { assetCount, creditCount };
};

const PlaygroundHome: React.FC = () => {
  const { themeMode, setTheme, toggleTheme } = useThemeStore();
  const { token: themeToken } = theme.useToken();
  const _isLight = themeMode === 'light';
  const navigate = useNavigate();
  const { modal, message: appMessage } = App.useApp();
  const { user, logout } = useAuthStore();
  const { settings } = useSettingsStore();
  const siteName = settings?.site?.name || 'AI 创作中心';
  const siteLogo = settings?.site?.logo || '';
  const agreement = settings?.agreement || null;
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'name'>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [newPrompt, setNewPrompt] = useState('');
  const [activeTab, setActiveTab] = useState<'my' | 'shared'>('my');
  const [platform, setPlatform] = useState<'app' | 'web'>('app');
  const isCreatingRef = useRef(false);
  const manualCreatingRef = useRef(false);
  const [isCreating, setIsCreating] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [initPhase, setInitPhase] = useState<string>('正在检查存储配置...');
  const [initializing, setInitializing] = useState(true);
  const [rightEditingName, setRightEditingName] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth <= 768);
  const searchInputRef = useRef<any>(null);

  // --- 对齐控制台顶部右上角功能 ---
  const { t, i18n } = useTranslation();
  const site = settings?.site;
  const enableMultilingual = site?.enable_multilingual !== false;
  const enableThemeToggle = site?.enable_theme_toggle !== false;
  const supportedLanguages = site?.supported_languages?.length ? site.supported_languages : ['zh', 'en'];

  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activePlugins, setActivePlugins] = useState<any[]>([]);

  useEffect(() => {
    const fetchAnnouncements = async () => {
      const prefs = parseNotificationPreferences(
        user?.notification_preferences,
        settings?.notification?.low_balance_threshold ?? 100.0,
      );
      if (!shouldShowWebNotifications(prefs, settings?.notification)) {
        setAnnouncements([]);
        setUnreadCount(0);
        return;
      }
      try {
        const response = await (request.get('/announcements/public') as any);
        if (response.data) {
          setAnnouncements(response.data);
          setUnreadCount(response.data.length);
          if (response.data.length > 0) {
            const first = response.data[0];
            const seenKey = `notif_push_seen_${first.id}`;
            if (!sessionStorage.getItem(seenKey)) {
              sessionStorage.setItem(seenKey, '1');
              const title = getAnnouncementLabel(first.title || '') || (i18n.language === 'zh' ? '新通知' : 'New notification');
              const body = getAnnouncementLabel(first.content || '').replace(/<[^>]+>/g, '').slice(0, 120);
              maybeShowBrowserPush(title, body, prefs, settings?.notification);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch announcements:', error);
      }
    };
    const fetchActivePlugins = async () => {
      try {
        const response = await (request.get('/plugins/active') as any);
        if (response.active_plugins) {
          setActivePlugins(response.active_plugins);
        }
      } catch (error) {
        console.error('Failed to fetch active plugins:', error);
      }
    };
    fetchAnnouncements();
    fetchActivePlugins();
  }, [user?.notification_preferences, settings?.notification?.low_balance_threshold, i18n.language]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  const langNameMap: Record<string, string> = {
    zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어', vi: 'Tiếng Việt',
    fr: 'Français', de: 'Deutsch', es: 'Español', pt: 'Português',
    ru: 'Русский', ar: 'العربية',
  };

  const implementedLangs = i18n.options.resources ? Object.keys(i18n.options.resources) : ['zh', 'en'];

  const langItems = supportedLanguages
    .filter(lng => implementedLangs.includes(lng))
    .map(lng => ({
      key: lng,
      label: langNameMap[lng] || lng,
      onClick: () => changeLanguage(lng),
    }));

  const isPluginVisibleForUser = (pluginName: string) => {
    const plugin = activePlugins.find((p: any) => p.name === pluginName);
    if (!plugin) return false;
    if (plugin.allowed_levels === 'all') return true;
    const allowed = plugin.allowed_levels.split(',');
    const userGroup = user?.user_group || '';
    const levelId = user?.level_id != null ? String(user.level_id) : '';
    return allowed.includes(userGroup) || (levelId !== '' && allowed.includes(levelId));
  };



  const popoverBorderBottom = _isLight ? '1px solid #f0f0f0' : '1px solid rgba(255,255,255,0.08)';
  const popoverCardBg = _isLight ? '#f9fafb' : 'rgba(255, 255, 255, 0.04)';
  const popoverCardHoverBg = _isLight ? '#f3f4f6' : 'rgba(255, 255, 255, 0.08)';
  const popoverTitleColor = _isLight ? '#1f2937' : '#fff';
  const popoverTimeColor = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)';
  const popoverContentColor = _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.7)';
  const popoverEmptyIconColor = _isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)';
  const popoverEmptyTextColor = _isLight ? '#6b7280' : '#e5e5e5';
  const popoverEmptySubtextColor = _isLight ? '#9ca3af' : 'rgba(255,255,255,0.45)';

  const announcementContent = (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: popoverBorderBottom
      }}>
        <span style={{ color: popoverTitleColor, fontSize: 16, fontWeight: 500 }}>{t('header.notifications', '通知')}</span>
      </div>

      <div style={{
        maxHeight: 480, overflowY: 'auto', padding: announcements.length > 0 ? '16px' : '60px 20px',
        display: 'flex', flexDirection: 'column',
      }}>
        {announcements.length > 0 ? (
          <List
            itemLayout="vertical"
            dataSource={announcements}
            split={false}
            renderItem={(item: any) => (
              <div
                key={item.id}
                style={{
                  background: popoverCardBg,
                  borderRadius: 12,
                  padding: '16px',
                  marginBottom: 12,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = popoverCardHoverBg;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = popoverCardBg;
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {item.is_pinned === 1 && (
                      <div style={{
                        background: themeMode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.08)',
                        color: themeMode === 'light' ? '#3f3f46' : '#d4d4d8', fontSize: 12,
                        padding: '2px 6px', borderRadius: 4, marginTop: 2, whiteSpace: 'nowrap',
                        border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
                        flexShrink: 0
                      }}>
                        {t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: popoverTitleColor, fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
                      {getAnnouncementLabel(item.title)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: popoverTimeColor, fontSize: 12 }}>
                    <ScheduleOutlined />
                    {formatApiDateTime(item.created_at, 'YYYY-MM-DD HH:mm')}
                  </div>
                </div>

                <div
                  className="quill-content"
                  dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(item.content) }}
                  style={{
                    color: popoverContentColor, fontSize: 13, lineHeight: 1.6,
                    background: 'transparent', padding: '0', overflowWrap: 'break-word', wordBreak: 'break-all'
                  }}
                />
              </div>
            )}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <BellOutlined style={{ fontSize: 64, color: popoverEmptyIconColor, marginBottom: 24 }} />
            <div style={{ color: popoverEmptyTextColor, fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{t('header.notifications', '你的通知将出现在这里')}</div>
            <div style={{ color: popoverEmptySubtextColor, fontSize: 13, lineHeight: 1.6, maxWidth: 260 }}>
              {t('header.no_notifications_desc', '平台重要公告及更新内容将在这里展示，即可第一时间收到通知。')}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );
      if (isInputActive) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadProjects = useCallback(async () => {
    try {

      try {
        const statsRes = await request.get('/playground/storage-stats') as any;
        setStorageStats(statsRes);
      } catch (e) {
        console.error('获取存储统计失败', e);
      }

      setInitPhase('正在加载项目...');
      const res = await request.get('/playground/projects') as any;
      let list: ProjectItem[] = res?.projects || [];
      if (list.length === 0 && !isCreatingRef.current) {
        isCreatingRef.current = true;
        try {
          setInitPhase('正在创建第一个项目...');
          const createRes = await request.post('/playground/projects', { name: '未命名项目' }, { skipErrorHandler: true } as any) as any;
          if (createRes?.id) {
            const freshRes = await request.get('/playground/projects') as any;
            list = freshRes?.projects || [];
          }
        } catch (err: any) {
          const errMsg = err?.response?.data?.error?.message || '自动创建项目失败';
          appMessage.error({ content: errMsg, key: 'create-project-error' });
        } finally {
          isCreatingRef.current = false;
        }
      }
      setProjects(list);
      setSelectedProject(prev => {
        if (!prev && list.length > 0) return list[0];
        if (prev && !list.find(p => p.id === prev.id)) return list[0] || null;
        return prev;
      });
      setInitPhase('准备就绪');
    } catch (e) {
      console.error('加载项目列表失败', e);
    } finally {
      setLoading(false);
      setTimeout(() => setInitializing(false), 400);
    }
  }, []);

  // 初始化存储：检查 TOS 配置并创建用户文件夹
  const initStorage = useCallback(async () => {
    try {
      setStorageError(null);
      setInitializing(true);
      setInitPhase('正在初始化存储空间...');
      await request.post('/playground/init-storage', {});
      setStorageReady(true);
      // 存储就绪后加载项目
      loadProjects();
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || e?.message || '存储初始化失败';
      setStorageError(errMsg);
      setStorageReady(false);
      setLoading(false);
      setInitializing(false);
    }
  }, [loadProjects]);

  useEffect(() => {
    const siteNameStr = settings?.site?.name || 'AI 创作中心';
    const pgTitle = t('playground:title', '创作中心');
    document.title = `${pgTitle}-${siteNameStr}`;
    initStorage();
  }, [initStorage, settings, t]);

  const handleCreateProject = useCallback(async (promptText?: string) => {
    if (manualCreatingRef.current) return;
    manualCreatingRef.current = true;
    setIsCreating(true);
    try {
      const res = await request.post(
        '/playground/projects', 
        { name: promptText ? '新对话项目' : '未命名项目' },
        { skipErrorHandler: true } as any
      ) as any;
      if (res?.id) {
        navigate(`/playground/${res.id}`);
      }
      manualCreatingRef.current = false;
      setIsCreating(false);
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message || '创建项目失败';
      appMessage.error({ content: errMsg, key: 'create-project-error' });
      // Keep it disabled for 1.5s after error to prevent spam click
      setTimeout(() => {
        manualCreatingRef.current = false;
        setIsCreating(false);
      }, 1500);
    }
  }, [navigate]);

  const handleOpenProject = useCallback((projectId: number) => {
    window.open(`/playground/${projectId}`, '_blank');
  }, []);

  const handleDeleteProject = useCallback((e: React.MouseEvent | null, projectId: number) => {
    if (e) e.stopPropagation();
    
    if (projects.length <= 1) {
      appMessage.info('由于这是您的最后一个项目，建议直接编辑或重命名使用。');
      return;
    }

    modal.confirm({
      title: <span style={{ color: themeMode === 'dark' ? '#E3E3E3' : '#1f2937' }}>确认删除此项目？</span>,
      content: <span style={{ color: 'rgba(255,77,79,0.8)' }}>警告：此操作为物理删除，删除后该项目下的所有内容和数据将永久丢失，无法恢复！</span>,
      wrapClassName: themeMode === 'dark' ? 'dark-confirm-modal' : 'light-confirm-modal',
      className: themeMode === 'dark' ? 'dark-confirm-modal' : 'light-confirm-modal',
      okText: '确定删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      async onOk() {
        try {
          await request.delete(`/playground/projects/${projectId}`);
          appMessage.success('项目已删除');
          await loadProjects();
        } catch {
          appMessage.error('删除失败');
        }
      },
    });
  }, [loadProjects, projects.length]);

  const handleRename = useCallback(async (projectId: number) => {
    if (!editingName.trim()) { setEditingId(null); return; }
    if (editingName.trim().length > 24) {
      appMessage.error('项目名称不得超过 24 个字');
      return;
    }
    try {
      await request.put(`/playground/projects/${projectId}`, { name: editingName.trim() });
      await loadProjects();
      setEditingId(null);
    } catch {
      appMessage.error('重命名失败');
    }
  }, [editingName, loadProjects]);

  const handleTogglePin = useCallback(async (project: ProjectItem) => {
    const nextPin = project.is_pinned === 1 ? 0 : 1;
    try {
      await request.put(`/playground/projects/${project.id}`, { is_pinned: nextPin });
      appMessage.success(nextPin === 1 ? '项目已置顶' : '已取消置顶');
      await loadProjects();
    } catch {
      appMessage.error('操作失败');
    }
  }, [loadProjects]);

  const renderGridItem = (project: ProjectItem) => {
    const isProjHovered = hoveredId === project.id;
    const stats = getProjectStats(project.canvas_data);
    return (
      <div
        key={project.id}
        onMouseEnter={() => setHoveredId(project.id)}
        onMouseLeave={() => setHoveredId(null)}
        style={{
          borderRadius: 8,
          background: themeMode === 'light' ? '#ffffff' : '#141416',
          border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isProjHovered ? 'translateY(-2px)' : 'translateY(0)',
          boxShadow: isProjHovered 
            ? (themeMode === 'light' ? '0 10px 30px rgba(0,0,0,0.04)' : '0 10px 30px rgba(0,0,0,0.3)')
            : 'none',
        }}
      >
        {/* 封面图 */}
        <div
          onClick={() => handleOpenProject(project.id)}
          style={{
            height: 110, width: '100%',
            background: themeMode === 'light' ? '#f4f4f5' : '#1e1e20',
            borderBottom: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', cursor: 'pointer', position: 'relative'
          }}
        >
          {project.cover_url ? (
            /\.(mp4|webm|mov)(\?|$)/i.test(project.cover_url) ? (
              <video src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline />
            ) : (
              <img src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
            )
          ) : (
            <FileTextOutlined style={{ color: themeMode === 'light' ? '#e4e4e7' : '#27272a', fontSize: 28 }} />
          )}
          
          {/* 悬浮入项目遮罩 */}
          {isProjHovered && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.2s', zIndex: 1
            }}>
              <span style={{
                padding: '5px 12px', borderRadius: 16,
                background: themeMode === 'light' ? '#09090b' : '#fafafa',
                color: themeMode === 'light' ? '#ffffff' : '#09090b',
                fontSize: 11, fontWeight: 500
              }}>进入项目</span>
            </div>
          )}

          {/* 资源标签 (Assets) */}
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            zIndex: 2
          }}>
            <div style={{
              background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 20,
              padding: '2px 6px', fontSize: 10, color: '#ffffff',
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
              <span>{project.asset_count !== undefined ? project.asset_count : stats.assetCount} {i18n.language === 'zh' ? '资源' : 'Assets'}</span>
            </div>
          </div>
        </div>

        {/* 卡片详情 */}
        <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {editingId === project.id ? (
              <Input
                size="small" value={editingName} autoFocus
                maxLength={24}
                onChange={e => setEditingName(e.target.value)}
                onPressEnter={() => handleRename(project.id)}
                onBlur={() => handleRename(project.id)}
                onClick={e => e.stopPropagation()}
                style={{
                  background: themeMode === 'dark' ? '#131314' : '#fff',
                  border: themeMode === 'dark' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.15)',
                  color: themeMode === 'dark' ? '#fff' : '#000', borderRadius: 4, height: 24, fontSize: 12.5,
                }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', overflow: 'hidden' }}>
                {project.is_pinned === 1 && (
                  <Tooltip title="已置顶">
                    <ArrowUpOutlined style={{ color: themeToken?.colorPrimary || '#1677ff', fontSize: 12, flexShrink: 0 }} />
                  </Tooltip>
                )}
                <span 
                  onClick={() => handleOpenProject(project.id)}
                  style={{
                    fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
                    color: themeMode === 'light' ? '#09090b' : '#ffffff',
                    flex: 1
                  }}
                >
                  {project.name}
                </span>
              </div>
            )}
            <div style={{
              fontSize: 10.5,
              color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
              fontFamily: 'monospace',
              userSelect: 'all',
              marginTop: 0
            }}>
              ID: {project.id}
            </div>
          </div>

          {/* 底部信息与三个点下拉菜单 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderTop: themeMode === 'light' ? '1px solid #f4f4f5' : '1px solid #1f1f23',
            paddingTop: 4, marginTop: 1
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', flex: 1, marginRight: 8 }}>
              <Avatar 
                size={16} 
                src={user?.avatar} 
                style={{
                  background: themeMode === 'light' ? '#e4e4e7' : '#27272a',
                  color: themeMode === 'light' ? '#18181b' : '#fafafa',
                  fontSize: 8,
                  flexShrink: 0
                }}
              >
                {user?.nickname?.[0] || user?.username?.[0] || 'U'}
              </Avatar>
              <span style={{
                fontSize: 10.5, color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {user?.nickname || user?.username || 'User'} <span style={{ opacity: 0.4, marginLeft: 1, marginRight: 1 }}>/</span> {getRelativeTimeAgo(project.created_at, i18n.language)}
              </span>
            </div>

            <div style={{ flexShrink: 0 }}>
              <Dropdown
                menu={{
                  items: [
                    { key: 'pin', label: project.is_pinned === 1 ? t('playground:unpin', '取消置顶') : t('playground:pin', '置顶项目'), icon: <ArrowUpOutlined /> },
                    { key: 'rename', label: t('playground:rename', '重命名'), icon: <EditOutlined /> },
                    { key: 'delete', label: t('playground:delete', '删除项目'), danger: true, icon: <DeleteOutlined /> }
                  ],
                  onClick: ({ key, domEvent }) => {
                    domEvent.stopPropagation();
                    if (key === 'pin') {
                      handleTogglePin(project);
                    } else if (key === 'rename') {
                      setEditingId(project.id);
                      setEditingName(project.name);
                    } else if (key === 'delete') {
                      handleDeleteProject(null, project.id);
                    }
                  }
                }}
                trigger={['click']}
                placement="bottomRight"
                overlayClassName="custom-premium-dropdown"
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    width: 20, height: 20, borderRadius: 4,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: themeMode === 'light' ? '#71717a' : '#a1a1aa', cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = themeMode === 'light' ? '#f4f4f5' : 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <EllipsisOutlined style={{ fontSize: 16 }} />
                </div>
              </Dropdown>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderListRow = (project: ProjectItem) => {
    return (
      <div
        key={project.id}
        onClick={() => handleOpenProject(project.id)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 3fr) 2fr 2fr 80px',
          alignItems: 'center',
          padding: '6px 12px',
          borderRadius: 6,
          background: 'transparent',
          cursor: 'pointer',
          transition: 'all 0.2s',
          marginBottom: 2
        }}
        onMouseEnter={e => e.currentTarget.style.background = themeMode === 'light' ? '#f4f4f5' : '#1a1a1d'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Name & edited time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
          <div style={{
            width: 54, height: 32, borderRadius: 4, overflow: 'hidden',
            background: themeMode === 'light' ? '#f4f4f5' : '#1e1e20',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            {project.cover_url ? (
              /\.(mp4|webm|mov)(\?|$)/i.test(project.cover_url) ? (
                <video src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline />
              ) : (
                <img src={getFullUrl(project.cover_url)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )
            ) : (
              <FileTextOutlined style={{ fontSize: 14, color: themeMode === 'light' ? '#a1a1aa' : '#55555c' }} />
            )}
          </div>

          <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0 }}>
            {editingId === project.id ? (
              <Input
                size="small" value={editingName} autoFocus
                maxLength={24}
                onChange={e => setEditingName(e.target.value)}
                onPressEnter={() => handleRename(project.id)}
                onBlur={() => handleRename(project.id)}
                onClick={e => e.stopPropagation()}
                style={{
                  background: themeMode === 'dark' ? '#131314' : '#fff',
                  border: themeMode === 'dark' ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.15)',
                  color: themeMode === 'dark' ? '#fff' : '#000', borderRadius: 4, height: 24, fontSize: 12.5,
                  width: '100%', maxWidth: '200px'
                }}
              />
            ) : (
              <div style={{
                fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: themeMode === 'light' ? '#09090b' : '#ffffff',
                display: 'flex', alignItems: 'center', gap: 6
              }}>
                {project.is_pinned === 1 && (
                  <Tooltip title="已置顶">
                    <ArrowUpOutlined style={{ color: themeToken?.colorPrimary || '#1677ff', fontSize: 12, flexShrink: 0 }} />
                  </Tooltip>
                )}
                <span>{project.name}</span>
              </div>
            )}
            <div style={{
              fontSize: 10.5,
              color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 0
            }}>
              <span style={{ fontFamily: 'monospace', userSelect: 'all' }}>ID: {project.id}</span>
              <span style={{ opacity: 0.4 }}>/</span>
              <span>{i18n.language === 'zh' ? '编辑于 ' : 'Edited '}{getRelativeTimeAgo(project.updated_at || project.created_at, i18n.language)}</span>
            </div>
          </div>
        </div>

        {/* Created By */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <Avatar 
            size={18} 
            src={user?.avatar} 
            style={{
              background: themeMode === 'light' ? '#e4e4e7' : '#27272a',
              color: themeMode === 'light' ? '#18181b' : '#fafafa',
              fontSize: 9,
              flexShrink: 0
            }}
          >
            {user?.nickname?.[0] || user?.username?.[0] || 'U'}
          </Avatar>
          <span style={{
            fontSize: 12, color: themeMode === 'light' ? '#09090b' : '#ffffff',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {user?.nickname || user?.username || 'User'}
          </span>
        </div>

        {/* Created At */}
        <div style={{ fontSize: 12, color: themeMode === 'light' ? '#09090b' : '#ffffff' }}>
          {formatDateEn(project.created_at)}
        </div>

        {/* Three dots actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Dropdown
            menu={{
              items: [
                { key: 'pin', label: project.is_pinned === 1 ? t('playground:unpin', '取消置顶') : t('playground:pin', '置顶项目'), icon: <ArrowUpOutlined /> },
                { key: 'rename', label: t('playground:rename', '重命名'), icon: <EditOutlined /> },
                { key: 'delete', label: t('playground:delete', '删除项目'), danger: true, icon: <DeleteOutlined /> }
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'pin') {
                  handleTogglePin(project);
                } else if (key === 'rename') {
                  setEditingId(project.id);
                  setEditingName(project.name);
                } else if (key === 'delete') {
                  handleDeleteProject(null, project.id);
                }
              }
            }}
            trigger={['click']}
            placement="bottomRight"
            overlayClassName="custom-premium-dropdown"
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: 22, height: 22, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: themeMode === 'light' ? '#71717a' : '#a1a1aa', cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = themeMode === 'light' ? '#f4f4f5' : 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <EllipsisOutlined style={{ fontSize: 16 }} />
            </div>
          </Dropdown>
        </div>
      </div>
    );
  };

  const filteredProjects = (() => {
    const list = projects.filter(p =>
      !searchKeyword || p.name.toLowerCase().includes(searchKeyword.toLowerCase())
    );
    if (sortBy === 'recent') {
      return list.sort((a, b) => {
        const getMs = (dateStr: string) => parseApiTimeAsUtc(dateStr)?.getTime() ?? 0;
        const ta = getMs(a.created_at);
        const tb = getMs(b.created_at);
        if (ta !== tb) return tb - ta;
        return b.id - a.id;
      });
    }
    if (sortBy === 'oldest') {
      return list.sort((a, b) => {
        const getMs = (dateStr: string) => parseApiTimeAsUtc(dateStr)?.getTime() ?? 0;
        const ta = getMs(a.created_at);
        const tb = getMs(b.created_at);
        if (ta !== tb) return ta - tb;
        return a.id - b.id;
      });
    }
    if (sortBy === 'name') {
      return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }
    return list;
  })();

  const pinnedProjects = filteredProjects.filter(p => p.is_pinned === 1);
  const unpinnedProjects = filteredProjects.filter(p => p.is_pinned !== 1);

  const suggestions = [
    "A browse tab for a mobile app for roma...",
    "A daily check-in page for a menstrual c...",
    "Mobile friendly home page for a bakery..."
  ];

  return (
    <ConfigProvider theme={{
      
      token: { fontFamily: "'Inter', 'PingFang SC', sans-serif" }
    }}>
      <div style={{
        height: '100vh', width: '100vw', display: 'flex',
        background: themeMode === 'light' ? '#ffffff' : '#1E1E20',
        color: themeMode === 'light' ? '#1f2937' : '#fff',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <CanvasParticles />

        <style>{`
          @keyframes pgSpin {
            to { transform: rotate(360deg); }
          }
          @keyframes pgFadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes pgShimmer {
            0% { background-position: -200px 0; }
            100% { background-position: 200px 0; }
          }
          @keyframes pgPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.15; }
          }
          
          /* 强制覆盖 Modal.confirm 的深色样式 */
          .dark-confirm-modal .ant-modal-content,
          .dark-confirm-modal.ant-modal-content,
          .ant-modal-wrap.dark-confirm-modal .ant-modal-content {
            background: #1e1f20 !important;
            border: 1px solid #444746 !important;
            border-radius: 16px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5) !important;
          }
          .dark-confirm-modal .ant-modal-confirm-title { color: #e3e3e3 !important; }
          .dark-confirm-modal .ant-modal-confirm-content { color: #c4c7c5 !important; }
          .dark-confirm-modal .ant-btn-default {
            background: transparent !important;
            border: 1px solid #444746 !important;
            color: #e3e3e3 !important;
            border-radius: 8px !important;
            outline: none !important;
            box-shadow: none !important;
          }
          .dark-confirm-modal .ant-btn-default:hover {
            background: rgba(255,255,255,0.08) !important;
          }
          
          /* 搜索框统一样式对齐模型广场 */
          .mp-search .ant-input-affix-wrapper {
            background: ${themeMode === 'light' ? '#f4f5f7' : '#18181b'} !important;
            border: 1px solid ${themeMode === 'light' ? '#d1d5db' : '#222225'} !important;
            border-radius: 8px !important;
            height: 40px !important;
            font-size: 14px !important;
          }
          .mp-search .ant-input-affix-wrapper:hover,
          .mp-search .ant-input-affix-wrapper:focus-within {
            border-color: ${themeMode === 'light' ? '#434343' : '#4f4f56'} !important;
          }
          .mp-search .ant-input {
            background: transparent !important;
            color: ${themeMode === 'light' ? '#4b5563' : 'rgba(255,255,255,0.75)'} !important;
          }
        `}</style>

        {/* ===== 存储未配置错误遮罩 ===== */}
        {storageError && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: _isLight ? 'rgba(255, 255, 255, 0.75)' : 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{
              background: _isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 30, 34, 0.95)',
              border: '1px solid rgba(255, 77, 79, 0.3)',
              borderRadius: 24,
              padding: '48px 40px',
              maxWidth: 460,
              textAlign: 'center',
              boxShadow: _isLight ? '0 12px 40px rgba(0,0,0,0.1)' : '0 24px 60px rgba(0,0,0,0.5)',
            }}>
              <ExclamationCircleOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 20 }} />
              <h2 style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>创作中心暂不可用</h2>
              <p style={{ color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.8, margin: '0 0 8px' }}>
                请正确配置系统存储（火山引擎 TOS 对象存储）后再使用创作中心。
              </p>
              <p style={{ color: 'rgba(255,77,79,0.8)', fontSize: 13, lineHeight: 1.6, margin: '0 0 28px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {storageError}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <div
                  onClick={() => navigate('/dashboard')}
                  style={{
                    padding: '8px 24px', borderRadius: 12, cursor: 'pointer',
                    background: _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                    color: _isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)'}
                >
                  返回首页
                </div>
                <div
                  onClick={() => initStorage()}
                  style={{
                    padding: '8px 24px', borderRadius: 12, cursor: 'pointer',
                    background: themeMode === 'light' ? '#09090b' : '#fafafa',
                    border: `1px solid ${themeMode === 'light' ? '#09090b' : '#fafafa'}`,
                    color: themeMode === 'light' ? '#ffffff' : '#09090b', fontSize: 14, fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = themeMode === 'light' ? '#27272a' : '#e4e4e7'}
                  onMouseLeave={e => e.currentTarget.style.background = themeMode === 'light' ? '#09090b' : '#fafafa'}
                >
                  <ReloadOutlined />
                  重试
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 移动端下展开侧边栏时的遮罩 Mask */}
        {isMobile && !sidebarCollapsed && (
          <div 
            onClick={() => setSidebarCollapsed(true)}
            style={{
              position: 'absolute', inset: 0, zIndex: 9,
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
              animation: 'pgFadeIn 0.2s ease-out'
            }} 
          />
        )}

        {/* ===== 左侧 Sidebar 菜单 ===== */}
        <div style={{
          width: sidebarCollapsed ? (isMobile ? 0 : 68) : 240, height: '100%', flexShrink: 0,
          background: themeMode === 'light' ? '#f8f9fa' : '#141414',
          borderRight: (sidebarCollapsed && isMobile) ? 'none' : (themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23'),
          display: 'flex', flexDirection: 'column',
          zIndex: 10,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
          position: (isMobile && sidebarCollapsed) ? 'absolute' : (isMobile ? 'absolute' : 'relative'),
          left: 0, top: 0
        }}>
          {/* 顶部 Logo 与网站名 */}
          <div style={{
            height: isMobile ? 48 : 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 8px',
            borderBottom: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23',
            flexShrink: 0
          }}>
            {siteLogo ? (
              sidebarCollapsed ? (
                <img src={siteLogo} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain', cursor: 'pointer' }} onClick={() => navigate('/dashboard')} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
                  <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                  <div style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all' }}>
                    {siteName}
                  </div>
                </div>
              )
            ) : (
              sidebarCollapsed ? (
                <div style={{
                  width: 32, height: 32, borderRadius: 6,
                  background: themeMode === 'light' ? '#1f2937' : '#fff',
                  color: themeMode === 'light' ? '#fff' : '#000',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 16, cursor: 'pointer'
                }} onClick={() => navigate('/dashboard')}>
                  {siteName.charAt(0).toUpperCase()}
                </div>
              ) : (
                <div style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all', cursor: 'pointer', textAlign: 'center' }} onClick={() => navigate('/dashboard')}>
                  {siteName}
                </div>
              )
            )}
          </div>

          {/* 中间：菜单区 */}
          <div className="mp-sidebar-content" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <Tooltip title={sidebarCollapsed ? t('playground:projects', '我的项目') : ""} placement="right">
                <div
                  onClick={() => {
                    setActiveTab('my');
                    if (isMobile) setSidebarCollapsed(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    gap: 8,
                    width: sidebarCollapsed ? 46 : 'auto',
                    height: sidebarCollapsed ? 46 : 36,
                    padding: sidebarCollapsed ? 0 : '0 12px',
                    margin: sidebarCollapsed ? '2px auto' : '2px 8px',
                    borderRadius: sidebarCollapsed ? 8 : 6,
                    cursor: 'pointer',
                    background: activeTab === 'my' ? (themeMode === 'light' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)') : 'transparent',
                    color: activeTab === 'my' ? (themeMode === 'light' ? '#1f2937' : '#ffffff') : (themeMode === 'light' ? '#4b5563' : 'rgba(255, 255, 255, 0.65)'),
                    fontWeight: activeTab === 'my' ? 500 : 400,
                    fontSize: 13.5,
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== 'my') {
                      e.currentTarget.style.background = themeMode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)';
                      e.currentTarget.style.color = themeMode === 'light' ? '#1f2937' : '#ffffff';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== 'my') {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = themeMode === 'light' ? '#4b5563' : 'rgba(255, 255, 255, 0.65)';
                    }
                  }}
                >
                  <FolderOutlined style={{ fontSize: sidebarCollapsed ? 22 : 18 }} />
                  {!sidebarCollapsed && <span>{t('playground:projects', '我的项目')}</span>}
                </div>
              </Tooltip>
            </div>
          </div>

          {/* 底部：当前登录用户的信息修改为项目配额和存储容量 */}
          <div style={{
            padding: sidebarCollapsed ? '16px 0' : '16px 12px',
            borderTop: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            {storageStats ? (
              sidebarCollapsed ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <Tooltip title={`${t('playground:project_quota', '项目额度')}: ${storageStats.project_count} / ${storageStats.max_projects}`} placement="right">
                    <div style={{
                      width: 46, height: 46, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: themeMode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
                      color: themeMode === 'light' ? '#4b5563' : 'rgba(255, 255, 255, 0.65)',
                      cursor: 'pointer'
                    }}>
                      <FolderOutlined style={{ fontSize: 22 }} />
                    </div>
                  </Tooltip>
                  <Tooltip title={`${t('playground:storage_quota', '存储容量')}: ${(storageStats.total_size_mb || 0).toFixed(1)} / ${storageStats.quota_mb} MB`} placement="right">
                    <div style={{
                      width: 46, height: 46, borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: themeMode === 'light' ? 'rgba(0, 0, 0, 0.04)' : 'rgba(255, 255, 255, 0.08)',
                      color: themeMode === 'light' ? '#4b5563' : 'rgba(255, 255, 255, 0.65)',
                      cursor: 'pointer'
                    }}>
                      <DatabaseOutlined style={{ fontSize: 22 }} />
                    </div>
                  </Tooltip>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* 可创建项目数 */}
                  <div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 12, marginBottom: 6,
                      color: themeMode === 'light' ? '#71717a' : '#88888e'
                    }}>
                      <span>{t('playground:project_limit', '可创建项目数')}</span>
                      <span style={{ color: themeMode === 'light' ? '#09090b' : '#fafafa', fontSize: 12 }}>
                        <strong style={{ fontWeight: 600, color: themeMode === 'light' ? '#09090b' : '#ffffff' }}>{storageStats.project_count}</strong>
                        <span style={{ color: themeMode === 'light' ? '#a1a1aa' : '#55555c', marginLeft: 3, marginRight: 3 }}>/</span>
                        <span style={{ color: themeMode === 'light' ? '#71717a' : '#88888e' }}>{storageStats.max_projects}</span>
                      </span>
                    </div>
                    <div style={{
                      width: '100%', height: 4,
                      background: themeMode === 'light' ? '#e4e4e7' : '#1f1f23',
                      borderRadius: 2, overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, (storageStats.project_count / (storageStats.max_projects || 1)) * 100)}%`,
                        background: themeMode === 'light' ? '#09090b' : '#ffffff',
                        borderRadius: 2
                      }} />
                    </div>
                  </div>

                  {/* 空间大小限制 */}
                  <div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 12, marginBottom: 6,
                      color: themeMode === 'light' ? '#71717a' : '#88888e'
                    }}>
                      <span>{t('playground:storage_limit', '空间大小限制')}</span>
                      <span style={{ color: themeMode === 'light' ? '#09090b' : '#fafafa', fontSize: 12 }}>
                        <strong style={{ fontWeight: 600, color: themeMode === 'light' ? '#09090b' : '#ffffff' }}>{(storageStats.total_size_mb || 0).toFixed(1)}</strong>
                        <span style={{ color: themeMode === 'light' ? '#a1a1aa' : '#55555c', marginLeft: 3, marginRight: 3 }}>/</span>
                        <span style={{ color: themeMode === 'light' ? '#71717a' : '#88888e' }}>{storageStats.quota_mb} MB</span>
                      </span>
                    </div>
                    <div style={{
                      width: '100%', height: 4,
                      background: themeMode === 'light' ? '#e4e4e7' : '#1f1f23',
                      borderRadius: 2, overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, storageStats.usage_percent || 0)}%`,
                        background: (storageStats.usage_percent || 0) > 90 ? '#ff4d4f' : (themeMode === 'light' ? '#09090b' : '#ffffff'),
                        borderRadius: 2
                      }} />
                    </div>
                  </div>
                </div>
              )
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {!sidebarCollapsed && (
                  <>
                    <div style={{ height: 12, background: themeMode === 'light' ? '#f4f4f5' : '#1f1f23', borderRadius: 4 }} />
                    <div style={{ height: 4, background: themeMode === 'light' ? '#f4f4f5' : '#1f1f23', borderRadius: 2 }} />
                    <div style={{ height: 12, background: themeMode === 'light' ? '#f4f4f5' : '#1f1f23', borderRadius: 4 }} />
                    <div style={{ height: 4, background: themeMode === 'light' ? '#f4f4f5' : '#1f1f23', borderRadius: 2 }} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ===== 右侧 Main 区域 ===== */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', zIndex: 1,
          background: themeMode === 'light' ? '#ffffff' : '#000000'
        }}>
          {/* 顶部 Navbar */}
          <div style={{
            height: isMobile ? 48 : 56, flexShrink: 0,
            background: themeMode === 'light' ? '#ffffff' : '#000000',
            borderBottom: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px',
          }}>
            {/* 左侧：面包屑与展开/收起开关 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Button
                type="text"
                icon={<SidebarIcon size={16} />}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                style={{
                  width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
                  marginRight: 4
                }}
              />
              <span style={{ color: themeMode === 'light' ? '#71717a' : '#a1a1aa', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>{t('playground:title', '创作中心')}</span>
              <span style={{ color: themeMode === 'light' ? '#e4e4e7' : '#27272a' }}>/</span>
              <span style={{ fontWeight: 500 }}>{t('playground:projects', '我的项目')}</span>
            </div>

            {/* 右侧：工具项 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>

              {/* 右侧工具对齐主站控制台 */}
              <Space size={isMobile ? 4 : 8} align="center">
                {/* 1. 模型广场 */}
                {!isMobile && isPluginVisibleForUser('model_marketplace') && (
                  <Tooltip title={t('menu.model_marketplace', '模型广场')} placement="bottom">
                    <Button
                      type="text"
                      href="/models"
                      icon={
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                        >
                          <path d="M12 2L19.5 6.2L12 10.5L4.5 6.2Z" fill={themeMode === 'light' ? '#e0e0e0' : '#2e2e2e'} />
                          <path d="M3.5 7.8L11 12V21L3.5 16.8Z" fill={themeMode === 'light' ? '#b0b0b0' : '#555555'} />
                          <path d="M13 12L20.5 7.8V16.8L13 21Z" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} />
                        </svg>
                      }
                      style={{
                        color: themeMode === 'light' ? '#1f2937' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 14,
                        fontWeight: 500,
                        height: 40,
                        padding: '0 12px',
                      }}
                      onClick={(e) => {
                        if (!e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          navigate('/models');
                        }
                      }}
                    >
                      <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.model_marketplace', '模型广场')}</span>
                    </Button>
                  </Tooltip>
                )}

                {/* 2. API教程 */}
                {!isMobile && (
                  <Tooltip title={t('menu.relay_api', 'API教程')} placement="bottom">
                    <Button
                      type="text"
                      href="/docs"
                      icon={<RocketOutlined style={{ fontSize: '16px', verticalAlign: 'middle', transform: 'translateY(1.5px)' }} />}
                      style={{
                        color: themeMode === 'light' ? '#1f2937' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 14,
                        fontWeight: 500,
                        height: 40,
                        padding: '0 12px',
                      }}
                      onClick={(e) => {
                        if (!e.metaKey && !e.ctrlKey) {
                          e.preventDefault();
                          navigate('/docs');
                        }
                      }}
                    >
                      <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{t('menu.relay_api', 'API教程')}</span>
                    </Button>
                  </Tooltip>
                )}

                {/* 3. 主题切换 */}
                {enableThemeToggle && (
                  <Tooltip title={themeMode === 'light' ? t('header.switch_dark_mode', '切换暗色模式') : t('header.switch_light_mode', '切换亮色模式')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
                    <Button
                      type="text"
                      shape="circle"
                      onClick={toggleTheme}
                      icon={
                        themeMode === 'light'
                          ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79Z" fill="#757575" />
                            </svg>
                          )
                          : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                              <circle cx="12" cy="12" r="6" fill="#555555" />
                              <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" stroke="#9e9e9e" strokeWidth="2.2" strokeLinecap="round" />
                            </svg>
                          )
                      }
                      style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                    />
                  </Tooltip>
                )}

                {/* 4. 多语言切换 */}
                {enableMultilingual && (
                  <Dropdown menu={{ items: langItems }} placement="bottomRight">
                    <Button
                      type="text"
                      shape="circle"
                      icon={
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}>
                          <circle cx="12" cy="12" r="8.5" stroke={themeMode === 'light' ? '#757575' : '#9e9e9e'} strokeWidth="2" />
                          <path d="M3.5 12h17" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2" strokeLinecap="round" />
                          <ellipse cx="12" cy="12" rx="3.5" ry="8.5" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2" />
                        </svg>
                      }
                      style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                    />
                  </Dropdown>
                )}

                {/* 5. 通知中心 */}
                <Popover
                  content={announcementContent}
                  trigger="click"
                  placement="bottomRight"
                  overlayClassName="custom-premium-popover"
                  open={announcementsDrawerVisible}
                  onOpenChange={setAnnouncementsDrawerVisible}
                  styles={{ container: { padding: 0, background: 'transparent', boxShadow: 'none' } }}
                  motion={{ motionName: '' }}
                  arrow={false}
                >
                  <Tooltip title={t('header.notifications', '通知')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
                    <Badge count={unreadCount} overflowCount={99} offset={[-4, 4]} className="header-badge">
                      <Button
                        type="text"
                        shape="circle"
                        icon={
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            style={{ verticalAlign: 'middle', transform: 'translateY(1.5px)' }}
                          >
                            <path d="M19 16.5v-6.5a7 7 0 00-14 0v6.5l-2 2h18l-2-2z" fill={themeMode === 'light' ? '#757575' : '#9e9e9e'} stroke={themeMode === 'light' ? '#757575' : '#9e9e9e'} strokeWidth="1.5" strokeLinejoin="round" />
                            <path d="M10 19.5a2 2 0 004 0" stroke={themeMode === 'light' ? '#b0b0b0' : '#555555'} strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        }
                        style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}
                        onClick={() => {
                          setUnreadCount(0);
                        }}
                      />
                    </Badge>
                  </Tooltip>
                </Popover>

                {/* 6. 用户头像 */}
                {user && (
                  <UserAvatarMenu isUserEnd={true} agreement={agreement} />
                )}
              </Space>
            </div>
          </div>

          {/* 主体内容滚动区 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px' : '16px 24px' }} className="pg-scroll">
            
            {/* 顶栏标题与副标题 */}
            <div style={{ marginBottom: 16 }}>
              <h1 style={{
                fontSize: 22, fontWeight: 700, margin: '0 0 4px', letterSpacing: '-0.5px',
                color: themeMode === 'light' ? '#09090b' : '#ffffff'
              }}>
                {t('playground:projects', 'Projects')}
              </h1>
              <p style={{
                color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
                fontSize: 12.5, margin: 0, maxWidth: '600px', lineHeight: '1.4'
              }}>
                {t('playground:projects_desc', 'Design your powerful creative workflows by linking nodes and steps to customize and control every output.')}
              </p>
            </div>

            {/* 控制工具条 */}
            <div className="mp-toolbar" style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap',
              justifyContent: 'flex-start'
            }}>
              {/* 搜索框 */}
              <div className="mp-search" style={{ flex: 1, minWidth: 200, maxWidth: isMobile ? '100%' : 420 }}>
                <Input
                  ref={searchInputRef}
                  size="middle"
                  style={{ height: 32 }}
                  placeholder={t('playground:search_placeholder', '搜索项目...')}
                  prefix={<SearchOutlined style={{ color: themeMode === 'light' ? '#6b7280' : 'rgba(255,255,255,0.5)', marginRight: 8 }} />}
                  value={searchKeyword}
                  onChange={e => setSearchKeyword(e.target.value)}
                  allowClear
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: isMobile ? 0 : 'auto' }}>
                <Tooltip title={t('playground:list_layout', '列表布局')} placement="top">
                  <button
                    onClick={() => setViewMode('list')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: 5,
                      border: `1px solid ${viewMode === 'list' ? (themeMode === 'light' ? '#1f2937' : 'rgba(255,255,255,0.3)') : (themeMode === 'light' ? '#d1d5db' : '#222225')}`,
                      background: viewMode === 'list' ? (themeMode === 'light' ? '#f4f5f7' : 'rgba(255,255,255,0.08)') : 'transparent',
                      color: viewMode === 'list' ? (themeMode === 'light' ? '#000000' : '#ffffff') : (themeMode === 'light' ? '#6b7280' : 'rgba(255,255,255,0.5)'),
                      cursor: 'pointer', fontSize: 14, transition: 'all 0.2s',
                    }}
                  >
                    <UnorderedListOutlined />
                  </button>
                </Tooltip>
                <Tooltip title={t('playground:grid_layout', '网格布局')} placement="top">
                  <button
                    onClick={() => setViewMode('grid')}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, borderRadius: 5,
                      border: `1px solid ${viewMode === 'grid' ? (themeMode === 'light' ? '#1f2937' : 'rgba(255,255,255,0.3)') : (themeMode === 'light' ? '#d1d5db' : '#222225')}`,
                      background: viewMode === 'grid' ? (themeMode === 'light' ? '#f4f5f7' : 'rgba(255,255,255,0.08)') : 'transparent',
                      color: viewMode === 'grid' ? (themeMode === 'light' ? '#000000' : '#ffffff') : (themeMode === 'light' ? '#6b7280' : 'rgba(255,255,255,0.5)'),
                      cursor: 'pointer', fontSize: 14, transition: 'all 0.2s',
                    }}
                  >
                    <AppstoreOutlined />
                  </button>
                </Tooltip>
              </div>

              {/* 排序下拉菜单 */}
              <Dropdown
                menu={{
                  items: [
                    { key: 'recent', label: t('playground:sort_recent', '最近更新') },
                    { key: 'oldest', label: t('playground:sort_oldest', '最早创建') },
                    { key: 'name', label: t('playground:sort_name', '名称排序') }
                  ],
                  onClick: ({ key }) => setSortBy(key as any),
                  selectedKeys: [sortBy]
                }}
                placement="bottomRight"
              >
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px', borderRadius: 5,
                  border: `1px solid ${themeMode === 'light' ? '#d1d5db' : '#222225'}`,
                  background: 'transparent',
                  color: themeMode === 'light' ? '#6b7280' : 'rgba(255,255,255,0.5)',
                  fontSize: 13, cursor: 'pointer', height: 32, boxSizing: 'border-box'
                }}>
                  <SortAscendingOutlined />
                  {sortBy === 'recent' ? t('playground:sort_recent', '最近更新') : sortBy === 'oldest' ? t('playground:sort_oldest', '最早创建') : t('playground:sort_name', '名称排序')}
                </button>
              </Dropdown>
            </div>


            {/* 项目卡片网格 */}
            {initializing && projects.length === 0 ? (
              // 骨架屏
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    borderRadius: 8, height: 200,
                    border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23',
                    animation: 'pgPulse 1.5s ease-in-out infinite',
                  }}>
                    <div style={{ height: 110, background: themeMode === 'light' ? '#f4f4f5' : '#1f1f23' }} />
                    <div style={{ padding: 10 }}>
                      <div style={{ height: 14, width: '60%', background: themeMode === 'light' ? '#f4f4f5' : '#1f1f23', borderRadius: 4, marginBottom: 6 }} />
                      <div style={{ height: 10, width: '40%', background: themeMode === 'light' ? '#f4f4f5' : '#1f1f23', borderRadius: 4 }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 20px', borderRadius: 8,
                background: themeMode === 'light' ? '#ffffff' : '#09090b',
                border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #1f1f23',
                color: themeMode === 'light' ? '#71717a' : '#a1a1aa'
              }}>
                <FolderOutlined style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }} />
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>暂无项目</div>
                <button
                  disabled={isCreating}
                  onClick={() => handleCreateProject()}
                  style={{
                    padding: '6px 16px', borderRadius: 6,
                    background: themeMode === 'light' ? '#09090b' : '#fafafa',
                    color: themeMode === 'light' ? '#ffffff' : '#09090b', border: 'none',
                    fontWeight: 500,
                    cursor: isCreating ? 'not-allowed' : 'pointer',
                    opacity: isCreating ? 0.6 : 1,
                    transition: 'opacity 0.2s',
                    display: 'inline-flex', alignItems: 'center', gap: 6
                  }}
                  onMouseEnter={e => { if (!isCreating) e.currentTarget.style.opacity = '0.9'; }}
                  onMouseLeave={e => { if (!isCreating) e.currentTarget.style.opacity = '1'; }}
                >
                  {isCreating && <ReloadOutlined spin />}
                  {isCreating ? '正在创建...' : '创建首个项目'}
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              // 主项目网格 (Grid View)
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* 置顶项目 */}
                {!initializing && pinnedProjects.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
                      fontSize: 12.5, fontWeight: 600, color: themeMode === 'light' ? '#71717a' : '#a1a1aa'
                    }}>
                      <ArrowUpOutlined style={{ fontSize: 12 }} />
                      <span>{t('playground:pinned_projects', '置顶项目')}</span>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                      gap: 12
                    }}>
                      {pinnedProjects.map(project => renderGridItem(project))}
                    </div>
                  </div>
                )}

                {pinnedProjects.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: themeMode === 'light' ? '#71717a' : '#a1a1aa', marginTop: 12 }}>
                    <FolderOutlined style={{ fontSize: 12 }} />
                    <span>{t('playground:all_projects', '全部项目')}</span>
                  </div>
                )}

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                  gap: 12
                }}>
                  {/* 1. "Create new project" 卡片 */}
                  {!searchKeyword && (
                    <div
                      onClick={() => handleCreateProject()}
                      style={{
                        borderRadius: 8,
                        height: 198,
                        background: themeMode === 'light' ? '#f4f4f5' : '#141416',
                        border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        cursor: isCreating ? 'not-allowed' : 'pointer',
                        transition: 'all 0.25s ease',
                        opacity: isCreating ? 0.6 : 1,
                      }}
                      onMouseEnter={e => {
                        if (!isCreating) {
                          e.currentTarget.style.borderColor = themeMode === 'light' ? '#a1a1aa' : '#3f3f46';
                          e.currentTarget.style.background = themeMode === 'light' ? '#e4e4e7' : '#1b1b1e';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isCreating) {
                          e.currentTarget.style.borderColor = themeMode === 'light' ? '#e4e4e7' : '#27272a';
                          e.currentTarget.style.background = themeMode === 'light' ? '#f4f4f5' : '#141416';
                        }
                      }}
                    >
                      {isCreating ? (
                        <ReloadOutlined spin style={{ fontSize: 20, color: themeMode === 'light' ? '#71717a' : '#a1a1aa', marginBottom: 8 }} />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: 18,
                          background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginBottom: 8
                        }}>
                          <PlusOutlined style={{ fontSize: 16, color: '#09090b', fontWeight: 'bold' }} />
                        </div>
                      )}
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: themeMode === 'light' ? '#71717a' : '#a1a1aa'
                      }}>
                        {isCreating ? '正在创建...' : (i18n.language === 'zh' ? '创建新项目' : 'Create new project')}
                      </span>
                    </div>
                  )}

                  {/* 2. 正常项目列表 */}
                  {unpinnedProjects.map(project => renderGridItem(project))}
                </div>
              </div>
            ) : (
              // 主项目列表 (List View)
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 0, width: '100%'
              }}>
                {pinnedProjects.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: themeMode === 'light' ? '#71717a' : '#a1a1aa' }}>
                      <ArrowUpOutlined style={{ fontSize: 12 }} />
                      <span>{t('playground:pinned_projects', '置顶项目')}</span>
                    </div>
                    {/* Pinned table header */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(280px, 3fr) 2fr 2fr 80px',
                      padding: '6px 12px',
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
                      borderBottom: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
                      marginBottom: 4
                    }}>
                      <div>{i18n.language === 'zh' ? '名称' : 'Name'}</div>
                      <div>{i18n.language === 'zh' ? '创建者' : 'Created By'}</div>
                      <div>{i18n.language === 'zh' ? '创建时间' : 'Created At'}</div>
                      <div></div>
                    </div>
                    {pinnedProjects.map(project => renderListRow(project))}
                  </div>
                )}

                {pinnedProjects.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 12.5, fontWeight: 600, color: themeMode === 'light' ? '#71717a' : '#a1a1aa', marginTop: 12 }}>
                    <FolderOutlined style={{ fontSize: 12 }} />
                    <span>{t('playground:all_projects', '全部项目')}</span>
                  </div>
                )}

                {/* All table header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(280px, 3fr) 2fr 2fr 80px',
                  padding: '6px 12px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: themeMode === 'light' ? '#71717a' : '#a1a1aa',
                  borderBottom: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
                  marginBottom: 4
                }}>
                  <div>{i18n.language === 'zh' ? '名称' : 'Name'}</div>
                  <div>{i18n.language === 'zh' ? '创建者' : 'Created By'}</div>
                  <div>{i18n.language === 'zh' ? '创建时间' : 'Created At'}</div>
                  <div></div>
                </div>

                {/* 1. "Create new project" 列表项 */}
                {!searchKeyword && (
                  <div
                    onClick={() => handleCreateProject()}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(280px, 3fr) 2fr 2fr 80px',
                      alignItems: 'center',
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: themeMode === 'light' ? '#f4f4f5' : '#141416',
                      border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #27272a',
                      cursor: isCreating ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s',
                      opacity: isCreating ? 0.6 : 1,
                      marginBottom: 4
                    }}
                    onMouseEnter={e => {
                      if (!isCreating) {
                        e.currentTarget.style.background = themeMode === 'light' ? '#e4e4e7' : '#1b1b1e';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isCreating) {
                        e.currentTarget.style.background = themeMode === 'light' ? '#f4f4f5' : '#141416';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 54, height: 32, borderRadius: 4,
                        background: themeMode === 'light' ? '#ffffff' : '#27272a',
                        border: themeMode === 'light' ? '1px solid #e4e4e7' : '1px solid #444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        {isCreating ? <ReloadOutlined spin style={{ fontSize: 14 }} /> : <PlusOutlined style={{ fontSize: 14 }} />}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 13, color: themeMode === 'light' ? '#71717a' : '#a1a1aa' }}>
                        {isCreating ? '正在创建...' : (i18n.language === 'zh' ? '新建项目' : 'Create new project')}
                      </span>
                    </div>
                    <div style={{ color: '#71717a' }}>-</div>
                    <div style={{ color: '#71717a' }}>-</div>
                    <div></div>
                  </div>
                )}

                {/* 2. 正常项目列表行 */}
                {unpinnedProjects.map(project => renderListRow(project))}
              </div>
            )}
          </div>
        </div>

        <style>{`
          .pg-scroll::-webkit-scrollbar { width: 4px; }
          .pg-scroll::-webkit-scrollbar-track { background: transparent; }
          .pg-scroll::-webkit-scrollbar-thumb { background: ${themeMode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; border-radius: 4px; }
          .pg-scroll::-webkit-scrollbar-thumb:hover { background: ${themeMode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}; }
          .ant-input-textarea-focus { box-shadow: none !important; }

          /* Premium Dropdown Styles */
          .custom-premium-dropdown .ant-dropdown-menu {
            background: ${themeMode === 'light' ? '#ffffff' : '#141416'} !important;
            border: 1px solid ${themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'} !important;
            border-radius: 10px !important;
            padding: 6px !important;
            box-shadow: ${themeMode === 'light' ? '0 10px 25px -5px rgba(0, 0, 0, 0.1)' : '0 10px 25px -5px rgba(0, 0, 0, 0.5)'} !important;
          }
          .custom-premium-dropdown .ant-dropdown-menu-item {
            border-radius: 6px !important;
            padding: 8px 12px !important;
            color: ${themeMode === 'light' ? '#1f2937' : '#e4e4e7'} !important;
            font-size: 13px !important;
            font-weight: 500 !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            transition: all 0.15s ease !important;
          }
          .custom-premium-dropdown .ant-dropdown-menu-item:hover {
            background: ${themeMode === 'light' ? '#f4f4f5' : '#27272a'} !important;
            color: ${themeMode === 'light' ? '#09090b' : '#ffffff'} !important;
          }
          .custom-premium-dropdown .ant-dropdown-menu-item-danger {
            color: #ef4444 !important;
          }
          .custom-premium-dropdown .ant-dropdown-menu-item-danger:hover {
            background: ${themeMode === 'light' ? '#fef2f2' : 'rgba(239, 68, 68, 0.15)'} !important;
            color: #ef4444 !important;
          }
        `}</style>
      </div>
    </ConfigProvider>
  );
};

export default PlaygroundHome;
