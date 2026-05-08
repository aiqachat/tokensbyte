/**
 * 图片类型节点内容
 */
import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

import { useCanvas } from '../../context/PlaygroundContext';

interface Props {
  resultData: any;
  node: any;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getFullUrl = (url: string) => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (!url.startsWith('http') && !url.startsWith('/')) return `https://${url}`;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  return url;
};

const ImageNodeContent: React.FC<Props> = React.memo(({ resultData, node }) => {
  const { setNodes } = useCanvas();
  // 提取图片数据：兼容 OpenAI data[] 和 Gemini candidates[].content.parts[].inlineData
  const imageData = resultData?.data?.[0] || resultData?.content?.image_url;
  let rawUrl = typeof imageData === 'string' ? imageData : imageData?.url || imageData?.b64_json;

  // Gemini 原生格式回退：从 candidates[0].content.parts[0].inlineData 提取 base64
  if (!rawUrl && resultData?.candidates) {
    const parts = resultData.candidates[0]?.content?.parts;
    if (parts) {
      for (const part of parts) {
        const inline = part.inlineData || part.inline_data;
        if (inline?.data) {
          const mime = inline.mimeType || inline.mime_type || 'image/png';
          rawUrl = `data:${mime};base64,${inline.data}`;
          break;
        }
      }
    }
  }
  
  let finalUrl = '';
  if (rawUrl) {
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
      finalUrl = rawUrl;
    } else if (rawUrl.length > 100 && !rawUrl.startsWith('http') && !rawUrl.startsWith('/')) {
      finalUrl = `data:image/png;base64,${rawUrl}`;
    } else {
      finalUrl = getFullUrl(rawUrl);
    }
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (naturalW && naturalH && node && setNodes) {
      const aspectRatio = naturalW / naturalH;
      const currentAspectRatio = node.width / node.height;
      // If the natural aspect ratio differs significantly from the current one, update width
      if (Math.abs(aspectRatio - currentAspectRatio) > 0.02) {
        const newWidth = node.height * aspectRatio;
        setNodes(prev => prev.map(n => n.id === node.id ? { ...n, width: newWidth } : n));
      }
    }
  };

  return finalUrl
    ? <img src={finalUrl} onLoad={handleLoad} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} alt="gen" draggable={false} />
    : <Text style={{ color: '#ff4d4f' }}>无效的图像数据</Text>;
});

ImageNodeContent.displayName = 'ImageNodeContent';
export default ImageNodeContent;
