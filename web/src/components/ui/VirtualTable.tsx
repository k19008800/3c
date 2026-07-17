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
 *   tableId="call-logs"
 * />
 */

import { useRef, useCallback, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

interface Column {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  /** 是否允许拖拽调整列宽 */
  resizable?: boolean
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
  /** 列宽持久化唯一标识，传入后列宽变化自动保存到 localStorage */
  tableId?: string
}

const STORAGE_KEY_PREFIX = 'virtual-table-col-widths-'

export default function VirtualTable<T extends { id: number | string }>({
  data,
  columns,
  renderRow,
  rowHeight = 48,
  overscan = 5,
  containerHeight = 600,
  emptyState,
  tableId,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight ?? 40,
    overscan: 10,
  })

  // 列宽状态（仅存储被拖拽调整过的列）
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    if (!tableId) return {}
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tableId}`)
      if (saved) return JSON.parse(saved)
    } catch {
      /* ignore */
    }
    return {}
  })

  // 拖拽状态（ref 避免闭包陈旧问题）
  const dragRef = useRef<{
    colKey: string
    startX: number
    startWidth: number
  } | null>(null)

  // 拖拽清理函数（用于组件卸载时取消事件绑定）
  const dragCleanupRef = useRef<(() => void) | null>(null)

  // 持久化列宽到 localStorage
  const persistWidths = useCallback(
    (widths: Record<string, number>) => {
      if (!tableId) return
      try {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${tableId}`, JSON.stringify(widths))
      } catch {
        /* ignore */
      }
    },
    [tableId],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, colKey: string) => {
      e.preventDefault()
      e.stopPropagation()

      // 获取当前列的 DOM 实际渲染宽度
      const colEl = (e.currentTarget as HTMLElement).closest('[data-col-key]') as HTMLElement | null
      if (!colEl) return
      const rect = colEl.getBoundingClientRect()
      const currentWidth = rect.width

      dragRef.current = { colKey, startX: e.clientX, startWidth: currentWidth }

      // 拖拽期间禁用文本选中 & 设置全局光标
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (ev: MouseEvent) => {
        const drag = dragRef.current
        if (!drag) return

        const delta = ev.clientX - drag.startX
        const newWidth = Math.max(60, drag.startWidth + delta)

        setColWidths((prev) => ({ ...prev, [drag.colKey]: newWidth }))
      }

      const handleMouseUp = () => {
        // 保存最终列宽
        setColWidths((prev) => {
          persistWidths(prev)
          return prev
        })

        finishDrag()
      }

      const finishDrag = () => {
        dragRef.current = null
        dragCleanupRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      dragCleanupRef.current = finishDrag

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [persistWidths],
  )

  // 组件卸载时清理拖拽事件
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.()
    }
  }, [])

  if (data.length === 0) {
    return <>{emptyState || <div className="text-center py-12 text-slate-400">暂无数据</div>}</>
  }

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        {/* Table Header */}
        <div className="bg-slate-50 border-b border-slate-200">
          <div ref={headerRef} className="flex" style={{ paddingLeft: 0 }}>
            {columns.map((col) => {
              const storedWidth = colWidths[col.key]
              const isResizable = col.resizable === true

              // 有存储宽度 → 固定像素；有 col.width → 使用原值；否则自动撑开
              const hasExplicitWidth = Boolean(storedWidth || col.width)
              const widthValue = storedWidth ? `${storedWidth}px` : col.width

              return (
                <div
                  key={col.key}
                  data-col-key={col.key}
                  className={`relative px-4 py-3 text-sm font-medium text-slate-500 select-none ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  }`}
                  style={{
                    width: widthValue || 'auto',
                    flex: hasExplicitWidth ? '0 0 auto' : 1,
                    minWidth: storedWidth
                      ? `${Math.max(60, storedWidth)}px`
                      : isResizable && !col.width
                        ? '60px'
                        : col.width || 0,
                  }}
                >
                  {col.label}
                  {isResizable && (
                    <div
                      className="absolute top-0 right-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center"
                      onMouseDown={(e) => handleMouseDown(e, col.key)}
                    >
                      <div className="h-4 w-px bg-slate-300 transition-colors hover:bg-slate-500" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Virtual Rows Container */}
        <div
          ref={parentRef}
          className="overflow-auto divide-y divide-slate-200"
          style={{
            height: typeof containerHeight === 'number' ? `${containerHeight}px` : containerHeight,
          }}
        >
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
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
