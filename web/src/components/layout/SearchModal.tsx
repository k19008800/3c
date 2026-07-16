import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Loader2, Users, FileText, Building2, ScrollText, X } from 'lucide-react'
import { get } from '@/lib/api'

interface SearchResult {
  type: 'user' | 'order' | 'vendor' | 'log'
  id: number
  label: string
  sublabel: string
  url: string
}

export default function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    const combined: SearchResult[] = []

    try {
      // 搜索用户
      const userRes = await get<{ list: any[]; total: number }>('/api/v1/admin/users', {
        search: q,
        pageSize: 5,
      }).catch(() => null)
      if (userRes?.list) {
        for (const u of userRes.list) {
          combined.push({
            type: 'user',
            id: u.id,
            label: u.nickname || u.email || `用户 #${u.id}`,
            sublabel: u.email || `ID: ${u.id}`,
            url: '/console/admin/users',
          })
        }
      }
    } catch { /* ignore */ }

    try {
      // 搜索充值订单
      const orderRes = await get<{ list: any[]; total: number }>('/api/v1/admin/recharge-orders', {
        pageSize: 5,
      }).catch(() => null)
      if (orderRes?.list) {
        const matched = orderRes.list.filter(
          (o: any) =>
            o.orderNo?.toLowerCase().includes(q.toLowerCase()) ||
            o.userNickname?.toLowerCase().includes(q.toLowerCase()) ||
            o.userEmail?.toLowerCase().includes(q.toLowerCase())
        )
        for (const o of matched.slice(0, 5)) {
          combined.push({
            type: 'order',
            id: o.id,
            label: o.orderNo,
            sublabel: `¥${Number(o.amount || 0).toFixed(2)} - ${o.userNickname || o.userEmail || ''}`,
            url: '/console/admin/recharge-orders',
          })
        }
      }
    } catch { /* ignore */ }

    try {
      // 搜索供应商
      const vendorRes = await get<{ list: any[]; total: number }>('/api/v1/admin/vendors', {
        search: q,
        pageSize: 5,
      }).catch(() => null)
      if (vendorRes?.list) {
        for (const v of vendorRes.list) {
          combined.push({
            type: 'vendor',
            id: v.id,
            label: v.name || `供应商 #${v.id}`,
            sublabel: v.status || '',
            url: '/console/admin/vendors',
          })
        }
      }
    } catch { /* ignore */ }

    try {
      // 搜索操作日志
      const logRes = await get<{ list: any[]; total: number }>('/api/v1/admin/operation-logs', {
        search: q,
        pageSize: 3,
      }).catch(() => null)
      if (logRes?.list) {
        for (const l of logRes.list) {
          combined.push({
            type: 'log',
            id: l.id,
            label: l.description || l.action || `操作 #${l.id}`,
            sublabel: l.operatorName || l.ip || '',
            url: '/console/admin/operation-logs',
          })
        }
      }
    } catch { /* ignore */ }

    setResults(combined.slice(0, 20))
    setSelectedIndex(0)
    setLoading(false)
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleSelect = (r: SearchResult) => {
    onClose()
    navigate(r.url)
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case 'user': return <Users size={16} className="text-blue-500" />;
      case 'order': return <FileText size={16} className="text-green-500" />;
      case 'vendor': return <Building2 size={16} className="text-purple-500" />;
      case 'log': return <ScrollText size={16} className="text-amber-500" />;
      default: return <Search size={16} className="text-slate-400" />;
    }
  }

  const typeLabel = (type: string) => {
    switch (type) {
      case 'user': return '用户';
      case 'order': return '订单';
      case 'vendor': return '供应商';
      case 'log': return '日志';
      default: return type;
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Search size={20} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索用户 / 订单 / 供应商 / 日志..."
            className="flex-1 text-base outline-none placeholder-slate-400"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs text-slate-400 bg-slate-100 rounded border border-slate-200">
            ESC
          </kbd>
        </div>

        {/* 搜索结果 */}
        <div className="max-h-[400px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin" size={24} />
            </div>
          ) : query && results.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p>未找到 "{query}" 相关结果</p>
            </div>
          ) : !query ? (
            <div className="py-12 text-center text-slate-400">
              <Search size={32} className="mx-auto mb-2 opacity-50" />
              <p>输入关键词开始搜索</p>
              <p className="text-xs mt-1">支持搜索用户、订单号、供应商、操作日志</p>
            </div>
          ) : (
            <div className="py-2">
              {results.map((r, i) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => handleSelect(r)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                    i === selectedIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                    {typeIcon(r.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{r.label}</div>
                    <div className="text-xs text-slate-500 truncate">{r.sublabel}</div>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    {typeLabel(r.type)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 底部快捷键提示 */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center gap-4 text-xs text-slate-400">
          <span><kbd className="px-1 py-0.5 bg-white rounded border border-slate-200 text-slate-500">↑↓</kbd> 导航</span>
          <span><kbd className="px-1 py-0.5 bg-white rounded border border-slate-200 text-slate-500">↵</kbd> 打开</span>
          <span><kbd className="px-1 py-0.5 bg-white rounded border border-slate-200 text-slate-500">Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
