// ── 请求记录（RequestRecords）共享类型 ──

/** 风险等级 */
export type RiskLevel = 'normal' | 'suspicious' | 'high_risk'

/** 请求记录列表项 */
export interface RequestRecordItem {
  id: number
  userId: number
  userEmail: string
  modelName: string
  vendorName: string
  /** 请求体大小（字节） */
  requestSize: number
  /** 响应状态 */
  status: 'success' | 'failed' | 'timeout' | 'cancelled'
  /** 风险等级 */
  riskLevel: RiskLevel
  /** 风险标签 */
  riskTags: string[]
  /** 风险原因 */
  riskReason: string | null
  /** 人工审核等级（可能为 null） */
  reviewLevel: RiskLevel | null
  /** 审核备注 */
  reviewNote: string | null
  /** 审核人 */
  reviewedBy: string | null
  /** 审核时间 */
  reviewedAt: string | null
  /** 关联的调用日志 ID */
  callLogId: number | null
  createdAt: string
}

/** 请求记录详情 */
export interface RequestRecordDetail extends RequestRecordItem {
  /** 请求体完整内容 */
  requestBody: any
  /** 响应体完整内容 */
  responseBody: any
  /** 请求头 */
  requestHeaders: Record<string, string>
  /** 客户端 IP */
  clientIp: string
  /** 耗时时长（ms） */
  durationMs: number
  /** prompt token 数 */
  promptTokens: number
  /** completion token 数 */
  completionTokens: number
  /** 总 token 数 */
  totalTokens: number
  /** 消费金额 */
  cost: string
}

/** 用户请求分析 — 统计概览 */
export interface UserRequestStats {
  totalRequests: number
  highRiskRequests: number
  todayRequests: number
  activeModels: number
  requestsByDay: Array<{ date: string; count: number }>
  requestsByHour: Array<{ hour: number; count: number }>
  modelDistribution: Array<{ modelName: string; count: number }>
  riskTrend: Array<{ date: string; highRisk: number }>
  categoryDistribution: Array<{ category: string; count: number }>
}

/** 请求内容分类枚举 */
export type ContentCategory = '代码生成' | '文本创作' | '数据分析' | '翻译' | '其他'

/** Token 排名项 */
export interface TokenRankingItem {
  rank: number
  userId: number
  email: string
  nickname: string | null
  totalTokens: number
  totalCalls: number
  avgTokensPerCall: number
  totalCost: string
}

/** 风险等级选项 */
export const RISK_LEVEL_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'normal', label: '正常' },
  { value: 'suspicious', label: '可疑' },
  { value: 'high_risk', label: '高风险' },
] as const

/** 内容分类关键词映射 */
export const CATEGORY_KEYWORDS: Record<ContentCategory, string[]> = {
  '代码生成': ['function', 'class', 'import', 'export', '代码', '编程', 'algorithm', 'sort', 'array', 'loop', 'debug', 'fix', 'bug', 'implement', '写一个', '实现'],
  '文本创作': ['write', 'story', '文章', '作文', '创作', '写一篇', 'poem', 'poetry', 'essay', 'novel', '写作', 'content', 'blog', '文案'],
  '数据分析': ['analyze', '分析', '数据', 'chart', '统计', 'plot', 'graph', 'visualization', 'regression', 'classification', 'dataset', 'dataframe', 'csv', 'json', '计算'],
  '翻译': ['translate', '翻译', '翻成', 'convert', 'translation', '中文', 'english', '日语', '法语', '德语', '韩语'],
  '其他': [],
}

/** 格式化请求体大小 */
export function fmtRequestSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`
  return `${bytes}B`
}

/** 格式化 Token 数 */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString()
}

/** 格式化金额 */
export function fmtCost(cost: string | number): string {
  const n = typeof cost === 'string' ? parseFloat(cost) : cost
  if (isNaN(n)) return '￥0'
  if (n < 0.01) return `￥${n.toFixed(6)}`
  return `￥${n.toFixed(2)}`
}