/**
 * 画布节点 / 素材判定纯函数（无 React 依赖，供校验与加载复用）
 */
import type { CanvasNode } from '../types';

/** 创作参考附件（references/）：计入容量，不占素材上限、不补进画布 */
export function isReferenceAssetUrl(url?: string | null): boolean {
  return !!url && url.includes('/references/');
}

const NON_MATERIAL_NODE_TYPES = new Set([
  'preview', 'volc_enhance', 'prompt', 'ai_image', 'ai_video', 'agent',
]);

/** 是否计入项目素材数量上限（排除区块 / 高级编排 / 实例） */
export function isMaterialQuotaNode(n: Pick<CanvasNode, 'type' | 'isInstance' | 'taskData'>): boolean {
  if (n.type === 'section') return false;
  if (NON_MATERIAL_NODE_TYPES.has(n.taskData?.node_type)) return false;
  if (n.isInstance || n.taskData?.is_instance) return false;
  return true;
}
