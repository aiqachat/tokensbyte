/**
 * Playground 类型定义中心
 * 所有模块从此处 import 类型，避免循环依赖
 */

/** 方案参数定义 */
export interface SchemeParam {
  key: string;
  label: string;
  type: 'radio' | 'select' | 'switch' | 'number' | 'input';
  options?: (string | number)[];
  default: any;
  unit?: string;
  hint?: string;
  min?: number;
  max?: number;
  placeholder?: string;
}

/** 体验模型定义 */
export interface PlaygroundModel {
  mid: string;
  name: string;
  model_id: string;
  type_name: string;
  scheme_id: string;
  scheme_name: string;
  scheme_type: string;
  endpoint?: string;
  poll_endpoint?: string;
  params: SchemeParam[];
}

/** 画布节点定义 */
export interface CanvasNode {
  id: string;
  type: 'video' | 'image' | 'text';
  status: 'loading' | 'completed' | 'error';
  taskData: any;
  resultData: any;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

/** 画布变换状态 */
export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

/** 活跃工具类型 */
export type ActiveTool = 'pointer' | 'hand';

/** 二维坐标 */
export interface Point {
  x: number;
  y: number;
}

/** 体验中心项目 */
export interface PlaygroundProject {
  id: number;
  uid: string;
  name: string;
  description: string;
  cover_url: string;
  canvas_data: string;
  created_at: string;
  updated_at: string;
  asset_count?: number;
}

/** 体验中心资源 */
export interface PlaygroundAsset {
  id: number;
  asset_type: 'image' | 'video' | 'text' | 'audio';
  file_name: string;
  file_size: number;
  file_url: string;
  thumbnail_url: string;
  prompt: string;
  model_id: string;
  model_name: string;
  canvas_node_data: string;
  duration_seconds: number;
  width: number;
  height: number;
  created_at: string;
}
