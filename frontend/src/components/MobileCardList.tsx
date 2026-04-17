import React from 'react';
import { Card, Spin, Pagination, Empty, Space, Button, Tag, Typography } from 'antd';

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
}

function MobileCardList<T extends Record<string, any>>({ 
  dataSource, 
  loading, 
  renderCard, 
  rowKey,
  pagination 
}: MobileCardListProps<T>) {
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(
    (pagination && pagination !== false && pagination.pageSize) || 10
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
    if (pagination && pagination !== false && pagination.onChange) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

export const CardRow: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', ...style }}>
    <Text type="secondary" style={{ fontSize: 13, flexShrink: 0, marginRight: 8 }}>{label}</Text>
    <div style={{ textAlign: 'right', fontSize: 13 }}>{children}</div>
  </div>
);

export const CardActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ 
    borderTop: '1px solid #303030', 
    marginTop: 8, 
    paddingTop: 8, 
    display: 'flex', 
    justifyContent: 'flex-end', 
    gap: 8 
  }}>
    {children}
  </div>
);

export const MobileCard: React.FC<{ 
  title: React.ReactNode; 
  extra?: React.ReactNode; 
  children: React.ReactNode 
}> = ({ title, extra, children }) => (
  <div style={{
    background: '#1d1d1d',
    border: '1px solid #303030',
    borderRadius: 12,
    padding: '14px 16px',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
      {extra && <div>{extra}</div>}
    </div>
    {children}
  </div>
);

export default MobileCardList;
