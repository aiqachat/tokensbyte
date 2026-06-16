/**
 * OpenAI 格式生成结果 URL 提取工具
 * 统一处理 OpenAI 规范的图片/视频响应格式
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** 将相对路径补全为完整 URL */
function getFullUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  if (!url.startsWith('http')) return `https://${url}`;
  return url;
}

/**
 * 从 OpenAI 格式响应中提取图片地址
 * 格式: { data: [{ url, b64_json }] }
 */
export function extractImageUrl(resultData: any): string {
  if (!resultData) return '';
  // OpenAI 标准: data[0].url 或 data[0].b64_json
  const d0 = resultData?.data?.[0];
  if (d0) {
    const u = typeof d0 === 'string' ? d0 : d0?.url || d0?.b64_json;
    if (u) return u;
  }
  return '';
}

/**
 * 从响应中提取视频地址
 * 支持 OpenAI 格式 { data: [{ url }] } 和内部格式 { content: { video_url } }
 */
export function extractVideoUrl(resultData: any): string {
  if (!resultData) return '';
  // OpenAI 标准: data[0].url
  const d0 = resultData?.data?.[0];
  if (d0?.url && typeof d0.url === 'string') return d0.url;
  // 系统内部格式: content.video_url
  const cvUrl = resultData?.content?.video_url;
  if (cvUrl && typeof cvUrl === 'string') return cvUrl;
  return '';
}

/**
 * 根据节点类型提取展示 URL
 */
export function getResultDisplayUrl(nodeType: string, resultData: any): string {
  if (!resultData) return '';
  if (nodeType === 'image') {
    const rawUrl = extractImageUrl(resultData);
    if (!rawUrl) return '';
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return rawUrl;
    // 纯 base64 字符串（长度大且不以 http 或 / 开头）
    if (rawUrl.length > 100 && !rawUrl.startsWith('http') && !rawUrl.startsWith('/')) {
      return `data:image/png;base64,${rawUrl}`;
    }
    return getFullUrl(rawUrl);
  }
  if (nodeType === 'video') return getFullUrl(extractVideoUrl(resultData));
  return '';
}
