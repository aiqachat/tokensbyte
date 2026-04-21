/**
 * 左上角悬浮标头
 * 显示"创作中心"品牌标识和返回按钮
 */
import React from 'react';
import { Typography, Button } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title } = Typography;

const FloatingHeader: React.FC = React.memo(() => {
  const navigate = useNavigate();

  return (
    <div style={{
      position: 'absolute', top: 24, left: 24, zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 16,
      background: 'rgba(30, 31, 34, 0.6)', padding: '8px 24px 8px 8px', borderRadius: 32,
      border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
    }}>
      <Button
        type="primary" shape="circle" icon={<CloseOutlined />}
        onClick={() => { window.close(); navigate('/'); }}
        style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.1)', border: 'none' }}
      />
      <Title level={5} style={{ margin: 0, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '1px' }}>
        创作中心
      </Title>
    </div>
  );
});

FloatingHeader.displayName = 'FloatingHeader';
export default FloatingHeader;
