/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import axios from 'axios';

/** 判断请求是否被主动取消（Abort / axios cancel） */
export function isRequestAborted(err: unknown): boolean {
  return (
    axios.isCancel(err) ||
    (err as { code?: string })?.code === 'ERR_CANCELED' ||
    (err as { name?: string })?.name === 'CanceledError' ||
    (err as { message?: string })?.message === 'canceled' ||
    (err as { message?: string })?.message === 'Request aborted'
  );
}

/**
 * 列表查询并发保护：新请求会取消上一次，避免叠加。
 * 不做时间节流（会误伤 StrictMode 重挂载与正常首屏加载）。
 */
export class QueryGuard {
  private controller: AbortController | null = null;

  /** 开始查询：取消进行中的旧请求，返回新 signal */
  begin(): AbortSignal {
    this.controller?.abort();
    this.controller = new AbortController();
    return this.controller.signal;
  }

  /** 当前 signal 是否仍是最新一次查询 */
  isCurrent(signal: AbortSignal): boolean {
    return !!this.controller && this.controller.signal === signal;
  }

  /** 组件卸载时取消进行中的请求 */
  dispose(): void {
    this.controller?.abort();
    this.controller = null;
  }
}
