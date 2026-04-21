/**
 * 底部悬浮提示词输入框
 * 包含 prompt 输入、API 密钥选择、生成按钮
 */
import React from 'react';
import { Input, Button, Tooltip } from 'antd';
import { KeyOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { usePlayground } from '../context/PlaygroundContext';
import { useGeneration } from '../hooks/useGeneration';
import { getCategoryLabel } from '../constants';

const { TextArea } = Input;

const PromptInput: React.FC = React.memo(() => {
  const {
    prompt, setPrompt,
    currentModel, activeCategory,
    selectedTokenKey, apiTokens,
    generating,
    setIsTokenModalVisible,
  } = usePlayground();
  const { handleGenerate } = useGeneration();

  return (
    <div style={{
      position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 48px)', maxWidth: 640,
      background: '#1A1B1E', borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      boxShadow: '0 24px 60px rgba(0,0,0,0.5)', zIndex: 1000
    }}>
      <TextArea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder={currentModel ? `描述你的${getCategoryLabel(activeCategory)}创意...` : '请先选择模型...'}
        autoSize={{ minRows: 3, maxRows: 8 }}
        bordered={false}
        style={{ color: '#E8EAED', resize: 'none', padding: '16px', fontSize: 15, lineHeight: '1.6', background: 'transparent' }}
        onKeyDown={(e) => { e.stopPropagation(); }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Tooltip title={selectedTokenKey ? "更换 API 密钥" : "选择 API 密钥"}>
            <div
              onClick={() => setIsTokenModalVisible(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px',
                background: selectedTokenKey ? 'rgba(255,255,255,0.05)' : 'rgba(255,100,100,0.1)',
                border: `1px solid ${selectedTokenKey ? 'rgba(255,255,255,0.12)' : 'rgba(255,100,100,0.3)'}`,
                borderRadius: 20, cursor: 'pointer', transition: 'all 0.2s',
                color: selectedTokenKey ? 'rgba(255,255,255,0.7)' : '#ff7875', fontSize: 13, fontWeight: 500
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = selectedTokenKey ? 'rgba(255,255,255,0.1)' : 'rgba(255,100,100,0.15)';
                e.currentTarget.style.color = selectedTokenKey ? '#fff' : '#ff7875';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = selectedTokenKey ? 'rgba(255,255,255,0.05)' : 'rgba(255,100,100,0.1)';
                e.currentTarget.style.color = selectedTokenKey ? 'rgba(255,255,255,0.7)' : '#ff7875';
              }}
            >
              <KeyOutlined style={{ fontSize: 14 }} />
              <span>
                {selectedTokenKey
                  ? (apiTokens.find(t => t.token_key === selectedTokenKey)?.name || 'Using Token')
                  : '未选择密钥'}
              </span>
            </div>
          </Tooltip>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="primary"
            disabled={!currentModel || !prompt.trim() || generating}
            loading={generating}
            onClick={handleGenerate}
            icon={generating ? undefined : <PlayCircleOutlined />}
            style={{
              height: 38, borderRadius: 19, padding: '0 20px', fontWeight: 500,
              background: currentModel && prompt.trim() && !generating ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(255,255,255,0.03)',
              color: currentModel && prompt.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
              border: 'none',
              boxShadow: currentModel && prompt.trim() && !generating ? '0 4px 15px rgba(102,126,234,0.4)' : 'none'
            }}
          >
            {generating ? '生成中...' : 'Run ⌘ ↵'}
          </Button>
        </div>
      </div>
    </div>
  );
});

PromptInput.displayName = 'PromptInput';
export default PromptInput;
