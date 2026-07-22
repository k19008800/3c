import { useEffect, useState, useCallback } from 'react'
import { get, del, downloadUrl } from '@/lib/api'
import type { AgentClient, ReferralLink, PaginatedData } from '@/types'
import { AlertCircle } from 'lucide-react'
import ClientStatsCards from './clients/ClientStatsCards'
import ClientList from './clients/ClientList'

// ── 客户管理（代理商）─-
//
// 【业务说明】
//   代理商管理名下客户列表，支持分页浏览。
//   点击客户行可展开该客户的近期 API 调用订单，支持按日期筛选和 CSV 导出。
//   生成/复制专属推荐链接，新用户通过链接注册自动绑定为代理商名下客户。
//   支持解绑客户（消费数据保留）。
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/clients, POST /api/v1/agent/referral-link
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

  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  // ── 客户端数据加载 ──

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

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  // ── 展开/折叠 ──

  const handleToggleExpand = useCallback((customerUserId: number) => {
    setExpandedCustomerId((prev) => (prev === customerUserId ? null : customerUserId))
  }, [])

  // ── 解绑 ──

  const handleUnbind = useCallback(
    async (clientUserId: number, email: string) => {
      if (!confirm(`确认解绑客户「${email}」?\n解绑后该客户的消费数据仍保留。`)) return
      try {
        await del(`/api/v1/agent/clients/${clientUserId}`)
        fetchClients()
        setExpandedCustomerId(null)
      } catch (e: any) {
        alert(e.message || '解绑失败')
      }
    },
    [fetchClients],
  )

  // ── 导出 CSV ──

  const handleExport = useCallback((clientUserId: number, email: string) => {
    try {
      const safeName = email.replace(/[@.]/g, '_')
      downloadUrl(`/api/v1/agent/clients/${clientUserId}/export`, `客户_${safeName}_记录.csv`)
    } catch (e: any) {
      alert(e.message || '导出失败')
    }
  }, [])

  // ── 推荐链接 ──

  const fetchReferralLink = useCallback(async () => {
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
  }, [referralLink])

  const copyToClipboard = useCallback(async (text: string) => {
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
  }, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">我的客户</h1>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <ClientStatsCards
        total={total}
        referralLink={referralLink}
        linkLoading={linkLoading}
        copied={copied}
        onGenerateLink={fetchReferralLink}
      />

      <ClientList
        clients={clients}
        total={total}
        loading={loading}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        expandedCustomerId={expandedCustomerId}
        onToggleExpand={handleToggleExpand}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        onRefresh={fetchClients}
        onExport={handleExport}
        onUnbind={handleUnbind}
      />
    </div>
  )
}
