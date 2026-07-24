// FinanceCommissions 工具函数

/** 格式化金额 */
export const fmt = (v: any): string => `¥${parseFloat(String(v ?? 0)).toFixed(2)}`

/** 格式化日期 */
export const fmtDate = (date: string): string => {
  return new Date(date).toLocaleDateString('zh-CN')
}

/** 格式化百分比 */
export const fmtPercent = (value: number): string => `${(value * 100).toFixed(1)}%`

/** 生成 CSV */
export const toCSV = (headers: string[], rows: string[][]): string => {
  const bom = '\uFEFF'
  const enc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const h = headers.map(enc).join(',')
  const body = rows.map(r => r.map(enc).join(',')).join('\n')
  return bom + [h, body].join('\n')
}

/** 触发下载 */
export const triggerDownload = (content: string, filename: string): void => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 获取状态标签颜色 */
export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'settled': return 'text-green-600 bg-green-100'
    case 'pending': return 'text-yellow-600 bg-yellow-100'
    case 'cancelled': return 'text-gray-600 bg-gray-100'
    default: return 'text-gray-600 bg-gray-100'
  }
}

/** 获取类型标签 */
export const getTypeLabel = (type: string): string => {
  switch (type) {
    case 'order': return '订单'
    case 'topup': return '充值'
    case 'withdraw': return '提现'
    case 'adjust': return '调整'
    default: return type
  }
}
