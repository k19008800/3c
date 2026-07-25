import { useState } from 'react'
import { post } from '@/lib/api'
import type { ExportConfig } from '@/components/admin/ExportDialog'

export interface ExportResponse {
  downloadUrl: string
  filename: string
  expiresAt: string
  recordCount: number
}

export function useExport() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const exportReport = async (config: ExportConfig): Promise<ExportResponse> => {
    setLoading(true)
    setError(null)

    try {
      // 根据类型选择对应的 API 端点
      const endpoint = `/api/v1/admin/finance/export/${config.type}`
      
      const response = await post<ExportResponse>(endpoint, config)
      
      return response
    } catch (err: any) {
      const message = err.message || '导出失败，请稍后重试'
      setError(message)
      throw new Error(message)
    } finally {
      setLoading(false)
    }
  }

  const downloadFile = async (downloadUrl: string, filename: string) => {
    try {
      // 创建隐藏的下载链接并触发下载
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err: any) {
      setError(err.message || '下载失败')
      throw err
    }
  }

  const exportAndDownload = async (config: ExportConfig): Promise<ExportResponse> => {
    const response = await exportReport(config)
    
    // 构建完整下载 URL（API 返回的是相对路径）
    const baseUrl = window.location.origin
    const fullDownloadUrl = `${baseUrl}${response.downloadUrl}`
    
    await downloadFile(fullDownloadUrl, response.filename)
    
    return response
  }

  return {
    loading,
    error,
    exportReport,
    downloadFile,
    exportAndDownload,
  }
}

// 便捷函数：导出充值记录
export async function exportRechargeRecords(config: Omit<ExportConfig, 'type'>): Promise<ExportResponse> {
  const response = await post<ExportResponse>('/api/v1/admin/finance/export/recharge', {
    ...config,
    type: 'recharge',
  })
  return response
}

// 便捷函数：导出提现记录
export async function exportWithdrawRecords(config: Omit<ExportConfig, 'type'>): Promise<ExportResponse> {
  const response = await post<ExportResponse>('/api/v1/admin/finance/export/withdraw', {
    ...config,
    type: 'withdraw',
  })
  return response
}

// 便捷函数：导出佣金记录
export async function exportCommissionRecords(config: Omit<ExportConfig, 'type'>): Promise<ExportResponse> {
  const response = await post<ExportResponse>('/api/v1/admin/finance/export/commission', {
    ...config,
    type: 'commission',
  })
  return response
}

// 便捷函数：导出交易流水
export async function exportBalanceRecords(config: Omit<ExportConfig, 'type'>): Promise<ExportResponse> {
  const response = await post<ExportResponse>('/api/v1/admin/finance/export/balance', {
    ...config,
    type: 'balance',
  })
  return response
}

// 便捷函数：导出综合报表
export async function exportSummaryRecords(config: Omit<ExportConfig, 'type'>): Promise<ExportResponse> {
  const response = await post<ExportResponse>('/api/v1/admin/finance/export/summary', {
    ...config,
    type: 'summary',
  })
  return response
}