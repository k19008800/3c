import { useState } from 'react'
import { User, Building2 } from 'lucide-react'
import { FileUploadBlock, FileState } from './RealNameUpload'

interface PersonalFormData {
  realName: string
  idNumber: string
}

interface EnterpriseFormData {
  realName: string
  idNumber: string
  companyName: string
  companyRegNumber: string
  bankName: string
  bankAccount: string
  bankAddress: string
  invoiceTitle: string
  invoiceTaxId: string
}

interface RealNameFormProps {
  tab: 'personal' | 'enterprise'
  onTabChange: (tab: 'personal' | 'enterprise') => void
  
  // Personal form
  pForm: PersonalFormData
  onPFormChange: (updates: Partial<PersonalFormData>) => void
  pIdFront: FileState
  pIdBack: FileState
  onPFileSelect: (type: 'id_front' | 'id_back') => (e: React.ChangeEvent<HTMLInputElement>) => void
  onPRemoveFile: (type: 'id_front' | 'id_back') => () => void
  
  // Enterprise form
  eForm: EnterpriseFormData
  onEFormChange: (updates: Partial<EnterpriseFormData>) => void
  eIdFront: FileState
  eIdBack: FileState
  eBizLicense: FileState
  onEFileSelect: (type: 'id_front' | 'id_back' | 'business_license') => (e: React.ChangeEvent<HTMLInputElement>) => void
  onERemoveFile: (type: 'id_front' | 'id_back' | 'business_license') => () => void
  
  // Common
  currentStatus: string
  submitting: boolean
  isImpersonating: boolean
  onSubmitPersonal: () => void
  onSubmitEnterprise: () => void
  ocrStates?: Record<string, string>
}

export function RealNameForm({
  tab,
  onTabChange,
  pForm,
  onPFormChange,
  pIdFront,
  pIdBack,
  onPFileSelect,
  onPRemoveFile,
  eForm,
  onEFormChange,
  eIdFront,
  eIdBack,
  eBizLicense,
  onEFileSelect,
  onERemoveFile,
  currentStatus,
  submitting,
  isImpersonating,
  onSubmitPersonal,
  onSubmitEnterprise,
  ocrStates = {}
}: RealNameFormProps) {
  const isPendingReview = currentStatus === 'pending_review'

  return (
    <>
      {/* Tab selector */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        <button 
          onClick={() => onTabChange('personal')} 
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition ${tab === 'personal' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
        >
          <User size={16} /> 个人认证
        </button>
        <button 
          onClick={() => onTabChange('enterprise')} 
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition ${tab === 'enterprise' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
        >
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
              <input 
                type="text" 
                value={pForm.realName} 
                onChange={e => onPFormChange({ realName: e.target.value })}
                placeholder="请输入与身份证一致的姓名"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isPendingReview} 
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">身份证号 *</label>
              <input 
                type="text" 
                value={pForm.idNumber} 
                onChange={e => onPFormChange({ idNumber: e.target.value })}
                placeholder="18 位身份证号码"
                maxLength={18}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                disabled={isPendingReview} 
              />
            </div>
          </div>

          {/* 证件上传 */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-slate-700 mb-3">上传证件照片</h4>
            <p className="text-xs text-slate-400 mb-3">支持 JPG / PNG 格式，建议单张不超过 5MB</p>
            <div className="grid grid-cols-2 gap-4">
              <FileUploadBlock
                label="身份证正面"
                hint="人像面"
                accept="image/*"
                state={pIdFront}
                disabled={isPendingReview}
                onSelect={onPFileSelect('id_front')}
                onRemove={onPRemoveFile('id_front')}
              />
              <FileUploadBlock
                label="身份证反面"
                hint="国徽面"
                accept="image/*"
                state={pIdBack}
                disabled={isPendingReview}
                onSelect={onPFileSelect('id_back')}
                onRemove={onPRemoveFile('id_back')}
              />
            </div>
          </div>

          {!isPendingReview && !isImpersonating && (
            <button 
              onClick={onSubmitPersonal} 
              disabled={submitting}
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {submitting && <span className="animate-spin mr-2">↻</span>}
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
                <input 
                  type="text" 
                  value={eForm.realName} 
                  onChange={e => onEFormChange({ realName: e.target.value })} 
                  placeholder="法人或经办人" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  disabled={isPendingReview} 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">身份证号 *</label>
                <input 
                  type="text" 
                  value={eForm.idNumber} 
                  onChange={e => onEFormChange({ idNumber: e.target.value })} 
                  placeholder="18 位" 
                  maxLength={18} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" 
                  disabled={isPendingReview} 
                />
              </div>
            </div>

            <h4 className="text-sm font-medium text-slate-600 border-b pb-1 mt-4">企业资质</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm text-slate-600 mb-1">企业名称 *</label>
                <input 
                  type="text" 
                  value={eForm.companyName} 
                  onChange={e => onEFormChange({ companyName: e.target.value })} 
                  placeholder="营业执照上的企业全称" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  disabled={isPendingReview} 
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm text-slate-600 mb-1">统一社会信用代码 *</label>
                <input 
                  type="text" 
                  value={eForm.companyRegNumber} 
                  onChange={e => onEFormChange({ companyRegNumber: e.target.value })} 
                  placeholder="18 位统一信用代码" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" 
                  disabled={isPendingReview} 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">开户行</label>
                <input 
                  type="text" 
                  value={eForm.bankName} 
                  onChange={e => onEFormChange({ bankName: e.target.value })} 
                  placeholder="例如：中国银行北京分行" 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" 
                  disabled={isPendingReview} 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">银行账号</label>
                <input 
                  type="text" 
                  value={eForm.bankAccount} 
                  onChange={e => onEFormChange({ bankAccount: e.target.value })} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" 
                  disabled={isPendingReview} 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">银行地址</label>
                <input 
                  type="text" 
                  value={eForm.bankAddress} 
                  onChange={e => onEFormChange({ bankAddress: e.target.value })} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" 
                  disabled={isPendingReview} 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">发票抬头</label>
                <input 
                  type="text" 
                  value={eForm.invoiceTitle} 
                  onChange={e => onEFormChange({ invoiceTitle: e.target.value })} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" 
                  disabled={isPendingReview} 
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">发票税号</label>
                <input 
                  type="text" 
                  value={eForm.invoiceTaxId} 
                  onChange={e => onEFormChange({ invoiceTaxId: e.target.value })} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" 
                  disabled={isPendingReview} 
                />
              </div>
            </div>
          </div>

          {/* 证件上传 */}
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
                  disabled={isPendingReview}
                  onSelect={onEFileSelect('id_front')}
                  onRemove={onERemoveFile('id_front')}
                />
                {ocrStates?.eIdFront === 'recognizing' && (
                  <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                    <span className="animate-spin">↻</span> 识别中
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
                  disabled={isPendingReview}
                  onSelect={onEFileSelect('id_back')}
                  onRemove={onERemoveFile('id_back')}
                />
                {ocrStates?.eIdBack === 'recognizing' && (
                  <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                    <span className="animate-spin">↻</span> 识别中
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
                  disabled={isPendingReview}
                  onSelect={onEFileSelect('business_license')}
                  onRemove={onERemoveFile('business_license')}
                />
                {ocrStates?.eBizLicense === 'recognizing' && (
                  <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                    <span className="animate-spin">↻</span> 识别中
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

          {!isPendingReview && !isImpersonating && (
            <button 
              onClick={onSubmitEnterprise} 
              disabled={submitting}
              className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
            >
              {submitting && <span className="animate-spin mr-2">↻</span>}
              提交企业实名
            </button>
          )}
        </div>
      )}
    </>
  )
}