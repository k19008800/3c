import { useCallback } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import api from '@/lib/api'
import RegistrationForm from './vendor-register/RegistrationForm'
import type { RegisterForm } from './vendor-register/types'

export default function VendorRegister() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()

  if (isAuthenticated) {
    return <Navigate to="/vendor/dashboard" replace />
  }

  const handleRegister = useCallback(
    async (form: RegisterForm): Promise<string | null> => {
      try {
        const body: Record<string, any> = {
          vendorName: form.vendorName.trim(),
          companyName: form.companyName.trim(),
          baseUrl: form.baseUrl.trim(),
          contactName: form.contactName.trim(),
          contactPhone: form.contactPhone.trim(),
          contactEmail: form.contactEmail.trim(),
          password: form.password,
          description: form.description.trim(),
          serviceCertification: form.serviceCertification.trim(),
        }

        let res
        if (form.businessLicense) {
          const fd = new FormData()
          Object.entries(body).forEach(([k, v]) => fd.append(k, v))
          fd.append('businessLicense', form.businessLicense)
          res = await api.post('/api/vendor/register', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        } else {
          res = await api.post('/api/vendor/register', body)
        }

        if (res.data.code !== 0) {
          return res.data.message || '注册失败'
        }

        navigate('/vendor/register-success')
        return null
      } catch (err: any) {
        return err?.response?.data?.message || err.message || '注册失败，请重试'
      }
    },
    [navigate],
  )

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900 py-12">
      <div className="w-full max-w-2xl p-8 bg-white rounded-xl shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-blue-600 mb-4">
            <span className="text-2xl font-bold text-white">3C</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">供应商注册</h1>
          <p className="text-slate-500 mt-1 text-sm">
            加入 3Cloud 平台，成为 AI 模型供应商
          </p>
        </div>

        <RegistrationForm onRegister={handleRegister} />
      </div>
    </div>
  )
}
