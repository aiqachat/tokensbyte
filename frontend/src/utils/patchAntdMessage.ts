/**
 * 将 antd 静态 message API 桥接到 GlobalToast，
 * 使全站 message.success / error / warning / info 均为居中黑白灰风格。
 */
import React from 'react';
import { message } from 'antd';
import type { ArgsProps, JointContent, MessageType } from 'antd/es/message/interface';
import toast, { type ToastType } from '../components/GlobalToast';

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

function parseJointContent(content: JointContent): {
  title: string;
  duration?: number;
  onClose?: () => void;
  key?: string;
} {
  if (content != null && typeof content === 'object' && !React.isValidElement(content) && 'content' in (content as object)) {
    const cfg = content as ArgsProps;
    return {
      title: extractText(cfg.content) || '提示',
      duration: cfg.duration,
      onClose: cfg.onClose,
      key: cfg.key != null ? String(cfg.key) : undefined,
    };
  }
  return { title: extractText(content) || '提示' };
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

function showTyped(
  type: ToastType,
  content: JointContent,
  duration?: number | VoidFunction,
  onClose?: VoidFunction,
): MessageType {
  const parsed = parseJointContent(content);
  let durSec: number | undefined;
  let closeFn = onClose ?? parsed.onClose;
  const key = parsed.key || `__antd_msg_${++msgSeq}`;

  if (typeof duration === 'function') {
    closeFn = duration;
  } else if (typeof duration === 'number') {
    durSec = duration;
  } else if (parsed.duration != null) {
    durSec = parsed.duration;
  }

  toast[type](parsed.title, undefined, toMs(durSec), key);
  return makeReturn(key, closeFn);
}

function showOpen(config: ArgsProps): MessageType {
  const type = (config.type as ToastType) || 'info';
  const title = extractText(config.content) || '提示';
  const key = config.key != null ? String(config.key) : `__antd_msg_${++msgSeq}`;
  const ms = toMs(config.duration);

  if (type === 'success' || type === 'error' || type === 'warning' || type === 'info') {
    toast[type](title, undefined, ms, key);
  } else {
    toast.info(title, undefined, ms ?? 0, key);
  }
  return makeReturn(key, config.onClose);
}

function patchAntdMessage() {
  message.success = ((content, duration, onClose) =>
    showTyped('success', content, duration, onClose)) as typeof message.success;

  message.error = ((content, duration, onClose) =>
    showTyped('error', content, duration, onClose)) as typeof message.error;

  message.warning = ((content, duration, onClose) =>
    showTyped('warning', content, duration, onClose)) as typeof message.warning;

  message.info = ((content, duration, onClose) =>
    showTyped('info', content, duration, onClose)) as typeof message.info;

  message.loading = ((content, duration, onClose) =>
    showTyped('info', content, duration ?? 0, onClose)) as typeof message.loading;

  message.open = ((config) => showOpen(config)) as typeof message.open;

  message.destroy = ((key?: React.Key) => {
    toast.destroy(key != null ? String(key) : undefined);
  }) as typeof message.destroy;
}

patchAntdMessage();
