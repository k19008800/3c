// ============================================================
//  LegalDocVersionManager — 法律文档版本管理通用组件
//  用于 PrivacyPolicy 和 TermsOfService 页面
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { get, post, patch } from '@/lib/api'
import type { PaginatedData } from '@/types'
import FeatureDescription from '@/components/admin/FeatureDescription'
import {
  FileText, Plus, Eye, Pencil, Loader2, AlertCircle,
  CheckCircle2, Clock, Save, Send, X, ChevronDown,
  HelpCircle,
} from 'lucide-react'

// ── Types ──

export interface LegalDocVersion {
  id: number
  version: string
  title: string
  content: string
  summary: string
  status: 'draft' | 'published' | 'archived'
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  agreeCount: number
  pendingAgreeCount: number
}

export interface LegalDocStats {
  currentVersion: string
  publishedAt: string | null
  lastUpdatedAt: string
  agreeCount: number
  pendingAgreeCount: number
  totalActiveUsers: number
}

interface LegalDocVersionManagerProps {
  /** API 基础路径，如 /api/v1/admin/privacy-policy */
  apiBase: string
  /** 页面标题 */
  title: string
  /** 页面描述 */
  description: string
  /** FeatureDescription 的 page key */
  pageKey: string
  /** 文档类型名称（用于弹窗） */
  docTypeName: string
}

// ── Form 类型 ──

interface VersionForm {
  version: string
  title: string
  content: string
  summary: string
}

// ── 主组件 ──

export default function LegalDocVersionManager({
  apiBase,
  title,
  description,
  pageKey,
  docTypeName,
}: LegalDocVersionManagerProps) {
  const [stats, setStats] = useState<LegalDocStats | null>(null)
  const [versions, setVersions] = useState<LegalDocVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 弹窗状态
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view' | null>(null)
  const [editingVersion, setEditingVersion] = useState<LegalDocVersion | null>(null)
  const [preview, setPreview] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [statsData, versionsData] = await Promise.all([
        get<LegalDocStats>(`${apiBase}/stats`),
        get<PaginatedData<LegalDocVersion>>(`${apiBase}/versions`, { page: 1, pageSize: 100 }),
      ])
      setStats(statsData)
      setVersions(versionsData.list)
    } catch (err: any) {
      setError(err.message || '获取数据失败')
    } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { fetchData() }, [fetchData])

  // 发布新版本
  const handleCreate = useCallback(() => {
    setEditingVersion(null)
    setModalMode('create')
    setPreview(false)
  }, [])

  // 编辑当前版本（仅草稿可编辑）
  const handleEditCurrent = useCallback(() => {
    if (!versions.length) return
    const currentDraft = versions.find((v) => v.status === 'draft')
    // 优先编辑草稿，否则编辑最新版本
    const target = currentDraft || versions[0]
    setEditingVersion(target)
    setModalMode('edit')
    setPreview(false)
  }, [versions])

  // 查看详情
  const handleView = useCallback((item: LegalDocVersion) => {
    setEditingVersion(item)
    setModalMode('view')
    setPreview(false)
  }, [])

  // 关闭弹窗
  const handleModalClose = useCallback(() => {
    setModalMode(null)
    setEditingVersion(null)
    setPreview(false)
  }, [])

  // 弹窗提交成功
  const handleModalSuccess = useCallback(() => {
    setModalMode(null)
    setEditingVersion(null)
    setPreview(false)
    fetchData()
  }, [fetchData])

  // ── 计算同意百分比 ──
  const agreePercent = stats
    ? Math.round((stats.agreeCount / Math.max(stats.totalActiveUsers, 1)) * 100)
    : 0
  const pendingPercent = stats
    ? Math.round((stats.pendingAgreeCount / Math.max(stats.totalActiveUsers, 1)) * 100)
    : 0

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <FeatureDescription page={pageKey} className="ml-2" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
              <div className="h-3 w-20 bg-slate-200 rounded mb-2" />
              <div className="h-7 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Loader2 className="animate-spin inline-block" size={24} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
        <FeatureDescription page={pageKey} className="ml-2" />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 当前版本状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="当前版本"
          value={stats?.currentVersion || '-'}
          sub={stats?.publishedAt ? `发布于 ${new Date(stats.publishedAt).toLocaleDateString('zh-CN')}` : ''}
          color="indigo"
        />
        <StatCard
          label="上次更新"
          value={stats?.lastUpdatedAt ? new Date(stats.lastUpdatedAt).toLocaleDateString('zh-CN') : '-'}
          color="slate"
        />
        <StatCard
          label="同意用户"
          value={`${stats?.agreeCount?.toLocaleString() || 0} 人`}
          sub={`占活跃用户 ${agreePercent}%`}
          color="green"
        />
        <StatCard
          label="待同意用户"
          value={`${stats?.pendingAgreeCount?.toLocaleString() || 0} 人`}
          sub={`占活跃用户 ${pendingPercent}%`}
          color="amber"
        />
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleCreate}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={16} />
          发布新版本
        </button>
        <button
          onClick={handleEditCurrent}
          className="flex items-center gap-1.5 px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
        >
          <Pencil size={16} />
          编辑当前版本
        </button>
      </div>

      {/* 版本历史表格 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">版本历史</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">版本</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">标题</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">发布日期</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">同意数</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">待同意</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {versions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                    暂无版本记录
                  </td>
                </tr>
              ) : (
                versions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-indigo-500 shrink-0" />
                        {item.version}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                      {item.title || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {item.publishedAt
                        ? new Date(item.publishedAt).toLocaleDateString('zh-CN')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {item.status === 'published'
                        ? item.agreeCount?.toLocaleString() || '0'
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {item.status === 'published'
                        ? item.pendingAgreeCount?.toLocaleString() || '0'
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleView(item)}
                        className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        <Eye size={14} />
                        查看
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 弹窗 */}
      {modalMode && (
        <VersionModal
          mode={modalMode}
          apiBase={apiBase}
          version={editingVersion}
          docTypeName={docTypeName}
          preview={preview}
          onPreviewToggle={() => setPreview((p) => !p)}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}

// ── StatCard ──

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color: 'indigo' | 'green' | 'amber' | 'slate'
}) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    slate: 'bg-slate-50 text-slate-600',
  }
  const subColors = {
    indigo: 'text-indigo-500',
    green: 'text-green-500',
    amber: 'text-amber-500',
    slate: 'text-slate-400',
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColors[color]}`}>{sub}</p>}
    </div>
  )
}

// ── StatusBadge ──

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'published':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
          <CheckCircle2 size={12} />
          已发布
        </span>
      )
    case 'draft':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          <Clock size={12} />
          草稿
        </span>
      )
    case 'archived':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
          已归档
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
          {status}
        </span>
      )
  }
}

// ── VersionModal ──

interface VersionModalProps {
  mode: 'create' | 'edit' | 'view'
  apiBase: string
  version: LegalDocVersion | null
  docTypeName: string
  preview: boolean
  onPreviewToggle: () => void
  onClose: () => void
  onSuccess: () => void
}

function VersionModal({
  mode,
  apiBase,
  version,
  docTypeName,
  preview,
  onPreviewToggle,
  onClose,
  onSuccess,
}: VersionModalProps) {
  const isEdit = mode === 'edit'
  const isView = mode === 'view'
  const isCreate = mode === 'create'

  // 自动生成版本号：取最新版本号递增
  const [form, setForm] = useState<VersionForm>(() => {
    if (isEdit && version) {
      return {
        version: version.version,
        title: version.title || '',
        content: version.content || '',
        summary: version.summary || '',
      }
    }
    // 创建模式：自动递增版本号
    const nextVersion = version
      ? incrementVersion(version.version)
      : 'v1.0'
    return {
      version: nextVersion,
      title: '',
      content: '',
      summary: '',
    }
  })

  const [saving, setSaving] = useState(false)
  const [saveMode, setSaveMode] = useState<'draft' | 'publish'>('publish')
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  const update = useCallback((key: keyof VersionForm, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
  }, [])

  const handleSubmit = useCallback(async () => {
    setMessage('')
    setFormError('')
    if (!form.version.trim()) { setFormError('请输入版本号'); return }
    if (!form.content.trim()) { setFormError('请输入文档内容'); return }

    setSaving(true)
    try {
      if (isEdit) {
        await patch(`${apiBase}/versions/${version!.id}`, {
          ...form,
          status: saveMode === 'publish' ? 'published' : 'draft',
        })
        setMessage(saveMode === 'publish' ? `${docTypeName}已发布` : `${docTypeName}已保存为草稿`)
      } else {
        await post(`${apiBase}/versions`, {
          ...form,
          status: saveMode === 'publish' ? 'published' : 'draft',
        })
        setMessage(saveMode === 'publish' ? `${docTypeName}已发布` : `${docTypeName}已保存为草稿`)
      }
      setTimeout(onSuccess, 800)
    } catch (err: any) {
      setFormError(err.message || (isEdit ? '更新失败' : '创建失败'))
    } finally {
      setSaving(false)
    }
  }, [isEdit, form, version, saveMode, apiBase, docTypeName, onSuccess])

  // 只读模式
  if (isView) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[85vh] flex flex-col">
          <div className="p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {version?.version} - {version?.title || docTypeName}
              </h2>
              <StatusBadge status={version?.status || 'draft'} />
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">
            {/* 版本信息 */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <span className="text-slate-500">版本号：</span>
                <span className="text-slate-900 font-medium">{version?.version}</span>
              </div>
              <div>
                <span className="text-slate-500">发布日期：</span>
                <span className="text-slate-900">
                  {version?.publishedAt
                    ? new Date(version.publishedAt).toLocaleDateString('zh-CN')
                    : '未发布'}
                </span>
              </div>
              {version?.title && (
                <div className="col-span-2">
                  <span className="text-slate-500">标题：</span>
                  <span className="text-slate-900">{version.title}</span>
                </div>
              )}
              {version?.summary && (
                <div className="col-span-2">
                  <span className="text-slate-500">变更摘要：</span>
                  <span className="text-slate-900">{version.summary}</span>
                </div>
              )}
            </div>

            {/* 内容 */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-sm font-medium text-slate-700 mb-3">文档内容</h4>
              <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {version?.content}
              </div>
            </div>
          </div>
          <div className="p-4 border-t border-slate-200 flex justify-end shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 编辑 / 创建模式
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold">
            {isEdit ? `编辑 ${docTypeName}` : `发布新${docTypeName}`}
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onPreviewToggle}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              <Eye size={14} />
              {preview ? '编辑' : '预览'}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {message && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-green-50 text-green-700">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}
          {formError && (
            <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-red-50 text-red-600">
              <AlertCircle size={16} />
              {formError}
            </div>
          )}

          {preview ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-500">
                版本：<span className="font-medium text-slate-800">{form.version}</span>
              </div>
              {form.title && (
                <div className="text-sm text-slate-500">
                  标题：<span className="font-medium text-slate-800">{form.title}</span>
                </div>
              )}
              {form.summary && (
                <div className="text-sm text-slate-500">
                  变更摘要：<span className="font-medium text-slate-800">{form.summary}</span>
                </div>
              )}
              <div className="border-t border-slate-100 pt-3">
                <h4 className="text-sm font-medium text-slate-700 mb-2">文档内容预览</h4>
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed min-h-[200px]">
                  {form.content || <span className="text-slate-400">（无内容）</span>}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    版本号 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.version}
                    onChange={(e) => update('version', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">标题</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => update('title', e.target.value)}
                    placeholder={`${docTypeName}标题（可选）`}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => update('content', e.target.value)}
                  placeholder={`请输入${docTypeName}内容...`}
                  rows={12}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">变更摘要</label>
                <textarea
                  value={form.summary}
                  onChange={(e) => update('summary', e.target.value)}
                  placeholder="本次变更摘要（可选）"
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center justify-between shrink-0">
          {/* 保存模式选择（仅创建/编辑模式，非预览） */}
          {!preview && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSaveMode('draft')}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition ${
                  saveMode === 'draft'
                    ? 'border-amber-400 bg-amber-50 text-amber-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Save size={14} />
                保存为草稿
              </button>
              <button
                type="button"
                onClick={() => setSaveMode('publish')}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition ${
                  saveMode === 'publish'
                    ? 'border-green-400 bg-green-50 text-green-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Send size={14} />
                发布
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg"
            >
              取消
            </button>
            {!preview && (
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving
                  ? (saveMode === 'publish' ? '发布中...' : '保存中...')
                  : (saveMode === 'publish' ? '发布' : '保存草稿')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 工具函数：版本号递增 ──

function incrementVersion(currentVersion: string): string {
  // 匹配 v{major}.{minor} 格式
  const match = currentVersion.match(/^v?(\d+)\.(\d+)$/)
  if (match) {
    const major = parseInt(match[1], 10)
    const minor = parseInt(match[2], 10) + 1
    return `v${major}.${minor}`
  }
  // 默认递增
  return 'v1.1'
}