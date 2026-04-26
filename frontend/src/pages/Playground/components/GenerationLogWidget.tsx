/**
 * 创作日志面板 (Generation Log Widget)
 * 
 * 展示当前选中画布节点的创作详情：
 * - 使用的提示词
 * - 附带的参考素材
 * - 使用的模型名称
 * - 生成状态与类型
 * 
 * 点击画布上的节点时自动弹出，展示该节点的创作信息
 */
import React, { useMemo } from 'react';
import { Typography, Tooltip, Tag } from 'antd';
import {
  CloseOutlined, PictureOutlined,
  VideoCameraOutlined, CheckCircleOutlined, LoadingOutlined,
  CloseCircleOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { MessageCircle } from 'lucide-react';
import { useCanvas, usePlayground } from '../context/PlaygroundContext';

const { Text } = Typography;

const GenerationLogWidget: React.FC = React.memo(() => {
  const { nodes, selectedNodeId, setSelectedNodeId } = useCanvas();
  const { isGenLogVisible, setIsGenLogVisible } = usePlayground();

  // 找到当前选中的节点
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [nodes, selectedNodeId]);

  if (!isGenLogVisible || !selectedNode) return null;

  const statusInfo = () => {
    if (selectedNode.status === 'completed') return { icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />, label: '生成完成', color: '#52c41a' };
    if (selectedNode.status === 'loading') return { icon: <LoadingOutlined style={{ color: '#A2C1FF' }} />, label: '正在生成...', color: '#A2C1FF' };
    return { icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />, label: '生成失败', color: '#ff4d4f' };
  };

  const status = statusInfo();

  const typeLabel = selectedNode.type === 'video' ? 'AI 视频' : selectedNode.type === 'image' ? 'AI 图像' : '文本生成';
  const typeIcon = selectedNode.type === 'video'
    ? <VideoCameraOutlined style={{ fontSize: 16, color: '#A2C1FF' }} />
    : selectedNode.type === 'image'
    ? <PictureOutlined style={{ fontSize: 16, color: '#A2C1FF' }} />
    : <FileTextOutlined style={{ fontSize: 16, color: '#A2C1FF' }} />;

  const handleClose = () => {
    setIsGenLogVisible(false);
    setSelectedNodeId(null);
  };


  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        top: 80,
        width: 380,
        background: 'rgba(18, 19, 21, 0.92)',
        borderRadius: 24,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(24px)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        zIndex: 1000,
        maxHeight: 'calc(100vh - 140px)',
      }}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* 标题栏 */}
      <div style={{
        padding: '0 24px', height: 56, minHeight: 56,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(255,255,255,0.02)',
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <MessageCircle size={16} style={{ color: '#A2C1FF' }} />
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500 }}>创作日志</Text>
        </div>
        <Tooltip title="关闭">
          <div
            style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
            onClick={handleClose}
            onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
          >
            <CloseOutlined />
          </div>
        </Tooltip>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

        {/* 提示词区块 */}
        <div style={{
          background: 'rgba(0,0,0,0.3)', borderRadius: 14, padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, lineHeight: '22px', flexShrink: 0 }}>🎨</span>
            <Text style={{
              color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: '22px',
              wordBreak: 'break-word',
            }}>
              {selectedNode.taskData?.prompt || '无提示词'}
            </Text>
          </div>
        </div>

        {/* 参考素材区块 */}
        {(selectedNode.taskData?.attached_urls?.length > 0 || selectedNode.taskData?.attached_url) && (
          <div style={{
            background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: '12px 14px',
            marginBottom: 16,
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 10 }}>参考素材</Text>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {selectedNode.taskData?.attached_urls ? (
                selectedNode.taskData.attached_urls.map((url: string, i: number) => (
                  <img
                    key={i}
                    src={url}
                    alt={`参考素材 ${i + 1}`}
                    style={{
                      width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  />
                ))
              ) : (
                <img
                  src={selectedNode.taskData.attached_url}
                  alt="参考素材"
                  style={{
                    width: 56, height: 56, borderRadius: 10, objectFit: 'cover',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
              )}
            </div>
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 10, display: 'block' }}>
              已作为生成模型的输入参考
            </Text>
          </div>
        )}

        {/* 模型信息卡 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px 16px',
          border: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {typeIcon}
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>{typeLabel}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {status.icon}
              <Text style={{ color: status.color, fontSize: 12, fontWeight: 500 }}>{status.label}</Text>
            </div>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 0 10px 0' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>模型</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 500 }}>
                {selectedNode.taskData?.model_name || '未知'}
              </Text>
            </div>
            {selectedNode.taskData?.model_id && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Model ID</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'monospace' }}>
                  {selectedNode.taskData.model_id}
                </Text>
              </div>
            )}
            {selectedNode.taskData?.created_at && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>创建时间</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                  {new Date(selectedNode.taskData.created_at).toLocaleString('zh-CN', { hour12: false })}
                </Text>
              </div>
            )}
          </div>
        </div>


        {/* 失败信息 */}
        {selectedNode.status === 'error' && selectedNode.resultData?.message && (
          <div style={{
            background: 'rgba(255,77,79,0.08)', borderRadius: 12, padding: '12px 14px',
            border: '1px solid rgba(255,77,79,0.2)',
          }}>
            <Text style={{ color: '#ff4d4f', fontSize: 13 }}>
              ❌ {selectedNode.resultData.message}
            </Text>
          </div>
        )}
      </div>
    </div>
  );
});

GenerationLogWidget.displayName = 'GenerationLogWidget';
export default GenerationLogWidget;
