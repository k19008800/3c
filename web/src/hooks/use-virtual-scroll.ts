import { useState, useEffect, useRef, useCallback, useMemo } from 'react'

interface VirtualScrollOptions {
  itemCount: number
  itemHeight: number
  containerHeight: number
  overscan?: number
}

interface VirtualScrollResult {
  virtualItems: Array<{
    index: number
    start: number
  }>
  totalHeight: number
  containerProps: {
    style: React.CSSProperties
    onScroll: (e: React.UIEvent<HTMLDivElement>) => void
    ref: React.RefObject<HTMLDivElement | null>
  }
}

/**
 * 虚拟滚动 Hook
 * 
 * 只渲染可见区域的元素，大幅提升大列表性能
 * 
 * @example
 * const { virtualItems, totalHeight, containerProps } = useVirtualScroll({
 *   itemCount: 10000,
 *   itemHeight: 40,
 *   containerHeight: 600,
 *   overscan: 5
 * })
 * 
 * <div {...containerProps}>
 *   <div style={{ height: totalHeight }}>
 *     {virtualItems.map(({ index, start }) => (
 *       <div key={index} style={{ position: 'absolute', top: start, height: 40 }}>
 *         <Item data={items[index]} />
 *       </div>
 *     ))}
 *   </div>
 * </div>
 */
export function useVirtualScroll({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 3,
}: VirtualScrollOptions): VirtualScrollResult {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  // 计算可见范围
  const { startIndex, endIndex, virtualItems } = useMemo(() => {
    const start = Math.floor(scrollTop / itemHeight)
    const visibleCount = Math.ceil(containerHeight / itemHeight)
    const end = Math.min(start + visibleCount + overscan * 2, itemCount)
    const adjustedStart = Math.max(0, start - overscan)

    const items = []
    for (let i = adjustedStart; i < end; i++) {
      items.push({
        index: i,
        start: i * itemHeight,
      })
    }

    return {
      startIndex: adjustedStart,
      endIndex: end,
      virtualItems: items,
    }
  }, [scrollTop, itemHeight, containerHeight, itemCount, overscan])

  const totalHeight = itemCount * itemHeight

  return {
    virtualItems,
    totalHeight,
    containerProps: {
      style: {
        overflowY: 'auto',
        height: containerHeight,
        position: 'relative' as const,
      },
      onScroll: handleScroll,
      ref: containerRef,
    },
  }
}

/**
 * 无限滚动 Hook
 * 
 * 滚动到底部时自动加载更多
 * 
 * @example
 * const { items, loading, hasMore, loadMore } = useInfiniteScroll({
 *   fetcher: (page) => fetch(`/api/items?page=${page}`),
 *   pageSize: 20
 * })
 */
export function useInfiniteScroll<T>({
  fetcher,
  pageSize = 20,
  threshold = 100,
}: {
  fetcher: (page: number, pageSize: number) => Promise<{ items: T[]; hasMore: boolean }>
  pageSize?: number
  threshold?: number
}) {
  const [items, setItems] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const loadingRef = useRef(false)

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return

    loadingRef.current = true
    setLoading(true)

    try {
      const result = await fetcher(page, pageSize)
      setItems(prev => [...prev, ...result.items])
      setHasMore(result.hasMore)
      setPage(prev => prev + 1)
    } catch (error) {
      console.error('Failed to load more:', error)
    } finally {
      setLoading(false)
      loadingRef.current = false
    }
  }, [fetcher, page, pageSize, hasMore])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight

    if (scrollBottom < threshold && !loadingRef.current && hasMore) {
      loadMore()
    }
  }, [loadMore, threshold, hasMore])

  // 初始加载
  useEffect(() => {
    loadMore()
  }, [])

  const reset = useCallback(() => {
    setItems([])
    setPage(1)
    setHasMore(true)
    loadingRef.current = false
  }, [])

  return {
    items,
    loading,
    hasMore,
    loadMore,
    handleScroll,
    reset,
  }
}
