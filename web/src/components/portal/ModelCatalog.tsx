import { useEffect, useState, useMemo } from 'react'
import axios from 'axios'
import { Loader2, AlertCircle, Search, MessageSquare, Hash, Image, Headphones, ArrowLeftRight, Video, Shield, Clock } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

const TYPE_OPTIONS = (t: any) => [
  { value: '', label: t('common.all'), icon: null },
  { value: 'chat', label: t('models_page.type_chat'), icon: MessageSquare },
  { value: 'embedding', label: t('models_page.type_embedding'), icon: Hash },
  { value: 'image', label: t('models_page.type_image'), icon: Image },
  { value: 'audio', label: t('models_page.type_audio'), icon: Headphones },
  { value: 'rerank', label: t('models_page.type_rerank'), icon: ArrowLeftRight },
  { value: 'video', label: t('models_page.type_video'), icon: Video },
  { value: 'moderation', label: t('models_page.type_moderation'), icon: Shield },
  { value: 'realtime', label: t('models_page.type_realtime'), icon: Clock },
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
  const { t } = useI18n()
  const [models, setModels] = useState<ModelCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const typeOptions = TYPE_OPTIONS(t)

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
    for (const opt of typeOptions) {
      if (opt.value) counts[opt.value] = models.filter((m) => m.type === opt.value).length
    }
    return counts
  }, [models, typeOptions])

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
    typeOptions.find((opt) => opt.value === type)

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
          placeholder={t('models_page.search_placeholder')}
          className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {/* Type Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1">
          {typeOptions.map((opt) => {
            const Icon = opt.icon
            const isActive = activeTab === opt.value
            const count = typeCounts[opt.value] || 0
            return (
              <button
                key={opt.value}
                onClick={() => setActiveTab(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {Icon && <Icon size={14} />}
                {opt.label}
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
          {searchQuery ? t('models_page.no_results') : t('common.no_data')}
        </div>
      )}
    </div>
  )
}
