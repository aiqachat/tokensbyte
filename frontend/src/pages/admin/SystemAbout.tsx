import React, { useEffect, useState } from 'react';
import { Spin, message } from 'antd';
import { GitCommit, User, Calendar, Tag as TagIcon, ChevronDown, ChevronUp, MonitorPlay } from 'lucide-react';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';

interface Commit {
  index: number;
  is_current: boolean;
  version: string;
  hash: string;
  short_hash: string;
  author: string;
  date: string;
  message: string;
}

const SystemAbout: React.FC = () => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const [loading, setLoading] = useState(true);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [current, setCurrent] = useState<Commit | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await request.get('/system/about') as any;
        if (res?.success) {
          setCommits(res.commits || []);
          setCurrent(res.current || null);
        } else {
          message.error('获取系统信息失败');
        }
      } catch (e: any) {
        message.error(e.message || '获取系统信息失败');
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {current && (
        <div className={`rounded-xl border shadow-sm p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between transition-colors ${
          isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'
        }`}>
          <div className="flex items-center gap-5">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center shrink-0 ${
              isLight ? 'bg-zinc-100 text-zinc-900' : 'bg-zinc-800 text-zinc-100'
            }`}>
              <MonitorPlay className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className={`text-lg font-semibold m-0 ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
                  系统当前版本
                </h2>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                  isLight ? 'bg-zinc-900 text-zinc-50' : 'bg-zinc-100 text-zinc-900'
                }`}>
                  LATEST
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                  isLight ? 'text-zinc-600' : 'text-zinc-300'
                }`}>
                  <TagIcon className="w-3.5 h-3.5" />
                  {current.version}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                  isLight ? 'bg-zinc-100 text-zinc-600' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {current.short_hash}
                </span>
              </div>
            </div>
          </div>
          <div className="text-left md:text-right w-full md:w-auto">
            <div className={`text-sm font-medium mb-2 ${isLight ? 'text-zinc-800' : 'text-zinc-200'}`}>
              {current.message}
            </div>
            <div className={`flex items-center md:justify-end gap-4 text-xs ${
              isLight ? 'text-zinc-500' : 'text-zinc-400'
            }`}>
              <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {current.author}</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {current.date}</span>
            </div>
          </div>
        </div>
      )}

      <div className={`rounded-xl border shadow-sm overflow-hidden transition-colors ${
        isLight ? 'bg-white border-zinc-200' : 'bg-zinc-900 border-zinc-800'
      }`}>
        <div className={`px-6 py-4 border-b flex items-center gap-2 ${
          isLight ? 'border-zinc-100' : 'border-zinc-800'
        }`}>
          <GitCommit className={`w-5 h-5 ${isLight ? 'text-zinc-500' : 'text-zinc-400'}`} />
          <h3 className={`font-semibold m-0 ${isLight ? 'text-zinc-900' : 'text-zinc-100'}`}>
            更新记录
          </h3>
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
            isLight ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-800 text-zinc-400'
          }`}>
            最近 10 次提交
          </span>
        </div>

        <div className="p-6">
          <div className="relative border-l-2 ml-3 border-zinc-200 dark:border-zinc-800 space-y-8">
            {(expanded ? commits : commits.slice(0, 3)).map((c, idx) => (
              <div key={c.hash} className="relative pl-6">
                {/* Timeline dot */}
                <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-4 ${
                  isLight ? 'border-white' : 'border-zinc-900'
                } ${
                  c.is_current 
                    ? 'bg-zinc-900 dark:bg-zinc-100' 
                    : (isLight ? 'bg-zinc-300' : 'bg-zinc-700')
                }`} />

                <div className={`p-4 rounded-lg border transition-colors ${
                  c.is_current
                    ? (isLight ? 'bg-zinc-50 border-zinc-200' : 'bg-zinc-800/50 border-zinc-700')
                    : (isLight ? 'bg-white border-zinc-100' : 'bg-zinc-900 border-zinc-800/50')
                }`}>
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1 text-sm font-semibold ${
                      c.is_current ? (isLight ? 'text-zinc-900' : 'text-zinc-100') : (isLight ? 'text-zinc-700' : 'text-zinc-300')
                    }`}>
                      <TagIcon className="w-3.5 h-3.5" />
                      {c.version}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-mono ${
                      isLight ? 'bg-zinc-100 text-zinc-500' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {c.short_hash}
                    </span>
                    {c.is_current && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        isLight ? 'bg-zinc-900 text-zinc-50' : 'bg-zinc-100 text-zinc-900'
                      }`}>
                        当前版本
                      </span>
                    )}
                  </div>
                  
                  <p className={`text-sm mb-3 ${
                    c.is_current 
                      ? (isLight ? 'text-zinc-800 font-medium' : 'text-zinc-200 font-medium')
                      : (isLight ? 'text-zinc-600' : 'text-zinc-400')
                  }`}>
                    {c.message || '(无提交说明)'}
                  </p>

                  <div className={`flex flex-wrap items-center gap-4 text-xs ${
                    isLight ? 'text-zinc-500' : 'text-zinc-400'
                  }`}>
                    <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {c.author}</span>
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {c.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {commits.length > 3 && (
            <div className="mt-8 text-center">
              <button
                onClick={() => setExpanded(!expanded)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isLight 
                    ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200' 
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {expanded ? (
                  <>收起历史记录 <ChevronUp className="w-4 h-4" /></>
                ) : (
                  <>展开更多记录 ({commits.length - 3}) <ChevronDown className="w-4 h-4" /></>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemAbout;
