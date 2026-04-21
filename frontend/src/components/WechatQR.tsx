import React, { useEffect, useRef } from 'react';

// 声明微信 JS SDK 全局类型（函数式，new 调用）
declare global {
  interface Window {
    WxLogin?: Function;
  }
}

interface WechatQRProps {
  appId: string;
  redirectUri: string;
  state: string;
  /** true=绑定场景(iframe内自跳转), false=登录场景(顶层跳转) */
  selfRedirect?: boolean;
  style?: number;
}

// 动态加载微信 JS SDK（单例，避免重复注入）
function loadWxSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.WxLogin) { resolve(); return; }
    if (document.getElementById('wx-login-sdk')) {
      // 脚本已注入但还未执行完，等待
      const check = setInterval(() => {
        if (window.WxLogin) { clearInterval(check); resolve(); }
      }, 50);
      return;
    }
    const script = document.createElement('script');
    script.id = 'wx-login-sdk';
    script.src = 'https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('微信 JS SDK 加载失败'));
    document.head.appendChild(script);
  });
}

const WechatQR: React.FC<WechatQRProps> = ({ appId, redirectUri, state, selfRedirect = false, style = 0 }) => {
  // 每个组件实例使用唯一 id，支持同页多实例
  const containerId = useRef(`wx_qr_${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    if (!appId || !redirectUri) return;
    let cancelled = false;

    loadWxSdk().then(() => {
      if (cancelled || !window.WxLogin) return;
      const el = document.getElementById(containerId);
      if (el) el.innerHTML = '';

      new (window.WxLogin as any)({
        self_redirect: selfRedirect,
        id: containerId,
        appid: appId,
        scope: 'snsapi_login',
        redirect_uri: encodeURIComponent(redirectUri),
        state,
        fast_login: 1,
        stylelite: style,        // 新版简洁样式
        color_scheme: 'dark', // 深色主题适配
        href: '',
      });
    }).catch(err => console.error('[WechatQR]', err));

    return () => { cancelled = true; };
  }, [appId, redirectUri, state, selfRedirect, containerId]);

  if (!appId) {
    return <div style={{ padding: '40px 0', color: '#8c8c8c', textAlign: 'center' }}>未配置微信登录</div>;
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 260 }}>
      <div id={containerId} style={{ textAlign: 'center' }} />
    </div>
  );
};

export default WechatQR;
