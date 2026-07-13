import PricingTable from '@/components/portal/PricingTable'
import PricingFaq from '@/components/portal/PricingFaq'

export default function PortalPricing() {
  return (
    <div className="py-16 sm:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">透明定价</h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            按实际 Token 消耗计费，无隐藏费用，充值即可使用
          </p>
        </div>

        {/* Pricing Table */}
        <PricingTable />

        {/* Billing Note */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <p className="text-sm text-blue-700">
            <strong>计费说明：</strong>
            按实际消耗的 Token 数量计费，输入和输出价格分开计算，精确到小数点后 6 位。
            充值后自动到账，可随时在调用日志中查看每笔请求的费用明细。
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">常见问题</h2>
          <div className="max-w-2xl mx-auto">
            <PricingFaq />
          </div>
        </div>
      </div>
    </div>
  )
}
