/**
 * 图片类型节点内容
 */
import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

interface Props {
  resultData: any;
}

const ImageNodeContent: React.FC<Props> = React.memo(({ resultData }) => {
  const imageData = resultData?.data?.[0] || resultData?.content?.image_url;
  const imageUrl = typeof imageData === 'string' ? imageData : imageData?.url || imageData?.b64_json;
  const isBase64 = imageUrl && imageUrl.length > 200;

  return imageUrl
    ? <img src={isBase64 ? `data:image/png;base64,${imageUrl}` : imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="gen" />
    : <Text style={{ color: '#ff4d4f' }}>无效的图像数据</Text>;
});

ImageNodeContent.displayName = 'ImageNodeContent';
export default ImageNodeContent;
