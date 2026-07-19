import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, InputNumber, message, Typography, Space, Switch, Radio, Tabs, Select, Tag, Alert, Table, Spin, Upload, Modal, DatePicker } from 'antd';
import { CloudServerOutlined, ApiOutlined, DatabaseOutlined, UploadOutlined } from '@ant-design/icons';
import * as Icons from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import dayjs from 'dayjs';

const { Text } = Typography;

/** 系统支持的所有语言定义 — 后续新增语言只需在此添加一行 */
// 火山引擎 TOS 对象存储地域配置
const TOS_REGION_GROUPS = [
  {
    group: '🇨🇳 国内版 - 火山引擎',
    regions: [
      { label: '华北2（北京）', region: 'cn-beijing', endpointExternal: 'https://tos-cn-beijing.volces.com', endpointInternal: 'https://tos-cn-beijing.ivolces.com' },
      { label: '华南1（广州）', region: 'cn-guangzhou', endpointExternal: 'https://tos-cn-guangzhou.volces.com', endpointInternal: 'https://tos-cn-guangzhou.ivolces.com' },
      { label: '华东2（上海）', region: 'cn-shanghai', endpointExternal: 'https://tos-cn-shanghai.volces.com', endpointInternal: 'https://tos-cn-shanghai.ivolces.com' },
      { label: '中国香港', region: 'cn-hongkong', endpointExternal: 'https://tos-cn-hongkong.volces.com', endpointInternal: 'https://tos-cn-hongkong.ivolces.com' },
      { label: '亚太东南（柔佛）', region: 'ap-southeast-1', endpointExternal: 'https://tos-ap-southeast-1.volces.com', endpointInternal: 'https://tos-ap-southeast-1.ivolces.com' },
      { label: '亚太东南（雅加达）', region: 'ap-southeast-3', endpointExternal: 'https://tos-ap-southeast-3.volces.com', endpointInternal: 'https://tos-ap-southeast-3.ivolces.com' },
    ]
  },
  {
    group: '🌏 海外版 - BytePlus',
    regions: [
      { label: '亚太地区（柔佛）', region: 'bp-ap-southeast-1', endpointExternal: 'https://tos-ap-southeast-1.bytepluses.com', endpointInternal: 'https://tos-ap-southeast-1.ibytepluses.com' },
      { label: '中国（香港）', region: 'bp-cn-hongkong', endpointExternal: 'https://tos-cn-hongkong.bytepluses.com', endpointInternal: 'https://tos-cn-hongkong.ibytepluses.com' },
      { label: '亚太地区（雅加达）', region: 'bp-ap-southeast-3', endpointExternal: 'https://tos-ap-southeast-3.bytepluses.com', endpointInternal: 'https://tos-ap-southeast-3.ibytepluses.com' },
      { label: '中国（北京）', region: 'bp-cn-beijing', endpointExternal: 'https://tos-cn-beijing.bytepluses.com.cn', endpointInternal: 'https://tos-cn-beijing.ibytepluses.com.cn' },
      { label: '中国（广州）', region: 'bp-cn-guangzhou', endpointExternal: 'https://tos-cn-guangzhou.bytepluses.com.cn', endpointInternal: 'https://tos-cn-guangzhou.ibytepluses.com.cn' },
      { label: '中国（上海）', region: 'bp-cn-shanghai', endpointExternal: 'https://tos-cn-shanghai.bytepluses.com.cn', endpointInternal: 'https://tos-cn-shanghai.ibytepluses.com.cn' },
    ]
  }
];
const ALL_TOS_REGIONS = TOS_REGION_GROUPS.flatMap(g => g.regions);

const ALL_LANGUAGES = [
  { code: 'zh', name: '简体中文', nativeName: 'Simplified Chinese', flag: '🇨🇳' },
  { code: 'en', name: 'English', nativeName: '英语', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', nativeName: '日语', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', nativeName: '韩语', flag: '🇰🇷' },
  { code: 'vi', name: 'Tiếng Việt', nativeName: '越南语', flag: '🇻🇳' },
  { code: 'fr', name: 'Français', nativeName: '法语', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', nativeName: '德语', flag: '🇩🇪' },
  { code: 'es', name: 'Español', nativeName: '西班牙语', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', nativeName: '葡萄牙语', flag: '🇧🇷' },
  { code: 'ru', name: 'Русский', nativeName: '俄语', flag: '🇷🇺' },
  { code: 'ar', name: 'العربية', nativeName: '阿拉伯语', flag: '🇸🇦' },
];

// 登录页风格选择器组件 (卡片化缩略图选择)
const LoginStyleSelector: React.FC<{
  value?: 'split' | 'classic';
  onChange?: (val: 'split' | 'classic') => void;
}> = ({ value, onChange }) => {
  const current = value || 'split';
  return (
    <div className="flex gap-4">
      {/* 经典风格 */}
      <div 
        onClick={() => onChange?.('classic')}
        className={`relative cursor-pointer rounded-lg border-2 p-2 w-[140px] flex flex-col items-center gap-2 select-none transition-all
          ${current === 'classic' 
            ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900/60 shadow-xs' 
            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-background'
          }`}
      >
        {/* 缩略图 */}
        <div className="w-full h-16 rounded border border-zinc-200 dark:border-zinc-800 bg-background/50 flex items-center justify-center relative overflow-hidden">
          {/* 居中表单 */}
          <div className="w-10 h-7 rounded border border-zinc-200 dark:border-zinc-700 bg-background flex flex-col gap-1 p-1 items-center justify-center">
            <div className="w-6 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-xs" />
            <div className="w-6 h-1 bg-zinc-300 dark:bg-zinc-600 rounded-xs" />
          </div>
        </div>
        <span className={`text-xs font-medium ${current === 'classic' ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-500'}`}>经典风格</span>
      </div>

      {/* 左右风格 */}
      <div 
        onClick={() => onChange?.('split')}
        className={`relative cursor-pointer rounded-lg border-2 p-2 w-[140px] flex flex-col items-center gap-2 select-none transition-all
          ${current === 'split' 
            ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900/60 shadow-xs' 
            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-background'
          }`}
      >
        {/* 缩略图 */}
        <div className="w-full h-16 rounded border border-zinc-200 dark:border-zinc-800 bg-background/50 flex relative overflow-hidden">
          {/* 左侧广告 */}
          <div className="w-[40%] h-full bg-zinc-200 dark:bg-zinc-800 border-r border-zinc-200 dark:border-zinc-800" />
          {/* 右侧表单 */}
          <div className="w-[60%] h-full flex items-center justify-center">
            <div className="w-7 h-5 rounded border border-zinc-200 dark:border-zinc-700 bg-background flex flex-col gap-0.5 p-0.5 items-center justify-center scale-90">
              <div className="w-4 h-0.5 bg-zinc-300 dark:bg-zinc-600 rounded-xs" />
              <div className="w-4 h-0.5 bg-zinc-300 dark:bg-zinc-600 rounded-xs" />
            </div>
          </div>
        </div>
        <span className={`text-xs font-medium ${current === 'split' ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-500'}`}>左右风格</span>
      </div>
    </div>
  );
};

const timezoneOptions = (() => {
  const timezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [
    'Asia/Shanghai', 'Asia/Tokyo', 'America/New_York', 'Europe/London'
  ];

  const grouped: Record<string, { value: string, label: string }[]> = {};

  timezones.forEach(tz => {
    const parts = tz.split('/');
    if (parts.length >= 2) {
      const group = parts[0];
      const city = parts.slice(1).join('/').replace(/_/g, ' ');

      const date = new Date();
      const str = date.toLocaleString('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
      const match = str.match(/(GMT|UTC)([+-]\d{1,2}(:\d{2})?)/);
      let offset = '';
      if (match) {
        offset = ` (UTC${match[2]})`;
      } else if (str.includes('GMT') || str.includes('UTC')) {
        offset = ' (UTC+0)';
      }

      if (!grouped[group]) grouped[group] = [];
      grouped[group].push({ value: tz, label: `${tz.replace(/_/g, ' ')}${offset}` });
    }
  });

  return Object.entries(grouped)
    .map(([group, options]) => ({
      label: group,
      options: options.sort((a, b) => a.label.localeCompare(b.label))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
})();

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { settings, updateStoreSettings } = useSettingsStore();
  const adminPath = settings?.site?.admin_path || 'admin1688';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get('tab') || 'basic';

  const [form] = Form.useForm();
  const enableMultilingual = Form.useWatch('enable_multilingual', form);
  const supportedLanguages: string[] = Form.useWatch('supported_languages', form) || ['zh', 'en'];
  const defaultLanguage: string = Form.useWatch('default_language', form) || 'zh';
  const logoUrl = Form.useWatch('logo', form);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [loading, setLoading] = useState(false);
  const [serverTimeInfo, setServerTimeInfo] = useState<{ timezone: string; time: string } | null>(null);
  const [basicSubTab, setBasicSubTab] = useState('site');
  const [dbSubTab, setDbSubTab] = useState('db');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncDates, setSyncDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [syncingStats, setSyncingStats] = useState(false);

  const handleManualSync = async () => {
    const [start, end] = syncDates;
    if (!start || !end) {
      message.warning('请选择要同步的日期范围');
      return;
    }
    
    setSyncingStats(true);
    try {
      const startStr = start.format('YYYY-MM-DD');
      const endStr = end.format('YYYY-MM-DD');
      const r = await (request.post(`/settings/usage-stats/sync?start_date=${startStr}&end_date=${endStr}`) as any);
      if (r.success) {
        message.success(r.message || '手动同步任务已在后台异步启动，请在后台查看日志');
        setSyncDates([null, null]);
      } else {
        message.error(r.message || '启动同步任务失败');
      }
    } catch (e) {
      console.error(e);
      message.error('启动后台同步任务失败');
    } finally {
      setSyncingStats(false);
    }
  };
  const [tosNetworkType, setTosNetworkType] = useState<'external' | 'internal'>('external');
  const [userLevels, setUserLevels] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);

  const getTitle = () => {
    switch (tab) {
      case 'database': return '存储设置';
      default: return t('menu.basic_settings');
    }
  };

  useEffect(() => { fetchSettings(); }, [tab]);

  const fetchSettings = async () => {
    try {
      setLoadingMenu(true);
      const [response, levelsResponse, pluginsResponse] = await Promise.all([
        request.get('/settings/full') as any,
        request.get('/user_levels') as any,
        request.get('/plugins') as any
      ]);
      const { site, currency, login, registration, smtp, database: backendDatabase, agreement, storage, menu_config, server_timezone, server_time } = response;
      if (server_timezone && server_time) {
        setServerTimeInfo({ timezone: server_timezone, time: server_time });
      }
      const defaultDatabase = { db_type: 'postgres', host: 'localhost', port: 5432, database: 'postgres', username: 'postgres', password: 'postgres', ssl_mode: false };
      const defaultAgreement = {
        tos_mode: 'link', tos_mode_en: 'link', tos_content: '', tos_content_en: '', tos_link: '', tos_link_en: '',
        privacy_mode: 'link', privacy_mode_en: 'link', privacy_content: '', privacy_content_en: '', privacy_link: '', privacy_link_en: ''
      };
      
      const allLevels = Array.isArray(levelsResponse) ? levelsResponse : (levelsResponse.data || levelsResponse.levels || []);
      setUserLevels(allLevels);

      const activePluginsList = pluginsResponse?.plugins || [];
      const isPluginActive = (pluginName: string) => {
        const p = activePluginsList.find((item: any) => item.name === pluginName);
        return p ? p.is_enabled === 1 : false;
      };

      const defaultMenuItems = [
        { key: '/dashboard', label_zh: '系统概览', label_en: 'Dashboard', icon: 'DashboardOutlined', enabled: true, sort_order: 1, allowed_levels: 'all' },
        { key: '/playground', label_zh: '创作中心', label_en: 'Playground', icon: 'ExperimentOutlined', enabled: true, sort_order: 2, allowed_levels: 'all' },
        { key: '/docs', label_zh: 'API教程', label_en: 'Relay API', icon: 'RocketOutlined', enabled: true, sort_order: 3, allowed_levels: 'all' },
        { key: '/tokens', label_zh: '令牌管理', label_en: 'Tokens', icon: 'KeyOutlined', enabled: true, sort_order: 4, allowed_levels: 'all' },
        { key: '/logs', label_zh: '日志记录', label_en: 'Logs', icon: 'HistoryOutlined', enabled: true, sort_order: 5, allowed_levels: 'all' },
        { key: '/task-logs', label_zh: '任务列表', label_en: 'Task Logs', icon: 'ScheduleOutlined', enabled: true, sort_order: 6, allowed_levels: 'all' },
        { key: '/assets', label_zh: '素材管理', label_en: 'Assets', icon: 'PictureOutlined', enabled: true, sort_order: 7, allowed_levels: 'all' },
        { key: '/assets-intl', label_zh: '资产管理', label_en: 'Assets Intl', icon: 'FolderOpenOutlined', enabled: true, sort_order: 8, allowed_levels: 'all' },
        { key: '/advanced-marketing', label_zh: '高级推广', label_en: 'Advanced Marketing', icon: 'TeamOutlined', enabled: true, sort_order: 10, allowed_levels: 'all' },
        { key: '/wallet', label_zh: '我的钱包', label_en: 'Wallet', icon: 'WalletOutlined', enabled: true, sort_order: 11, allowed_levels: 'all' },
        { key: '/ark-video-monitor', label_zh: '视频监控', label_en: 'Ark Video Monitor', icon: 'VideoCameraOutlined', enabled: false, sort_order: 11.5, allowed_levels: 'all' },
        { key: '/profile', label_zh: '个人中心', label_en: 'Profile', icon: 'UserOutlined', enabled: true, sort_order: 12, allowed_levels: 'all' },
      ];

      let loadedItems = [];
      if (menu_config && menu_config.items && menu_config.items.length > 0) {
        loadedItems = menu_config.items.map((item: any) => {
          if (item.key === '/relay-api') {
            return { ...item, key: '/docs' };
          }
          return item;
        });
      } else {
        loadedItems = [...defaultMenuItems];
      }

      defaultMenuItems.forEach((defItem) => {
        if (!loadedItems.some((item: any) => item.key === defItem.key)) {
          loadedItems.push({
            ...defItem,
            sort_order: loadedItems.length + 1
          });
        }
      });

      const filteredItems = loadedItems.filter((item: any) => {
        if (item.key === '/moderation-query') return false;
        if (item.key === '/playground') return isPluginActive('playground');
        if (item.key === '/assets') return isPluginActive('asset_manager');
        if (item.key === '/assets-intl') return isPluginActive('asset_manager_intl');
        if (item.key === '/advanced-marketing') return isPluginActive('team_marketing');
        if (item.key === '/ark-video-monitor') return isPluginActive('volcengine_ark_monitor');

        return true;
      });

      setMenuItems(filteredItems.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)));

      form.setFieldsValue({
        ...site,
        default_timezone: site?.default_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        admin_path: site?.admin_path || 'admin1688',
        login_style: site?.login_style || 'split',
        login_quote: site?.login_quote || '',
        show_timezone: site?.show_timezone !== false,
        login: login || {},
        registration: registration || {},
        smtp,
        database: { ...defaultDatabase, ...backendDatabase },
        storage: storage || {},
        agreement: agreement || defaultAgreement,
      });
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      // 全局拦截器已统一弹出错误提示
    } finally {
      setLoadingMenu(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const values = form.getFieldsValue(true);
      let payload: any = {};

      if (tab === 'basic') {
        payload.site = {
          ...settings?.site,
          name: values.name || '', logo: values.logo || '', title: values.title || '',
          keywords: values.keywords || '', description: values.description || '',
          favicon: values.favicon || '', login_title: values.login_title || '',
          login_subtitle: values.login_subtitle || '',
          login_style: values.login_style || 'split',
          login_quote: values.login_quote || '',
          enable_multilingual: values.enable_multilingual !== false,
          supported_languages: values.supported_languages || ['zh', 'en'],
          default_language: values.default_language || 'zh',
          enable_theme_toggle: values.enable_theme_toggle !== false,
          default_theme: values.default_theme || 'dark',
          default_timezone: values.default_timezone || settings?.site?.default_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          show_timezone: values.show_timezone !== false,
          copyright: values.copyright || '',
          admin_path: values.admin_path || 'admin1688',
        };
        payload.login = {
          ...settings?.login,
          ...values.login,
        };
        payload.registration = {
          ...settings?.registration,
          ...values.registration,
        };
        payload.agreement = {
          ...settings?.agreement,
          ...values.agreement,
        };
        payload.menu_config = {
          ...settings?.menu_config,
          items: menuItems.map((item, idx) => ({
            ...item,
            sort_order: idx + 1
          }))
        };
      } else if (tab === 'database') {
        // 根据子 Tab (dbSubTab) 细分提交字段以解耦各自的保存逻辑，避免非数据库 Tab 保存时受数据库校验的拦截
        if (dbSubTab === 'db') {
          payload.database = {
            ...settings?.database,
            ...values.database,
          };
        } else if (dbSubTab === 'storage' || dbSubTab === 'cleanup') {
          payload.storage = {
            ...settings?.storage,
            ...values.storage,
          };
        }
      }

      const oldAdminPath = settings?.site?.admin_path || 'admin1688';
      const updatedSettings = await (request.post('/settings', payload) as any);
      message.success(t('settings.save_success'));
      updateStoreSettings(updatedSettings);
      if (payload.site?.title) document.title = payload.site.title;

      const newAdminPath = updatedSettings.site?.admin_path || 'admin1688';
      if (oldAdminPath !== newAdminPath && tab === 'basic') {
        const newUrl = window.location.pathname.replace(`/${oldAdminPath}`, `/${newAdminPath}`) + window.location.search;
        window.location.replace(newUrl);
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      // 全局拦截器已统一弹出错误提示
    } finally {
      setLoading(false);
    }
  };

  const GoLink: React.FC<{ to: string; text: string }> = ({ to, text }) => (
    <Button type="link" size="small" onClick={() => navigate(to)} style={{ padding: 0, height: 'auto' }}>{text}</Button>
  );


  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const values = form.getFieldsValue(true);
      const res = await (request.post(`/settings/storage/test`, values.storage) as any);
      setTestResult(res);
    } catch (error: any) {
      setTestResult({ success: false, message: error?.response?.data?.error?.message || '测试失败' });
    } finally {
      setTesting(false);
    }
  };

  const siteSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label={t('settings.site_name')} name="name" rules={[{ required: true }]}><Input placeholder="TokensByte" /></Form.Item>
      <Form.Item label="站点 Logo" extra={<Text type="secondary">支持图片链接，建议尺寸 32x32 或 40x40，留空则仅显示站点名称文字，也可以点击右侧按钮直接上传本地图片</Text>}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Form.Item name="logo" noStyle>
            <Input placeholder="https://example.com/logo.png" style={{ flex: 1 }} />
          </Form.Item>
          <Upload
            accept="image/*"
            showUploadList={false}
            beforeUpload={async (file) => {
              if (!file.type.startsWith('image/')) {
                message.error('只支持上传图片格式的文件！');
                return Upload.LIST_IGNORE;
              }
              if (file.size > 5 * 1024 * 1024) {
                message.error('图片大小不能超过 5MB！');
                return Upload.LIST_IGNORE;
              }
              try {
                setUploadingLogo(true);
                const formData = new FormData();
                formData.append('file', file);
                formData.append('category', '站点设置');
                formData.append('remark', '站点 Logo');
                
                const res = await (request.post('/assets/upload', formData, {
                  headers: {
                    'Content-Type': 'multipart/form-data',
                    'x-plugin-ns': 'asset_manager',
                  },
                }) as Promise<any>);
                
                if (res?.asset?.file_url) {
                  form.setFieldsValue({ logo: res.asset.file_url });
                  message.success('Logo 上传成功！');
                } else {
                  message.error('上传成功，但未返回有效的图片链接');
                }
              } catch (err: any) {
                console.error(err);
                const errMsg = err.response?.data?.error?.message || err.message || '图片上传失败';
                message.error(errMsg);
              } finally {
                setUploadingLogo(false);
              }
              return Upload.LIST_IGNORE;
            }}
          >
            <Button icon={<UploadOutlined />} loading={uploadingLogo}>上传图片</Button>
          </Upload>
        </div>
        {logoUrl && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>预览:</Text>
            <img src={logoUrl} alt="Logo Preview" style={{ maxHeight: 32, maxWidth: 120, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--ant-color-border)', padding: '2px', background: '#fff' }} />
          </div>
        )}
      </Form.Item>
      <Form.Item label={t('settings.site_title')} name="title" rules={[{ required: true }]}><Input placeholder="TokensByte - LLM API Gateway" /></Form.Item>
      <Form.Item label="站点图标 (Favicon)" name="favicon" extra={<Text type="secondary">支持 .ico / .png / .svg 格式的图片链接</Text>}>
        <Input placeholder="https://example.com/favicon.ico" />
      </Form.Item>
      <Form.Item label={t('settings.site_keywords')} name="keywords"><Input.TextArea rows={2} placeholder="LLM, API, Gateway" /></Form.Item>
      <Form.Item label={t('settings.site_description')} name="description"><Input.TextArea rows={4} placeholder="Description..." /></Form.Item>
      <Form.Item label="站点多语言" name="enable_multilingual" valuePropName="checked" extra={<Text type="secondary">开启后，页面右上角将显示语言切换按钮，用户可在已启用的语言间切换</Text>}>
        <Switch />
      </Form.Item>
      <Form.Item name="supported_languages" noStyle />
      {enableMultilingual && (() => {
        // 获取当前系统实际载入的语言包列表 (例如: ['zh', 'en', 'ja', 'ko'])
        const implementedLangs = i18n.options.resources ? Object.keys(i18n.options.resources) : ['zh', 'en', 'ja', 'ko'];

        return (
          <div style={{ background: 'var(--ant-color-bg-layout)', border: '1px solid var(--ant-color-border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16, marginTop: -8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <Text strong style={{ fontSize: 14 }}>🌐 站点语言管理</Text>
                <div><Text type="secondary" style={{ fontSize: 12 }}>配置站点支持的语言，以及用户首次访问时使用的默认语言</Text></div>
              </div>
              <Button size="small" type="link" onClick={() => {
                const all = ALL_LANGUAGES.map(l => l.code).filter(code => implementedLangs.includes(code));
                form.setFieldsValue({ supported_languages: all });
              }}>全部启用</Button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {ALL_LANGUAGES.map(lang => {
                const isImplemented = implementedLangs.includes(lang.code);
                // 如果未实现，强制当作未启用
                const isEnabled = isImplemented && supportedLanguages.includes(lang.code);
                const isDefault = defaultLanguage === lang.code;
                return (
                  <div key={lang.code} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: 8,
                    background: isEnabled ? 'var(--ant-color-bg-container)' : 'transparent',
                    border: isEnabled ? '1px solid var(--ant-color-primary-border)' : '1px solid var(--ant-color-border)',
                    opacity: isImplemented ? (isEnabled ? 1 : 0.6) : 0.3,
                    transition: 'all 0.2s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{lang.flag}</span>
                      <div>
                        <Text strong style={{ fontSize: 13 }}>{lang.name}</Text>
                        <div>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            {lang.nativeName}
                            {!isImplemented && ' (未提供翻译)'}
                          </Text>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isDefault && <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 6px' }}>默认</Tag>}
                      <Switch size="small" checked={isEnabled} disabled={!isImplemented && !isEnabled} onChange={(checked) => {
                        let newLangs = [...supportedLanguages];
                        if (checked) { newLangs.push(lang.code); } else {
                          newLangs = newLangs.filter((l: string) => l !== lang.code);
                          if (newLangs.length === 0) newLangs = ['zh'];
                          if (defaultLanguage === lang.code) {
                            form.setFieldsValue({ default_language: newLangs[0] });
                          }
                        }
                        form.setFieldsValue({ supported_languages: newLangs });
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--ant-color-border)' }}>
              <Form.Item label="站点默认语言" name="default_language" style={{ marginBottom: 0 }}
                extra={<Text type="secondary">新用户首次访问或未手动切换语言时使用此语言</Text>}>
                <Select style={{ width: 240 }} options={
                  ALL_LANGUAGES
                    .filter(l => supportedLanguages.includes(l.code) && implementedLangs.includes(l.code))
                    .map(l => ({ label: `${l.flag} ${l.name} (${l.nativeName})`, value: l.code }))
                } />
              </Form.Item>
            </div>
          </div>
        );
      })()}
      <Form.Item
        label="站点默认时区"
        name="default_timezone"
        extra={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <Text type="secondary">
              用于全站统计归档、渠道额度日切、兑换码等共享业务的自然日；用户未设置个人时区时，也作为展示与计费日切的默认值。不影响底层数据存储（系统固定按 UTC 运行与落库）。
            </Text>
            {serverTimeInfo && (
              <div
                style={{
                  background: 'var(--ant-color-bg-layout)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  display: 'inline-block',
                  width: 'fit-content',
                  border: '1px solid var(--ant-color-border)',
                }}
              >
                <Space direction="vertical" size={2}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    系统运行时区（固定，不可改）：{' '}
                    <Text strong>{serverTimeInfo.timezone || 'UTC'}</Text>
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    系统当前时间（UTC）：{' '}
                    <Text strong>
                      {serverTimeInfo.time}
                      {serverTimeInfo.timezone === 'UTC' || !serverTimeInfo.timezone
                        ? ' UTC'
                        : ''}
                    </Text>
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11, opacity: 0.85 }}>
                    灰框为系统底层时钟（固定 UTC，不可改）；上方下拉为站点业务时区（展示、统计与共享业务日切）。
                  </Text>
                </Space>
              </div>
            )}
          </div>
        }
      >
        <Select
          style={{ width: 320 }}
          showSearch
          placeholder="请选择站点默认时区（IANA）"
          options={timezoneOptions}
          filterOption={(input, option: any) =>
            (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase()) ||
            (option?.value as string ?? '').toLowerCase().includes(input.toLowerCase())
          }
        />
      </Form.Item>
      <Form.Item
        label="显示时区后缀"
        name="show_timezone"
        valuePropName="checked"
        extra={
          <Text type="secondary">
            开启后，用户端/管理端在展示绝对时间（含时分秒）时追加偏移标记，例如 (UTC+5)。仅影响展示，不改变存储与计费日切逻辑。
          </Text>
        }
      >
        <Switch />
      </Form.Item>
      <Form.Item label="允许主题切换" name="enable_theme_toggle" valuePropName="checked" extra={<Text type="secondary">开启后，用户可在页面右上角切换亮色/暗色模式；关闭后则始终使用默认主题</Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label="站点默认主题" name="default_theme" extra={<Text type="secondary">新用户首次访问时使用的主题，已手动切换过的用户不受影响</Text>}>
        <Radio.Group>
          <Radio.Button value="dark">🌙 暗色模式</Radio.Button>
          <Radio.Button value="light">☀️ 亮色模式</Radio.Button>
        </Radio.Group>
      </Form.Item>
      <Form.Item label="版权信息" name="copyright" extra={<Text type="secondary">用于在登录页面底部显示，留空则不显示。例如：© 2026 MyCompany. All rights reserved.</Text>}>
        <Input placeholder="© 2026 MyCompany. All rights reserved." />
      </Form.Item>
    </div>
  );

  const securitySettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item
        label="管理后台访问路径"
        name="admin_path"
        rules={[
          { required: true, message: '请输入管理后台访问路径' },
          { pattern: /^[a-zA-Z0-9_\-]+$/, message: '路径仅支持字母、数字、下划线和中划线' }
        ]}
        extra={<Text type="secondary">修改后，管理后台的入口将更改为新的路径，例如：/admin1688。默认值为 admin1688。</Text>}
      >
        <Input placeholder="admin1688" />
      </Form.Item>
    </div>
  );

  const loginSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label="登录页标题" name="login_title" extra={<Text type="secondary">留空则使用站点名称</Text>}>
        <Input placeholder="例如：TokensByte" />
      </Form.Item>
      <Form.Item label="登录页副标题" name="login_subtitle" extra={<Text type="secondary">留空则使用默认文字</Text>}>
        <Input placeholder="例如：Next-gen LLM API Gateway" />
      </Form.Item>
      <Form.Item label="登录页风格" name="login_style" extra={<Text type="secondary">配置登录和注册页面的布局结构。经典风格将输入表单直接居中显示，隐藏左侧装饰区域；左右风格则是两栏布局。</Text>}>
        <LoginStyleSelector />
      </Form.Item>

      <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.login_style !== currentValues.login_style}>
        {({ getFieldValue }) => {
          const style = getFieldValue('login_style') || 'split';
          if (style !== 'split') return null;
          return (
            <Form.Item 
              label="左下角广告语" 
              name="login_quote" 
              extra={<Text type="secondary">配置“左右风格”左下角所显示的名言或广告语，留空时系统默认展示“下一代大语言模型 API 统一网关...”</Text>}
            >
              <Input.TextArea rows={3} placeholder="配置登录页左侧大背景底部所展示的宣传语，字数不宜过多" />
            </Form.Item>
          );
        }}
      </Form.Item>

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>{t('settings.login_title')}</Typography.Title>

      <Form.Item label={t('settings.enable_username_login')} name={['login', 'enable_username_login']} valuePropName="checked">
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_mobile_login')} name={['login', 'enable_mobile_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_sms')}，<GoLink to={`/${adminPath}/message-notification`} text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_email_login')} name={['login', 'enable_email_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_email')}，<GoLink to={`/${adminPath}/message-notification`} text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_wechat_login')} name={['login', 'enable_wechat_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_oauth')}，<GoLink to={`/${adminPath}/oauth-settings`} text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_google_login')} name={['login', 'enable_google_login']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_oauth')}，<GoLink to={`/${adminPath}/oauth-settings`} text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
    </div>
  );

  const registrationSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label={t('settings.enable_username_reg')} name={['registration', 'enable_username_registration']} valuePropName="checked"><Switch /></Form.Item>
      <Form.Item label={t('settings.enable_email_reg')} name={['registration', 'enable_email_registration']} valuePropName="checked"><Switch /></Form.Item>
      <Form.Item label={t('settings.enable_mobile_registration')} name={['registration', 'enable_mobile_registration']} valuePropName="checked"
        extra={<Text type="secondary">{t('settings.login_hint_sms')}，<GoLink to={`/${adminPath}/message-notification`} text={t('settings.goto_settings')} /></Text>}>
        <Switch />
      </Form.Item>
      <Form.Item label={t('settings.enable_password_recovery')} name={['registration', 'enable_password_recovery']} valuePropName="checked"><Switch /></Form.Item>

      <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 16 }}>安全策略</Typography.Title>

      <Form.Item label={t('settings.ip_rate_limit_enabled')} name={['registration', 'ip_rate_limit_enabled']} valuePropName="checked"
        extra={<Text type="secondary">开启后限制同一 IP 每天注册次数（手机号注册由于需真实短信验证，不受此限制）</Text>}>
        <Switch />
      </Form.Item>
      <Form.Item noStyle dependencies={[['registration', 'ip_rate_limit_enabled']]}>
        {({ getFieldValue }) => getFieldValue(['registration', 'ip_rate_limit_enabled']) ? (
          <Form.Item label={t('settings.ip_daily_limit')} name={['registration', 'ip_daily_limit']}>
            <InputNumber min={1} max={100} addonAfter={t('settings.ip_daily_limit_unit')} style={{ width: 200 }} />
          </Form.Item>
        ) : null}
      </Form.Item>

      <Form.Item label={t('settings.email_validation_strict')} name={['registration', 'email_validation_strict']} valuePropName="checked"
        extra={<Text type="secondary">开启后邮箱 @ 前仅允许数字、字母和下划线，长度≤25</Text>}>
        <Switch />
      </Form.Item>

      <Form.Item label={t('settings.email_whitelist_enabled')} name={['registration', 'email_whitelist_enabled']} valuePropName="checked"
        extra={<Text type="secondary">开启后仅允许指定域名的邮箱注册</Text>}>
        <Switch />
      </Form.Item>
      <Form.Item noStyle dependencies={[['registration', 'email_whitelist_enabled']]}>
        {({ getFieldValue }) => getFieldValue(['registration', 'email_whitelist_enabled']) ? (
          <Form.Item label="允许的邮箱域名" name={['registration', 'email_whitelist']}>
            <Select mode="tags" placeholder={t('settings.email_whitelist_placeholder')} style={{ width: '100%' }}
              tokenSeparators={[',', ' ']} />
          </Form.Item>
        ) : null}
      </Form.Item>
    </div>
  );

  const agreementSettingsContent = (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 24, padding: '16px', background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border-secondary)', borderRadius: '8px' }}>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>全局协议控制 (Global Agreement Control)</Typography.Title>
        <Form.Item label="启用服务条款" name={['agreement', 'tos_enabled']} valuePropName="checked" extra={<Typography.Text type="secondary">开启后，用户在登录和注册时会显示并需要同意服务条款</Typography.Text>}>
          <Switch />
        </Form.Item>
        <Form.Item label="启用隐私协议" name={['agreement', 'privacy_enabled']} valuePropName="checked" extra={<Typography.Text type="secondary">开启后，用户在登录和注册时会显示并需要同意隐私协议</Typography.Text>}>
          <Switch />
        </Form.Item>
      </div>

      <Tabs defaultActiveKey="zh">
        <Tabs.TabPane tab="简体中文 (默认)" key="zh">
          <Typography.Title level={5}>服务条款 (Terms of Service)</Typography.Title>
          <Form.Item label="显示方式" name={['agreement', 'tos_mode']}>
            <Radio.Group>
              <Radio.Button value="link">网页链接</Radio.Button>
              <Radio.Button value="text">站内富文本</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle dependencies={[['agreement', 'tos_mode']]}>
            {({ getFieldValue }) => getFieldValue(['agreement', 'tos_mode']) === 'link' ? (
              <Form.Item label="链接地址" name={['agreement', 'tos_link']}>
                <Input placeholder="https://example.com/terms" />
              </Form.Item>
            ) : (
              <Form.Item label="内容" name={['agreement', 'tos_content']}>
                <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50, backgroundColor: 'var(--ant-color-bg-container)', color: 'var(--ant-color-text)' }} />
              </Form.Item>
            )}
          </Form.Item>

          <Typography.Title level={5} style={{ marginTop: 40 }}>隐私协议 (Privacy Policy)</Typography.Title>
          <Form.Item label="显示方式" name={['agreement', 'privacy_mode']}>
            <Radio.Group>
              <Radio.Button value="link">网页链接</Radio.Button>
              <Radio.Button value="text">站内富文本</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle dependencies={[['agreement', 'privacy_mode']]}>
            {({ getFieldValue }) => getFieldValue(['agreement', 'privacy_mode']) === 'link' ? (
              <Form.Item label="链接地址" name={['agreement', 'privacy_link']}>
                <Input placeholder="https://example.com/privacy" />
              </Form.Item>
            ) : (
              <Form.Item label="内容" name={['agreement', 'privacy_content']}>
                <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50, backgroundColor: 'var(--ant-color-bg-container)', color: 'var(--ant-color-text)' }} />
              </Form.Item>
            )}
          </Form.Item>
        </Tabs.TabPane>

        <Tabs.TabPane tab="English" key="en">
          <Typography.Title level={5}>Terms of Service</Typography.Title>
          <Form.Item label="Display Mode" name={['agreement', 'tos_mode_en']}>
            <Radio.Group>
              <Radio.Button value="link">Link URL</Radio.Button>
              <Radio.Button value="text">Rich Text</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle dependencies={[['agreement', 'tos_mode_en']]}>
            {({ getFieldValue }) => getFieldValue(['agreement', 'tos_mode_en']) === 'link' ? (
              <Form.Item label="Link URL (English)" name={['agreement', 'tos_link_en']}>
                <Input placeholder="https://example.com/en/terms" />
              </Form.Item>
            ) : (
              <Form.Item label="Content (English)" name={['agreement', 'tos_content_en']}>
                <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50, backgroundColor: 'var(--ant-color-bg-container)', color: 'var(--ant-color-text)' }} />
              </Form.Item>
            )}
          </Form.Item>

          <Typography.Title level={5} style={{ marginTop: 40 }}>Privacy Policy</Typography.Title>
          <Form.Item label="Display Mode" name={['agreement', 'privacy_mode_en']}>
            <Radio.Group>
              <Radio.Button value="link">Link URL</Radio.Button>
              <Radio.Button value="text">Rich Text</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item noStyle dependencies={[['agreement', 'privacy_mode_en']]}>
            {({ getFieldValue }) => getFieldValue(['agreement', 'privacy_mode_en']) === 'link' ? (
              <Form.Item label="Link URL (English)" name={['agreement', 'privacy_link_en']}>
                <Input placeholder="https://example.com/en/privacy" />
              </Form.Item>
            ) : (
              <Form.Item label="Content (English)" name={['agreement', 'privacy_content_en']}>
                <ReactQuill theme="snow" style={{ height: 300, marginBottom: 50, backgroundColor: 'var(--ant-color-bg-container)', color: 'var(--ant-color-text)' }} />
              </Form.Item>
            )}
          </Form.Item>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...menuItems];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    
    // Swap
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    
    setMenuItems(newItems);
  };

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...menuItems];
    newItems[index] = {
      ...newItems[index],
      [field]: value
    };
    setMenuItems(newItems);
  };

  const menuSettingsContent = loadingMenu ? (
    <div style={{ textAlign: 'center', padding: '60px 0' }}>
      <Spin size="large" tip="正在加载菜单配置..." />
    </div>
  ) : (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="菜单配置说明"
          description="在此配置用户使用端（左侧菜单栏）中各个菜单的显示顺序、启用状态以及针对不同会员等级/用户组的访问可见权限。"
          type="info"
          showIcon
        />
      </div>
      <Table
        dataSource={menuItems}
        rowKey="key"
        pagination={false}
        size="middle"
        columns={[
          {
            title: '顺序',
            key: 'sort',
            width: 100,
            align: 'center',
            render: (_, __, index) => (
              <Space size="small">
                <Button
                  size="small"
                  icon={<Icons.ArrowUpOutlined />}
                  disabled={index === 0}
                  onClick={() => moveItem(index, 'up')}
                />
                <Button
                  size="small"
                  icon={<Icons.ArrowDownOutlined />}
                  disabled={index === menuItems.length - 1}
                  onClick={() => moveItem(index, 'down')}
                />
              </Space>
            ),
          },
          {
            title: '菜单图标 & 路径',
            key: 'icon_path',
            width: 200,
            render: (_, record) => {
              const IconComp = (Icons as any)[record.icon];
              return (
                <Space direction="vertical" size={2}>
                  <Space>
                    {IconComp ? <IconComp style={{ fontSize: '18px', color: '#1677ff' }} /> : <Icons.MenuOutlined style={{ fontSize: '18px' }} />}
                    <Text strong>{record.key}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    图标类名: {record.icon}
                  </Text>
                </Space>
              );
            },
          },
          {
            title: '中文名称 (Zh)',
            dataIndex: 'label_zh',
            key: 'label_zh',
            width: 180,
            render: (text, _, index) => (
              <Input
                value={text}
                onChange={(e) => updateItem(index, 'label_zh', e.target.value)}
                placeholder="中文名称"
              />
            ),
          },
          {
            title: '英文名称 (En)',
            dataIndex: 'label_en',
            key: 'label_en',
            width: 180,
            render: (text, _, index) => (
              <Input
                value={text}
                onChange={(e) => updateItem(index, 'label_en', e.target.value)}
                placeholder="英文名称"
              />
            ),
          },
          {
            title: '启用状态',
            dataIndex: 'enabled',
            key: 'enabled',
            width: 100,
            align: 'center',
            render: (checked, _, index) => (
              <Switch
                checked={checked}
                onChange={(val) => updateItem(index, 'enabled', val)}
              />
            ),
          },
          {
            title: '可见等级权限',
            dataIndex: 'allowed_levels',
            key: 'allowed_levels',
            render: (value, _, index) => {
              const selectedKeys = value === 'all' ? ['all'] : (value ? value.split(',') : []);
              return (
                <Select
                  mode="multiple"
                  style={{ width: '100%', minWidth: 200 }}
                  placeholder="选择可见等级，为空则不可见"
                  value={selectedKeys}
                  onChange={(vals: string[]) => {
                    if (vals.includes('all')) {
                      if (vals[vals.length - 1] === 'all') {
                        updateItem(index, 'allowed_levels', 'all');
                      } else {
                        const filtered = vals.filter((v: string) => v !== 'all');
                        updateItem(index, 'allowed_levels', filtered.join(','));
                      }
                    } else {
                      updateItem(index, 'allowed_levels', vals.join(','));
                    }
                  }}
                  options={[
                    { label: '全部会员等级', value: 'all' },
                    ...userLevels.map((lv) => ({
                      label: `${lv.name} (ULID: ${lv.id})`,
                      value: lv.id.toString(),
                    })),
                  ]}
                />
              );
            },
          },
        ]}
      />
    </div>
  );

  const dataCleanupContent = (
    <div style={{ maxWidth: 600 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 20 }}
        message="两级策略：① 详情清理只清空请求/响应大字段，行仍留在热表；② 行归档把超期整行迁入 logs_archive 并从热表删除。仪表盘历史统计走 usage_daily_stats，归档前请先校准同步。"
      />
      <Form.Item
        label="日志详情保留天数"
        name={['storage', 'log_retention_days']}
        extra={<Text type="secondary">设为 0 表示永不清理大字段；默认 30 天</Text>}
        style={{ marginBottom: 24 }}
      >
        <InputNumber min={0} max={3650} style={{ width: 200 }} addonAfter="天" placeholder="30" />
      </Form.Item>
      <Form.Item
        label="日志行归档天数（热表）"
        name={['storage', 'log_row_retention_days']}
        extra={
          <Text type="secondary">
            超期行迁入 logs_archive（系统自动 +2 天缓冲）。0=不归档（默认）。大数据量站点建议 90，且 ≥ 详情保留天数。
          </Text>
        }
        style={{ marginBottom: 24 }}
      >
        <InputNumber min={0} max={3650} style={{ width: 200 }} addonAfter="天" placeholder="0" />
      </Form.Item>

      <Card 
        title="历史使用数据每日统计校准与补录" 
        size="small" 
        style={{ borderRadius: 8, marginTop: 16 }}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
            系统在每天凌晨会自动增量同步历史日志到汇总表。如果您发现某些天的费用或Token数统计有误，或者想补录过去某段时间的数据，可以在下方选择日期范围手动触发同步（在后台静默分批处理，不影响网站使用）。
          </Text>
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <DatePicker.RangePicker
            style={{ width: '100%' }}
            value={syncDates}
            onChange={(val) => setSyncDates(val ? [val[0], val[1]] : [null, null])}
            disabledDate={(current) => current && current > dayjs().endOf('day')}
            placeholder={['开始日期', '结束日期']}
          />
          <Button 
            type="primary" 
            onClick={handleManualSync} 
            loading={syncingStats}
            disabled={!syncDates[0] || !syncDates[1]}
          >
            开始同步与校准
          </Button>
        </Space>
      </Card>
    </div>
  );

  const storageSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      {testResult && (
        <div style={{ marginBottom: 16 }}>
          <Alert
            type={testResult.success ? 'success' : 'error'}
            showIcon
            message={testResult.success ? '连接成功' : '连接失败'}
            description={testResult.message}
          />
        </div>
      )}

      <Form.Item label="Access Key" name={['storage', 'tos_access_key']} rules={[{ required: true, message: '请输入 Access Key' }]}>
        <Input placeholder="火山引擎 Access Key" />
      </Form.Item>
      <Form.Item label="Secret Key" name={['storage', 'tos_secret_key']} rules={[{ required: true, message: '请输入 Secret Key' }]}>
        <Input.Password placeholder="火山引擎 Secret Key" />
      </Form.Item>

      <Form.Item label="数据地域" name={['storage', 'tos_region']} rules={[{ required: true, message: '请选择数据地域' }]}>
        <Select
          placeholder="选择数据地域"
          showSearch
          optionFilterProp="label"
          onChange={(value: string) => {
            const found = ALL_TOS_REGIONS.find(r => r.region === value);
            if (found) {
              const ep = tosNetworkType === 'internal' ? found.endpointInternal : found.endpointExternal;
              form.setFieldsValue({ storage: { ...form.getFieldValue('storage'), tos_endpoint: ep } });
            }
          }}
        >
          {TOS_REGION_GROUPS.map(g => (
            <Select.OptGroup key={g.group} label={<span style={{ fontWeight: 600, fontSize: 13 }}>{g.group}</span>}>
              {g.regions.map(r => (
                <Select.Option key={r.region} value={r.region} label={`${r.label} ${r.region}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{r.label}</span>
                    <span style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>{r.region.replace(/^bp-/, '')}</span>
                  </div>
                </Select.Option>
              ))}
            </Select.OptGroup>
          ))}
        </Select>
      </Form.Item>

      <Form.Item label="网络类型">
        <Radio.Group
          value={tosNetworkType}
          onChange={(e) => {
            const newType = e.target.value as 'external' | 'internal';
            setTosNetworkType(newType);
            const currentRegion = form.getFieldValue(['storage', 'tos_region']);
            if (currentRegion) {
              const found = ALL_TOS_REGIONS.find(r => r.region === currentRegion);
              if (found) {
                const ep = newType === 'internal' ? found.endpointInternal : found.endpointExternal;
                form.setFieldsValue({ storage: { ...form.getFieldValue('storage'), tos_endpoint: ep } });
              }
            }
          }}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="external">外网</Radio.Button>
          <Radio.Button value="internal">内网</Radio.Button>
        </Radio.Group>
      </Form.Item>

      <Form.Item label="Endpoint" name={['storage', 'tos_endpoint']} rules={[{ required: true, message: '请选择地域后自动填充' }]} extra={<Text type="secondary" style={{ fontSize: 11 }}>选择地域和网络类型后自动填充，也可手动修改</Text>}>
        <Input placeholder="选择地域后自动填充" />
      </Form.Item>

      <Form.Item label="Bucket" name={['storage', 'tos_bucket']} rules={[{ required: true, message: '请输入 Bucket 名称' }]}>
        <Input placeholder="对象存储桶名称" />
      </Form.Item>

      <Form.Item label="路径前缀" name={['storage', 'tos_path_prefix']} extra={<Text type="secondary" style={{ fontSize: 11 }}>选填，如 assets/</Text>}>
        <Input placeholder="如 assets/" />
      </Form.Item>

      <Form.Item label="自定义域名" name={['storage', 'tos_custom_domain']} extra={<Text type="secondary" style={{ fontSize: 11 }}>选填，CDN 加速域名</Text>}>
        <Input placeholder="如 https://cdn.example.com" />
      </Form.Item>

      <Space style={{ marginBottom: 16 }}>
        <Button onClick={handleTestConnection} loading={testing}>测试连接</Button>
      </Space>
    </div>
  );

  const dbSettingsContent = (
    <div style={{ maxWidth: 600 }}>
      <Form.Item label="数据库类型" name={['database', 'db_type']} rules={[{ required: true }]}>
        <Radio.Group><Radio.Button value="postgres">PostgreSQL</Radio.Button></Radio.Group>
      </Form.Item>
      <Form.Item label="数据库地址 (Host)" name={['database', 'host']} rules={[{ required: true }]}><Input placeholder="localhost" /></Form.Item>
      <Form.Item label="端口 (Port)" name={['database', 'port']} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} placeholder="5432" /></Form.Item>
      <Form.Item label="数据库名称" name={['database', 'database']} rules={[{ required: true }]}><Input placeholder="postgres" /></Form.Item>
      <Form.Item label="用户名" name={['database', 'username']} rules={[{ required: true }]}><Input placeholder="postgres" /></Form.Item>
      <Form.Item label="密码" name={['database', 'password']}><Input.Password placeholder="postgres" /></Form.Item>
      <Form.Item label="启用 SSL" name={['database', 'ssl_mode']} valuePropName="checked"><Switch /></Form.Item>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={async () => {
          try { const v = await form.validateFields(); const r = await (request.post('/settings/database/verify', v.database) as any); r.success ? message.success(r.message) : message.error(r.message); } catch { /* 全局拦截器已统一处理 */ }
        }}>测试连接</Button>
        <Button danger onClick={async () => {
          try { const v = await form.validateFields(); const r = await (request.post('/settings/database/initialize', v.database) as any); r.success ? message.success(r.message) : message.error(r.message); } catch { /* 全局拦截器已统一处理 */ }
        }}>初始化数据库</Button>
        <Button onClick={async () => {
          try { const r = await (request.post('/settings/database/backup') as any); r.success ? message.success(r.message) : message.error(r.message); } catch { /* 全局拦截器已统一处理 */ }
        }}>执行备份</Button>
        <Button
          danger
          onClick={() => {
            Modal.confirm({
              title: '异常计费订单自动订正',
              content: '系统将扫描最近5000条计费状态为200成功且计费明细包含“冻结”字样、但实际上上游返回失败的异常模型订单。确认要一键退还用户余额，并扣减对应的令牌、渠道用量吗？此操作包含并发防重锁定，不会重复扣减或退费。',
              okText: '确认订正',
              cancelText: '取消',
              onOk: async () => {
                try {
                  const r = await (request.post('/settings/repair-logs') as any);
                  if (r.success) {
                    Modal.success({
                      title: '自动订正成功',
                      width: 650,
                      content: (
                        <div>
                          <div style={{ marginBottom: 16 }}>
                            共计修复异常失败账单: <strong>{r.repaired_count}</strong> 笔，已退回用户普通余额: <strong>{r.refunded_balance}</strong>，退回赠送余额: <strong>{r.refunded_gift_balance}</strong>。同时已自动回滚对应的渠道与令牌的已用额度占用。
                          </div>
                          {r.details && r.details.length > 0 && (
                            <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: '8px 12px', background: '#fafafa' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr style={{ borderBottom: '2px solid #e8e8e8', color: '#595959', fontWeight: 600 }}>
                                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>用户 ID</th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>退回余额</th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>退回赠送</th>
                                    <th style={{ padding: '6px 4px', textAlign: 'left' }}>异常原因</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.details.map((detail: any, idx: number) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #e8e8e8' }}>
                                      <td style={{ padding: '6px 4px', fontFamily: 'monospace', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail.user_id}>{detail.user_id}</td>
                                      <td style={{ padding: '6px 4px', color: '#52c41a', fontWeight: 'bold' }}>+{detail.refund_balance.toFixed(6)}</td>
                                      <td style={{ padding: '6px 4px', color: '#1890ff', fontWeight: 'bold' }}>+{detail.refund_gift.toFixed(6)}</td>
                                      <td style={{ padding: '6px 4px', color: '#ff4d4f', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detail.error_message}>{detail.error_message}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )
                    });
                  } else {
                    message.error(r.message || '订正失败');
                  }
                } catch (e) {
                  message.error('请求接口失败');
                }
              }
            });
          }}
        >
          异常计费订正
        </Button>
      </Space>
    </div>
  );

  return (
    <Card bordered={false} title={getTitle()} style={{ borderRadius: 12 }}>
      <style>{`
        .settings-compact-form .ant-form-item {
          margin-bottom: 12px;
        }
        .settings-compact-form .ant-form-item-label {
          padding-bottom: 4px;
        }
        .settings-compact-form .ant-card-body {
          padding-top: 12px;
        }
        .settings-compact-form .ant-tabs-nav {
          margin-bottom: 12px;
        }
      `}</style>
      <Form className="settings-compact-form" form={form} layout="vertical" autoComplete="off"
        initialValues={{ database: { db_type: 'postgres', host: 'localhost', port: 5432, database: 'postgres', username: 'postgres', password: 'postgres', ssl_mode: false } }}>

        {tab === 'basic' && (
          <Tabs activeKey={basicSubTab} onChange={setBasicSubTab} items={[
            { key: 'site', label: '站点信息', children: siteSettingsContent },
            { key: 'security', label: '站点安全', children: securitySettingsContent },
            { key: 'login', label: '登录设置', children: loginSettingsContent },
            { key: 'registration', label: '注册设置', children: registrationSettingsContent },
            { key: 'agreement', label: '站点协议', children: agreementSettingsContent },
            { key: 'menu', label: '菜单配置', children: menuSettingsContent },
          ]} />
        )}


        {tab === 'database' && (
          <Tabs activeKey={dbSubTab} onChange={setDbSubTab} items={[
            { key: 'db', label: '数据库设置', children: dbSettingsContent },
            { key: 'storage', label: '存储设置', children: storageSettingsContent },
            { key: 'cleanup', label: '数据清理', children: dataCleanupContent },
          ]} />
        )}

        <Form.Item style={{ marginTop: 24 }}>
          <Button type="primary" onClick={handleSave} loading={loading} size="large">{t('common.save')}</Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default Settings;
