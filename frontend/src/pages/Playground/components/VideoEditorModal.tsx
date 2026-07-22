/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

/**
 * 视频编辑器弹窗 (VideoEditorModal)
 *
 * 类似 iOS / Android 原生视频编辑体验：
 * - 视频播放与暂停
 * - 时间轴缩略图条
 * - 可拖动的起止点手柄（裁剪）
 * - 裁剪后预览与保存
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Modal, Tooltip } from 'antd';
import toast from './PlaygroundToast';
import {
  PlayCircleOutlined, PauseCircleOutlined,
  UndoOutlined, ExpandOutlined, CompressOutlined,
  FullscreenOutlined, FullscreenExitOutlined,
  SoundOutlined,
} from '@ant-design/icons';

interface VideoEditorModalProps {
  open: boolean;
  videoUrl: string;
  onCancel: () => void;
  onSave: (trimmedUrl: string, file: File) => void;
}

const THUMB_COUNT = 10;
const HANDLE_W = 16;

const VideoEditorModal: React.FC<VideoEditorModalProps> = ({ open, videoUrl, onCancel, onSave }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<'start' | 'end' | null>(null);
  // 用 ref 保持最新值，避免 document 事件闭包陈旧
  const trimStartRef = useRef(0);
  const trimEndRef = useRef(1);
  const durationRef = useRef(0);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'fit' | '100'>('fit');
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!modalRef.current) return;
    if (!document.fullscreenElement) {
      modalRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // 同步 ref
  useEffect(() => { trimStartRef.current = trimStart; }, [trimStart]);
  useEffect(() => { trimEndRef.current = trimEnd; }, [trimEnd]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // ===== 重置状态 =====
  useEffect(() => {
    if (open) {
      setPlaying(false);
      setDuration(0);
      setCurrentTime(0);
      setTrimStart(0);
      setTrimEnd(1);
      setThumbnails([]);
    }
  }, [open, videoUrl]);

  // ===== 视频事件 - 直接用 JSX 回调，不依赖 useEffect =====
  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current;
    if (!vid || !vid.duration || !isFinite(vid.duration)) return;
    setDuration(vid.duration);
    durationRef.current = vid.duration;
    setVideoDims({ w: vid.videoWidth || 0, h: vid.videoHeight || 0 });
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    setCurrentTime(vid.currentTime);
    // 播放到裁剪结束点时自动停止
    if (vid.currentTime >= trimEndRef.current * durationRef.current - 0.05) {
      vid.pause();
      setPlaying(false);
    }
  }, []);

  const handleVideoEnded = useCallback(() => {
    setPlaying(false);
  }, []);

  // ===== 生成缩略图 =====
  useEffect(() => {
    if (!open || !videoUrl) return;
    setThumbnails([]);

    const vid = document.createElement('video');
    vid.muted = true;
    vid.preload = 'auto';
    vid.src = videoUrl;

    let cancelled = false;

    vid.onloadedmetadata = () => {
      const dur = vid.duration;
      if (!dur || !isFinite(dur) || cancelled) return;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = 80;
      canvas.height = 56;

      const times = Array.from({ length: THUMB_COUNT }, (_, i) =>
        (i / Math.max(THUMB_COUNT - 1, 1)) * dur
      );
      const results: string[] = [];
      let idx = 0;

      const captureNext = () => {
        if (cancelled || idx >= times.length) {
          if (!cancelled && results.length > 0) setThumbnails([...results]);
          return;
        }
        vid.currentTime = times[idx];
      };

      vid.onseeked = () => {
        if (cancelled) return;
        try {
          ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
          results.push(canvas.toDataURL('image/jpeg', 0.4));
        } catch {
          results.push('');
        }
        idx++;
        captureNext();
      };

      captureNext();
    };

    return () => { cancelled = true; };
  }, [open, videoUrl]);

  // ===== 拖拽：document 级事件 =====
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const type = draggingRef.current;
      if (!type || !timelineRef.current) return;
      const dur = durationRef.current;
      if (!dur) return;

      const rect = timelineRef.current.getBoundingClientRect();
      let ratio = (e.clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));

      if (type === 'start') {
        const next = Math.min(ratio, trimEndRef.current - 0.03);
        setTrimStart(Math.max(0, next));
      } else {
        const next = Math.max(ratio, trimStartRef.current + 0.03);
        setTrimEnd(Math.min(1, next));
      }

      // 跳到对应位置预览
      const vid = videoRef.current;
      if (vid && dur) {
        vid.currentTime = ratio * dur;
      }
    };

    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handleHandleDown = useCallback((type: 'start' | 'end', e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = type;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // 点击时间轴跳转
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (draggingRef.current) return;
    if (!timelineRef.current || !videoRef.current) return;
    const dur = durationRef.current;
    if (!dur) return;
    const rect = timelineRef.current.getBoundingClientRect();
    let ratio = (e.clientX - rect.left) / rect.width;
    ratio = Math.max(0, Math.min(1, ratio));
    videoRef.current.currentTime = ratio * dur;
  }, []);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const dur = durationRef.current;
    if (!dur) return;

    if (playing) {
      vid.pause();
      setPlaying(false);
    } else {
      const ts = trimStartRef.current;
      const te = trimEndRef.current;
      if (vid.currentTime < ts * dur || vid.currentTime >= te * dur - 0.05) {
        vid.currentTime = ts * dur;
      }
      vid.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing]);

  const resetTrim = useCallback(() => {
    setTrimStart(0);
    setTrimEnd(1);
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, []);

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ===== 导出 / 完成 =====
  const handleExport = useCallback(async () => {
    const vid = videoRef.current;
    const dur = durationRef.current;
    if (!vid || !dur) return;
    const ts = trimStartRef.current;
    const te = trimEndRef.current;

    // 未裁剪 → 直接返回原素材
    if (ts < 0.005 && te > 0.995) {
      try {
        const res = await fetch(videoUrl);
        const blob = await res.blob();
        const file = new File([blob], `video_${Date.now()}.mp4`, { type: blob.type || 'video/mp4' });
        onSave(videoUrl, file);
      } catch {
        onSave(videoUrl, new File([], `video_${Date.now()}.mp4`, { type: 'video/mp4' }));
      }
      return;
    }

    // 有裁剪 → Canvas + MediaRecorder
    setExporting(true);
    toast.info('正在导出裁剪视频...');

    try {
      const startTime = ts * dur;
      const endTime = te * dur;

      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth || 1280;
      canvas.height = vid.videoHeight || 720;
      const ctx = canvas.getContext('2d')!;
      const stream = canvas.captureStream(30);

      const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find(m => MediaRecorder.isTypeSupported(m));
      if (!mimeType) {
        throw new Error('浏览器不支持视频录制');
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      vid.currentTime = startTime;
      vid.muted = true;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (recorder.state === 'recording') recorder.stop();
          reject(new Error('导出超时'));
        }, 120000);

        recorder.onstop = () => { clearTimeout(timeout); resolve(); };

        const begin = () => {
          recorder.start(100);
          vid.play().catch(reject);
          const loop = () => {
            if (vid.currentTime >= endTime || vid.paused) {
              vid.pause();
              if (recorder.state === 'recording') recorder.stop();
              return;
            }
            ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
            requestAnimationFrame(loop);
          };
          loop();
        };

        vid.onseeked = () => { vid.onseeked = null; begin(); };
        if (Math.abs(vid.currentTime - startTime) < 0.15) { vid.onseeked = null; begin(); }
      });

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const file = new File([blob], `trimmed_${Date.now()}.webm`, { type: mimeType });

      toast.success('裁剪导出完成');
      onSave(url, file);
    } catch (err: any) {

      toast.error(err?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  }, [videoUrl, onSave]);

  // ===== 计算值 =====
  const playheadPos = duration > 0 ? currentTime / duration : 0;
  const trimDuration = duration * (trimEnd - trimStart);
  const isTrimmed = trimStart > 0.005 || trimEnd < 0.995;

  return (
    <Modal
      zIndex={3000}
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      centered
      destroyOnClose
      title={null}
      closable={false}
      style={{ borderRadius: 16, overflow: 'hidden', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.08)' }}
      styles={{
        body: { padding: 0, background: '#0a0a0a' },
        mask: { backdropFilter: 'blur(8px)' },
      }}
    >
      <div ref={modalRef} style={{ background: '#0a0a0a', display: 'flex', flexDirection: 'column', height: isFullscreen ? '100vh' : 'auto' }}>
      {/* 顶部操作栏 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div onClick={onCancel}
          style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, cursor: 'pointer', userSelect: 'none' }}>
          取消
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>编辑视频</span>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)', margin: '0 4px' }} />
          <Tooltip title="适应窗口" placement="bottom">
            <div
              onClick={() => setViewMode('fit')}
              style={{
                padding: '3px 8px', borderRadius: 12, cursor: 'pointer',
                fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 3,
                background: viewMode === 'fit' ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: viewMode === 'fit' ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              <CompressOutlined style={{ fontSize: 12 }} />
              <span>适应</span>
            </div>
          </Tooltip>
          <Tooltip title="100% 原始尺寸" placement="bottom">
            <div
              onClick={() => setViewMode('100')}
              style={{
                padding: '3px 8px', borderRadius: 12, cursor: 'pointer',
                fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 3,
                background: viewMode === '100' ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: viewMode === '100' ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              <ExpandOutlined style={{ fontSize: 12 }} />
              <span>100%</span>
            </div>
          </Tooltip>
          <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', margin: '0 2px' }} />
          <Tooltip title={isFullscreen ? '退出全屏' : '全屏'} placement="bottom">
            <div
              onClick={toggleFullscreen}
              style={{
                padding: '3px 8px', borderRadius: 12, cursor: 'pointer',
                fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 3,
                background: isFullscreen ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: isFullscreen ? '#fff' : 'rgba(255,255,255,0.4)',
              }}
            >
              {isFullscreen ? <FullscreenExitOutlined style={{ fontSize: 13 }} /> : <FullscreenOutlined style={{ fontSize: 13 }} />}
            </div>
          </Tooltip>
        </div>
        <div onClick={exporting ? undefined : handleExport}
          style={{
            color: exporting ? 'rgba(255,255,255,0.3)' : '#FFD60A',
            fontSize: 14, fontWeight: 600,
            cursor: exporting ? 'not-allowed' : 'pointer', userSelect: 'none',
          }}>
          {exporting ? '导出中...' : '完成'}
        </div>
      </div>

      {/* 视频预览区 */}
      <div className="vid-scroll" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', position: 'relative',
        minHeight: 280,
        maxHeight: isFullscreen ? 'calc(100vh - 220px)' : 380,
        flex: isFullscreen ? 1 : 'none',
        overflow: viewMode === '100' ? 'scroll' : 'hidden',
      }}>
        <style>{`
          .vid-scroll { scrollbar-gutter: stable both-edges; }
          .vid-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
          .vid-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.06); }
          .vid-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.25); border-radius: 5px; border: 2px solid transparent; background-clip: content-box; }
          .vid-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.4); border: 2px solid transparent; background-clip: content-box; }
          .vid-scroll::-webkit-scrollbar-corner { background: rgba(255,255,255,0.03); }
        `}</style>
        <video
          ref={videoRef}
          src={videoUrl}
          disablePictureInPicture
          controlsList="noplaybackrate nodownload nofullscreen"
          style={{
            display: 'block',
            margin: 'auto',
            flexShrink: 0,
            ...(viewMode === 'fit'
              ? { maxWidth: '100%', maxHeight: isFullscreen ? 'calc(100vh - 220px)' : 380 }
              : { width: videoDims.w || 'auto', height: videoDims.h || 'auto' }
            ),
          }}
          preload="auto"
          playsInline
          muted
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleVideoEnded}
          onClick={togglePlay}
        />
      </div>

      {/* 底部控制区 */}
      <div style={{ padding: '16px 20px 20px', background: '#111' }}>

        {/* 时间信息 */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 10, padding: '0 2px',
        }}>
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: 'monospace' }}>
            {formatTime(trimStart * duration)}
          </span>
          <span style={{
            color: isTrimmed ? '#FFD60A' : 'rgba(255,255,255,0.5)',
            fontSize: 13, fontWeight: 500,
          }}>
            {formatTime(trimDuration)} / {formatTime(duration)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontFamily: 'monospace' }}>
              {formatTime(trimEnd * duration)}
            </span>
            <Tooltip title={isMuted ? '取消静音' : '静音'} placement="top">
              <div
                onClick={() => {
                  if (videoRef.current) {
                    const next = !isMuted;
                    videoRef.current.muted = next;
                    setIsMuted(next);
                  }
                }}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', transition: 'all 0.2s',
                  background: 'rgba(255,255,255,0.06)',
                  color: isMuted ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
                  fontSize: 14, position: 'relative',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              >
                <SoundOutlined />
                {isMuted && (
                  <div style={{
                    position: 'absolute', width: 18, height: 2,
                    background: 'rgba(255,255,255,0.3)', transform: 'rotate(-45deg)',
                    borderRadius: 1,
                  }} />
                )}
              </div>
            </Tooltip>
          </div>
        </div>

        {/* 时间轴 */}
        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          style={{
            position: 'relative', height: 56, borderRadius: 8,
            overflow: 'visible', cursor: 'pointer',
            userSelect: 'none', touchAction: 'none',
            background: 'rgba(255,255,255,0.03)',
            marginBottom: 14,
          }}
        >
          {/* 缩略图背景 */}
          <div style={{
            display: 'flex', height: '100%', width: '100%',
            position: 'absolute', left: 0, top: 0,
            borderRadius: 8, overflow: 'hidden',
          }}>
            {thumbnails.length > 0 ? thumbnails.map((thumb, i) => (
              <div key={i} style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
                {thumb ? (
                  <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.04)' }} />
                )}
              </div>
            )) : (
              <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.06)' }} />
            )}
          </div>

          {/* 暗化非选区 - 左 */}
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${trimStart * 100}%`,
            background: 'rgba(0,0,0,0.65)',
            borderRadius: '8px 0 0 8px',
            zIndex: 2, pointerEvents: 'none',
          }} />
          {/* 暗化非选区 - 右 */}
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: `${(1 - trimEnd) * 100}%`,
            background: 'rgba(0,0,0,0.65)',
            borderRadius: '0 8px 8px 0',
            zIndex: 2, pointerEvents: 'none',
          }} />

          {/* 选区上下边框 */}
          <div style={{
            position: 'absolute',
            left: `${trimStart * 100}%`, right: `${(1 - trimEnd) * 100}%`,
            top: 0, height: 3, background: '#FFD60A',
            zIndex: 3, pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            left: `${trimStart * 100}%`, right: `${(1 - trimEnd) * 100}%`,
            bottom: 0, height: 3, background: '#FFD60A',
            zIndex: 3, pointerEvents: 'none',
          }} />

          {/* 左手柄 */}
          <div
            onPointerDown={(e) => handleHandleDown('start', e)}
            style={{
              position: 'absolute',
              left: `calc(${trimStart * 100}% - ${HANDLE_W / 2}px)`,
              top: -1, bottom: -1, width: HANDLE_W,
              background: '#FFD60A', borderRadius: '6px 0 0 6px',
              cursor: 'ew-resize', zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div style={{ width: 3, height: 18, borderRadius: 2, background: 'rgba(0,0,0,0.35)' }} />
          </div>

          {/* 右手柄 */}
          <div
            onPointerDown={(e) => handleHandleDown('end', e)}
            style={{
              position: 'absolute',
              right: `calc(${(1 - trimEnd) * 100}% - ${HANDLE_W / 2}px)`,
              top: -1, bottom: -1, width: HANDLE_W,
              background: '#FFD60A', borderRadius: '0 6px 6px 0',
              cursor: 'ew-resize', zIndex: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div style={{ width: 3, height: 18, borderRadius: 2, background: 'rgba(0,0,0,0.35)' }} />
          </div>

          {/* 播放头 */}
          <div style={{
            position: 'absolute',
            left: `${playheadPos * 100}%`,
            top: -4, bottom: -4, width: 3, marginLeft: -1.5,
            background: '#fff', borderRadius: 2,
            zIndex: 6, boxShadow: '0 0 6px rgba(0,0,0,0.6)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* 底部按钮 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
          <div
            onClick={togglePlay}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 20px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)', fontSize: 13, transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          >
            {playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            <span>{playing ? '暂停' : '播放'}</span>
          </div>

          {isTrimmed && (
            <div
              onClick={resetTrim}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 20px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
                color: 'rgba(255,255,255,0.8)', fontSize: 13, transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            >
              <UndoOutlined />
              <span>重置</span>
            </div>
          )}
        </div>
      </div>
      </div>
    </Modal>
  );
};

export default VideoEditorModal;
