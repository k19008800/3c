import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Loader2, AlertCircle, Search, MessageSquare, Hash, Image, Headphones, ArrowLeftRight, Video, Shield, Clock } from 'lucide-react'

const TYPE_OPTIONS = [
  { value: '', label: '全部', icon: null },
  { value: 'chat', label: '对话', icon: MessageSquare },
  { value: 'embedding', label: '嵌入', icon: Hash },
  { value: 'image', label: '图像', icon: Image },
  { value: 'audio', label: '音频', icon: Headphones },
  { value: 'rerank', label: '重排序', icon: ArrowLeftRight },
  { value: 'video', label: '视频', icon: Video },
  { value: 'moderation', label: '审核', icon: Shield },
  { value: 'realtime', label: '实时', icon: Clock },
] as const

interface VendorInfo {
  vendorId: number
  vendorName: string
  inputPrice: string
  outputPrice: string
}

interface ModelCatalogItem {
  id: number
  name: string
  displayName: string | null
  description: string | null
  type: string
  vendors: VendorInfo[]
}

export default function ModelCatalog() {
  const [models, setModels] = useState<ModelCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    axios
      .get('/api/v1/models')
      .then((res) => {
        const list = res.data?.data?.list || res.data?.list || []
        setModels(list)
      })
      .catch((err) => setError(err.message || '获取模型列表失败'))
      .finally(() => setLoading(false))
  }, [])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { '': models.length }
    for (const t of TYPE_OPTIONS) {
      if (t.value) counts[t.value] = models.filter((m) => m.type === t.value).length
    }
    return counts
  }, [models])

  const filteredModels = useMemo(
    () =>
      models.filter((m) => {
        const matchTab = !activeTab || m.type === activeTab
        const matchSearch =
          !searchQuery ||
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
        return matchTab && matchSearch
      }),
    [models, activeTab, searchQuery],
  )

  const getTypeInfo = (type: string) =>
    TYPE_OPTIONS.find((t) => t.value === type)

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 bg-red-50 p-4 rounded-lg">
        <AlertCircle size={18} />
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="relative max-w-md mx-auto">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索模型名称..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Type Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1">
          {TYPE_OPTIONS.map((t) => {
            const Icon = t.icon
            const isActive = activeTab === t.value
            const count = typeCounts[t.value] || 0
            return (
              <button
                key={t.value}
                onClick={() => setActiveTab(t.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {Icon && <Icon size={14} />}
                {t.label}
                <span className={`text-xs ${isActive ? 'text-blue-400' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Model Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredModels.map((model) => {
          const typeInfo = getTypeInfo(model.type)
          const TypeIcon = typeInfo?.icon
          return (
            <div
              key={model.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-200 hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-900">{model.name}</h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                  {TypeIcon && <TypeIcon size={12} />}
                  {typeInfo?.label || model.type}
                </span>
              </div>

              {model.description && (
                <p className="text-xs text-slate-500 mb-3 leading-relaxed line-clamp-2">{model.description}</p>
              )}

              {/* Vendor pricing */}
              <div className="space-y-1.5">
                {(model.vendors || []).map((v) => (
                  <div
                    key={v.vendorId}
                    className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2"
                  >
                    <span className="font-medium text-slate-600">{v.vendorName}</span>
                    <span className="font-mono">
                      ¥{Number(v.inputPrice || 0).toFixed(6)} / ¥{Number(v.outputPrice || 0).toFixed(6)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {filteredModels.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          {searchQuery ? '未找到匹配的模型' : '暂无模型数据'}
        </div>
      )}
    </div>
  )
}
