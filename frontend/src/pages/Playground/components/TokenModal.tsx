/**
 * API 密钥选择弹窗
 */
import React from 'react';
import { Modal, Button, Popconfirm } from 'antd';
import toast from './PlaygroundToast';
import { getSharedModalStyles } from '../utils/modalStyles';
import { CloseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usePlayground } from '../context/PlaygroundContext';
import { useThemeStore } from '../../../store/theme';
import request from '../../../utils/request';
import useSettingsStore from '../../../store/settings';
import { formatApiDateTime } from '../../../utils/timedisplay';

const TokenModal: React.FC = React.memo(() => {
  const {
    isTokenModalVisible, setIsTokenModalVisible,
    apiTokens, setApiTokens, selectedTokenKey, setSelectedTokenKey,
  } = usePlayground();
  const { themeMode } = useThemeStore();
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '¥';
  const _isLight = themeMode === 'light';
  const navigate = useNavigate();

  // 新建密钥表单状态
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [newName, setNewName] = React.useState('');
  const [isUnlimitedQuota, setIsUnlimitedQuota] = React.useState(true);
  const [quotaLimit, setQuotaLimit] = React.useState<number>(100);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (showCreateForm) {
      const randChars = Array.from({ length: 4 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
      setNewName(`arkpg ${randChars}`);
      setIsUnlimitedQuota(true);
      setQuotaLimit(100);
    }
  }, [showCreateForm]);

  const handleCreateToken = async () => {
    const tokenName = newName.trim();
    if (!tokenName) {
      toast.error('请输入密钥名称');
      return;
    }
    setCreating(true);
    try {
      const data = {
        name: tokenName,
        quota_limit: isUnlimitedQuota ? -1 : quotaLimit,
        only_playground: 1, // 标识仅在创作中心使用
        allowed_models: [],
      };
      
      const res = await (request as any).post('/tokens', data, { skipErrorHandler: true });
      toast.success('创建并关联成功');
      
      const tokensRes = await (request.get('/tokens') as Promise<any>);
      if (tokensRes?.data && Array.isArray(tokensRes.data)) {
        setApiTokens(tokensRes.data);
        
        // 自动选中新生成的 token
        const newCreatedToken = res?.data || tokensRes.data.find((t: any) => t.name === tokenName);
        if (newCreatedToken?.token_key) {
          setSelectedTokenKey(newCreatedToken.token_key);
          localStorage.setItem('playground_saved_token', newCreatedToken.token_key);
        } else if (tokensRes.data.length > 0) {
          setSelectedTokenKey(tokensRes.data[0].token_key);
          localStorage.setItem('playground_saved_token', tokensRes.data[0].token_key);
        }
      }
      
      setShowCreateForm(false);
      setIsTokenModalVisible(false);
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error?.message || e?.message || '创建令牌失败';
      toast.error(serverMsg);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteToken = async (id: number) => {
    try {
      await request.delete(`/tokens/${id}`);
      toast.success('删除密钥成功');
      
      const tokensRes = await (request.get('/tokens') as Promise<any>);
      if (tokensRes?.data && Array.isArray(tokensRes.data)) {
        setApiTokens(tokensRes.data);
        
        const deletedToken = apiTokens.find(t => t.id === id);
        if (deletedToken && selectedTokenKey === deletedToken.token_key) {
          setSelectedTokenKey('');
          localStorage.removeItem('playground_saved_token');
        }
      }
    } catch (e: any) {
      const serverMsg = e?.response?.data?.error?.message || e?.message || '删除令牌失败';
      toast.error(serverMsg);
    }
  };

  // 渲染令牌操作（已被选中的展示打勾，未选中的展示删除按钮）
  const renderTokenAction = (t: any) => {
    if (selectedTokenKey === t.token_key) {
      return <CheckCircleOutlined style={{ color: _isLight ? '#1677ff' : '#fff', fontSize: 16 }} />;
    }
    return (
      <Popconfirm
        title="确认删除密钥"
        description={`您确定要删除密钥“${t.name}”吗？此操作不可逆。`}
        onConfirm={() => handleDeleteToken(t.id)}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
          style={{
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            borderRadius: 4,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ff4d4f';
            e.currentTarget.style.background = _isLight ? 'rgba(255, 77, 79, 0.08)' : 'rgba(255, 77, 79, 0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </div>
      </Popconfirm>
    );
  };

  return (
    <Modal
      style={{ top: isMobile ? 60 : undefined, margin: isMobile ? '0 auto' : undefined }}
      title={null}
      open={isTokenModalVisible}
      onCancel={() => {
        setIsTokenModalVisible(false);
        setShowCreateForm(false);
      }}
      footer={null}
      width={isMobile ? '95%' : 660}
      {...getSharedModalStyles(_isLight)}
      styles={{
        ...getSharedModalStyles(_isLight).styles,
        body: { padding: isMobile ? '16px 12px' : '24px' },
      }}
      closeIcon={<CloseOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }} />}
    >
      <div style={{ display: 'flex', justifyContent: apiTokens.length === 0 ? 'center' : 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0 }}>
        <h2 style={{ fontSize: 20, margin: 0, color: _isLight ? '#1f2937' : '#E8EAED', fontWeight: 600 }}>使用创作中心请关联API密钥令牌</h2>
        {apiTokens.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button 
              onClick={() => {
                setShowCreateForm(!showCreateForm);
              }}
              style={{
                background: _isLight ? '#f0f0f0' : '#E8EAED', color: '#000', border: 'none', borderRadius: 6, fontWeight: 500, padding: '4px 16px', height: 32
              }}
            >
              {showCreateForm ? '取消创建' : '创建令牌'}
            </Button>
            <Button 
              onClick={() => {
                setIsTokenModalVisible(false);
                navigate('/tokens');
              }}
              style={{
                background: _isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                color: _isLight ? '#555' : '#E8EAED',
                border: 'none',
                borderRadius: 6,
                fontWeight: 500,
                padding: '4px 16px',
                height: 32
              }}
            >
              令牌管理
            </Button>
          </div>
        )}
      </div>

      <div style={{
        background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
        border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 8,
        padding: isMobile ? '12px' : '16px',
        display: 'flex',
        gap: 12,
        marginBottom: 24
      }}>
        <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)', marginTop: 2 }}>
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <div>
          <div style={{ color: _isLight ? '#1f2937' : '#E8EAED', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>保护好您的密钥，请不要泄露。专用密钥只能在创作中心内发起请求时使用。</div>
        </div>
      </div>


      <div style={{ maxHeight: 400, overflowY: 'auto' }}>
        {!isMobile && (
          <div style={{ display: 'grid', gridTemplateColumns: '3.4fr 1.1fr 1.4fr 1.4fr 36px', padding: '0 16px 12px 16px', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13, alignItems: 'center' }}>
            <div>密钥信息 <span style={{ fontSize: 12, opacity: 0.6, marginLeft: 8 }}>(点击选择)</span></div>
            <div>可用额度</div>
            <div>创建时间</div>
            <div>上次使用时间</div>
            <div></div>
          </div>
        )}

        {apiTokens.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: 16 }}>
            <span style={{ fontSize: 14, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>暂无可用的接口密钥</span>
            <Button 
              onClick={() => {
                setShowCreateForm(!showCreateForm);
              }}
              style={{
                background: _isLight ? '#f0f0f0' : '#E8EAED', color: '#000', border: 'none', borderRadius: 6, fontWeight: 500, padding: '4px 16px', height: 32
              }}
            >
              {showCreateForm ? '取消创建' : '创建令牌'}
            </Button>
          </div>
        ) : (
          <div style={{ border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' }}>
            {apiTokens.map((t, index) => {
              const createdStr = t.created_at ? formatApiDateTime(t.created_at, 'YYYY-MM-DD HH:mm') : '-';
              const usedStr = t.last_used_at ? formatApiDateTime(t.last_used_at, 'YYYY-MM-DD HH:mm') : '从未';
              const head = t.token_key.substring(0, 8);
              const tail = t.token_key.substring(t.token_key.length - 6);
              const maskedKey = `${head}......${tail}`;

              const limit = t.quota_limit;
              const used = t.quota_used || 0;
              let quotaText = '';
              let isQuotaExceeded = false;
              if (limit < 0) {
                quotaText = '不限额度';
              } else {
                const remain = Math.max(0, limit - used);
                const formatNumber = (num: number) => num % 1 === 0 ? num.toString() : num.toFixed(2);
                quotaText = `${formatNumber(remain)} / ${formatNumber(limit)}`;
                if (remain <= 0) isQuotaExceeded = true;
              }

              return (
                <div
                  key={t.token_key}
                  onClick={(e) => {
                    // 阻止来自 Portal (如 Popconfirm 弹出层) 的 React 合成事件冒泡触发选中
                    if (!e.currentTarget.contains(e.target as Node)) {
                      return;
                    }
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
                    display: isMobile ? 'flex' : 'grid',
                    flexDirection: isMobile ? 'column' : undefined,
                    gridTemplateColumns: isMobile ? 'none' : '3.4fr 1.1fr 1.4fr 1.4fr 36px',
                    gap: isMobile ? 8 : 0,
                    alignItems: isMobile ? 'stretch' : 'center',
                    padding: isMobile ? '12px' : '16px',
                    background: selectedTokenKey === t.token_key ? (_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)') : 'transparent',
                    borderBottom: index < apiTokens.length - 1 ? (_isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)') : 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedTokenKey !== t.token_key) e.currentTarget.style.background = _isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
                  }}
                  onMouseLeave={(e) => {
                    if (selectedTokenKey !== t.token_key) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: _isLight ? '#1f2937' : '#E8EAED', fontSize: 13 }}>{t.name}</span>
                        {t.only_playground === 1 && (
                          <span style={{ 
                            fontSize: 10, 
                            padding: '1px 6px', 
                            borderRadius: 4, 
                            background: _isLight ? 'rgba(22, 119, 255, 0.08)' : 'rgba(22, 119, 255, 0.15)', 
                            color: '#1677ff',
                            fontWeight: 500,
                            border: '1px solid rgba(22, 119, 255, 0.25)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0
                          }}>
                            仅创作中心
                          </span>
                        )}
                      </div>
                      
                      {isMobile && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>
                          {renderTokenAction(t)}
                        </div>
                      )}
                    </div>
                    <span style={{ fontFamily: 'monospace', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {maskedKey}
                    </span>
                  </div>
                  
                  {isMobile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>可用额度</span>
                        <span style={{ color: isQuotaExceeded ? '#ff4d4f' : (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'), fontWeight: 500 }}>{quotaText}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>创建时间</span>
                        <span style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>{createdStr}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>上次使用</span>
                        <span style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>{usedStr}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ color: isQuotaExceeded ? '#ff4d4f' : (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)'), fontSize: 14, fontWeight: 500 }}>
                        {quotaText}
                      </div>
                      <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 14 }}>{createdStr}</div>
                      <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 14 }}>{usedStr}</div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>
                        {renderTokenAction(t)}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateForm && (
        <div style={{
          background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
          border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '12px 16px',
          marginTop: 16,
          animation: 'fadeIn 0.3s ease'
        }}>
          <div style={{ display: 'flex', gap: 16, alignItems: isMobile ? 'stretch' : 'flex-end', flexDirection: isMobile ? 'column' : 'row' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 4 }}>密钥名称</div>
              <input
                type="text"
                placeholder="请输入密钥名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{
                  width: '100%',
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 6,
                  border: _isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.15)',
                  backgroundColor: _isLight ? '#fff' : '#2A2B2D',
                  color: _isLight ? '#000' : '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontSize: 13
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', flex: '0 0 auto' }}>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 4 }}>额度配置</div>
              <div style={{ display: 'flex', alignItems: 'center', height: 32, gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: _isLight ? '#1f2937' : '#E8EAED', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={isUnlimitedQuota}
                    onChange={(e) => setIsUnlimitedQuota(e.target.checked)}
                    style={{ width: 15, height: 15, cursor: 'pointer', margin: 0 }}
                  />
                  <span>无限额度</span>
                </label>

                {!isUnlimitedQuota && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.85)' }}>限制 ({currencySymbol})</span>
                    <input
                      type="number"
                      min={1}
                      value={quotaLimit}
                      onChange={(e) => setQuotaLimit(Math.max(1, Number(e.target.value)))}
                      style={{
                        width: 80,
                        height: 32,
                        padding: '0 8px',
                        borderRadius: 6,
                        border: _isLight ? '1px solid rgba(0,0,0,0.15)' : '1px solid rgba(255,255,255,0.15)',
                        backgroundColor: _isLight ? '#fff' : '#2A2B2D',
                        color: _isLight ? '#000' : '#fff',
                        outline: 'none',
                        boxSizing: 'border-box',
                        fontSize: 13
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            <Button
              onClick={handleCreateToken}
              loading={creating}
              disabled={creating}
              style={{
                borderRadius: 6,
                height: 32,
                padding: '0 16px',
                fontSize: 13,
                background: '#1677ff',
                color: '#fff',
                border: 'none',
                flex: '0 0 auto'
              }}
            >
              确认创建并关联
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
});

TokenModal.displayName = 'TokenModal';
export default TokenModal;
