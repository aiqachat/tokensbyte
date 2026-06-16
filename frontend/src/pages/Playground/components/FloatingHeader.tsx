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
import { useThemeStore } from '../../../store/theme';

const FloatingHeader: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const { saveCanvasState, isGenLogVisible, setIsGenLogVisible } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';

  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleBack = async () => {
    // 先保存画布状态再返回
    await saveCanvasState();
    navigate('/playground');
  };

  return (
    <div style={{
      position: 'absolute', top: isMobile ? 12 : 24, left: isMobile ? 12 : 24, zIndex: 2005,
      display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 8,
      background: _isLight ? 'rgba(255,255,255,0.85)' : '#1e1f20', padding: isMobile ? 6 : 8, borderRadius: 32,
      border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid #444746', backdropFilter: 'blur(20px)',
      boxShadow: _isLight ? '0 4px 12px rgba(0,0,0,0.08)' : '0 4px 6px rgba(0,0,0,0.3)'
    }} onWheel={(e) => e.stopPropagation()}>
      <Tooltip title="返回项目列表">
        <Button
          type="text" shape="circle" icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{
            width: 36, height: 36, color: _isLight ? '#1f2937' : 'rgba(255,255,255,0.7)',
            background: _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)', border: 'none',
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
            color: isGenLogVisible ? '#1677ff' : (_isLight ? '#1f2937' : 'rgba(255,255,255,0.7)'),
            background: isGenLogVisible ? (_isLight ? 'rgba(22,119,255,0.1)' : 'rgba(168,199,250,0.12)') : (_isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)'),
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
