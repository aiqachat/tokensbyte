import React, { useState, useEffect } from 'react';
import { Typography, Button, Spin, App, Alert } from 'antd';
import { SaveOutlined, CheckCircleFilled, LayoutOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import { useThemeStore } from '../../../store/theme';

const { Text, Title } = Typography;

interface StyleOption {
  key: string;
  name: string;
  desc: string;
  layoutName: string;
  primaryColor: string;
  secondaryColor: string;
  gradientColors: string[];
  features: string[];
}

const stylesList: StyleOption[] = [
  {
    key: 'classic',
    name: '经典科技风格',
    layoutName: '通栏导航 + 居中粒子首屏',
    desc: '最成熟沉稳的云服务商传统门户。以居中的科技粒子流（Canvas）背景为特色，提供平滑圆润的现代感与标准的三栏/四栏网格信息流，排版均衡大方。',
    primaryColor: '#6366f1',
    secondaryColor: '#4f46e5',
    gradientColors: ['#4f46e5', '#6366f1', '#3b82f6'],
    features: ['粒子星空背景', '经典居中Hero布局', '一键复制API端点框', '多列功能与指标网格'],
  },
  {
    key: 'tech',
    name: '科技极客终端',
    layoutName: '等宽分栏 + 命令行控制台',
    desc: '面向开发者与技术极客的“代码优先”排版。采用无渐变的点阵网格线，移除多余圆角，全站呈现硬朗的 1px 细框线拼接；首屏左侧为左对齐命令行指令，右侧为一个可交互的代码控制台 Widget。',
    primaryColor: '#06b6d4',
    secondaryColor: '#0891b2',
    gradientColors: ['#0891b2', '#06b6d4', '#10b981'],
    features: ['等宽Monospace字体', '左右分栏极客排版', '可交互代码终端 Widget', '网格点阵背景与硬朗线条'],
  },
  {
    key: 'dark_gradient',
    name: '星空流光 SaaS',
    layoutName: '悬浮胶囊导航 + 3D 立体卡片墙',
    desc: '比肩苹果与主流前沿 SaaS 官网的次世代炫彩体验。导航栏重塑为悬浮在屏幕上方的毛玻璃“胶囊”；Hero 区域采用超大霓虹流光渐变文本和星云漩涡；下方是由大模型服务商 Logo 组成的 3D 立体悬浮卡片墙。',
    primaryColor: '#ec4899',
    secondaryColor: '#d946ef',
    gradientColors: ['#8b5cf6', '#d946ef', '#ec4899'],
    features: ['悬浮毛玻璃胶囊 Header', '超大渐变流光文字 & 霓虹渐变边框', '3D 错落立体悬浮卡片墙', '呼吸感背景光晕效果'],
  },
];

const PortalStyleSelection: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const { message } = App.useApp();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState('classic');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/plugins/site-portal/portal-config') as Promise<any>);
      if (res.style_config && res.style_config.current_style) {
        setSelectedStyle(res.style_config.current_style);
      }
    } catch (e) {
      message.error('加载风格配置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await request.post('/plugins/site-portal/portal-config', {
        section: 'style',
        data: { current_style: selectedStyle },
      });
      message.success('风格配置保存成功');
    } catch (e) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // Render a mini mock layout preview depending on the theme style key
  const renderMiniPreview = (styleKey: string, isSelected: boolean) => {
    const primary = _isLight ? '#09090b' : '#fafafa';
    const border = _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
    const textBar = _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
    const textBarActive = _isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';

    if (styleKey === 'classic') {
      return (
        <div style={{
          width: '100%',
          height: 110,
          background: _isLight ? '#f4f4f5' : '#18181b',
          borderRadius: 6,
          padding: 8,
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${border}`
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 10, borderBottom: `1px solid ${border}`, paddingBottom: 4, marginBottom: 14 }}>
            <div style={{ width: 14, height: 4, background: primary, borderRadius: 1 }} />
            <div style={{ display: 'flex', gap: 3 }}>
              <div style={{ width: 10, height: 3, background: textBar }} />
              <div style={{ width: 10, height: 3, background: textBar }} />
              <div style={{ width: 10, height: 3, background: textBar }} />
            </div>
            <div style={{ width: 12, height: 5, background: primary, borderRadius: 2 }} />
          </div>
          {/* Hero Content */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ width: '60%', height: 6, background: primary, margin: '0 auto 4px', borderRadius: 1 }} />
            <div style={{ width: '40%', height: 3, background: textBarActive, margin: '0 auto 6px', borderRadius: 1 }} />
            {/* Input Box */}
            <div style={{ width: '35%', height: 8, border: `1px solid ${border}`, background: _isLight ? '#fff' : '#09090b', borderRadius: 99, margin: '0 auto' }} />
          </div>
          {/* Grid cards */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
            <div style={{ width: '22%', height: 26, background: _isLight ? '#fff' : '#09090b', border: `1px solid ${border}`, borderRadius: 4 }} />
            <div style={{ width: '22%', height: 26, background: _isLight ? '#fff' : '#09090b', border: `1px solid ${border}`, borderRadius: 4 }} />
            <div style={{ width: '22%', height: 26, background: _isLight ? '#fff' : '#09090b', border: `1px solid ${border}`, borderRadius: 4 }} />
          </div>
        </div>
      );
    } else if (styleKey === 'tech') {
      return (
        <div style={{
          width: '100%',
          height: 110,
          background: _isLight ? '#f4f4f5' : '#18181b',
          borderRadius: 4,
          padding: 8,
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${border}`,
          fontFamily: 'monospace'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 8, borderBottom: `1px solid ${primary}`, paddingBottom: 4, marginBottom: 14 }}>
            <div style={{ width: 16, height: 3, background: primary }} />
            <div style={{ width: 14, height: 4, border: `1px solid ${primary}` }} />
          </div>
          {/* Split Hero */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {/* Left Texts */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}>
              <div style={{ width: '90%', height: 3, background: primary }} />
              <div style={{ width: '75%', height: 3, background: primary }} />
              <div style={{ width: '50%', height: 2, background: textBarActive }} />
              <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                <div style={{ width: 12, height: 5, border: `1px solid ${primary}` }} />
                <div style={{ width: 12, height: 5, border: `1px solid ${primary}` }} />
              </div>
            </div>
            {/* Right Terminal Widget */}
            <div style={{
              width: '45%',
              height: 38,
              background: '#09090b',
              border: `1px solid ${primary}`,
              borderRadius: 2,
              padding: 3,
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}>
              <div style={{ display: 'flex', gap: 1.5 }}>
                <div style={{ width: 2, height: 2, borderRadius: '50%', background: '#ff5f56' }} />
                <div style={{ width: 2, height: 2, borderRadius: '50%', background: '#ffbd2e' }} />
                <div style={{ width: 2, height: 2, borderRadius: '50%', background: '#27c93f' }} />
              </div>
              <div style={{ width: '80%', height: 2, background: '#06b6d4', opacity: 0.8 }} />
              <div style={{ width: '60%', height: 2, background: '#10b981', opacity: 0.6 }} />
              <div style={{ width: '40%', height: 2, background: 'rgba(255,255,255,0.2)' }} />
            </div>
          </div>
          {/* Grid (hard border) */}
          <div style={{ display: 'flex', gap: 3 }}>
            <div style={{ flex: 1, height: 16, border: `1px solid ${primary}` }} />
            <div style={{ flex: 1, height: 16, border: `1px solid ${primary}` }} />
            <div style={{ flex: 1, height: 16, border: `1px solid ${primary}` }} />
          </div>
        </div>
      );
    } else {
      // dark_gradient (SaaS)
      return (
        <div style={{
          width: '100%',
          height: 110,
          background: _isLight ? '#f4f4f5' : '#18181b',
          borderRadius: 6,
          padding: 8,
          position: 'relative',
          overflow: 'hidden',
          border: `1px solid ${border}`,
        }}>
          {/* Cosmic Blur Background in Mini layout */}
          <div style={{
            position: 'absolute',
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(236,72,153,0.25) 0%, rgba(139,92,246,0.1) 70%)',
            top: 20,
            left: 50,
            filter: 'blur(8px)',
            pointerEvents: 'none'
          }} />
          {/* Capsule Header */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <div style={{
              width: '60%',
              height: 12,
              background: _isLight ? 'rgba(255,255,255,0.8)' : 'rgba(9,9,11,0.6)',
              backdropFilter: 'blur(4px)',
              borderRadius: 99,
              border: `1px solid ${border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 6px'
            }}>
              <div style={{ width: 8, height: 3, background: primary, borderRadius: 1 }} />
              <div style={{ width: 24, height: 2, background: textBar }} />
              <div style={{ width: 10, height: 4, background: '#ec4899', borderRadius: 99 }} />
            </div>
          </div>
          {/* Glowing Text Hero */}
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{
              width: '70%',
              height: 6,
              background: 'linear-gradient(90deg, #ec4899, #8b5cf6, #3b82f6)',
              margin: '0 auto 4px',
              borderRadius: 1
            }} />
            <div style={{ width: '45%', height: 3, background: textBarActive, margin: '0 auto', borderRadius: 1 }} />
          </div>
          {/* 3D Stack Cards Mock */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', height: 36 }}>
            {/* Card Left */}
            <div style={{
              width: 28,
              height: 28,
              background: _isLight ? '#fff' : '#09090b',
              border: `1px solid ${border}`,
              borderRadius: 4,
              position: 'absolute',
              transform: 'translateX(-16px) rotate(-8deg) scale(0.9)',
              opacity: 0.6,
              zIndex: 1
            }} />
            {/* Card Right */}
            <div style={{
              width: 28,
              height: 28,
              background: _isLight ? '#fff' : '#09090b',
              border: `1px solid ${border}`,
              borderRadius: 4,
              position: 'absolute',
              transform: 'translateX(16px) rotate(8deg) scale(0.9)',
              opacity: 0.6,
              zIndex: 1
            }} />
            {/* Card Center */}
            <div style={{
              width: 32,
              height: 32,
              background: _isLight ? 'rgba(255,255,255,0.95)' : 'rgba(20,20,20,0.85)',
              backdropFilter: 'blur(4px)',
              border: `1px solid #ec4899`,
              borderRadius: 6,
              boxShadow: '0 4px 10px rgba(236,72,153,0.2)',
              position: 'absolute',
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: 10 }}>✨</span>
            </div>
          </div>
        </div>
      );
    }
  };

  const cardStyle = (isSelected: boolean) => ({
    background: _isLight ? '#fff' : '#09090b',
    borderRadius: 8,
    border: isSelected
      ? `1.5px solid ${_isLight ? '#09090b' : '#fafafa'}`
      : `1px solid ${_isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
    padding: '20px',
    cursor: 'pointer',
    position: 'relative' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: isSelected
      ? (_isLight ? '0 10px 20px rgba(0,0,0,0.04)' : '0 10px 20px rgba(255,255,255,0.02)')
      : 'none',
    transform: isSelected ? 'translateY(-2px)' : 'none',
  });

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header section with Shadcn theme style */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LayoutOutlined style={{ fontSize: 20, color: _isLight ? '#09090b' : '#fafafa' }} />
          <div>
            <Title level={5} style={{ margin: 0, color: _isLight ? '#09090b' : '#fafafa', fontWeight: 600 }}>门户排版风格选择</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>选择完全不同的首页和模型列表页排版布局</Text>
          </div>
        </div>
        
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saving}
          onClick={handleSave}
          style={{
            background: _isLight ? '#09090b' : '#fafafa',
            borderColor: _isLight ? '#09090b' : '#fafafa',
            color: _isLight ? '#fff' : '#09090b',
            borderRadius: 6,
            fontWeight: 500,
            fontSize: 13,
            boxShadow: 'none',
            height: 36
          }}
        >
          保存配置
        </Button>
      </div>

      <Alert
        type="info"
        showIcon
        message={<Text style={{ fontWeight: 500, fontSize: 13.5, color: '#27272a' }}>更新提示</Text>}
        description={
          <span style={{ fontSize: 13, color: '#71717a' }}>
            修改风格并保存后，由于门户使用静态生成以获取最佳 SEO 体验，您需要前往
            <strong style={{ margin: '0 4px', color: _isLight ? '#09090b' : '#fafafa' }}>「门户管理 -&gt; 静态生成」</strong>
            重新生成全站 HTML 页面，样式与排版更改才会正式发布生效。
          </span>
        }
        style={{
          marginBottom: 24,
          borderRadius: 6,
          border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
          background: _isLight ? '#f4f4f5' : '#18181b'
        }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 20, marginBottom: 24 }}>
        {stylesList.map((style) => {
          const isSelected = selectedStyle === style.key;
          return (
            <div
              key={style.key}
              style={cardStyle(isSelected)}
              onClick={() => setSelectedStyle(style.key)}
            >
              {/* Check indicator */}
              {isSelected && (
                <CheckCircleFilled
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    color: _isLight ? '#09090b' : '#fafafa',
                    fontSize: 18,
                    zIndex: 10
                  }}
                />
              )}

              {/* Layout Preview component */}
              {renderMiniPreview(style.key, isSelected)}

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Title level={5} style={{ marginTop: 0, marginBottom: 0, fontSize: 15, fontWeight: 600, color: _isLight ? '#09090b' : '#f9fafb' }}>
                    {style.name}
                  </Title>
                </div>
                <Text style={{ fontSize: 11.5, background: _isLight ? '#e4e4e7' : '#27272a', padding: '2px 6px', borderRadius: 4, color: _isLight ? '#3f3f46' : '#a1a1aa', display: 'inline-block', marginBottom: 10 }}>
                  {style.layoutName}
                </Text>
                
                <Text type="secondary" style={{ fontSize: 12.5, display: 'block', lineHeight: 1.5, minHeight: 72 }}>
                  {style.desc}
                </Text>
              </div>

              {/* Layout Features Tags */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6, borderTop: `1px solid ${_isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}`, paddingTop: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: _isLight ? '#71717a' : '#a1a1aa' }}>排版特色</Text>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {style.features.map((feat, idx) => (
                    <span key={idx} style={{
                      fontSize: 10.5,
                      padding: '2px 8px',
                      background: _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${_isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}`,
                      borderRadius: 4,
                      color: _isLight ? '#52525b' : '#d4d4d8'
                    }}>
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PortalStyleSelection;
