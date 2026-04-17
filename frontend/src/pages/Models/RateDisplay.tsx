import React from 'react';
import { Space, Tag, Typography } from 'antd';

const { Text } = Typography;

// 子规则名称映射
const RULE_LABELS: Record<string, string> = {
  standard: '标准计费',
  tiered: '阶梯计费',
  volcengine: '火山多模态特供',
  fixed: '固定按次',
  per_image: '按张收费',
  image_resolution: '按分辨率收费',
  video_resolution: '按分辨率阶梯',
};

interface BillingRuleInfo {
  name: string;
  billing_type: string;
  billing_rule: string;
  prompt_rate: number;
  completion_rate: number;
  fixed_rate: number;
  duration_rate: number;
  extended_config: string;
}

interface RateDisplayProps {
  rule: BillingRuleInfo;
  currencySymbol: string;
}

/**
 * 统一费率展示组件：计费名 → 子规则标签 → 费率明细
 * 用于 Models 列表和 BillingRules 列表
 */
const RateDisplay: React.FC<RateDisplayProps> = ({ rule, currencySymbol }) => {
  const ruleLabel = RULE_LABELS[rule.billing_rule] || rule.billing_rule;
  const s = { fontSize: '12px' } as const;

  // 解析 extended_config
  let ext: Record<string, any> = {};
  try { if (rule.extended_config) ext = JSON.parse(rule.extended_config); } catch {}

  const renderDetails = () => {
    if (rule.billing_type === 'tokens') {
      if (rule.billing_rule === 'tiered') {
        return <Text type="warning" style={s}>阶梯定价 (见配置详情)</Text>;
      }
      if (rule.billing_rule === 'volcengine') {
        const lines: React.ReactNode[] = [];
        if (ext.volc_video_enabled) lines.push(<Text key="v" type="secondary" style={s}>含视频: {currencySymbol}{ext.volc_video_rate}/1M</Text>);
        if (ext.volc_audio_enabled) lines.push(<Text key="a" type="secondary" style={s}>含音频: {currencySymbol}{ext.volc_audio_rate}/1M</Text>);
        if (ext.volc_base_enabled)  lines.push(<Text key="b" type="secondary" style={s}>纯文本: {currencySymbol}{ext.volc_base_rate}/1M</Text>);
        if (lines.length === 0) lines.push(<Text key="d" type="secondary" style={s}>P: {currencySymbol}{rule.prompt_rate}/1M C: {currencySymbol}{rule.completion_rate}/1M</Text>);
        return <>{lines}</>;
      }
      // standard
      return (
        <>
          <Text type="secondary" style={s}>P: {currencySymbol}{rule.prompt_rate}/1M</Text>
          <Text type="secondary" style={s}>C: {currencySymbol}{rule.completion_rate}/1M</Text>
        </>
      );
    }

    if (rule.billing_type === 'requests') {
      if (rule.billing_rule === 'image_resolution') return <Text type="warning" style={s}>按分辨率张收费 (见配置)</Text>;
      if (rule.billing_rule === 'per_image') return <Text type="secondary" style={s}>{currencySymbol}{rule.fixed_rate} / 张</Text>;
      return <Text type="secondary" style={s}>{currencySymbol}{rule.fixed_rate} / 请求</Text>;
    }

    // duration
    if (rule.billing_rule === 'video_resolution') return <Text type="warning" style={s}>按视频分辨率阶梯 (见配置)</Text>;
    return <Text type="secondary" style={s}>{currencySymbol}{rule.duration_rate}/s</Text>;
  };

  const ruleColors: Record<string, string> = {
    standard: 'default', tiered: 'gold', volcengine: 'volcano',
    fixed: 'default', per_image: 'lime', image_resolution: 'gold',
    video_resolution: 'gold',
  };

  return (
    <Space direction="vertical" size={0}>
      <Tag color={ruleColors[rule.billing_rule] || 'default'} style={{ fontSize: '11px', lineHeight: '18px' }}>{ruleLabel}</Tag>
      {renderDetails()}
    </Space>
  );
};

export default RateDisplay;
