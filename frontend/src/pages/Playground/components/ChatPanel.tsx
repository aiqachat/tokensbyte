/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 聊天对话面板 — 替代画布用于聊天类模型
 * 支持流式 SSE 输出、Markdown 渲染、代码高亮
 */
import React, { useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import { CopyOutlined, UserOutlined, RobotOutlined } from '@ant-design/icons';
import { Button, Tooltip, Grid } from 'antd';
import toast from './PlaygroundToast';
import { usePlayground } from '../context/PlaygroundContext';
import { useThemeStore } from '../../../store/theme';

const { useBreakpoint } = Grid;

const ChatPanel: React.FC = React.memo(() => {
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const { chatMessages, streamingContent, currentModel } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const bottomRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, streamingContent]);

  const copyText = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('已复制'),
      () => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success('已复制');
      }
    );
  }, []);

  const allMessages = [...chatMessages];
  // 如果正在流式输出，追加一个临时 assistant 消息
  if (streamingContent) {
    allMessages.push({ role: 'assistant', content: streamingContent, timestamp: Date.now() });
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: _isLight ? '#f8f9fa' : '#0d0d0d',
    }}>
      {/* 消息列表 */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '24px 0 200px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 760, padding: isMobile ? '0 12px' : '0 24px' }}>
          {allMessages.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '80px 20px',
              color: _isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.2)',
            }}>
              <RobotOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                {currentModel?.name || 'AI 对话'}
              </div>
              <div style={{ fontSize: 13 }}>输入消息开始对话</div>
            </div>
          )}

          {allMessages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isStreaming = streamingContent && idx === allMessages.length - 1 && !isUser;

            return (
              <div
                key={`${msg.timestamp}-${idx}`}
                style={{
                  display: 'flex',
                  flexDirection: isUser ? 'row-reverse' : 'row',
                  gap: 12,
                  marginBottom: isMobile ? 12 : 20,
                  alignItems: 'flex-start',
                }}
              >
                {/* 头像 */}
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isUser
                    ? 'linear-gradient(135deg, #667eea, #764ba2)'
                    : 'linear-gradient(135deg, #11998e, #38ef7d)',
                  color: '#fff', fontSize: 14,
                }}>
                  {isUser ? <UserOutlined /> : <RobotOutlined />}
                </div>

                {/* 消息气泡 */}
                <div style={{
                  maxWidth: isMobile ? '88%' : '80%', minWidth: 60,
                  padding: isUser ? '10px 16px' : '12px 18px',
                  borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: isUser
                    ? (_isLight ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'linear-gradient(135deg, #4a5568, #2d3748)')
                    : (_isLight ? '#fff' : '#1a1a2e'),
                  color: isUser ? '#fff' : (_isLight ? '#1f2937' : '#e2e8f0'),
                  boxShadow: _isLight
                    ? '0 1px 3px rgba(0,0,0,0.08)'
                    : '0 1px 3px rgba(0,0,0,0.3)',
                  border: isUser ? 'none' : (_isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)'),
                  position: 'relative',
                  fontSize: 14,
                  lineHeight: 1.7,
                  wordBreak: 'break-word',
                }}>
                  {isUser ? (
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  ) : (
                    <div className="chat-markdown">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          pre: ({ children, ...props }) => (
                            <div style={{ position: 'relative', margin: '8px 0' }}>
                              <pre {...props} style={{
                                background: _isLight ? '#1e1e2e' : '#0d1117',
                                borderRadius: 8, padding: '14px 16px',
                                overflow: 'auto', fontSize: 13,
                                border: _isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.08)',
                              }}>
                                {children}
                              </pre>
                              <Tooltip title="复制代码">
                                <Button
                                  type="text" size="small"
                                  icon={<CopyOutlined />}
                                  onClick={() => {
                                    const el = (children as any)?.props?.children;
                                    if (typeof el === 'string') copyText(el);
                                  }}
                                  style={{
                                    position: 'absolute', top: 6, right: 6,
                                    color: 'rgba(255,255,255,0.5)',
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: 6,
                                  }}
                                />
                              </Tooltip>
                            </div>
                          ),
                          code: ({ className, children, ...props }) => {
                            const isInline = !className;
                            if (isInline) {
                              return (
                                <code style={{
                                  background: _isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
                                  padding: '2px 6px', borderRadius: 4, fontSize: 13,
                                }} {...props}>{children}</code>
                              );
                            }
                            return <code className={className} {...props}>{children}</code>;
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      {isStreaming && (
                        <span className="chat-cursor" style={{
                          display: 'inline-block', width: 2, height: 18,
                          background: _isLight ? '#1677ff' : '#60a5fa',
                          marginLeft: 2, verticalAlign: 'text-bottom',
                          animation: 'chatBlink 1s infinite',
                        }} />
                      )}
                    </div>
                  )}

                  {/* 操作栏 */}
                  {!isUser && !isStreaming && (
                    <div style={{
                      display: 'flex', gap: 4, marginTop: 8,
                      opacity: 0.5, transition: 'opacity 0.2s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}
                    >
                      <Tooltip title="复制回复">
                        <Button type="text" size="small" icon={<CopyOutlined />}
                          onClick={() => copyText(msg.content)}
                          style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)' }}
                        />
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* 样式 */}
      <style>{`
        .chat-markdown p { margin: 0 0 8px; }
        .chat-markdown p:last-child { margin-bottom: 0; }
        .chat-markdown ul, .chat-markdown ol { margin: 4px 0; padding-left: 20px; }
        .chat-markdown li { margin: 2px 0; }
        .chat-markdown blockquote {
          border-left: 3px solid ${_isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'};
          margin: 8px 0; padding: 4px 12px;
          color: ${_isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'};
        }
        .chat-markdown table {
          border-collapse: collapse; margin: 8px 0; width: 100%;
        }
        .chat-markdown th, .chat-markdown td {
          border: 1px solid ${_isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'};
          padding: 6px 10px; text-align: left; font-size: 13px;
        }
        .chat-markdown th {
          background: ${_isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)'};
          font-weight: 600;
        }
        @keyframes chatBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
});

ChatPanel.displayName = 'ChatPanel';
export default ChatPanel;
