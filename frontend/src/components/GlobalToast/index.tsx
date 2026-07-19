/**
 * GlobalToast - 全站统一的 shadcn 风格居中 Toast
 *
 * 页面正中弹出，黑白灰底 + 状态色图标，与创作中心提示一致。
 * 支持 success / error / warning / info。
 *
 * 用法:
 *   import toast from '@/components/GlobalToast';
 *   toast.success('操作成功');
 *   toast.success('操作成功', '您的更改已保存');
 *   toast.error('操作失败', '请检查网络连接');
 */
import React from 'react';
import ReactDOM from 'react-dom/client';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  key?: string;
}

const CheckCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 10.5L9 13L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XCircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 7L13 13M13 7L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const AlertTriangleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 2L18.66 17H1.34L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 8V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="14" r="0.75" fill="currentColor" />
  </svg>
);

const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 9V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="6.5" r="0.75" fill="currentColor" />
  </svg>
);

const iconMap: Record<ToastType, React.FC> = {
  success: CheckCircleIcon,
  error: XCircleIcon,
  warning: AlertTriangleIcon,
  info: InfoIcon,
};

const iconColorMap: Record<ToastType, string> = {
  success: '#22c55e',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#a1a1aa',
};

const keyframesId = '__global-toast-keyframes__';

function ensureKeyframes() {
  if (document.getElementById(keyframesId)) return;
  const style = document.createElement('style');
  style.id = keyframesId;
  style.textContent = `
    @keyframes global-toast-in {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
      100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes global-toast-out {
      0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
    }
  `;
  document.head.appendChild(style);
}

interface ToastItemProps extends ToastOptions {
  onClose: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ type, title, description, duration = 3000, onClose }) => {
  const [exiting, setExiting] = React.useState(false);
  const Icon = iconMap[type];
  const iconColor = iconColorMap[type];

  React.useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(onClose, 200);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 100000,
        pointerEvents: 'auto',
        animation: exiting ? 'global-toast-out 0.2s ease forwards' : 'global-toast-in 0.25s ease forwards',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
          width: 'max-content',
          maxWidth: 'min(480px, calc(100vw - 32px))',
          background: '#18181b',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <span style={{ color: iconColor, flexShrink: 0, display: 'flex' }}>
          <Icon />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: '#fafafa',
              lineHeight: '20px',
              letterSpacing: '-0.1px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </div>
          {description && (
            <div
              style={{
                fontSize: 13,
                color: '#a1a1aa',
                lineHeight: '18px',
                marginTop: 4,
                letterSpacing: '-0.05px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

let containerRoot: ReactDOM.Root | null = null;
let containerEl: HTMLDivElement | null = null;

const activeKeyTimers = new Map<string, number>();
let currentToasts: Array<ToastOptions & { id: number }> = [];
let toastIdCounter = 0;

function getContainer() {
  if (!containerEl) {
    containerEl = document.createElement('div');
    containerEl.id = '__global-toast-container__';
    containerEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:100000;';
    document.body.appendChild(containerEl);
    containerRoot = ReactDOM.createRoot(containerEl);
  }
  return containerRoot!;
}

function renderToasts() {
  const root = getContainer();
  const latest = currentToasts[currentToasts.length - 1];
  if (!latest) {
    root.render(null);
    return;
  }
  root.render(
    <ToastItem
      key={String(latest.id)}
      type={latest.type}
      title={latest.title}
      description={latest.description}
      duration={latest.duration}
      onClose={() => {
        currentToasts = currentToasts.filter((t) => t.id !== latest.id);
        if (latest.key) activeKeyTimers.delete(latest.key);
        renderToasts();
      }}
    />
  );
}

function showToast(opts: ToastOptions) {
  ensureKeyframes();

  if (opts.key) {
    // 同 key 替换：先移除旧的再弹出新的
    currentToasts = currentToasts.filter((t) => t.key !== opts.key);
    const prevTimer = activeKeyTimers.get(opts.key);
    if (prevTimer) {
      window.clearTimeout(prevTimer);
      activeKeyTimers.delete(opts.key);
    }
  }

  const id = ++toastIdCounter;
  currentToasts.push({ ...opts, id });

  if (opts.key) {
    const dur = opts.duration && opts.duration > 0 ? opts.duration : 3000;
    const timer = window.setTimeout(() => {
      activeKeyTimers.delete(opts.key!);
    }, dur + 300);
    activeKeyTimers.set(opts.key, timer);
  }

  renderToasts();
  return id;
}

function destroyToast(key?: string) {
  if (key == null) {
    currentToasts = [];
    activeKeyTimers.forEach((timer) => window.clearTimeout(timer));
    activeKeyTimers.clear();
  } else {
    currentToasts = currentToasts.filter((t) => t.key !== key && String(t.id) !== String(key));
    const timer = activeKeyTimers.get(key);
    if (timer) {
      window.clearTimeout(timer);
      activeKeyTimers.delete(key);
    }
  }
  renderToasts();
}

const toast = {
  success(title: string, description?: string, duration?: number, key?: string) {
    return showToast({ type: 'success', title, description, duration, key });
  },
  error(title: string, description?: string, duration?: number, key?: string) {
    return showToast({ type: 'error', title, description, duration, key });
  },
  warning(title: string, description?: string, duration?: number, key?: string) {
    return showToast({ type: 'warning', title, description, duration, key });
  },
  info(title: string, description?: string, duration?: number, key?: string) {
    return showToast({ type: 'info', title, description, duration, key });
  },
  show: showToast,
  destroy: destroyToast,
};

export default toast;
