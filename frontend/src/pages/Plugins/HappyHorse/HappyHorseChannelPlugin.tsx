/**
 * Plugin: happyhorse_router — 快乐小马智能路由渠道集成组件
 *
 * 此文件为插件专属模块，可随插件目录整体移除。
 * Channels.tsx 通过动态加载（import()）引用此组件，删除后自动降级为常规模式。
 */
import React from 'react';
import { Select, Tag, Typography, Tooltip, Segmented, Form } from 'antd';
import { ThunderboltOutlined, ArrowRightOutlined, CopyOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

export interface HappyHorseConfig {
  id: number;
  custom_model_name: string;
  custom_model_id: string;
  t2v_model: string;
  i2v_model: string;
  r2v_model: string;
  edit_model: string;
  routing_node: string;
  is_active: number;
}

/** 模式标签常量 */
const MODE_LABELS: Record<string, string> = {
  t2v_model: '文生视频 (Text-to-Video)',
  i2v_model: '图生视频 (Image-to-Video)',
  r2v_model: '参考生视频 (Reference-to-Video)',
  edit_model: '视频编辑 (Video Edit)',
};

/** 路由模式切换 Segmented + 节点选择器 */
export const HappyHorseRouteConfig: React.FC<{
  enabled: boolean;
  isRouting: boolean;
  configs: HappyHorseConfig[];
  selectedNode: string | null;
  onSwitchMode: (val: string) => void;
  onSelectNode: (val: string) => void;
  isLight: boolean;
}> = ({ enabled, isRouting, configs, selectedNode, onSwitchMode, onSelectNode, isLight }) => {
  if (!enabled) return null;
  const activeConfigs = configs.filter(c => c.is_active === 1);
  return (
    <>
      <div style={{ marginBottom: 4 }}>
        <Segmented
          block
          value={isRouting ? 'happyhorse' : 'standard'}
          onChange={(val) => onSwitchMode(val as string)}
          options={[
            { label: '常规模型范围', value: 'standard' },
            { label: '快乐小马智能路由', value: 'happyhorse' },
          ]}
        />
      </div>
      {isRouting && (
        <Form.Item
          label={<Text strong style={{ fontSize: 12, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>选择智能路由推理节点</Text>}
          style={{ marginBottom: 8 }}
        >
          <Select
            placeholder={activeConfigs.length === 0 ? '暂无可用的推理节点配置' : '请选择配置的智能路由推理节点'}
            value={selectedNode || undefined}
            onChange={onSelectNode}
            size="large"
            disabled={activeConfigs.length === 0}
            notFoundContent="暂无已启用的推理节点，请先在插件设置中添加配置"
          >
            {activeConfigs.map(c => (
              <Select.Option key={c.id} value={c.routing_node}>
                {c.custom_model_name} ({c.routing_node})
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      )}
    </>
  );
};

/** 左侧信息卡片：已启用智能路由 */
export const HappyHorseStatusCard: React.FC<{
  activeConfig: HappyHorseConfig | null;
  selectedNode: string | null;
  isLight: boolean;
  onClick?: () => void;
}> = ({ activeConfig, selectedNode, isLight, onClick }) => (
  <div
    style={{
      padding: '12px 16px', borderRadius: 8,
      border: isLight ? '1px solid #d9d9d9' : '1px solid rgba(255,255,255,0.12)',
      background: isLight ? '#fafafa' : 'rgba(255,255,255,0.02)',
      cursor: 'pointer', transition: 'all 0.2s',
    }}
    onClick={onClick}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ThunderboltOutlined style={{ color: isLight ? '#595959' : '#d9d9d9', fontSize: 16 }} />
        <Text strong style={{ color: isLight ? '#262626' : '#fff' }}>已启用快乐小马智能路由</Text>
      </div>
      <span style={{ fontSize: 12, color: isLight ? '#595959' : '#d9d9d9' }}>
        配置详情 <ArrowRightOutlined style={{ marginLeft: 4 }} />
      </span>
    </div>
    <div style={{
      marginTop: 8, padding: '6px 8px',
      background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.08)',
      borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: isLight ? '#262626' : '#fff' }}>
        {activeConfig?.custom_model_name || '快乐小马智能路由'}
      </span>
      <span style={{ fontSize: 11, color: '#8c8c8c', opacity: 0.8 }}>
        节点: {selectedNode || '未选择'}
      </span>
    </div>
  </div>
);

/** 右侧详情面板：智能路由配置详情 + 用户接入指引 */
export const HappyHorseDetailPanel: React.FC<{
  activeConfig: HappyHorseConfig | null;
  selectedNode: string | null;
  isLight: boolean;
}> = ({ activeConfig, selectedNode, isLight }) => {
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => import('antd').then(({ message }) => message.success('已复制到剪贴板')),
      () => {}
    );
  };
  const modelId = activeConfig?.custom_model_id || '';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '40px 24px', textAlign: 'center', minHeight: 400,
    }}>
      <ThunderboltOutlined style={{ fontSize: 48, color: isLight ? '#595959' : '#d9d9d9', marginBottom: 16 }} />
      <Title level={4} style={{ margin: 0, color: isLight ? '#262626' : '#fff' }}>快乐小马智能路由已启用</Title>
      <Text type="secondary" style={{ marginTop: 12, maxWidth: 400, display: 'inline-block' }}>
        当前渠道已绑定智能路由节点 <Text code>{selectedNode || '未选择'}</Text>。
        智能路由将根据配置规则，自动在以下视频模型中进行智能分发路由：
      </Text>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 400 }}>
        {(['t2v_model', 'i2v_model', 'r2v_model', 'edit_model'] as const).map(key => (
          <div key={key} style={{
            padding: '8px 16px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: isLight ? '#f9fafb' : 'rgba(255,255,255,0.02)',
            border: isLight ? '1px solid #e5e4e7' : '1px solid rgba(255,255,255,0.08)',
          }}>
            <Text>{MODE_LABELS[key]}</Text>
            <Tag color="default">{activeConfig?.[key] || '未绑定'}</Tag>
          </div>
        ))}
      </div>

      {modelId && (
        <div style={{
          marginTop: 32, padding: '16px 20px', borderRadius: 8, width: '100%', maxWidth: 400,
          background: isLight ? 'rgba(22,119,255,0.04)' : 'rgba(22,119,255,0.08)',
          border: '1px solid rgba(22,119,255,0.15)',
        }}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>📋 用户接入指引</Text>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            用户在 API 请求中使用以下 model 值即可自动接入智能路由：
          </Text>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px', borderRadius: 6,
            background: isLight ? '#fff' : 'rgba(0,0,0,0.2)',
            border: isLight ? '1px solid #d9d9d9' : '1px solid rgba(255,255,255,0.12)',
          }}>
            <Text code style={{ fontSize: 14 }}>{modelId}</Text>
            <Tooltip title="复制模型 ID">
              <CopyOutlined
                style={{ cursor: 'pointer', color: '#1677ff', fontSize: 14 }}
                onClick={() => handleCopy(modelId)}
              />
            </Tooltip>
          </div>
        </div>
      )}

      <Text type="secondary" style={{ marginTop: 24, fontSize: 12 }}>
        若需切换回普通模型选择，请在左侧的"路由与范围配置"切换为"常规模型范围"。
      </Text>
    </div>
  );
};

/**
 * 获取快乐小马模式下的别名映射模型列表
 * 返回4个视频模型 ID 及其对应的模式标签，供别名映射面板使用
 */
export function getHappyHorseMappingModels(activeConfig: HappyHorseConfig | null): Array<{ modelId: string; label: string }> {
  if (!activeConfig) return [];
  return [
    { modelId: activeConfig.t2v_model, label: '文生视频' },
    { modelId: activeConfig.i2v_model, label: '图生视频' },
    { modelId: activeConfig.r2v_model, label: '参考生视频' },
    { modelId: activeConfig.edit_model, label: '视频编辑' },
  ].filter(m => m.modelId);
}
