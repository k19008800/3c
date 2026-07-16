/**
 * VirtualTable — 虚拟滚动表格
 *
 * 使用 @tanstack/react-virtual 实现大数据列表流畅滚动。
 * 适用于调用日志（1K-10K+）、审计日志、用户列表等重型列表页。
 *
 * @example
 * <VirtualTable
 *   data={logs}
 *   columns={columns}
 *   rowHeight={48}
 *   overscan={5}
 *   renderRow={(item, index) => <LogRow log={item} />}
 * />
 */

import { useRef, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

interface Column {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
}

interface VirtualTableProps<T> {
  data: T[]
  columns: Column[]
  renderRow: (item: T, index: number) => React.ReactNode
  rowHeight?: number
  overscan?: number
  containerHeight?: number | string
  /** 空状态展示 */
  emptyState?: React.ReactNode
}

export default function VirtualTable<T extends { id: number | string }>({
  data,
  columns,
  renderRow,
  rowHeight = 48,
  overscan = 5,
  containerHeight = 600,
  emptyState,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  })

  if (data.length === 0) {
    return <>{emptyState || <div className="text-center py-12 text-slate-400">暂无数据</div>}</>
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        {/* Table Header */}
        <div className="bg-slate-50 border-b border-slate-200">
          <div className="flex" style={{ paddingLeft: 0 }}>
            {columns.map((col) => (
              <div
                key={col.key}
                className={`px-4 py-3 text-sm font-medium text-slate-500 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                style={{ width: col.width || 'auto', flex: col.width ? '0 0 auto' : 1, minWidth: col.width || 0 }}
              >
                {col.label}
              </div>
            ))}
          </div>
        </div>

        {/* Virtual Rows Container */}
        <div
          ref={parentRef}
          className="overflow-auto divide-y divide-slate-200"
          style={{ height: typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight }}
        >
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={data[virtualRow.index].id}
                className="hover:bg-slate-50 transition"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {renderRow(data[virtualRow.index], virtualRow.index)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
