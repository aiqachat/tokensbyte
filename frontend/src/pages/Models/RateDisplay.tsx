/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { Space, Tag, Typography, Tooltip } from 'antd';

const { Text } = Typography;

// 子规则名称映射
const RULE_LABELS: Record<string, string> = {
  standard: '标准计费',
  multimodal: '多模态计费',
  gpt_billing: 'GPT官方计费',
  tiered: '阶梯计费',
  doubao_chat: '豆包聊天阶梯',
  volcengine: '火山多模态(旧)',
  'seedance2.0': 'Seedance 2.0',
  'seedance1.5pro': 'Seedance 1.5 Pro',
  'seedance1.0': 'Seedance 1.0',
  volc_seedream_pro: '火山 Seedream Pro',
  fixed: '固定按次',
  per_image: '按张收费',
  image_resolution: '按分辨率K',
  image_size_pixel: '按分辨率像素',
  video_resolution: '按分辨率阶梯',
  video_quality: '按画质帧率阶梯',
  kling_video: '可灵视频',
  vidu_video: 'Vidu 视频',
  vidu_image: 'Vidu 图片',
  characters: '按字符计费',
  volc_enhance_cascade: '火山级联增强',
};

interface BillingRuleInfo {
  name: string;
  billing_type: string;
  billing_rule: string;
  prompt_rate: number;
  completion_rate: number;
  cached_rate?: number;
  claude_cache_creation_rate?: number;
  claude_cache_read_rate?: number;
  fixed_rate: number;
  duration_rate: number;
  extended_config: string;
  pricing_tiers?: string;
}

interface RateDisplayProps {
  rule: BillingRuleInfo;
  currencySymbol: string;
  formatPrice?: (price: number | string | undefined | null) => string;
  siteDiscount?: number;
  siteDiscountEnabled?: number | boolean;
}

/**
 * 统一费率展示组件：计费名 → 子规则标签 → 费率明细
 * 用于 Models 列表和 BillingRules 列表
 */
const RateDisplay: React.FC<RateDisplayProps> = ({ rule, currencySymbol, formatPrice, siteDiscount, siteDiscountEnabled }) => {
  const siteDiscountActive = !!(siteDiscountEnabled && siteDiscount && siteDiscount > 0 && siteDiscount < 1);
  const fp = (val: number | string | undefined | null) => {
    if (val === undefined || val === null || val === '') return '-';
    let origStr = formatPrice ? formatPrice(val) : `${currencySymbol}${val}`;
    if (siteDiscountActive) {
      const num = Number(val);
      if (!isNaN(num)) {
         const dNum = num * siteDiscount!;
         const dStr = formatPrice ? formatPrice(Number.parseFloat(dNum.toFixed(6))) : `${currencySymbol}${Number.parseFloat(dNum.toFixed(6))}`;
         return <><Text delete type="secondary" style={{ fontSize: 'inherit', opacity: 0.65 }}>{origStr}</Text> <Text type="danger" style={{ fontSize: 'inherit', fontWeight: 500 }}>{dStr}</Text></>;
      }
    }
    return origStr;
  };
  const ruleLabel = RULE_LABELS[rule.billing_rule] || rule.billing_rule;
  const s = { fontSize: '11px', lineHeight: 1.2 } as const;

  const discountTag = siteDiscountActive 
    ? <Tag color="error" bordered={false} style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '14px', marginLeft: 6 }}>{Number.parseFloat((siteDiscount! * 10).toFixed(2))}折</Tag> 
    : null;

  // 解析 extended_config
  let ext: Record<string, any> = {};
  try { if (rule.extended_config) ext = JSON.parse(rule.extended_config); } catch { }

  // 统一解析 pricing_tiers 数组
  const tiers = (() => {
    try {
      if (rule.pricing_tiers) {
        const parsed = JSON.parse(rule.pricing_tiers);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  })();

  // 查表类计费摘要（vidu_image / vidu_video 共用）
  const renderPriceTableSummary = (unit: string, extra?: React.ReactNode) => {
    const pt = ext.price_table || {};
    const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
    const activeValues = Object.entries(pt).filter(([k]) => !disabledKeys.includes(k)).map(([, v]) => v as number).filter(v => typeof v === 'number');
    if (activeValues.length > 0) {
      const min = Math.min(...activeValues);
      const max = Math.max(...activeValues);
      return (
        <Space direction="vertical" size={0}>
          <Text type="secondary" style={s}>查表: {fp(min)}~{fp(max)}/{unit} (属性×分辨率)</Text>
          {extra}
        </Space>
      );
    }
    return <Text type="secondary" style={s}>查表 (无有效条目)</Text>;
  };

  const renderDetails = () => {
    if (rule.billing_type === 'tokens') {
      if (rule.billing_rule === 'tiered') {
        if (tiers.length === 0) return <Text type="secondary" style={s}>阶梯定价 (无配置)</Text>;
        
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {tiers.map((t, idx) => (
              <Text key={idx} type="secondary" style={s}>
                {t.max_prompt_tokens ? `≤${t.max_prompt_tokens}k` : '无限制'} 输 | {t.max_completion_tokens ? `≤${t.max_completion_tokens}k` : '无限制'} 出 : P: {fp(t.prompt_rate)}/1M C: {fp(t.completion_rate)}/1M {t.cached_rate ? `Cache: ${fp(t.cached_rate)}/1M` : ''}
              </Text>
            ))}
          </div>
        );
      }
      if (rule.billing_rule === 'doubao_chat') {
        if (tiers.length === 0) return <Text type="secondary" style={s}>豆包聊天阶梯 (无配置)</Text>;
        const hasFast = tiers.some((t: any) => t.fast_prompt_rate > 0 || t.fast_completion_rate > 0);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {tiers.map((t: any, idx: number) => {
              const range = t.max_prompt_tokens ? `≤${t.max_prompt_tokens}k` : '无限制';
              let line = `${range} | P:${fp(t.prompt_rate)}/1M C:${fp(t.completion_rate)}/1M`;
              if (t.audio_prompt_rate > 0) line += ` 音P:${fp(t.audio_prompt_rate)}/1M`;
              if (t.cached_rate > 0) line += ` 缓存:${fp(t.cached_rate)}/1M`;
              if (t.audio_cached_rate > 0) line += ` 音缓:${fp(t.audio_cached_rate)}/1M`;
              if (hasFast) {
                line += ` | 快P:${fp(t.fast_prompt_rate || t.prompt_rate)}/1M 快C:${fp(t.fast_completion_rate || t.completion_rate)}/1M`;
                if (t.fast_cached_rate > 0) line += ` 快缓:${fp(t.fast_cached_rate)}/1M`;
                if (t.fast_audio_prompt_rate > 0) line += ` 快音P:${fp(t.fast_audio_prompt_rate)}/1M`;
                if (t.fast_audio_cached_rate > 0) line += ` 快音缓:${fp(t.fast_audio_cached_rate)}/1M`;
              }
              return <Text key={idx} type="secondary" style={s}>{line}</Text>;
            })}
          </div>
        );
      }
      if (rule.billing_rule === 'seedance2.0') {
        const rates = ext.resolution_rates || {};
        const activeRes = Object.keys(rates);

        if (activeRes.length === 0) {
          return <Text type="secondary" style={s}>无独立分辨率设置(自动兜底计费)</Text>;
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activeRes.map(r => (
              <Text key={r} type="secondary" style={s}>
                {r}: {fp(rates[r].with_video)}(含视) / {fp(rates[r].without_video)}(无视)
              </Text>
            ))}
          </div>
        );
      }
      if (rule.billing_rule === 'seedance1.5pro') {
        const discountStr = ext.offline_discount !== undefined ? `(离线折扣: ${ext.offline_discount})` : '';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <Text type="secondary" style={s}>带语音: {fp(ext.audio_rate)}/1M {discountStr}</Text>
            <Text type="secondary" style={s}>无语音: {fp(ext.base_rate)}/1M {discountStr}</Text>
          </div>
        );
      }
      if (rule.billing_rule === 'seedance1.0') {
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <Text type="secondary" style={s}>在线: {fp(ext.online_rate)}/1M</Text>
            <Text type="secondary" style={s}>离线: {fp(ext.offline_rate)}/1M</Text>
          </div>
        );
      }
      if (rule.billing_rule === 'volcengine') {
        const lines: React.ReactNode[] = [];
        if (ext.volc_video_enabled) lines.push(<Text key="v" type="secondary" style={s}>含视频: {fp(ext.volc_video_rate)}/1M</Text>);
        if (ext.volc_audio_enabled) lines.push(<Text key="a" type="secondary" style={s}>含音频: {fp(ext.volc_audio_rate)}/1M</Text>);
        if (ext.volc_base_enabled) lines.push(<Text key="b" type="secondary" style={s}>纯文本: {fp(ext.volc_base_rate)}/1M</Text>);
        return <>{lines}</>;
      }
      if (rule.billing_rule === 'gpt_billing') {
        const gptConfig = (ext && typeof ext.gpt_config === 'object' && ext.gpt_config !== null) ? ext.gpt_config : {};
        const items = [
          { key: 'input_text', label: '文输' },
          { key: 'input_image', label: '图输' },
          { key: 'output_image', label: '图出' },
          { key: 'cached_input_text', label: '文缓' },
          { key: 'cached_input_image', label: '图缓' },
        ];
        const lines: React.ReactNode[] = [];
        items.forEach(item => {
          const cfg = gptConfig[item.key];
          if (cfg && cfg.enabled) {
            lines.push(
              <Text key={item.key} type="secondary" style={s}>
                {item.label}: {fp(cfg.rate)}/1M
              </Text>
            );
          }
        });
        if (lines.length === 0) {
          return <Text type="secondary" style={s}>GPT官方计费(未启用计费项)</Text>;
        }
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {lines}
          </div>
        );
      }
      if (rule.billing_rule === 'multimodal') {
        const imgRate = ext.image_prompt_rate || 0;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <Text type="secondary" style={s}>文本P: {fp(rule.prompt_rate)}/1M</Text>
            <Text type="secondary" style={s}>图片P: {fp(imgRate)}/1M</Text>
          </div>
        );
      }
      // standard
      const cacheStr = rule.cached_rate && rule.cached_rate > 0 ? ` Cache: ${fp(rule.cached_rate)}/1M` : '';
      const ccCreate = (rule as any).claude_cache_creation_rate;
      const ccRead = (rule as any).claude_cache_read_rate;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Text type="secondary" style={s}>P: {fp(rule.prompt_rate)}/1M  C: {fp(rule.completion_rate)}/1M{cacheStr}</Text>
          {ccCreate > 0 && <Text type="secondary" style={s}>Claude创建: {fp(ccCreate)}/1M</Text>}
          {ccRead > 0 && <Text type="secondary" style={s}>Claude读取: {fp(ccRead)}/1M</Text>}
        </div>
      );
    }

    if (rule.billing_type === 'requests') {
      const imgRefStr = ext.image_ref_multiplier && ext.image_ref_multiplier !== 1 ? `图生图×${ext.image_ref_multiplier}` : '';
      const promptExtStr = ext.prompt_extend_multiplier && ext.prompt_extend_multiplier !== 1 ? `扩写×${ext.prompt_extend_multiplier}` : '';
      // 合并倍率摘要（过滤空值，用空格分隔）
      const multiplierParts = [imgRefStr, promptExtStr].filter(Boolean);
      const multiplierStr = multiplierParts.length > 0 ? ` (${multiplierParts.join(' ')})` : '';
      if (rule.billing_rule === 'image_resolution') {
        const activeTiers = tiers.filter(t => t.enabled !== false);
        if (activeTiers.length === 0) return <Text type="secondary" style={s}>按分辨率K (无有效配置){multiplierStr}</Text>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activeTiers.map((t, idx) => (
              <Text key={idx} type="secondary" style={s}>
                {t.resolution}: {fp(t.rate)} / 张
              </Text>
            ))}
            {multiplierStr && <Text type="secondary" style={s}>{multiplierStr}</Text>}
          </div>
        );
      }
      if (rule.billing_rule === 'image_size_pixel') {
        const activeTiers = tiers.filter(t => t.enabled !== false);
        if (activeTiers.length === 0) return <Text type="secondary" style={s}>按分辨率像素 (无有效配置){multiplierStr}</Text>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activeTiers.map((t, idx) => (
              <Text key={idx} type="secondary" style={s}>
                {t.size}: {t.quality_pricing
                  ? `低${fp(t.rate_low)} 中${fp(t.rate_medium)} 高${fp(t.rate_high)} / 张`
                  : `${fp(t.rate)} / 张`}
              </Text>
            ))}
            {multiplierStr && <Text type="secondary" style={s}>{multiplierStr}</Text>}
          </div>
        );
      }
      if (rule.billing_rule === 'volc_seedream_pro') {
        const activeTiers = tiers.filter(t => t.enabled !== false);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <Text type="secondary" style={s}>
              输入额外: {fp(rule.prompt_rate)} / 张 (首免)
            </Text>
            {activeTiers.map((t, idx) => (
              <Text key={idx} type="secondary" style={s}>
                输出 &lt;= {t.max_pixels_wan}万像素: {fp(t.rate)} / 张
              </Text>
            ))}
          </div>
        );
      }
      if (rule.billing_rule === 'per_image') return <Text type="secondary" style={s}>{fp(rule.fixed_rate)} / 张{multiplierStr}</Text>;
      if (rule.billing_rule === 'vidu_image') {
        return renderPriceTableSummary('张');
      }
      // 按字符计费（语音合成等），billing_rule = "characters"
      if (rule.billing_rule === 'characters') {
        return <Text type="secondary" style={s}>{fp(rule.fixed_rate)} / 万字符</Text>;
      }
      return <Text type="secondary" style={s}>{fp(rule.fixed_rate)} / 请求</Text>;
    }

    // duration
    if (rule.billing_rule === 'video_resolution') {
        const activeTiers = tiers.filter(t => t.enabled !== false);
        if (activeTiers.length === 0) return <Text type="secondary" style={s}>按视频分辨率阶梯 (无有效配置)</Text>;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activeTiers.map((t, idx) => (
              <Text key={idx} type="secondary" style={s}>
                {t.resolution}: {fp(t.rate)} / s
              </Text>
            ))}
          </div>
        );
    }
    if (rule.billing_rule === 'video_quality') {
        const activeTiers = tiers.filter(t => t.enabled !== false);
        if (activeTiers.length === 0) return <Text type="secondary" style={s}>按视频画质及帧率阶梯 (无有效配置)</Text>;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {activeTiers.map((t, idx) => (
              <Text key={idx} type="secondary" style={s}>
                {t.resolution} | {t.fps_range === '<=30' ? '≤30fps' : t.fps_range === '>30' ? '>30fps' : t.fps_range}: {fp(t.rate)} / s
              </Text>
            ))}
          </div>
        );
    }
    if (rule.billing_rule === 'kling_video') {
      const pt = ext.price_table || {};
      const ptKeys = Object.keys(pt);
      if (ptKeys.length > 0) {
        // 精确查表模式：根据 enable 开关 + 逐条启用状态过滤
        const eMode = ext.enable_mode !== false;
        const eSound = ext.enable_sound !== false;
        const eVideo = ext.enable_video_ref === true;
        const disabledKeys: string[] = Array.isArray(ext.price_table_disabled) ? ext.price_table_disabled : [];
        const activeKeys = ptKeys.filter(key => {
          if (disabledKeys.includes(key)) return false;
          const parts = key.split('|');
          if (!eMode && parts[0] !== 'std') return false;
          if (!eSound && parts[1] !== 'off') return false;
          if (!eVideo && parts[2] !== 'no') return false;
          return true;
        });
        const activeValues = activeKeys.map(k => pt[k]).filter((v): v is number => typeof v === 'number');
        if (activeValues.length > 0) {
          const min = Math.min(...activeValues);
          const max = Math.max(...activeValues);
          const dims: string[] = [];
          if (eMode) dims.push('模式');
          if (eSound) dims.push('音频');
          if (eVideo) dims.push('参考视频');
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <Text type="secondary" style={s}>精确查表: {fp(min)}~{fp(max)}/s</Text>
              {dims.length > 0 && <Text type="secondary" style={s}>维度: {dims.join('+')}</Text>}
            </div>
          );
        }
        return <Text type="secondary" style={s}>精确查表 (无有效条目)</Text>;
      }
      const mm = ext.mode_multipliers || {};
      const sm = ext.sound_multipliers || {};
      const vm = ext.video_ref_multipliers || {};
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Text type="secondary" style={s}>基准: {fp(rule.duration_rate)}/s</Text>
          <Text type="secondary" style={s}>mode: 标准×{mm.std ?? 1} / 高品质×{mm.pro ?? 1.33} / 4k×{mm['4k'] ?? 2}</Text>
          <Text type="secondary" style={s}>sound: off×{sm.off ?? 1} / on×{sm.on ?? 1.5}</Text>
          <Text type="secondary" style={s}>参考视频: 无×{vm.no ?? 1} / 有×{vm.yes ?? 1.5}</Text>
        </div>
      );
    }
    if (rule.billing_rule === 'vidu_video') {
      const discount = ext.offpeak_discount;
      const extraNode = discount !== undefined && discount !== 1
        ? <Text type="secondary" style={s}>错峰: ×{discount}</Text>
        : undefined;
      return renderPriceTableSummary('s', extraNode);
    }
    if (rule.billing_rule === 'volc_enhance_cascade') {
      return renderPriceTableSummary('s');
    }
    return <Text type="secondary" style={s}>{fp(rule.duration_rate)}/s</Text>;
  };

  const ruleColors: Record<string, string> = {
    standard: 'default', multimodal: 'gold', tiered: 'gold', doubao_chat: 'gold', volcengine: 'volcano',
    'seedance2.0': 'volcano', 'seedance1.5pro': 'volcano', 'seedance1.0': 'volcano',
    fixed: 'default', per_image: 'lime', image_resolution: 'gold', image_size_pixel: 'gold',
    volc_seedream_pro: 'volcano',
    video_resolution: 'gold',
    kling_video: 'purple',
    vidu_video: 'cyan',
    vidu_image: 'green',
    characters: 'geekblue',
    volc_enhance_cascade: 'volcano',
  };
  const hasTimeMultipliers = ext?.enable_time_multipliers && Array.isArray(ext.time_multipliers) && ext.time_multipliers.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', lineHeight: 1.2, margin: 0, color: 'var(--text-secondary, #595959)' }}>{ruleLabel}</span>
        {discountTag}
        {hasTimeMultipliers && (
          <Tooltip title={
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>已启用时间段价格倍率 (共 {ext.time_multipliers.length} 个时段):</div>
              {ext.time_multipliers.map((tm: any, i: number) => (
                <div key={i} style={{ fontSize: 11 }}>
                  {tm.start} - {tm.end}: <b>{Number(tm.multiplier).toFixed(2)}倍</b>
                </div>
              ))}
            </div>
          }>
            <Tag color="volcano" style={{ margin: 0, padding: '0 4px', fontSize: 10, lineHeight: '14px' }}>峰谷启用</Tag>
          </Tooltip>
        )}
      </div>
      {renderDetails()}
      {rule.billing_type === 'tokens' && ext.web_search_rate !== undefined && ext.web_search_rate > 0 && (
        <Text type="secondary" style={{ ...s, marginTop: 2 }}>联网搜索: {fp(ext.web_search_rate)}/千次</Text>
      )}
    </div>
  );
};

export default RateDisplay;
