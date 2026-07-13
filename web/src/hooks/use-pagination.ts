import { useState, useMemo, useCallback } from 'react'

/**
 * 通用分页 Hook
 *
 * 消除 45+ 个页面中重复的 page/pageSize/totalPages 状态管理。
 *
 * @example
 * const pagination = usePagination(20)
 * // pagination = { page, setPage, pageSize, setPageSize, totalPages, paginationProps }
 * // <PaginationBar {...pagination.paginationProps} total={total} totalPages={totalPages} />
 */
export function usePagination(defaultPageSize = 20) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultPageSize)
  const [total, setTotal] = useState(0)

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  )

  const resetPage = useCallback(() => setPage(1), [])

  /** 可直接展开到 PaginationBar 的 props */
  const paginationProps = useMemo(
    () => ({
      page,
      onPageChange: setPage,
      pageSize,
      onPageSizeChange: (size: number) => {
        setPageSize(size)
        setPage(1)
      },
      total,
      totalPages,
    }),
    [page, pageSize, total, totalPages],
  )

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    setTotal,
    totalPages,
    resetPage,
    paginationProps,
  }
}
