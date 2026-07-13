import { UserPlus, Key, Play } from 'lucide-react'

const STEPS = [
  {
    icon: UserPlus,
    step: '01',
    title: '注册账号',
    description: '填写邮箱完成注册，通过邮箱验证激活账号，即刻开始使用。',
  },
  {
    icon: Key,
    step: '02',
    title: '创建 API Key',
    description: '在控制台创建 API Key，安全保管您的密钥，开始调用模型。',
  },
  {
    icon: Play,
    step: '03',
    title: '开始调用',
    description: '使用 OpenAI 兼容 SDK 或直接调用 REST API，即刻体验 AI 能力。',
  },
]

export default function HowItWorks() {
  return (
    <section className="py-20 sm:py-28 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
            三步开始使用
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            简单快速，分钟级接入，无需复杂配置
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {STEPS.map((step, index) => (
            <div key={step.step} className="relative text-center">
              {/* Connector line (desktop) */}
              {index < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-px border-t-2 border-dashed border-slate-300" />
              )}

              <div className="relative z-10 mx-auto w-24 h-24 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-6">
                <step.icon size={36} className="text-blue-600" />
              </div>

              <div className="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-2">
                {step.step}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{step.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
