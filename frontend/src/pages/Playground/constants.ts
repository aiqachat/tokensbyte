/**
 * Playground 常量定义
 * 纯数据，无 React 依赖，便于测试和复用
 */
import React from 'react';
import {
  VideoCameraOutlined, PictureOutlined, MessageOutlined,
  AudioOutlined, CompassOutlined, StarOutlined, ThunderboltOutlined
} from '@ant-design/icons';
import { Image as ImageIcon, Video as VideoIcon, MessageSquare, Mic, Compass as CompassLucide, Star as StarLucide, Sparkles } from 'lucide-react';

/** 分辨率与比例对应的像素映射表 */
export const RESOLUTION_MAP: Record<string, Record<string, string>> = {
  '480p': {
    '16:9': '864×496', '4:3': '752×560', '1:1': '640×640',
    '3:4': '560×752', '9:16': '496×864', '21:9': '992×432',
  },
  '720p': {
    '16:9': '1280×720', '4:3': '1112×834', '1:1': '960×960',
    '3:4': '834×1112', '9:16': '720×1280', '21:9': '1470×630',
  },
  '1080p': {
    '16:9': '1920×1080', '4:3': '1664×1248', '1:1': '1440×1440',
    '3:4': '1248×1664', '9:16': '1080×1920', '21:9': '2206×946',
  },
};

/** 获取类别对应的 Lucide 图标 (Shadcn UI 风格) */
export const getLucideCategoryIcon = (cat: string, size = 16) => {
  if (cat === '默认展示') return React.createElement(StarLucide, { size });
  if (cat.includes('视频增强') || cat.includes('video-enhance') || cat.includes('videoenhance') || cat.includes('video_enhance')) return React.createElement(Sparkles, { size });
  if (cat === 'video' || cat.includes('视频')) return React.createElement(VideoIcon, { size });
  if (cat === 'image' || cat.includes('图片')) return React.createElement(ImageIcon, { size });
  if (cat === 'chat' || cat.includes('聊天')) return React.createElement(MessageSquare, { size });
  if (cat === 'audio' || cat.includes('音频')) return React.createElement(Mic, { size });
  return React.createElement(CompassLucide, { size });
};

/** 获取类别对应的图标 */
export const getCategoryIcon = (cat: string, isActive: boolean, size = 16) => {
  if (cat === '默认展示') return React.createElement(StarOutlined, { style: { fontSize: size } });
  if (cat.includes('视频增强') || cat.includes('video-enhance') || cat.includes('videoenhance') || cat.includes('video_enhance')) return React.createElement(ThunderboltOutlined, { style: { fontSize: size } });
  if (cat === 'video' || cat.includes('视频')) return React.createElement(VideoCameraOutlined, { style: { fontSize: size } });
  if (cat === 'image' || cat.includes('图片')) return React.createElement(PictureOutlined, { style: { fontSize: size } });
  if (cat === 'chat' || cat.includes('聊天')) return React.createElement(MessageOutlined, { style: { fontSize: size } });
  if (cat === 'audio' || cat.includes('音频')) return React.createElement(AudioOutlined, { style: { fontSize: size } });
  return React.createElement(CompassOutlined, { style: { fontSize: size } });
};

/** 获取类别的中文标签 */
export const getCategoryLabel = (cat: string): string => {
  if (cat === '默认展示') return '默认展示';
  if (cat.includes('视频增强') || cat.includes('video-enhance') || cat.includes('videoenhance') || cat.includes('video_enhance')) return '视频增强';
  if (cat === 'video' || cat.includes('视频')) return '视频创作';
  if (cat === 'image' || cat.includes('图片')) return '图片创作';
  if (cat === 'chat' || cat.includes('聊天')) return '聊天问答';
  if (cat === 'audio' || cat.includes('音频')) return '语音合成';
  return cat;
};
