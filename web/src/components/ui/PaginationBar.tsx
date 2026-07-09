import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationBarProps {
  page: number
  onPageChange: (page: number) => void
  pageSize: number
  onPageSizeChange: (pageSize: number) => void
  total: number
  totalPages: number
  /** 可选：每页选项，默认 [20, 50, 100] */
  pageSizeOptions?: number[]
}

export default function PaginationBar({
  page,
  onPageChange,
  pageSize,
  onPageSizeChange,
  total,
  totalPages,
  pageSizeOptions = [20, 50, 100],
}: PaginationBarProps) {
  const [jumpInput, setJumpInput] = useState(String(page))
  const jumpRef = useRef<HTMLInputElement>(null)

  // sync when page changes externally
  useEffect(() => {
    setJumpInput(String(page))
  }, [page])

  const handleJump = () => {
    const val = parseInt(jumpInput, 10)
    if (val >= 1 && val <= totalPages) {
      onPageChange(val)
    } else {
      // reset to current page if invalid
      setJumpInput(String(page))
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50">
      {/* Left: page size + info */}
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-1">
          <span>每页</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value))
              onPageChange(1)
            }}
            className="px-2 py-1 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <span>条</span>
        </div>
        <span>
          第 {totalPages > 0 ? page : 0} / {totalPages} 页，共 {total} 条
        </span>
      </div>

      {/* Right: jump + prev/next */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-sm">
          <span>跳至</span>
          <input
            ref={jumpRef}
            type="number"
            min={1}
            max={totalPages || 1}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleJump()
              }
            }}
            onBlur={handleJump}
            className="w-14 px-2 py-1 border border-slate-300 rounded text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span>页</span>
        </div>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
