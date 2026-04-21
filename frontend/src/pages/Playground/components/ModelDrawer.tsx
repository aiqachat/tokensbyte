/**
 * 模型全景选择器抽屉
 */
import React from 'react';
import { Drawer, Input, Tag } from 'antd';
import { CloseOutlined, SearchOutlined, DollarOutlined } from '@ant-design/icons';
import { usePlayground } from '../context/PlaygroundContext';
import { getCategoryIcon } from '../constants';

const ModelDrawer: React.FC = React.memo(() => {
  const {
    isModelDrawerVisible, setIsModelDrawerVisible,
    searchModelKeyword, setSearchModelKeyword,
    modelsInCategory, selectedMid, activeCategory,
    handleSelectModel,
  } = usePlayground();

  return (
    <Drawer
      title={<span style={{ fontSize: 18, fontWeight: 600, color: '#e8eaed' }}>Model selection</span>}
      open={isModelDrawerVisible}
      onClose={() => setIsModelDrawerVisible(false)}
      placement="right"
      width={480}
      mask={false}
      rootClassName="studio-model-drawer"
      closeIcon={<CloseOutlined style={{ color: '#e8eaed' }} />}
      style={{ background: '#1c1c1f', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
      getContainer={false}
    >
      <div>
        <Input
          size="large"
          prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.4)', paddingRight: 8 }} />}
          placeholder="Search for a model"
          value={searchModelKeyword}
          onChange={e => setSearchModelKeyword(e.target.value)}
          style={{ background: '#131416', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8 }}
        />
      </div>

      <div style={{ height: 500, overflowY: 'auto', paddingRight: '4px', marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {modelsInCategory.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '60px 0' }}>该类别下暂无可体验的模型。</div>
        ) : (
          modelsInCategory.map(model => (
            <div
              key={model.mid}
              className="studio-model-list-item"
              onClick={() => handleSelectModel(model.mid)}
              style={{
                background: selectedMid === model.mid ? 'rgba(22,119,255,0.06)' : '#1c1c1f',
                padding: '16px 20px', borderRadius: 12,
                border: selectedMid === model.mid ? '1px solid rgba(22,119,255,0.3)' : '1px solid rgba(255,255,255,0.03)',
                cursor: 'pointer', display: 'flex', gap: 16
              }}
            >
              <div style={{ fontSize: 24, padding: 4, opacity: 0.8, color: '#A2C1FF' }}>
                {getCategoryIcon(activeCategory, true)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, flexWrap: 'wrap' }}>
                    <div style={{ color: '#E8eaed', fontSize: 16, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.4 }}>{model.name}</div>
                  </div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 }}>ID: {model.model_id}</div>
                {model.scheme_name && (
                  <div style={{ marginTop: 8 }}>
                    <Tag color="blue" style={{ borderRadius: 12, fontSize: 11 }}>{model.scheme_name}</Tag>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                    <DollarOutlined style={{ marginRight: 6 }} />
                    按量计费
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
});

ModelDrawer.displayName = 'ModelDrawer';
export default ModelDrawer;
