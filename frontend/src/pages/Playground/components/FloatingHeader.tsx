/**
 * 左上角悬浮标头
 * 显示返回按钮（回到项目列表）和创作日志按钮
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { usePlayground } from '../context/PlaygroundContext';

const FloatingHeader: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { saveCanvasState, isGenLogVisible, setIsGenLogVisible } = usePlayground();

  const handleBack = async () => {
    // 先保存画布状态再返回
    await saveCanvasState();
    navigate('/playground');
  };

  return (
    <div style={{
      position: 'absolute', top: 24, left: 24, zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 8,
      background: '#1e1f20', padding: 8, borderRadius: 32,
      border: '1px solid #444746', backdropFilter: 'blur(20px)',
      boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
    }} onWheel={(e) => e.stopPropagation()}>
      <Tooltip title="返回项目列表">
        <Button
          type="text" shape="circle" icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{
            width: 36, height: 36, color: 'rgba(255,255,255,0.7)',
            background: 'rgba(255,255,255,0.08)', border: 'none',
          }}
        />
      </Tooltip>
      <Tooltip title="创作日志">
        <Button
          type="text" shape="circle"
          icon={<MessageCircle size={16} />}
          onClick={() => setIsGenLogVisible(!isGenLogVisible)}
          style={{
            width: 36, height: 36,
            color: isGenLogVisible ? '#A8C7FA' : 'rgba(255,255,255,0.7)',
            background: isGenLogVisible ? 'rgba(168,199,250,0.12)' : 'rgba(255,255,255,0.08)',
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        />
      </Tooltip>
    </div>
  );
});

FloatingHeader.displayName = 'FloatingHeader';
export default FloatingHeader;
