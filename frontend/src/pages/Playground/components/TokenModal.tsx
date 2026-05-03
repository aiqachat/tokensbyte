/**
 * API 密钥选择弹窗
 */
import React from 'react';
import { Modal, Button } from 'antd';
import { CloseOutlined, CheckCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usePlayground } from '../context/PlaygroundContext';
import dayjs from 'dayjs';

const TokenModal: React.FC = React.memo(() => {
  const {
    isTokenModalVisible, setIsTokenModalVisible,
    apiTokens, selectedTokenKey, setSelectedTokenKey,
  } = usePlayground();
  const navigate = useNavigate();

  return (
    <Modal
      title={null}
      open={isTokenModalVisible}
      onCancel={() => setIsTokenModalVisible(false)}
      footer={null}
      width={720}
      styles={({
        mask: { backgroundColor: 'rgba(0, 0, 0, 0.45)' },
        body: { padding: '32px' },
        content: { 
          backgroundColor: 'rgba(28, 29, 31, 0.65)', 
          backdropFilter: 'blur(32px) saturate(150%)', 
          WebkitBackdropFilter: 'blur(32px) saturate(150%)',
          borderRadius: 20, 
          padding: 0, 
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)'
        },
      }) as any}
      closeIcon={<CloseOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, margin: 0, color: '#E8EAED', fontWeight: 600 }}>关联API密钥</h2>
        <Button 
          onClick={() => {
            setIsTokenModalVisible(false);
            navigate('/tokens');
          }}
          style={{
            background: '#E8EAED', color: '#000', border: 'none', borderRadius: 6, fontWeight: 500, padding: '4px 16px', height: 32
          }}
        >
          创建密钥
        </Button>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: '16px',
        display: 'flex',
        gap: 12,
        marginBottom: 24
      }}>
        <div style={{ color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div>
          <div style={{ color: '#E8EAED', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>保护好您的密钥，请不要泄露</div>
        </div>
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', padding: '0 16px 12px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 13, alignItems: 'center' }}>
          <div>API 密钥 <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>(点击已选密钥可取消选择)</span></div>
          <div>创建时间</div>
          <div>上次使用时间</div>
          <div></div>
        </div>

        {apiTokens.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.45)', padding: '40px 20px' }}>
            <span style={{ fontSize: 14 }}>暂无可用的接口密钥</span>
          </div>
        ) : (
          <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
            {apiTokens.map((t, index) => {
              // 使用数字格式日期时间
              const createdStr = t.created_at ? dayjs(t.created_at).format('YYYY-MM-DD HH:mm:ss') : '-';
              const usedStr = t.last_used_at ? dayjs(t.last_used_at).format('YYYY-MM-DD HH:mm:ss') : '从未';
              // API 密码显示头尾中间省略号
              const head = t.token_key.substring(0, 8);
              const tail = t.token_key.substring(t.token_key.length - 6);
              const maskedKey = `${head}......${tail}`;

              return (
                <div
                  key={t.token_key}
                  onClick={() => {
                    if (selectedTokenKey === t.token_key) {
                      setSelectedTokenKey('');
                      localStorage.removeItem('playground_saved_token');
                    } else {
                      setSelectedTokenKey(t.token_key);
                      localStorage.setItem('playground_saved_token', t.token_key);
                    }
                    setIsTokenModalVisible(false);
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 40px',
                    alignItems: 'center',
                    padding: '16px',
                    background: selectedTokenKey === t.token_key ? 'rgba(255,255,255,0.06)' : 'transparent',
                    borderBottom: index < apiTokens.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedTokenKey !== t.token_key) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (selectedTokenKey !== t.token_key) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ fontFamily: 'monospace', color: '#E8EAED', fontSize: 14 }}>
                    {maskedKey}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>{createdStr}</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>{usedStr}</div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', color: 'rgba(255,255,255,0.45)' }}>
                    {selectedTokenKey === t.token_key ? (
                      <CheckCircleOutlined style={{ color: '#fff', fontSize: 16 }} />
                    ) : (
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'not-allowed' }}>
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
});

TokenModal.displayName = 'TokenModal';
export default TokenModal;
