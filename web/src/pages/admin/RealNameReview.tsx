import { useEffect, useState, useCallback } from 'react'
import { get, post } from '@/lib/api'
import type { RealNameReviewRecord, PaginatedData } from '@/types'
import { usePagePreferences } from '@/hooks/use-page-preferences'
import {
  Loader2, AlertCircle, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Search, Eye, ExternalLink,
  Ban, Building2, User,
} from 'lucide-react'

const REJECT_REASONS = [
  '证件不清晰，请重新上传清晰的证件照片',
  '信息不一致，请核对后重新提交',
  '企业资质不全，请补充完整的企业信息',
  '身份证号格式错误，请检查后重提',
  '营业执照不清晰，请重新上传',
  '联系人信息与证件不符',
]

const statusTabs = [
  { key: 'pending_review', label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
  { key: 'approved', label: '已通过', color: 'bg-green-100 text-green-700' },
  { key: 'rejected', label: '已拒绝', color: 'bg-red-100 text-red-700' },
]

const statusLabel: Record<string, string> = {
  pending_review: '待审核', approved: '已通过', rejected: '已拒绝',
}

const userTypeLabel: Record<string, string> = { personal: '个人', enterprise: '企业' }

export default function AdminRealNameReview() {
  const [records, setRecords] = useState<RealNameReviewRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [activeTab, setActiveTab] = useState('pending_review')
  const [keyword, setKeyword] = useState('')
  const [selected, setSelected] = useState<RealNameReviewRecord | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const { filters, loaded: prefsLoaded, updateFilter } = usePagePreferences('admin_real_name_review')

  // 恢复筛选条件
  useEffect(() => {
    if (prefsLoaded) {
      if (filters.activeTab) setActiveTab(filters.activeTab)
      if (filters.keyword) setKeyword(filters.keyword)
    }
  }, [prefsLoaded])

  const totalPages = Math.ceil(total / pageSize)

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params: any = { page, pageSize, status: activeTab }
      if (keyword) params.keyword = keyword
      const data = await get<PaginatedData<RealNameReviewRecord>>('/api/v1/admin/real-name-reviews', params)
      setRecords(data.list)
      setTotal(data.total)
    } catch (err: any) {
      setError(err.message || '获取失败')
    } finally { setLoading(false) }
  }, [page, pageSize, activeTab, keyword])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!selected) return
    try {
      await post(`/api/v1/admin/real-name-review/${selected.userId}`, {
        action,
        rejectReason: action === 'reject' ? rejectReason : undefined,
      })
      setMsg(action === 'approve' ? '✅ 已通过' : '✅ 已拒绝')
      setShowDetail(false)
      setSelected(null)
      setRejectReason('')
      fetchRecords()
    } catch (err: any) { setError(err.message || '操作失败') }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">实名审核</h1>

      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} /> {msg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {statusTabs.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setPage(1); updateFilter('activeTab', t.key) }} className={`px-4 py-2 text-sm font-medium rounded-md transition ${activeTab === t.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); updateFilter('keyword', e.target.value) }} placeholder="搜索邮箱或昵称" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <span className="text-sm text-slate-400">共 {total} 条</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">用户ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">邮箱</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">昵称</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">真实姓名</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">身份证号</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">企业名</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">版本</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">提交时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={12} className="text-center py-12"><Loader2 className="animate-spin inline-block" size={24} /></td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-12 text-slate-400">暂无记录</td></tr>
              ) : (
                records.map(r => (
                  <tr key={r.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm text-slate-500">{r.id}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.userId}</td>
                    <td className="px-4 py-3 text-sm text-slate-900">{r.email}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.nickname || '-'}</td>
                    <td className="px-4 py-3 text-xs">{userTypeLabel[r.userType] || r.userType}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{r.realName || '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">{r.idNumber ? r.idNumber.substring(0, 6) + '********' + r.idNumber.substring(14) : '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{r.companyName || '-'}</td>
                    <td className="px-4 py-3 text-sm text-slate-400">v{r.version}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusTabs.find(t => t.key === r.status)?.color || 'bg-slate-100 text-slate-700'}`}>
                        {statusLabel[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setSelected(r); setShowDetail(true) }} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                        <Eye size={14} /> {activeTab === 'pending_review' ? '审核' : '详情'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <span className="text-sm text-slate-500">第 {page} / {totalPages} 页</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronLeft size={18} /></button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded hover:bg-slate-200 disabled:opacity-30 transition"><ChevronRight size={18} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Detail + Review Modal */}
      {showDetail && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => e.target === e.currentTarget && setShowDetail(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  {selected.userType === 'enterprise' ? <Building2 size={20} /> : <User size={20} />}
                  实名审核详情
                  <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusTabs.find(t => t.key === selected.status)?.color || ''}`}>
                    {statusLabel[selected.status] || selected.status}
                  </span>
                  <span className="text-xs text-slate-400 ml-2">v{selected.version}</span>
                </h2>
                <button onClick={() => setShowDetail(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>

              {/* User Info */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
                <div><span className="text-slate-500">用户ID：</span>{selected.userId}</div>
                <div><span className="text-slate-500">邮箱：</span>{selected.email}</div>
                <div><span className="text-slate-500">昵称：</span>{selected.nickname || '-'}</div>
                <div><span className="text-slate-500">类型：</span>{userTypeLabel[selected.userType] || selected.userType}</div>
              </div>

              {/* Personal Info */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1"><User size={14} /> 个人信息</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">真实姓名：</span>{selected.realName || '-'}</div>
                  <div><span className="text-slate-500">身份证号：</span><span className="font-mono">{selected.idNumber || '-'}</span></div>
                </div>
                {/* 个人用户：显示身份证正反面缩略图，点击放大 */}
                {selected.userType === 'personal' && (selected.idFrontImage || selected.idBackImage) && (
                  <div className="flex gap-4 mt-3">
                    {selected.idFrontImage && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">身份证正面</p>
                        <img src={selected.idFrontImage} alt="身份证正面" className="w-48 h-32 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(selected.idFrontImage)} />
                      </div>
                    )}
                    {selected.idBackImage && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">身份证反面</p>
                        <img src={selected.idBackImage} alt="身份证反面" className="w-48 h-32 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(selected.idBackImage)} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Enterprise Info */}
              {selected.userType === 'enterprise' && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1"><Building2 size={14} /> 企业信息</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-slate-500">企业名称：</span>{selected.companyName || '-'}</div>
                    <div><span className="text-slate-500">统一信用代码：</span>{selected.companyRegNumber || '-'}</div>
                    <div><span className="text-slate-500">开户行：</span>{selected.bankName || '-'}</div>
                    <div><span className="text-slate-500">银行账号：</span>{selected.bankAccount || '-'}</div>
                    <div><span className="text-slate-500">银行地址：</span>{selected.bankAddress || '-'}</div>
                    <div><span className="text-slate-500">发票抬头：</span>{selected.invoiceTitle || '-'}</div>
                    <div><span className="text-slate-500">税号：</span>{selected.invoiceTaxId || '-'}</div>
                  </div>
                  {/* 企业用户：显示营业执照缩略图，点击放大 */}
                  {selected.userType === 'enterprise' && selected.businessLicense && (
                    <div className="mt-3">
                      <p className="text-xs text-slate-500 mb-1">营业执照</p>
                      <img src={selected.businessLicense} alt="营业执照" className="w-48 h-32 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(selected.businessLicense)} />
                    </div>
                  )}
                </div>
              )}

              {/* Reject Reason */}
              {selected.status === 'rejected' && selected.rejectReason && (
                <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700">
                  <strong>拒绝原因：</strong>{selected.rejectReason}
                </div>
              )}

              {/* Review actions */}
              {activeTab === 'pending_review' && (
                <div className="border-t pt-4 space-y-3">
                  <h3 className="text-sm font-medium text-slate-700">审核操作</h3>
                  <div className="flex gap-3">
                    <button onClick={() => handleReview('approve')}
                      className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium">
                      <CheckCircle2 size={16} /> 通过认证
                    </button>
                    <button onClick={() => {
                      if (!rejectReason.trim() && !confirm('确定拒绝此认证?')) return
                      handleReview('reject')
                    }}
                      className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium">
                      <XCircle size={16} /> 拒绝认证
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">拒绝原因（选填）</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {REJECT_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setRejectReason(reason)}
                          className={`text-xs px-2 py-1 rounded border transition ${
                            rejectReason === reason
                              ? 'border-red-400 bg-red-50 text-red-700'
                              : 'border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600'
                          }`}
                        >
                          {reason.length > 12 ? reason.slice(0, 12) + '…' : reason}
                        </button>
                      ))}
                    </div>
                    <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                      placeholder="输入拒绝原因，用户将收到此信息，也可点击上方预设模板"
                      rows={2}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-xs text-slate-400 border-t pt-3 flex justify-between">
                <span>提交时间：{new Date(selected.createdAt).toLocaleString('zh-CN')}</span>
                {selected.reviewedAt && <span>审核时间：{new Date(selected.reviewedAt).toLocaleString('zh-CN')}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal — 点击缩略图后全屏查看清晰大图 */}
      {previewImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-2xl">
              &times;
            </button>
            <img src={previewImage} alt="证件大图" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}
