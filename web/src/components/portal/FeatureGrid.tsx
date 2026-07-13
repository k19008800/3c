import { Zap, Route, DollarSign, Layers, Shield, Key } from 'lucide-react'

const FEATURES = [
  {
    icon: Zap,
    title: '统一 API 接入',
    description: '只需一个 API Key 即可访问所有模型，完全兼容 OpenAI SDK，分钟级快速接入。',
  },
  {
    icon: Route,
    title: '智能路由调度',
    description: '自动选择最低价格或最优性能的供应商，支持加权路由和自动故障切换。',
  },
  {
    icon: DollarSign,
    title: '透明按量计费',
    description: '按实际 Token 消耗计费，精确到小数点后 6 位，清晰的消费明细和调用日志。',
  },
  {
    icon: Layers,
    title: '多厂商聚合',
    description: '深度整合 DeepSeek、OpenAI、Anthropic 等国内外 AI 厂商，持续扩展中。',
  },
  {
    icon: Shield,
    title: '企业级安全',
    description: '多种限流策略、熔断保护、安全事件监控，为您的业务提供可靠保障。',
  },
  {
    icon: Key,
    title: 'API Key 管理',
    description: '灵活创建和管理 API Key，支持用量统计、额度限制，团队共享更便捷。',
  },
]

export default function FeatureGrid() {
  return (
    <section className="py-20 sm:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">
            为什么选择 3Cloud
          </h2>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            我们致力于为开发者提供最简单、最高效的 AI 模型接入体验
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-200 hover:shadow-lg transition-all"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
                <feature.icon size={22} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
