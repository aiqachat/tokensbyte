/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 🤖 Agent 智能体节点
 * 从 CanvasNode.tsx 提取的独立组件
 */
import React from 'react';
import toast from '../PlaygroundToast';
import NodeShell from './shared/NodeShell';
import {
  selectStyle,
  formColStyle,
  formRowStyle,
  formLabelStyle,
  textareaStyle,
  handleInputFocus,
  handleInputBlur,
  primaryButtonStyle,
  handleButtonMouseEnter,
  handleButtonMouseLeave
} from './shared/nodeStyles';
import type { AdvancedNodeProps } from './shared/types';

const AgentNode: React.FC<AdvancedNodeProps> = ({
  node, isLight, onRemove, updateNodeTaskData,
}) => {
  const agentName = node.taskData?.agent_name || '创意写作助手';
  const temperature = node.taskData?.temperature !== undefined ? node.taskData.temperature : 0.7;
  const prompt = node.taskData?.prompt || '';

  return (
    <NodeShell
      icon="🤖"
      title="Agent 智能体"
      badge="Plugin"
      badgeColor="#1890ff"
      onClose={() => onRemove(node.id)}
      isLight={isLight}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, flex: 1, minHeight: 0 }}>
        <div style={formRowStyle(isLight)}>
          <span style={formLabelStyle(isLight)}>智能体角色:</span>
          <select
            value={agentName}
            onChange={(e) => updateNodeTaskData({ agent_name: e.target.value })}
            style={{ ...selectStyle(isLight), width: '130px' }}
          >
            <option value="创意写作助手">创意写作助手</option>
            <option value="客服助手">客服助手</option>
            <option value="代码助手">代码助手</option>
            <option value="翻译专家">翻译专家</option>
          </select>
        </div>

        <div style={formRowStyle(isLight)}>
          <span style={formLabelStyle(isLight)}>温度限制:</span>
          <select
            value={temperature}
            onChange={(e) => updateNodeTaskData({ temperature: parseFloat(e.target.value) })}
            style={{ ...selectStyle(isLight), width: '130px' }}
          >
            <option value="0.2">0.2 (保守/精确)</option>
            <option value="0.7">0.7 (平衡/推荐)</option>
            <option value="1.0">1.0 (创造/发散)</option>
          </select>
        </div>

        <div style={formColStyle(isLight)}>
          <span style={formLabelStyle(isLight)}>输入消息:</span>
          <textarea
            value={prompt}
            onChange={(e) => updateNodeTaskData({ prompt: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="给智能体发送消息..."
            style={{
              ...textareaStyle(isLight),
              height: '60px',
            }}
            onFocus={handleInputFocus}
            onBlur={(e) => handleInputBlur(e, isLight)}
          />
        </div>

        <button
          onClick={() => {
            toast.success(`智能体[${agentName}]已开始处理！\n温度: ${temperature}\n消息: ${prompt || '(无)'}`);
          }}
          style={{
            ...primaryButtonStyle(isLight),
            marginTop: 4,
          }}
          onMouseEnter={(e) => handleButtonMouseEnter(e, false)}
          onMouseLeave={(e) => handleButtonMouseLeave(e, false)}
        >
          立即执行
        </button>
      </div>
    </NodeShell>
  );
};

AgentNode.displayName = 'AgentNode';
export default React.memo(AgentNode);
