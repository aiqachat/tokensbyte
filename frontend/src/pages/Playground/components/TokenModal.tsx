/**
 * API 密钥选择弹窗
 */
import React from 'react';
import { Modal, Button } from 'antd';
import { CloseOutlined, CheckCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usePlayground } from '../context/PlaygroundContext';

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
      styles={{
        body: { backgroundColor: '#1E1F22', padding: '24px 32px' },
      }}
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
          <div style={{ color: '#E8EAED', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>已开启滥用行为自动检测功能</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
            为了保护您的安全，我们会自动停用所有已遭公开泄露的 API 密钥，以防止滥用。 <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>了解详情</span>.
          </div>
        </div>
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 40px', padding: '0 16px 12px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
          <div>API 密钥</div>
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
              // 简化的格式化逻辑，如果缺少字段则显示默认值
              const createdStr = t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Apr 26, 2026';
              const usedStr = t.last_used_at ? new Date(t.last_used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '从未';
              const maskedKey = `...${t.token_key.substring(t.token_key.length - 11)}`;

              return (
                <div
                  key={t.token_key}
                  onClick={() => {
                    setSelectedTokenKey(t.token_key);
                    localStorage.setItem('playground_saved_token', t.token_key);
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
