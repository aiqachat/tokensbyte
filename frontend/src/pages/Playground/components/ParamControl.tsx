/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 参数控件渲染器
 * 根据 SchemeParam.type 渲染对应的表单控件
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Typography, Select, Input, InputNumber, Switch, Slider } from 'antd';
import type { SchemeParam } from '../types';
import { RESOLUTION_MAP } from '../constants';
import { usePlayground } from '../context/PlaygroundContext';
import { useThemeStore } from '../../../store/theme';

const { Text } = Typography;

// 最大公约数计算
const getGcd = (a: number, b: number): number => {
  return b === 0 ? a : getGcd(b, a % b);
};

/** 独立滑块控件 — 拖拽时仅更新本地 state，松手后同步到全局 Context，保证丝滑 60fps */
const SliderControl: React.FC<{
  param: SchemeParam;
  value: any;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = React.memo(({ param, value, onChange, disabled }) => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const min = param.min ?? 0;
  const max = param.max ?? 100;
  const step = param.step ?? 1;

  const precision = step.toString().split('.')[1]?.length || 0;
  const roundToStep = useCallback((v: number) => {
    return Number((Math.round(v / step) * step).toFixed(precision));
  }, [step, precision]);

  const toNum = useCallback((v: any) => (typeof v === 'number' ? v : Number(v) || min), [min]);

  const [localValue, setLocalValue] = useState(() => roundToStep(toNum(value)));
  const [sliderValue, setSliderValue] = useState(() => roundToStep(toNum(value)));
  const dragging = useRef(false);

  // 外部值变化时同步到本地（非拖拽状态下）
  useEffect(() => {
    if (!dragging.current) {
      const val = roundToStep(toNum(value));
      setLocalValue(val);
      setSliderValue(val);
    }
  }, [value, roundToStep]);

  const handleSliderChange = useCallback((v: number) => {
    dragging.current = true;
    setSliderValue(v); // 丝滑拖拽，不断档
    setLocalValue(roundToStep(v)); // 数字框显示按 step 吸附的值
  }, [roundToStep]);

  const handleSliderComplete = useCallback((v: number) => {
    dragging.current = false;
    const rounded = roundToStep(v);
    setSliderValue(rounded); // 松手时吸附到准确位置
    setLocalValue(rounded);
    onChange(rounded);
  }, [onChange, roundToStep]);

  const handleInputChange = useCallback((v: number | null) => {
    if (v === null) return;
    const rounded = roundToStep(v);
    setLocalValue(rounded);
    setSliderValue(rounded);
    onChange(rounded);
  }, [onChange, roundToStep]);

  return (
    <div>
      <Text style={{ display: 'block', marginBottom: 8, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Slider
          disabled={disabled}
          style={{ flex: 1 }}
          min={min}
          max={max}
          step={(max - min) / 1000} // 设置极小的 step 保证视觉极度丝滑
          value={sliderValue}
          onChange={handleSliderChange}
          onChangeComplete={handleSliderComplete}
          tooltip={{ formatter: null }} // 隐藏默认气泡，因为右侧已经有输入框
        />
        <InputNumber
          disabled={disabled}
          size="small"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={handleInputChange}
          style={{
            width: 68,
            background: _isLight ? '#fff' : '#222',
            borderRadius: 8,
            borderColor: _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)',
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 13,
          }}
          controls={false}
        />
      </div>
      {param.hint && <Text style={{ display: 'block', marginTop: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.3)' }}>{param.hint}</Text>}
    </div>
  );
});
SliderControl.displayName = 'SliderControl';

interface Props {
  param: SchemeParam;
  disabled?: boolean;
}

const ParamControl: React.FC<Props> = React.memo(({ param, disabled }) => {
  const { paramValues, setParamValues } = usePlayground();
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const value = paramValues[param.key] ?? param.default;

  // resolution + select 动态追加像素标注
  if (param.key === 'resolution' && param.type === 'select' && param.options) {
    const currentRatio = paramValues['ratio'] || '';
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 8, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Select
          disabled={disabled}
          style={{ width: '100%' }} size="large"
          value={value}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
          popupClassName={_isLight ? '' : 'dark-select-dropdown'}
          options={param.options.map(opt => {
            const res = String(opt);
            const pixels = RESOLUTION_MAP[res]?.[currentRatio];
            return { label: pixels ? `${res} (${pixels})` : res, value: opt };
          })}
        />
      </div>
    );
  }

  if (param.type === 'radio' && param.options) {
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 8, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, 68px)', justifyContent: 'center', gap: 10 }}>
          {param.options.map(opt => {
            const isActive = value === opt;
            return (
              <div
                key={String(opt)}
                onClick={() => {
                  if (disabled) return;
                  setParamValues(prev => ({ ...prev, [param.key]: opt }));
                }}
                style={{
                  width: 68, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.45 : 1,
                  pointerEvents: disabled ? 'none' : 'auto',
                  background: isActive ? (_isLight ? '#e6f4ff' : '#33373E') : (_isLight ? '#f5f5f5' : '#17181A'),
                  borderRadius: 12,
                  border: isActive ? (_isLight ? '1.5px solid #1677ff' : '1.5px solid rgba(255,255,255,0.35)') : '1.5px solid transparent',
                  color: isActive ? (_isLight ? '#1677ff' : '#fff') : (_isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)'),
                  transition: 'all 0.2s',
                  fontSize: 12, fontWeight: 500,
                }}
              >
                {(() => {
                  const optStr = String(opt);

                  // 匹配常见的宽高/比例格式，如 "16:9", "1024x1024", "1728*2304"
                  const match = optStr.match(/(\d+)\s*[xX*\:]\s*(\d+)/);
                  if (match) {
                    const w = parseInt(match[1], 10);
                    const h = parseInt(match[2], 10);
                    let boxW = 16;
                    let boxH = 16;
                    if (w > 0 && h > 0) {
                      const maxSide = 22;
                      const minSide = 6;
                      if (w >= h) {
                        boxW = maxSide;
                        boxH = Math.max(minSide, Math.round(maxSide * (h / w)));
                      } else {
                        boxH = maxSide;
                        boxW = Math.max(minSide, Math.round(maxSide * (w / h)));
                      }
                    }

                    // 计算比例并生成标注
                    let ratioStr = '';
                    if (w > 0 && h > 0) {
                      const d = getGcd(w, h);
                      ratioStr = `${w / d}:${h / d}`;
                    }
                    const isAlreadyRatio = optStr === ratioStr || optStr.includes(':');

                    return (
                      <>
                        <div style={{
                          width: boxW, height: boxH,
                          border: '1.5px solid currentColor', borderRadius: 2, marginBottom: 2
                        }} />
                        <span style={{ fontSize: optStr.length > 7 ? 10 : 11, lineHeight: 1.1 }}>{optStr}</span>
                        {ratioStr && !isAlreadyRatio && (
                          <span style={{ fontSize: 9, opacity: 0.65, marginTop: 1, lineHeight: 1.1 }}>({ratioStr})</span>
                        )}
                      </>
                    );
                  } else if (optStr.toLowerCase() === 'adaptive' || optStr.toLowerCase() === 'auto') {
                    return (
                      <>
                        <div style={{
                          width: 18, height: 14,
                          border: '1.5px dashed currentColor', borderRadius: 2, marginBottom: 4
                        }} />
                        <span style={{ fontSize: 11 }}>相似比例</span>
                      </>
                    );
                  } else {
                    return <span style={{ fontSize: optStr.length > 7 ? 10 : 12 }}>{optStr}</span>;
                  }
                })()}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (param.type === 'select' && param.options) {
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 8, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Select
          disabled={disabled}
          style={{ width: '100%' }} size="large"
          value={value}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
          popupClassName={_isLight ? '' : 'dark-select-dropdown'}
          options={param.options.map(opt => ({ label: `${opt}${param.unit ? ' ' + param.unit : ''}`, value: opt }))}
        />
        {param.hint && <Text style={{ display: 'block', marginTop: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.3)' }}>{param.hint}</Text>}
      </div>
    );
  }

  if (param.type === 'number') {
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 8, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <InputNumber
          disabled={disabled}
          size="large"
          style={{ width: '100%', background: _isLight ? '#fff' : '#17181A' }}
          value={value}
          min={param.min ?? undefined}
          max={param.max ?? undefined}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
        />
        {param.hint && <Text style={{ display: 'block', marginTop: 4, fontSize: 11, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.3)' }}>{param.hint}</Text>}
      </div>
    );
  }

  if (param.type === 'switch') {
    return (
      <div key={param.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Switch
          disabled={disabled}
          checked={!!value}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
        />
      </div>
    );
  }

  if (param.type === 'slider') {
    return <SliderControl param={param} value={value} onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))} disabled={disabled} />;
  }

  if (param.type === 'input') {
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 8, fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Input
          disabled={disabled}
          size="large"
          value={value || ''}
          onChange={(e) => setParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
          placeholder={param.placeholder || ''}
          style={{ background: _isLight ? '#fff' : '#17181A', borderColor: _isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)' }}
        />
      </div>
    );
  }

  return null;
});

ParamControl.displayName = 'ParamControl';
export default ParamControl;
