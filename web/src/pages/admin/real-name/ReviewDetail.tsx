// ──────────────────────────────────────────────
//  ReviewDetail — 审核详情弹窗
//  OCR 识别摘要 / 个人信息 / 企业信息 / 审核操作 / 图片预览
// ──────────────────────────────────────────────

import { useMemo } from 'react'
import {
  Building2, User, FileImage, CheckCircle2, XCircle,
} from 'lucide-react'
import {
  STATUS_TABS, STATUS_LABEL, USER_TYPE_LABEL, REJECT_REASONS, buildAdminFileUrl,
} from './types'
import type { ReviewDetailProps } from './types'

function IdCardInfo({
  selected,
  imgErrors,
  onImageError,
  onPreview,
}: {
  selected: any
  imgErrors: Record<string, boolean>
  onImageError: (key: string) => void
  onPreview: (url: string) => void
}) {
  const docs = useMemo(() => {
    const items: { key: string; label: string; url: string | null }[] = []
    const frontUrl = buildAdminFileUrl(selected.userId, selected.idFrontImage)
    if (frontUrl) items.push({ key: 'idFront', label: '身份证正面', url: frontUrl })
    const backUrl = buildAdminFileUrl(selected.userId, selected.idBackImage)
    if (backUrl) items.push({ key: 'idBack', label: '身份证反面', url: backUrl })
    if (selected.userType === 'enterprise' && selected.businessLicense) {
      const bizUrl = buildAdminFileUrl(selected.userId, selected.businessLicense)
      if (bizUrl) items.push({ key: 'bizLicense', label: '营业执照', url: bizUrl })
    }
    return items
  }, [selected])

  if (docs.length === 0) return null

  return (
    <div className="border-t pt-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1">
        <FileImage size={14} /> 上传的证件附件
      </h3>
      <div className="flex flex-wrap gap-4">
        {docs.map(({ key, label, url }) => (
          <div key={key}>
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            {imgErrors[key] ? (
              <div className="w-48 h-32 flex flex-col items-center justify-center bg-slate-100 border rounded-lg">
                <FileImage size={20} className="text-slate-400" />
                <span className="text-xs text-slate-400 mt-1">加载失败</span>
              </div>
            ) : (
              <img
                src={url!}
                alt={label}
                className="w-48 h-32 object-contain border rounded-lg cursor-pointer hover:opacity-80 transition bg-slate-50"
                onError={() => onImageError(key)}
                onClick={() => onPreview(url!)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function OcrSection({ selected }: { selected: any }) {
  const ocr = selected.ocrResult
  if (!ocr) return null

  const compare = (field: string | null, ocrField: string | null) => {
    if (!field || !ocrField) return null
    return field === ocrField
      ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
      : <XCircle size={14} className="text-red-500 shrink-0" />
  }

  return (
    <div className="border rounded-lg p-4 bg-blue-50/30 space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1">
        <FileImage size={14} /> 📸 OCR 识别结果
      </h3>
      {ocr.id_front && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {ocr.id_front.name && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">姓名：</span>
              <span className="font-medium">{ocr.id_front.name}</span>
              {compare(selected.realName, ocr.id_front.name)}
            </div>
          )}
          {ocr.id_front.idNumber && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">身份证号：</span>
              <span className="font-mono text-xs">{ocr.id_front.idNumber}</span>
              {compare(selected.idNumber, ocr.id_front.idNumber)}
            </div>
          )}
          {ocr.id_front.gender && <div><span className="text-slate-500">性别：</span>{ocr.id_front.gender}</div>}
          {ocr.id_front.nationality && <div><span className="text-slate-500">民族：</span>{ocr.id_front.nationality}</div>}
          {ocr.id_front.birthDate && <div><span className="text-slate-500">出生日期：</span>{ocr.id_front.birthDate}</div>}
          {ocr.id_front.address && <div className="col-span-2"><span className="text-slate-500">住址：</span>{ocr.id_front.address}</div>}
        </div>
      )}
      {ocr.id_back && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-t border-blue-100 pt-2 mt-1">
          {ocr.id_back.issuedBy && <div><span className="text-slate-500">签发机关：</span>{ocr.id_back.issuedBy}</div>}
          {ocr.id_back.validDate && <div><span className="text-slate-500">有效期：</span>{ocr.id_back.validDate}</div>}
        </div>
      )}
      {ocr.business_license && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-t border-blue-100 pt-2 mt-1">
          {ocr.business_license.companyName && (
            <div className="col-span-2 flex items-center gap-1.5">
              <span className="text-slate-500">企业名称：</span>
              <span className="font-medium">{ocr.business_license.companyName}</span>
              {compare(selected.companyName, ocr.business_license.companyName)}
            </div>
          )}
          {ocr.business_license.regNumber && (
            <div className="col-span-2 flex items-center gap-1.5">
              <span className="text-slate-500">统一信用代码：</span>
              <span className="font-mono text-xs">{ocr.business_license.regNumber}</span>
              {compare(selected.companyRegNumber, ocr.business_license.regNumber)}
            </div>
          )}
          {ocr.business_license.legalPerson && (
            <div className="col-span-2"><span className="text-slate-500">法定代表人：</span>{ocr.business_license.legalPerson}</div>
          )}
          {ocr.business_license.registeredCapital && <div><span className="text-slate-500">注册资本：</span>{ocr.business_license.registeredCapital}</div>}
          {ocr.business_license.establishedDate && <div><span className="text-slate-500">成立日期：</span>{ocr.business_license.establishedDate}</div>}
          {ocr.business_license.validPeriod && <div><span className="text-slate-500">营业期限：</span>{ocr.business_license.validPeriod}</div>}
          {ocr.business_license.address && <div className="col-span-2"><span className="text-slate-500">注册地址：</span>{ocr.business_license.address}</div>}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-slate-400 border-t border-blue-100 pt-2 mt-1">
        {ocr.id_front && <span>身份证置信度：{Math.round(ocr.id_front.confidence * 100)}%</span>}
        {ocr.business_license && <span>营业执照置信度：{Math.round(ocr.business_license.confidence * 100)}%</span>}
      </div>
    </div>
  )
}

function ReviewActions({
  rejectReason, onApprove, onReject, onRejectReasonChange,
}: {
  rejectReason: string
  onApprove: () => void
  onReject: () => void
  onRejectReasonChange: (r: string) => void
}) {
  return (
    <div className="border-t pt-4 space-y-3">
      <h3 className="text-sm font-medium text-slate-700">审核操作</h3>
      <div className="flex gap-3">
        <button
          onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium"
        >
          <CheckCircle2 size={16} /> 通过认证
        </button>
        <button
          onClick={onReject}
          className="flex-1 flex items-center justify-center gap-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm font-medium"
        >
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
              onClick={() => onRejectReasonChange(reason)}
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
        <textarea
          value={rejectReason}
          onChange={e => onRejectReasonChange(e.target.value)}
          placeholder="输入拒绝原因，用户将收到此信息，也可点击上方预设模板"
          rows={2}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
    </div>
  )
}

export default function ReviewDetail({
  record, open, activeTab, rejectReason, imgErrors,
  onClose, onApprove, onReject, onRejectReasonChange, onImageError, onPreviewImage,
}: ReviewDetailProps) {
  if (!open || !record) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              {record.userType === 'enterprise' ? <Building2 size={20} /> : <User size={20} />}
              实名审核详情
              <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                STATUS_TABS.find(t => t.key === record.status)?.color || ''
              }`}>
                {STATUS_LABEL[record.status] || record.status}
              </span>
              <span className="text-xs text-slate-400 ml-2">v{record.version}</span>
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
          </div>

          {/* User Info */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-lg">
            <div><span className="text-slate-500">用户ID：</span>{record.userId}</div>
            <div><span className="text-slate-500">邮箱：</span>{record.email}</div>
            <div><span className="text-slate-500">昵称：</span>{record.nickname || '-'}</div>
            <div><span className="text-slate-500">类型：</span>{USER_TYPE_LABEL[record.userType] || record.userType}</div>
          </div>

          {/* OCR */}
          <OcrSection selected={record} />

          {/* Personal Info */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
              <User size={14} /> 个人信息
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">真实姓名：</span>{record.realName || '-'}</div>
              <div><span className="text-slate-500">身份证号：</span><span className="font-mono">{record.idNumber || '-'}</span></div>
            </div>
            <IdCardInfo
              selected={record}
              imgErrors={imgErrors}
              onImageError={onImageError}
              onPreview={onPreviewImage}
            />
          </div>

          {/* Enterprise Info */}
          {record.userType === 'enterprise' && (
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                <Building2 size={14} /> 企业信息
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">企业名称：</span>{record.companyName || '-'}</div>
                <div><span className="text-slate-500">统一信用代码：</span>{record.companyRegNumber || '-'}</div>
                <div><span className="text-slate-500">开户行：</span>{record.bankName || '-'}</div>
                <div><span className="text-slate-500">银行账号：</span>{record.bankAccount || '-'}</div>
                <div><span className="text-slate-500">银行地址：</span>{record.bankAddress || '-'}</div>
                <div><span className="text-slate-500">发票抬头：</span>{record.invoiceTitle || '-'}</div>
                <div><span className="text-slate-500">税号：</span>{record.invoiceTaxId || '-'}</div>
              </div>
            </div>
          )}

          {/* Reject Reason */}
          {record.status === 'rejected' && record.rejectReason && (
            <div className="p-3 bg-red-50 rounded-lg text-sm text-red-700">
              <strong>拒绝原因：</strong>{record.rejectReason}
            </div>
          )}

          {/* Review actions */}
          {activeTab === 'pending_review' && (
            <ReviewActions
              rejectReason={rejectReason}
              onApprove={onApprove}
              onReject={onReject}
              onRejectReasonChange={onRejectReasonChange}
            />
          )}

          {/* Timestamps */}
          <div className="text-xs text-slate-400 border-t pt-3 flex justify-between">
            <span>提交时间：{record.createdAt ? new Date(record.createdAt).toLocaleString('zh-CN') : '-'}</span>
            {record.reviewedAt && <span>审核时间：{new Date(record.reviewedAt).toLocaleString('zh-CN')}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
