import { useState } from 'react'
import { X, ChevronRight, ChevronLeft, Key, Cpu, Activity, BarChart3, Wallet, Smile, CheckCircle2 } from 'lucide-react'

interface Step {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
  details: string[]
}

const steps: Step[] = [
  {
    icon: Smile,
    title: '欢迎来到供应商控制台',
    description: '这是 3Cloud 为 AI 模型供应商提供的专属管理平台。',
    details: [
      '在此管理您的模型、查看调用数据、监控健康状态',
      '供应商门户与平台用户端独立，专为供应商设计',
      '所有操作实时生效，无需联系平台运营',
    ],
  },
  {
    icon: Key,
    title: '设置 API Key',
    description: '您的供应商 API Key 是连接平台的核心凭证。',
    details: [
      '平台会自动为您的账号分配初始 API Key',
      '您可以在"基本信息"标签页中随时轮换 Key',
      '轮换旧 Key 后会立即失效，请及时更新配置',
    ],
  },
  {
    icon: Cpu,
    title: '添加模型',
    description: '在"模型管理"中添加您的上游模型映射。',
    details: [
      '添加上游模型名称（如 gpt-4o）和定价',
      '设置输入/输出的售价（¥/token）',
      '配置权重以控制流量分配比例',
    ],
  },
  {
    icon: Activity,
    title: '连通性测试',
    description: '系统会自动检测您的上游 API 连通性。',
    details: [
      '在"健康状态"标签页查看各模型的健康分',
      '健康分 ≥ 90 表示服务正常',
      '如果出现宕机，系统会自动触发熔断保护',
    ],
  },
  {
    icon: BarChart3,
    title: '查看数据',
    description: '实时了解您的模型调用情况和营收数据。',
    details: [
      '在"调用统计"标签页查看总调用量和营收',
      '按模型维度查看详细的调用分布',
      '数据实时更新，帮助您及时调整策略',
    ],
  },
  {
    icon: Wallet,
    title: '财务结算',
    description: '查看收益和结算信息。',
    details: [
      '在"财务中心"查看您的收益明细',
      '支持查看历史结算记录',
      '更多财务功能即将上线',
    ],
  },
]

interface Props {
  onDismiss: () => void
}

export default function VendorOnboardingGuide({ onDismiss }: Props) {
  const [currentStep, setCurrentStep] = useState(0)

  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  const handlePrev = () => {
    if (!isFirst) setCurrentStep((p) => p - 1)
  }

  const handleNext = () => {
    if (isLast) {
      onDismiss()
    } else {
      setCurrentStep((p) => p + 1)
    }
  }

  return (
    <div className="relative bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg overflow-hidden">
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 text-blue-200 hover:text-white transition z-10"
        title="关闭引导"
      >
        <X size={18} />
      </button>

      <div className="p-6 lg:p-8">
        {/* Progress dots */}
        <div className="flex items-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentStep
                  ? 'w-8 bg-white'
                  : i < currentStep
                    ? 'w-2 bg-blue-300'
                    : 'w-2 bg-blue-400/50'
              }`}
            />
          ))}
        </div>

        <div className="flex items-start gap-5">
          {/* Icon */}
          <div className="shrink-0 w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
            <step.icon size={24} className="text-white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white mb-1">
              Step {currentStep + 1}: {step.title}
            </h3>
            <p className="text-blue-100 text-sm mb-3">{step.description}</p>
            <ul className="space-y-1.5">
              {step.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-blue-50">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-blue-200" />
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-blue-500/30">
          <button
            onClick={handlePrev}
            disabled={isFirst}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition ${
              isFirst
                ? 'text-blue-300/50 cursor-not-allowed'
                : 'text-blue-100 hover:bg-white/10'
            }`}
          >
            <ChevronLeft size={16} />
            上一步
          </button>

          <span className="text-xs text-blue-200">
            {currentStep + 1} / {steps.length}
          </span>

          <button
            onClick={handleNext}
            className="flex items-center gap-1 px-4 py-1.5 bg-white text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 transition"
          >
            {isLast ? '完成引导' : '下一步'}
            {!isLast && <ChevronRight size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
