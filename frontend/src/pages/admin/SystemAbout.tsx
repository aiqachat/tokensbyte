import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, message, Tag, Timeline, Badge, Button } from 'antd';
import { GitlabOutlined, UserOutlined, CalendarOutlined, TagOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';

const { Title, Text } = Typography;

interface Commit {
  index: number;
  is_current: boolean;
  version: string;
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
}

const SystemAbout: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
  const [loading, setLoading] = useState(true);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [current, setCurrent] = useState<Commit | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await request.get('/system/about') as any;
        if (res?.success) {
          setCommits(res.commits || []);
          setCurrent(res.current || null);
        } else {
          message.error('获取系统信息失败');
        }
      } catch (e: any) {
        message.error(e.message || '获取系统信息失败');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* 当前版本卡片 */}
      {current && !loading && (
        <Card
          bordered={false}
          style={{
            marginBottom: 24,
            background: _isLight ? 'linear-gradient(135deg, #f0f5ff 0%, #e6f4ff 100%)' : 'linear-gradient(135deg, #1a2a4a 0%, #0d1b35 100%)',
            border: _isLight ? '1px solid rgba(22, 119, 255, 0.15)' : '1px solid rgba(22, 119, 255, 0.35)',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 12, background: 'rgba(22, 119, 255, 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <GitlabOutlined style={{ fontSize: 28, color: '#4096ff' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Title level={4} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff' }}>当前版本</Title>
                <Badge
                  count="LATEST"
                  style={{ backgroundColor: '#1677ff', fontSize: 11, fontWeight: 600, borderRadius: 4 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Tag icon={<TagOutlined />} color="blue" style={{ fontSize: 13, padding: '2px 10px' }}>
                  {current.version}
                </Tag>
                <Tag color="default" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {current.short_hash}
                </Tag>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
                {current.message}
              </div>
              <div style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                <UserOutlined style={{ marginRight: 5 }} />{current.author}
                <CalendarOutlined style={{ marginLeft: 12, marginRight: 5 }} />{current.date}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 更新记录时间线 */}
      <Card
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: '#1677ff' }} />
            <span>最近更新记录</span>
            <Tag color="default" style={{ fontSize: 11 }}>最近 10 次</Tag>
          </div>
        }
        bordered={false}
        style={{ borderRadius: 12 }}
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Timeline
              style={{ paddingTop: 8, paddingBottom: expanded ? 0 : 16 }}
              items={(expanded ? commits : commits.slice(0, 3)).map((c) => ({
                color: c.is_current ? '#1677ff' : 'gray',
                dot: c.is_current ? (
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%',
                    background: '#1677ff',
                    boxShadow: '0 0 0 4px rgba(22, 119, 255, 0.2)',
                  }} />
                ) : undefined,
                children: (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 10,
                      marginBottom: 4,
                      background: c.is_current
                        ? 'rgba(22, 119, 255, 0.06)'
                        : (_isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'),
                      border: c.is_current
                        ? '1px solid rgba(22, 119, 255, 0.25)'
                        : (_isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.04)'),
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <Tag
                        color={c.is_current ? 'blue' : 'default'}
                        icon={<TagOutlined />}
                        style={{ fontWeight: 600 }}
                      >
                        {c.version}
                      </Tag>
                      <Tag style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {c.short_hash}
                      </Tag>
                      {c.is_current && (
                        <Tag color="success" style={{ fontSize: 10 }}>当前版本</Tag>
                      )}
                    </div>
                    <div style={{
                      fontSize: 14,
                      fontWeight: c.is_current ? 600 : 400,
                      color: c.is_current 
                        ? (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)') 
                        : (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.75)'),
                      marginBottom: 6,
                    }}>
                      {c.message || '(无提交说明)'}
                    </div>
                    <div style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span><UserOutlined style={{ marginRight: 4 }} />{c.author}</span>
                      <span><CalendarOutlined style={{ marginRight: 4 }} />{c.date}</span>
                    </div>
                  </div>
                ),
              }))}
            />
            {commits.length > 3 && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <Button 
                  type="dashed" 
                  ghost
                  style={{ borderRadius: 20, padding: '0 24px', borderColor: 'rgba(255,255,255,0.15)', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}
                  icon={expanded ? <UpOutlined /> : <DownOutlined />} 
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? '收起历史记录' : `展开更多记录 (${commits.length - 3})`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default SystemAbout;
