import React, { memo, useCallback, useMemo } from 'react';
import VirtualList from './VirtualList';

// 简化类型定义，避免泛型冲突
export interface Column {
  key: string;
  label: React.ReactNode;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  render?: (item: any, index: number) => React.ReactNode;
  fixed?: boolean;
  minWidth?: number;
  maxWidth?: number;
}

export interface VirtualTableProps {
  data: any[];
  columns: Column[];
  rowHeight: number;
  height?: number;
  onRowClick?: (item: any, index: number) => void;
  rowRenderer?: (item: any, index: number, children: React.ReactNode) => React.ReactNode;
  className?: string;
  headerClassName?: string;
  rowClassName?: string;
  cellClassName?: string;
}

function VirtualTable({
  data,
  columns,
  rowHeight,
  height = 600,
  onRowClick,
  rowRenderer,
  className = '',
  headerClassName = '',
  rowClassName = '',
  cellClassName = '',
}: VirtualTableProps) {
  const renderHeader = useMemo(() => {
    return (
      <div className={`flex items-center bg-slate-50 border-b border-slate-200 ${headerClassName}`}>
        {columns.map((col) => (
          <div
            key={col.key}
            className={`px-4 py-3 font-medium text-slate-600 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
            style={{ width: col.width || 'auto', minWidth: col.minWidth, maxWidth: col.maxWidth }}
          >
            {col.label}
          </div>
        ))}
      </div>
    );
  }, [columns, headerClassName]);

  const renderRow = useCallback((item: any, index: number) => {
    const rowContent = (
      <div
        className={`flex items-center border-b border-slate-100 hover:bg-slate-50 ${rowClassName}`}
        onClick={() => onRowClick?.(item, index)}
      >
        {columns.map((col) => (
          <div
            key={col.key}
            className={`px-4 py-3 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'} ${cellClassName}`}
            style={{ width: col.width || 'auto', minWidth: col.minWidth, maxWidth: col.maxWidth }}
          >
            {col.render ? col.render(item, index) : item[col.key]}
          </div>
        ))}
      </div>
    );

    return rowRenderer ? rowRenderer(item, index, rowContent) : rowContent;
  }, [columns, onRowClick, rowRenderer, rowClassName, cellClassName]);

  return (
    <div className={className}>
      {renderHeader}
      <VirtualList
        items={data}
        rowHeight={rowHeight}
        height={height}
        renderRow={renderRow}
      />
    </div>
  );
}

export default memo(VirtualTable);