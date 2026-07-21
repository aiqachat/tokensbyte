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
import { isReferenceAssetUrl } from '../utils/nodeHelpers';
import useSettingsStore from '../../../store/settings';
import { message } from 'antd';
import toast from '../components/PlaygroundToast';
import { parseApiTimeAsUtc } from '../../../utils/timedisplay';

const safeParseDate = (dateStr?: string | null): Date => {
  return parseApiTimeAsUtc(dateStr) ?? new Date(NaN);
};

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
  connectingSourceId: string | null;
  setConnectingSourceId: React.Dispatch<React.SetStateAction<string | null>>;
  connectingMousePos: Point | null;
  setConnectingMousePos: React.Dispatch<React.SetStateAction<Point | null>>;
  handleRearrange: (overrideNodes?: CanvasNode[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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
  agentCurrentModel: PlaygroundModel | null;
  setAgentCurrentModel: React.Dispatch<React.SetStateAction<PlaygroundModel | null>>;
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
  isGenLogPinned: boolean;
  setIsGenLogPinned: React.Dispatch<React.SetStateAction<boolean>>;
  pageMode: 'normal' | 'node' | 'agent';
  setPageMode: React.Dispatch<React.SetStateAction<'normal' | 'node' | 'agent'>>;
  autoDisplayAssetDetails: boolean;
  setAutoDisplayAssetDetails: React.Dispatch<React.SetStateAction<boolean>>;
  autoDisplayModelSelector: boolean;
  setAutoDisplayModelSelector: React.Dispatch<React.SetStateAction<boolean>>;
  canvasSaveStatus: 'saved' | 'saving' | 'error';
  // 操作
  handleCategoryChange: (cat: string) => void;
  handleSelectModel: (mid: string) => void;
  // 项目管理
  projects: PlaygroundProject[];
  currentProjectId: number | null;
  setCurrentProjectId: React.Dispatch<React.SetStateAction<number | null>>;
  loadProjects: () => Promise<void>;
  createProject: (name?: string) => Promise<number | null>;
  duplicateProject: (projectId: number, newName: string) => Promise<number | null>;
  saveCanvasState: (overrideNodes?: CanvasNode[]) => Promise<void>;
  // 素材附件
  attachedAssets: { asset: any; fullUrl: string; file?: File; options?: { role?: string } }[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<{ asset: any; fullUrl: string; file?: File }[]>>;
  // 存储统计
  storageStats: any;
  loadStorageStats: () => Promise<void>;
  // 聊天消息（与画布 nodes 隔离，但可内嵌 nodeId 渲染多媒体）
  chatMessages: { role: 'user' | 'assistant'; content: string; timestamp: number; nodeId?: string }[];
  setChatMessages: React.Dispatch<React.SetStateAction<{ role: 'user' | 'assistant'; content: string; timestamp: number; nodeId?: string }[]>>;
  streamingContent: string;
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>;
  defaultModelMids: string[];
  favorites: string[];
  toggleFavorite: (mid: string | number) => void;
  advancedNodesConfig: {
    enabled: boolean;
    preview_enabled: boolean;
    volc_enhance_enabled: boolean;
    volc_enhance_plugin_active: boolean;
    prompt_enabled?: boolean;
    ai_video_enabled?: boolean;
    ai_image_enabled?: boolean;
    agent_enabled?: boolean;
    agent_mode_enabled?: boolean;
    agent_video_mode?: string;
    agent_welcome_title?: string;
    agent_welcome_desc?: string;
    agent_preset_prompts?: any[];
    agent_chat_models?: string[];
    unified_limit_enabled?: boolean;
    unified_limit_value?: number;
    preview_limit?: number;
    volc_enhance_limit?: number;
    prompt_limit?: number;
    ai_video_limit?: number;
    ai_image_limit?: number;
    agent_limit?: number;
    instance_limit?: number;
  } | null;
  activeSelectorNodeId: string | null;
  setActiveSelectorNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  openModelSelectorForNode: (nodeId: string) => void;
  activeSelectorNodeSelectedMid: string | number | null;
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
  const [activeSelectorNodeId, setActiveSelectorNodeId] = useState<string | null>(null);
  const saveCanvasStateRef = React.useRef<any>(null);
  // 聊天消息状态（与画布 nodes 完全隔离）
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string; timestamp: number; nodeId?: string }[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, any>>({});
  const [modelConfigs, setModelConfigs] = useState<Record<string, Record<string, any>>>({});
  const [defaultModelMids, setDefaultModelMids] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [advancedNodesConfig, setAdvancedNodesConfig] = useState<{
    enabled: boolean;
    preview_enabled: boolean;
    volc_enhance_enabled: boolean;
    volc_enhance_plugin_active: boolean;
    prompt_enabled?: boolean;
    ai_video_enabled?: boolean;
    ai_image_enabled?: boolean;
    agent_enabled?: boolean;
    agent_mode_enabled?: boolean;
    agent_video_mode?: string;
    agent_welcome_title?: string;
    agent_welcome_desc?: string;
    agent_preset_prompts?: any[];
    agent_chat_models?: string[];
    unified_limit_enabled?: boolean;
    unified_limit_value?: number;
    preview_limit?: number;
    volc_enhance_limit?: number;
    prompt_limit?: number;
    ai_video_limit?: number;
    ai_image_limit?: number;
    agent_limit?: number;
    instance_limit?: number;
  } | null>(null);

  const [agentCurrentModel, setAgentCurrentModel] = useState<PlaygroundModel | null>(null);

  const [canvasSaveStatus, setCanvasSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [generating, setGenerating] = useState(false);
  const [taskPollingNodes, setTaskPollingNodes] = useState<string[]>([]);
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [selectedTokenKey, setSelectedTokenKey] = useState<string>('');
  const [isModelDrawerVisible, setIsModelDrawerVisible] = useState(() => {
    try {
      const savedModelMid = localStorage.getItem(`playground_selected_model_${projectId}`);
      if (savedModelMid) {
        return false;
      }
    } catch (e) {}
    return window.innerWidth > 768;
  });
  const [isTokenModalVisible, setIsTokenModalVisible] = useState(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [isResourceWidgetVisible, setIsResourceWidgetVisible] = useState(false);
  const [isSettingsWidgetVisible, setIsSettingsWidgetVisible] = useState(false);
  const [isGenLogVisible, setIsGenLogVisible] = useState(false);
  const [isGenLogPinned, setIsGenLogPinned] = useState(false);
  const [autoDisplayAssetDetails, setAutoDisplayAssetDetailsState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pg_auto_display_asset_details');
      return saved !== 'false';
    } catch (e) {
      return true;
    }
  });

  const setAutoDisplayAssetDetails = useCallback((action: React.SetStateAction<boolean>) => {
    setAutoDisplayAssetDetailsState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem('pg_auto_display_asset_details', String(next));
      } catch (e) {}
      return next;
    });
  }, []);

  const [autoDisplayModelSelectorState, setAutoDisplayModelSelectorState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pg_auto_display_model_selector');
      return saved !== 'false'; // default is true
    } catch (e) {
      return true;
    }
  });

  const setAutoDisplayModelSelector = useCallback((action: React.SetStateAction<boolean>) => {
    setAutoDisplayModelSelectorState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem('pg_auto_display_model_selector', String(next));
      } catch (e) {}
      return next;
    });
  }, []);
  const [pageMode, setPageModeState] = useState<'normal' | 'node' | 'agent'>(() => {
    try {
      const saved = localStorage.getItem(`playground_page_mode_${projectId}`);
      if (saved === 'node' || saved === 'normal' || saved === 'agent') {
        return saved;
      }
    } catch (e) {}
    return 'normal';
  });

  const setPageMode = useCallback((action: React.SetStateAction<'normal' | 'node' | 'agent'>) => {
    setPageModeState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      try {
        localStorage.setItem(`playground_page_mode_${projectId}`, next);
      } catch (e) {}
      if (next === 'node' || next === 'agent') {
        setIsSettingsWidgetVisible(false);
        setIsModelDrawerVisible(false);
      }
      return next;
    });
  }, [projectId, setIsSettingsWidgetVisible, setIsModelDrawerVisible]);

  // 当切换到智能体模式，且当前模型不是视频模型时，自动校正并切换到首个可用的视频生成大模型
  React.useEffect(() => {
    if (pageMode === 'agent' && models.length > 0) {
      const current = models.find(m => m.mid === selectedMid);
      const isVideo = current?.scheme_type === 'video' || current?.type_name?.includes('视频');
      if (!isVideo) {
        const firstVideo = models.find(m => m.scheme_type === 'video' || m.type_name?.includes('视频'));
        if (firstVideo) {
          setSelectedMid(firstVideo.mid);
          toast.info(`已切换至 AI 智能体模式，并自动匹配视频模型 [${firstVideo.name}]`);
        }
      }
    }
  }, [pageMode, models, selectedMid, setSelectedMid]);

  const [attachedAssets, setAttachedAssets] = useState<{ asset: any; fullUrl: string; file?: File; options?: { role?: string } }[]>([]);

  // --- 项目管理 ---
  const [projects, setProjects] = useState<PlaygroundProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [storageStats, setStorageStats] = useState<any>(null);

  // --- 高频画布状态 ---
  const [nodes, setNodesState] = useState<CanvasNode[]>([]);
  const nodesRef = useRef(nodes);

  // --- 撤销/重做历史状态管理 ---
  const pastRef = useRef<CanvasNode[][]>([]);
  const futureRef = useRef<CanvasNode[][]>([]);
  const lastSavedNodesRef = useRef<CanvasNode[] | null>(null);
  const historySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const cloneNodes = (ns: CanvasNode[]): CanvasNode[] => {
    return JSON.parse(JSON.stringify(ns));
  };

  const updateUndoRedoStates = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const pushToHistory = useCallback((newNodes: CanvasNode[]) => {
    const currentSaved = lastSavedNodesRef.current || [];
    if (JSON.stringify(currentSaved) === JSON.stringify(newNodes)) {
      return;
    }

    if (lastSavedNodesRef.current) {
      pastRef.current = [...pastRef.current.slice(-4), lastSavedNodesRef.current];
    }
    
    lastSavedNodesRef.current = cloneNodes(newNodes);
    futureRef.current = [];
    
    updateUndoRedoStates();
  }, [updateUndoRedoStates]);

  const pushToHistoryDebounced = useCallback((newNodes: CanvasNode[]) => {
    if (historySaveTimerRef.current) {
      clearTimeout(historySaveTimerRef.current);
    }
    historySaveTimerRef.current = setTimeout(() => {
      pushToHistory(newNodes);
    }, 400);
  }, [pushToHistory]);

  const flushDebounce = useCallback(() => {
    if (historySaveTimerRef.current) {
      clearTimeout(historySaveTimerRef.current);
      historySaveTimerRef.current = null;
      pushToHistory(nodesRef.current);
    }
  }, [pushToHistory]);

  const undo = useCallback(() => {
    flushDebounce();
    if (pastRef.current.length === 0) return;

    const prev = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);

    if (lastSavedNodesRef.current) {
      futureRef.current = [...futureRef.current.slice(-4), lastSavedNodesRef.current];
    }

    lastSavedNodesRef.current = cloneNodes(prev);
    setNodesState(prev);
    nodesRef.current = prev;
    saveCanvasStateRef.current?.(prev);

    updateUndoRedoStates();
  }, [flushDebounce, updateUndoRedoStates]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;

    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);

    if (lastSavedNodesRef.current) {
      pastRef.current = [...pastRef.current.slice(-4), lastSavedNodesRef.current];
    }

    lastSavedNodesRef.current = cloneNodes(next);
    setNodesState(next);
    nodesRef.current = next;
    saveCanvasStateRef.current?.(next);

    updateUndoRedoStates();
  }, [updateUndoRedoStates]);

  const setNodes = useCallback((action: React.SetStateAction<CanvasNode[]>) => {
    setNodesState(prev => {
      const next = typeof action === 'function' ? (action as any)(prev) : action;
      if (!Array.isArray(next)) return next;

      let currentMaxZ = Math.max(...prev.map(n => n.zIndex || 0), 10);
      let needsZUpdate = false;

      const cleaned = next.map((n: CanvasNode) => {
        const prevNode = prev.find(p => p.id === n.id);
        const isNewlyCompleted = n.status === 'completed' && (!prevNode || prevNode.status !== 'completed');

        let updatedTaskData = n.taskData;
        if ((n.status === 'completed' || n.status === 'error') && n.taskData?.token_key) {
          const { token_key, ...restTaskData } = n.taskData;
          updatedTaskData = restTaskData;
        }

        if (isNewlyCompleted) {
          needsZUpdate = true;
          currentMaxZ += 1;
          return {
            ...n,
            zIndex: currentMaxZ,
            taskData: updatedTaskData
          };
        }

        if (updatedTaskData !== n.taskData) {
          return { ...n, taskData: updatedTaskData };
        }
        return n;
      });

      if (needsZUpdate) {
        setMaxZIndex(currentMaxZ);
      }

      nodesRef.current = cleaned;

      // 自动维护撤销/重做历史基准
      if (lastSavedNodesRef.current === null) {
        lastSavedNodesRef.current = cloneNodes(cleaned);
      } else {
        pushToHistoryDebounced(cleaned);
      }

      return cleaned;
    });
  }, [pushToHistoryDebounced]);
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
  const [connectingSourceId, setConnectingSourceId] = useState<string | null>(null);
  const [connectingMousePos, setConnectingMousePos] = useState<Point | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null!);

  // --- 派生数据 ---
  const currentModel = useMemo(() => models.find(m => m.mid === selectedMid) || null, [selectedMid, models]);

  const categories = useMemo(() => {
    let cats = [...new Set(models.map(m => m.scheme_type || m.type_name))].filter(Boolean);
    
    const activeSelectorNode = nodes.find(n => n.id === activeSelectorNodeId);
    if (
      activeSelectorNode?.taskData?.node_type === 'ai_image' ||
      activeSelectorNode?.taskData?.node_type === 'ai_video'
    ) {
      cats = cats.filter(
        cat =>
          cat.toLowerCase().includes('image') ||
          cat.includes('图') ||
          cat.toLowerCase().includes('video') ||
          cat.includes('视')
      );
    }

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
  }, [models, defaultModelMids, favorites, activeSelectorNodeId, nodes]);

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
      let list = models.filter(m => combinedMidsStr.includes(String(m.mid)));
      
      // 如果正在为节点配置模型，在“默认展示”里只保留图片或视频类型
      if (activeSelectorNodeId) {
        list = list.filter(m => {
          const lowerType = (m.scheme_type || m.type_name || '').toLowerCase();
          return lowerType.includes('image') || lowerType.includes('图') || lowerType.includes('video') || lowerType.includes('视');
        });
      }

      return list
        .filter(m => !searchModelKeyword || m.name.toLowerCase().includes(searchModelKeyword.toLowerCase()))
        .sort(sortFn);
    }
    return models
      .filter(m => (m.scheme_type || m.type_name) === activeCategory)
      .filter(m => !searchModelKeyword || m.name.toLowerCase().includes(searchModelKeyword.toLowerCase()))
      .sort(sortFn);
  }, [models, activeCategory, searchModelKeyword, defaultModelMids, favorites, activeSelectorNodeId]);

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

    // 确定是否正在为当前选中的节点（或者由节点输入框调起的节点）更改模型
    const activeNodeId = activeSelectorNodeId || (isSettingsWidgetVisible ? selectedNodeId : null);
    let activeNode = null;
    let isTargetGeneratorNode = false;
    if (activeNodeId) {
      activeNode = nodes.find(n => n.id === activeNodeId);
      if (activeNode?.taskData?.node_type === 'ai_image' || activeNode?.taskData?.node_type === 'ai_video') {
        isTargetGeneratorNode = true;
      }
    }

    if (isTargetGeneratorNode && activeNodeId) {
      if (nextModel) {
        const modelCat = (nextModel.scheme_type || nextModel.type_name || '').toLowerCase();
        let targetNodeType = activeNode?.taskData?.node_type;
        let targetType: "video" | "image" | "text" | "audio" | "section" = activeNode?.type || 'video';
        if (modelCat.includes('video') || modelCat.includes('视')) {
          targetNodeType = 'ai_video';
          targetType = 'video';
        } else if (modelCat.includes('image') || modelCat.includes('图')) {
          targetNodeType = 'ai_image';
          targetType = 'image';
        }

        const defaults: Record<string, any> = {};
        if (Array.isArray(nextModel.params)) {
          for (const p of nextModel.params) {
            defaults[p.key] = p.default;
          }
        }

        const aspect_ratio = defaults.aspect_ratio || defaults.aspectRatio || '16:9 宽屏宽幅';
        const duration = defaults.duration || '5秒';
        const motion = defaults.motion || '中 (推荐)';

        const isBatch = selectedNodeIds.includes(activeNodeId) && selectedNodeIds.length > 1;
        const targetNodeIds = isBatch
          ? selectedNodeIds.filter(id => {
              const n = nodes.find(item => item.id === id);
              return n?.taskData?.node_type === 'ai_image' || n?.taskData?.node_type === 'ai_video';
            })
          : [activeNodeId];

        const nextNodes = nodes.map(n => {
          if (targetNodeIds.includes(n.id)) {
            let itemNodeType = n.taskData?.node_type;
            let itemType = n.type || 'video';
            if (modelCat.includes('video') || modelCat.includes('视')) {
              itemNodeType = 'ai_video';
              itemType = 'video';
            } else if (modelCat.includes('image') || modelCat.includes('图')) {
              itemNodeType = 'ai_image';
              itemType = 'image';
            }

            return {
              ...n,
              type: itemType,
              taskData: {
                ...(n.taskData || {}),
                node_type: itemNodeType,
                model: nextModel.model_id || nextModel.name,
                modelName: nextModel.name || nextModel.model_id,
                modelMid: nextModel.mid,
                scheme_id: nextModel.scheme_id,
                aspect_ratio,
                duration,
                motion,
              }
            };
          }
          if (n.parentId && targetNodeIds.includes(n.parentId) && n.taskData?.node_type === 'preview') {
            let itemType = n.type;
            if (modelCat.includes('video') || modelCat.includes('视')) {
              itemType = 'video';
            } else if (modelCat.includes('image') || modelCat.includes('图')) {
              itemType = 'image';
            }
            return {
              ...n,
              type: itemType
            };
          }
          return n;
        });
        setNodes(nextNodes);
        saveCanvasStateRef.current?.(nextNodes);
        toast.success(`已为选择的节点更改大模型: ${nextModel.name || nextModel.model_id}`);
      }
      setActiveSelectorNodeId(null);
      setIsModelDrawerVisible(false);
      setIsSettingsWidgetVisible(true);
      return;
    }

    setSelectedMid(mid);
    if (mid) {
      localStorage.setItem(`playground_selected_model_${projectId}`, mid);
    } else {
      localStorage.removeItem(`playground_selected_model_${projectId}`);
    }
    if (nextModel) {
      if (modelConfigs[mid]) {
        setParamValues(modelConfigs[mid]);
      } else {
        initParamDefaults(nextModel.params);
      }
      setIsSettingsWidgetVisible(true);
    } else {
      setIsSettingsWidgetVisible(false);
    }
    setIsModelDrawerVisible(false);
    // 跨类型切换时清空聊天消息
    if (prevModel?.scheme_type !== nextModel?.scheme_type) {
      setChatMessages([]);
      setStreamingContent('');
    }
  }, [models, selectedMid, initParamDefaults, setChatMessages, setStreamingContent, modelConfigs, setIsSettingsWidgetVisible, projectId, activeSelectorNodeId, selectedNodeId, isSettingsWidgetVisible, nodes, setNodes, selectedNodeIds]);

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

  const duplicateProject = useCallback(async (projectId: number, newName: string): Promise<number | null> => {
    try {
      const resGet = await request.get(`/playground/projects/${projectId}`) as any;
      const canvasData = resGet?.project?.canvas_data;

      const resCreate = await request.post('/playground/projects', { name: newName }) as any;
      if (resCreate?.id) {
        const newPid = resCreate.id;
        if (canvasData) {
          await request.post(`/playground/projects/${newPid}/save-canvas`, { canvas_data: canvasData });
        }
        await loadProjects();
        return newPid;
      }
    } catch (e) {
      console.error('复制项目失败', e);
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
    setCanvasSaveStatus('saving');
    try {
      const targetNodes = overrideNodes || nodesRef.current;
      const canvasData = JSON.stringify({
        nodes: targetNodes.filter(n => !n.id.startsWith('local-asset-')).map(n => {
          let savedResultData = n.resultData;
          let savedTaskData = n.taskData;
          if (n.status === 'completed' && n.resultData) {
            if (n.type === 'image') {
              const url = extractImageUrl(n.resultData);
              const finalUrl = n.taskData?.tos_url || url;
              savedResultData = finalUrl ? { data: [{ url: finalUrl }] } : null;
              if (savedTaskData && 'tos_url' in savedTaskData) {
                const { tos_url, ...rest } = savedTaskData;
                savedTaskData = rest;
              }
            } else if (n.type === 'video') {
              const videoUrl = extractVideoUrl(n.resultData);
              const lastFrameUrl = n.resultData?.content?.last_frame_url || n.resultData?.data?.[0]?.last_frame_url;
              const finalVideoUrl = n.taskData?.tos_url || videoUrl;
              savedResultData = finalVideoUrl ? { content: { video_url: finalVideoUrl, last_frame_url: lastFrameUrl } } : null;
              if (savedTaskData && 'tos_url' in savedTaskData) {
                const { tos_url, ...rest } = savedTaskData;
                savedTaskData = rest;
              }
            } else {
              // 文本类型保留原始数据
              savedResultData = n.resultData;
            }
          }
          return {
            id: n.id, type: n.type, status: n.status,
            x: n.x, y: n.y, width: n.width, height: n.height, zIndex: n.zIndex,
            taskData: savedTaskData, resultData: savedResultData,
            parentId: n.parentId,
            isHidden: n.isHidden,
            inputConnections: n.inputConnections,
          };
        }),
        transform: transformRef2.current,
      });
      await request.post(`/playground/projects/${pid}/save-canvas`, { canvas_data: canvasData });
      setCanvasSaveStatus('saved');
    } catch (e) {
      console.warn('画布状态保存失败', e);
      setCanvasSaveStatus('error');
    }
  }, []);
  saveCanvasStateRef.current = saveCanvasState;

  const handleRearrange = useCallback((targetNodesList?: CanvasNode[]) => {
    const currentNodes = targetNodesList || nodesRef.current;

    const HORIZONTAL_GAP = 60;
    const VERTICAL_GAP = 20;
    const ROW_GAP = 50;

    const defaultW = 320;
    const defaultH = 240;
    const defaultSecW = 400;
    const defaultSecH = 300;

    // 先按时间/自增ID稳定排序，以确保排版顺序的稳定性
    const getOrder = (n: any) => {
      if (n.taskData?.created_at) {
        const ms = safeParseDate(n.taskData.created_at).getTime();
        if (!isNaN(ms)) return ms;
      }
      if (n.id && n.id.startsWith('node-')) {
        const ts = parseInt(n.id.replace('node-', ''), 10);
        if (!isNaN(ts)) return ts;
      }
      if (n.id && n.id.startsWith('local-asset-')) {
        const ts = parseInt(n.id.split('-')[2], 10);
        if (!isNaN(ts)) return ts;
      }
      if (n.id && n.id.startsWith('asset-')) {
        return parseInt(n.id.replace('asset-', ''), 10) || 0;
      }
      return 0;
    };

    // 过滤出当前所有可见节点进行重排布局
    const visibleNodes = [...currentNodes].filter(n => !n.isHidden).sort((a, b) => getOrder(a) - getOrder(b));
    if (visibleNodes.length === 0) {
      setCanvasTransform({ x: 0, y: 0, scale: 1 });
      toast.info('画布无内容，已重置视角为 100%');
      return;
    }

    const sections = visibleNodes.filter(n => n.type === 'section');
    const normalNodes = visibleNodes.filter(n => n.type !== 'section');

    // 1. 根据当前坐标判断可见普通节点落在哪一个可见 Section 内部
    const nodeToSectionMap = new Map<string, string>();
    const sortedSectionsForDetection = [...sections].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

    normalNodes.forEach(node => {
      const nodeW = node.width || defaultW;
      const nodeH = node.height || defaultH;
      const centerX = node.x + nodeW / 2;
      const centerY = node.y + nodeH / 2;

      for (const sec of sortedSectionsForDetection) {
        const secW = sec.width || defaultSecW;
        const secH = sec.height || defaultSecH;
        if (
          centerX >= sec.x &&
          centerX <= sec.x + secW &&
          centerY >= sec.y &&
          centerY <= sec.y + secH
        ) {
          nodeToSectionMap.set(node.id, sec.id);
          break;
        }
      }
    });

    // 2. 将普通节点归类为 Section 内部节点 or 顶级外部节点
    const sectionChildrenMap = new Map<string, any[]>();
    sections.forEach(sec => sectionChildrenMap.set(sec.id, []));

    const outsideNodes: any[] = [];
    normalNodes.forEach(node => {
      const secId = nodeToSectionMap.get(node.id);
      if (secId) {
        sectionChildrenMap.get(secId)?.push(node);
      } else {
        outsideNodes.push(node);
      }
    });

    // 3. 通用排版函数
    const layoutGroup = (
      groupNodes: any[],
      startX: number,
      startY: number,
      horizontalGap = 60,
      verticalGap = 20,
      rowGap = 50,
      defaultNodeW = 320,
      defaultNodeH = 240
    ) => {
      if (groupNodes.length === 0) {
        return { laidOut: [], width: 0, height: 0 };
      }

      const sortedGroupNodes = [...groupNodes].sort((a, b) => getOrder(a) - getOrder(b));

      // 递归树排版
      const layoutTree = (
        currentNode: any,
        tx: number,
        ty: number
      ): { width: number; height: number; laidOutNodes: any[] } => {
        const nodeW = currentNode.width || defaultNodeW;
        const nodeH = currentNode.height || defaultNodeH;

        const children = sortedGroupNodes.filter((n: any) => n.parentId === currentNode.id);

        if (children.length === 0) {
          return {
            width: nodeW,
            height: nodeH,
            laidOutNodes: [{
              ...currentNode,
              x: tx,
              y: ty
            }]
          };
        }

        const childStartX = tx + nodeW + horizontalGap;
        let currentChildStartY = ty;
        const childrenResults: any[] = [];

        for (const child of children) {
          const res = layoutTree(child, childStartX, currentChildStartY);
          childrenResults.push(res);
          currentChildStartY += res.height + verticalGap;
        }

        const totalChildrenHeight = currentChildStartY - ty - verticalGap;
        const maxChildWidth = Math.max(...childrenResults.map(r => r.width));

        // 父节点垂直居中
        const parentY = ty + Math.max(0, (totalChildrenHeight - nodeH) / 2);

        const parentLaidOut = {
          ...currentNode,
          x: tx,
          y: parentY
        };

        const allLaidOut = [parentLaidOut];
        for (const res of childrenResults) {
          allLaidOut.push(...res.laidOutNodes);
        }

        return {
          width: nodeW + horizontalGap + maxChildWidth,
          height: Math.max(nodeH, totalChildrenHeight),
          laidOutNodes: allLaidOut
        };
      };

      const isIsolated = (n: any) => {
        const hasParent = !!n.parentId && sortedGroupNodes.some(p => p.id === n.parentId);
        const hasChildren = sortedGroupNodes.some(c => c.parentId === n.id);
        return !hasParent && !hasChildren;
      };

      const connected = sortedGroupNodes.filter(n => !isIsolated(n));
      const isolated = sortedGroupNodes.filter(n => isIsolated(n));

      let currentY = startY;
      let maxTreeWidth = 0;
      const allLaidOutNodes: any[] = [];

      // 1) 先排版工作流根节点
      const rootNodes = connected.filter(n => !n.parentId || !connected.some(p => p.id === n.parentId));

      for (const root of rootNodes) {
        const treeRes = layoutTree(root, startX, currentY);
        allLaidOutNodes.push(...treeRes.laidOutNodes);
        currentY += treeRes.height + rowGap;
        if (treeRes.width > maxTreeWidth) {
          maxTreeWidth = treeRes.width;
        }
      }

      // 兜底防漏
      const laidOutIds = new Set(allLaidOutNodes.map(n => n.id));
      const missingConnected = connected.filter(n => !laidOutIds.has(n.id));
      for (const missing of missingConnected) {
        allLaidOutNodes.push({
          ...missing,
          x: startX,
          y: currentY
        });
        currentY += (missing.height || defaultNodeH) + rowGap;
      }

      // 2) 网格/流式自适应排版孤立节点 (防止不同大小 of 节点比如 Section 与普通节点重叠)
      const LINE_MAX_WIDTH = 2200;
      const COL_GAP = 30;
      const ROW_GAP_ISOLATED = 25;

      let currentX = startX;
      let currentLineY = currentY;
      let maxRowHeightInLine = 0;
      let maxRowWidth = 0;

      for (let i = 0; i < isolated.length; i++) {
        const node = isolated[i];
        const nodeW = node.width || defaultNodeW;
        const nodeH = node.height || defaultNodeH;

        if (currentX > startX && currentX + nodeW > startX + LINE_MAX_WIDTH) {
          const rowW = currentX - COL_GAP - startX;
          if (rowW > maxRowWidth) maxRowWidth = rowW;

          currentLineY += maxRowHeightInLine + ROW_GAP_ISOLATED;
          currentX = startX;
          maxRowHeightInLine = 0;
        }

        allLaidOutNodes.push({
          ...node,
          x: currentX,
          y: currentLineY
        });

        if (nodeH > maxRowHeightInLine) {
          maxRowHeightInLine = nodeH;
        }

        currentX += nodeW + COL_GAP;
      }

      if (currentX > startX) {
        const rowW = currentX - COL_GAP - startX;
        if (rowW > maxRowWidth) maxRowWidth = rowW;
        currentLineY += maxRowHeightInLine + ROW_GAP_ISOLATED;
      }

      const totalWidth = Math.max(maxTreeWidth, maxRowWidth);
      const totalHeight = currentLineY > startY ? currentLineY - ROW_GAP_ISOLATED - startY : 0;

      return {
        laidOut: allLaidOutNodes,
        width: totalWidth,
        height: totalHeight
      };
    };

    // 4. 对每个 Section 内部的子节点进行局部排版，并计算更新后 Section 的最适尺寸
    const sectionLaidOutChildren = new Map<string, any[]>();
    const updatedSections: any[] = [];

    sections.forEach(sec => {
      const children = sectionChildrenMap.get(sec.id) || [];
      if (children.length === 0) {
        updatedSections.push({
          ...sec,
          width: defaultSecW,
          height: defaultSecH
        });
        return;
      }

      // 局部排版子节点：起点设为 (20, 50) 以避开 Section 标题栏
      const layoutRes = layoutGroup(
        children,
        20,
        50,
        40,
        15,
        30,
        defaultW,
        defaultH
      );

      // Section 最适尺寸：子包围框加右下边距 25px
      const secW = Math.max(defaultSecW, layoutRes.width + 40);
      const secH = Math.max(defaultSecH, layoutRes.height + 75);

      updatedSections.push({
        ...sec,
        width: secW,
        height: secH
      });
      sectionLaidOutChildren.set(sec.id, layoutRes.laidOut);
    });

    // 5. 对所有顶级实体（顶级外部节点 + 所有更新尺寸后的 Section）进行全局排版
    const globalGroupItems = [...outsideNodes, ...updatedSections];
    const topLayout = layoutGroup(
      globalGroupItems,
      100,
      100,
      HORIZONTAL_GAP,
      VERTICAL_GAP,
      ROW_GAP,
      defaultW,
      defaultH
    );

    // 6. 将局部排版后的子节点坐标转化为相对于画布的全局坐标并收集
    const finalLaidOutNodes: any[] = [];
    topLayout.laidOut.forEach(node => {
      if (node.type === 'section') {
        const localChildren = sectionLaidOutChildren.get(node.id) || [];
        localChildren.forEach(child => {
          finalLaidOutNodes.push({
            ...child,
            x: node.x + child.x,
            y: node.y + child.y
          });
        });
        finalLaidOutNodes.push(node);
      } else {
        finalLaidOutNodes.push(node);
      }
    });

    // 7. 合并隐藏节点，避免物理删除已隐藏的素材，并保存最新子节点包含关系到 childrenNodeIds 中
    const hiddenNodes = currentNodes.filter(n => n.isHidden);
    const mergedNodes = [...finalLaidOutNodes, ...hiddenNodes];

    const finalNodes = mergedNodes.map(n => {
      if (n.type === 'section') {
        const childNodes = sectionChildrenMap.get(n.id) || [];
        const childIds = childNodes.map(c => c.id);
        return { ...n, childrenNodeIds: childIds };
      }
      return n;
    });

    // 写入新节点坐标并持久化画布状态
    setNodes(finalNodes);
    saveCanvasState(finalNodes);

    // 计算总的顶级排列包围框大小以供居中缩放
    const totalWidth = topLayout.width;
    const totalHeight = topLayout.height;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 视口四周预留 20% 空间
    const scaleX = (viewportWidth * 0.8) / (totalWidth || 1);
    const scaleY = (viewportHeight * 0.8) / (totalHeight || 1);
    const targetScale = Math.min(1, scaleX, scaleY);

    const translateX = (viewportWidth - totalWidth * targetScale) / 2;
    const translateY = (viewportHeight - totalHeight * targetScale) / 2;

    setCanvasTransform({ x: translateX, y: translateY, scale: targetScale });
    toast.success('画布排版已重置');
  }, [setNodes, saveCanvasState, setCanvasTransform]);

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

        const configMap: Record<string, Record<string, any>> = {};
        if (configsRes?.configs && Array.isArray(configsRes.configs)) {
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

        if (configRes?.advanced_nodes) {
          setAdvancedNodesConfig(configRes.advanced_nodes);
        }

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

          // 一进入项目，检查是否有先前退出时选中的模型
          const savedModelMid = localStorage.getItem(`playground_selected_model_${projectId}`);
          const isNodeMode = localStorage.getItem(`playground_page_mode_${projectId}`) === 'node';
          if (savedModelMid && enabledModels.some(m => m.mid === savedModelMid)) {
            setSelectedMid(savedModelMid);
            const matchedModel = enabledModels.find(m => m.mid === savedModelMid);
            if (matchedModel) {
              const matchedCat = matchedModel.scheme_type || matchedModel.type_name || '';
              if (matchedCat) {
                setActiveCategory(matchedCat);
              }
              if (configMap[savedModelMid]) {
                setParamValues(configMap[savedModelMid]);
              } else {
                const defaults: Record<string, any> = {};
                for (const p of matchedModel.params) defaults[p.key] = p.default;
                setParamValues(defaults);
              }
            }
            if (isNodeMode) {
              setIsSettingsWidgetVisible(false);
              setIsModelDrawerVisible(false);
            } else {
              setIsSettingsWidgetVisible(true);
              setIsModelDrawerVisible(false);
            }
          } else {
            setSelectedMid('');
            setActiveCategory(firstCat);
            setIsSettingsWidgetVisible(false);
            setIsModelDrawerVisible(isNodeMode ? false : window.innerWidth > 768);
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

  // 监听 isModelDrawerVisible 改变，当关闭时清空 activeSelectorNodeId
  React.useEffect(() => {
    if (!isModelDrawerVisible) {
      setActiveSelectorNodeId(null);
    }
  }, [isModelDrawerVisible]);

  // 打开节点模型选择器
  const openModelSelectorForNode = useCallback((nodeId: string) => {
    const targetNode = nodes.find(n => n.id === nodeId);
    if (!targetNode) return;

    setActiveSelectorNodeId(nodeId);
    setIsSettingsWidgetVisible(false);

    const mids = Array.isArray(defaultModelMids) ? defaultModelMids : [];
    if (mids.length > 0 || favorites.length > 0) {
      setActiveCategory('默认展示');
    } else {
      let targetCat = '';
      const cats = [...new Set(models.map(m => m.scheme_type || m.type_name))].filter(Boolean);
      if (targetNode.taskData?.node_type === 'ai_image') {
        targetCat = cats.find(cat => cat.toLowerCase().includes('image') || cat.includes('图')) || '';
      } else if (targetNode.taskData?.node_type === 'ai_video') {
        targetCat = cats.find(cat => cat.toLowerCase().includes('video') || cat.includes('视')) || '';
      }

      if (targetCat) {
        setActiveCategory(targetCat);
      }
    }
    setIsModelDrawerVisible(true);
  }, [nodes, models, defaultModelMids, favorites, setIsModelDrawerVisible, setIsSettingsWidgetVisible, setActiveCategory]);

  const activeSelectorNodeSelectedMid = useMemo(() => {
    if (!activeSelectorNodeId) return null;
    const node = nodes.find(n => n.id === activeSelectorNodeId);
    return node?.taskData?.modelMid || null;
  }, [nodes, activeSelectorNodeId]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNodeModelMid = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = nodes.find(n => n.id === selectedNodeId);
    return node?.taskData?.modelMid || null;
  }, [nodes, selectedNodeId]);

  // 监听选中的节点，如果是图片或视频节点，自动弹开右侧的模型属性配置并初始化显示数据
  React.useEffect(() => {
    if (selectedNodeId) {
      const node = nodesRef.current.find(n => n.id === selectedNodeId);
      if (node?.taskData?.node_type === 'ai_image' || node?.taskData?.node_type === 'ai_video') {
        if (node.taskData?.modelMid) {
          setSelectedMid(node.taskData.modelMid);
          
          let initialParams: Record<string, any> = {};
          if (modelConfigs[node.taskData.modelMid]) {
            initialParams = { ...modelConfigs[node.taskData.modelMid] };
          } else {
            const modelObj = models.find(m => m.mid === node.taskData.modelMid);
            if (modelObj && Array.isArray(modelObj.params)) {
              for (const p of modelObj.params) initialParams[p.key] = p.default;
            }
          }
          
          // 额外用节点已保存的特有配置覆盖，保障首回加载参数完美对齐
          const modelObj = models.find(m => m.mid === node.taskData.modelMid);
          if (modelObj && Array.isArray(modelObj.params)) {
            for (const p of modelObj.params) {
              const nodeVal = node.taskData[p.key] ?? node.taskData[p.key === 'aspect_ratio' ? 'aspectRatio' : ''];
              if (nodeVal !== undefined) {
                initialParams[p.key] = nodeVal;
                if (p.key === 'aspect_ratio') {
                  initialParams.aspectRatio = nodeVal;
                }
              }
            }
          }
          
          setParamValues(initialParams);
          if (autoDisplayModelSelectorState) {
            setIsSettingsWidgetVisible(true);
          }
        }
      }
    } else {
      if (pageMode === 'node' || pageMode === 'agent') {
        setIsSettingsWidgetVisible(false);
      }
    }
  }, [selectedNodeId, selectedNodeModelMid, modelConfigs, models, pageMode, setSelectedMid, setParamValues, setIsSettingsWidgetVisible, autoDisplayModelSelectorState]);

  // 监听配置栏参数改动并将其双向写回节点卡片，且支持 1 秒防抖保存
  React.useEffect(() => {
    if (selectedNodeId && Object.keys(paramValues).length > 0) {
      const targetNode = nodesRef.current.find(n => n.id === selectedNodeId);
      if (targetNode?.taskData?.node_type === 'ai_image' || targetNode?.taskData?.node_type === 'ai_video') {
        let hasDifference = false;
        const nextTaskData = { ...(targetNode.taskData || {}) };

        Object.entries(paramValues).forEach(([key, val]) => {
          if (nextTaskData[key] !== val) {
            nextTaskData[key] = val;
            hasDifference = true;
          }
        });

        if (paramValues.aspectRatio && nextTaskData.aspect_ratio !== paramValues.aspectRatio) {
          nextTaskData.aspect_ratio = paramValues.aspectRatio;
          hasDifference = true;
        }
        if (paramValues.aspect_ratio && nextTaskData.aspectRatio !== paramValues.aspect_ratio) {
          nextTaskData.aspectRatio = paramValues.aspect_ratio;
          hasDifference = true;
        }

        if (hasDifference) {
          const nextNodes = nodesRef.current.map(n => {
            if (n.id === selectedNodeId) {
              return {
                ...n,
                taskData: nextTaskData
              };
            }
            return n;
          });

          setNodes(nextNodes);

          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => {
            saveCanvasStateRef.current?.(nextNodes);
          }, 1000);
        }
      }
    }
  }, [paramValues, selectedNodeId, setNodes]);

  // --- 加载当前项目的画布数据 ---
  React.useEffect(() => {
    const projectIdNum = projectId;
    setCurrentProjectId(projectIdNum);

    // 重置撤销/重做历史栈与状态
    pastRef.current = [];
    futureRef.current = [];
    lastSavedNodesRef.current = null;
    setCanUndo(false);
    setCanRedo(false);

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
                safeParseDate(a.created_at).getTime() - safeParseDate(b.created_at).getTime()
              ));
              // 记录已被匹配过的 asset ID，防止一个 asset 被多个节点重复匹配
              const matchedAssetIds = new Set<number>();

              const fixedNodes = canvasData.nodes.map((n: any) => {
                // 有 task_id 的 loading 节点 → 交给自动轮询恢复
                if (n.status === 'loading' && n.taskData?.task_id) return n;
                // 无 task_id 的 loading 节点 → 检查创建时间
                if (n.status === 'loading' && !n.taskData?.task_id) {
                  const createdAt = safeParseDate(n.taskData?.created_at).getTime();
                  const elapsedMs = Date.now() - createdAt;
                  if (elapsedMs < 30 * 60 * 1000) return { ...n, status: 'loading' };
                  return { ...n, status: 'error', resultData: { message: '生成任务超时，请重新生成' } };
                }

                // 强制将已完成且有 tos_url 的节点的 resultData 地址替换为 tos_url（用于刷新后直接渲染永久 TOS 地址）
                if (n.status === 'completed' && n.taskData?.tos_url) {
                  if (n.type === 'image') {
                    n.resultData = { data: [{ url: n.taskData.tos_url }] };
                  } else if (n.type === 'video') {
                    const lastFrameUrl = n.resultData?.content?.last_frame_url || n.resultData?.data?.[0]?.last_frame_url;
                    n.resultData = { content: { video_url: n.taskData.tos_url, last_frame_url: lastFrameUrl } };
                  }
                  // 同步在内存中删除已映射的临时字段，保证内存干净无冗余
                  const { tos_url, ...rest } = n.taskData;
                  n.taskData = rest;
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

                const needsCreatedAt = n.status === 'completed' && !n.taskData?.created_at;

                if (!needsFix && !needsCreatedAt) return n;

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
                    const nodeTime = safeParseDate(n.taskData?.created_at).getTime();
                    let bestDiff = Infinity;
                    for (const c of candidates) {
                      if (!c.file_url || matchedAssetIds.has(c.id)) continue;
                      const diff = Math.abs(safeParseDate(c.created_at).getTime() - nodeTime);
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
                  resultData: n.resultData || (match.asset_type === 'image'
                    ? { data: [{ url: match.file_url }] }
                    : { content: { video_url: match.file_url } }),
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
                if (isReferenceAssetUrl(a.file_url)) return false;
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
              const maxZ = Math.max(...fixedNodes.map((n: any) => n.zIndex || 0), 10);
              setMaxZIndex(maxZ);
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
          const validAssets = assets.filter((a: any) =>
            (a.asset_type === 'image' || a.asset_type === 'video') && !isReferenceAssetUrl(a.file_url)
          );
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
            const maxZ = Math.max(...rebuiltNodes.map((n: any) => n.zIndex || 0), 10);
            setMaxZIndex(maxZ);

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
        
        // 如果项目既没有画布数据也没有关联素材，则设为空节点以建立历史记录基准
        if (!res?.project?.canvas_data && assets.length === 0) {
          setNodes([]);
        }
      } catch (e) {
        console.warn('加载项目画布数据失败', e);
        setNodes([]);
      }
    })();
  }, [projectId, setNodes]);

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
            parentId: n.parentId,
            isHidden: n.isHidden,
            inputConnections: n.inputConnections,
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

  // --- 空格键 & 撤销/重做全局监听 ---
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );

      const isMacOS = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
      const mod = isMacOS ? e.metaKey : e.ctrlKey;

      if (!isInputActive) {
        if (e.code === 'Space') {
          setIsSpaceDown(true);
          e.preventDefault();
          return;
        }

        // Cmd/Ctrl + Z -> 撤销
        if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
          e.preventDefault();
          undo();
          return;
        }

        // Cmd + Shift + Z 或者 Ctrl + Y -> 重做
        if (
          (mod && e.shiftKey && e.key.toLowerCase() === 'z') ||
          (mod && e.key.toLowerCase() === 'y')
        ) {
          e.preventDefault();
          redo();
          return;
        }
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
  }, [undo, redo]);

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
    connectingSourceId, setConnectingSourceId,
    connectingMousePos, setConnectingMousePos,
    handleRearrange,
    undo, redo, canUndo, canRedo,
  }), [
    canvasTransform, activeTool, isSpaceDown, isDraggingCanvas,
    draggingNodeId, nodes, maxZIndex, settingsWidgetPos, resourceWidgetPos, modelWidgetPos, selectedNodeId, selectedNodeIds,
    connectingSourceId, connectingMousePos, handleRearrange,
    undo, redo, canUndo, canRedo
  ]);

  const playgroundValue = useMemo<PlaygroundContextValue>(() => ({
    loading, models, selectedMid, setSelectedMid,
    currentModel, agentCurrentModel, setAgentCurrentModel, categories, activeCategory, setActiveCategory,
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
    isGenLogPinned, setIsGenLogPinned,
    pageMode, setPageMode,
    autoDisplayAssetDetails, setAutoDisplayAssetDetails,
    autoDisplayModelSelector: autoDisplayModelSelectorState, setAutoDisplayModelSelector,
    handleCategoryChange, handleSelectModel,
    projects, currentProjectId, setCurrentProjectId,
    loadProjects, createProject, duplicateProject, saveCanvasState, canvasSaveStatus,
    attachedAssets, setAttachedAssets,
    storageStats, loadStorageStats,
    chatMessages, setChatMessages, streamingContent, setStreamingContent,
    defaultModelMids, favorites, toggleFavorite, advancedNodesConfig,
    activeSelectorNodeId, setActiveSelectorNodeId, openModelSelectorForNode, activeSelectorNodeSelectedMid
  }), [
    loading, models, selectedMid, currentModel, agentCurrentModel, categories,
    activeCategory, modelsInCategory, searchModelKeyword,
    paramValues, modelConfigs, saveModelConfig, deleteModelConfig, prompt, generating, taskPollingNodes,
    apiTokens, setApiTokens, selectedTokenKey,
    isModelDrawerVisible, isTokenModalVisible, isSettingsCollapsed, isResourceWidgetVisible, isSettingsWidgetVisible, isGenLogVisible, isGenLogPinned,
    pageMode, setPageMode,
    autoDisplayAssetDetails, setAutoDisplayAssetDetails,
    autoDisplayModelSelectorState, setAutoDisplayModelSelector,
    handleCategoryChange, handleSelectModel, initParamDefaults,
    projects, currentProjectId, loadProjects, createProject, duplicateProject, saveCanvasState, canvasSaveStatus,
    attachedAssets, setAttachedAssets,
    storageStats, loadStorageStats,
    chatMessages, streamingContent, defaultModelMids, favorites, toggleFavorite, advancedNodesConfig,
    activeSelectorNodeId, openModelSelectorForNode, activeSelectorNodeSelectedMid
  ]);

  return (
    <CanvasContext.Provider value={canvasValue}>
      <PlaygroundContext.Provider value={playgroundValue}>
        {children}
      </PlaygroundContext.Provider>
    </CanvasContext.Provider>
  );
};
