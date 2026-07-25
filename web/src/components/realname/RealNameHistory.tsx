import React from 'react'
import { UserRealNameHistoryRecord } from '@/types'

interface RealNameHistoryProps {
  history: UserRealNameHistoryRecord[]
}

function RealNameHistoryComponent({ history }: RealNameHistoryProps) {
  if (history.length === 0) return null

  return (
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
  )
}

export const RealNameHistory = React.memo(RealNameHistoryComponent)

interface SubmittedInfoProps {
  myInfo: any
  currentStatus: string
  previewImage: string | null
  setPreviewImage: (url: string | null) => void
  history?: UserRealNameHistoryRecord[]
}

function SubmittedInfoCardComponent({ 
  myInfo, 
  currentStatus, 
  previewImage, 
  setPreviewImage,
  history = [] 
}: SubmittedInfoProps) {
  if (!myInfo) return null

  const statusConfig: Record<string, { label: string; color: string }> = {
    unverified: { label: '未认证', color: 'text-slate-400 bg-slate-50' },
    pending_review: { label: '审核中', color: 'text-yellow-600 bg-yellow-50' },
    approved: { label: '已认证', color: 'text-green-600 bg-green-50' },
    rejected: { label: '已拒绝', color: 'text-red-600 bg-red-50' },
  }

  const buildFileUrl = (relPath: string | null) => {
    if (!relPath) return ''
    const filename = relPath.split('/').pop() || ''
    return filename ? `/api/v1/auth/real-name/file/${filename}` : ''
  }

  return (
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
                const url = buildFileUrl(myInfo.idFrontImage)
                return url ? (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">身份证正面</p>
                    <img src={url} alt="身份证正面" className="w-36 h-24 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(url)} />
                  </div>
                ) : null
              })()}
              {myInfo.idBackImage && (() => {
                const url = buildFileUrl(myInfo.idBackImage)
                return url ? (
                  <div>
                    <p className="text-xs text-slate-400 mb-1">身份证反面</p>
                    <img src={url} alt="身份证反面" className="w-36 h-24 object-cover border rounded-lg cursor-pointer hover:opacity-80 transition" onClick={() => setPreviewImage(url)} />
                  </div>
                ) : null
              })()}
              {myInfo.businessLicense && (() => {
                const url = buildFileUrl(myInfo.businessLicense)
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
        {history.length > 0 && <RealNameHistory history={history} />}
      </div>
    </div>
  )
}

export const SubmittedInfoCard = React.memo(SubmittedInfoCardComponent)