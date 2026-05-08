/**
 * 统一的多厂商生成结果 URL 提取工具
 * 覆盖: OpenAI / 火山方舟 (Volcengine) / Gemini / 可灵 (Kling) / 阿里云 (DashScope)
 * 新厂商接入只需在对应函数中追加一条提取规则即可
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** 将相对路径或裸域名补全为完整 URL */
export function getFullUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('/')) return `${API_BASE_URL}${url}`;
  if (!url.startsWith('http')) return `https://${url}`;
  return url;
}

/**
 * 从任意厂商的图片生成结果中提取图片地址
 * 返回值可能是 http(s) URL、data: URI 或纯 base64 字符串
 */
export function extractImageUrl(resultData: any): string {
  if (!resultData) return '';
  // OpenAI / 火山方舟 标准格式: data[0].url 或 data[0].b64_json
  const d0 = resultData?.data?.[0];
  if (d0) { const u = typeof d0 === 'string' ? d0 : d0?.url || d0?.b64_json; if (u) return u; }
  if (resultData?.content?.image_url) return resultData.content.image_url;
  // 可灵: data 为对象 → data.task_result.images[0].url
  if (resultData?.data && !Array.isArray(resultData.data)) {
    const img = resultData.data.task_result?.images?.[0];
    if (img?.url) return img.url;
  }
  // 阿里云 DashScope: output.results[0].url
  const dr = resultData?.output?.results?.[0];
  if (dr) { const u = typeof dr === 'string' ? dr : dr?.url; if (u) return u; }
  
  // 阿里云 wan2.6 / OpenAI Chat 兼容格式: choices[0].message.content[x].image
  const choices = resultData?.output?.choices || resultData?.choices;
  if (choices?.[0]?.message?.content) {
    const content = choices[0].message.content;
    if (Array.isArray(content)) {
      const imgObj = content.find((c: any) => c.type === 'image' || c.image_url || c.image);
      if (imgObj) {
        return imgObj.image || (imgObj.image_url?.url || imgObj.image_url);
      }
    }
  }
  // Gemini: candidates[0].content.parts[].inlineData
  if (resultData?.candidates) {
    for (const part of resultData.candidates[0]?.content?.parts || []) {
      const inline = part.inlineData || part.inline_data;
      if (inline?.data) {
        return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
      }
    }
  }
  return '';
}

/**
 * 从任意厂商的视频生成结果中提取视频地址
 */
export function extractVideoUrl(resultData: any): string {
  if (!resultData) return '';
  // 火山方舟 / OpenAI 标准格式
  const std = resultData?.content?.video_url || resultData?.final_result?.video_url || resultData?.video_url;
  if (std) return std;
  // 可灵: data.task_result.videos[0].url
  const kv = resultData?.data?.task_result?.videos?.[0];
  if (kv?.url) return kv.url;
  // 阿里云 DashScope
  if (resultData?.output?.video_url) return resultData.output.video_url;
  const dvr = resultData?.output?.results?.[0];
  if (dvr?.video_url) return dvr.video_url;
  return '';
}

/**
 * 根据节点类型从 resultData 中提取最终可用的完整展示 URL
 * 供 GenerationLogWidget 等 UI 组件直接使用
 */
export function getResultDisplayUrl(nodeType: string, resultData: any): string {
  if (!resultData) return '';
  if (nodeType === 'image') {
    const rawUrl = extractImageUrl(resultData);
    if (!rawUrl) return '';
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) return rawUrl;
    if (rawUrl.length > 100 && !rawUrl.startsWith('http') && !rawUrl.startsWith('/')) {
      return `data:image/png;base64,${rawUrl}`;
    }
    return getFullUrl(rawUrl);
  }
  if (nodeType === 'video') return getFullUrl(extractVideoUrl(resultData));
  return '';
}
