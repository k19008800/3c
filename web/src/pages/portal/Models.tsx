import ModelCatalog from '@/components/portal/ModelCatalog'

export default function PortalModels() {
  return (
    <div className="py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">模型目录</h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            浏览 3Cloud 支持的所有 AI 模型，按类型筛选，查看供应商和价格信息
          </p>
        </div>

        <ModelCatalog />
      </div>
    </div>
  )
}
