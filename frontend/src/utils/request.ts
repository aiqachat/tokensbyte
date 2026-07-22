/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import axios from 'axios';
import { message } from 'antd';
import i18n from '../i18n';
import { resolveTimedisplay } from './timedisplay';

// 全局限制同时最多显示 3 条消息
message.config({ maxCount: 3 });

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 300000, // 5 minutes timeout for long-running requests like image generation
});

request.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    // 若请求已显式携带 Authorization（如游乐场 API Key），则不覆盖
    if (token && !config.headers.Authorization && !config.headers.authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    try {
      // timedisplay：优先用户个人时区，供统计/任务列表按自然日过滤
      config.headers['x-timezone'] = resolveTimedisplay();
    } catch (e) {}
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

request.interceptors.response.use(
  (response) => {
    // Blob 响应（如 CSV 导出）直接返回原始数据，不解包
    if (response.config.responseType === 'blob') {
      return response.data;
    }
    return response.data;
  },
  (error) => {
    const { response, config } = error;
    // 主动取消的请求不弹全局错误（页面卸载 / 新查询替换旧查询）
    if (
      axios.isCancel(error) ||
      error?.code === 'ERR_CANCELED' ||
      error?.name === 'CanceledError' ||
      error?.message === 'canceled' ||
      error?.message === 'Request aborted'
    ) {
      return Promise.reject(error);
    }
    // 如果请求配置了 skipErrorHandler，或者特定 URL，则不弹出全局错误提示
    if ((config as any)?.skipErrorHandler || config?.url === '/plugins') {
      return Promise.reject(error);
    }
    if (response) {
      const { status, data } = response;
      let serverMsg = data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : undefined) || (typeof data === 'string' ? data : undefined);
      
      // Translate specific backend error messages
      if (serverMsg === 'Account disabled') {
        serverMsg = i18n.t('login.account_disabled');
      } else if (serverMsg === 'Invalid or already used redemption code') {
        serverMsg = i18n.language?.startsWith('zh')
          ? '兑换码无效或已被使用'
          : 'Invalid or already used redemption code';
      }

      if (status === 401) {
        // 区分"业务认证失败"与"登录态过期"：
        // 当前无 token（登录/注册等未登录页面）→ 直接展示后端消息
        // 当前有 token（登录态页面） → 清除 token 并跳转登录
        const isImpersonating = !!sessionStorage.getItem('token');
        const hasToken = isImpersonating || !!localStorage.getItem('token');
        if (hasToken) {
          if (isImpersonating) {
            // 代理登录态过期，仅清 session，保留管理员的 localStorage
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('user');
          } else {
            // 正常登录态过期，全部清除
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          }
          message.error('登录状态已过期，请重新登录');
          if (window.location.pathname !== '/login') {
            window.location.href = '/login';
          }
        } else {
          message.error(serverMsg || '认证失败');
        }
      } else {
        message.error(serverMsg || 'Request failed');
      }
    } else {
      message.error('Network error');
    }
    return Promise.reject(error);
  }
);

export default request;
