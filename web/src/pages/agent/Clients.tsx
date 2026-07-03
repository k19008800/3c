import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { AgentClient, ReferralLink, PaginatedData } from '@/types'
import {
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Link2,
  Copy,
  CheckCheck,
} from 'lucide-react'

export default function AgentClients() {
  const [clients, setClients] = useState<AgentClient[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [referralLink, setReferralLink] = useState<ReferralLink | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const totalPages = Math.ceil(total / pageSize)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<PaginatedData<AgentClient>>('/api/v1/agent/clients', {
        page,
        pageSize,
      })
      setClients(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取客户列表失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize])

  const fetchReferralLink = async () => {
    if (referralLink) {
      copyToClipboard(referralLink.referralLink)
      return
    }
    setLinkLoading(true)
    try {
      const data = await get<ReferralLink>('/api/v1/agent/referral-link')
      setReferralLink(data)
      copyToClipboard(data.referralLink)
    } catch (err: any) {
      setError(err.message || '获取推荐链接失败')
    } finally {
      setLinkLoading(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      pending: 'bg-orange-100 text-orange-700',
      disabled: 'bg-red-100 text-red-700',
    }
    const labelMap: Record<string, string> = {
      active: '正常',
      pending: '未验证',
      disabled: '已禁用',
    }
    return (
      <span
        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
          map[status] || 'bg-slate-100 text-slate-500'
        }`}
      >
        {labelMap[status] || status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">我的客户</h1>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Referral Link Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-blue-600" />
            <span className="text-sm font-semibold text-slate-700">邀请推广链接</span>
          </div>
          <button
            onClick={fetchReferralLink}
            disabled={linkLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {linkLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : copied ? (
              <CheckCheck size={14} />
            ) : (
              <Copy size={14} />
            )}
            {copied ? '已复制' : referralLink ? '复制链接' : '生成链接'}
          </button>
        </div>
        {referralLink && (
          <p className="mt-2 text-xs text-slate-400">
            将此链接分享给客户，客户注册后自动绑定到您名下（不在页面显示任何推荐信息）
          </p>
        )}
      </div>

      {/* Client Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span className="text-sm font-medium text-slate-700">
            客户列表（{total}）
          </span>
          <button
            onClick={() => fetchClients()}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">余额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">累计消费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">贡献佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">绑定时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    暂无绑定客户。使用推广链接邀请客户注册，或联系管理员手动绑定。
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.clientUserId} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-900">{c.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.nickname || '-'}</td>
                    <td className="px-4 py-3">{statusBadge(c.status)}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      ¥{Number(c.balance || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      ¥{Number(c.totalCallCost || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-green-600">
                      ¥{Number(c.totalCommission || 0).toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {c.boundAt
                        ? new Date(c.boundAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── 增强分页 ── */}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <div className="flex items-center gap-1">
                <span>每页</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-2 py-1 border border-slate-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>条</span>
              </div>
              <span>第 {page} / {totalPages} 页，共 {total} 条</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-sm">
                <span>跳至</span>
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  defaultValue={page}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      if (val >= 1 && val <= totalPages) setPage(val);
                    }
                  }}
                  className="w-14 px-2 py-1 border border-slate-300 rounded text-sm text-center bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span>页</span>
              </div>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
