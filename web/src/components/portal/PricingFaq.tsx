import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const FAQS = [
  {
    q: '如何计算费用？',
    a: '按实际消耗的 Token 数量计费。费用 = 输入 Token 数 × 输入价格 + 输出 Token 数 × 输出价格，精确到小数点后 6 位。每次 API 调用后自动扣费。',
  },
  {
    q: '支持哪些支付方式？',
    a: '支持微信支付、支付宝、对公银行转账等多种方式。对公转账需上传转账凭证，由管理员审核后到账。',
  },
  {
    q: '充值后多久到账？',
    a: '在线支付即时到账。银行转账提交凭证后，一般在工作时间 1-2 小时内审核到账。',
  },
  {
    q: '有免费额度吗？',
    a: '新用户注册后赠送体验额度，可用于测试和体验平台功能。体验额度用完需充值后继续使用。',
  },
  {
    q: '如何保证服务稳定性？',
    a: '平台内置智能路由引擎，自动检测供应商健康状态，故障时自动切换备用供应商。同时支持限流、熔断等多重保障机制。',
  },
  {
    q: '是否支持开发票？',
    a: '支持。在账户中心可申请发票，提供电子发票和纸质发票两种方式，由管理员审核后开具。',
  },
]

export default function PricingFaq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      {FAQS.map((faq, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <span className="text-sm font-medium text-slate-900">{faq.q}</span>
            <ChevronDown
              size={18}
              className={`text-slate-400 transition-transform shrink-0 ml-4 ${
                openIndex === i ? 'rotate-180' : ''
              }`}
            />
          </button>
          {openIndex === i && (
            <div className="px-6 pb-4">
              <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
