/**
 * RequestRecordDetail — 单条请求详情页
 *
 * 上半部分：基本信息
 * 请求体/响应体展示区
 * 风险分析区
 * 人工审核区
 * 关联日志链接
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, User, Cpu, Globe, Clock, AlertTriangle, Loader2, ExternalLink, Save,
} from 'lucide-react'
import { get, post } from '@/lib/api'
import RiskBadge from './components/RiskBadge'
import RiskTags from './components/RiskTags'
import RequestViewer from './components/RequestViewer'
import type { RequestRecordDetail, RiskLevel } from './types'
import { RISK_LEVEL_OPTIONS } from './types'

/* ── Main ── */

export default function RequestRecordDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [record, setRecord] = useState<RequestRecordDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 审核状态
  const [reviewLevel, setReviewLevel] = useState<RiskLevel | ''>('')
  const [reviewNote, setReviewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError('')
    get<RequestRecordDetail>(`/api/v1/admin/request-records/${id}`)
      .then((data) => {
        setRecord(data)
        setReviewLevel(data.reviewLevel || '')
        setReviewNote(data.reviewNote || '')
      })
      .catch((err) => setError(err.message || '获取详情失败'))
      .finally(() => setLoading(false))
  }, [id])

  /** 提交审核 */
  const handleSubmitReview = async () => {
    if (!id || !reviewLevel) return
    setSubmitting(true)
    try {
      await post(`/api/v1/admin/request-records/${id}/review`, {
        riskLevel: reviewLevel,
        note: reviewNote,
      })
      setSubmitSuccess(true)
      setTimeout(() => setSubmitSuccess(false), 3000)
    } catch (err: any) {
      console.error('审核提交失败:', err)
    } finally {
      setSubmitting(false)
    }
  }

  /** 获取状态标签 */
  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      timeout: 'bg-orange-100 text-orange-700',
      cancelled: 'bg-slate-100 text-slate-600',
    }
    const labelMap: Record<string, string> = {
      success: '成功', failed: '失败', timeout: '超时', cancelled: '已取消',
    }
    return (
      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>
        {labelMap[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/admin/request-records')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={16} /> 返回列表
        </button>
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2">
          <AlertTriangle size={18} /> {error}
        </div>
      </div>
    )
  }

  if (!record) return null

  return (
    <div className="space-y-6">
      {/* 返回按钮 */}
      <button
        onClick={() => navigate('/admin/request-records')}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition"
      >
        <ArrowLeft size={16} /> 返回请求记录列表
      </button>

      <h1 className="text-xl font-bold text-slate-900">请求记录详情 #{record.id}</h1>

      {/* 基本信息 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">基本信息</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <InfoCard icon={User} label="用户" value={record.userEmail || '-'} />
          <InfoCard icon={Cpu} label="模型" value={record.modelName} />
          <InfoCard icon={Globe} label="供应商" value={record.vendorName} />
          <InfoCard
            icon={Clock}
            label="创建时间"
            value={record.createdAt ? record.createdAt.slice(0, 19).replace('T', ' ') : '-'}
          />
          <div>
            <p className="text-xs text-slate-500 mb-1">状态</p>
            {getStatusBadge(record.status)}
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">风险等级</p>
            <RiskBadge level={record.riskLevel} />
          </div>
          <InfoCard icon={Clock} label="耗时" value={`${record.durationMs}ms`} />
          <InfoCard icon={Cpu} label="总 Token" value={record.totalTokens?.toLocaleString() || '0'} />
        </div>

        {record.requestSize > 0 && (
          <div className="mt-3 text-xs text-slate-400">
            请求体大小: {record.requestSize >= 1_000_000
              ? `${(record.requestSize / 1_000_000).toFixed(1)}MB`
              : `${(record.requestSize / 1_000).toFixed(1)}KB`}
            {record.clientIp && ` | 客户端 IP: ${record.clientIp}`}
          </div>
        )}
      </div>

      {/* 请求体展示 */}
      <RequestViewer data={record.requestBody} title="请求体" />

      {/* 响应体展示 */}
      <RequestViewer data={record.responseBody} title="响应体" />

      {/* 风险分析 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">风险分析</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-1">风险标签</p>
            <RiskTags tags={record.riskTags} />
          </div>
          {record.riskReason && (
            <div>
              <p className="text-xs text-slate-500 mb-1">风险原因</p>
              <p className="text-sm text-slate-700 bg-red-50 border border-red-100 rounded-lg p-3">
                {record.riskReason}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 人工审核区 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">人工审核</h2>
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs text-slate-500 mb-1">风险等级（重新评定）</label>
            <select
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
              value={reviewLevel || ''}
              onChange={(e) => setReviewLevel(e.target.value as RiskLevel)}
            >
              <option value="">选择风险等级</option>
              {RISK_LEVEL_OPTIONS.filter((o) => o.value !== '').map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">审核备注</label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="输入审核备注..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-colors resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmitReview}
              disabled={!reviewLevel || submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              提交审核
            </button>
            {submitSuccess && (
              <span className="text-sm text-green-600 font-medium">✓ 审核已提交</span>
            )}
          </div>
        </div>
      </div>

      {/* 关联日志链接 */}
      {record.callLogId && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <Link
            to={`/console/admin/logs?highlight=${record.callLogId}`}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          >
            <ExternalLink size={16} />
            查看关联调用日志 #{record.callLogId}
          </Link>
        </div>
      )}
    </div>
  )
}

/* ── InfoCard 子组件 ── */

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof User
  label: string
  value: string
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
        <Icon size={14} />
        {label}
      </div>
      <p className="text-sm font-medium text-slate-900">{value}</p>
    </div>
  )
}