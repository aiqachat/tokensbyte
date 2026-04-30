import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, Input, Spin, Empty, Typography, Pagination, Tooltip } from 'antd';
import { SearchOutlined, CloseCircleOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';

const { Text } = Typography;

interface SiteIconItem {
  id: number;
  name: string;
  title: string;
  file_path: string;
  source: string;
  category: string;
}

interface IconPickerProps {
  /** 当前选中的图标名称 */
  value?: string;
  /** 选中回调 */
  onChange?: (icon: { id: number; name: string; title: string; file_path: string } | null) => void;
  /** 占位提示 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

const IconPicker: React.FC<IconPickerProps> = ({ value, onChange, placeholder = '选择图标', disabled }) => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const [open, setOpen] = useState(false);
  const [icons, setIcons] = useState<SiteIconItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchIcons = useCallback(async (p = 1, q = keyword) => {
    try {
      setLoading(true);
      const params: any = { page: p, size: 60 };
      if (q) params.q = q;
      const res = await (request.get('/plugins/site-icons/public', { params }) as any);
      if (res.data) setIcons(res.data);
      if (res.total != null) setTotal(res.total);
      setPage(res.page || p);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchIcons(1, '');
  }, [open]);

  const handleSearch = (val: string) => {
    setKeyword(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchIcons(1, val), 300);
  };

  const handleSelect = (icon: SiteIconItem) => {
    onChange?.({ id: icon.id, name: icon.name, title: icon.title, file_path: icon.file_path });
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
  };

  const getSvgUrl = (icon: SiteIconItem) => `/assets/${icon.file_path}`;

  // 获取当前选中图标的显示信息
  const selectedIcon = value ? icons.find(i => i.name === value) : null;

  return (
    <>
      {/* Trigger */}
      <div
        onClick={() => !disabled && setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 6,
          border: isLight ? '1px solid #d9d9d9' : '1px solid rgba(255,255,255,0.15)',
          background: isLight ? '#fff' : '#1f1f1f',
          cursor: disabled ? 'not-allowed' : 'pointer',
          minWidth: 160,
          transition: 'border-color 0.2s',
          opacity: disabled ? 0.5 : 1,
        }}
        onMouseEnter={e => { if (!disabled) e.currentTarget.style.borderColor = 'rgba(22,119,255,0.5)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = isLight ? '#d9d9d9' : 'rgba(255,255,255,0.15)'; }}
      >
        {value ? (
          <>
            <img
              src={selectedIcon ? getSvgUrl(selectedIcon) : `/assets/icons/lobe/${value}.svg`}
              alt={value}
              style={{ width: 20, height: 20, objectFit: 'contain' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <Text style={{ color: isLight ? '#1f2937' : '#fff', fontSize: 13, flex: 1 }}>{selectedIcon?.title || value}</Text>
            <CloseCircleOutlined
              style={{ color: isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}
              onClick={handleClear}
            />
          </>
        ) : (
          <Text style={{ color: isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 13 }}>{placeholder}</Text>
        )}
      </div>

      {/* Picker Modal */}
      <Modal
        title="选择图标"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={640}
        destroyOnClose
      >
        <Input
          prefix={<SearchOutlined style={{ color: isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)' }} />}
          placeholder="搜索图标名称..."
          value={keyword}
          onChange={e => handleSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 16 }}
        />

        {loading && icons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : icons.length === 0 ? (
          <Empty description="未找到匹配的图标" style={{ padding: 40 }} />
        ) : (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
              gap: 8,
              maxHeight: 400,
              overflow: 'auto',
              padding: '4px 0',
            }}>
              {icons.map(icon => {
                const isSelected = value === icon.name;
                return (
                  <Tooltip key={icon.id} title={icon.title || icon.name}>
                    <div
                      onClick={() => handleSelect(icon)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        padding: '10px 4px 6px',
                        borderRadius: 6,
                        border: isSelected
                          ? '2px solid #1677ff'
                          : isLight ? '1px solid #e8e8e8' : '1px solid rgba(255,255,255,0.08)',
                        background: isSelected ? 'rgba(22,119,255,0.08)' : (isLight ? '#fafafa' : '#141414'),
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = 'rgba(22,119,255,0.4)';
                          e.currentTarget.style.background = 'rgba(22,119,255,0.04)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) {
                          e.currentTarget.style.borderColor = isLight ? '#e8e8e8' : 'rgba(255,255,255,0.08)';
                          e.currentTarget.style.background = isLight ? '#fafafa' : '#141414';
                        }
                      }}
                    >
                      <img
                        src={getSvgUrl(icon)}
                        alt={icon.name}
                        style={{ width: 32, height: 32, objectFit: 'contain', marginBottom: 4 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                      <Text style={{
                        color: isLight ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)', fontSize: 10,
                        textAlign: 'center', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        width: '100%',
                      }}>
                        {icon.title || icon.name}
                      </Text>
                    </div>
                  </Tooltip>
                );
              })}
            </div>

            {total > 60 && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <Pagination
                  current={page}
                  total={total}
                  pageSize={60}
                  onChange={p => fetchIcons(p, keyword)}
                  showSizeChanger={false}
                  size="small"
                />
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
};

export default IconPicker;
