import React, { useEffect, useState } from 'react';
import { Card, Typography, Spin, message } from 'antd';
import request from '../../utils/request';

const { Title } = Typography;

const SystemAbout: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [versionInfo, setVersionInfo] = useState('');

  useEffect(() => {
    const fetchSystemAbout = async () => {
      try {
        const res = await request.get('/system/about');
        if (res && (res as any).success) {
          setVersionInfo((res as any).version_info);
        } else {
          message.error('获取系统信息失败');
        }
      } catch (e: any) {
        message.error(e.message || '获取系统信息失败');
      } finally {
        setLoading(false);
      }
    };
    fetchSystemAbout();
  }, []);

  return (
    <Card 
      title={<Title level={4} style={{ margin: 0 }}>系统关于</Title>} 
      bordered={false} 
      style={{ borderRadius: 8, height: '100%' }}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <Spin size="large" />
        </div>
      ) : (
        <div 
          style={{ 
            whiteSpace: 'pre-wrap', 
            fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', 
            fontSize: '14px',
            backgroundColor: '#141414',
            padding: '24px',
            borderRadius: '8px',
            color: '#e5e5e5',
            lineHeight: 1.6
          }}
        >
          {versionInfo || '暂无版本信息'}
        </div>
      )}
    </Card>
  );
};

export default SystemAbout;
