import React, { useState, useEffect, useMemo } from 'react';
import { getAnnouncementLabel } from '../../../utils/announcement';
import {
  parseNotificationPreferences,
  shouldShowWebNotifications,
  maybeShowBrowserPush,
} from '../../../utils/notificationPrefs';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Popover, List, Badge, message, Spin, Empty, Dropdown, Button, Space, Tooltip, Drawer
} from 'antd';
import {
  Sidebar as SidebarIcon, Sun, Moon, Globe, Bell, Folder, FolderOpen,
  FileText, ChevronRight, Search, ArrowLeft, Copy, Check, ExternalLink,
  Terminal, Rocket, BookOpen, Settings, Code, Sparkles, AlertTriangle,
  XCircle, CheckCircle, ChevronDown, Compass, FileCode, CheckCircle2,
  GalleryVerticalEnd, ClipboardList, Palette
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { RocketOutlined, CompassOutlined } from '@ant-design/icons';
import 'highlight.js/styles/github-dark.css';

import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';
import useSettingsStore from '../../../store/settings';
import useAuthStore from '../../../store/auth';
import UserAvatarMenu from '../../../components/UserAvatarMenu';

interface Announcement {
  id: number;
  title: string;
  content: string;
  is_pinned: number;
  created_at: string;
}

interface DocTreeNode {
  id: number;
  parent_id: number | null;
  title: string;
  is_dir: boolean;
  sort_order: number;
  is_active: boolean;
  slug?: string;
  children: DocTreeNode[];
}

// ----------------------------------------------------
// 辅助子组件：复制按钮代码块
// ----------------------------------------------------
const CodeBlock: React.FC<{ language: string; value: string; children: React.ReactNode }> = ({ language, value, children }) => {
  const { t: docsT } = useTranslation('docs_api');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      message.error(docsT('msg_copy_failed'));
    }
  };

  return (
    <div className="relative border border-border rounded-lg overflow-hidden my-6 bg-[#09090b] text-[#f4f4f5] dark:bg-zinc-900/30">
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-border bg-zinc-50 dark:bg-zinc-900/20 text-[10px] font-mono text-zinc-500 dark:text-zinc-400 select-none">
        <span className="uppercase">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-zinc-950 dark:hover:text-zinc-50 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <CheckCircle className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500">{docsT('copied')}</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>{docsT('copy')}</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 m-0 overflow-x-auto text-xs leading-relaxed font-mono bg-transparent! border-none!">
        <code className={`language-${language} hljs bg-transparent! border-none! p-0! text-[#f4f4f5]!`} style={{ color: '#f4f4f5' }}>{children}</code>
      </pre>
    </div>
  );
};

// ----------------------------------------------------
// 辅助子组件：自定义标签组件 (Tabs)
// ----------------------------------------------------
const TabsComponent: React.FC<{
  items: { title: string; content: string }[];
  markdownComponents: any;
}> = ({ items, markdownComponents }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  if (items.length === 0) return null;

  return (
    <div className="border border-border rounded-lg overflow-hidden my-6 bg-card/30">
      <div className="flex border-b border-border bg-zinc-50/50 dark:bg-zinc-900/20 px-2 gap-1">
        {items.map((item, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIdx(idx)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeIdx === idx
                ? 'border-zinc-900 dark:border-zinc-100 text-zinc-950 dark:text-zinc-50'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {item.title}
          </button>
        ))}
      </div>
      <div className="p-5">
        <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {items[activeIdx]?.content || ''}
        </ReactMarkdown>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// 辅助函数：解析多块自定义容器类型 (Cards, Steps, Tabs)
// ----------------------------------------------------
const parseMarkdownBlocks = (text: string) => {
  const sections: { type: string; content: string }[] = [];
  const lines = text.split('\n');
  let currentType = 'markdown';
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith(':::')) {
      if (currentContent.length > 0) {
        sections.push({ type: currentType, content: currentContent.join('\n') });
        currentContent = [];
      }

      const typeMatch = line.match(/^:::\s*(\w+)/);
      if (typeMatch && currentType === 'markdown') {
        currentType = typeMatch[1];
      } else {
        currentType = 'markdown';
      }
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    sections.push({ type: currentType, content: currentContent.join('\n') });
  }

  return sections;
};

// 解析 Cards 内容块中的卡片
const parseCards = (content: string) => {
  const items: { title: string; desc: string; href: string; icon: string }[] = [];
  const cardBlocks = content.split('###').slice(1);

  for (const block of cardBlocks) {
    const lines = block.split('\n');
    const titleLine = lines[0].trim();
    let desc = '';
    let href = '';
    let icon = '';

    const linkMatch = block.match(/\[.*?\]\((.*?)\)/);
    if (linkMatch) {
      href = linkMatch[1];
    }

    const cleanBlock = block.replace(/\[.*?\]\(.*?\)/g, '');
    const descLines = cleanBlock.split('\n').slice(1).map(l => l.trim()).filter(l => l.length > 0);
    desc = descLines.join(' ');

    const iconMatch = titleLine.match(/\{icon:\s*(\w+)\}/);
    let title = titleLine;
    if (iconMatch) {
      icon = iconMatch[1];
      title = titleLine.replace(/\{icon:\s*(\w+)\}/, '').trim();
    }

    items.push({ title, desc, href, icon });
  }

  return items;
};

// 解析 Tabs 中的子选项卡
const parseTabs = (content: string) => {
  const tabs: { title: string; content: string }[] = [];
  const tabBlocks = content.split('===').slice(1);

  for (const block of tabBlocks) {
    const lines = block.split('\n');
    const title = lines[0].trim();
    const tabContent = lines.slice(1).join('\n').trim();
    tabs.push({ title, content: tabContent });
  }

  return tabs;
};

const renderCardIcon = (iconName: string) => {
  const name = iconName.toLowerCase();
  if (name === 'rocket' || name === 'quickstart') return <Rocket className="w-4 h-4 text-blue-500" />;
  if (name === 'api' || name === 'code') return <Code className="w-4 h-4 text-purple-500" />;
  if (name === 'settings' || name === 'config') return <Settings className="w-4 h-4 text-zinc-500" />;
  if (name === 'book' || name === 'guide') return <BookOpen className="w-4 h-4 text-emerald-500" />;
  if (name === 'terminal' || name === 'cli') return <Terminal className="w-4 h-4 text-amber-500" />;
  return <FileText className="w-4 h-4 text-zinc-400" />;
};

// ----------------------------------------------------
// 主组件 RelayAPI
// ----------------------------------------------------
const RelayAPI: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { themeMode, toggleTheme } = useThemeStore();
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const { t: _t, i18n } = useTranslation();
  const { t: docsT } = useTranslation('docs_api');

  const [collapsed, setCollapsed] = useState(false);
  const [openOutlineDrawer, setOpenOutlineDrawer] = useState(false);
  const [announcementsDrawerVisible, setAnnouncementsDrawerVisible] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // 动态文档状态
  const [treeData, setTreeData] = useState<DocTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [pluginEnabled, setPluginEnabled] = useState(true);
  const [docDetail, setDocDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMenuKeys, setExpandedMenuKeys] = useState<string[]>([]);
  const [activeAnchor, setActiveAnchor] = useState<string>('');

  // 查找某个文档 ID 的父级 slug
  const findParentSlug = (nodes: DocTreeNode[], targetId: number): string | null => {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        if (node.children.some(child => child.id === targetId)) {
          return node.slug || null;
        }
        const found = findParentSlug(node.children, targetId);
        if (found !== null) {
          return found;
        }
      }
    }
    return null;
  };

  // 转换数据库 ID 为 URL 别名 (例如 15 -> doc0015)
  const idToSlug = (docId: number): string => {
    return `doc${String(docId).padStart(4, '0')}`;
  };

  // 从 URL 别名或原始数字中提取数据库 ID
  const slugToId = (slug?: string): number | null => {
    if (!slug) return null;
    const match = slug.match(/^doc(\d{4,})$/);
    if (match) {
      return parseInt(match[1], 10);
    }
    const num = parseInt(slug, 10);
    return isNaN(num) ? null : num;
  };

  const selectedDocId = useMemo(() => {
    return slugToId(id);
  }, [id]);

  const basePath = useMemo(() => {
    const path = window.location.pathname;
    if (path.includes('/docs')) {
      const idx = path.indexOf('/docs');
      return path.substring(0, idx) + '/docs';
    }
    return '/docs';
  }, []);

  const isEn = i18n.language === 'en';
  const enableThemeToggle = settings?.site?.enable_theme_toggle !== false;
  const enableMultilingual = settings?.site?.enable_multilingual !== false;
  const siteName = settings?.site?.name || 'TokensByte';
  const siteLogo = settings?.site?.logo || '';
  const siteTitle = settings?.site?.title || '';
  const agreement = settings?.agreement || null;

  const isLight = themeMode === 'light';
  const c = {
    cardBorder: isLight ? '#eaeaea' : '#222225',
    text1: isLight ? '#1f2937' : 'rgba(255,255,255,0.95)',
    text2: isLight ? '#4b5563' : 'rgba(255,255,255,0.75)',
    text3: isLight ? '#6b7280' : 'rgba(255,255,255,0.5)',
  };

  useEffect(() => {
    document.title = `${docsT('client_doc_title')} - ${siteTitle}`;
  }, [isEn, siteTitle]);

  // 拉取公告
  useEffect(() => {
    const fetchAnnouncements = async () => {
      const prefs = parseNotificationPreferences(
        user?.notification_preferences,
        settings?.notification?.low_balance_threshold ?? 100.0,
      );
      if (!shouldShowWebNotifications(prefs, settings?.notification)) {
        setAnnouncements([]);
        return;
      }
      try {
        const response = await (request.get('/announcements/public') as any);
        if (response.data) {
          setAnnouncements(response.data);
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
    fetchAnnouncements();
  }, [user?.notification_preferences, settings?.notification?.low_balance_threshold, i18n.language]);

  const cleanTitle = (title: string): string => {
    return title ? title.replace(/^\d+[\s.\-_]+/, '').trim() : '';
  };

  const findFirstArticle = (nodes: DocTreeNode[]): DocTreeNode | null => {
    for (const node of nodes) {
      if (!node.is_dir) {
        return node;
      }
      if (node.children && node.children.length > 0) {
        const found = findFirstArticle(node.children);
        if (found) return found;
      }
    }
    return null;
  };

  const cleanTreeTitles = (nodes: DocTreeNode[]): DocTreeNode[] => {
    return nodes.map(node => ({
      ...node,
      title: cleanTitle(node.title),
      children: node.children ? cleanTreeTitles(node.children) : []
    }));
  };

  // 拉取文档树
  useEffect(() => {
    const fetchDocTree = async () => {
      try {
        setLoading(true);
        const res = await (request.get(`/plugins/docs-api/public/tree?lang=${i18n.language}`) as any);
        if (res.tree) {
          const cleanedTree = cleanTreeTitles(res.tree);
          setTreeData(cleanedTree);
          // 默认展开一级目录
          setExpandedMenuKeys(cleanedTree.filter((n: any) => n.is_dir).map((n: any) => `dir-${n.id}`));
        }
      } catch (error: any) {
        setPluginEnabled(false);
      } finally {
        setLoading(false);
      }
    };
    fetchDocTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath, i18n.language]);

  // 如果 URL 里没有带 ID，且 treeData 已加载，则自动跳转到第一篇文章
  useEffect(() => {
    if (!id && treeData.length > 0) {
      const firstArticle = findFirstArticle(treeData);
      if (firstArticle) {
        const parentSlug = findParentSlug(treeData, firstArticle.id);
        const path = parentSlug 
          ? `${basePath}/${parentSlug}/${idToSlug(firstArticle.id)}`
          : `${basePath}/${idToSlug(firstArticle.id)}`;
        navigate(path, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, treeData, basePath, navigate]);

  // 监听选中的文档 ID 并获取内容
  useEffect(() => {
    if (selectedDocId) {
      fetchDocContent(selectedDocId);
    }
  }, [selectedDocId, i18n.language]);

  // 查找选中文档的所有级目录 ID
  const findParentDirIds = (nodes: DocTreeNode[], targetId: number, currentParents: string[] = []): string[] => {
    for (const node of nodes) {
      if (node.id === targetId) {
        return currentParents;
      }
      if (node.is_dir && node.children) {
        const found = findParentDirIds(node.children, targetId, [...currentParents, `dir-${node.id}`]);
        if (found.length > 0) {
          return found;
        }
      }
    }
    return [];
  };

  // 当选择文档改变时，自动展开其父级目录
  useEffect(() => {
    if (selectedDocId && treeData.length > 0) {
      const parentIds = findParentDirIds(treeData, selectedDocId);
      if (parentIds.length > 0) {
        setExpandedMenuKeys(prev => {
          const unique = new Set([...prev, ...parentIds]);
          return Array.from(unique);
        });
      }
    }
  }, [selectedDocId, treeData]);

  const fetchDocContent = async (id: number) => {
    try {
      setDetailLoading(true);
      const res = await (request.get(`/plugins/docs-api/public/docs/${id}?lang=${i18n.language}`) as any);
      if (res.doc) {
        setDocDetail({
          ...res.doc,
          title: cleanTitle(res.doc.title)
        });
      }
    } catch (error) {
      message.error(docsT('client_msg_fetch_content_failed'));
    } finally {
      setDetailLoading(false);
    }
  };

  const processedContent = useMemo(() => {
    if (!docDetail?.content) return '';
    let content = docDetail.content;
    const domain = window.location.host;
    const protocol = window.location.protocol;
    const baseUrl = `${protocol}//${domain}`;

    content = content.replace(/\{\{domain\}\}/g, domain);
    content = content.replace(/\{\{baseUrl\}\}/g, baseUrl);

    return content;
  }, [docDetail]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem('i18nextLng', lng);
  };

  const langNameMap: Record<string, string> = {
    zh: '简体中文', en: 'English', ja: '日本語', ko: '한국어', vi: 'Tiếng Việt',
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
      onClick: () => changeLanguage(lng),
    }));



  const announcementContent = (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${c.cardBorder}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{ color: c.text1, fontSize: 16, fontWeight: 500 }}>{_t('header.notifications', '通知')}</span>
      </div>
      <div style={{ maxHeight: 480, overflowY: 'auto', padding: announcements.length > 0 ? '16px' : '60px 20px' }}>
        {announcements.length > 0 ? (
          <List
            itemLayout="vertical"
            dataSource={announcements}
            split={false}
            renderItem={(item) => (
              <div style={{ background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {item.is_pinned === 1 && (
                      <div style={{
                        background: isLight ? 'rgba(24, 24, 27, 0.06)' : 'rgba(250, 250, 250, 0.1)',
                        color: isLight ? '#18181b' : '#fafafa',
                        fontSize: 12,
                        padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0
                      }}>
                        {_t('common.pinned', '置顶')}
                      </div>
                    )}
                    <div style={{ color: c.text1, fontSize: 15, fontWeight: 500 }}>{getAnnouncementLabel(item.title)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: c.text3, fontSize: 12 }}>
                    <Terminal className="w-3.5 h-3.5" />
                    {new Date(item.created_at).toLocaleString(i18n.language === 'en' ? 'en-US' : (i18n.language === 'vi' ? 'vi-VN' : 'zh-CN'), {
                      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
                <div dangerouslySetInnerHTML={{ __html: getAnnouncementLabel(item.content) }} style={{ color: c.text2, fontSize: 13, lineHeight: 1.6 }} />
              </div>
            )}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Bell className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mb-4" />
            <div style={{ color: c.text1, fontSize: 15, fontWeight: 500, marginBottom: 8 }}>{_t('header.no_notifications', '没有通知')}</div>
          </div>
        )}
      </div>
    </div>
  );

  const [openSearch, setOpenSearch] = useState(false);
  const [searchFocusIndex, setSearchFocusIndex] = useState(0);

  const filteredTree = useMemo(() => {
    if (!searchQuery) return treeData;
    const filter = (nodes: DocTreeNode[]): DocTreeNode[] => {
      return nodes
        .map(node => {
          if (node.is_dir) {
            const filteredChildren = node.children ? filter(node.children) : [];
            if (filteredChildren.length > 0 || node.title.toLowerCase().includes(searchQuery.toLowerCase())) {
              return { ...node, children: filteredChildren };
            }
          } else {
            if (node.title.toLowerCase().includes(searchQuery.toLowerCase())) {
              return node;
            }
          }
          return null;
        })
        .filter((n): n is DocTreeNode => n !== null);
    };
    return filter(treeData);
  }, [treeData, searchQuery]);

  const flatList = useMemo(() => {
    const list: { id: number; title: string; is_dir: boolean }[] = [];
    const traverse = (nodes: DocTreeNode[]) => {
      nodes.forEach(n => {
        if (searchQuery) {
          if (n.title.toLowerCase().includes(searchQuery.toLowerCase())) {
            list.push({ id: n.id, title: n.title, is_dir: n.is_dir });
          }
        } else {
          list.push({ id: n.id, title: n.title, is_dir: n.is_dir });
        }
        if (n.children) traverse(n.children);
      });
    };
    traverse(treeData);
    return list.slice(0, 10);
  }, [treeData, searchQuery]);

  const breadcrumbs = useMemo(() => {
    if (!selectedDocId || treeData.length === 0) return [];
    const path: string[] = [];
    const findPath = (nodes: DocTreeNode[], targetId: number, currentPath: string[]): boolean => {
      for (const node of nodes) {
        if (node.id === targetId) {
          path.push(...currentPath, node.title);
          return true;
        }
        if (node.children && node.children.length > 0) {
          if (findPath(node.children, targetId, [...currentPath, node.title])) {
            return true;
          }
        }
      }
      return false;
    };
    findPath(treeData, selectedDocId, []);
    return path;
  }, [treeData, selectedDocId]);

  interface TocItem {
    text: string;
    level: number;
    anchor: string;
  }
  const tocList = useMemo<TocItem[]>(() => {
    if (!processedContent) return [];
    const lines = processedContent.split('\n');
    const list: TocItem[] = [];
    lines.forEach((line: string) => {
      const match = line.match(/^(##|###)\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const anchor = text.toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
          .replace(/\s+/g, '-');
        list.push({ text, level, anchor });
      }
    });
    return list;
  }, [processedContent]);

  // Scroll Spy Effect: 监听内容滚动，高亮右侧目录大纲
  useEffect(() => {
    if (tocList.length === 0) return;

    const handleScroll = () => {
      const headingElements = tocList
        .map(item => document.getElementById(item.anchor))
        .filter(Boolean) as HTMLElement[];

      let currentActive = '';
      for (const el of headingElements) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 100) {
          currentActive = el.id;
        }
      }

      setActiveAnchor(currentActive || (tocList[0] ? tocList[0].anchor : ''));
    };

    const mainContent = document.getElementById('docs-main-content');
    if (mainContent) {
      mainContent.addEventListener('scroll', handleScroll);
      handleScroll();
    }

    return () => {
      if (mainContent) {
        mainContent.removeEventListener('scroll', handleScroll);
      }
    };
  }, [tocList]);

  // 监听全局 Cmd+K 弹窗事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchQuery('');
        setOpenSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 监听 Command Palette 键盘导航事件
  useEffect(() => {
    if (!openSearch) return;
    const handleNav = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchFocusIndex(prev => (prev + 1) % Math.max(1, flatList.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchFocusIndex(prev => (prev - 1 + flatList.length) % Math.max(1, flatList.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatList[searchFocusIndex]) {
          const doc = flatList[searchFocusIndex];
          const parentSlug = findParentSlug(treeData, doc.id);
          const path = parentSlug 
            ? `${basePath}/${parentSlug}/${idToSlug(doc.id)}`
            : `${basePath}/${idToSlug(doc.id)}`;
          navigate(path);
          setOpenSearch(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpenSearch(false);
      }
    };
    window.addEventListener('keydown', handleNav);
    return () => window.removeEventListener('keydown', handleNav);
  }, [openSearch, flatList, searchFocusIndex]);

  useEffect(() => {
    setSearchFocusIndex(0);
  }, [searchQuery]);

  const handleTocClick = (anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getSidebarIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('example') || t.includes('示例')) return <Sparkles className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
    if (t.includes('form') || t.includes('表单')) return <ClipboardList className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
    if (t.includes('query') || t.includes('api') || t.includes('code') || t.includes('开发') || t.includes('代码') || t.includes('relay')) return <Code className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
    if (t.includes('icon') || t.includes('图标') || t.includes('paint') || t.includes('color') || t.includes('style') || t.includes('设计') || t.includes('样式')) return <Palette className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
    if (t.includes('setting') || t.includes('config') || t.includes('配置') || t.includes('设置')) return <Settings className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
    if (t.includes('guide') || t.includes('doc') || t.includes('指南') || t.includes('文档') || t.includes('入门')) return <BookOpen className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
    if (t.includes('quick') || t.includes('start') || t.includes('快速')) return <Rocket className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
    return <Folder className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />;
  };

  // 递归渲染自定义树状目录大纲（Fumadocs 极简暗黑科技风）
  const renderSidebarTree = (nodes: DocTreeNode[], level: number = 0) => {
    return nodes.map((node) => {
      const isDir = node.is_dir;
      const isSelected = selectedDocId === node.id;
      const isOpen = expandedMenuKeys.includes(`dir-${node.id}`);

      // 仅首层（level === 0）展示左侧图标
      const showIcon = level === 0;

      if (isDir) {
        return (
          <div key={`dir-${node.id}`} className="flex flex-col mb-0.5 select-none">
            <button
              onClick={() => {
                if (expandedMenuKeys.includes(`dir-${node.id}`)) {
                  setExpandedMenuKeys(expandedMenuKeys.filter(k => k !== `dir-${node.id}`));
                } else {
                  setExpandedMenuKeys([...expandedMenuKeys, `dir-${node.id}`]);
                }
              }}
              style={{ paddingLeft: showIcon ? '4px' : '10px' }}
              className="group flex items-center justify-between w-full h-8 pl-1 pr-2 text-left text-[14px] font-medium rounded-md transition-colors text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/40 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                {showIcon && getSidebarIcon(node.title)}
                <span className="truncate">{node.title}</span>
              </div>
              <ChevronRight
                className={`w-3.5 h-3.5 text-zinc-500 dark:text-white transition-transform duration-300 ease-in-out ${
                  isOpen ? 'rotate-90' : ''
                }`}
              />
            </button>
            {node.children && node.children.length > 0 && (
              <div className={`grid transition-all duration-300 ease-in-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100 mt-0.5' : 'grid-rows-[0fr] opacity-0 overflow-hidden'
              }`}>
                <div className="overflow-hidden flex flex-col ml-2.5 pl-1.5 border-l border-zinc-200/60 dark:border-zinc-800/80">
                  {renderSidebarTree(node.children, level + 1)}
                </div>
              </div>
            )}
          </div>
        );
      } else {
        return (
          <button
            key={node.id}
            onClick={() => {
              const parentSlug = findParentSlug(treeData, node.id);
              const path = parentSlug 
                ? `${basePath}/${parentSlug}/${idToSlug(node.id)}`
                : `${basePath}/${idToSlug(node.id)}`;
              navigate(path);
            }}
            style={{ paddingLeft: showIcon ? '4px' : '10px' }}
            className={`group flex items-center gap-2 w-full h-7 text-left text-[13px] rounded-md transition-all cursor-pointer mb-0.5 select-none pl-1 pr-2 ${
              isSelected
                ? 'bg-zinc-200/60 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium shadow-2xs'
                : 'text-zinc-500 dark:text-zinc-200 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/30 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            {showIcon && getSidebarIcon(node.title)}
            <span className="truncate">{node.title}</span>
          </button>
        );
      }
    });
  };

  const renderDocBody = () => {
    if (detailLoading) {
      return (
        <div className="flex items-center justify-center py-32">
          <Spin size="large" />
        </div>
      );
    }
    if (!docDetail) {
      return (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-400">
          <Empty description={docsT('client_empty_desc')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      );
    }

    const markdownComponents = {
      h1: ({ children, ...props }: any) => {
        return (
          <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-6 mt-2 gap-4">
            <h1 {...props}>{children}</h1>
            {pluginEnabled && tocList.length > 0 && (
              <Tooltip title={docsT('client_toc_title')} placement="bottom">
                <Button
                  type="text"
                  shape="circle"
                  icon={<GalleryVerticalEnd className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />}
                  onClick={() => setOpenOutlineDrawer(true)}
                  className="xl:!hidden flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-900/60 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer flex-shrink-0"
                  style={{ width: 32, height: 32 }}
                />
              </Tooltip>
            )}
          </div>
        );
      },
      h2: ({ children, ...props }: any) => {
        const text = String(children);
        const anchor = text.toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
          .replace(/\s+/g, '-');
        return <h2 id={anchor} {...props}>{children}</h2>;
      },
      h3: ({ children, ...props }: any) => {
        const text = String(children);
        const anchor = text.toLowerCase()
          .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
          .replace(/\s+/g, '-');
        return <h3 id={anchor} {...props}>{children}</h3>;
      },
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        const rawValue = String(children).replace(/\n$/, '');
        return !inline && match ? (
          <CodeBlock language={match[1]} value={rawValue} {...props}>
            {children}
          </CodeBlock>
        ) : (
          <code className={className} {...props}>
            {children}
          </code>
        );
      },
      blockquote: ({ children }: any) => {
        let textContent = '';
        const extractText = (node: any): string => {
          if (typeof node === 'string') return node;
          if (Array.isArray(node)) return node.map(extractText).join('');
          if (node?.props?.children) return extractText(node.props.children);
          return '';
        };
        textContent = extractText(children).trim();

        let type = 'info';
        let cleanText = textContent;
        if (textContent.startsWith('[!NOTE]') || textContent.startsWith('[!INFO]') || textContent.startsWith('[!TIP]')) {
          type = 'info';
          cleanText = textContent.replace(/^\[!(NOTE|INFO|TIP)\]\s*/i, '');
        } else if (textContent.startsWith('[!WARNING]') || textContent.startsWith('[!IMPORTANT]')) {
          type = 'warning';
          cleanText = textContent.replace(/^\[!(WARNING|IMPORTANT)\]\s*/i, '');
        } else if (textContent.startsWith('[!CAUTION]') || textContent.startsWith('[!DANGER]') || textContent.startsWith('[!FAILURE]')) {
          type = 'danger';
          cleanText = textContent.replace(/^\[!(CAUTION|DANGER|FAILURE)\]\s*/i, '');
        } else if (textContent.startsWith('[!SUCCESS]')) {
          type = 'success';
          cleanText = textContent.replace(/^\[!SUCCESS\]\s*/i, '');
        } else {
          return (
            <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30 py-3 px-4 my-6 rounded-r-md font-sans italic text-zinc-600 dark:text-zinc-400">
              {children}
            </blockquote>
          );
        }

        const colors: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode; title: string }> = {
          info: {
            bg: 'bg-blue-500/5 dark:bg-blue-500/5',
            border: 'border-blue-500/20 dark:border-blue-400/20',
            text: 'text-blue-600 dark:text-blue-400',
            title: 'NOTE',
            icon: <Sparkles className="w-4 h-4" />
          },
          warning: {
            bg: 'bg-amber-500/5 dark:bg-amber-500/5',
            border: 'border-amber-500/20 dark:border-amber-400/20',
            text: 'text-amber-600 dark:text-amber-400',
            title: 'WARNING',
            icon: <AlertTriangle className="w-4 h-4" />
          },
          danger: {
            bg: 'bg-red-500/5 dark:bg-red-500/5',
            border: 'border-red-500/20 dark:border-red-400/20',
            text: 'text-red-600 dark:text-red-400',
            title: 'DANGER',
            icon: <XCircle className="w-4 h-4" />
          },
          success: {
            bg: 'bg-emerald-500/5 dark:bg-emerald-500/5',
            border: 'border-emerald-500/20 dark:border-emerald-400/20',
            text: 'text-emerald-600 dark:text-emerald-400',
            title: 'SUCCESS',
            icon: <CheckCircle2 className="w-4 h-4" />
          }
        };

        const cur = colors[type];

        return (
          <div className={`my-6 p-4 rounded-lg border ${cur.bg} ${cur.border} flex gap-3 text-sm`}>
            <div className={`flex-shrink-0 ${cur.text} mt-0.5`}>{cur.icon}</div>
            <div className="flex-1">
              <div className={`font-bold ${cur.text} mb-1 tracking-wider text-[10px]`}>{cur.title}</div>
              <div className="text-zinc-700 dark:text-zinc-300 leading-relaxed text-xs">{cleanText}</div>
            </div>
          </div>
        );
      }
    };

    const blocks = parseMarkdownBlocks(processedContent);

    return (
      <div className="docs-content-article space-y-6">
        {blocks.map((block, idx) => {
          if (block.type === 'markdown') {
            return (
              <ReactMarkdown key={idx} components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {block.content}
              </ReactMarkdown>
            );
          }
          if (block.type === 'steps') {
            return (
              <div key={idx} className="docs-steps-container">
                <ReactMarkdown key={idx} components={markdownComponents} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {block.content}
                </ReactMarkdown>
              </div>
            );
          }
          if (block.type === 'cards') {
            const cardItems = parseCards(block.content);
            return (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
                {cardItems.map((card, cidx) => (
                  <a
                    key={cidx}
                    href={card.href}
                    target={card.href.startsWith('http') ? '_blank' : '_self'}
                    rel="noopener noreferrer"
                    className="group p-5 rounded-lg border border-border bg-card/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-all duration-200 hover:border-zinc-400 dark:hover:border-zinc-700 flex flex-col gap-2 cursor-pointer no-underline"
                  >
                    <div className="flex items-center gap-2">
                      {renderCardIcon(card.icon)}
                      <span className="font-semibold text-xs text-foreground group-hover:text-primary transition-colors">
                        {card.title}
                      </span>
                    </div>
                    {card.desc && (
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {card.desc}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            );
          }
          if (block.type === 'tabs') {
            const tabItems = parseTabs(block.content);
            return (
              <TabsComponent
                key={idx}
                items={tabItems}
                markdownComponents={markdownComponents}
              />
            );
          }
          return null;
        })}
      </div>
    );
  };

  const renderOutline = (isMobile: boolean = false) => {
    // 1. 查找当前选中项的索引
    const activeIdx = tocList.findIndex(item => item.anchor === activeAnchor);
    
    // 2. 定义高精拼接路径生成函数
    const getPathD = (prev: number | null, curr: number, isLast: boolean) => {
      const xPrev = prev === 3 ? 20 : 8;
      const xCurr = curr === 3 ? 20 : 8;
      const yEnd = isLast ? 16 : 32;

      if (prev === null) {
        return `M${xCurr} 4 L${xCurr} ${yEnd}`;
      }
      if (xPrev === xCurr) {
        return `M${xCurr} 0 L${xCurr} ${yEnd}`;
      }
      if (xPrev === 8 && xCurr === 20) {
        return `M8 0 C8 12, 20 8, 20 20 L20 ${yEnd}`;
      }
      if (xPrev === 20 && xCurr === 8) {
        return `M20 0 C20 12, 8 8, 8 20 L8 ${yEnd}`;
      }
      return `M${xCurr} 0 L${xCurr} ${yEnd}`;
    };

    // 3. 计算流动高亮白线路径生成函数 (在当前聚焦项 y=16 处截断)
    const getActivePathD = (prev: number | null, curr: number, isLast: boolean, isTarget: boolean, idx: number) => {
      const xPrev = prev === 3 ? 20 : 8;
      const xCurr = curr === 3 ? 20 : 8;
      const yEnd = isTarget ? 16 : (isLast ? 16 : 32);

      // 如果在当前聚焦项之后，根本不画白线
      if (activeIdx === -1 || idx > activeIdx) {
        return "";
      }

      // 如果是第一个项目
      if (prev === null) {
        return `M${xCurr} 4 L${xCurr} ${yEnd}`;
      }
      // 同级
      if (xPrev === xCurr) {
        return `M${xCurr} 0 L${xCurr} ${yEnd}`;
      }
      // 一级到二级 (右移)
      if (xPrev === 8 && xCurr === 20) {
        return `M8 0 C8 12, 20 8, 20 16 L20 ${yEnd}`;
      }
      // 二级到一级 (左移)
      if (xPrev === 20 && xCurr === 8) {
        return `M20 0 C20 12, 8 8, 8 16 L8 ${yEnd}`;
      }
      return `M${xCurr} 0 L${xCurr} ${yEnd}`;
    };

    return tocList.map((item, idx) => {
      const isTarget = idx === activeIdx; // 当前聚焦的最终项
      const isActiveChain = activeIdx !== -1 && idx <= activeIdx; // 处于高亮白线流动的链路中
      
      const prevItem = idx > 0 ? tocList[idx - 1] : null;
      const prevLevel = prevItem ? prevItem.level : null;
      const currentLevel = item.level;
      const isLast = idx === tocList.length - 1;

      const pathD = getPathD(prevLevel, currentLevel, isLast);
      const activePathD = getActivePathD(prevLevel, currentLevel, isLast, isTarget, idx);

      // 完美跟随大纲轨线缩进：一级 padding 20px (线在 8px)，二级 padding 32px (线在 20px)
      const textPaddingLeft = currentLevel === 3 ? '32px' : '20px';

      return (
        <div 
          key={idx} 
          className="flex items-stretch h-8 group cursor-pointer relative"
          onClick={() => {
            handleTocClick(item.anchor);
            if (isMobile) {
              setOpenOutlineDrawer(false);
            }
          }}
        >
          {/* 左侧绝对定位的大纲指示线 */}
          <div className="absolute left-0 top-0 bottom-0 w-6 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 24 32" fill="none">
              {/* 底层深灰/低调背景线 */}
              <path d={pathD} stroke="currentColor" className="text-zinc-200 dark:text-zinc-900/60" strokeWidth="1.5" />
              {/* 顶层高亮白色/主色线 */}
              {isActiveChain && activePathD && (
                <path d={activePathD} stroke="currentColor" className="text-zinc-900 dark:text-zinc-100" strokeWidth="1.5" />
              )}
              {/* 当前激活聚焦项的指示小圆点 (位于文字中线 y=16) */}
              {isTarget && (
                <circle 
                  cx={currentLevel === 3 ? 20 : 8} 
                  cy={16} 
                  r="2.2" 
                  fill="currentColor" 
                  className="text-zinc-900 dark:text-zinc-100" 
                />
              )}
            </svg>
          </div>

          {/* 右侧大纲标题文本 */}
          <div 
            style={{ paddingLeft: textPaddingLeft }}
            className={`flex items-center text-xs truncate transition-colors leading-relaxed select-none ${
              isTarget
                ? 'text-zinc-900 dark:text-zinc-50 font-semibold'
                : isActiveChain
                  ? 'text-zinc-700 dark:text-zinc-300 font-medium'
                  : 'text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-600 dark:group-hover:text-zinc-300'
            }`}
          >
            {item.text}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground font-sans">
      <style>{`
        /* 极致的 Fumadocs 科技风 Markdown 文章渲染 */
        #docs-main-content {
          scroll-behavior: smooth;
        }
        .docs-content-article h1 {
          font-size: 2.2rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin-top: 0;
          margin-bottom: 0;
          padding-bottom: 0;
          border-bottom: none;
          color: var(--foreground);
        }
        .docs-content-article h2 {
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-top: 2.5rem;
          margin-bottom: 1rem;
          color: var(--foreground);
        }
        .docs-content-article h3 {
          font-size: 1.15rem;
          font-weight: 600;
          letter-spacing: -0.01em;
          margin-top: 1.8rem;
          margin-bottom: 0.75rem;
          color: var(--foreground);
        }
        .docs-content-article p {
          margin-top: 0;
          margin-bottom: 1.25rem;
          line-height: 1.7;
          color: var(--foreground);
          opacity: 0.85;
        }
        .docs-content-article :not(pre) > code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.85em;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid var(--border-custom);
          color: var(--foreground);
        }
        body[data-theme='dark'] .docs-content-article :not(pre) > code {
          background: rgba(255, 255, 255, 0.08);
        }
        .docs-content-article table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1.5rem;
          margin-bottom: 1.5rem;
          font-size: 13.5px;
        }
        .docs-content-article th {
          background: var(--muted);
          border: 1px solid var(--border-custom);
          padding: 8px 12px;
          font-weight: 600;
          text-align: left;
        }
        .docs-content-article td {
          border: 1px solid var(--border-custom);
          padding: 8px 12px;
        }
        .docs-content-article blockquote {
          border-left: 3px solid var(--primary);
          background: var(--muted);
          padding: 10px 16px;
          margin: 1.5rem 0;
          border-radius: 0 6px 6px 0;
        }
        .docs-content-article blockquote p {
          margin: 0;
          font-style: italic;
        }
        .docs-content-article a {
          color: #3b82f6;
          text-decoration: none;
        }
        .docs-content-article a:hover {
          text-decoration: underline;
        }
        .docs-content-article ul, .docs-content-article ol {
          margin-bottom: 16px;
          padding-left: 20px;
        }
        .docs-content-article li {
          margin-bottom: 6px;
          line-height: 1.6;
        }

        .docs-sidebar-scroll::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .docs-sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .docs-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.08);
          border-radius: 10px;
        }
        body[data-theme='dark'] .docs-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
        }
        .no-scrollbar {
          -ms-overflow-style: none !important;
          scrollbar-width: none !important;
        }

        /* Steps (步骤条) PURE CSS 样式 */
        .docs-steps-container {
          counter-reset: step-counter;
          border-left: 2px solid var(--border-custom);
          margin-left: 1rem;
          padding-left: 1.5rem;
          position: relative;
          margin-top: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .docs-steps-container h3 {
          counter-increment: step-counter;
          position: relative;
        }
        .docs-steps-container h3::before {
          content: counter(step-counter);
          position: absolute;
          left: -2.25rem;
          top: 0.15rem;
          width: 1.5rem;
          height: 1.5rem;
          background: var(--background);
          border: 2px solid var(--border-custom);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--foreground);
        }
        .docs-steps-container h2 {
          counter-increment: step-counter;
          position: relative;
        }
        .docs-steps-container h2::before {
          content: counter(step-counter);
          position: absolute;
          left: -2.25rem;
          top: 0.25rem;
          width: 1.5rem;
          height: 1.5rem;
          background: var(--background);
          border: 2px solid var(--border-custom);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--foreground);
        }
      `}</style>

      {/* 左侧侧边栏 */}
      <aside
        className={`flex-shrink-0 flex flex-col h-full bg-[#f8f9fa] dark:bg-[#141414] border-r border-border transition-all duration-300 ${
          collapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-[260px]'
        }`}
      >
        {/* Logo 与站点名 */}
        <div
          className="h-[56px] flex items-center px-4 border-b border-border cursor-pointer select-none gap-2"
          onClick={() => navigate('/dashboard')}
        >
          {siteLogo ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'flex-start' }}>
              <img src={siteLogo} alt="logo" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all' }}>
                {siteName}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'flex-start' }}>
              <Rocket className="w-5 h-5 text-zinc-900 dark:text-zinc-50 flex-shrink-0" />
              <div style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', margin: 0, fontSize: siteName.length > 12 ? 14 : siteName.length > 8 ? 16 : 18, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-all' }}>
                {siteName}
              </div>
            </div>
          )}
        </div>

        {/* 快捷搜索触发框 */}
        <div className="p-3 border-b border-border/40">
          <button
            onClick={() => {
              setSearchQuery('');
              setOpenSearch(true);
            }}
            className="flex items-center justify-between w-full h-8 px-3 text-xs text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/60 border border-border rounded-md hover:bg-zinc-100/50 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              <span>{docsT('search_placeholder')}</span>
            </span>
            <kbd className="hidden sm:inline-block font-mono bg-zinc-200/60 dark:bg-zinc-800/80 px-1.5 py-0.5 rounded border border-border scale-90 text-[10px]">⌘K</kbd>
          </button>
        </div>

        {/* 目录树大纲滚动区域 */}
        <div className="flex-1 overflow-y-auto p-2 docs-sidebar-scroll">
          {loading ? (
            <div className="flex items-center justify-center pt-10"><Spin size="small" /></div>
          ) : treeData.length === 0 ? (
            <Empty description="暂无文档" image={Empty.PRESENTED_IMAGE_SIMPLE} className="mt-8" />
          ) : (
            renderSidebarTree(filteredTree)
          )}
        </div>
      </aside>

      {/* 右侧主体布局 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {/* 顶栏 Header */}
        <header className="h-[56px] px-4 flex items-center justify-between bg-background/80 backdrop-blur-md border-b border-border z-10 select-none">
          <div className="flex items-center">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center w-8 h-8 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <SidebarIcon className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Space size="middle" align="center">
              <Tooltip title={_t('menu.model_marketplace', '模型广场')} placement="bottom">
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
                  <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{_t('menu.model_marketplace', '模型广场')}</span>
                </Button>
              </Tooltip>

              <Tooltip title={_t('menu.relay_api', 'API教程')} placement="bottom">
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
                  <span style={{ display: 'inline-block', transform: 'translateY(1.5px)' }}>{_t('menu.relay_api', 'API教程')}</span>
                </Button>
              </Tooltip>

              {enableThemeToggle && (
                <Tooltip title={themeMode === 'light' ? _t('header.switch_dark_mode', '切换暗色模式') : _t('header.switch_light_mode', '切换亮色模式')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
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
                <Tooltip title={_t('header.notifications', '通知')} placement="bottom" color={themeMode === 'light' ? '#fff' : '#2b2b2b'} overlayInnerStyle={{ color: themeMode === 'light' ? '#1f2937' : '#fff' }}>
                  <Badge count={announcements.length} overflowCount={99} offset={[-4, 4]} className="header-badge">
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
                    />
                  </Badge>
                </Tooltip>
              </Popover>

              <UserAvatarMenu isUserEnd={true} agreement={agreement} />
            </Space>
          </div>
        </header>

        {/* 主体自适应布局 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 中间主要文章展示区 */}
          <main id="docs-main-content" className="flex-1 overflow-y-auto p-6 md:p-8 xl:pr-20 xl:pl-10 no-scrollbar">
            <div className="max-w-[760px] mx-auto pb-20">
              {pluginEnabled ? (
                <>
                  {/* 面包屑导航 Breadcrumbs */}
                  {breadcrumbs.length > 0 && (
                    <nav className="flex items-center gap-1 text-[11px] text-zinc-400 mb-6 select-none">
                      {breadcrumbs.map((crumb, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="text-[9px] text-zinc-300 dark:text-zinc-700 mx-1">/</span>}
                          <span className={idx === breadcrumbs.length - 1 ? "text-zinc-700 dark:text-zinc-300 font-medium" : ""}>
                            {crumb}
                          </span>
                        </React.Fragment>
                      ))}
                    </nav>
                  )}
                  {renderDocBody()}
                </>
              ) : (
                <div className="max-w-md mx-auto text-center border border-border bg-card p-10 rounded-xl mt-16 shadow-sm">
                  <BookOpen className="text-4xl text-red-500 mb-6 mx-auto" />
                  <h3 className="text-base font-bold mb-2">{docsT('client_plugin_disabled')}</h3>
                  <p className="text-xs text-zinc-500 mb-6 leading-relaxed">
                    {docsT('client_plugin_disabled_desc')}
                  </p>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-4 h-9 text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-50 dark:hover:bg-zinc-100 dark:text-zinc-950 rounded-md transition-colors cursor-pointer"
                  >
                    {docsT('client_back_to_dashboard')}
                  </button>
                </div>
              )}
            </div>
          </main>

          {/* 右侧 TOC 目录导航栏 - On This Page */}
          {pluginEnabled && tocList.length > 0 && (
            <aside className="hidden xl:block w-[280px] flex-shrink-0 py-8 pl-4 pr-4 select-none overflow-y-auto no-scrollbar">
              <div className="sticky top-0">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 mb-5">
                  <GalleryVerticalEnd className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                  <h4 className="text-xs font-semibold m-0 text-zinc-700 dark:text-zinc-300">{docsT('client_toc_title')}</h4>
                </div>
                <div className="flex flex-col">
                  {renderOutline(false)}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* 全局命令调色板搜索弹窗 Command Palette */}
      {openSearch && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-[999] flex items-start justify-center pt-24 px-4 select-none"
          onClick={() => setOpenSearch(false)}
        >
          <div
            className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[400px] animate-in fade-in zoom-in-95 duration-150"
            onClick={e => e.stopPropagation()}
          >
            {/* 顶层搜索输入区 */}
            <div className="flex items-center px-4 border-b border-border h-12 gap-3">
              <Search className="w-4 h-4 text-zinc-400" />
              <input
                autoFocus
                type="text"
                placeholder={docsT('client_palette_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-foreground text-xs placeholder-zinc-400 border-none outline-none focus:ring-0 focus:border-none focus:outline-none"
              />
              <kbd className="text-[9px] text-zinc-400 bg-zinc-100 dark:bg-zinc-900 border border-border px-1.5 py-0.5 rounded shadow-sm">ESC</kbd>
            </div>

            {/* 搜索结果区 */}
            <div className="flex-1 overflow-y-auto p-2 docs-sidebar-scroll">
              {flatList.length === 0 ? (
                <div className="text-center py-10 text-xs text-zinc-400">{docsT('client_palette_no_results')}</div>
              ) : (
                flatList.map((doc, idx) => {
                  const isFocused = searchFocusIndex === idx;
                  return (
                    <div
                      key={doc.id}
                      onClick={() => {
                        const parentSlug = findParentSlug(treeData, doc.id);
                        const path = parentSlug 
                          ? `${basePath}/${parentSlug}/${idToSlug(doc.id)}`
                          : `${basePath}/${idToSlug(doc.id)}`;
                        navigate(path);
                        setOpenSearch(false);
                      }}
                      onMouseEnter={() => setSearchFocusIndex(idx)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        isFocused
                          ? 'bg-zinc-50 dark:bg-zinc-900/60 text-foreground font-semibold'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {doc.is_dir ? <Folder className="w-3.5 h-3.5 text-zinc-400" /> : <FileText className="w-3.5 h-3.5 text-zinc-400" />}
                      <span className="flex-1 truncate">{doc.title}</span>
                      {isFocused && <span className="text-[10px] text-zinc-400 font-sans">Enter ↩</span>}
                    </div>
                  );
                })
              )}
            </div>

            {/* 操作提示页脚 */}
            <div className="px-4 py-2 border-t border-border bg-zinc-50/50 dark:bg-zinc-900/20 flex items-center justify-between text-[10px] text-zinc-400 select-none">
              <div className="flex items-center gap-3">
                <span><kbd className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded border border-border">↑↓</kbd> {docsT('client_palette_move')}</span>
                <span><kbd className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded border border-border">↵</kbd> {docsT('client_palette_select')}</span>
              </div>
              <span>{docsT('client_palette_exit')}</span>
            </div>
          </div>
        </div>
      )}

      {/* 手机/小屏幕端大纲抽屉 Mobile Outline Drawer */}
      <Drawer
        title={docsT('client_toc_title')}
        placement="right"
        onClose={() => setOpenOutlineDrawer(false)}
        open={openOutlineDrawer}
        width={280}
        styles={{
          body: {
            padding: '24px 16px',
            background: themeMode === 'light' ? '#fff' : '#09090b',
          },
          header: {
            background: themeMode === 'light' ? '#fff' : '#09090b',
            borderBottom: themeMode === 'light' ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.08)',
          }
        }}
      >
        <div className="flex flex-col no-scrollbar overflow-y-auto max-h-full">
          {renderOutline(true)}
        </div>
      </Drawer>
    </div>
  );
};

export default RelayAPI;
