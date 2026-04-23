/**
 * 左上角悬浮标头
 * 显示返回按钮（回到项目列表）和品牌标识
 */
import React from 'react';
import { Button, Tooltip } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usePlayground } from '../context/PlaygroundContext';

const FloatingHeader: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { saveCanvasState } = usePlayground();

  const handleBack = async () => {
    // 先保存画布状态再返回
    await saveCanvasState();
    navigate('/playground');
  };

  return (
    <div style={{
      position: 'absolute', top: 24, left: 24, zIndex: 1000,
      display: 'flex', alignItems: 'center',
      background: 'rgba(30, 31, 34, 0.6)', padding: 8, borderRadius: 32,
      border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
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
    </div>
  );
});

FloatingHeader.displayName = 'FloatingHeader';
export default FloatingHeader;
