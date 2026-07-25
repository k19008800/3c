import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CurrencyTooltip } from './Tooltips'
import { Loader2 } from 'lucide-react'
import { VendorStatItem } from './types'

interface VendorBreakdownCardProps {
  vendorStats: VendorStatItem[]
  loadingVendors: boolean
}

export default function VendorBreakdownCard({ vendorStats, loadingVendors }: VendorBreakdownCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity size={16} className="text-green-500" />按供应商统计排行
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loadingVendors ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : vendorStats.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendorStats.slice(0, 10)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `¥${v}`} />
                <YAxis type="category" dataKey="vendorName" tick={{ fontSize: 10 }} width={70} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="totalCost" fill="#10B981" name="花费" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-400">暂无数据</div>
        )}
      </CardContent>
    </Card>
  )
}