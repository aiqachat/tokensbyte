/**
 * 文本类型节点内容
 */
import React from 'react';

interface Props {
  resultData: any;
}

const TextNodeContent: React.FC<Props> = React.memo(({ resultData }) => {
  return (
    <div style={{ padding: 16, overflowY: 'auto', width: '100%', height: '100%' }}>
      <pre style={{ margin: 0, color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
        {resultData?.choices?.[0]?.message?.content || JSON.stringify(resultData, null, 2)}
      </pre>
    </div>
  );
});

TextNodeContent.displayName = 'TextNodeContent';
export default TextNodeContent;
