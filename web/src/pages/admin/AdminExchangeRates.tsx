import { useEffect, useState } from 'react'
import { get, post } from '@/lib/api'
import { Loader2, RefreshCw, DollarSign, History, AlertCircle } from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { formatDate } from '@/lib/utils'

// ── Types ──

interface ExchangeRate {
  id: number
  currency: string
  rateToCny: string
  source: string
  isActive: boolean
  updatedAt: string
  createdAt: string
}

interface RateHistory {
  id: number
  currency: string
  rateToCny: string
  source: string
  recordedAt: string
}

// ── Component ──

export default function AdminExchangeRates() {
  const [rates, setRates] = useState<ExchangeRate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [history, setHistory] = useState<RateHistory[]>([])
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { loadRates() }, [])

  async function loadRates() {
    setLoading(true)
    setError('')
    try {
      const res = await get('/api/v1/admin/finance/rates')
      setRates(res.data || [])
    } catch (e: any) {
      setError(e?.message || '加载汇率数据失败')
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory(currency: string) {
    if (showHistory === currency) {
      setShowHistory(null)
      return
    }
    setHistoryLoading(true)
    try {
      const res = await get(`/api/v1/admin/finance/rates/history?currency=${currency}&limit=20`)
      setHistory(res.data || [])
      setShowHistory(currency)
    } catch (e: any) {
      setMessage(`加载历史失败: ${e?.message}`)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleSave(currency: string) {
    const rate = editing[currency]
    if (!rate || isNaN(Number(rate))) {
      setMessage('请输入有效的汇率数值')
      return
    }
    setSaving(currency)
    try {
      await post('/api/v1/admin/finance/rates', {
        currency,
        rate_to_cny: Number(rate).toFixed(6),
      })
      setMessage(`汇率 ${currency} 更新成功`)
      setEditing(prev => { const n = { ...prev }; delete n[currency]; return n })
      await loadRates()
    } catch (e: any) {
      setMessage(`更新失败: ${e?.message}`)
    } finally {
      setSaving(null)
    }
  }

  function getCurrencyName(code: string): string {
    const map: Record<string, string> = {
      USD: '美元', HKD: '港币', JPY: '日元', EUR: '欧元',
      GBP: '英镑', CAD: '加元', AUD: '澳元', SGD: '新加坡元',
    }
    return map[code] || code
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-2">
        <DollarSign className="w-6 h-6 text-green-600" />
        <h1 className="text-2xl font-bold">多币种汇率管理</h1>
        <FeatureDescription page="多币种汇率管理" />
      </div>

      {/* 提示信息 */}
      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.includes('成功') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{message}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg border border-red-200 text-sm">
          {error}
        </div>
      )}

      {/* 刷新按钮 */}
      <div className="flex justify-end">
        <button onClick={loadRates} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 汇率表格 */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">币种</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">名称</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">当前汇率 (1 本币 = CNY)</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">来源</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">最后更新</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {rates.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">暂无汇率数据</td>
              </tr>
            ) : rates.map((rate) => (
              <tr key={rate.currency} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-sm">{rate.currency}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{getCurrencyName(rate.currency)}</td>
                <td className="px-4 py-3 text-sm">
                  {editing[rate.currency] !== undefined ? (
                    <input
                      type="number"
                      step="0.000001"
                      className="w-40 px-2 py-1 border rounded text-sm"
                      value={editing[rate.currency]}
                      onChange={e => setEditing(prev => ({ ...prev, [rate.currency]: e.target.value }))}
                    />
                  ) : (
                    <span className="font-mono">{rate.rateToCny}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs ${rate.source === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {rate.source === 'auto' ? '自动' : '手动'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {rate.updatedAt ? formatDate(rate.updatedAt) : '-'}
                </td>
                <td className="px-4 py-3 text-sm space-x-2">
                  {editing[rate.currency] !== undefined ? (
                    <>
                      <button
                        onClick={() => handleSave(rate.currency)}
                        disabled={saving === rate.currency}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving === rate.currency ? '保存中...' : '保存'}
                      </button>
                      <button
                        onClick={() => setEditing(prev => { const n = { ...prev }; delete n[rate.currency]; return n })}
                        className="px-3 py-1 border rounded text-xs hover:bg-gray-50"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setEditing(prev => ({ ...prev, [rate.currency]: rate.rateToCny }))}
                        className="px-3 py-1 border rounded text-xs hover:bg-gray-50"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => loadHistory(rate.currency)}
                        className="px-3 py-1 border rounded text-xs hover:bg-gray-50 flex items-center gap-1 inline-flex"
                      >
                        <History className="w-3 h-3" />
                        {showHistory === rate.currency ? '隐藏历史' : '历史'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 汇率历史 */}
      {showHistory && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b font-medium text-sm flex items-center gap-2">
            <History className="w-4 h-4" />
            汇率变更历史 - {showHistory} ({getCurrencyName(showHistory)})
          </div>
          {historyLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : history.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-400 text-sm">暂无历史记录</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">汇率 (1 本币 = CNY)</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">来源</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-600">记录时间</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-mono">{h.rateToCny}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs ${h.source === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {h.source === 'auto' ? '自动' : '手动'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">{formatDate(h.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* [?] 帮助说明 */}
      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200">
        <p className="font-medium mb-1">💡 说明</p>
        <ul className="list-disc ml-4 space-y-1">
          <li>汇率用于多币种结算：供应商可设定美元/港币报价，按结算当日汇率换算为人民币入账</li>
          <li>汇率波动超过 2% 时系统自动标记告警</li>
          <li>支持手动更新汇率，每次更新会记录历史变更</li>
          <li>支持 USD/HKD/JPY/EUR 等常用币种</li>
        </ul>
      </div>
    </div>
  )
}
