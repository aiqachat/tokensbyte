/**
 * 创作日志面板 (Generation Log Widget)
 * 
 * 展示画布上每个节点的创作思考过程，包含：
 * - 使用的提示词
 * - 附带的参考素材
 * - 使用的模型名称
 * - 生成状态
 * 
 * 设计风格与 ResourceManagerWidget / SettingsWidget 完全一致
 */
import React, { useMemo } from 'react';
import { Typography, Tooltip, Tag } from 'antd';
import {
  CloseOutlined, FileTextOutlined, PictureOutlined,
  VideoCameraOutlined, CheckCircleOutlined, LoadingOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { MessageCircle } from 'lucide-react';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';

const { Text } = Typography;

const GenerationLogWidget: React.FC = React.memo(() => {
  const { nodes } = useCanvas();
  const { isGenLogVisible, setIsGenLogVisible } = usePlayground();

  // 按时间倒序排列（最新的在上面）
  const logEntries = useMemo(() => {
    return nodes
      .filter(n => n.taskData?.prompt) // 只展示有 prompt 的节点
      .sort((a, b) => {
        const ta = a.taskData?.created_at || a.id;
        const tb = b.taskData?.created_at || b.id;
        return tb > ta ? 1 : -1;
      });
  }, [nodes]);

  if (!isGenLogVisible) return null;

  const statusIcon = (status: string) => {
    if (status === 'completed') return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />;
    if (status === 'loading') return <LoadingOutlined style={{ color: '#A2C1FF', fontSize: 12 }} />;
    return <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />;
  };

  const statusLabel = (status: string) => {
    if (status === 'completed') return '已完成';
    if (status === 'loading') return '生成中...';
    return '失败';
  };

  const typeIcon = (type: string) => {
    if (type === 'video') return <VideoCameraOutlined style={{ fontSize: 14 }} />;
    if (type === 'image') return <PictureOutlined style={{ fontSize: 14 }} />;
    return <FileTextOutlined style={{ fontSize: 14 }} />;
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        top: 80,
        width: 380,
        maxHeight: 'calc(100vh - 140px)',
        background: 'rgba(18, 19, 21, 0.92)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 1000,
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 标题栏 */}
      <div style={{
        padding: '0 24px', height: 64, minHeight: 64,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <MessageCircle size={16} style={{ color: '#A2C1FF' }} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500 }}>创作日志</Text>
        </div>
        <Tooltip title="关闭">
          <div
            className="close-btn"
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
            onClick={() => setIsGenLogVisible(false)}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            <CloseOutlined />
          </div>
        </Tooltip>
      </div>

      {/* 日志内容 */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '16px 20px',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {logEntries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)' }}>
            暂无创作记录，开始生成后将在这里显示。
          </div>
        ) : (
          logEntries.map(node => (
            <div
              key={node.id}
              style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.06)',
                overflow: 'hidden',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              {/* 顶部：提示词 + 素材预览 */}
              <div style={{ padding: '16px 16px 12px 16px' }}>
                {/* 提示词 */}
                <div style={{
                  display: 'flex', gap: 8, alignItems: 'flex-start',
                  background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: '10px 14px',
                  marginBottom: node.taskData?.attached_url ? 12 : 0,
                }}>
                  <span style={{ fontSize: 16, lineHeight: '20px' }}>🎨</span>
                  <Text style={{
                    color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: '20px',
                    wordBreak: 'break-word',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {node.taskData?.prompt || '无提示词'}
                  </Text>
                </div>

                {/* 参考素材预览 */}
                {node.taskData?.attached_url && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '8px 12px',
                  }}>
                    <img
                      src={node.taskData.attached_url}
                      alt="参考素材"
                      style={{
                        width: 36, height: 36, borderRadius: 8, objectFit: 'cover',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, display: 'block' }}>参考素材</Text>
                    </div>
                  </div>
                )}
              </div>

              {/* 底部：模型/状态信息 */}
              <div style={{
                padding: '10px 16px',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'rgba(0,0,0,0.15)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {typeIcon(node.type)}
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                    {node.taskData?.model_name || '未知模型'}
                  </Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {statusIcon(node.status)}
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                    {statusLabel(node.status)}
                  </Text>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});

GenerationLogWidget.displayName = 'GenerationLogWidget';
export default GenerationLogWidget;
