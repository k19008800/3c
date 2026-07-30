import { useState, useEffect } from 'react'
import axios from 'axios'
import { Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw, Bell, Server, Database, Activity } from 'lucide-react'
import { useI18n } from '@/hooks/useI18n'

interface ServiceItem {
  name: string
  status: 'operational' | 'degraded' | 'major_outage'
  description: string
}

interface AnnouncementItem {
  id: number
  title: string
  type: string
  content: string | null
  createdAt: string
}

interface SystemStatusData {
  status: 'operational' | 'degraded' | 'major_outage'
  updatedAt: string
  services: ServiceItem[]
  announcements: AnnouncementItem[]
  stats: {
    totalUsers: number
    totalModels: number
    totalVendors: number
  }
}

const statusConfig = (t: any): Record<string, { label: string; color: string; icon: any }> => ({
  operational: { label: t('status_page.all_operational'), color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle2 },
  degraded: { label: '部分异常', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: AlertCircle },
  major_outage: { label: '服务中断', color: 'text-red-600 bg-red-50 border-red-200', icon: XCircle },
})

export default function PortalStatus() {
  const { t, isZh } = useI18n()
  const [data, setData] = useState<SystemStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchStatus = () => {
    setLoading(true)
    setError('')
    axios
      .get('/api/v1/public/status')
      .then((res) => {
        const d = res.data?.data
        if (d) setData(d)
      })
      .catch((err) => setError(err.message || '获取系统状态失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStatus() }, [])

  if (loading && !data) {
    return (
      <div className="py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin" size={32} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-12 sm:py-20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
            <AlertCircle size={18} />
            {error}
          </div>
        </div>
      </div>
    )
  }

  const cfg = statusConfig(t)
  const overallStatus = data?.status || 'operational'
  const overallCfg = cfg[overallStatus]
  const OverallIcon = overallCfg?.icon || CheckCircle2

  return (
    <div className="py-12 sm:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{t('status_page.title')}</h1>
          <p className="mt-4 text-lg text-slate-500">
            {t('status_page.vendor_status')}
          </p>
        </div>

        {/* Overall Status */}
        <div className={`rounded-xl border p-6 ${overallCfg?.color || 'bg-green-50 border-green-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {OverallIcon && <OverallIcon size={28} />}
              <div>
                <h2 className="text-xl font-semibold">{overallCfg?.label || '正常'}</h2>
                <p className="text-sm opacity-80">
                  {isZh ? '最后更新' : 'Last updated'}: {data?.updatedAt ? new Date(data.updatedAt).toLocaleString(isZh ? 'zh-CN' : 'en-US') : '—'}
                </p>
              </div>
            </div>
            <button
              onClick={fetchStatus}
              className="flex items-center gap-1.5 px-3 py-2 border border-current rounded-lg text-sm hover:opacity-80"
            >
              <RefreshCw size={14} />
              {t('common.retry')}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {data?.stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <Server size={20} className="mx-auto text-blue-500 mb-1" />
              <div className="text-2xl font-bold text-slate-800">{data.stats.totalModels}</div>
              <div className="text-xs text-slate-400">{t('stats.models')}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <Database size={20} className="mx-auto text-purple-500 mb-1" />
              <div className="text-2xl font-bold text-slate-800">{data.stats.totalVendors}</div>
              <div className="text-xs text-slate-400">{t('stats.vendors')}</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <Activity size={20} className="mx-auto text-green-500 mb-1" />
              <div className="text-2xl font-bold text-slate-800">{data.stats.totalUsers}</div>
              <div className="text-xs text-slate-400">{t('stats.users')}</div>
            </div>
          </div>
        )}

        {/* Services List */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h2 className="font-semibold text-slate-700 flex items-center gap-2">
              <Server size={16} /> {t('status_page.vendor_status')}
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(data?.services || []).map((svc, i) => {
              const sCfg = cfg[svc.status] || cfg.operational
              const SvgIcon = sCfg.icon
              return (
                <div key={i} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {SvgIcon && <SvgIcon size={16} className={sCfg.color.split(' ')[0]} />}
                    <div>
                      <span className="text-sm font-medium text-slate-700">{svc.name}</span>
                      <span className="text-xs text-slate-400 ml-2">{svc.description}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full border ${sCfg.color}`}>
                    {sCfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Announcements */}
        {(data?.announcements || []).length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                <Bell size={16} /> {isZh ? '最新公告' : 'Latest Announcements'}
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
              {data!.announcements.map((ann) => (
                <div key={ann.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      ann.type === 'maintenance'
                        ? 'bg-amber-100 text-amber-700'
                        : ann.type === 'incident'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                    }`}>
                      {ann.type === 'maintenance'
                        ? t('status_page.tag_maintenance')
                        : ann.type === 'incident'
                          ? t('status_page.tag_incident')
                          : t('status_page.tag_notice')}
                    </span>
                    <span className="text-sm font-medium text-slate-800">{ann.title}</span>
                  </div>
                  {ann.content && (
                    <p className="text-sm text-slate-600 ml-1">{ann.content}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(ann.createdAt).toLocaleString(isZh ? 'zh-CN' : 'en-US')}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}