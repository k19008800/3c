import { useState, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, AlertCircle, Eye, EyeOff, Upload } from 'lucide-react'
import AgreementSection from './AgreementSection'
import type { RegisterForm, FormErrors } from './types'

interface Props {
  onRegister: (form: RegisterForm) => Promise<string | null>
}

export default function RegistrationForm({ onRegister }: Props) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [form, setForm] = useState<RegisterForm>({
    vendorName: '',
    companyName: '',
    baseUrl: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    password: '',
    confirmPassword: '',
    description: '',
    businessLicense: null,
    serviceCertification: '',
  })

  const updateField = useCallback((field: keyof RegisterForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const validate = useCallback((): boolean => {
    const errors: FormErrors = {}
    if (!form.vendorName.trim()) errors.vendorName = '请输入供应商名称'
    if (!form.baseUrl.trim()) errors.baseUrl = '请输入 API 基础地址'
    if (!form.contactName.trim()) errors.contactName = '请输入联系人姓名'
    if (!form.contactPhone.trim()) {
      errors.contactPhone = '请输入联系电话'
    } else if (!/^1\d{10}$/.test(form.contactPhone.trim())) {
      errors.contactPhone = '请输入有效的手机号码'
    }
    if (!form.contactEmail.trim()) {
      errors.contactEmail = '请输入联系邮箱'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      errors.contactEmail = '请输入有效的邮箱地址'
    }
    if (!form.password) {
      errors.password = '请输入密码'
    } else if (form.password.length < 8) {
      errors.password = '密码长度至少为 8 位'
    }
    if (!form.confirmPassword) {
      errors.confirmPassword = '请确认密码'
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = '两次输入的密码不一致'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [form])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      setError('')
      if (!validate()) return
      setLoading(true)
      try {
        const serverError = await onRegister(form)
        if (serverError) {
          setError(serverError)
        }
      } catch {
        // onRegister should handle its own errors
      } finally {
        setLoading(false)
      }
    },
    [form, validate, onRegister],
  )

  const inputClass = useCallback(
    (field: string) =>
      `w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm ${
        fieldErrors[field] ? 'border-red-300 bg-red-50' : 'border-slate-300'
      }`,
    [fieldErrors],
  )

  const labelClass = useMemo(() => 'block text-sm font-medium text-slate-700 mb-1', [])

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-100">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Basic Info */}
      <fieldset className="border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-slate-700 px-2">基本信息</legend>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              供应商名称 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.vendorName}
              onChange={(e) => updateField('vendorName', e.target.value)}
              placeholder="如: OspreyAI"
              className={inputClass('vendorName')}
            />
            {fieldErrors.vendorName && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.vendorName}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>公司全称</label>
            <input
              type="text"
              value={form.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              placeholder="如: 枭毅科技有限公司"
              className={inputClass('companyName')}
            />
          </div>

          <div>
            <label className={labelClass}>
              API 基础地址 <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={form.baseUrl}
              onChange={(e) => updateField('baseUrl', e.target.value)}
              placeholder="https://api.ospreyai.com"
              className={inputClass('baseUrl')}
            />
            {fieldErrors.baseUrl && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.baseUrl}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>描述</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="简述您的服务特点、支持的模型等"
              rows={3}
              className={inputClass('description')}
            />
          </div>
        </div>
      </fieldset>

      {/* Contact Info */}
      <fieldset className="border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-slate-700 px-2">联系方式</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              联系人姓名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.contactName}
              onChange={(e) => updateField('contactName', e.target.value)}
              placeholder="姓名"
              className={inputClass('contactName')}
            />
            {fieldErrors.contactName && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.contactName}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              联系电话 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={form.contactPhone}
              onChange={(e) => updateField('contactPhone', e.target.value)}
              placeholder="手机号码"
              className={inputClass('contactPhone')}
            />
            {fieldErrors.contactPhone && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.contactPhone}</p>
            )}
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>
              联系邮箱 <span className="text-red-500">*</span>
              <span className="text-xs text-slate-400 ml-1">（将作为登录账号）</span>
            </label>
            <input
              type="email"
              value={form.contactEmail}
              onChange={(e) => updateField('contactEmail', e.target.value)}
              placeholder="vendor@company.com"
              className={inputClass('contactEmail')}
            />
            {fieldErrors.contactEmail && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.contactEmail}</p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Password */}
      <fieldset className="border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-slate-700 px-2">账号密码</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              密码 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                placeholder="至少 8 位"
                className={`${inputClass('password')} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.password}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>
              确认密码 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={(e) => updateField('confirmPassword', e.target.value)}
                placeholder="再次输入密码"
                className={`${inputClass('confirmPassword')} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="text-xs text-red-500 mt-1">{fieldErrors.confirmPassword}</p>
            )}
          </div>
        </div>
      </fieldset>

      {/* Documents */}
      <fieldset className="border border-slate-200 rounded-lg p-4">
        <legend className="text-sm font-semibold text-slate-700 px-2">资质文件（可选）</legend>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>营业执照</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 border-dashed rounded-lg cursor-pointer hover:bg-slate-50 transition text-sm text-slate-500">
                <Upload size={16} />
                {form.businessLicense ? form.businessLicense.name : '上传营业执照'}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) updateField('businessLicense', file)
                  }}
                />
              </label>
              {form.businessLicense && (
                <button
                  type="button"
                  onClick={() => updateField('businessLicense', null)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  移除
                </button>
              )}
            </div>
          </div>

          <div>
            <label className={labelClass}>服务资质说明</label>
            <textarea
              value={form.serviceCertification}
              onChange={(e) => updateField('serviceCertification', e.target.value)}
              placeholder="如: 拥有自有算力、GPU 集群等"
              rows={2}
              className={inputClass('serviceCertification')}
            />
          </div>
        </div>
      </fieldset>

      <AgreementSection agreed={agreed} onChange={setAgreed} />

      <button
        type="submit"
        disabled={loading || !agreed}
        className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2 font-medium"
      >
        {loading && <Loader2 className="animate-spin" size={18} />}
        提交注册申请
      </button>

      <div className="text-center">
        <p className="text-sm text-slate-500">
          已有供应商账号？{' '}
          <Link to="/vendor/login" className="text-blue-600 hover:text-blue-700 font-medium hover:underline">
            立即登录
          </Link>
        </p>
      </div>
    </form>
  )
}
