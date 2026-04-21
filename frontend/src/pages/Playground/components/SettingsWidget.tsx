/**
 * 悬浮参数设置面板 (可拖拽、可折叠)
 * 包含类别切换、模型选择、参数面板、我的素材入口
 */
import React from 'react';
import { Typography, Button, Tooltip, message } from 'antd';
import { FolderOpenOutlined, DownOutlined } from '@ant-design/icons';
import { useCanvas } from '../context/PlaygroundContext';
import { usePlayground } from '../context/PlaygroundContext';
import { getCategoryIcon } from '../constants';
import ParamControl from './ParamControl';

const { Text } = Typography;

const SettingsWidget: React.FC = React.memo(() => {
  const {
    isSettingsDragging, setIsSettingsDragging,
    settingsWidgetPos, setDragStartPos,
  } = useCanvas();
  const {
    isSettingsCollapsed, setIsSettingsCollapsed,
    categories, activeCategory, handleCategoryChange,
    currentModel, setIsModelDrawerVisible,
  } = usePlayground();

  return (
    <div style={{
      position: 'absolute',
      left: settingsWidgetPos.x,
      top: settingsWidgetPos.y,
      width: 360,
      background: 'rgba(18, 19, 21, 0.85)',
      borderRadius: 24,
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      zIndex: 1000,
      transition: isSettingsDragging ? 'none' : 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      height: isSettingsCollapsed ? 64 : Math.min(800, window.innerHeight - settingsWidgetPos.y - 24)
    }}>
      {/* 拖拽标题栏 */}
      <div
        onMouseDown={(e) => {
          setIsSettingsDragging(true);
          setDragStartPos({ x: e.clientX, y: e.clientY });
        }}
        onDoubleClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
        style={{
          padding: '0 24px', height: 64, minHeight: 64,
          borderBottom: isSettingsCollapsed ? 'none' : '1px solid rgba(255,255,255,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: isSettingsDragging ? 'grabbing' : 'grab',
          background: 'rgba(255,255,255,0.02)'
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Tooltip title="双击标题栏折叠/展开">
            <div
              style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56', cursor: 'pointer', transition: 'transform 0.2s' }}
              onClick={() => setIsSettingsCollapsed(!isSettingsCollapsed)}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            />
          </Tooltip>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 500, userSelect: 'none' }}>创作中心层</Text>
        </div>
        <Tooltip title="我的素材">
          <Button
            type="text" shape="circle" icon={<FolderOpenOutlined />}
            onClick={() => message.info('即将开放：此处将用于保存和管理每次生成后的视频及图片素材。')}
            style={{ color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.05)' }}
          />
        </Tooltip>
      </div>

      {/* 可折叠内容区域 */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        padding: '24px', gap: 24,
        opacity: isSettingsCollapsed ? 0 : 1,
        transition: 'opacity 0.3s ease',
        pointerEvents: isSettingsCollapsed ? 'none' : 'auto'
      }}>
        {/* 类别切换器 */}
        <div style={{ display: 'flex', gap: 4, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 16 }}>
          {categories.map(cat => {
            const isActive = activeCategory === cat;
            return (
              <div
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                style={{
                  flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 12, cursor: 'pointer',
                  background: isActive ? '#A2C1FF' : 'transparent',
                  color: isActive ? '#000' : 'rgba(255,255,255,0.6)',
                  fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                }}
              >
                {getCategoryIcon(cat, isActive)}
              </div>
            );
          })}
        </div>

        {/* 模型选择卡片 */}
        <div>
          <div
            onClick={() => setIsModelDrawerVisible(true)}
            className="studio-model-card"
            style={{
              background: '#202124', borderRadius: 16, padding: '16px',
              border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              transition: 'all 0.2s ease', position: 'relative'
            }}
          >
            <div style={{ color: '#E8eaed', fontSize: 17, fontWeight: 500, marginBottom: 8, paddingRight: 24 }}>
              {currentModel?.name || '选择模型...'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {currentModel?.scheme_name
                ? `${currentModel.scheme_name} · ${currentModel.model_id}`
                : '选择适合的生成模型来处理你的工作流需求。'}
            </div>
            <div style={{ position: 'absolute', right: 16, top: 16, color: 'rgba(255,255,255,0.4)' }}><DownOutlined /></div>
          </div>
        </div>

        {/* 动态参数面板 */}
        {currentModel?.params && currentModel.params.length > 0 && (
          currentModel.params.map(param => <ParamControl key={param.key} param={param} />)
        )}

        {currentModel && (!currentModel.params || currentModel.params.length === 0) && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>该模型未绑定体验方案，无可配置参数</Text>
          </div>
        )}

        {!currentModel && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>请先选择一个模型</Text>
          </div>
        )}
      </div>
    </div>
  );
});

SettingsWidget.displayName = 'SettingsWidget';
export default SettingsWidget;
