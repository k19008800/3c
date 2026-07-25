import { useState, useCallback } from 'react'
import { post } from '@/lib/api'
import { Loader2, AlertCircle, Search, ShieldAlert } from 'lucide-react'

interface RiskResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  score: number
  reasons: string[]
}

const riskLevelColors: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const riskLevelLabels: Record<string, string> = {
  low: '低风险',
  medium: '中等风险',
  high: '高风险',
  critical: '严重风险',
}

export default function DetectTool() {
  const [text, setText] = useState('')
  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [result, setResult] = useState<RiskResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDetect = useCallback(async () => {
    if (!text.trim()) return

    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await post<RiskResult>('/api/v1/admin/risk-control/detect', {
        text,
        userId: userId ? parseInt(userId) : 0,
        action: action || 'manual_check',
      })
      setResult(res)
    } catch (err: any) {
      setError(err.message || '检测失败')
    } finally {
      setLoading(false)
    }
  }, [text, userId, action])

  const presets = [
    { label: '删除全部记录', text: 'delete_all records from database' },
    { label: '批量退款申请', text: '批量退款: 用户申请批量退款 100 笔' },
    { label: '导出用户数据', text: '导出数据: 导出所有用户信息 CSV' },
    { label: '正常查询', text: '查询今日调用统计汇总' },
  ]

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">手动风控检测</h2>
      <p className="text-sm text-gray-500">输入操作内容进行风险等级评估，支持多维度检测</p>

      {/* 预设用例 */}
      <div className="flex flex-wrap gap-2">
        {presets.map(preset => (
          <button
            key={preset.label}
            onClick={() => setText(preset.text)}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">检测内容</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="输入要检测的操作内容..."
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">用户 ID（可选）</label>
          <input
            type="number"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder="留空则不关联用户"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">操作类型（可选）</label>
          <input
            type="text"
            value={action}
            onChange={e => setAction(e.target.value)}
            placeholder="例如：manual_check"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-300"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleDetect}
            disabled={loading || !text.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 w-full justify-center"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Search size={16} />
            )}
            {loading ? '检测中...' : '开始检测'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {result && (
        <div className="border rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">检测结果</h3>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${riskLevelColors[result.riskLevel]}`}>
              <ShieldAlert size={12} className="inline mr-1" />
              {riskLevelLabels[result.riskLevel]}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">风险评分：</span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  result.score >= 70 ? 'bg-red-500' :
                  result.score >= 45 ? 'bg-orange-500' :
                  result.score >= 20 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${result.score}%` }}
              />
            </div>
            <span className="text-sm font-mono font-bold w-8 text-right">{result.score}</span>
          </div>

          {result.reasons.length > 0 && (
            <div>
              <span className="text-sm text-gray-500">触发原因：</span>
              <ul className="mt-1 space-y-1">
                {result.reasons.map((reason, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
                    <span className="text-orange-500 mt-0.5">&#8226;</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.reasons.length === 0 && (
            <p className="text-sm text-green-600">未检测到风险行为</p>
          )}
        </div>
      )}
    </div>
  )
}
