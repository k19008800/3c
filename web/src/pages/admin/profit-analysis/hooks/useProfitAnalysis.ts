import { useState, useCallback } from 'react'
import { get } from '@/lib/api'
import type { ProfitData, ProfitSummary, MonthlyTrend, ModelProfitRow, LowMarginModel } from '../types'

// 后端返回类型
interface ProfitSummaryResponse {
  totalCalls: number
  totalTokens: number
  totalUserCost: string
  totalCostPrice: string
  grossProfit: string
  totalCommission: string
  modelName?: string
  vendorName?: string
}

interface ProfitTrendResponse {
  period: string
  totalCalls: number
  totalTokens: number
  totalUserCost: string
  totalCostPrice: string
  grossProfit: string
  totalCommission: string
}

interface LowMarginResponse {
  id: number
  period: string
  modelName: string
  vendorName: string
  totalUserCost: string
  totalCostPrice: string
  grossProfit: string
  grossMargin: string
}

export function useProfitAnalysis() {
  const [data, setData] = useState<ProfitData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (params: {
    startDate?: string
    endDate?: string
    vendorId?: number
  } = {}) => {
    setLoading(true)
    setError(null)
    try {
      // 从日期范围计算 period (YYYY-MM 格式)
      const startDate = params.startDate ? new Date(params.startDate) : new Date(Date.now() - 30 * 86400000)
      const endDate = params.endDate ? new Date(params.endDate) : new Date()
      
      // 生成 period 列表（月份）
      const periods: string[] = []
      const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      while (cursor <= endDate) {
        periods.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
        cursor.setMonth(cursor.getMonth() + 1)
      }
      
      // 使用最近一个月作为 period
      const currentPeriod = periods[periods.length - 1] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      const startPeriod = periods[0] || currentPeriod
      
      // 并行调用三个端点
      const [summaryRows, trendRows, lowMarginRows] = await Promise.all([
        get<ProfitSummaryResponse[]>('/api/v1/admin/finance/profit/summary', { 
          period: currentPeriod, 
          granularity: 'model' 
        }),
        get<ProfitTrendResponse[]>('/api/v1/admin/finance/profit/trend', { 
          startPeriod, 
          endPeriod: currentPeriod 
        }),
        get<LowMarginResponse[]>('/api/v1/admin/finance/profit/low-margin', {}),
      ])

      // 聚合 summary 数据
      const totalRevenue = summaryRows.reduce((sum, r) => sum + parseFloat(r.totalUserCost || '0'), 0)
      const totalCost = summaryRows.reduce((sum, r) => sum + parseFloat(r.totalCostPrice || '0'), 0)
      const totalProfit = totalRevenue - totalCost
      const marginRate = totalRevenue > 0 ? totalProfit / totalRevenue : 0

      const summary: ProfitSummary = {
        totalRevenue,
        totalCost,
        totalProfit,
        marginRate,
        revenueChange: 0, // 需要对比上期，暂设为 0
        costChange: 0,
        profitChange: 0,
        marginChange: 0,
      }

      // 转换趋势数据
      const trends: MonthlyTrend[] = trendRows.map(r => ({
        month: r.period,
        revenue: parseFloat(r.totalUserCost || '0'),
        cost: parseFloat(r.totalCostPrice || '0'),
        profit: parseFloat(r.grossProfit || '0'),
      }))

      // 转换模型数据
      const models: ModelProfitRow[] = summaryRows.map(r => {
        const revenue = parseFloat(r.totalUserCost || '0')
        const cost = parseFloat(r.totalCostPrice || '0')
        const profit = revenue - cost
        return {
          modelName: r.modelName || r.vendorName || 'Unknown',
          totalCalls: r.totalCalls,
          revenue,
          cost,
          profit,
          marginRate: revenue > 0 ? profit / revenue : 0,
        }
      })

      // 转换低毛利模型
      const lowMarginModels: LowMarginModel[] = lowMarginRows.map(r => {
        const revenue = parseFloat(r.totalUserCost || '0')
        const cost = parseFloat(r.totalCostPrice || '0')
        const profit = parseFloat(r.grossProfit || '0')
        const margin = parseFloat(r.grossMargin || '0')
        return {
          modelName: r.modelName,
          revenue,
          cost,
          profit,
          marginRate: margin,
          lossAmount: profit < 0 ? Math.abs(profit) : 0,
        }
      })

      setData({
        summary,
        trends,
        models,
        lowMarginModels,
        total: summaryRows.length,
      })
    } catch (err: any) {
      setError(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const exportReport = useCallback(async (params: {
    startDate?: string
    endDate?: string
    vendorId?: number
  }) => {
    try {
      // 使用 profit 端点的导出功能
      const startDate = params.startDate ? new Date(params.startDate) : new Date(Date.now() - 30 * 86400000)
      const period = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
      
      // 导出 CSV
      const res = await get<{ list: any[] }>('/api/v1/admin/finance/profit', { 
        period,
        pageSize: 10000 
      })
      
      if (!res.list || res.list.length === 0) {
        alert('无数据可导出')
        return
      }
      
      // 构建 CSV
      const headers = ['模型', '供应商', '调用次数', 'Token数', '用户成本', '成本价', '毛利', '毛利率']
      const rows = res.list.map((r: any) => [
        r.modelName || '',
        r.vendorName || '',
        r.totalCalls,
        r.totalTokens,
        r.totalUserCost,
        r.totalCostPrice,
        r.grossProfit,
        r.grossMargin,
      ])
      
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `profit-analysis-${period}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Export failed:', err)
      alert('导出失败: ' + (err.message || '未知错误'))
    }
  }, [])

  return {
    data,
    loading,
    error,
    loadData,
    exportReport,
  }
}
