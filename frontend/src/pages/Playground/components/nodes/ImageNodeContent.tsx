/**
 * 图片类型节点内容
 */
import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

import { useCanvas } from '../../context/PlaygroundContext';
import { getResultDisplayUrl } from '../../utils/resultExtractor';

interface Props {
  resultData: any;
  node: any;
}

const ImageNodeContent: React.FC<Props> = React.memo(({ resultData, node }) => {
  const { setNodes } = useCanvas();
  const finalUrl = getResultDisplayUrl('image', resultData);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (naturalW && naturalH && node && setNodes) {
      const aspectRatio = naturalW / naturalH;
      const currentAspectRatio = node.width / node.height;
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
