/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Row, Col, Tree, Input, Button, Switch, InputNumber,
  Form, Space, Empty, message, Popconfirm, Tooltip, Modal
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SaveOutlined, ReloadOutlined,
  FolderOutlined, FileTextOutlined, ArrowUpOutlined, ArrowDownOutlined,
  SettingOutlined, SearchOutlined, FolderAddOutlined, FileAddOutlined
} from '@ant-design/icons';
import { MdEditor } from 'md-editor-rt';
import 'md-editor-rt/lib/style.css';
import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';
import { useTranslation } from 'react-i18next';

interface DocNode {
  id: number;
  parent_id: number | null;
  title: string;
  is_dir: boolean;
  sort_order: number;
  is_active: boolean;
  slug?: string;
  children: DocNode[];
}

interface DocDetail {
  id: number;
  parent_id: number | null;
  title: string;
  content: string;
  is_dir: number;
  sort_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  slug?: string;
  translations?: Record<string, { title: string; content?: string }>;
}

const DocsManager: React.FC = () => {
  const { t } = useTranslation('docs_api');
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';

  const LANGUAGES = useMemo(() => [
    { key: 'zh', label: t('lang_zh_default') },
    { key: 'en', label: 'English' },
    { key: 'ja', label: '日本語' },
    { key: 'ko', label: '한국어' },
    { key: 'vi', label: 'Tiếng Việt' },
  ], [t]);

  const editorRef = useRef<any>(null);

  const [treeData, setTreeData] = useState<DocNode[]>([]);
  const [flatDocs, setFlatDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocDetail | null>(null);
  const [activeLang, setActiveLang] = useState<'zh' | 'en' | 'ja' | 'ko' | 'vi'>('zh');
  const [translating, setTranslating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  // 模态框：创建新节点
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm] = Form.useForm();
  const [createParentId, setCreateParentId] = useState<number | null>(null);
  const [createIsDir, setCreateIsDir] = useState<number>(0);

  // Shadcn 调色板
  const colors = {
    background: isLight ? '#ffffff' : '#09090b',
    foreground: isLight ? '#09090b' : '#f4f4f5',
    card: isLight ? '#ffffff' : '#09090b',
    cardMuted: isLight ? '#f4f4f5' : '#18181b',
    border: isLight ? '#e4e4e7' : '#27272a',
    input: isLight ? '#ffffff' : '#09090b',
    muted: isLight ? '#71717a' : '#a1a1aa',
    accent: isLight ? '#f4f5f6' : '#1a1a1c',
    primary: isLight ? '#18181b' : '#ffffff',
    primaryText: isLight ? '#ffffff' : '#09090b',
    ring: isLight ? '#cbd5e1' : '#3f3f46',
  };

  const styleSheet = {
    container: {
      display: 'flex',
      gap: '24px',
      height: 'calc(100vh - 160px)',
      color: colors.foreground,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
    sidebar: {
      width: '320px',
      minWidth: '320px',
      display: 'flex',
      flexDirection: 'column' as const,
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      background: colors.card,
      padding: '12px 8px',
      height: '100%',
    },
    main: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      background: colors.card,
      height: '100%',
      overflow: 'hidden',
    },
    input: {
      height: '36px',
      borderRadius: '6px',
      border: `1px solid ${colors.border}`,
      background: colors.input,
      color: colors.foreground,
      padding: '0 12px',
      fontSize: '14px',
      outline: 'none',
      width: '100%',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    buttonOutline: {
      height: '32px',
      borderRadius: '6px',
      border: `1px solid ${colors.border}`,
      background: 'transparent',
      color: colors.foreground,
      fontSize: '13px',
      fontWeight: 500,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      padding: '0 12px',
      transition: 'background 0.2s',
    },
    buttonPrimary: {
      height: '36px',
      borderRadius: '6px',
      background: colors.primary,
      color: colors.primaryText,
      border: 'none',
      fontSize: '14px',
      fontWeight: 500,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '0 16px',
      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      transition: 'opacity 0.2s',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 20px',
      borderBottom: `1px solid ${colors.border}`,
    },
    metaRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '12px 20px',
      background: colors.cardMuted,
      borderBottom: `1px solid ${colors.border}`,
      flexWrap: 'wrap' as const,
    },
    metaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    },
    label: {
      fontSize: '13px',
      fontWeight: 500,
      color: colors.muted,
    },
    select: {
      height: '32px',
      borderRadius: '6px',
      border: `1px solid ${colors.border}`,
      background: colors.input,
      color: colors.foreground,
      padding: '0 8px',
      fontSize: '13px',
      outline: 'none',
      cursor: 'pointer',
    },
    editorWrapper: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column' as const,
      height: 'calc(100% - 110px)',
      background: colors.background,
      overflow: 'hidden',
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  // 载入或切换文档时，默认开启单独预览模式
  useEffect(() => {
    if (editingDoc && editingDoc.is_dir === 0) {
      const timer = setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.togglePreviewOnly(true);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [editingDoc?.id]);

  const fetchDocs = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins/docs-api/docs') as any);
      if (res.tree) {
        setTreeData(res.tree);
        const flat: any[] = [];
        const traverse = (nodes: DocNode[]) => {
          nodes.forEach(n => {
            flat.push({ id: n.id, parent_id: n.parent_id, title: n.title, is_dir: n.is_dir, sort_order: n.sort_order, is_active: n.is_active, slug: n.slug });
            if (n.children) traverse(n.children);
          });
        };
        traverse(res.tree);
        setFlatDocs(flat);

        if (expandedKeys.length === 0) {
          setExpandedKeys(res.tree.map((n: any) => String(n.id)));
        }
      }
    } catch (error) {
      message.error(t('msg_fetch_list_failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (keys: any[]) => {
    if (keys.length === 0) {
      setSelectedKey(null);
      setEditingDoc(null);
      return;
    }
    const docId = Number(keys[0]);
    setSelectedKey(docId);
    try {
      const res = await (request.get(`/plugins/docs-api/docs/${docId}`) as any);
      if (res.doc) {
        setEditingDoc(res.doc);
        setActiveLang('zh');
      }
    } catch (error) {
      message.error(t('msg_fetch_detail_failed'));
    }
  };

  const handleSave = async () => {
    if (!editingDoc) return;
    try {
      await request.put(`/plugins/docs-api/docs/${editingDoc.id}`, {
        parent_id: editingDoc.parent_id,
        title: editingDoc.title,
        content: editingDoc.content,
        sort_order: editingDoc.sort_order,
        is_active: editingDoc.is_active,
        slug: editingDoc.slug || '',
        translations: editingDoc.translations || {},
      });
      message.success(t('msg_save_success'));
      fetchDocs();
    } catch (error) {
      message.error(t('msg_save_failed'));
    }
  };

  const handleAiTranslateAll = async () => {
    if (!editingDoc) return;
    const sourceTitle = editingDoc.title;
    const sourceContent = editingDoc.content;

    if (!sourceTitle && !sourceContent) {
      message.warning(t('translate_warning'));
      return;
    }

    setTranslating(true);
    message.loading({ content: t('translate_loading'), key: 'translate-status', duration: 0 });

    try {
      const targetLangs = ['en', 'ja', 'ko', 'vi'];
      const newTranslations = { ...(editingDoc.translations || {}) };

      for (const lang of targetLangs) {
        let translatedTitle = '';
        let translatedContent = '';

        if (sourceTitle) {
          const resTitle = await request.post('/plugins/docs-api/docs/translate', {
            text: sourceTitle,
            to_lang: lang,
          }) as any;
          translatedTitle = resTitle.translated || '';
        }

        if (sourceContent && editingDoc.is_dir === 0) {
          const resContent = await request.post('/plugins/docs-api/docs/translate', {
            text: sourceContent,
            to_lang: lang,
          }) as any;
          translatedContent = resContent.translated || '';
        }

        newTranslations[lang] = {
          title: translatedTitle || newTranslations[lang]?.title || '',
          content: translatedContent || newTranslations[lang]?.content || '',
        };
      }

      setEditingDoc({
        ...editingDoc,
        translations: newTranslations,
      });

      message.success({ content: t('translate_success'), key: 'translate-status', duration: 3 });
    } catch (error: any) {
      message.error({ content: `${t('translate_failed')}: ${error?.message || 'unknown error'}`, key: 'translate-status', duration: 3 });
    } finally {
      setTranslating(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/plugins/docs-api/docs/${id}`);
      message.success(t('msg_delete_success'));
      if (selectedKey === id) {
        setSelectedKey(null);
        setEditingDoc(null);
      }
      fetchDocs();
    } catch (error) {
      message.error(t('msg_delete_failed'));
    }
  };

  const handleResetDefault = async () => {
    try {
      setLoading(true);
      await request.post('/plugins/docs-api/docs/import-default');
      message.success(t('msg_reset_success'));
      setSelectedKey(null);
      setEditingDoc(null);
      fetchDocs();
    } catch (error) {
      message.error(t('msg_reset_failed'));
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = (parentId: number | null, isDir: number) => {
    setCreateParentId(parentId);
    setCreateIsDir(isDir);
    createForm.resetFields();
    createForm.setFieldsValue({
      is_dir: isDir,
      sort_order: 10,
      is_active: 1
    });
    setCreateModalVisible(true);
  };

  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      await request.post('/plugins/docs-api/docs', {
        parent_id: createParentId,
        title: values.title,
        content: values.content || '',
        is_dir: createIsDir,
        sort_order: values.sort_order,
        is_active: values.is_active ? 1 : 0,
        slug: values.slug || '',
      });
      message.success(t('msg_add_success'));
      setCreateModalVisible(false);
      fetchDocs();
    } catch (error) {
      message.error(t('msg_add_failed'));
    }
  };

  const onDrop = async (info: any) => {
    const dragId = Number(info.dragNode.key);
    const dropId = Number(info.node.key);
    const dropPos = info.node.pos.split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    const dragNode = flatDocs.find(d => d.id === dragId);
    const dropNode = flatDocs.find(d => d.id === dropId);

    if (!dragNode || !dropNode) return;

    let nextParentId: number | null = dragNode.parent_id;
    let nextSortOrder = dragNode.sort_order;

    if (dropPosition === 0) {
      if (!dropNode.is_dir) {
        message.warning(t('msg_drag_not_dir'));
        return;
      }
      nextParentId = dropId;
      const sibs = flatDocs.filter(d => d.parent_id === dropId);
      const maxSort = sibs.reduce((max, s) => Math.max(max, s.sort_order), 0);
      nextSortOrder = maxSort + 10;
    } else {
      nextParentId = dropNode.parent_id;
      const sibs = flatDocs.filter(d => d.parent_id === dropNode.parent_id).sort((a, b) => a.sort_order - b.sort_order);
      const idx = sibs.findIndex(s => s.id === dropId);
      if (idx !== -1) {
        if (dropPosition < 0) {
          if (idx === 0) {
            nextSortOrder = sibs[0].sort_order - 10;
          } else {
            nextSortOrder = Math.round((sibs[idx - 1].sort_order + sibs[idx].sort_order) / 2);
          }
        } else {
          if (idx === sibs.length - 1) {
            nextSortOrder = sibs[idx].sort_order + 10;
          } else {
            nextSortOrder = Math.round((sibs[idx].sort_order + sibs[idx + 1].sort_order) / 2);
          }
        }
      }
    }

    try {
      const detailRes = await (request.get(`/plugins/docs-api/docs/${dragId}`) as any);
      const content = detailRes.doc?.content || '';
      const slug = detailRes.doc?.slug || '';

      await request.put(`/plugins/docs-api/docs/${dragId}`, {
        parent_id: nextParentId,
        title: dragNode.title,
        content: content,
        sort_order: nextSortOrder,
        is_active: dragNode.is_active ? 1 : 0,
        slug: slug,
      });
      message.success(t('msg_drag_success'));
      fetchDocs();
    } catch (error) {
      message.error(t('msg_drag_failed'));
    }
  };

  const renderTreeNodes = (data: DocNode[]): any[] => {
    return data
      .map(item => {
        const titleMatch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
        const hasChildrenMatch = item.children && renderTreeNodes(item.children).length > 0;

        if (searchQuery && !titleMatch && !hasChildrenMatch) {
          return null;
        }

        const icon = item.is_dir 
          ? <FolderOutlined style={{ color: colors.muted, fontSize: '16px' }} /> 
          : <FileTextOutlined style={{ color: colors.muted, fontSize: '16px' }} />;

        const titleNode = (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', minWidth: 0 }} className="tree-node-row">
            <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              {icon}
            </span>
            <span style={{ 
              fontSize: '13.5px',
              textDecoration: item.is_active ? 'none' : 'line-through', 
              opacity: item.is_active ? 1 : 0.4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
              color: colors.foreground
            }} title={item.title}>
              {item.title}
              {item.slug && (
                <span style={{ fontSize: '11px', color: colors.muted, marginLeft: '6px', fontStyle: 'italic', fontWeight: 'normal' }}>
                  ({item.slug})
                </span>
              )}
            </span>
            <Space size={2} className="tree-actions-btn" onClick={e => e.stopPropagation()}>
              {item.is_dir && (
                <Tooltip title={t('new_subdoc')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<FileAddOutlined style={{ fontSize: '11px', color: colors.muted }} />}
                    onClick={(e) => { e.stopPropagation(); openCreateModal(item.id, 0); }}
                    style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                  />
                </Tooltip>
              )}
              <Popconfirm
                title={t('delete_confirm_title')}
                onConfirm={(e) => { e?.stopPropagation(); handleDelete(item.id); }}
                onCancel={(e) => e?.stopPropagation()}
                okText={t('delete_btn')}
                cancelText={t('cancel_btn')}
              >
                <Button
                  type="text"
                  size="small"
                  icon={<DeleteOutlined style={{ fontSize: '11px', color: '#ef4444' }} />}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}
                />
              </Popconfirm>
            </Space>
          </div>
        );

        return {
          key: String(item.id),
          title: titleNode,
          children: item.children ? renderTreeNodes(item.children) : [],
        };
      })
      .filter(item => item !== null);
  };

  const formattedTreeData = renderTreeNodes(treeData);

  return (
    <div style={styleSheet.container}>
      {/* 样式微调，注入 Shadcn 精髓 */}
      <style>{`
        /* 强力修复 Antd Tree 折行错位问题，使图标与文字横向在一行对齐，减少留空 */
        .ant-tree .ant-tree-treenode {
          display: flex !important;
          align-items: center !important;
          padding: 2px 0 !important; /* 极致紧凑排列 */
          border-radius: 6px;
          min-height: 28px !important;
          transition: background 0.15s, border-left 0.15s;
          position: relative;
        }
        .ant-tree .ant-tree-treenode:hover {
          background: ${colors.accent} !important;
        }
        
        /* 缩减层级之间的左右缩进宽度 (原生 24px) */
        .ant-tree .ant-tree-indent-unit {
          width: 12px !important;
        }
        
        /* 拖拽指示点 :: 样式调整 */
        .ant-tree .ant-tree-draggable-icon {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          opacity: 0.35;
          width: 14px !important;
          height: 24px !important;
          margin: 0 1px 0 0 !important;
          padding: 0 !important;
          font-size: 13px !important; /* 放大 6 个点图标 */
          color: ${colors.foreground} !important;
          cursor: grab !important;
          transition: opacity 0.15s;
        }
        .ant-tree .ant-tree-treenode:hover .ant-tree-draggable-icon {
          opacity: 0.7;
        }
        
        /* 折叠展开小箭头 */
        .ant-tree .ant-tree-switcher {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 16px !important;
          height: 24px !important;
          margin: 0 !important;
          padding: 0 !important;
          color: ${colors.muted} !important;
          transition: color 0.15s;
        }
        .ant-tree .ant-tree-switcher .ant-tree-switcher-icon {
          font-size: 11px !important; /* 稍微放大展开小箭头，默认是 10px 左右 */
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .ant-tree .ant-tree-switcher:hover {
          color: ${colors.foreground} !important;
        }
        
        /* 节点内容外包裹器 */
        .ant-tree .ant-tree-node-content-wrapper {
          display: flex !important;
          align-items: center !important;
          flex: 1 !important;
          min-width: 0 !important; /* 允许 flex 子项缩减以防止溢出 */
          padding: 0 2px !important; /* 左右间距缩小 */
          height: 24px !important;
          background: transparent !important;
          border-radius: 4px;
          transition: background 0.15s;
        }
        
        /* 选中状态 */
        .ant-tree .ant-tree-node-content-wrapper.ant-tree-node-selected {
          background: ${colors.accent} !important;
          font-weight: 500;
        }
        
        /* 标题容器 */
        .ant-tree .ant-tree-title {
          flex: 1 !important;
          display: flex !important;
          align-items: center !important;
          min-width: 0 !important;
          padding: 0 !important;
        }
        
        .tree-node-row {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          width: 100% !important;
          min-width: 0 !important;
        }
        
        /* 悬浮才显示操作按钮 */
        .tree-actions-btn {
          opacity: 0;
          transition: opacity 0.15s, transform 0.15s;
          transform: translateX(4px);
        }
        .tree-node-row:hover .tree-actions-btn {
          opacity: 1;
          transform: translateX(0);
        }
        
        /* 统一的滚动条美化 */
        .docs-sidebar-scroll::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .docs-sidebar-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .docs-sidebar-scroll::-webkit-scrollbar-thumb {
          background: ${isLight ? '#cbd5e1' : '#3f3f46'};
          border-radius: 10px;
        }
        .docs-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: ${colors.muted};
        }
        /* 深度定制 md-editor-rt 使之符合 Shadcn 极简灰框风格 */
        .md-editor {
          --md-bk-color: transparent !important;
          border: none !important;
        }
        .md-editor-toolbar-wrapper {
          border-bottom: 1px solid ${colors.border} !important;
          background: ${colors.card} !important;
        }
        .md-editor-content {
          background: ${colors.background} !important;
        }
        .md-editor-preview-wrapper {
          border-left: 1px solid ${colors.border} !important;
          background: ${colors.background} !important;
        }
        .md-editor-catalog-editor {
          border-left: 1px solid ${colors.border} !important;
          background: ${colors.background} !important;
        }
        /* 优化工具栏按钮的 Hover 态 */
        .md-editor-toolbar-item:hover {
          background: ${colors.accent} !important;
          border-radius: 4px;
        }
        /* 使编辑器内部的预览完美符合 GitHub 规范，同时限制文字排版 */
        /* 使编辑器内部的预览完美符合 Fumadocs / Vercel 规范，与用户端 /docs 100% 统一 */
        .github-theme {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          font-size: 14px !important;
          line-height: 1.7 !important;
          color: ${colors.foreground} !important;
          background: ${colors.background} !important;
        }
        .github-theme h1 {
          font-size: 2.2rem !important;
          font-weight: 800 !important;
          letter-spacing: -0.03em !important;
          margin-top: 0 !important;
          margin-bottom: 1.5rem !important;
          padding-bottom: 0.5rem !important;
          border-bottom: 1px solid ${colors.border} !important;
          color: ${colors.foreground} !important;
        }
        .github-theme h2 {
          font-size: 1.5rem !important;
          font-weight: 700 !important;
          letter-spacing: -0.02em !important;
          margin-top: 2.5rem !important;
          margin-bottom: 1rem !important;
          border-bottom: none !important;
          color: ${colors.foreground} !important;
        }
        .github-theme h3 {
          font-size: 1.15rem !important;
          font-weight: 600 !important;
          letter-spacing: -0.01em !important;
          margin-top: 1.8rem !important;
          margin-bottom: 0.75rem !important;
          color: ${colors.foreground} !important;
        }
        .github-theme p {
          margin-top: 0 !important;
          margin-bottom: 1.25rem !important;
          line-height: 1.7 !important;
          color: ${colors.foreground} !important;
          opacity: 0.85 !important;
        }
        .github-theme pre {
          background: ${isLight ? '#f4f4f5' : '#18181b'} !important;
          border: 1px solid ${colors.border} !important;
          border-radius: 8px !important;
          padding: 1.25rem !important;
          margin-top: 1.5rem !important;
          margin-bottom: 1.5rem !important;
          overflow-x: auto !important;
        }
        .github-theme code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
          font-size: 0.85em !important;
          padding: 0.2rem 0.4rem !important;
          border-radius: 4px !important;
          background: ${isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.08)'} !important;
          border: 1px solid ${colors.border} !important;
          color: ${colors.foreground} !important;
        }
        .github-theme pre code {
          background: transparent !important;
          border: none !important;
          color: inherit !important;
          padding: 0 !important;
          font-size: 0.9em !important;
        }
        .github-theme table {
          width: 100% !important;
          border-collapse: collapse !important;
          margin-top: 1.5rem !important;
          margin-bottom: 1.5rem !important;
          font-size: 13px !important;
        }
        .github-theme th {
          background: ${colors.accent} !important;
          border: 1px solid ${colors.border} !important;
          padding: 8px 12px !important;
          font-weight: 600 !important;
          text-align: left !important;
        }
        .github-theme td {
          border: 1px solid ${colors.border} !important;
          padding: 8px 12px !important;
          color: ${colors.foreground} !important;
        }
        .github-theme blockquote {
          border-left: 3px solid ${colors.primary} !important;
          background: ${colors.accent} !important;
          padding: 10px 16px !important;
          margin: 1.5rem 0 !important;
          border-radius: 0 6px 6px 0 !important;
        }
        .github-theme blockquote p {
          margin: 0 !important;
          font-style: italic !important;
          opacity: 0.8 !important;
        }
        .github-theme a {
          color: #3b82f6 !important;
          text-decoration: none !important;
        }
        .github-theme a:hover {
          text-decoration: underline !important;
        }
        .github-theme ul, .github-theme ol {
          margin-bottom: 16px !important;
          padding-left: 20px !important;
        }
        .github-theme li {
          margin-bottom: 6px !important;
          line-height: 1.6 !important;
        }
        /* Shadcn Input focus style */
        .shadcn-input:focus {
          border-color: ${colors.ring} !important;
          box-shadow: 0 0 0 2px ${colors.accent} !important;
        }
        /* 美化 antd 模态框样式 */
        .ant-modal-content {
          background: ${colors.card} !important;
          border: 1px solid ${colors.border} !important;
          border-radius: 8px !important;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1) !important;
        }
        .ant-modal-header {
          background: transparent !important;
          border-bottom: none !important;
        }
        .ant-modal-title {
          color: ${colors.foreground} !important;
          font-weight: 600 !important;
        }
        .ant-modal-close {
          color: ${colors.muted} !important;
        }
      `}</style>

      {/* 左侧侧边栏 - 文档大纲 */}
      <div style={styleSheet.sidebar}>
        {/* 大纲标题 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '-0.01em' }}>{t('doc_outline')}</span>
          <Popconfirm
            title={t('reset_confirm_title')}
            onConfirm={handleResetDefault}
            okText={t('reset_btn')}
            cancelText={t('cancel_btn')}
          >
            <Tooltip title={t('reset_tooltip')}>
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined style={{ fontSize: '12.5px', color: '#ef4444' }} />}
                style={{ width: '24px', height: '24px' }}
              />
            </Tooltip>
          </Popconfirm>
        </div>

        {/* 搜索框 */}
        <div style={{ position: 'relative', marginBottom: '10px' }}>
          <SearchOutlined style={{ position: 'absolute', left: '10px', top: '11px', color: colors.muted, zIndex: 2 }} />
          <input
            className="shadcn-input"
            style={{ ...styleSheet.input, paddingLeft: '30px' }}
            placeholder={t('search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* 树控件 */}
        <div className="docs-sidebar-scroll" style={{ flex: 1, overflowY: 'auto', marginBottom: '14px' }}>
          {treeData.length === 0 ? (
            <Empty description={t('no_docs')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ marginTop: '20px' }} />
          ) : (
            <Tree
              draggable
              blockNode
              selectable
              onSelect={handleSelect}
              selectedKeys={selectedKey ? [String(selectedKey)] : []}
              onDrop={onDrop}
              treeData={formattedTreeData}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              style={{ background: 'transparent', color: colors.foreground }}
            />
          )}
        </div>

        {/* 底部新增按钮组 */}
        <div style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${colors.border}`, paddingTop: '12px' }}>
          <button 
            style={{ ...styleSheet.buttonOutline, flex: 1 }} 
            onClick={() => openCreateModal(null, 1)}
          >
            <FolderAddOutlined /> {t('new_dir')}
          </button>
          <button 
            style={{ ...styleSheet.buttonOutline, flex: 1 }} 
            onClick={() => openCreateModal(null, 0)}
          >
            <FileAddOutlined /> {t('new_doc')}
          </button>
        </div>
      </div>

      {/* 右侧主编辑工作区 */}
      <div style={styleSheet.main}>
        {editingDoc ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* 工作区 Header */}
            <div style={styleSheet.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {editingDoc.is_dir ? (
                  <FolderOutlined style={{ color: colors.muted, fontSize: '18px' }} />
                ) : (
                  <FileTextOutlined style={{ color: colors.muted, fontSize: '18px' }} />
                )}
                <input
                  value={activeLang === 'zh' ? editingDoc.title : (editingDoc.translations?.[activeLang]?.title || '')}
                  onChange={(e) => {
                    if (activeLang === 'zh') {
                      setEditingDoc({ ...editingDoc, title: e.target.value });
                    } else {
                      setEditingDoc({
                        ...editingDoc,
                        translations: {
                          ...editingDoc.translations,
                          [activeLang]: {
                            ...editingDoc.translations?.[activeLang],
                            title: e.target.value,
                            content: editingDoc.translations?.[activeLang]?.content || '',
                          }
                        }
                      });
                    }
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: '16px',
                    fontWeight: 600,
                    color: colors.foreground,
                    outline: 'none',
                    width: '320px',
                  }}
                  placeholder={t('title_placeholder')}
                />
              </div>
              <button 
                style={styleSheet.buttonPrimary} 
                onClick={handleSave}
              >
                <SaveOutlined /> {t('save_publish')}
              </button>
            </div>

            {/* 精简属性行 */}
            <div style={styleSheet.metaRow}>
              {/* 父级目录 */}
              <div style={styleSheet.metaItem}>
                <span style={styleSheet.label}>{t('parent_dir')}:</span>
                <select
                  style={styleSheet.select}
                  value={editingDoc.parent_id || ''}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : null;
                    setEditingDoc({ ...editingDoc, parent_id: val });
                  }}
                >
                  <option value="">{t('parent_root')}</option>
                  {flatDocs
                    .filter(d => d.is_dir && d.id !== editingDoc.id)
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))
                  }
                </select>
              </div>

              {/* 排序权重 */}
              <div style={styleSheet.metaItem}>
                <span style={styleSheet.label}>{t('sort_order')}:</span>
                <InputNumber
                  min={0}
                  size="small"
                  value={editingDoc.sort_order}
                  onChange={(val) => setEditingDoc({ ...editingDoc, sort_order: val || 0 })}
                  style={{ width: '70px', borderRadius: '4px', border: `1px solid ${colors.border}`, background: colors.input, color: colors.foreground }}
                />
              </div>

              {/* 路由别名 (slug) */}
              <div style={styleSheet.metaItem}>
                <span style={styleSheet.label}>{t('slug')}:</span>
                <Input
                  size="small"
                  value={editingDoc.slug || ''}
                  onChange={(e) => setEditingDoc({ ...editingDoc, slug: e.target.value })}
                  placeholder={t('slug_placeholder')}
                  style={{ width: '130px', borderRadius: '4px', border: `1px solid ${colors.border}`, background: colors.input, color: colors.foreground }}
                />
              </div>

              {/* 启用状态 */}
              <div style={styleSheet.metaItem}>
                <span style={styleSheet.label}>{t('public_visible')}:</span>
                <Switch
                  size="small"
                  checked={editingDoc.is_active === 1}
                  onChange={(checked) => setEditingDoc({ ...editingDoc, is_active: checked ? 1 : 0 })}
                />
              </div>
            </div>

            {/* 语言页签选项卡 */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 20px',
              borderBottom: `1px solid ${colors.border}`,
              background: colors.card,
            }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                {LANGUAGES.map(lang => {
                  const isActive = activeLang === lang.key;
                  return (
                    <button
                      key={lang.key}
                      onClick={() => setActiveLang(lang.key as any)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        border: 'none',
                        background: isActive ? colors.accent : 'transparent',
                        color: isActive ? colors.foreground : colors.muted,
                        transition: 'all 0.2s',
                      }}
                    >
                      {lang.label}
                    </button>
                  );
                })}
              </div>

              {activeLang === 'zh' && (
                <button
                  style={{
                    ...styleSheet.buttonOutline,
                    height: '28px',
                    borderColor: '#10b981',
                    color: '#10b981',
                    fontSize: '12px',
                  }}
                  onClick={handleAiTranslateAll}
                  disabled={translating}
                >
                  {t('ai_translate_btn')}
                </button>
              )}
            </div>

            {/* 编辑与预览面板 (集成 md-editor-rt) */}
            {editingDoc.is_dir === 0 ? (
              <div style={styleSheet.editorWrapper}>
                <MdEditor
                  ref={editorRef}
                  modelValue={activeLang === 'zh' ? editingDoc.content : (editingDoc.translations?.[activeLang]?.content || '')}
                  onChange={(val) => {
                    if (activeLang === 'zh') {
                      setEditingDoc({ ...editingDoc, content: val });
                    } else {
                      setEditingDoc({
                        ...editingDoc,
                        translations: {
                          ...editingDoc.translations,
                          [activeLang]: {
                            ...editingDoc.translations?.[activeLang],
                            title: editingDoc.translations?.[activeLang]?.title || '',
                            content: val,
                          }
                        }
                      });
                    }
                  }}
                  theme={themeMode === 'dark' ? 'dark' : 'light'}
                  previewTheme="github"
                  toolbars={[
                    'bold',
                    'underline',
                    'italic',
                    '-',
                    'strikeThrough',
                    'title',
                    'sub',
                    'sup',
                    'quote',
                    'unorderedList',
                    'orderedList',
                    'task',
                    '-',
                    'codeRow',
                    'code',
                    'link',
                    'image',
                    'table',
                    '-',
                    'revoke',
                    'next',
                    '=',
                    'pageFullscreen',
                    'fullscreen',
                    'preview',
                    'previewOnly',
                    'htmlPreview',
                    'catalog'
                  ]}
                  style={{ height: '100%', border: 'none', background: 'transparent' }}
                  placeholder={t('editor_placeholder')}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: colors.background, padding: '40px', overflowY: 'auto' }}>
                <div style={{ maxWidth: '600px', margin: '0 auto', width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', borderBottom: `1px solid ${colors.border}`, paddingBottom: '16px' }}>
                    <FolderOutlined style={{ fontSize: '32px', color: colors.muted }} />
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 600, color: colors.foreground, margin: 0 }}>{t('cat_settings')}</h3>
                      <p style={{ fontSize: '13px', color: colors.muted, margin: '4px 0 0 0' }}>{t('cat_settings_desc')}</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* 分类名称编辑 */}
                    <div>
                      <label style={{ ...styleSheet.label, display: 'block', marginBottom: '8px' }}>{t('cat_name')}</label>
                      <Input
                        value={activeLang === 'zh' ? editingDoc.title : (editingDoc.translations?.[activeLang]?.title || '')}
                        onChange={(e) => {
                          if (activeLang === 'zh') {
                            setEditingDoc({ ...editingDoc, title: e.target.value });
                          } else {
                            setEditingDoc({
                              ...editingDoc,
                              translations: {
                                ...editingDoc.translations,
                                [activeLang]: {
                                  ...editingDoc.translations?.[activeLang],
                                  title: e.target.value,
                                  content: editingDoc.translations?.[activeLang]?.content || '',
                                }
                              }
                            });
                          }
                        }}
                        placeholder={t('form_title_dir_placeholder2')}
                        className="shadcn-input"
                        style={{ height: '36px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.input, color: colors.foreground }}
                      />
                    </div>

                    {/* 路由别名编辑 */}
                    <div>
                      <label style={{ ...styleSheet.label, display: 'block', marginBottom: '8px' }}>{t('form_slug_label')}</label>
                      <Input
                        value={editingDoc.slug || ''}
                        onChange={(e) => setEditingDoc({ ...editingDoc, slug: e.target.value })}
                        placeholder={t('slug_dir_placeholder')}
                        className="shadcn-input"
                        style={{ height: '36px', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.input, color: colors.foreground }}
                      />
                      <span style={{ fontSize: '12px', color: colors.muted, display: 'block', marginTop: '6px' }}>
                        {t('slug_dir_desc')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', marginTop: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ ...styleSheet.label, display: 'block', marginBottom: '8px' }}>{t('sort_order')}</label>
                        <InputNumber
                          min={0}
                          value={editingDoc.sort_order}
                          onChange={(val) => setEditingDoc({ ...editingDoc, sort_order: val || 0 })}
                          style={{ width: '100%', borderRadius: '6px', border: `1px solid ${colors.border}`, background: colors.input, color: colors.foreground }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '120px' }}>
                        <label style={{ ...styleSheet.label, display: 'block', marginBottom: '8px' }}>{t('public_visible')}</label>
                        <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                          <Switch
                            checked={editingDoc.is_active === 1}
                            onChange={(checked) => setEditingDoc({ ...editingDoc, is_active: checked ? 1 : 0 })}
                          />
                          <span style={{ marginLeft: '8px', fontSize: '13px', color: colors.muted }}>{t('direct_public')}</span>
                        </div>
                      </div>
                    </div>

                    {/* 提示信息 */}
                    <div style={{ marginTop: '24px', padding: '16px', borderRadius: '8px', background: colors.cardMuted, border: `1px solid ${colors.border}` }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, color: colors.foreground, margin: '0 0 6px 0' }}>{t('tips_title')}</h4>
                      <p style={{ fontSize: '12px', color: colors.muted, margin: 0, lineHeight: 1.6 }}>
                        {t('tips_desc')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px' }}>
            <Empty
              description={
                <div style={{ color: colors.muted }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: colors.foreground, margin: 0 }}>{t('system_title')}</h3>
                  <p style={{ fontSize: '13px', margin: '8px 0 0 0' }}>{t('system_desc')}</p>
                </div>
              }
            />
          </div>
        )}
      </div>

      {/* 模态框：新建分类/文档 */}
      <Modal
        title={createIsDir === 1 ? t('create_dir_title') : t('create_doc_title')}
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
        okButtonProps={{ style: { background: colors.primary, color: colors.primaryText, border: 'none' } }}
        cancelText={t('cancel')}
        okText={t('create')}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: '16px' }}>
          <Form.Item
            name="title"
            label={t('form_title')}
            rules={[{ required: true, message: t('form_title_required') }]}
          >
            <Input 
              placeholder={createIsDir === 1 ? t('form_title_dir_placeholder') : t('form_title_doc_placeholder')} 
              className="shadcn-input"
              style={{ height: '36px', borderRadius: '6px' }}
            />
          </Form.Item>
          <Form.Item
            name="slug"
            label={t('form_slug_label')}
            help={createIsDir === 1 ? t('form_slug_help_dir') : t('form_slug_help_doc')}
          >
            <Input 
              placeholder={t('form_slug_placeholder')} 
              className="shadcn-input"
              style={{ height: '36px', borderRadius: '6px' }}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="sort_order"
                label={t('form_sort_order_label')}
                initialValue={10}
              >
                <InputNumber min={0} style={{ width: '100%', borderRadius: '6px' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="is_active"
                label={t('form_status_label')}
                valuePropName="checked"
                initialValue={true}
              >
                <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                  <Switch defaultChecked />
                  <span style={{ marginLeft: '8px', fontSize: '13px', color: colors.muted }}>{t('form_status_help')}</span>
                </div>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default DocsManager;
