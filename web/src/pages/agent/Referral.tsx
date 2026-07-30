import { useEffect, useState, useCallback } from 'react'
import { Loader2, Link, Copy, Check, Users, MousePointerClick, UserPlus, RefreshCw, ExternalLink } from 'lucide-react'
import { get, post } from '@/lib/api'

// ── 代理邀请裂变（§24.1）─-
//
// 【业务说明】
//   代理可生成专属邀请链接，客户通过邀请链接注册后自动绑定为代理的下级客户。
//   代理端可查看每个邀请链接的转化效果（曝光/点击/注册/消费）。
//
// 【权限要求】角色=agent
// 【数据来源】GET /api/v1/agent/referral/links, GET /api/v1/agent/referral/stats,
//            GET /api/v1/agent/referral/clients, POST /api/v1/agent/referral/links

interface ReferralLink {
  id: number
  code: string
  customName: string | null
  clickCount: number
  registerCount: number
  source: string | null
  createdAt: string
}

interface ReferralStats {
  summary: {
    totalClicks: number
    totalRegisters: number
    totalClients: number
    totalLinks: number
    conversionRate: string
  }
  dailyStats: { date: string; registers: number }[]
}

interface ReferralClient {
  id: number
  nickname: string | null
  email: string | null
  balance: string
  createdAt: string
}

export default function AgentReferral() {
  const [links, setLinks] = useState<ReferralLink[]>([])
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [clients, setClients] = useState<ReferralClient[]>([])
  const [clientTotal, setClientTotal] = useState(0)
  const [clientPage, setClientPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [activeTab, setActiveTab] = useState<'links' | 'clients'>('links')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [linksRes, statsRes] = await Promise.all([
        get<{ links: ReferralLink[] }>('/api/v1/agent/referral/links'),
        get<ReferralStats>('/api/v1/agent/referral/stats'),
      ])
      setLinks(linksRes.data.links || [])
      setStats(statsRes.data)
    } catch (err: any) {
      console.error('加载邀请数据失败', err)
    }
    setLoading(false)
  }, [])

  const loadClients = useCallback(async (page: number) => {
    try {
      const res = await get<{ clients: ReferralClient[]; total: number; totalPages: number }>(
        `/api/v1/agent/referral/clients?page=${page}&pageSize=10`
      )
      setClients(res.data.clients || [])
      setClientTotal(res.data.total)
      setClientPage(page)
    } catch (err: any) {
      console.error('加载邀请客户失败', err)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleCreateLink = async () => {
    setCreating(true)
    try {
      await post('/api/v1/agent/referral/links', { customName: customName || undefined })
      setShowCreateForm(false)
      setCustomName('')
      loadData()
    } catch (err: any) {
      console.error('创建邀请链接失败', err)
    }
    setCreating(false)
  }

  const copyToClipboard = (code: string, id: number) => {
    const url = `https://unmisa.com/register?agent=${code}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">
            邀请裂变 <span className="text-xs text-gray-500 align-top">[?]</span>
          </h1>
          <p className="text-sm text-gray-400 mt-1">生成专属邀请链接，客户注册后自动绑定为下级客户</p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition-colors"
        >
          + 生成新链接
        </button>
      </div>

      {/* 统计概览卡片 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Link className="w-4 h-4" />
              邀请链接
            </div>
            <div className="text-2xl font-bold text-gray-100">{stats.summary.totalLinks}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <MousePointerClick className="w-4 h-4" />
              总点击
            </div>
            <div className="text-2xl font-bold text-gray-100">{stats.summary.totalClicks}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <UserPlus className="w-4 h-4" />
              已注册
            </div>
            <div className="text-2xl font-bold text-green-400">{stats.summary.totalRegisters}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-2">
              <Users className="w-4 h-4" />
              已邀请客户
            </div>
            <div className="text-2xl font-bold text-blue-400">{stats.summary.totalClients}</div>
          </div>
        </div>
      )}

      {/* 创建表单弹窗 */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreateForm(false)}>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-100 mb-4">生成邀请链接</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">链接名称（可选）</label>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="例如：微信朋友圈、知乎推广"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
                >
                  取消
                </button>
                <button
                  onClick={handleCreateLink}
                  disabled={creating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm"
                >
                  {creating ? '生成中...' : '确认生成'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-4 border-b border-gray-700">
        <button
          onClick={() => { setActiveTab('links'); loadData() }}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'links' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          邀请链接
        </button>
        <button
          onClick={() => { setActiveTab('clients'); loadClients(1) }}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'clients' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          已邀请客户
        </button>
      </div>

      {/* 邀请链接列表 */}
      {activeTab === 'links' && (
        <div className="space-y-3">
          {links.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Link className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无邀请链接</p>
              <p className="text-sm mt-1">点击右上角"生成新链接"开始邀请</p>
            </div>
          ) : (
            links.map(link => {
              const inviteUrl = `https://unmisa.com/register?agent=${link.code}`
              return (
                <div key={link.id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-sm font-medium text-gray-100">
                        {link.customName || `邀请链接 #${link.code}`}
                      </span>
                      {link.source && (
                        <span className="ml-2 px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
                          {link.source}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(link.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <code className="flex-1 px-3 py-1.5 bg-gray-900 rounded text-sm text-gray-300 truncate">
                      {inviteUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(link.code, link.id)}
                      className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                      title="复制链接"
                    >
                      {copied === link.id ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>

                  <div className="flex gap-6 text-sm">
                    <span className="text-gray-400">
                      点击: <span className="text-gray-200">{link.clickCount}</span>
                    </span>
                    <span className="text-gray-400">
                      注册: <span className="text-gray-200">{link.registerCount}</span>
                    </span>
                    <span className="text-gray-400">
                      转化率: <span className="text-gray-200">
                        {link.clickCount > 0 ? ((link.registerCount / link.clickCount) * 100).toFixed(1) : '0.0'}%
                      </span>
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 已邀请客户列表 */}
      {activeTab === 'clients' && (
        <div>
          {clients.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>暂无邀请注册的客户</p>
              <p className="text-sm mt-1">生成邀请链接并分享给客户后，这里将显示邀请记录</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      <th className="text-left py-3 px-4">客户</th>
                      <th className="text-left py-3 px-4">邮箱</th>
                      <th className="text-right py-3 px-4">余额</th>
                      <th className="text-right py-3 px-4">注册时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map(client => (
                      <tr key={client.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-3 px-4 text-gray-100">{client.nickname || `用户#${client.id}`}</td>
                        <td className="py-3 px-4 text-gray-400">{client.email || '-'}</td>
                        <td className="py-3 px-4 text-right text-gray-200">¥{parseFloat(client.balance).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-400">
                          {new Date(client.createdAt).toLocaleDateString('zh-CN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {clientTotal > 10 && (
                <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
                  <span>共 {clientTotal} 条</span>
                  <div className="flex gap-2">
                    <button
                      disabled={clientPage <= 1}
                      onClick={() => loadClients(clientPage - 1)}
                      className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <button
                      disabled={clientPage >= Math.ceil(clientTotal / 10)}
                      onClick={() => loadClients(clientPage + 1)}
                      className="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 disabled:opacity-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}