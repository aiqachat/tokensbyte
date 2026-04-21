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
import type { CanvasNode, CanvasTransform, ActiveTool, Point, PlaygroundModel, SchemeParam } from '../types';
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
  // 操作
  handleCategoryChange: (cat: string) => void;
  handleSelectModel: (mid: string) => void;
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
export const PlaygroundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  // --- 高频画布状态 ---
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [canvasTransform, setCanvasTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [activeTool, setActiveTool] = useState<ActiveTool>('pointer');
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [maxZIndex, setMaxZIndex] = useState(10);
  const [settingsWidgetPos, setSettingsWidgetPos] = useState<Point>({ x: window.innerWidth - 380, y: 32 });
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
  }), [
    canvasTransform, activeTool, isSpaceDown, isDraggingCanvas,
    draggingNodeId, nodes, maxZIndex, settingsWidgetPos
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
    handleCategoryChange, handleSelectModel,
  }), [
    loading, models, selectedMid, currentModel, categories,
    activeCategory, modelsInCategory, searchModelKeyword,
    paramValues, prompt, generating, taskPollingNodes,
    apiTokens, selectedTokenKey,
    isModelDrawerVisible, isTokenModalVisible, isSettingsCollapsed,
    handleCategoryChange, handleSelectModel, initParamDefaults
  ]);

  return (
    <CanvasContext.Provider value={canvasValue}>
      <PlaygroundContext.Provider value={playgroundValue}>
        {children}
      </PlaygroundContext.Provider>
    </CanvasContext.Provider>
  );
};
