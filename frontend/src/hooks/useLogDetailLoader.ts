/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import { useCallback, useEffect, useRef, useState, type Key } from 'react';
import request from '../utils/request';

export type LogDetailFields = {
  request_content?: string | null;
  response_content?: string | null;
  post_response?: string | null;
  upstream_req_content?: string | null;
  billing_detail?: string | null;
};

/** 列表展开详情：缓存/去重；刷新清空后对仍展开行自动重拉 detail。 */
export function useLogDetailLoader(rowIds: number[]) {
  const [detailCache, setDetailCache] = useState<Record<number, LogDetailFields>>({});
  const [detailLoadingIds, setDetailLoadingIds] = useState<Record<number, boolean>>({});
  const [expandedRowKeys, setExpandedRowKeys] = useState<Key[]>([]);

  const cacheRef = useRef(detailCache);
  cacheRef.current = detailCache;
  const inflightRef = useRef(new Set<number>());
  const generationRef = useRef(0);

  const loadLogDetail = useCallback(async (id: number): Promise<LogDetailFields | null> => {
    if (cacheRef.current[id]) return cacheRef.current[id];
    if (inflightRef.current.has(id)) return null;
    const generation = generationRef.current;
    inflightRef.current.add(id);
    setDetailLoadingIds((prev) => ({ ...prev, [id]: true }));
    try {
      const detail = (await request.get(`/logs/${id}/detail`)) as LogDetailFields;
      if (generation !== generationRef.current) return null;
      const mapped: LogDetailFields = {
        request_content: detail.request_content ?? null,
        response_content: detail.response_content ?? null,
        post_response: detail.post_response ?? null,
        upstream_req_content: detail.upstream_req_content ?? null,
        billing_detail: detail.billing_detail ?? null,
      };
      cacheRef.current = { ...cacheRef.current, [id]: mapped };
      setDetailCache((prev) => ({ ...prev, [id]: mapped }));
      return mapped;
    } catch (e) {
      console.error(e);
      return null;
    } finally {
      inflightRef.current.delete(id);
      if (generation === generationRef.current) {
        setDetailLoadingIds((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    }
  }, []);

  const resetDetailCache = useCallback(() => {
    generationRef.current += 1;
    cacheRef.current = {};
    inflightRef.current.clear();
    setDetailCache({});
    setDetailLoadingIds({});
  }, []);

  const handleExpand = useCallback(
    (expanded: boolean, record: { id: number }) => {
      setExpandedRowKeys((keys) =>
        expanded
          ? Array.from(new Set([...keys, record.id]))
          : keys.filter((k) => Number(k) !== record.id),
      );
      if (expanded) void loadLogDetail(record.id);
    },
    [loadLogDetail],
  );

  useEffect(() => {
    const idSet = new Set(rowIds);
    setExpandedRowKeys((prev) => {
      const next = prev.filter((k) => idSet.has(Number(k)));
      return next.length === prev.length ? prev : next;
    });
  }, [rowIds]);

  useEffect(() => {
    const idSet = new Set(rowIds);
    for (const key of expandedRowKeys) {
      const id = Number(key);
      if (!idSet.has(id)) continue;
      if (cacheRef.current[id] || inflightRef.current.has(id)) continue;
      void loadLogDetail(id);
    }
  }, [expandedRowKeys, rowIds, loadLogDetail]);

  return {
    detailCache,
    detailLoadingIds,
    expandedRowKeys,
    loadLogDetail,
    handleExpand,
    resetDetailCache,
  };
}
