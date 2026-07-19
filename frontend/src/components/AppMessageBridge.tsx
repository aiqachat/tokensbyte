/**
 * 将 antd App.useApp().message 桥接到 GlobalToast，
 * 与静态 message 补丁一起覆盖全站提示。
 */
import React, { useContext, useMemo } from 'react';
import AppContext from 'antd/es/app/context';
import type { MessageInstance, ArgsProps, JointContent, MessageType } from 'antd/es/message/interface';
import toast, { type ToastType } from './GlobalToast';

let msgSeq = 0;

function extractText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string' || typeof content === 'number') return String(content);
  if (React.isValidElement(content)) {
    const children = (content.props as { children?: unknown })?.children;
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    if (Array.isArray(children)) {
      return children.map((c) => extractText(c)).filter(Boolean).join('');
    }
    if (children != null) return extractText(children);
    return '';
  }
  if (Array.isArray(content)) {
    return content.map((c) => extractText(c)).filter(Boolean).join('');
  }
  try {
    return String(content);
  } catch {
    return '';
  }
}

function toMs(duration?: number): number | undefined {
  if (duration == null) return undefined;
  if (duration === 0) return 0;
  return duration * 1000;
}

function makeReturn(key: string, onClose?: () => void): MessageType {
  const close = (() => {
    toast.destroy(key);
    onClose?.();
  }) as MessageType;
  close.then = (resolve, reject) => Promise.resolve(true).then(resolve, reject);
  return close;
}

function createToastMessageApi(): MessageInstance {
  const showTyped = (
    type: ToastType,
    content: JointContent,
    duration?: number | VoidFunction,
    onClose?: VoidFunction,
  ): MessageType => {
    let title = '提示';
    let key: string | undefined;
    let durSec: number | undefined;
    let closeFn = onClose;

    if (content != null && typeof content === 'object' && !React.isValidElement(content) && 'content' in (content as object)) {
      const cfg = content as ArgsProps;
      title = extractText(cfg.content) || '提示';
      key = cfg.key != null ? String(cfg.key) : undefined;
      durSec = cfg.duration;
      closeFn = onClose ?? cfg.onClose;
    } else {
      title = extractText(content) || '提示';
    }

    if (typeof duration === 'function') {
      closeFn = duration;
    } else if (typeof duration === 'number') {
      durSec = duration;
    }

    const finalKey = key || `__app_msg_${++msgSeq}`;
    toast[type](title, undefined, toMs(durSec), finalKey);
    return makeReturn(finalKey, closeFn);
  };

  return {
    success: (content, duration, onClose) => showTyped('success', content, duration, onClose),
    error: (content, duration, onClose) => showTyped('error', content, duration, onClose),
    warning: (content, duration, onClose) => showTyped('warning', content, duration, onClose),
    info: (content, duration, onClose) => showTyped('info', content, duration, onClose),
    loading: (content, duration, onClose) => showTyped('info', content, duration ?? 0, onClose),
    open: (config) => {
      const type = (config.type as ToastType) || 'info';
      const title = extractText(config.content) || '提示';
      const key = config.key != null ? String(config.key) : `__app_msg_${++msgSeq}`;
      const ms = toMs(config.duration);
      if (type === 'success' || type === 'error' || type === 'warning' || type === 'info') {
        toast[type](title, undefined, ms, key);
      } else {
        toast.info(title, undefined, ms ?? 0, key);
      }
      return makeReturn(key, config.onClose);
    },
    destroy: (key) => {
      toast.destroy(key != null ? String(key) : undefined);
    },
  };
}

export function AppMessageBridge({ children }: { children: React.ReactNode }) {
  const app = useContext(AppContext);
  const messageApi = useMemo(() => createToastMessageApi(), []);

  const value = useMemo(
    () => ({
      ...app,
      message: messageApi,
    }),
    [app, messageApi],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
