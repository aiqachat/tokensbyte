/**
 * AI智能体模式对话面板
 * 渲染全屏的沉浸式对话流，内嵌视频、图片等节点结果。
 */
import React, { useRef, useEffect } from 'react';
import { Typography, Spin, Dropdown, message } from 'antd';
import { usePlayground, useCanvas } from '../context/PlaygroundContext';
import { useThemeStore } from '../../../store/theme';
import VideoNodeContent from './nodes/VideoNodeContent';
import ImageNodeContent from './nodes/ImageNodeContent';
import PromptInput from './PromptInput';

const { Title, Text } = Typography;

const AgentChatPanel: React.FC = React.memo(() => {
  const { 
    chatMessages, 
    setChatMessages,
    advancedNodesConfig, 
    setParamValues, 
    pageMode,
    setPageMode,
    models,
    agentCurrentModel,
    setAgentCurrentModel
  } = usePlayground();

  const { nodes } = useCanvas();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const bottomRef = useRef<HTMLDivElement>(null);

  const title = advancedNodesConfig?.agent_welcome_title || 'Start a conversation';
  const desc = advancedNodesConfig?.agent_welcome_desc || 'I can help you design, and optimise your creative workflow.';
  const presetPrompts = advancedNodesConfig?.agent_preset_prompts && Array.isArray(advancedNodesConfig.agent_preset_prompts)
    ? advancedNodesConfig.agent_preset_prompts
    : [
        { icon: '🖼️', text: 'Create a product shot & week of social content.' },
        { icon: '🎬', text: 'Write, voice, and storyboard a 30-second ad.' },
        { icon: '🎞️', text: 'Generate faceless YouTube, script to video.' }
      ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  // 获取允许智能体聊天的模型
  const chatModelIds = advancedNodesConfig?.agent_chat_models || [];
  const agentModels = models.filter(m => chatModelIds.includes(String(m.mid)));
  
  const displayedModelName = agentCurrentModel?.name || '选择对话模型';

  const menuItems = agentModels.map(m => ({
    key: m.mid,
    label: (
      <div style={{ fontSize: 13, padding: '4px 8px' }}>
        {m.name}
      </div>
    ),
  }));

  const menu = {
    items: menuItems.length > 0 ? menuItems : [{ key: 'none', label: <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>暂无可用模型</span> }],
    onClick: (info: any) => {
      const selected = models.find(m => m.mid === info.key);
      if (selected) {
        setAgentCurrentModel(selected);
        message.success(`已切换模型为: ${selected.name}`);
      }
    }
  };

  return (
    <div style={{
      width: 420, height: '100%',
      borderLeft: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
      display: 'flex', flexDirection: 'column',
      background: _isLight ? '#ffffff' : '#09090b',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.03)',
      position: 'relative',
      zIndex: 100,
    }}>
      {/* 顶部标题栏 */}
      <div style={{
        height: 56,
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
        background: 'transparent',
        flexShrink: 0,
      }}>
        {/* Left: Dropdown */}
        <Dropdown menu={menu} trigger={['click']}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: 8,
            background: _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
            border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            color: _isLight ? '#18181b' : '#f4f4f5',
            fontSize: 13,
            fontWeight: 500,
            transition: 'all 0.15s',
          }}>
            <span>{displayedModelName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </Dropdown>

        {/* Right: Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* New Chat icon */}
          <div
            onClick={() => {
              setChatMessages([]);
              message.success('已开始新会话');
            }}
            title="开启新对话"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              color: _isLight ? '#71717a' : '#a1a1aa',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#a1a1aa'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </div>

          {/* Close icon */}
          <div
            onClick={() => setPageMode('normal')}
            title="关闭智能体"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              color: _isLight ? '#71717a' : '#a1a1aa',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = _isLight ? '#000' : '#fff'; e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = _isLight ? '#71717a' : '#a1a1aa'; e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '24px 0 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ width: '100%', padding: '0 24px' }}>
          
          {chatMessages.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '60px 0 40px',
              color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
              {/* Glowing Orb */}
              <div style={{
                width: 90,
                height: 90,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #38bdf8, #6366f1, #ec4899)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'orbPulse 4s infinite ease-in-out',
                marginBottom: 28,
              }}>
                {/* Inner core */}
                <div style={{
                  width: 82,
                  height: 82,
                  borderRadius: '50%',
                  background: _isLight ? '#ffffff' : '#09090b',
                }} />
              </div>

              <style>{`
                @keyframes orbPulse {
                  0%, 100% {
                    transform: scale(1);
                    box-shadow: 
                      0 0 20px rgba(56, 189, 248, 0.4),
                      0 0 40px rgba(99, 102, 241, 0.3),
                      0 0 60px rgba(236, 72, 153, 0.2);
                  }
                  50% {
                    transform: scale(1.06);
                    box-shadow: 
                      0 0 30px rgba(56, 189, 248, 0.6),
                      0 0 50px rgba(168, 85, 247, 0.5),
                      0 0 80px rgba(236, 72, 153, 0.4);
                  }
                }
              `}</style>

              <div style={{ fontSize: 24, fontWeight: 600, color: _isLight ? '#18181b' : '#f4f4f5', marginBottom: 8, letterSpacing: '-0.5px' }}>
                {title}
              </div>
              <div style={{ fontSize: 13.5, color: _isLight ? '#71717a' : '#a1a1aa', maxWidth: 280, margin: '0 auto 36px', lineHeight: 1.5 }}>
                {desc}
              </div>
              
              {/* Preset suggestion cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
                {presetPrompts.map((p: any, i: number) => {
                  const renderIcon = () => {
                    if (i === 0) {
                      return (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ec4899' }}>
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                          <circle cx="8.5" cy="8.5" r="1.5"></circle>
                          <polyline points="21 15 16 10 5 21"></polyline>
                        </svg>
                      );
                    }
                    if (i === 1) {
                      return (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#eab308' }}>
                          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                          <line x1="7" y1="2" x2="7" y2="22"></line>
                          <line x1="17" y1="2" x2="17" y2="22"></line>
                          <line x1="2" y1="12" x2="22" y2="12"></line>
                          <line x1="2" y1="7" x2="7" y2="7"></line>
                          <line x1="2" y1="17" x2="7" y2="17"></line>
                          <line x1="17" y1="17" x2="22" y2="17"></line>
                          <line x1="17" y1="7" x2="22" y2="7"></line>
                        </svg>
                      );
                    }
                    return (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#3b82f6' }}>
                        <polygon points="23 7 16 12 23 17 23 7"></polygon>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                      </svg>
                    );
                  };

                  return (
                    <div
                      key={i}
                      onClick={() => {
                        const promptInput = document.getElementById('playground-prompt-input') as HTMLTextAreaElement;
                        if (promptInput) {
                          promptInput.value = p.text;
                          const event = new Event('input', { bubbles: true });
                          promptInput.dispatchEvent(event);
                        }
                      }}
                      style={{
                        padding: '12px 16px',
                        background: _isLight ? '#ffffff' : '#18181b',
                        border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a',
                        borderRadius: 16,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        transition: 'all 0.2s',
                        textAlign: 'left',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = _isLight ? '#f4f4f5' : '#27272a';
                        e.currentTarget.style.borderColor = _isLight ? '#d4d4d8' : '#3f3f46';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = _isLight ? '#ffffff' : '#18181b';
                        e.currentTarget.style.borderColor = _isLight ? '#e4e4e7' : '#27272a';
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                        flexShrink: 0,
                      }}>
                        {renderIcon()}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: _isLight ? '#3f3f46' : '#d4d4d8', lineHeight: '18px' }}>
                        {p.text}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {chatMessages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const node = msg.nodeId ? nodes.find((n: any) => n.id === msg.nodeId) : null;

            return (
              <div
                key={`${msg.timestamp}-${idx}`}
                style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  gap: 14,
                  marginBottom: 28,
                  alignItems: 'flex-start',
                }}
              >
                {/* Message Avatar */}
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isUser
                    ? (_isLight ? '#e4e4e7' : '#27272a')
                    : 'linear-gradient(135deg, #38bdf8, #6366f1, #ec4899)',
                  color: isUser ? (_isLight ? '#18181b' : '#f4f4f5') : '#fff', 
                  fontSize: 12,
                  fontWeight: 600,
                  border: isUser ? (_isLight ? '1px solid #d4d4d8' : '1px solid #3f3f46') : 'none',
                }}>
                  {isUser ? 'U' : 'AI'}
                </div>
                
                {/* Message Content */}
                <div style={{
                  maxWidth: 'calc(100% - 42px)',
                  minWidth: 40,
                  padding: isUser ? '10px 14px' : '2px 0 0 0',
                  background: isUser ? (_isLight ? '#f4f4f5' : '#18181b') : 'transparent',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '0',
                  border: isUser ? (_isLight ? '1px solid #e4e4e7' : '1px solid #27272a') : 'none',
                  color: _isLight ? '#18181b' : '#f4f4f5',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}>
                  {msg.content && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>}
                  
                  {/* 如果该消息关联了生成任务节点，内嵌渲染 */}
                  {node && (
                    <div style={{ 
                      marginTop: msg.content ? 12 : 0, 
                      width: '100%', height: 220, 
                      position: 'relative',
                      borderRadius: 12, overflow: 'hidden',
                      background: _isLight ? '#f4f4f5' : '#18181b',
                      border: _isLight ? '1px solid #e4e4e7' : '1px solid #27272a'
                    }}>
                      {node.status === 'loading' ? (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                          <Spin size="default" />
                          <div style={{ color: _isLight ? '#71717a' : '#a1a1aa', fontSize: 12 }}>
                            AI正在创作中...
                          </div>
                        </div>
                      ) : node.status === 'error' ? (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 13 }}>
                          生成失败
                        </div>
                      ) : (
                        node.type === 'video' ? (
                          <VideoNodeContent resultData={node.resultData} node={node} />
                        ) : node.type === 'image' ? (
                          <ImageNodeContent resultData={node.resultData} node={node} />
                        ) : (
                          <div style={{ padding: 16, fontSize: 13 }}>不支持渲染该类型</div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} style={{ height: 1 }} />
        </div>
      </div>
      
      {/* 底部内嵌输入框 */}
      <div style={{ padding: '0 16px 8px 16px', background: 'transparent', flexShrink: 0 }}>
        <PromptInput embedded={true} />
        {/* Beta Disclaimer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, fontSize: 10, color: _isLight ? '#a1a1aa' : '#52525b' }}>
          <span style={{ background: _isLight ? 'rgba(124, 58, 237, 0.08)' : 'rgba(124, 58, 237, 0.15)', color: _isLight ? '#7c3aed' : '#a78bfa', padding: '1px 4px', borderRadius: 4, fontWeight: 600, fontSize: 8 }}>Beta</span>
          <span>Agent can make mistakes. Check important info.</span>
        </div>
      </div>
    </div>
  );
});

AgentChatPanel.displayName = 'AgentChatPanel';
export default AgentChatPanel;
