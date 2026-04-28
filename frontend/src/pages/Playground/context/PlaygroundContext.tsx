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
  attachedAssets: { asset: any; fullUrl: string; file?: File }[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<{ asset: any; fullUrl: string; file?: File }[]>>;
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
  const [generating, setGenerating] = useState(false);
  const [taskPollingNodes, setTaskPollingNodes] = useState<string[]>([]);
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [isModelDrawerVisible, setIsModelDrawerVisible] = useState(false);
  const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [isResourceWidgetVisible, setIsResourceWidgetVisible] = useState(false);
  const [isSettingsWidgetVisible, setIsSettingsWidgetVisible] = useState(true);
  const [isGenLogVisible, setIsGenLogVisible] = useState(false);
  const [attachedAssets, setAttachedAssets] = useState<{ asset: any; fullUrl: string; file?: File }[]>([]);

  // --- 项目管理 ---
  const [projects, setProjects] = useState<PlaygroundProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  // --- 高频画布状态 ---
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [canvasTransform, setCanvasTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [activeTool, setActiveTool] = useState<ActiveTool>('pointer');
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [settingsWidgetPos, setSettingsWidgetPos] = useState<Point>({ x: window.innerWidth - 380, y: 32 });
  const [resourceWidgetPos, setResourceWidgetPos] = useState<Point>({ x: window.innerWidth - 380, y: 120 });
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
    const first = models.find(m => (m.scheme_type || m.type_name) === cat);
    if (first) {
      setSelectedMid(first.mid);
      initParamDefaults(first.params);
    }
  }, [models, initParamDefaults]);

  const handleSelectModel = useCallback((mid: string) => {
    setSelectedMid(mid);
    const model = models.find(m => m.mid === mid);
    if (model) initParamDefaults(model.params);
    setIsModelDrawerVisible(false);
  }, [models, initParamDefaults]);

  // --- 项目管理函数 ---
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
        nodes: nodes.map(n => {
          // 提取已完成节点的关键渲染数据（URL），丢弃大体积的原始 API 响应
          let savedResultData = n.resultData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              const imgData = n.resultData?.data?.[0] || n.resultData?.content?.image_url;
              const url = typeof imgData === 'string' ? imgData : imgData?.url;
              savedResultData = url ? { data: [{ url }] } : null;
            } else if (n.type === 'video') {
              const videoUrl = n.resultData?.content?.video_url
                || n.resultData?.final_result?.video_url
                || n.resultData?.video_url;
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
        setModels(enabledModels);

        if (enabledModels.length > 0) {
          const cats = [...new Set(enabledModels.map(m => m.scheme_type || m.type_name))];
          const firstCat = cats[0] || '';
          setActiveCategory(firstCat);
          const firstModel = enabledModels.find(m => (m.scheme_type || m.type_name) === firstCat);
          if (firstModel) {
            setSelectedMid(firstModel.mid);
            const defaults: Record<string, any> = {};
            for (const p of firstModel.params) defaults[p.key] = p.default;
            setParamValues(defaults);
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
    })();
  }, []);

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
              // 回填缺失的 resultData
              // 回填缺失的 resultData (分组匹配以支持同 prompt 多次生成)
              const assetGroup = new Map<string, any[]>();
              for (const a of assets) {
                if (a.prompt) {
                  if (!assetGroup.has(a.prompt)) assetGroup.set(a.prompt, []);
                  assetGroup.get(a.prompt)!.push(a);
                }
              }
              const fixedNodes = canvasData.nodes.map((n: any) => {
                if ((n.status === 'completed' && !n.resultData) || n.status === 'loading') {
                  const matches = assetGroup.get(n.taskData?.prompt || '');
                  if (matches && matches.length > 0) {
                    const match = matches.shift(); // 消费掉一个
                    return {
                      ...n,
                      status: 'completed',
                      resultData: match.asset_type === 'image'
                        ? { data: [{ url: match.file_url }] }
                        : { content: { video_url: match.file_url } },
                    };
                  }
                }
                return n;
              });
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
          const rebuiltNodes = assets
            .filter((a: any) => a.asset_type === 'image' || a.asset_type === 'video')
            .map((asset: any, idx: number) => {
              let pos = { x: 100 + (idx % 3) * 520, y: 100 + Math.floor(idx / 3) * 380 };
              try {
                const nd = JSON.parse(asset.canvas_node_data);
                if (nd?.x !== undefined) pos = { x: nd.x, y: nd.y };
              } catch {}
              return {
                id: `asset-${asset.id}`,
                type: asset.asset_type,
                status: 'completed' as const,
                taskData: { prompt: asset.prompt },
                resultData: asset.asset_type === 'image'
                  ? { data: [{ url: asset.file_url }] }
                  : { content: { video_url: asset.file_url } },
                x: pos.x, y: pos.y,
                width: asset.width || 480, height: asset.height || 320,
                zIndex: idx + 1,
              };
            });
          if (rebuiltNodes.length > 0) setNodes(rebuiltNodes);
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
        nodes: currentNodes.map(n => {
          let savedResultData = n.resultData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              const imgData = n.resultData?.data?.[0] || n.resultData?.content?.image_url;
              const url = typeof imgData === 'string' ? imgData : imgData?.url;
              savedResultData = url ? { data: [{ url }] } : null;
            } else if (n.type === 'video') {
              const videoUrl = n.resultData?.content?.video_url || n.resultData?.final_result?.video_url || n.resultData?.video_url;
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
  }), [
    loading, models, selectedMid, currentModel, categories,
    activeCategory, modelsInCategory, searchModelKeyword,
    paramValues, prompt, generating, taskPollingNodes,
    apiTokens, selectedTokenKey,
    isModelDrawerVisible, isTokenModalVisible, isSettingsCollapsed, isResourceWidgetVisible, isSettingsWidgetVisible, isGenLogVisible,
    handleCategoryChange, handleSelectModel, initParamDefaults,
    projects, currentProjectId, loadProjects, createProject, saveCanvasState,
    attachedAssets, setAttachedAssets,
  ]);

  return (
    <CanvasContext.Provider value={canvasValue}>
      <PlaygroundContext.Provider value={playgroundValue}>
        {children}
      </PlaygroundContext.Provider>
    </CanvasContext.Provider>
  );
};
