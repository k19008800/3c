import { useEffect, useState, useCallback } from 'react'
import { get, del, downloadUrl } from '@/lib/api'
import type { AgentClient, ReferralLink, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Link2,
  Copy,
  CheckCheck,
  Unlink,
  ChevronDown,
  ChevronRight,
  Download,
  Calendar,
} from 'lucide-react'

// ── Order Types (inline, not in shared types) ──

interface ClientOrder {
  id: number
  orderNo: string
  modelName: string | null
  totalTokens: number
  cost: string
  status: string
  createdAt: string
}

// ── Component ──

// ── 客户管理（代理商）─-
//
// 【业务说明】
//   代理商管理名下客户列表，支持分页浏览。
//   点击客户行可展开该客户的近期 API 调用订单，支持按日期筛选和 CSV 导出。
//   生成/复制专属推荐链接，新用户通过链接注册自动绑定为代理商名下客户。
//   支持解绑客户（消费数据保留）。
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/clients, GET /api/v1/agent/clients/:id/orders, POST /api/v1/agent/referral-link
// 【操作】DELETE /api/v1/agent/clients/:id（解绑）, GET /api/v1/agent/clients/:id/export（导出CSV）

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

  // ── Expanded order state ──
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null)
  const [orderList, setOrderList] = useState<ClientOrder[]>([])
  const [orderTotal, setOrderTotal] = useState(0)
  const [orderPage, setOrderPage] = useState(1)
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderDateStart, setOrderDateStart] = useState('')
  const [orderDateEnd, setOrderDateEnd] = useState('')
  const orderPageSize = 10

  const totalPages = Math.ceil(total / pageSize)
  const orderTotalPages = Math.ceil(orderTotal / orderPageSize)

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

  const fetchOrders = useCallback(async (customerUserId: number, p: number) => {
    setOrderLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(orderPageSize) })
      if (orderDateStart) params.set('startDate', orderDateStart)
      if (orderDateEnd) params.set('endDate', orderDateEnd)
      const res = await get<any>(`/api/v1/agent/clients/${customerUserId}/orders?${params.toString()}`)
      setOrderList(res?.list ?? [])
      setOrderTotal(res?.total ?? 0)
    } catch (e: any) {
      console.error('Failed to load orders', e)
      setOrderList([])
      setOrderTotal(0)
    } finally {
      setOrderLoading(false)
    }
  }, [orderDateStart, orderDateEnd])

  const handleExpand = (customerUserId: number) => {
    if (expandedCustomerId === customerUserId) {
      setExpandedCustomerId(null)
      setOrderList([])
      setOrderTotal(0)
      setOrderPage(1)
    } else {
      setExpandedCustomerId(customerUserId)
      setOrderPage(1)
      fetchOrders(customerUserId, 1)
    }
  }

  const handleUnbind = async (clientUserId: number, email: string) => {
    if (!confirm(`确认解绑客户「${email}」？\n解绑后该客户的消费数据仍保留。`)) return
    try {
      await del(`/api/v1/agent/clients/${clientUserId}`)
      fetchClients()
      setExpandedCustomerId(null)
    } catch (e: any) {
      alert(e.message || '解绑失败')
    }
  }

  const handleExport = (clientUserId: number, email: string) => {
    try {
      const safeName = email.replace(/[@.]/g, '_')
      downloadUrl(`/api/v1/agent/clients/${clientUserId}/export`, `客户_${safeName}_记录.csv`)
    } catch (e: any) {
      alert(e.message || '导出失败')
    }
  }

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

  useEffect(() => {
    if (expandedCustomerId !== null) {
      fetchOrders(expandedCustomerId, orderPage)
    }
  }, [orderPage])

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
                <th className="px-4 py-3 text-sm font-medium text-slate-500 w-8"></th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">余额</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">累计消费</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">贡献佣金</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">绑定时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    暂无绑定客户。使用推广链接邀请客户注册，或联系管理员手动绑定。
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.clientUserId} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleExpand(c.clientUserId)}
                        className="text-slate-400 hover:text-slate-700 transition"
                        title="查看订单"
                      >
                        {expandedCustomerId === c.clientUserId ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    </td>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExport(c.clientUserId, c.email)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                          title="导出 CSV"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={() => handleUnbind(c.clientUserId, c.email)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                          title="解绑客户"
                        >
                          <Unlink size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}

              {/* Expanded order rows */}
              {expandedCustomerId !== null && (
                <tr>
                  <td colSpan={9} className="px-4 py-3 bg-slate-50">
                    <div className="space-y-3">
                      {/* Date filters */}
                      <div className="flex items-center gap-3">
                        <Calendar size={14} className="text-slate-500" />
                        <input
                          type="date"
                          value={orderDateStart}
                          onChange={(e) => {
                            setOrderDateStart(e.target.value)
                            setOrderPage(1)
                          }}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                          placeholder="开始日期"
                        />
                        <span className="text-slate-400 text-sm">至</span>
                        <input
                          type="date"
                          value={orderDateEnd}
                          onChange={(e) => {
                            setOrderDateEnd(e.target.value)
                            setOrderPage(1)
                          }}
                          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                          placeholder="结束日期"
                        />
                      </div>

                      {/* Orders sub-table */}
                      {orderLoading ? (
                        <div className="flex justify-center py-6">
                          <Loader2 className="animate-spin" size={20} />
                        </div>
                      ) : orderList.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm">
                          暂无订单数据
                        </div>
                      ) : (
                        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-100">
                                <th className="text-left px-3 py-2 font-medium text-slate-500">订单号</th>
                                <th className="text-left px-3 py-2 font-medium text-slate-500">模型</th>
                                <th className="text-right px-3 py-2 font-medium text-slate-500">Token</th>
                                <th className="text-right px-3 py-2 font-medium text-slate-500">金额</th>
                                <th className="text-center px-3 py-2 font-medium text-slate-500">状态</th>
                                <th className="text-left px-3 py-2 font-medium text-slate-500">时间</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {orderList.map((o) => (
                                <tr key={o.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-mono text-slate-600">{o.orderNo}</td>
                                  <td className="px-3 py-2 text-slate-600">{o.modelName || '-'}</td>
                                  <td className="px-3 py-2 text-right font-mono text-slate-500">{o.totalTokens}</td>
                                  <td className="px-3 py-2 text-right font-mono text-green-600">¥{Number(o.cost || 0).toFixed(4)}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className={`inline-block px-1.5 py-0.5 text-[10px] rounded-full ${
                                      o.status === 'success' ? 'bg-green-100 text-green-700'
                                      : o.status === 'failed' ? 'bg-red-100 text-red-700'
                                      : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {o.status === 'success' ? '成功' : o.status === 'failed' ? '失败' : o.status}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-500">{new Date(o.createdAt).toLocaleString('zh-CN')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Order pagination */}
                      {orderTotalPages > 1 && (
                        <PaginationBar
                          page={orderPage}
                          onPageChange={setOrderPage}
                          pageSize={orderPageSize}
                          onPageSizeChange={() => {}}
                          total={orderTotal}
                          totalPages={orderTotalPages}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── 增强分页 ── */}
        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={totalPages}
          />
        )}
      </div>
    </div>
  )
}
