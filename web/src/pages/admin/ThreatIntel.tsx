import { useEffect, useState, useCallback } from 'react'
import { get, put } from '@/lib/api'
import {
  Loader2, AlertCircle, Shield, Search, Globe,
  RefreshCw, Settings, Save, ExternalLink
} from 'lucide-react'

// ── 类型 ──

interface ThreatOverview {
  totalEvents: number
  uniqueIps: number
  uniqueUsers: number
  threatByType: { eventType: string; count: number }[]
}

interface SuspiciousIp {
  ip: string
  eventCount: number
  criticalCount: number
  highCount: number
  lastSeen: string
  eventTypes: string
}

interface IpLookupResult {
  ip: string
  reputationScore: number
  threatLevel: string
  isBanned: boolean
  eventStats: {
    eventCount: number
    criticalCount: number
    highCount: number
    firstSeen: string | null
    lastSeen: string | null
    eventTypes: string
    riskLevels: string
  } | null
  relatedUsers: { userId: number; count: number }[]
}

interface ThreatSource {
  key: string
  name: string
  enabled: boolean
  apiUrl: string
  apiKey: string
  description: string
}

type Tab = 'overview' | 'ips' | 'lookup' | 'sources'

const EVENT_TYPE_LABELS: Record<string, string> = {
  brute_force: '暴力破解', unusual_location: '异地登录', new_device: '新设备',
  ip_banned: 'IP封禁', user_banned: '账号封禁', user_captcha: '验证码',
  circuit_trip: '厂商熔断', circuit_recovery: '熔断恢复', vendor_failure: '厂商失败',
  risk_detected: '风控检测', sensitive_word: '敏感词', abnormal_ip: '异常IP',
  batch_operation: '批量操作', repeat_operation: '重复操作', risk_control: '风控模型',
}

export default function AdminThreatIntel() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // overview
  const [overview, setOverview] = useState<ThreatOverview | null>(null)

  // ips
  const [ips, setIps] = useState<SuspiciousIp[]>([])
  const [ipTotal, setIpTotal] = useState(0)
  const [ipPage, setIpPage] = useState(1)

  // lookup
  const [lookupIp, setLookupIp] = useState('')
  const [lookupResult, setLookupResult] = useState<IpLookupResult | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  // sources
  const [sources, setSources] = useState<ThreatSource[]>([])
  const [savingSources, setSavingSources] = useState(false)

  const tabs: { key: Tab; label: string; icon: typeof Shield }[] = [
    { key: 'overview', label: '概览', icon: Shield },
    { key: 'ips', label: '可疑IP', icon: Globe },
    { key: 'lookup', label: 'IP查询', icon: Search },
    { key: 'sources', label: '情报源', icon: Settings },
  ]

  // ── 数据获取 ──

  const fetchData = useCallback(async (tab: Tab) => {
    setLoading(true)
    setError('')
    try {
      switch (tab) {
        case 'overview': {
          const res = await get<ThreatOverview>('/api/v1/admin/threat-intel/overview')
          setOverview(res)
          break
        }
        case 'ips': {
          const res = await get<{ list: SuspiciousIp[]; total: number }>('/api/v1/admin/threat-intel/suspicious-ips', { page: ipPage, pageSize: 20 })
          setIps(res.list)
          setIpTotal(res.total)
          break
        }
        case 'sources': {
          const res = await get<{ list: ThreatSource[] }>('/api/v1/admin/threat-intel/sources')
          setSources(res.list)
          break
        }
      }
    } catch (err: any) {
      setError(err.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [ipPage])

  useEffect(() => { fetchData(activeTab) }, [activeTab, fetchData, ipPage])

  // ── IP 查询 ──

  const handleLookup = useCallback(async () => {
    if (!lookupIp.trim()) return
    setLookupLoading(true)
    setError('')
    setLookupResult(null)
    try {
      const res = await get<IpLookupResult>(`/api/v1/admin/threat-intel/ip-lookup/${lookupIp.trim()}`)
      setLookupResult(res)
    } catch (err: any) {
      setError(err.message || 'IP 查询失败')
    } finally {
      setLookupLoading(false)
    }
  }, [lookupIp])

  // ── 保存情报源 ──

  const updateSource = (key: string, field: string, value: any) => {
    setSources(prev => prev.map(s => s.key === key ? { ...s, [field]: value } : s))
  }

  const handleSaveSources = async () => {
    setSavingSources(true)
    setError('')
    try {
      await put('/api/v1/admin/threat-intel/sources', { sources })
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSavingSources(false)
    }
  }

  // ── 渲染 ──

  function renderThreatLevel(score: number) {
    if (score >= 70) return { label: '高危', color: 'text-red-600 bg-red-50' }
    if (score >= 40) return { label: '中危', color: 'text-orange-600 bg-orange-50' }
    if (score >= 10) return { label: '低危', color: 'text-yellow-600 bg-yellow-50' }
    return { label: '安全', color: 'text-green-600 bg-green-50' }
  }

  // 概览
  function renderOverview() {
    if (!overview) return null
    const cards = [
      { label: '30天安全事件', value: overview.totalEvents, icon: Shield, color: 'text-red-600', bg: 'bg-red-50' },
      { label: '关联 IP 数', value: overview.uniqueIps, icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: '关联用户数', value: overview.uniqueUsers, icon: Shield, color: 'text-purple-600', bg: 'bg-purple-50' },
    ]

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map(card => (
            <div key={card.label} className={`${card.bg} rounded-xl p-5`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{card.label}</p>
                  <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                </div>
                <card.icon className={card.color} size={32} />
              </div>
            </div>
          ))}
        </div>

        <div>
          <h3 className="font-medium mb-3">威胁类型分布 Top 10</h3>
          <div className="space-y-1">
            {overview.threatByType.slice(0, 10).map(item => (
              <div key={item.eventType} className="flex items-center gap-3 px-2 py-1.5 hover:bg-gray-50 rounded">
                <span className="text-sm w-40 truncate">{EVENT_TYPE_LABELS[item.eventType] || item.eventType}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full bg-red-400"
                    style={{ width: `${Math.min(100, (item.count / overview.threatByType[0]?.count) * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-mono w-16 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // 可疑 IP
  function renderIps() {
    if (ips.length === 0) {
      return <p className="text-center text-gray-400 py-10">暂无可疑 IP</p>
    }
    const totalPages = Math.max(1, Math.ceil(ipTotal / 20))
    return (
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">IP 地址</th>
                <th className="pb-2 font-medium">事件数</th>
                <th className="pb-2 font-medium">严重</th>
                <th className="pb-2 font-medium">高危</th>
                <th className="pb-2 font-medium">最后活跃</th>
                <th className="pb-2 font-medium">事件类型</th>
              </tr>
            </thead>
            <tbody>
              {ips.map(item => (
                <tr key={item.ip} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 font-mono text-xs">{item.ip}</td>
                  <td className="py-2">{item.eventCount}</td>
                  <td className="py-2 text-red-500">{item.criticalCount}</td>
                  <td className="py-2 text-orange-500">{item.highCount}</td>
                  <td className="py-2 text-xs text-gray-500">{new Date(item.lastSeen).toLocaleString('zh-CN')}</td>
                  <td className="py-2 text-xs text-gray-500 max-w-[200px] truncate" title={item.eventTypes}>{item.eventTypes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button disabled={ipPage <= 1} onClick={() => setIpPage(p => p - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30">上一页</button>
            <span className="text-sm text-gray-500">{ipPage} / {totalPages}</span>
            <button disabled={ipPage >= totalPages} onClick={() => setIpPage(p => p + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30">下一页</button>
          </div>
        )}
      </div>
    )
  }

  // IP 查询
  function renderLookup() {
    const tl = lookupResult ? renderThreatLevel(lookupResult.reputationScore) : null
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={lookupIp}
            onChange={e => setLookupIp(e.target.value)}
            placeholder="输入 IP 地址查询 ..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300"
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
          />
          <button
            onClick={handleLookup}
            disabled={lookupLoading || !lookupIp.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            {lookupLoading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            查询
          </button>
        </div>

        {lookupResult && (
          <div className="border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-lg">{lookupResult.ip}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${tl!.color}`}>
                  {tl!.label} ({lookupResult.reputationScore}/100)
                </span>
                {lookupResult.isBanned && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    已封禁
                  </span>
                )}
              </div>
            </div>

            {lookupResult.eventStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">关联事件</p>
                  <p className="text-lg font-bold">{lookupResult.eventStats.eventCount}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">严重</p>
                  <p className="text-lg font-bold text-red-600">{lookupResult.eventStats.criticalCount}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">高危</p>
                  <p className="text-lg font-bold text-orange-600">{lookupResult.eventStats.highCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500">首次/最近</p>
                  <p className="text-xs text-gray-600">
                    {lookupResult.eventStats.firstSeen ? new Date(lookupResult.eventStats.firstSeen).toLocaleDateString('zh-CN') : '-'}
                    {' → '}
                    {lookupResult.eventStats.lastSeen ? new Date(lookupResult.eventStats.lastSeen).toLocaleDateString('zh-CN') : '-'}
                  </p>
                </div>
              </div>
            )}

            {lookupResult.relatedUsers.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">关联用户</h4>
                <div className="flex flex-wrap gap-2">
                  {lookupResult.relatedUsers.map(u => (
                    <span key={u.userId} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                      ID: {u.userId} ({u.count} 次)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // 情报源配置
  function renderSources() {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">配置外部威胁情报 API 源（API Key 加密存储）</p>
          <button
            onClick={handleSaveSources}
            disabled={savingSources}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
          >
            <Save size={16} />
            {savingSources ? '保存中...' : '保存配置'}
          </button>
        </div>

        {sources.map(source => (
          <div key={source.key} className="border rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-medium">{source.name}</h3>
                <span className="text-xs text-gray-400">{source.key}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={e => updateSource(source.key, 'enabled', e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">{source.enabled ? '已启用' : '已禁用'}</span>
              </label>
            </div>
            <p className="text-sm text-gray-500">{source.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">API 地址</label>
                <input
                  type="text"
                  value={source.apiUrl}
                  onChange={e => updateSource(source.key, 'apiUrl', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm font-mono"
                  disabled={!source.enabled}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  value={source.apiKey}
                  onChange={e => updateSource(source.key, 'apiKey', e.target.value)}
                  className="w-full px-2 py-1.5 border rounded text-sm font-mono"
                  disabled={!source.enabled}
                  placeholder="留空则不修改"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="text-red-500" size={28} />
            威胁情报
          </h1>
          <p className="text-sm text-gray-500 mt-1">IP 信誉查询、外部威胁情报集成与安全管理</p>
        </div>
        <button
          onClick={() => fetchData(activeTab)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg"><AlertCircle size={16} /> {error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>
      ) : (
        <div className="min-h-[300px]">
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'ips' && renderIps()}
          {activeTab === 'lookup' && renderLookup()}
          {activeTab === 'sources' && renderSources()}
        </div>
      )}
    </div>
  )
}
