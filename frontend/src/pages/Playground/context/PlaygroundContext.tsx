/**
 * Playground 双 Context 状态管理
 * 
 * 性能关键设计：将状态拆分为两个 Context
 * - CanvasContext: 高频变化（画布变换、拖拽状态）—— 仅画布相关组件订阅
 * - PlaygroundContext: 低频变化（模型、参数、token）—— 面板等 UI 组件订阅
 * 
 * 拖拽操作（画布/节点/面板）已改为 ref+DOM 驱动，不再于拖拽期间更新 Context
 */
import React, { createContext, useContext, useState, useMemo, useCallback, useRef } from 'react';
import type { CanvasNode, CanvasTransform, ActiveTool, Point, PlaygroundModel, SchemeParam, PlaygroundProject } from '../types';
import request from '../../../utils/request';
import { extractImageUrl, extractVideoUrl } from '../utils/resultExtractor';

// ============================================================
// Canvas Context — 高频交互状态
// ============================================================
interface CanvasContextValue {
  // 画布变换
  canvasTransform: CanvasTransform;
  setCanvasTransform: React.Dispatch<React.SetStateAction<CanvasTransform>>;
  // 活跃工具
  activeTool: ActiveTool;
  setActiveTool: React.Dispatch<React.SetStateAction<ActiveTool>>;
  // 键盘状态
  isSpaceDown: boolean;
  // 画布拖拽中标记（用于 cursor 样式）
  isDraggingCanvas: boolean;
  setIsDraggingCanvas: React.Dispatch<React.SetStateAction<boolean>>;
  // 节点拖拽
  draggingNodeId: string | null;
  setDraggingNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  // 节点数据
  nodes: CanvasNode[];
  setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
  // zIndex
  maxZIndex: number;
  setMaxZIndex: React.Dispatch<React.SetStateAction<number>>;
  // ref
  canvasRef: React.RefObject<HTMLDivElement>;
  // 悬浮面板位置（仅初始化和 mouseup 时写入）
  settingsWidgetPos: Point;
  setSettingsWidgetPos: React.Dispatch<React.SetStateAction<Point>>;
  resourceWidgetPos: Point;
  setResourceWidgetPos: React.Dispatch<React.SetStateAction<Point>>;
  modelWidgetPos: Point;
  setModelWidgetPos: React.Dispatch<React.SetStateAction<Point>>;
  selectedNodeId: string | null;
  setSelectedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export const useCanvas = () => {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used within CanvasProvider');
  return ctx;
};

// ============================================================
// Playground Context — 低频业务状态
// ============================================================
interface PlaygroundContextValue {
  loading: boolean;
  models: PlaygroundModel[];
  selectedMid: string;
  setSelectedMid: React.Dispatch<React.SetStateAction<string>>;
  currentModel: PlaygroundModel | null;
  categories: string[];
  activeCategory: string;
  setActiveCategory: React.Dispatch<React.SetStateAction<string>>;
  modelsInCategory: PlaygroundModel[];
  searchModelKeyword: string;
  setSearchModelKeyword: React.Dispatch<React.SetStateAction<string>>;
  // 参数
  paramValues: Record<string, any>;
  setParamValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  initParamDefaults: (params: SchemeParam[]) => void;
  // prompt
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  // 生成
  generating: boolean;
  setGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  taskPollingNodes: string[];
  setTaskPollingNodes: React.Dispatch<React.SetStateAction<string[]>>;
  // token
  apiTokens: any[];
  selectedTokenKey: string;
  setSelectedTokenKey: React.Dispatch<React.SetStateAction<string>>;
  // UI 开关
  isModelDrawerVisible: boolean;
  setIsModelDrawerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isTokenModalVisible: boolean;
  setIsTokenModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingsCollapsed: boolean;
  setIsSettingsCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  isResourceWidgetVisible: boolean;
  setIsResourceWidgetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isSettingsWidgetVisible: boolean;
  setIsSettingsWidgetVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isGenLogVisible: boolean;
  setIsGenLogVisible: React.Dispatch<React.SetStateAction<boolean>>;
  // 操作
  handleCategoryChange: (cat: string) => void;
  handleSelectModel: (mid: string) => void;
  // 项目管理
  projects: PlaygroundProject[];
  currentProjectId: number | null;
  setCurrentProjectId: React.Dispatch<React.SetStateAction<number | null>>;
  loadProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<number | null>;
  saveCanvasState: () => Promise<void>;
  // 素材附件
  attachedAssets: { asset: any; fullUrl: string; file?: File; options?: { role?: string } }[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<{ asset: any; fullUrl: string; file?: File }[]>>;
  // 存储统计
  storageStats: any;
  loadStorageStats: () => Promise<void>;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

export const usePlayground = () => {
  const ctx = useContext(PlaygroundContext);
  if (!ctx) throw new Error('usePlayground must be used within PlaygroundProvider');
  return ctx;
};

// ============================================================
// Combined Provider
// ============================================================
export const PlaygroundProvider: React.FC<{ children: React.ReactNode; projectId: number }> = ({ children, projectId }) => {
  // --- 低频业务状态 ---
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [selectedMid, setSelectedMid] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [searchModelKeyword, setSearchModelKeyword] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [defaultModelMids, setDefaultModelMids] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [taskPollingNodes, setTaskPollingNodes] = useState<string[]>([]);
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [isModelDrawerVisible, setIsModelDrawerVisible] = useState(false);
  const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [isResourceWidgetVisible, setIsResourceWidgetVisible] = useState(false);
  const [isSettingsWidgetVisible, setIsSettingsWidgetVisible] = useState(false);
  const [isGenLogVisible, setIsGenLogVisible] = useState(false);
  const [attachedAssets, setAttachedAssets] = useState<{ asset: any; fullUrl: string; file?: File; options?: { role?: string } }[]>([]);

  // --- 项目管理 ---
  const [projects, setProjects] = useState<PlaygroundProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);

  // --- 高频画布状态 ---
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [canvasTransform, setCanvasTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [activeTool, setActiveTool] = useState<ActiveTool>('pointer');
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [settingsWidgetPos, setSettingsWidgetPos] = useState<Point>({ x: window.innerWidth - 440, y: 32 });
  const [resourceWidgetPos, setResourceWidgetPos] = useState<Point>({ x: window.innerWidth - 400, y: 120 });
  const [modelWidgetPos, setModelWidgetPos] = useState<Point>({ x: window.innerWidth - 480, y: 100 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null!);

  // --- 派生数据 ---
  const currentModel = useMemo(() => models.find(m => m.mid === selectedMid) || null, [selectedMid, models]);

  const categories = useMemo(() => {
    return [...new Set(models.map(m => m.scheme_type || m.type_name))].filter(Boolean);
  }, [models]);

  const modelsInCategory = useMemo(() => {
    return models
      .filter(m => (m.scheme_type || m.type_name) === activeCategory)
      .filter(m => !searchModelKeyword || m.name.toLowerCase().includes(searchModelKeyword.toLowerCase()));
  }, [models, activeCategory, searchModelKeyword]);

  // --- 回调 ---
  const initParamDefaults = useCallback((params: SchemeParam[]) => {
    const defaults: Record<string, any> = {};
    for (const p of params) defaults[p.key] = p.default;
    setParamValues(defaults);
  }, []);

  const handleCategoryChange = useCallback((cat: string) => {
    setActiveCategory(cat);
    // 将分类名映射到 type key，用于查找默认模型
    const catToTypeKey = (c: string) => {
      if (c.includes('video') || c.includes('视频')) return 'video';
      if (c.includes('image') || c.includes('图片')) return 'image';
      return 'chat';
    };
    const typeKey = catToTypeKey(cat);
    const defMid = defaultModelMids[typeKey];
    const defModel = defMid ? models.find(m => m.mid === defMid) : null;
    if (defModel) {
      setSelectedMid(defModel.mid);
      initParamDefaults(defModel.params);
    } else {
      const first = models.find(m => (m.scheme_type || m.type_name) === cat);
      if (first) {
        setSelectedMid(first.mid);
        initParamDefaults(first.params);
      }
    }
  }, [models, defaultModelMids, initParamDefaults]);

  const handleSelectModel = useCallback((mid: string) => {
    setSelectedMid(mid);
    const model = models.find(m => m.mid === mid);
    if (model) initParamDefaults(model.params);
    setIsModelDrawerVisible(false);
  }, [models, initParamDefaults]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await request.get('/playground/projects') as any;
      if (res?.projects) {
        setProjects(res.projects);
      }
    } catch (e) {
      console.error('加载项目列表失败', e);
    }
  }, []);

  const loadStorageStats = useCallback(async () => {
    try {
      const res = await request.get('/playground/storage-stats') as any;
      setStorageStats(res);
    } catch (e) {
      console.error('加载存储统计失败', e);
    }
  }, []);

  const createProject = useCallback(async (name?: string): Promise<number | null> => {
    try {
      const res = await request.post('/playground/projects', { name: name || '未命名项目' }) as any;
      if (res?.id) {
        setCurrentProjectId(res.id);
        await loadProjects();
        return res.id;
      }
    } catch (e) {
      console.error('创建项目失败', e);
    }
    return null;
  }, [loadProjects]);

  const saveCanvasState = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const canvasData = JSON.stringify({
        nodes: nodes.filter(n => !n.id.startsWith('local-asset-')).map(n => {
          // 提取已完成节点的关键渲染数据（URL），丢弃大体积的原始 API 响应
          let savedResultData = n.resultData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              const url = extractImageUrl(n.resultData);
              savedResultData = url ? { data: [{ url }] } : null;
            } else if (n.type === 'video') {
              const videoUrl = extractVideoUrl(n.resultData);
              const lastFrameUrl = n.resultData?.last_frame_url || n.resultData?.final_result?.last_frame_url || n.resultData?.content?.last_frame_url;
              savedResultData = videoUrl ? { content: { video_url: videoUrl, last_frame_url: lastFrameUrl } } : null;
            } else {
              // 文本类型保留原始数据
              savedResultData = n.resultData;
            }
          }
          return {
            id: n.id, type: n.type, status: n.status,
            x: n.x, y: n.y, width: n.width, height: n.height, zIndex: n.zIndex,
            taskData: n.taskData, resultData: savedResultData,
          };
        }),
        transform: canvasTransform,
      });
      await request.post(`/playground/projects/${currentProjectId}/save-canvas`, { canvas_data: canvasData });
    } catch (e) {
      console.warn('画布状态保存失败', e);
    }
  }, [currentProjectId, nodes, canvasTransform]);

  // --- 初始化数据加载 ---
  React.useEffect(() => {
    document.title = 'TokensByte AI Studio';
    (async () => {
      try {
        setLoading(true);
        const [configRes, tokensRes] = await Promise.all([
          request.get('/plugins/playground/playground-public-config') as Promise<any>,
          request.get('/tokens').catch(() => ({ data: [] })) as Promise<any>
        ]);

        const enabledModels: PlaygroundModel[] = configRes?.models || [];
        const defaultMids: Record<string, string> = configRes?.default_model_mids || {};
        setModels(enabledModels);
        setDefaultModelMids(defaultMids);

        if (enabledModels.length > 0) {
          const cats = [...new Set(enabledModels.map(m => m.scheme_type || m.type_name))].filter(Boolean);
          const firstCat = cats[0] || '';
          setActiveCategory(firstCat);

          // 将分类名映射到 type key，用于查找默认模型
          const catToTypeKey = (cat: string) => {
            if (cat.includes('video') || cat.includes('视频')) return 'video';
            if (cat.includes('image') || cat.includes('图片')) return 'image';
            return 'chat';
          };

          // 优先选择当前分类的默认模型
          const typeKey = catToTypeKey(firstCat);
          const defaultMid = defaultMids[typeKey];
          const defaultModel = defaultMid ? enabledModels.find(m => m.mid === defaultMid) : null;

          if (defaultModel) {
            setSelectedMid(defaultModel.mid);
            const defaults: Record<string, any> = {};
            for (const p of defaultModel.params) defaults[p.key] = p.default;
            setParamValues(defaults);
          } else {
            // 回退：选第一个分类的第一个模型
            const firstModel = enabledModels.find(m => (m.scheme_type || m.type_name) === firstCat);
            if (firstModel) {
              setSelectedMid(firstModel.mid);
              const defaults: Record<string, any> = {};
              for (const p of firstModel.params) defaults[p.key] = p.default;
              setParamValues(defaults);
            }
          }
        }

        if (tokensRes?.data && Array.isArray(tokensRes.data)) {
          setApiTokens(tokensRes.data);
          const savedToken = localStorage.getItem('playground_saved_token');
          if (savedToken && tokensRes.data.some((t: any) => t.token_key === savedToken)) {
            setSelectedTokenKey(savedToken);
          } else if (tokensRes.data.length > 0) {
            setSelectedTokenKey(tokensRes.data[0].token_key);
            localStorage.setItem('playground_saved_token', tokensRes.data[0].token_key);
          }
        }
      } catch (e) {
        console.error('Data initialization failed', e);
      } finally {
        setLoading(false);
      }
      loadStorageStats();
    })();
  }, [loadStorageStats]);

  // --- 加载当前项目的画布数据 ---
  React.useEffect(() => {
    const projectIdNum = projectId;
    setCurrentProjectId(projectIdNum);
    (async () => {
      try {
        const res = await request.get(`/playground/projects/${projectIdNum}`) as any;
        const assets = res?.assets || [];
        // 尝试从 canvas_data 恢复
        if (res?.project?.canvas_data) {
          try {
            const canvasData = JSON.parse(res.project.canvas_data);
            if (canvasData?.nodes?.length > 0) {
              // 回填缺失的 resultData (分组匹配以支持同 prompt 多次生成)
              const assetGroup = new Map<string, any[]>();
              for (const a of assets) {
                if (a.prompt) {
                  if (!assetGroup.has(a.prompt)) assetGroup.set(a.prompt, []);
                  assetGroup.get(a.prompt)!.push(a);
                }
              }
              const fixedNodes = canvasData.nodes.map((n: any) => {
                // 检测节点是否需要从 assets 回填
                const needsFix = (() => {
                  if (n.status === 'loading') return true;
                  if (!n.taskData?.model_id) return true;
                  if (n.status !== 'completed') return false;
                  if (!n.resultData) return true;
                  // resultData 存在但无法提取有效 URL 也需要回填
                  if (n.type === 'image' && !extractImageUrl(n.resultData)) return true;
                  if (n.type === 'video' && !extractVideoUrl(n.resultData)) return true;
                  return false;
                })();

                if (!needsFix) return n;

                const matches = assetGroup.get(n.taskData?.prompt || '');
                const match = matches && matches.length > 0 ? matches.shift() : null;
                if (!match || !match.file_url) return n;

                return {
                  ...n,
                  status: 'completed',
                  taskData: {
                    ...n.taskData,
                    created_at: match.created_at || n.taskData?.created_at,
                    model_id: match.model_id || n.taskData?.model_id,
                    model_name: match.model_name || n.taskData?.model_name,
                    file_size: match.file_size || n.taskData?.file_size,
                    width: match.width || n.taskData?.width,
                    height: match.height || n.taskData?.height,
                  },
                  resultData: match.asset_type === 'image'
                    ? { data: [{ url: match.file_url }] }
                    : { content: { video_url: match.file_url } },
                };
              });

              // 补充 canvas_data 中缺失但 assets 表中存在的记录
              // （解决 persistAsset 持久化成功但 canvas 尚未保存的情况）
              const existingAssetIds = new Set(
                fixedNodes.map((n: any) => n.id).filter((id: string) => id.startsWith('asset-'))
              );
              // 同时收集已有节点的 URL 用于去重
              const existingUrls = new Set<string>();
              fixedNodes.forEach((n: any) => {
                if (n.type === 'image') {
                  const url = extractImageUrl(n.resultData);
                  if (url) existingUrls.add(url);
                } else if (n.type === 'video') {
                  const url = extractVideoUrl(n.resultData);
                  if (url) existingUrls.add(url);
                }
              });
              const missingAssets = assets.filter((a: any) => {
                if (a.asset_type !== 'image' && a.asset_type !== 'video') return false;
                if (!a.file_url) return false;
                // 按 asset ID 匹配
                if (existingAssetIds.has(`asset-${a.id}`)) return false;
                // 按 URL 去重（避免同一图片以不同节点 ID 重复出现）
                if (existingUrls.has(a.file_url)) return false;
                return true;
              });
              if (missingAssets.length > 0) {
                const TARGET_HEIGHT = 320;
                const GAP = 5;
                const maxZIndex = Math.max(...fixedNodes.map((n: any) => n.zIndex || 0), 0);
                
                // 寻找现有的最右边界
                let currentX = Math.max(...fixedNodes.map((n: any) => (n.x || 0) + (n.width || 480)), 600) + GAP;
                // 尝试对齐到最后一行的 Y
                let currentY = 100;
                if (fixedNodes.length > 0) {
                  currentY = fixedNodes[fixedNodes.length - 1].y || 100;
                }

                missingAssets.forEach((asset: any, idx: number) => {
                  let pos = { x: currentX, y: currentY };
                  let savedPosFound = false;
                  try {
                    const nd = JSON.parse(asset.canvas_node_data);
                    if (nd?.x !== undefined) {
                      pos = { x: nd.x, y: nd.y };
                      savedPosFound = true;
                    }
                  } catch {}

                  const origW = asset.width || 480;
                  const origH = asset.height || 320;
                  const targetWidth = (origW / origH) * TARGET_HEIGHT;

                  fixedNodes.push({
                    id: `asset-${asset.id}`,
                    type: asset.asset_type,
                    status: 'completed' as const,
                    taskData: { 
                      prompt: asset.prompt, 
                      created_at: asset.created_at, 
                      model_id: asset.model_id, 
                      model_name: asset.model_name,
                      file_size: asset.file_size,
                      width: asset.width,
                      height: asset.height
                    },
                    resultData: asset.asset_type === 'image'
                      ? { data: [{ url: asset.file_url }] }
                      : { content: { video_url: asset.file_url } },
                    x: pos.x, y: pos.y,
                    width: targetWidth, height: TARGET_HEIGHT,
                    zIndex: maxZIndex + idx + 1,
                  });
                  
                  if (!savedPosFound) {
                    currentX += targetWidth + GAP;
                  }
                });
              }

              setNodes(fixedNodes);
              if (canvasData.transform) {
                setCanvasTransform(canvasData.transform);
              }
              return; // 恢复成功，直接返回
            }
          } catch {}
        }

        // canvas_data 为空但有 assets，从 assets 重建节点
        if (assets.length > 0) {
          const TARGET_HEIGHT = 320;
          const GAP = 5;
          const validAssets = assets.filter((a: any) => a.asset_type === 'image' || a.asset_type === 'video');
          const COLS = Math.max(3, Math.ceil(Math.sqrt(validAssets.length)));
          
          let currentX = 0;
          let currentY = 0;
          let maxRowWidth = 0;

          const rebuiltNodes = validAssets.map((asset: any, idx: number) => {
            const origW = asset.width || 480;
            const origH = asset.height || 320;
            const targetWidth = (origW / origH) * TARGET_HEIGHT;
            
            if (idx > 0 && idx % COLS === 0) {
              currentX = 0;
              currentY += TARGET_HEIGHT + GAP;
            }
            
            const node = {
              id: `asset-${asset.id}`,
              type: asset.asset_type,
              status: 'completed' as const,
              taskData: { 
                prompt: asset.prompt, 
                created_at: asset.created_at, 
                model_id: asset.model_id, 
                model_name: asset.model_name,
                file_size: asset.file_size,
                width: asset.width,
                height: asset.height
              },
              resultData: asset.asset_type === 'image'
                ? { data: [{ url: asset.file_url }] }
                : { content: { video_url: asset.file_url } },
              x: currentX, y: currentY,
              width: targetWidth, height: TARGET_HEIGHT,
              zIndex: idx + 1,
            };
            
            currentX += targetWidth + GAP;
            if (currentX > maxRowWidth) {
              maxRowWidth = currentX;
            }
            
            return node;
          });

          if (rebuiltNodes.length > 0) {
            setNodes(rebuiltNodes);
            
            // 计算边界框并居中缩放
            const totalWidth = maxRowWidth > 0 ? maxRowWidth - GAP : 0;
            const totalHeight = currentY + TARGET_HEIGHT;
            
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // 留出 20% 的边距
            const scaleX = (viewportWidth * 0.8) / (totalWidth || 1);
            const scaleY = (viewportHeight * 0.8) / (totalHeight || 1);
            const targetScale = Math.min(1, scaleX, scaleY);
            
            const translateX = (viewportWidth - totalWidth * targetScale) / 2;
            const translateY = (viewportHeight - totalHeight * targetScale) / 2;
            
            setCanvasTransform({ x: translateX, y: translateY, scale: targetScale });
          }
        }
      } catch (e) {
        console.warn('加载项目画布数据失败', e);
      }
    })();
  }, [projectId]);

  // --- 离开页面时自动保存画布 ---
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;
  const transformRef2 = React.useRef(canvasTransform);
  transformRef2.current = canvasTransform;
  const projectIdRef = React.useRef(currentProjectId);
  projectIdRef.current = currentProjectId;

  React.useEffect(() => {
    const doSave = () => {
      const pid = projectIdRef.current;
      const currentNodes = nodesRef.current;
      if (!pid || currentNodes.length === 0) return;
      const canvasData = JSON.stringify({
        nodes: currentNodes.filter(n => !n.id.startsWith('local-asset-')).map(n => {
          let savedResultData = n.resultData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              const url = extractImageUrl(n.resultData);
              savedResultData = url ? { data: [{ url }] } : null;
            } else if (n.type === 'video') {
              const videoUrl = extractVideoUrl(n.resultData);
              const lastFrameUrl = n.resultData?.last_frame_url || n.resultData?.final_result?.last_frame_url || n.resultData?.content?.last_frame_url;
              savedResultData = videoUrl ? { content: { video_url: videoUrl, last_frame_url: lastFrameUrl } } : null;
            }
          }
          return {
            id: n.id, type: n.type, status: n.status,
            x: n.x, y: n.y, width: n.width, height: n.height, zIndex: n.zIndex,
            taskData: n.taskData, resultData: savedResultData,
          };
        }),
        transform: transformRef2.current,
      });
      // 使用 fetch+keepalive 保证页面关闭时也能发送（含 Auth header）
      const token = localStorage.getItem('token');
      const baseURL = (request.defaults?.baseURL || '/api/v1') as string;
      fetch(`${baseURL}/playground/projects/${pid}/save-canvas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ canvas_data: canvasData }),
        keepalive: true,
      }).catch(() => {}); // 静默失败
    };

    window.addEventListener('beforeunload', doSave);
    return () => {
      window.removeEventListener('beforeunload', doSave);
      // 组件卸载时保存（如返回项目列表）
      doSave();
    };
  }, []);

  // --- 空格键全局监听 ---
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        setIsSpaceDown(true);
        e.preventDefault();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpaceDown(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // --- 构造 Context Values ---
  const canvasValue = useMemo<CanvasContextValue>(() => ({
    canvasTransform, setCanvasTransform,
    activeTool, setActiveTool,
    isSpaceDown,
    isDraggingCanvas, setIsDraggingCanvas,
    draggingNodeId, setDraggingNodeId,
    nodes, setNodes,
    maxZIndex, setMaxZIndex,
    canvasRef,
    settingsWidgetPos, setSettingsWidgetPos,
    resourceWidgetPos, setResourceWidgetPos,
    modelWidgetPos, setModelWidgetPos,
    selectedNodeId, setSelectedNodeId,
  }), [
    canvasTransform, activeTool, isSpaceDown, isDraggingCanvas,
    draggingNodeId, nodes, maxZIndex, settingsWidgetPos, resourceWidgetPos, modelWidgetPos, selectedNodeId
  ]);

  const playgroundValue = useMemo<PlaygroundContextValue>(() => ({
    loading, models, selectedMid, setSelectedMid,
    currentModel, categories, activeCategory, setActiveCategory,
    modelsInCategory, searchModelKeyword, setSearchModelKeyword,
    paramValues, setParamValues, initParamDefaults,
    prompt, setPrompt,
    generating, setGenerating,
    taskPollingNodes, setTaskPollingNodes,
    apiTokens, selectedTokenKey, setSelectedTokenKey,
    isModelDrawerVisible, setIsModelDrawerVisible,
    isTokenModalVisible, setIsTokenModalVisible,
    isSettingsCollapsed, setIsSettingsCollapsed,
    isResourceWidgetVisible, setIsResourceWidgetVisible,
    isSettingsWidgetVisible, setIsSettingsWidgetVisible,
    isGenLogVisible, setIsGenLogVisible,
    handleCategoryChange, handleSelectModel,
    projects, currentProjectId, setCurrentProjectId,
    loadProjects, createProject, saveCanvasState,
    attachedAssets, setAttachedAssets,
    storageStats, loadStorageStats,
  }), [
    loading, models, selectedMid, currentModel, categories,
    activeCategory, modelsInCategory, searchModelKeyword,
    paramValues, prompt, generating, taskPollingNodes,
    apiTokens, selectedTokenKey,
    isModelDrawerVisible, isTokenModalVisible, isSettingsCollapsed, isResourceWidgetVisible, isSettingsWidgetVisible, isGenLogVisible,
    handleCategoryChange, handleSelectModel, initParamDefaults,
    projects, currentProjectId, loadProjects, createProject, saveCanvasState,
    attachedAssets, setAttachedAssets,
    storageStats, loadStorageStats,
  ]);

  return (
    <CanvasContext.Provider value={canvasValue}>
      <PlaygroundContext.Provider value={playgroundValue}>
        {children}
      </PlaygroundContext.Provider>
    </CanvasContext.Provider>
  );
};
