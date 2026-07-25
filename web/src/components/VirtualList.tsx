import React, { memo, useCallback, useRef } from 'react';

export interface VirtualListProps<T = any> {
  items?: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  height?: number;
  width?: number;
  itemCount?: number;
  emptyComponent?: React.ReactNode;
  loadingComponent?: React.ReactNode;
  loading?: boolean;
  className?: string;
  onScrollToBottom?: () => void;
}

/**
 * 简化虚拟滚动列表组件（无外部依赖）
 */
const VirtualList = memo(function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  height = 600,
  width,
  emptyComponent,
  loadingComponent,
  loading = false,
  className = '',
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 空状态
  if (loading && loadingComponent) {
    return <>{loadingComponent}</>;
  }

  if (!items || items.length === 0) {
    if (emptyComponent) {
      return <>{emptyComponent}</>;
    }
    return <div className={className}>暂无数据</div>;
  }

  // 简单渲染（非虚拟滚动）
  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height,
        width,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {items.map((item, index) => (
        <div key={index} style={{ height: rowHeight }}>
          {renderRow(item, index)}
        </div>
      ))}
    </div>
  );
});

export default VirtualList;