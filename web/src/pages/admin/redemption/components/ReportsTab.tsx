import { Loader2, FileSpreadsheet, Calendar, Users, TrendingUp, Download } from 'lucide-react'

interface ReportsTabProps {
  reportPeriod: string
  reportExporting: 'monthly' | 'agent' | 'campaign' | null
  onReportPeriodChange: (value: string) => void
  onExportReport: (type: 'monthly' | 'agent' | 'campaign') => void
}

export default function ReportsTab({
  reportPeriod,
  reportExporting,
  onReportPeriodChange,
  onExportReport,
}: ReportsTabProps) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 space-y-6">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-green-500" />报表导出
        </h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">报表月份</label>
            <input 
              type="month" 
              value={reportPeriod} 
              onChange={(e) => onReportPeriodChange(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" 
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {([
            { type: 'monthly' as const, icon: Calendar, label: '月度成本报表', desc: '按费用类型汇总的月度成本数据', cls: 'border-green-200 hover:bg-green-50', icls: 'text-green-500' },
            { type: 'agent' as const, icon: Users, label: '代理成本报表', desc: '按代理维度的成本汇总报表', cls: 'border-blue-200 hover:bg-blue-50', icls: 'text-blue-500' },
            { type: 'campaign' as const, icon: TrendingUp, label: '活动维度报表', desc: '按营销活动的成本和效果数据', cls: 'border-purple-200 hover:bg-purple-50', icls: 'text-purple-500' },
          ]).map(({ type, icon: Icon, label, desc, cls, icls }) => (
            <button 
              key={type} 
              onClick={() => onExportReport(type)} 
              disabled={reportExporting === type}
              className={`flex flex-col items-center gap-3 p-6 border rounded-xl transition disabled:opacity-50 ${cls}`}
            >
              {reportExporting === type ? <Loader2 className={`animate-spin ${icls}`} size={32} /> : <Icon size={32} className={icls} />}
              <div className="text-center">
                <p className="text-sm font-medium text-slate-900">{label}</p>
                <p className="text-xs text-slate-400 mt-1">{desc}</p>
              </div>
              <span className={`text-xs flex items-center gap-1 ${icls}`}>
                <Download size={12} />下载 CSV
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}