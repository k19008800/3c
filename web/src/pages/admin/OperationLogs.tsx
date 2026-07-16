// ============================================================
//  3cloud (3C) — 管理端操作日志
//  /admin/operation-logs — 查看所有用户的操作记录
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { OperationLog, PaginatedData } from '@/types'
import PaginationBar from '@/components/ui/PaginationBar'
import { Loader2, AlertCircle, Search, RefreshCw, Download } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

// ── 筛选选项 ──

const CATEGORY_OPTIONS = [
  { value: '', label: '全部分类' },
  { value: 'auth', label: '认证登录' },
  { value: 'api_key', label: 'API 密钥' },
  { value: 'finance', label: '财务交易' },
  { value: 'profile', label: '账户设置' },
  { value: 'agent', label: '代理商' },
  { value: 'system', label: '系统操作' },
]

const ACTION_LABELS: Record<string, string> = {
  login: '用户登录',
  logout: '用户登出',
  register: '用户注册',
  change_password: '修改密码',
  oauth_bind: 'OAuth 绑定',
  oauth_unbind: 'OAuth 解绑',
  api_key_create: '创建 API Key',
  api_key_delete: '删除 API Key',
  api_key_rename: '重命名 API Key',
  api_key_reset: '重置 API Key',
  recharge_submit: '提交充值',
  redemption_use: '使用兑换码',
  withdraw_request: '发起提现',
  invoice_apply: '申请发票',
  refund_apply: '申请退款',
  realname_submit: '提交实名认证',
  profile_update: '更新个人资料',
  security_setup: '安全设置变更',
  agent_client_create: '创建客户',
  agent_client_update: '编辑客户',
  agent_quota_adjust: '调整额度',
  agent_withdraw: '代理商提现',
  agent_redemption_create: '生成兑换码',
}

// ── 状态标签 ──

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    success: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: '成功' },
    failure: { bg: 'bg-red-100', text: 'text-red-700', label: '失败' },
    pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: '处理中' },
  }
  const s = config[status] || config.success
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    auth: 'bg-blue-100 text-blue-700',
    api_key: 'bg-purple-100 text-purple-700',
    finance: 'bg-amber-100 text-amber-700',
    profile: 'bg-indigo-100 text-indigo-700',
    agent: 'bg-cyan-100 text-cyan-700',
    system: 'bg-slate-100 text-slate-700',
  }
  const color = colors[category] || 'bg-slate-100 text-slate-700'
  const labels: Record<string, string> = {
    auth: '认证', api_key: '密钥', finance: '财务',
    profile: '账户', agent: '代理', system: '系统',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {labels[category] || category}
    </span>
  )
}

// ── 主组件 ──

export default function AdminOperationLogs() {
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize }
      if (keyword) params.keyword = keyword
      if (category) params.category = category
      if (status) params.status = status
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate
      const data = await get<PaginatedData<OperationLog>>('/api/v1/admin/operation-logs', params)
      setLogs(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取操作日志失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, category, status, startDate, endDate])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const resetFilters = () => {
    setKeyword('')
    setCategory('')
    setStatus('')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }

  // CSV 导出
  const exportCsv = () => {
    const params = new URLSearchParams()
    if (keyword) params.set('keyword', keyword)
    if (category) params.set('category', category)
    if (status) params.set('status', status)
    if (startDate) params.set('startDate', startDate)
    if (endDate) params.set('endDate', endDate)

    const token = localStorage.getItem('accessToken')
    const url = `/api/v1/admin/operation-logs/export?${params.toString()}`

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `operation-logs-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(a.href)
      })
      .catch((err) => console.error('导出失败:', err))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">操作日志</h1>
          <FeatureDescription page="admin/operation-logs" className="ml-2" />
          <p className="text-sm text-slate-500 mt-1">查看所有用户日常操作记录（登录、充值、密钥管理等）</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">共{total} 条记录</span>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <Download size={14} />
            导出 CSV
          </button>
          <button
            onClick={() => { setPage(1); fetchLogs() }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <div className="flex flex-wrap gap-4 items-end">
          {/* 关键词 */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">关键词</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
                onKeyDown={e => e.key === 'Enter' && fetchLogs()}
                placeholder="搜索摘要、用户邮箱/昵称"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 分类 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">操作分类</label>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); setPage(1) }}
              className="w-36 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 状态 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">结果</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1) }}
              className="w-28 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部</option>
              <option value="success">成功</option>
              <option value="failure">失败</option>
              <option value="pending">处理中</option>
            </select>
          </div>

          {/* 日期区间 */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">开始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">结束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={resetFilters}
            className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition"
          >
            重置
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">用户</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">角色</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">分类</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">操作</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">摘要</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">结果</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500 whitespace-nowrap">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <Loader2 className="animate-spin inline-block" size={24} />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    暂无操作日志
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-[140px] truncate">
                      {log.userNickname || log.userEmail || `#${log.userId}`}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">
                      {log.userRole}
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={log.category} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {log.actionLabel || log.action}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[240px] truncate" title={log.summary || undefined}>
                      {log.summary || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono text-xs">{log.ip || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <PaginationBar
            page={page}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            total={total}
            totalPages={Math.ceil(total / pageSize)}
          />
        )}
      </div>
    </div>
  )
}