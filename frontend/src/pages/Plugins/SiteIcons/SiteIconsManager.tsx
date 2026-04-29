import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Typography, Input, Button, Space, Spin, message, Tag, Modal, Form, Select, Upload, Tooltip, Pagination, Empty, Popconfirm, Progress } from 'antd';
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined, CloudDownloadOutlined, HistoryOutlined, InboxOutlined, CloseOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

interface SiteIcon {
  id: number; name: string; title: string; file_path: string;
  source: string; category: string; tags: string; is_active: number;
  created_at: string; updated_at: string;
}
interface SyncLog {
  id: number; total_synced: number; total_new: number; total_updated: number;
  status: string; error_message: string | null; created_at: string;
}

const SiteIconsManager: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const [icons, setIcons] = useState<SiteIcon[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterSource, setFilterSource] = useState('');

  // 同步状态
  const [syncing, setSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncCurrent, setSyncCurrent] = useState(0);
  const [syncFinished, setSyncFinished] = useState(false);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const logOffsetRef = useRef(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const logPanelRef = useRef<HTMLDivElement>(null);

  // Modal 状态
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editingIcon, setEditingIcon] = useState<SiteIcon | null>(null);
  const [form] = Form.useForm();
  const [svgPreview, setSvgPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [syncLogList, setSyncLogList] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [previewIcon, setPreviewIcon] = useState<SiteIcon | null>(null);

  const fetchIcons = useCallback(async (p = page) => {
    try {
      setLoading(true);
      const params: any = { page: p, size: 60 };
      if (searchKeyword) params.q = searchKeyword;
      if (filterCategory) params.category = filterCategory;
      if (filterSource) params.source = filterSource;
      const res = await (request.get('/plugins/site-icons', { params }) as any);
      if (res.data) setIcons(res.data);
      if (res.total != null) setTotal(res.total);
      setPage(res.page || p);
    } catch { message.error('获取图标列表失败'); }
    finally { setLoading(false); }
  }, [searchKeyword, filterCategory, filterSource, page]);

  useEffect(() => { fetchIcons(1); }, [searchKeyword, filterCategory, filterSource]);

  // ── 同步轮询 ──
  const pollProgress = useCallback(async () => {
    try {
      const res = await (request.get('/plugins/site-icons/sync-progress', {
        params: { since: logOffsetRef.current }
      }) as any);
      const d = res.data;
      if (d.logs?.length) {
        setSyncLogs(prev => [...prev, ...d.logs]);
        logOffsetRef.current = d.log_offset;
        // 自动滚动到底部
        setTimeout(() => {
          if (logPanelRef.current) {
            logPanelRef.current.scrollTop = logPanelRef.current.scrollHeight;
          }
        }, 50);
      }
      if (d.total) setSyncTotal(d.total);
      if (d.current != null) setSyncCurrent(d.current);
      if (d.finished) {
        setSyncFinished(true);
        setSyncing(false);
        if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = undefined; }
        fetchIcons(1);
      }
    } catch { /* silent */ }
  }, [fetchIcons]);

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncFinished(false);
      setSyncLogs([]);
      setSyncTotal(0);
      setSyncCurrent(0);
      logOffsetRef.current = 0;
      setShowSyncPanel(true);
      await (request.post('/plugins/site-icons/sync', {}) as any);
      // 开始轮询
      pollTimerRef.current = setInterval(pollProgress, 1500);
    } catch (e: any) {
      setSyncing(false);
      message.error(e?.response?.data?.error?.message || '启动同步失败');
    }
  };

  useEffect(() => {
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  // ── CRUD ──
  const handleDelete = async (id: number) => {
    try { await request.delete(`/plugins/site-icons/${id}`); message.success('已删除'); fetchIcons(); }
    catch { message.error('删除失败'); }
  };
  const handleOpenAdd = () => { setEditingIcon(null); form.resetFields(); setSvgPreview(''); setAddModalVisible(true); };
  const handleOpenEdit = (icon: SiteIcon) => {
    setEditingIcon(icon);
    let tags: string[] = []; try { tags = JSON.parse(icon.tags || '[]'); } catch {}
    form.setFieldsValue({ name: icon.name, title: icon.title, category: icon.category, tags });
    setSvgPreview(''); setAddModalVisible(true);
  };
  const handleSave = async () => {
    try {
      const values = await form.validateFields(); setSaving(true);
      if (editingIcon) {
        const payload: any = { name: values.name, title: values.title, category: values.category, tags: values.tags || [] };
        if (svgPreview) payload.svg_content = svgPreview;
        await request.put(`/plugins/site-icons/${editingIcon.id}`, payload);
        message.success('图标更新成功');
      } else {
        if (!svgPreview) { message.warning('请上传或粘贴 SVG 内容'); setSaving(false); return; }
        await request.post('/plugins/site-icons', { name: values.name, title: values.title, category: values.category, tags: values.tags || [], svg_content: svgPreview });
        message.success('图标添加成功');
      }
      setAddModalVisible(false); fetchIcons();
    } catch (e: any) { if (!e?.errorFields) message.error(e?.response?.data?.error?.message || '保存失败'); }
    finally { setSaving(false); }
  };
  const handleSvgUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => { const c = e.target?.result as string; if (c.includes('<svg')) setSvgPreview(c); else message.error('无效的 SVG 文件'); };
    reader.readAsText(file); return false;
  };
  const fetchSyncLogs = async () => {
    try { setLogsLoading(true); const res = await (request.get('/plugins/site-icons/sync-logs') as any); if (res.data) setSyncLogList(res.data); }
    catch { message.error('获取日志失败'); } finally { setLogsLoading(false); }
  };
  const getSvgUrl = (icon: SiteIcon) => icon.file_path ? `/assets/${icon.file_path}` : '';

  const syncPercent = syncTotal > 0 ? Math.round((syncCurrent / syncTotal) * 100) : 0;

  return (
    <div>
      {/* ════ 实时同步日志面板 ════ */}
      {showSyncPanel && (
        <div style={{
          marginBottom: 16, borderRadius: 8, overflow: 'hidden',
          border: syncFinished ? '1px solid rgba(82,196,26,0.3)' : '1px solid rgba(22,119,255,0.3)',
          background: '#0d0d0d',
        }}>
          {/* 头部 */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px',
            background: syncFinished ? 'rgba(82,196,26,0.06)' : 'rgba(22,119,255,0.06)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {syncing && <Spin size="small" />}
              <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 13, fontWeight: 500 }}>
                {syncing ? '正在同步图标库...' : syncFinished ? '✅ 同步完成' : '同步日志'}
              </Text>
              {syncTotal > 0 && (
                <Tag style={{ margin: 0, fontSize: 11, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.3)', color: '#1677ff' }}>
                  {syncCurrent}/{syncTotal}
                </Tag>
              )}
            </div>
            <Button type="text" size="small" icon={<CloseOutlined />}
              style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}
              onClick={() => { setShowSyncPanel(false); if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = undefined; } }}
            />
          </div>
          {/* 进度条 */}
          {syncTotal > 0 && (
            <div style={{ padding: '6px 16px 0' }}>
              <Progress percent={syncPercent} size="small" strokeColor={syncFinished ? '#52c41a' : '#1677ff'} trailColor="rgba(255,255,255,0.06)" />
            </div>
          )}
          {/* 日志输出 */}
          <div ref={logPanelRef} style={{
            maxHeight: 240, overflow: 'auto', padding: '8px 16px 12px',
            fontFamily: 'Menlo, Monaco, Consolas, monospace', fontSize: 12,
            lineHeight: 1.7, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)',
          }}>
            {syncLogs.map((log, i) => (
              <div key={i} style={{
                color: log.startsWith('❌') ? '#ff4d4f' : log.startsWith('⚠️') ? '#faad14'
                  : log.startsWith('✅') ? 'rgba(82,196,26,0.8)' : log.startsWith('🎉') ? '#52c41a'
                  : log.startsWith('⏭️') ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.55)',
              }}>
                {log}
              </div>
            ))}
            {syncLogs.length === 0 && syncing && (
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)' }}>等待服务器响应...</Text>
            )}
          </div>
        </div>
      )}

      {/* ════ 工具栏 ════ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)' }} />} placeholder="搜索图标名称..."
            value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)}
            style={{ width: 240, background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }} allowClear />
          <Select placeholder="分类" value={filterCategory || undefined} onChange={v => setFilterCategory(v || '')} allowClear
            style={{ width: 130 }} options={[{ label: 'AI品牌', value: 'AI品牌' }, { label: '自定义', value: '自定义' }]} />
          <Select placeholder="来源" value={filterSource || undefined} onChange={v => setFilterSource(v || '')} allowClear
            style={{ width: 130 }} options={[{ label: 'Lobe Icons', value: 'lobe-icons' }, { label: '手动添加', value: 'custom' }]} />
        </div>
        <Space>
          <Tooltip title="查看同步日志"><Button icon={<HistoryOutlined />} onClick={() => { setLogModalVisible(true); fetchSyncLogs(); }} /></Tooltip>
          <Button icon={<PlusOutlined />} onClick={handleOpenAdd}>手动添加</Button>
          <Button type="primary" icon={<CloudDownloadOutlined />} loading={syncing} onClick={handleSync} disabled={syncing}>
            {syncing ? '同步中...' : '在线更新'}
          </Button>
        </Space>
      </div>

      <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13, display: 'block', marginBottom: 16 }}>
        共 <span style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{total}</span> 个图标
      </Text>

      {/* ════ 图标网格 ════ */}
      {loading && icons.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
      ) : icons.length === 0 ? (
        <Empty description={<Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}>暂无图标，点击「在线更新」从 Lobe Icons 同步</Text>} style={{ padding: 60 }} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 12 }}>
            {icons.map(icon => (
              <div key={icon.id} style={{
                background: _isLight ? '#fff' : '#141414', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                padding: '14px 10px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                cursor: 'pointer', transition: 'border-color 0.2s, box-shadow 0.2s', position: 'relative',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = icon.source === 'custom' ? 'rgba(82,196,26,0.5)' : 'rgba(22,119,255,0.5)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(22,119,255,0.08)'; const a = e.currentTarget.querySelector('.icon-actions') as HTMLElement; if (a) a.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; const a = e.currentTarget.querySelector('.icon-actions') as HTMLElement; if (a) a.style.opacity = '0'; }}
                onClick={() => setPreviewIcon(icon)}
              >
                {icon.source === 'custom' && <Tag style={{ position: 'absolute', top: 4, right: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px', background: 'rgba(82,196,26,0.1)', border: '1px solid rgba(82,196,26,0.3)', color: '#52c41a', borderRadius: 3 }}>自定义</Tag>}
                <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={getSvgUrl(icon)} alt={icon.title || icon.name} style={{ maxWidth: 36, maxHeight: 36, objectFit: 'contain' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 11, textAlign: 'center', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }} title={icon.title || icon.name}>{icon.title || icon.name}</Text>
                <div className="icon-actions" style={{ position: 'absolute', bottom: 4, right: 4, display: 'flex', gap: 2, opacity: 0, transition: 'opacity 0.15s' }} onClick={e => e.stopPropagation()}>
                  <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }} onClick={() => handleOpenEdit(icon)} /></Tooltip>
                  <Popconfirm title="确定删除？" onConfirm={() => handleDelete(icon.id)} okText="删除" cancelText="取消">
                    <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ fontSize: 12 }} /></Tooltip>
                  </Popconfirm>
                </div>
              </div>
            ))}
          </div>
          {total > 60 && <div style={{ textAlign: 'center', marginTop: 20 }}><Pagination current={page} total={total} pageSize={60} onChange={p => fetchIcons(p)} showSizeChanger={false} showTotal={t => `共 ${t} 个图标`} /></div>}
        </>
      )}

      {/* ════ 添加/编辑 Modal ════ */}
      <Modal title={editingIcon ? '编辑图标' : '添加自定义图标'} open={addModalVisible} onOk={handleSave} onCancel={() => setAddModalVisible(false)} confirmLoading={saving} okText={editingIcon ? '保存修改' : '添加图标'} width={520} destroyOnClose>
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="图标标识名" rules={[{ required: true, message: '请输入图标标识名' }]}><Input placeholder="例如: my-brand" disabled={!!editingIcon} /></Form.Item>
          <Form.Item name="title" label="显示名称"><Input placeholder="例如: My Brand" /></Form.Item>
          <Form.Item name="category" label="分类" initialValue="自定义"><Select options={[{ label: 'AI品牌', value: 'AI品牌' }, { label: '自定义', value: '自定义' }]} /></Form.Item>
          <Form.Item name="tags" label="标签"><Select mode="tags" placeholder="输入标签后按回车" /></Form.Item>
          <Form.Item label="SVG 内容" required={!editingIcon}>
            <Dragger accept=".svg" showUploadList={false} beforeUpload={handleSvgUpload as any} style={{ background: _isLight ? '#fafafa' : '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)' }}>
              <p style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}><InboxOutlined style={{ fontSize: 32 }} /></p>
              <p style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13 }}>点击或拖拽 SVG 文件到此处</p>
            </Dragger>
            <div style={{ marginTop: 8 }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>或直接粘贴 SVG 代码：</Text>
              <TextArea rows={4} placeholder="<svg ...>...</svg>" value={svgPreview} onChange={e => setSvgPreview(e.target.value)} style={{ marginTop: 4, background: _isLight ? '#fafafa' : '#1a1a1a', borderColor: 'rgba(255,255,255,0.12)', fontFamily: 'monospace', fontSize: 12 }} />
            </div>
            {svgPreview && <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#fff', textAlign: 'center', border: '1px solid rgba(0,0,0,0.06)' }}><div dangerouslySetInnerHTML={{ __html: svgPreview }} style={{ maxWidth: 64, maxHeight: 64, margin: '0 auto' }} /><Text style={{ fontSize: 11, color: '#666', display: 'block', marginTop: 4 }}>SVG 预览</Text></div>}
          </Form.Item>
        </Form>
      </Modal>

      {/* ════ 预览 Modal ════ */}
      <Modal title={previewIcon ? previewIcon.title || previewIcon.name : ''} open={!!previewIcon} onCancel={() => setPreviewIcon(null)} footer={null} width={400}>
        {previewIcon && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', background: '#fff', borderRadius: 12, border: '1px solid rgba(0,0,0,0.06)' }}>
              <img src={getSvgUrl(previewIcon)} alt={previewIcon.name} style={{ maxWidth: 80, maxHeight: 80 }} />
            </div>
            <div style={{ textAlign: 'left', padding: '0 12px' }}>
              {[['标识名', previewIcon.name], ['显示名称', previewIcon.title || '-'], ['分类', previewIcon.category], ['文件路径', previewIcon.file_path], ['更新时间', previewIcon.updated_at]].map(([label, val]) => (
                <div key={label as string} style={{ marginBottom: 8 }}>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>{label}</Text>
                  <Text style={{ color: val === previewIcon.file_path ? 'rgba(255,255,255,0.5)' : '#fff', display: 'block', fontSize: val === previewIcon.file_path ? 12 : 14, wordBreak: 'break-all' }}>{val}</Text>
                </div>
              ))}
              <div style={{ marginBottom: 8 }}><Text style={{ color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)', fontSize: 12 }}>来源</Text><Tag color={previewIcon.source === 'custom' ? 'green' : 'blue'} style={{ marginLeft: 8 }}>{previewIcon.source === 'custom' ? '手动添加' : 'Lobe Icons'}</Tag></div>
            </div>
          </div>
        )}
      </Modal>

      {/* ════ 同步历史日志 Modal ════ */}
      <Modal title="同步历史日志" open={logModalVisible} onCancel={() => setLogModalVisible(false)} footer={null} width={600}>
        {logsLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
         : syncLogList.length === 0 ? <Empty description="暂无同步记录" />
         : <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {syncLogList.map(log => (
              <div key={log.id} style={{ background: _isLight ? '#fff' : '#141414', borderRadius: 6, border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)', padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Tag color={log.status === 'success' ? 'success' : log.status === 'partial' ? 'warning' : 'error'}>{log.status === 'success' ? '成功' : log.status === 'partial' ? '部分成功' : '失败'}</Tag>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>{log.created_at}</Text>
                </div>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>同步 {log.total_synced} 个，库中共 {log.total_new} 个</Text>
                {log.error_message && <div style={{ marginTop: 4 }}><Text style={{ color: 'rgba(255,77,79,0.8)', fontSize: 12, wordBreak: 'break-all' }}>{log.error_message.substring(0, 200)}</Text></div>}
              </div>
            ))}
          </div>}
      </Modal>
    </div>
  );
};

export default SiteIconsManager;
