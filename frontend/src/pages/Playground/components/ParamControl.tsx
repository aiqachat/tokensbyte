/**
 * 参数控件渲染器
 * 根据 SchemeParam.type 渲染对应的表单控件
 */
import React from 'react';
import { Typography, Select, Input, InputNumber, Switch, Slider } from 'antd';
import type { SchemeParam } from '../types';
import { RESOLUTION_MAP } from '../constants';
import { usePlayground } from '../context/PlaygroundContext';

const { Text } = Typography;

interface Props {
  param: SchemeParam;
}

const ParamControl: React.FC<Props> = React.memo(({ param }) => {
  const { paramValues, setParamValues } = usePlayground();
  const value = paramValues[param.key] ?? param.default;

  // resolution + select 动态追加像素标注
  if (param.key === 'resolution' && param.type === 'select' && param.options) {
    const currentRatio = paramValues['ratio'] || '';
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Select
          style={{ width: '100%' }} size="large"
          value={value}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
          popupClassName="dark-select-dropdown"
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
        <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {param.options.map(opt => {
            const isActive = value === opt;
            return (
              <div
                key={String(opt)}
                onClick={() => setParamValues(prev => ({ ...prev, [param.key]: opt }))}
                style={{
                  width: 64, height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  background: isActive ? '#33373E' : '#17181A',
                  borderRadius: 12,
                  border: isActive ? '1.5px solid rgba(255,255,255,0.35)' : '1.5px solid transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.2s',
                  fontSize: 12, fontWeight: 500,
                }}
              >
                {String(opt).includes(':') ? (
                  <>
                    <div style={{
                      width: String(opt) === '16:9' || String(opt) === '21:9' ? 22 : String(opt) === '9:16' ? 12 : String(opt) === '1:1' ? 16 : String(opt) === '4:3' ? 18 : String(opt) === '3:4' ? 14 : String(opt) === '3:2' ? 18 : String(opt) === '2:3' ? 14 : 16,
                      height: String(opt) === '16:9' || String(opt) === '21:9' ? 12 : String(opt) === '9:16' ? 22 : String(opt) === '1:1' ? 16 : String(opt) === '4:3' ? 14 : String(opt) === '3:4' ? 18 : String(opt) === '3:2' ? 14 : String(opt) === '2:3' ? 18 : 16,
                      border: '1.5px solid currentColor', borderRadius: 2, marginBottom: 4
                    }} />
                    <span style={{ fontSize: 11 }}>{String(opt)}</span>
                  </>
                ) : (
                  <span>{String(opt)}</span>
                )}
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
        <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Select
          style={{ width: '100%' }} size="large"
          value={value}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
          popupClassName="dark-select-dropdown"
          options={param.options.map(opt => ({ label: `${opt}${param.unit ? ' ' + param.unit : ''}`, value: opt }))}
        />
        {param.hint && <Text style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{param.hint}</Text>}
      </div>
    );
  }

  if (param.type === 'number') {
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <InputNumber
          size="large"
          style={{ width: '100%', background: '#17181A' }}
          value={value}
          min={param.min ?? undefined}
          max={param.max ?? undefined}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
        />
        {param.hint && <Text style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{param.hint}</Text>}
      </div>
    );
  }

  if (param.type === 'switch') {
    return (
      <div key={param.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Switch
          checked={!!value}
          onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
        />
      </div>
    );
  }

  if (param.type === 'slider') {
    const min = param.min ?? 0;
    const max = param.max ?? 100;
    const step = param.step ?? 1;
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Slider
            style={{ flex: 1 }}
            min={min}
            max={max}
            step={step}
            value={typeof value === 'number' ? value : Number(value) || min}
            onChange={(v) => setParamValues(prev => ({ ...prev, [param.key]: v }))}
            tooltip={{ formatter: (v) => `${v}${param.unit ? ' ' + param.unit : ''}` }}
          />
          <InputNumber
            size="small"
            min={min}
            max={max}
            step={step}
            value={typeof value === 'number' ? value : Number(value) || min}
            onChange={(v) => v !== null && setParamValues(prev => ({ ...prev, [param.key]: v }))}
            style={{
              width: 68,
              background: '#222',
              borderRadius: 8,
              borderColor: 'rgba(255,255,255,0.12)',
              textAlign: 'center',
              fontFamily: 'monospace',
              fontSize: 13,
            }}
            controls={false}
          />
        </div>
        {param.hint && <Text style={{ display: 'block', marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{param.hint}</Text>}
      </div>
    );
  }

  if (param.type === 'input') {
    return (
      <div key={param.key}>
        <Text style={{ display: 'block', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{param.label}</Text>
        <Input
          size="large"
          value={value || ''}
          onChange={(e) => setParamValues(prev => ({ ...prev, [param.key]: e.target.value }))}
          placeholder={param.placeholder || ''}
          style={{ background: '#17181A', borderColor: 'rgba(255,255,255,0.08)' }}
        />
      </div>
    );
  }

  return null;
});

ParamControl.displayName = 'ParamControl';
export default ParamControl;
