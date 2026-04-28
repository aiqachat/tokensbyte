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
      title="关联付费 API 密钥"
      open={isTokenModalVisible}
      onCancel={() => setIsTokenModalVisible(false)}
      footer={null}
      width={480}
      styles={{
        body: { backgroundColor: '#1E1F22', border: '1px solid rgba(255,255,255,0.08)', padding: 0 },
        header: { backgroundColor: '#1E1F22', borderBottom: '1px solid rgba(255,255,255,0.08)' }
      }}
      closeIcon={<CloseOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />}
    >
      <div style={{ maxHeight: 400, overflowY: 'auto', padding: '12px 0' }}>
        {apiTokens.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: 'rgba(255,255,255,0.45)', 
            padding: '40px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20
          }}>
            <span style={{ fontSize: 14 }}>暂无可用的接口密钥，请先在「接口令牌」页创建</span>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => {
                setIsTokenModalVisible(false);
                navigate('/tokens');
              }}
              style={{
                borderRadius: 8,
                height: 40,
                background: 'linear-gradient(135deg, #1677ff 0%, #003eb3 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(22,119,255,0.3)',
                fontWeight: 500,
                padding: '0 24px'
              }}
            >
              去创建接口令牌
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {apiTokens.map(t => (
              <div
                key={t.token_key}
                onClick={() => {
                  setSelectedTokenKey(t.token_key);
                  localStorage.setItem('playground_saved_token', t.token_key);
                  setIsTokenModalVisible(false);
                }}
                style={{
                  padding: '16px', borderRadius: 8,
                  background: selectedTokenKey === t.token_key ? 'rgba(22,119,255,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${selectedTokenKey === t.token_key ? '#1677ff' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer', transition: 'all 0.3s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 500, color: '#E8EAED', fontSize: 15, marginBottom: 4 }}>{t.name}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>
                      {t.token_key.substring(0, 12)}...{t.token_key.substring(t.token_key.length - 6)}
                    </span>
                  </div>
                  {selectedTokenKey === t.token_key && (
                    <CheckCircleOutlined style={{ color: '#1677ff', fontSize: 18 }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
});

TokenModal.displayName = 'TokenModal';
export default TokenModal;
