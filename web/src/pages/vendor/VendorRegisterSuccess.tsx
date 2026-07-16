import { Link } from 'react-router-dom'
import { CheckCircle2, ArrowRight, Clock, ShieldCheck, Mail, FileCheck } from 'lucide-react'

export default function VendorRegisterSuccess() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-slate-900">
      <div className="w-full max-w-lg p-8 bg-white rounded-xl shadow-2xl">
        {/* Success Icon */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <CheckCircle2 className="text-green-500" size={36} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">注册申请已提交</h1>
          <p className="text-slate-500 mt-2 text-sm">
            感谢您申请成为 3Cloud 平台的 AI 模型供应商
          </p>
        </div>

        {/* What happens next */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-blue-800 flex items-center gap-2 mb-3">
            <Clock size={18} />
            审核流程说明
          </h3>
          <div className="space-y-3">
            {[
              {
                icon: FileCheck,
                title: '1. 提交资料',
                desc: '您的供应商信息和资质文件已成功提交至平台',
              },
              {
                icon: ShieldCheck,
                title: '2. 平台审核',
                desc: '3Cloud 运营团队将在 1-3 个工作日内审核您的申请',
              },
              {
                icon: Mail,
                title: '3. 审核结果通知',
                desc: '审核通过后，您将收到邮件通知，包含供应商 Key 和登录指引',
              },
              {
                icon: ArrowRight,
                title: '4. 开始使用',
                desc: '登录供应商门户，配置模型、管理 API Key 并查看数据',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <Icon size={18} className="text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">{title}</p>
                  <p className="text-xs text-blue-700 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Link
          to="/vendor/login"
          className="block w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-center font-medium"
        >
          返回登录页
        </Link>

        <p className="text-xs text-slate-400 text-center mt-4">
          如有疑问，请联系 support@3cloud.ai
        </p>
      </div>
    </div>
  )
}
