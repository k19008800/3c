// ============================================================
//  CampaignRedemptions.tsx — 兑换码管理（批次列表 + 生成弹窗）
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { Plus, Loader2, AlertCircle } from 'lucide-react'
import { get, post } from '@/lib/api'
import type { CodeBatch } from './types'

interface CampaignRedemptionsProps {
  campaignId: number
}

// ════════════════════════════════════════════
//  Generate Codes Modal
// ════════════════════════════════════════════

function GenerateCodesModal({
  campaignId,
  onClose,
  onSuccess,
}: {
  campaignId: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [count, setCount] = useState(100)
  const [faceValue, setFaceValue] = useState('')
  const [validDays, setValidDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    if (count <= 0 || count > 10000) {
      setError('生成数量需在 1-10000 之间')
      return
    }
    const fv = parseFloat(faceValue)
    if (!fv || fv <= 0) {
      setError('请输入有效面额')
      return
    }
    if (validDays <= 0) {
      setError('有效期天数必须大于 0')
      return
    }

    setSaving(true)
    try {
      await post(`/api/v1/admin/campaigns/${campaignId}/generate-codes`, {
        count,
        faceValue: fv,
        validDays,
      })
      onSuccess()
    } catch (err: any) {
      setError(err.message || '生成失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">生成兑换码</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            >
              &times;
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              生成数量 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 0)}
              min={1}
              max={10000}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              面额 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-slate-400 text-sm">
                ¥
              </span>
              <input
                type="number"
                value={faceValue}
                onChange={(e) => setFaceValue(e.target.value)}
                placeholder="0.00"
                min={0.01}
                step={0.01}
                className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">
              有效期 (天) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={validDays}
              onChange={(e) => setValidDays(parseInt(e.target.value) || 0)}
              min={1}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? '生成中...' : '生成兑换码'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════
//  兑换码批次列表
// ════════════════════════════════════════════

function BatchList({ batches }: { batches: CodeBatch[] }) {
  if (batches.length === 0) {
    return <div className="py-12 text-center text-slate-400">暂无兑换码批次</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th className="px-6 py-3 font-medium text-slate-500">批次 ID</th>
            <th className="px-6 py-3 font-medium text-slate-500 text-right">
              生成数量
            </th>
            <th className="px-6 py-3 font-medium text-slate-500 text-right">
              已使用
            </th>
            <th className="px-6 py-3 font-medium text-slate-500 text-right">
              面额
            </th>
            <th className="px-6 py-3 font-medium text-slate-500 text-right">
              有效期 (天)
            </th>
            <th className="px-6 py-3 font-medium text-slate-500">生成时间</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {batches.map((b) => (
            <tr key={b.id} className="hover:bg-slate-50 transition">
              <td className="px-6 py-4 font-mono text-xs text-slate-500">
                #{b.id}
              </td>
              <td className="px-6 py-4 text-right font-mono text-slate-600">
                {b.count.toLocaleString()}
              </td>
              <td className="px-6 py-4 text-right font-mono text-slate-600">
                {b.usedCount}
              </td>
              <td className="px-6 py-4 text-right font-mono text-indigo-600">
                ¥{Number(b.faceValue).toFixed(2)}
              </td>
              <td className="px-6 py-4 text-right text-slate-600">
                {b.validDays}
              </td>
              <td className="px-6 py-4 text-xs text-slate-400">
                {new Date(b.createdAt).toLocaleString('zh-CN')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ════════════════════════════════════════════
//  主组件
// ════════════════════════════════════════════

export default function CampaignRedemptions({
  campaignId,
}: CampaignRedemptionsProps) {
  const [batches, setBatches] = useState<CodeBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)

  const fetchBatches = useCallback(async () => {
    setLoading(true)
    try {
      const res = await get<{ list: CodeBatch[] }>(
        `/api/v1/admin/campaigns/${campaignId}/codes`,
      )
      setBatches(res.list || [])
    } catch {
      // fallback
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">兑换码管理</h2>
        <button
          onClick={() => setShowGenerate(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          生成兑换码
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      ) : (
        <BatchList batches={batches} />
      )}

      {showGenerate && (
        <GenerateCodesModal
          campaignId={campaignId}
          onClose={() => setShowGenerate(false)}
          onSuccess={() => {
            setShowGenerate(false)
            fetchBatches()
          }}
        />
      )}
    </div>
  )
}
