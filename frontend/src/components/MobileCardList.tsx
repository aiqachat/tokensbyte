/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React from 'react';
import { Card, Spin, Pagination, Empty, Space, Button, Tag, Typography } from 'antd';
import { useThemeStore } from '../store/theme';

const { Text } = Typography;

interface MobileCardListProps<T> {
  dataSource: T[];
  loading?: boolean;
  renderCard: (item: T, index: number) => React.ReactNode;
  rowKey: string | ((item: T) => string | number);
  pagination?: false | {
    pageSize?: number;
    total?: number;
    current?: number;
    onChange?: (page: number, pageSize: number) => void;
    showSizeChanger?: boolean;
    pageSizeOptions?: string[];
    showTotal?: (total: number) => string;
  };
  compact?: boolean;
  gap?: number;
}

function MobileCardList<T extends Record<string, any>>({ 
  dataSource, 
  loading, 
  renderCard, 
  rowKey,
  pagination,
  compact,
  gap
}: MobileCardListProps<T>) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(
    pagination && typeof pagination === 'object' && pagination.pageSize || 10
  );

  const getKey = (item: T, index: number): string | number => {
    if (typeof rowKey === 'function') return rowKey(item);
    return item[rowKey] ?? index;
  };

  // Client-side pagination if no external onChange
  const isClientPagination = pagination !== false && !(pagination && pagination.onChange);
  const displayData = isClientPagination 
    ? dataSource.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : dataSource;

  const handlePageChange = (page: number, size: number) => {
    setCurrentPage(page);
    setPageSize(size);
    if (pagination && typeof pagination === 'object' && pagination.onChange) {
      pagination.onChange(page, size);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!dataSource || dataSource.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />;
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: gap !== undefined ? gap : (compact ? 4 : 6) }}>
        {displayData.map((item, index) => (
          <div key={getKey(item, index)}>
            {renderCard(item, index)}
          </div>
        ))}
      </div>
      {pagination !== false && dataSource.length > pageSize && (
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Pagination
            size="small"
            current={currentPage}
            pageSize={pageSize}
            total={pagination && pagination.total ? pagination.total : dataSource.length}
            onChange={handlePageChange}
            showSizeChanger={pagination && pagination.showSizeChanger}
            pageSizeOptions={pagination && pagination.pageSizeOptions}
            showTotal={pagination && pagination.showTotal}
          />
        </div>
      )}
    </div>
  );
}

// ---- Reusable building blocks for card content ----

export const CardRow: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties; compact?: boolean }> = ({ label, children, style, compact }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: compact ? '1px 0' : '2px 0', ...style }}>
    <Text type="secondary" style={{ fontSize: compact ? 11 : 13, flexShrink: 0, marginRight: 8 }}>{label}</Text>
    <div style={{ textAlign: 'right', fontSize: compact ? 11 : 13 }}>{children}</div>
  </div>
);

export const CardActions: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  return (
    <div style={{ 
      borderTop: isLight ? '1px solid #e8e8e8' : '1px solid #303030', 
      marginTop: 8, 
      paddingTop: 8, 
      display: 'flex', 
      justifyContent: 'flex-end', 
      gap: 8 
    }}>
      {children}
    </div>
  );
};

export const MobileCard: React.FC<{ 
  title: React.ReactNode; 
  extra?: React.ReactNode; 
  children: React.ReactNode;
  compact?: boolean;
  style?: React.CSSProperties;
}> = ({ title, extra, children, compact, style }) => {
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  return (
    <div style={{
      background: isLight ? '#fff' : '#1d1d1d',
      border: isLight ? '1px solid #e8e8e8' : '1px solid #303030',
      borderRadius: compact ? 8 : 12,
      padding: compact ? '5px 8px' : '10px 12px',
      ...style
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: compact ? 4 : 6, gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: compact ? 13 : 14, flex: 1, minWidth: 0 }}>{title}</div>
        {extra && <div style={{ flexShrink: 0 }}>{extra}</div>}
      </div>
      {children}
    </div>
  );
};

export default MobileCardList;
