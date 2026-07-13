import { useEffect, useState, useRef } from 'react'
import { get, post } from '@/lib/api'
import api from '@/lib/api'
import { useImpersonate } from '@/hooks/use-impersonate'
import type { UserRealNameHistoryRecord } from '@/types'
import { Loader2, CheckCircle2, AlertCircle, XCircle, Clock, Shield, Building2, User, Upload, Trash2, FileImage, FileText } from 'lucide-react'

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  unverified: { label: '未认证', color: 'text-slate-400 bg-slate-50', icon: Shield },
  pending_review: { label: '审核中', color: 'text-yellow-600 bg-yellow-50', icon: Clock },
  approved: { label: '已认证', color: 'text-green-600 bg-green-50', icon: CheckCircle2 },
  rejected: { label: '已拒绝', color: 'text-red-600 bg-red-50', icon: XCircle },
}

// ── File upload block component ──
interface FileState {
  file: File | null
  preview: string          // objectURL for preview
  uploadedPath: string      // backend relativePath after upload
  status: 'idle' | 'uploading' | 'success' | 'error'
  errorMsg: string
}

function FileUploadBlock({
  label, hint, accept, state, disabled, onSelect, onRemove
}: {
  label: string; hint: string; accept: string
  state: FileState; disabled: boolean
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
}) {
  const inputId = `file-${label.replace(/\s/g, '')}`

  if (state.status === 'uploading') {
    return (
      <div className="border-2 border-dashed border-blue-200 rounded-lg p-4 flex flex-col items-center justify-center gap-2 bg-blue-50/50 min-h-[130px]">
        <Loader2 size={24} className="animate-spin text-blue-500" />
        <span className="text-xs text-blue-600">正在上传...</span>
      </div>
    )
  }

  if (state.status === 'success' && state.preview) {
    return (
      <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50 min-h-[130px]">
        <img src={state.preview} alt={label} className="w-full h-[130px] object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
          <span className="text-xs text-white font-medium">{label}</span>
        </div>
        {!disabled && (
          <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 p-1 bg-white/80 hover:bg-white rounded-full shadow transition"
            title="删除"
          >
            <Trash2 size={14} className="text-red-500" />
          </button>
        )}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="border-2 border-dashed border-red-200 rounded-lg p-4 flex flex-col items-center justify-center gap-1.5 bg-red-50/50 min-h-[130px]">
        <AlertCircle size={20} className="text-red-400" />
        <span className="text-xs text-red-500 text-center">{state.errorMsg}</span>
        {!disabled && (
          <label htmlFor={inputId} className="cursor-pointer text-xs text-blue-600 hover:underline">
            重新选择
            <input id={inputId} type="file" accept={accept} className="hidden" onChange={onSelect} />
          </label>
        )}
      </div>
    )
  }

  // idle state
  return (
    <label htmlFor={inputId} className={`block border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition min-h-[130px] ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <Upload size={22} className="text-slate-400" />
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-xs text-slate-400">{hint}</span>
      <input id={inputId} type="file" accept={accept} className="hidden" disabled={disabled} onChange={onSelect} />
    </label>
  )
}

export default function RealName() {
  const [tab, setTab] = useState<'personal' | 'enterprise'>('personal')
  const [currentStatus, setCurrentStatus] = useState<string>('unverified')
  const { isImpersonating, targetEmail } = useImpersonate()
  const [history, setHistory] = useState<UserRealNameHistoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [submitting, setSubmitting] = useState(false)

  // Personal form
  const [pForm, setPForm] = useState({ realName: '', idNumber: '' })
  // Enterprise form
  const [eForm, setEForm] = useState({
    realName: '', idNumber: '',
    companyName: '', companyRegNumber: '',
    bankName: '', bankAccount: '', bankAddress: '',
    invoiceTitle: '', invoiceTaxId: '',
  })

  // File upload state
  const emptyFileState = (): FileState => ({ file: null, preview: '', uploadedPath: '', status: 'idle', errorMsg: '' })

  const [pIdFront, setPIdFront] = useState<FileState>(emptyFileState)
  const [pIdBack, setPIdBack] = useState<FileState>(emptyFileState)
  const [eIdFront, setEIdFront] = useState<FileState>(emptyFileState)
  const [eIdBack, setEIdBack] = useState<FileState>(emptyFileState)
  const [eBizLicense, setEBizLicense] = useState<FileState>(emptyFileState)

  const [myInfo, setMyInfo] = useState<any>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [ocrStates, setOcrStates] = useState<Record<string, string>>({})

  const autoFillRef = useRef(false)

  const fetchStatus = async () => {
    try {
      const me = await get<any>('/api/v1/auth/me')
      setCurrentStatus(me.realNameStatus || 'unverified')
      setMyInfo(me)

      // 用户端查看自己的审核历史（新端点，普通用户可访问）
      try {
        const h = await get<{ list: UserRealNameHistoryRecord[] }>('/api/v1/auth/real-name/history')
        setHistory(h.list || [])
      } catch { /* 可能无记录 */ }

      // 从 status 接口获取证件文件路径并构建预览 URL
      try {
        const status = await get<{
          idFrontImage: string | null
          idBackImage: string | null
          businessLicense: string | null
        }>('/api/v1/auth/real-name/status')

        const buildPreview = (relPath: string | null) => {
          if (!relPath) return ''
          const filename = relPath.split('/').pop() || ''
          return filename ? `/api/v1/auth/real-name/file/${filename}` : ''
        }

        const frontUrl = buildPreview(status.idFrontImage)
        const backUrl = buildPreview(status.idBackImage)
        const bizUrl = buildPreview(status.businessLicense)

        if (frontUrl) setPIdFront({ file: null, preview: frontUrl, uploadedPath: status.idFrontImage || '', status: 'success', errorMsg: '' })
        if (backUrl) setPIdBack({ file: null, preview: backUrl, uploadedPath: status.idBackImage || '', status: 'success', errorMsg: '' })
        if (frontUrl) setEIdFront({ file: null, preview: frontUrl, uploadedPath: status.idFrontImage || '', status: 'success', errorMsg: '' })
        if (backUrl) setEIdBack({ file: null, preview: backUrl, uploadedPath: status.idBackImage || '', status: 'success', errorMsg: '' })
        if (bizUrl) setEBizLicense({ file: null, preview: bizUrl, uploadedPath: status.businessLicense || '', status: 'success', errorMsg: '' })
      } catch { /* status endpoint may be unavailable */ }

      // 如果是被拒状态，自动回填上次提交的数据
      if (me.realNameStatus === 'rejected' && !autoFillRef.current) {
        autoFillRef.current = true
        try {
          const last = await get<any>('/api/v1/auth/real-name/last-submission')
          if (last) {
            // 预填个人信息
            if (last.realName) {
              setPForm(f => ({ ...f, realName: last.realName }))
              setEForm(f => ({ ...f, realName: last.realName }))
            }
            if (last.idNumber) {
              setPForm(f => ({ ...f, idNumber: last.idNumber }))
              setEForm(f => ({ ...f, idNumber: last.idNumber }))
            }

            // 预填企业信息
            if (last.companyName) setEForm(f => ({ ...f, companyName: last.companyName }))
            if (last.companyRegNumber) setEForm(f => ({ ...f, companyRegNumber: last.companyRegNumber }))
            if (last.bankName) setEForm(f => ({ ...f, bankName: last.bankName }))
            if (last.bankAccount) setEForm(f => ({ ...f, bankAccount: last.bankAccount }))
            if (last.bankAddress) setEForm(f => ({ ...f, bankAddress: last.bankAddress }))
            if (last.invoiceTitle) setEForm(f => ({ ...f, invoiceTitle: last.invoiceTitle }))
            if (last.invoiceTaxId) setEForm(f => ({ ...f, invoiceTaxId: last.invoiceTaxId }))

            // 预填图片（如果有图片路径，构建预览 URL）
            const buildPreview2 = (relPath: string | null) => {
              if (!relPath) return ''
              const filename = relPath.split('/').pop() || ''
              return filename ? `/api/v1/auth/real-name/file/${filename}` : ''
            }

            if (last.idFrontImage) {
              const url = buildPreview2(last.idFrontImage)
              if (url) {
                setPIdFront({ file: null, preview: url, uploadedPath: last.idFrontImage, status: 'success', errorMsg: '' })
                setEIdFront({ file: null, preview: url, uploadedPath: last.idFrontImage, status: 'success', errorMsg: '' })
              }
            }
            if (last.idBackImage) {
              const url = buildPreview2(last.idBackImage)
              if (url) {
                setPIdBack({ file: null, preview: url, uploadedPath: last.idBackImage, status: 'success', errorMsg: '' })
                setEIdBack({ file: null, preview: url, uploadedPath: last.idBackImage, status: 'success', errorMsg: '' })
              }
            }
            if (last.businessLicense) {
              const url = buildPreview2(last.businessLicense)
              if (url) {
                setEBizLicense({ file: null, preview: url, uploadedPath: last.businessLicense, status: 'success', errorMsg: '' })
              }
            }
          }
        } catch { /* 没有上次提交记录 */ }
      }
    } catch { }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchStatus() }, [])

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 5000)
  }

  // ── File upload handler ──
  const doUpload = async (file: File, fileType: string, setter: (s: FileState) => void) => {
    const formData = new FormData()
    formData.append('fileType', fileType)
    formData.append('file', file)

    setter({ file, preview: URL.createObjectURL(file), uploadedPath: '', status: 'uploading', errorMsg: '' })

    try {
      const res = await api.post<{ code: number; data: { relativePath: string }; message: string }>(
        '/api/v1/auth/real-name/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      const relativePath = res.data.data.relativePath
      setter({ file, preview: URL.createObjectURL(file), uploadedPath: relativePath, status: 'success', errorMsg: '' })
    } catch (err: any) {
      setter({ file: null, preview: '', uploadedPath: '', status: 'error', errorMsg: err.message || '上传失败' })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, fileType: string, setter: (s: FileState) => void) => {
    const f = e.target.files?.[0]
    if (!f) return
    doUpload(f, fileType, setter)
  }

  const removeFile = (setter: (s: FileState) => void) => {
    setter(emptyFileState())
  }

  const submitPersonal = async () => {
    if (!pForm.realName || !pForm.idNumber) { showMsg('请填写完整信息', 'error'); return }
    if (!/^\d{17}[\dXx]$/.test(pForm.idNumber)) { showMsg('身份证号格式不正确（18位）', 'error'); return }

    const body: any = { ...pForm }
    if (pIdFront.uploadedPath) body.idFrontImage = pIdFront.uploadedPath
    if (pIdBack.uploadedPath) body.idBackImage = pIdBack.uploadedPath

    setSubmitting(true)
    try {
      await post('/api/v1/auth/real-name/personal', body)
      showMsg('✅ 实名信息已提交，等待管理员审核', 'success')
      setCurrentStatus('pending_review')
      fetchStatus()
    } catch (err: any) { showMsg('❌ ' + (err.message || '提交失败'), 'error') }
    finally { setSubmitting(false) }
  }

  const submitEnterprise = async () => {
    if (!eForm.realName || !eForm.idNumber || !eForm.companyName || !eForm.companyRegNumber) {
      showMsg('请填写必填信息', 'error'); return
    }
    if (!/^\d{17}[\dXx]$/.test(eForm.idNumber)) { showMsg('身份证号格式不正确（18位）', 'error'); return }

    const body: any = { ...eForm }
    if (eIdFront.uploadedPath) body.idFrontImage = eIdFront.uploadedPath
    if (eIdBack.uploadedPath) body.idBackImage = eIdBack.uploadedPath
    if (eBizLicense.uploadedPath) body.businessLicense = eBizLicense.uploadedPath

    setSubmitting(true)
    try {
      await post('/api/v1/auth/real-name/enterprise', body)
      showMsg('✅ 企业实名信息已提交，等待管理员审核', 'success')
      setCurrentStatus('pending_review')
      fetchStatus()
    } catch (err: any) { showMsg('❌ ' + (err.message || '提交失败'), 'error') }
    finally { setSubmitting(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin" size={32} />
    </div>
  )

  const StatusIcon = statusConfig[currentStatus]?.icon || Shield

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">实名认证</h1>

      {/* 模拟态提示 */}
      {isImpersonating && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm">
          <p className="text-amber-800 font-medium">⛔ 模拟模式下不支持提交实名认证</p>
          <p className="text-amber-600 text-xs mt-1">
            当前以 <strong>{targetEmail}</strong> 的身份操作，请先退出模拟模式
          </p>
        </div>
      )}

      {/* Current status banner */}
      <div className={`rounded-xl p-5 border ${statusConfig[currentStatus]?.color || 'bg-slate-50 text-slate-600'} flex items-center gap-4`}>
        <StatusIcon size={28} />
        <div>
          <p className="font-semibold text-base">
            {currentStatus === 'unverified' && '您尚未完成实名认证'}
            {currentStatus === 'pending_review' && '实名认证审核中'}
            {currentStatus === 'approved' && '实名认证已通过'}
            {currentStatus === 'rejected' && '实名认证已被拒绝'}
          </p>
          <p className="text-sm opacity-80 mt-0.5">
            {currentStatus === 'unverified' && '完成认证后方可使用 AI 服务'}
            {currentStatus === 'pending_review' && '请耐心等待管理员审核，审核通过后即可使用'}
            {currentStatus === 'approved' && '您已可正常使用全部 AI 服务'}
            {currentStatus === 'rejected' && '请修改后重新提交认证信息'}
          </p>
        </div>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${msgType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {msgType === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {msg}
        </div>
      )}

      {/* Show submitted info card (approved or rejected) */}
      {(currentStatus === 'approved' || currentStatus === 'rejected') && myInfo && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">已提交的实名信息</h3>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig[currentStatus]?.color || ''}`}>
              {statusConfig[currentStatus]?.label}
            </span>
          </div>
          <div className="p-5 space-y-4">
            {/* 个人信息 */}
            <div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">真实姓名：</span>{myInfo.realName || '-'}</div>
                <div><span className="text-slate-500">身份证号：</span><span className="font-mono">{myInfo.idNumber ? myInfo.idNumber : '-'}</span></div>
                {myInfo.companyName && <div className="col-span-2"><span className="text-slate-500">企业名称：</span>{myInfo.companyName}</div>}
                {myInfo.companyRegNumber && <div className="col-span-2"><span className="text-slate-500">统一信用代码：</span>{myInfo.companyRegNumber}</div>}
              </div>

              {/* 拒绝原因 */}
              {currentStatus === 'rejected' && myInfo.rejectReason && (
                <div className="mt-3 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                  <strong>拒绝原因：</strong>{myInfo.rejectReason}
                </div>
              )}
            </div>

            {/* 证件缩略图 */}
            {(myInfo.idFrontImage || myInfo.idBackImage || myInfo.businessLicense) && (
              <div className="border-t pt-4">
                <h4 className="text-xs font-medium text-slate-500 mb-3">上传的证件</h4>
                <div className="flex flex-wrap gap-4">
                  {myInfo.idFrontImage && (() => {
                    const filename = myInfo.idFrontImage.split('/').pop() || ''
                    const url = filename ? `/api/v1/auth/real-name/file/${filename}` : ''
                    return url ? (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">身份证正面</p>
                        <img src={url} alt="身份证正面" className="w-36 h-24 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(url)} />
                      </div>
                    ) : null
                  })()}
                  {myInfo.idBackImage && (() => {
                    const filename = myInfo.idBackImage.split('/').pop() || ''
                    const url = filename ? `/api/v1/auth/real-name/file/${filename}` : ''
                    return url ? (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">身份证反面</p>
                        <img src={url} alt="身份证反面" className="w-36 h-24 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(url)} />
                      </div>
                    ) : null
                  })()}
                  {myInfo.businessLicense && (() => {
                    const filename = myInfo.businessLicense.split('/').pop() || ''
                    const url = filename ? `/api/v1/auth/real-name/file/${filename}` : ''
                    return url ? (
                      <div>
                        <p className="text-xs text-slate-400 mb-1">营业执照</p>
                        <img src={url} alt="营业执照" className="w-36 h-24 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(url)} />
                      </div>
                    ) : null
                  })()}
                </div>
              </div>
            )}

            {/* 审核历史版本 */}
            {history.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-xs font-medium text-slate-500 mb-2">审核版本记录</h4>
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg">
                      <span className="text-slate-600">v{h.version}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        h.status === 'approved' ? 'bg-green-100 text-green-700' :
                        h.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {h.status === 'approved' ? '已通过' : h.status === 'rejected' ? '已拒绝' : '待审核'}
                      </span>
                      <span className="text-slate-400">{new Date(h.createdAt).toLocaleString('zh-CN')}</span>
                      {h.rejectReason && <span className="text-red-500 ml-2">({h.rejectReason})</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show form only when not approved */}
      {currentStatus !== 'approved' && (
        <>
          {/* Tab selector */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
            <button onClick={() => setTab('personal')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition ${tab === 'personal' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              <User size={16} /> 个人认证
            </button>
            <button onClick={() => setTab('enterprise')} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition ${tab === 'enterprise' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
              <Building2 size={16} /> 企业认证
            </button>
          </div>

          {/* Personal form */}
          {tab === 'personal' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h3 className="font-semibold text-slate-800">个人实名信息</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">真实姓名 *</label>
                  <input type="text" value={pForm.realName} onChange={e => setPForm(f => ({ ...f, realName: e.target.value }))}
                    placeholder="请输入与身份证一致的姓名"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={currentStatus === 'pending_review'} />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">身份证号 *</label>
                  <input type="text" value={pForm.idNumber} onChange={e => setPForm(f => ({ ...f, idNumber: e.target.value }))}
                    placeholder="18 位身份证号码"
                    maxLength={18}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    disabled={currentStatus === 'pending_review'} />
                </div>
              </div>

              {/* ── 证件上传 ── */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">上传证件照片</h4>
                <p className="text-xs text-slate-400 mb-3">支持 JPG / PNG 格式，建议单张不超过 5MB</p>
                <div className="grid grid-cols-2 gap-4">
                  <FileUploadBlock
                    label="身份证正面"
                    hint="人像面"
                    accept="image/*"
                    state={pIdFront}
                    disabled={currentStatus === 'pending_review'}
                    onSelect={(e) => handleFileSelect(e, 'id_front', setPIdFront)}
                    onRemove={() => removeFile(setPIdFront)}
                  />
                  <FileUploadBlock
                    label="身份证反面"
                    hint="国徽面"
                    accept="image/*"
                    state={pIdBack}
                    disabled={currentStatus === 'pending_review'}
                    onSelect={(e) => handleFileSelect(e, 'id_back', setPIdBack)}
                    onRemove={() => removeFile(setPIdBack)}
                  />
                </div>
              </div>

              {currentStatus !== 'pending_review' && !isImpersonating && (
                <button onClick={submitPersonal} disabled={submitting} className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  提交个人实名
                </button>
              )}
            </div>
          )}

          {/* Enterprise form */}
          {tab === 'enterprise' && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h3 className="font-semibold text-slate-800">企业实名信息</h3>

              <p className="text-xs text-slate-400 bg-slate-50 p-2 rounded">企业认证需要同时提交联系人的实名信息和企业资质</p>

              <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-600 border-b pb-1">联系人信息</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">联系人姓名 *</label>
                    <input type="text" value={eForm.realName} onChange={e => setEForm(f => ({ ...f, realName: e.target.value }))} placeholder="法人或经办人" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={currentStatus === 'pending_review'} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">身份证号 *</label>
                    <input type="text" value={eForm.idNumber} onChange={e => setEForm(f => ({ ...f, idNumber: e.target.value }))} placeholder="18 位" maxLength={18} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" disabled={currentStatus === 'pending_review'} />
                  </div>
                </div>

                <h4 className="text-sm font-medium text-slate-600 border-b pb-1 mt-4">企业资质</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-600 mb-1">企业名称 *</label>
                    <input type="text" value={eForm.companyName} onChange={e => setEForm(f => ({ ...f, companyName: e.target.value }))} placeholder="营业执照上的企业全称" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" disabled={currentStatus === 'pending_review'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-slate-600 mb-1">统一社会信用代码 *</label>
                    <input type="text" value={eForm.companyRegNumber} onChange={e => setEForm(f => ({ ...f, companyRegNumber: e.target.value }))} placeholder="18 位统一信用代码" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" disabled={currentStatus === 'pending_review'} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">开户行</label>
                    <input type="text" value={eForm.bankName} onChange={e => setEForm(f => ({ ...f, bankName: e.target.value }))} placeholder="例如：中国银行北京分行" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" disabled={currentStatus === 'pending_review'} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">银行账号</label>
                    <input type="text" value={eForm.bankAccount} onChange={e => setEForm(f => ({ ...f, bankAccount: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" disabled={currentStatus === 'pending_review'} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">银行地址</label>
                    <input type="text" value={eForm.bankAddress} onChange={e => setEForm(f => ({ ...f, bankAddress: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" disabled={currentStatus === 'pending_review'} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">发票抬头</label>
                    <input type="text" value={eForm.invoiceTitle} onChange={e => setEForm(f => ({ ...f, invoiceTitle: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" disabled={currentStatus === 'pending_review'} />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-600 mb-1">发票税号</label>
                    <input type="text" value={eForm.invoiceTaxId} onChange={e => setEForm(f => ({ ...f, invoiceTaxId: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" disabled={currentStatus === 'pending_review'} />
                  </div>
                </div>
              </div>

              {/* ── 证件上传 ── */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">上传证件照片</h4>
                <p className="text-xs text-slate-400 mb-3">支持 JPG / PNG 格式，建议单张不超过 5MB</p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <FileUploadBlock
                      label="身份证正面"
                      hint="人像面"
                      accept="image/*"
                      state={eIdFront}
                      disabled={currentStatus === 'pending_review'}
                      onSelect={(e) => handleFileSelect(e, 'id_front', setEIdFront)}
                      onRemove={() => removeFile(setEIdFront)}
                    />
                    {ocrStates?.eIdFront === 'recognizing' && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                        <Loader2 size={10} className="animate-spin" /> 识别中
                      </div>
                    )}
                    {ocrStates?.eIdFront === 'done' && (
                      <div className="text-xs text-green-600 mt-1">✅ 已自动填写</div>
                    )}
                  </div>
                  <div>
                    <FileUploadBlock
                      label="身份证反面"
                      hint="国徽面"
                      accept="image/*"
                      state={eIdBack}
                      disabled={currentStatus === 'pending_review'}
                      onSelect={(e) => handleFileSelect(e, 'id_back', setEIdBack)}
                      onRemove={() => removeFile(setEIdBack)}
                    />
                    {ocrStates?.eIdBack === 'recognizing' && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                        <Loader2 size={10} className="animate-spin" /> 识别中
                      </div>
                    )}
                    {ocrStates?.eIdBack === 'done' && (
                      <div className="text-xs text-green-600 mt-1">✅ 已识别</div>
                    )}
                  </div>
                  <div>
                    <FileUploadBlock
                      label="营业执照"
                      hint="可上传照片"
                      accept="image/*"
                      state={eBizLicense}
                      disabled={currentStatus === 'pending_review'}
                      onSelect={(e) => handleFileSelect(e, 'business_license', setEBizLicense)}
                      onRemove={() => removeFile(setEBizLicense)}
                    />
                    {ocrStates?.eBizLicense === 'recognizing' && (
                      <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                        <Loader2 size={10} className="animate-spin" /> 识别中
                      </div>
                    )}
                    {ocrStates?.eBizLicense === 'done' && (
                      <div className="text-xs text-green-600 mt-1">✅ 已自动填写企业信息</div>
                    )}
                    {ocrStates?.eBizLicense === 'error' && (
                      <div className="text-xs text-amber-600 mt-1">⚠️ 识别失败</div>
                    )}
                  </div>
                </div>
              </div>

              {currentStatus !== 'pending_review' && !isImpersonating && (
                <button onClick={submitEnterprise} disabled={submitting} className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  提交企业实名
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Image preview modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setPreviewImage(null)}>
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewImage(null)} className="absolute -top-10 right-0 text-white/80 hover:text-white text-2xl">&times;</button>
            <img src={previewImage} alt="证件大图" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  )
}
