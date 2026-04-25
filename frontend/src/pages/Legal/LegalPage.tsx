import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Typography, ConfigProvider, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';

const LegalPage: React.FC = () => {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (type !== 'terms' && type !== 'privacy') {
      navigate('/');
      return;
    }

    const fetchLegalContent = async () => {
      try {
        const response = await (request.get('/settings') as any);
        const agreement = response?.agreement;
        const isEn = i18n.language && i18n.language.startsWith('en');
        
        if (!agreement) {
          setContent(isEn ? 'No content available' : '暂无内容');
          setLoading(false);
          return;
        }

        if (type === 'terms') {
          setTitle(isEn ? 'Terms of Service' : '服务条款 (Terms of Service)');
          if (isEn ? agreement.tos_mode_en === 'link' : agreement.tos_mode === 'link') {
            const link = isEn && agreement.tos_link_en ? agreement.tos_link_en : agreement.tos_link;
            if (link) {
              window.location.href = link;
              return;
            }
          }
          const textContent = isEn && agreement.tos_content_en ? agreement.tos_content_en : agreement.tos_content;
          setContent(textContent || (isEn ? 'No content available' : '暂无内容'));
        } else if (type === 'privacy') {
          setTitle(isEn ? 'Privacy Policy' : '隐私政策 (Privacy Policy)');
          if (isEn ? agreement.privacy_mode_en === 'link' : agreement.privacy_mode === 'link') {
            const link = isEn && agreement.privacy_link_en ? agreement.privacy_link_en : agreement.privacy_link;
            if (link) {
              window.location.href = link;
              return;
            }
          }
          const textContent = isEn && agreement.privacy_content_en ? agreement.privacy_content_en : agreement.privacy_content;
          setContent(textContent || (isEn ? 'No content available' : '暂无内容'));
        }
        
      } catch (error) {
        console.error('Failed to fetch legal settings:', error);
        setContent('加载失败');
      } finally {
        setLoading(false);
      }
    };

    fetchLegalContent();
  }, [type, navigate, i18n.language]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
      <div style={{ 
        minHeight: '100vh', 
        background: '#0a0a0a', 
        color: '#e5e5e5',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ 
          maxWidth: 860, 
          width: '100%', 
          margin: '0 auto', 
          padding: '60px 24px',
          flex: 1
        }}>
          <Typography.Title level={2} style={{ color: '#fff', textAlign: 'center', marginBottom: 40, fontWeight: 600 }}>
            {title}
          </Typography.Title>
          
          <div 
            className="ql-editor"
            style={{ 
              background: 'transparent', 
              padding: 0,
              fontSize: '15px',
              lineHeight: 1.8,
              color: 'rgba(255, 255, 255, 0.85)'
            }}
            dangerouslySetInnerHTML={{ __html: content }} 
          />
        </div>
      </div>
    </ConfigProvider>
  );
};

export default LegalPage;
