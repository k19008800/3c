/**
 * VendorModels 工具函数
 */

import type { VendorModel } from '@/types'

/**
 * 格式化价格显示
 */
export function formatPrice(price: string | number | undefined): string {
  if (!price && price !== 0) return '-'
  const num = Number(price)
  if (num === 0) return '0'
  if (num < 0.0001) return '<0.0001'
  return num.toFixed(6)
}

/**
 * 格式化健康度显示
 */
export function formatHealthScore(score: string | number | undefined): string {
  if (!score && score !== 0) return '未知'
  const num = Number(score)
  return `${num.toFixed(0)}%`
}

/**
 * 获取健康度颜色类名
 */
export function getHealthColorClass(score: string | number | undefined): string {
  if (!score && score !== 0) return 'bg-slate-100 text-slate-500'
  const num = Number(score)
  if (num >= 80) return 'bg-green-100 text-green-700'
  if (num >= 50) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

/**
 * 获取状态显示文本
 */
export function getStatusText(status: boolean | undefined): string {
  return status ? '启用' : '禁用'
}

/**
 * 获取状态颜色类名
 */
export function getStatusColorClass(status: boolean | undefined): string {
  return status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
}

/**
 * 计算统计数据
 */
export function calculateStats(items: VendorModel[]) {
  return {
    total: items.length,
    active: items.filter(item => item.status === true).length,
    down: items.filter(item => item.isDown === true).length,
    disabled: items.filter(item => item.status === false).length,
  }
}

/**
 * 验证表单字段
 */
export function validateForm(form: {
  vendorId: string
  modelId: string
  upstreamModelName: string
  apiEndpoint: string
}): string | null {
  if (!form.vendorId) return '请选择供应商'
  if (!form.modelId) return '请选择模型'
  if (!form.upstreamModelName.trim()) return '请输入上游模型名称'
  if (!form.apiEndpoint.trim()) return '请输入API接口地址'
  
  try {
    new URL(form.apiEndpoint)
  } catch {
    return '请输入有效的URL地址'
  }
  
  return null
}