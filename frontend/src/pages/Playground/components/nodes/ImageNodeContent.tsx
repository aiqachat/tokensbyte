/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 图片类型节点内容
 */
import React, { useState } from 'react';
import { Typography, Spin } from 'antd';

const { Text } = Typography;

import { useCanvas } from '../../context/PlaygroundContext';
import { getResultDisplayUrl } from '../../utils/resultExtractor';

interface Props {
  resultData: any;
  node: any;
}

const ImageNodeContent: React.FC<Props> = React.memo(({ resultData, node }) => {
  const { setNodes } = useCanvas();
  const [isLoaded, setIsLoaded] = useState(false);
  const finalUrl = getResultDisplayUrl('image', resultData);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setIsLoaded(true);
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

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {finalUrl ? (
        <>
          {!isLoaded && (
            <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Spin size="small" />
            </div>
          )}
          <img
            src={finalUrl}
            onLoad={handleLoad}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
              opacity: isLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
            alt=""
            draggable={false}
          />
        </>
      ) : (
        <Text style={{ color: '#ff4d4f' }}>无效的图像数据</Text>
      )}
    </div>
  );
});

ImageNodeContent.displayName = 'ImageNodeContent';
export default ImageNodeContent;
