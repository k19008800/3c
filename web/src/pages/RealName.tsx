import { useEffect, useState, useRef } from 'react'
import { get, post } from '@/lib/api'
import { useImpersonate } from '@/hooks/use-impersonate'
import type { UserRealNameHistoryRecord } from '@/types'
import { Loader2, CheckCircle2, AlertCircle, Shield } from 'lucide-react'
import { useFileUpload } from '@/components/realname/RealNameUpload'
import { SubmittedInfoCard } from '@/components/realname/RealNameHistory'
import { RealNameForm } from '@/components/realname/RealNameForm'

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  unverified: { label: '未认证', color: 'text-slate-400 bg-slate-50', icon: Shield },
  pending_review: { label: '审核中', color: 'text-yellow-600 bg-yellow-50', icon: Loader2 },
  approved: { label: '已认证', color: 'text-green-600 bg-green-50', icon: CheckCircle2 },
  rejected: { label: '已拒绝', color: 'text-red-600 bg-red-50', icon: AlertCircle },
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
  const { emptyFileState, doUpload } = useFileUpload()

  const [pIdFront, setPIdFront] = useState(emptyFileState())
  const [pIdBack, setPIdBack] = useState(emptyFileState())
  const [eIdFront, setEIdFront] = useState(emptyFileState())
  const [eIdBack, setEIdBack] = useState(emptyFileState())
  const [eBizLicense, setEBizLicense] = useState(emptyFileState())

  const [myInfo, setMyInfo] = useState<any>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [ocrStates, setOcrStates] = useState<Record<string, string>>({})

  const autoFillRef = useRef(false)

  const fetchStatus = async () => {
    try {
      const me = await get<any>('/api/v1/auth/me')
      setCurrentStatus(me.realNameStatus || 'unverified')
      setMyInfo(me)

      // 用户端查看自己的审核历史
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

        if (frontUrl) setPIdFront({ ...emptyFileState(), preview: frontUrl, uploadedPath: status.idFrontImage || '', status: 'success' })
        if (backUrl) setPIdBack({ ...emptyFileState(), preview: backUrl, uploadedPath: status.idBackImage || '', status: 'success' })
        if (frontUrl) setEIdFront({ ...emptyFileState(), preview: frontUrl, uploadedPath: status.idFrontImage || '', status: 'success' })
        if (backUrl) setEIdBack({ ...emptyFileState(), preview: backUrl, uploadedPath: status.idBackImage || '', status: 'success' })
        if (bizUrl) setEBizLicense({ ...emptyFileState(), preview: bizUrl, uploadedPath: status.businessLicense || '', status: 'success' })
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
                setPIdFront({ ...emptyFileState(), preview: url, uploadedPath: last.idFrontImage, status: 'success' })
                setEIdFront({ ...emptyFileState(), preview: url, uploadedPath: last.idFrontImage, status: 'success' })
              }
            }
            if (last.idBackImage) {
              const url = buildPreview2(last.idBackImage)
              if (url) {
                setPIdBack({ ...emptyFileState(), preview: url, uploadedPath: last.idBackImage, status: 'success' })
                setEIdBack({ ...emptyFileState(), preview: url, uploadedPath: last.idBackImage, status: 'success' })
              }
            }
            if (last.businessLicense) {
              const url = buildPreview2(last.businessLicense)
              if (url) {
                setEBizLicense({ ...emptyFileState(), preview: url, uploadedPath: last.businessLicense, status: 'success' })
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, fileType: string, setter: (s: any) => void) => {
    const f = e.target.files?.[0]
    if (!f) return
    
    const newState = await doUpload(f, fileType)
    setter(newState)
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
        <SubmittedInfoCard
          myInfo={myInfo}
          currentStatus={currentStatus}
          previewImage={previewImage}
          setPreviewImage={setPreviewImage}
          history={history}
        />
      )}

      {/* Show form only when not approved */}
      {currentStatus !== 'approved' && (
        <RealNameForm
          tab={tab}
          onTabChange={setTab}
          
          // Personal form
          pForm={pForm}
          onPFormChange={(updates) => setPForm(f => ({ ...f, ...updates }))}
          pIdFront={pIdFront}
          pIdBack={pIdBack}
          onPFileSelect={(type) => (e) => handleFileSelect(e, type === 'id_front' ? 'id_front' : 'id_back', 
            type === 'id_front' ? setPIdFront : setPIdBack)}
          onPRemoveFile={(type) => () => (type === 'id_front' ? setPIdFront : setPIdBack)(emptyFileState())}
          
          // Enterprise form
          eForm={eForm}
          onEFormChange={(updates) => setEForm(f => ({ ...f, ...updates }))}
          eIdFront={eIdFront}
          eIdBack={eIdBack}
          eBizLicense={eBizLicense}
          onEFileSelect={(type) => (e) => handleFileSelect(e, 
            type === 'id_front' ? 'id_front' : 
            type === 'id_back' ? 'id_back' : 'business_license',
            type === 'id_front' ? setEIdFront : 
            type === 'id_back' ? setEIdBack : setEBizLicense)}
          onERemoveFile={(type) => () => (
            type === 'id_front' ? setEIdFront : 
            type === 'id_back' ? setEIdBack : setEBizLicense
          )(emptyFileState())}
          
          // Common
          currentStatus={currentStatus}
          submitting={submitting}
          isImpersonating={isImpersonating}
          onSubmitPersonal={submitPersonal}
          onSubmitEnterprise={submitEnterprise}
          ocrStates={ocrStates}
        />
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