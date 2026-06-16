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
import useSettingsStore from '../../../store/settings';
import { message } from 'antd';

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
  selectedNodeIds: string[];
  setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
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
  // 模型配置锁
  modelConfigs: Record<string, Record<string, any>>;
  saveModelConfig: (mid: string, values: Record<string, any>, notify?: boolean) => Promise<void>;
  deleteModelConfig: (mid: string) => Promise<void>;
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
  setApiTokens: React.Dispatch<React.SetStateAction<any[]>>;
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
  saveCanvasState: (overrideNodes?: CanvasNode[]) => Promise<void>;
  // 素材附件
  attachedAssets: { asset: any; fullUrl: string; file?: File; options?: { role?: string } }[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<{ asset: any; fullUrl: string; file?: File }[]>>;
  // 存储统计
  storageStats: any;
  loadStorageStats: () => Promise<void>;
  // 聊天消息（与画布 nodes 隔离）
  chatMessages: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
  setChatMessages: React.Dispatch<React.SetStateAction<{ role: 'user' | 'assistant'; content: string; timestamp: number }[]>>;
  streamingContent: string;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
  defaultModelMids: string[];
  favorites: string[];
  toggleFavorite: (mid: string | number) => void;
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
  const { settings } = useSettingsStore();

  // --- 低频业务状态 ---
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<PlaygroundModel[]>([]);
  const [selectedMid, setSelectedMid] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [searchModelKeyword, setSearchModelKeyword] = useState('');
  // 聊天消息状态（与画布 nodes 完全隔离）
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string; timestamp: number }[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [modelConfigs, setModelConfigs] = useState<Record<string, Record<string, any>>>({});
  const [defaultModelMids, setDefaultModelMids] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  const [generating, setGenerating] = useState(false);
  const [taskPollingNodes, setTaskPollingNodes] = useState<string[]>([]);
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [isModelDrawerVisible, setIsModelDrawerVisible] = useState(window.innerWidth > 768);
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
  const [nodes, setNodesState] = useState<CanvasNode[]>([]);
  const nodesRef = useRef(nodes);
  const setNodes = useCallback((action: React.SetStateAction<CanvasNode[]>) => {
    setNodesState(prev => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;
      nodesRef.current = next;
      return next;
    });
  }, []);
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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null!);

  // --- 派生数据 ---
  const currentModel = useMemo(() => models.find(m => m.mid === selectedMid) || null, [selectedMid, models]);

  const categories = useMemo(() => {
    const cats = [...new Set(models.map(m => m.scheme_type || m.type_name))].filter(Boolean);
    const getWeight = (cat: string) => {
      const lower = cat.toLowerCase();
      if (lower.includes('图') || lower.includes('image')) return 100;
      if (lower.includes('视') || lower.includes('video')) return 90;
      if (lower.includes('聊') || lower.includes('对话') || lower.includes('chat') || lower.includes('文本') || lower.includes('text')) return 80;
      return 0;
    };
    cats.sort((a, b) => getWeight(b) - getWeight(a));
    const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
    if (mids.length > 0 || favorites.length > 0) {
      return ['默认展示', ...cats];
    }
    return cats;
  }, [models, defaultModelMids, favorites]);

  const modelsInCategory = useMemo(() => {
    const sortFn = (a: PlaygroundModel, b: PlaygroundModel) => {
      const sa = a.sort_order ?? 0;
      const sb = b.sort_order ?? 0;
      if (sa !== sb) return sb - sa; // 权重数值大排在前面（降序）
      return a.name.localeCompare(b.name); // 权重相同时按字母拼音升序
    };
    if (activeCategory === '默认展示') {
      const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
      const combinedMidsStr = Array.from(new Set([...mids, ...favorites])).map(String);
      return models
        .filter(m => combinedMidsStr.includes(String(m.mid)))
        .filter(m => !searchModelKeyword || m.name.toLowerCase().includes(searchModelKeyword.toLowerCase()))
        .sort(sortFn);
    }
    return models
      .filter(m => (m.scheme_type || m.type_name) === activeCategory)
      .filter(m => !searchModelKeyword || m.name.toLowerCase().includes(searchModelKeyword.toLowerCase()))
      .sort(sortFn);
  }, [models, activeCategory, searchModelKeyword, defaultModelMids, favorites]);

  // --- Favorites ---
  React.useEffect(() => {
    const loadFavs = () => {
      try {
        const stored = localStorage.getItem('playground_favorites');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setFavorites(parsed.map(String));
          }
        }
      } catch (e) {}
    };
    loadFavs();
    window.addEventListener('playground_favorites_changed', loadFavs);
    return () => window.removeEventListener('playground_favorites_changed', loadFavs);
  }, []);

  const toggleFavorite = useCallback((mid: string | number) => {
    const midStr = String(mid);
    const prevStrs = favorites.map(String);
    const next = prevStrs.includes(midStr) ? prevStrs.filter(id => id !== midStr) : [...prevStrs, midStr];
    setFavorites(next);
    localStorage.setItem('playground_favorites', JSON.stringify(next));
    window.dispatchEvent(new Event('playground_favorites_changed'));
  }, [favorites]);

  // --- 回调 ---
  const initParamDefaults = useCallback((params: SchemeParam[]) => {
    const defaults: Record<string, any> = {};
    for (const p of params) defaults[p.key] = p.default;
    setParamValues(defaults);
  }, []);

  const handleCategoryChange = useCallback((cat: string) => {
    setActiveCategory(cat);
    if (cat === '默认展示') {
      const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
      const combinedMidsStr = Array.from(new Set([...mids, ...favorites])).map(String);
      const first = models.find(m => combinedMidsStr.includes(String(m.mid)));
      if (first) {
        setSelectedMid(first.mid);
        if (modelConfigs[first.mid]) {
          setParamValues(modelConfigs[first.mid]);
        } else {
          initParamDefaults(first.params);
        }
      }
      return;
    }

    const typeModels = models.filter(m => (m.scheme_type || m.type_name) === cat);
    const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
    const combinedMidsStr = Array.from(new Set([...mids, ...favorites])).map(String);
    const defModel = typeModels.find(m => combinedMidsStr.includes(String(m.mid)));
    if (defModel) {
      setSelectedMid(defModel.mid);
      if (modelConfigs[defModel.mid]) {
        setParamValues(modelConfigs[defModel.mid]);
      } else {
        initParamDefaults(defModel.params);
      }
    } else {
      const first = models.find(m => (m.scheme_type || m.type_name) === cat);
      if (first) {
        setSelectedMid(first.mid);
        if (modelConfigs[first.mid]) {
          setParamValues(modelConfigs[first.mid]);
        } else {
          initParamDefaults(first.params);
        }
      }
    }
  }, [models, defaultModelMids, favorites, initParamDefaults, modelConfigs]);

  const handleSelectModel = useCallback((mid: string) => {
    const prevModel = models.find(m => m.mid === selectedMid);
    const nextModel = models.find(m => m.mid === mid);
    setSelectedMid(mid);
    if (nextModel) {
      if (modelConfigs[mid]) {
        setParamValues(modelConfigs[mid]);
      } else {
        initParamDefaults(nextModel.params);
      }
    }
    setIsModelDrawerVisible(false);
    // 跨类型切换时清空聊天消息
    if (prevModel?.scheme_type !== nextModel?.scheme_type) {
      setChatMessages([]);
      setStreamingContent('');
    }
  }, [models, selectedMid, initParamDefaults, setChatMessages, setStreamingContent, modelConfigs]);

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

  const saveModelConfig = useCallback(async (mid: string, values: Record<string, any>, notify = true) => {
    try {
      await request.post('/playground/model-configs', {
        model_mid: mid,
        param_values: JSON.stringify(values),
        is_locked: 1
      });
      setModelConfigs(prev => ({
        ...prev,
        [mid]: values
      }));
    } catch (e) {
      console.error('保存模型配置失败', e);
    }
  }, []);

  const deleteModelConfig = useCallback(async (mid: string) => {
    try {
      await request.delete(`/playground/model-configs/${mid}`);
      setModelConfigs(prev => {
        const next = { ...prev };
        delete next[mid];
        return next;
      });
      // 恢复系统默认值
      const model = models.find(m => m.mid === mid);
      if (model) {
        const defaults: Record<string, any> = {};
        for (const p of model.params) defaults[p.key] = p.default;
        setParamValues(defaults);
      }
    } catch (e) {
      console.error('删除模型配置失败', e);
    }
  }, [models]);

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


  const transformRef2 = React.useRef(canvasTransform);
  transformRef2.current = canvasTransform;
  const projectIdRef = React.useRef(currentProjectId);
  projectIdRef.current = currentProjectId;

  const saveCanvasState = useCallback(async (overrideNodes?: CanvasNode[]) => {
    const pid = projectIdRef.current;
    if (!pid) return;
    try {
      const targetNodes = overrideNodes || nodesRef.current;
      const canvasData = JSON.stringify({
        nodes: targetNodes.filter(n => !n.id.startsWith('local-asset-')).map(n => {
          let savedResultData = n.resultData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              const url = extractImageUrl(n.resultData);
              savedResultData = url ? { data: [{ url }] } : null;
            } else if (n.type === 'video') {
              const videoUrl = extractVideoUrl(n.resultData);
              const lastFrameUrl = n.resultData?.content?.last_frame_url || n.resultData?.data?.[0]?.last_frame_url;
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
        transform: transformRef2.current,
      });
      await request.post(`/playground/projects/${pid}/save-canvas`, { canvas_data: canvasData });
    } catch (e) {
      console.warn('画布状态保存失败', e);
    }
  }, []);

  // --- Tab Title Synchronization ---
  React.useEffect(() => {
    const siteName = settings?.site?.name || 'AI 创作中心';
    const currentProject = projects.find(p => p.id === currentProjectId);
    const projectName = currentProject?.name || '未命名项目';
    document.title = `${projectName}-${siteName}`;
  }, [settings, projects, currentProjectId]);

  // --- 1秒防抖后台自动同步模型配置参数 ---
  React.useEffect(() => {
    if (!selectedMid || !modelConfigs[selectedMid]) return;
    const timer = setTimeout(() => {
      if (JSON.stringify(paramValues) !== JSON.stringify(modelConfigs[selectedMid])) {
        saveModelConfig(selectedMid, paramValues, false); // 静默后台保存，不弹出提示
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [paramValues, selectedMid, modelConfigs, saveModelConfig]);

  // --- 初始化数据加载 ---
  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [configRes, tokensRes, configsRes] = await Promise.all([
          request.get('/plugins/playground/playground-public-config') as Promise<any>,
          request.get('/tokens').catch(() => ({ data: [] })) as Promise<any>,
          request.get('/playground/model-configs').catch(() => ({ configs: [] })) as Promise<any>
        ]);

        if (configsRes?.configs && Array.isArray(configsRes.configs)) {
          const configMap: Record<string, Record<string, any>> = {};
          for (const item of configsRes.configs) {
            try {
              configMap[item.model_mid] = JSON.parse(item.param_values);
            } catch (e) {
              console.error('解析锁定的模型配置参数失败', e);
            }
          }
          setModelConfigs(configMap);
        }

        const enabledModels: PlaygroundModel[] = configRes?.models || [];
        const rawDefaultModelMids = configRes?.default_model_mids;
        let midsArray: string[] = [];
        if (Array.isArray(rawDefaultModelMids)) {
          midsArray = rawDefaultModelMids;
        } else if (typeof rawDefaultModelMids === 'object' && rawDefaultModelMids !== null) {
          midsArray = Object.values(rawDefaultModelMids).filter(v => typeof v === 'string') as string[];
        }
        setModels(enabledModels);
        setDefaultModelMids(midsArray);

        if (enabledModels.length > 0) {
          const cats = [...new Set(enabledModels.map(m => m.scheme_type || m.type_name))].filter(Boolean);
          const getWeight = (cat: string) => {
            const lower = cat.toLowerCase();
            if (lower.includes('图') || lower.includes('image')) return 100;
            if (lower.includes('视') || lower.includes('video')) return 90;
            if (lower.includes('聊') || lower.includes('对话') || lower.includes('chat') || lower.includes('文本') || lower.includes('text')) return 80;
            return 0;
          };
          cats.sort((a, b) => getWeight(b) - getWeight(a));

          let firstCat = cats[0] || '';
          let defaultModel: PlaygroundModel | null = null;

          let storedFavorites: string[] = [];
          try {
            const stored = localStorage.getItem('playground_favorites');
            if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed)) {
                storedFavorites = parsed.map(String);
              }
            }
          } catch (e) {}

          if (midsArray.length > 0 || storedFavorites.length > 0) {
            firstCat = '默认展示';
            const combinedMidsStr = [...midsArray, ...storedFavorites].map(String);
            defaultModel = enabledModels.find(m => combinedMidsStr.includes(String(m.mid))) || null;
          }

          setActiveCategory(firstCat);

          // 一进入项目，默认不自动选中任何具体模型，保留空白状态以展示画布和已有的项目卡片资产。
          // 当用户点击或主动进行模型选择时再做切换。
          setIsSettingsWidgetVisible(false);
          setIsModelDrawerVisible(window.innerWidth > 768);
          /*
          if (defaultModel) {
            setSelectedMid(defaultModel.mid);
            const defaults: Record<string, any> = {};
            for (const p of defaultModel.params) defaults[p.key] = p.default;
            setParamValues(defaults);
          } else {
            const firstModel = enabledModels.find(m => (m.scheme_type || m.type_name) === firstCat);
            if (firstModel) {
              setSelectedMid(firstModel.mid);
              const defaults: Record<string, any> = {};
              for (const p of firstModel.params) defaults[p.key] = p.default;
              setParamValues(defaults);
            }
          }
          */
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
              // 回填缺失的 resultData
              // 建立 asset 索引：按 ID 和按 prompt 分组（prompt 组内按时间排序以便精确匹配）
              const assetById = new Map<number, any>();
              const assetByPrompt = new Map<string, any[]>();
              for (const a of assets) {
                assetById.set(a.id, a);
                if (a.prompt) {
                  if (!assetByPrompt.has(a.prompt)) assetByPrompt.set(a.prompt, []);
                  assetByPrompt.get(a.prompt)!.push(a);
                }
              }
              // 按创建时间排序，确保时间匹配的准确性
              assetByPrompt.forEach(arr => arr.sort((a: any, b: any) =>
                new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
              ));
              // 记录已被匹配过的 asset ID，防止一个 asset 被多个节点重复匹配
              const matchedAssetIds = new Set<number>();

              const fixedNodes = canvasData.nodes.map((n: any) => {
                // 有 task_id 的 loading 节点 → 交给自动轮询恢复
                if (n.status === 'loading' && n.taskData?.task_id) return n;
                // 无 task_id 的 loading 节点 → 检查创建时间
                if (n.status === 'loading' && !n.taskData?.task_id) {
                  const createdAt = new Date(n.taskData?.created_at || 0).getTime();
                  const elapsedMs = Date.now() - createdAt;
                  if (elapsedMs < 30 * 60 * 1000) return { ...n, status: 'loading' };
                  return { ...n, status: 'error', resultData: { message: '生成任务超时，请重新生成' } };
                }

                // 检测已完成节点是否需要从 assets 回填
                const needsFix = (() => {
                  if (!n.taskData?.model_id) return true;
                  if (n.status !== 'completed') return false;
                  if (!n.resultData) return true;
                  if (n.type === 'image' && !extractImageUrl(n.resultData)) return true;
                  if (n.type === 'video' && !extractVideoUrl(n.resultData)) return true;
                  return false;
                })();

                if (!needsFix) return n;

                // 策略1：按节点 ID 精确匹配（asset-{id} 形式）
                let match: any = null;
                const idMatch = n.id?.match(/^asset-(\d+)$/);
                if (idMatch) {
                  const candidate = assetById.get(Number(idMatch[1]));
                  if (candidate && candidate.file_url && !matchedAssetIds.has(candidate.id)) {
                    match = candidate;
                  }
                }

                // 策略2：按 created_at 时间戳最近匹配同 prompt 的 asset
                if (!match) {
                  const candidates = assetByPrompt.get(n.taskData?.prompt || '');
                  if (candidates) {
                    const nodeTime = new Date(n.taskData?.created_at || 0).getTime();
                    let bestDiff = Infinity;
                    for (const c of candidates) {
                      if (!c.file_url || matchedAssetIds.has(c.id)) continue;
                      const diff = Math.abs(new Date(c.created_at || 0).getTime() - nodeTime);
                      if (diff < bestDiff) { bestDiff = diff; match = c; }
                    }
                  }
                }

                if (!match || !match.file_url) return n;
                matchedAssetIds.add(match.id);

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
              const existingAssetIds = new Set(
                fixedNodes.map((n: any) => n.id).filter((id: string) => id.startsWith('asset-'))
              );
              // 收集已有节点的 URL 用于去重
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
                if (existingAssetIds.has(`asset-${a.id}`)) return false;
                if (existingUrls.has(a.file_url)) return false;
                if (matchedAssetIds.has(a.id)) return false;
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
                  } catch { }

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
          } catch { }
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
              const lastFrameUrl = n.resultData?.content?.last_frame_url || n.resultData?.data?.[0]?.last_frame_url;
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
      }).catch(() => { }); // 静默失败
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
    selectedNodeIds, setSelectedNodeIds,
  }), [
    canvasTransform, activeTool, isSpaceDown, isDraggingCanvas,
    draggingNodeId, nodes, maxZIndex, settingsWidgetPos, resourceWidgetPos, modelWidgetPos, selectedNodeId, selectedNodeIds
  ]);

  const playgroundValue = useMemo<PlaygroundContextValue>(() => ({
    loading, models, selectedMid, setSelectedMid,
    currentModel, categories, activeCategory, setActiveCategory,
    modelsInCategory, searchModelKeyword, setSearchModelKeyword,
    paramValues, setParamValues, initParamDefaults,
    modelConfigs, saveModelConfig, deleteModelConfig,
    prompt, setPrompt,
    generating, setGenerating,
    taskPollingNodes, setTaskPollingNodes,
    apiTokens, setApiTokens, selectedTokenKey, setSelectedTokenKey,
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
    chatMessages, setChatMessages, streamingContent, setStreamingContent,
    defaultModelMids, favorites, toggleFavorite
  }), [
    loading, models, selectedMid, currentModel, categories,
    activeCategory, modelsInCategory, searchModelKeyword,
    paramValues, modelConfigs, saveModelConfig, deleteModelConfig, prompt, generating, taskPollingNodes,
    apiTokens, setApiTokens, selectedTokenKey,
    isModelDrawerVisible, isTokenModalVisible, isSettingsCollapsed, isResourceWidgetVisible, isSettingsWidgetVisible, isGenLogVisible,
    handleCategoryChange, handleSelectModel, initParamDefaults,
    projects, currentProjectId, loadProjects, createProject, saveCanvasState,
    attachedAssets, setAttachedAssets,
    storageStats, loadStorageStats,
    chatMessages, streamingContent, defaultModelMids, favorites, toggleFavorite
  ]);

  return (
    <CanvasContext.Provider value={canvasValue}>
      <PlaygroundContext.Provider value={playgroundValue}>
        {children}
      </PlaygroundContext.Provider>
    </CanvasContext.Provider>
  );
};
