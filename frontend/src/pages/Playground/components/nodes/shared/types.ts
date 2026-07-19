/**
 * 高级节点组件共享类型定义
 */
import type { CanvasNode } from '../../../types';

/** 所有高级节点组件的统一 Props 接口 */
export interface AdvancedNodeProps {
  /** 当前节点数据 */
  node: CanvasNode;
  /** 解析实例后的显示节点（实例节点解析为源节点数据） */
  displayNode: CanvasNode;
  /** 画布上所有节点（用于查找父/子关系） */
  nodes: CanvasNode[];
  /** 主题模式：true = 亮色 */
  isLight: boolean;

  // ── 节点数据操作 ──
  /** 更新当前节点的 taskData（浅合并） */
  updateNodeTaskData: (patch: Record<string, any>) => void;
  /** 移除节点 */
  onRemove: (id: string) => void;

  // ── 画布状态 ──
  /** 节点列表 setter */
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
  /** 保存画布状态到后端 */
  saveCanvasState: (nodes: CanvasNode[]) => void;
  /** 当前选中的 API 密钥 */
  selectedTokenKey: string;
  /** 节点是否处于选中状态 */
  isSelected?: boolean;
}
