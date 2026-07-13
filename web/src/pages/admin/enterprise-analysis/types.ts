/* ── Enterprise Analysis 共享类型与常量 ── */

export interface EnterpriseUser {
  id: number
  email: string
  nickname: string | null
  companyName: string | null
  balance: string
  lastLoginAt: string | null
  status: string | null
}

export interface DaySeries {
  date: string
  calls: { total: number; success: number; failed: number; timeout: number; successRate: number; totalTokens: number; totalCost: string; avgDuration: number }
  newUsers: number
  revenue: { count: number; total: string }
}

export interface LowBalanceEnterprise {
  id: number
  email: string
  nickname: string | null
  companyName: string | null
  balance: string
  lastLoginAt: string | null
}

export interface EnterpriseOverview {
  totalEnterprises: number
  totalBalance: string
  monthNewEnterprises: number
  activeEnterprises: number
  monthConsumption: { totalCalls: number; totalCost: string; totalTokens: number }
  monthRecharge: { count: number; total: string }
  yesterdayConsumption: string
  lowBalanceEnterpriseCount: number
  lowBalanceEnterpriseList: LowBalanceEnterprise[]
}

export interface TopConsumer {
  userId: number
  email: string
  nickname: string | null
  userType: string
  companyName: string | null
  totalConsumption: string
  totalCalls: number
  monthConsumption: string
  balance: string
}

export interface ModelBreakdown {
  modelName: string
  displayName: string
  type: string
  totalCalls: number
  successCalls: number
  successRate: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  totalCost: string
  avgDuration: number
}

export interface BalanceTrendPoint {
  day: string
  balance: string
}

export interface FinanceEvent {
  id: number
  time: string
  type: string
  amount: string
  balanceAfter: string
  description: string | null
}

export interface RechargeEvent {
  id: number
  amount: string
  channel: string
  status: string
  time: string
}

export interface FinanceSummary {
  totalRecharge: string
  rechargeCount: number
  totalConsumption: string
  callCount: number
}

export interface FinanceData {
  balanceTrend: BalanceTrendPoint[]
  events: FinanceEvent[]
  rechargeEvents: RechargeEvent[]
  summary: FinanceSummary
}

export interface ActivityPoint {
  day: string
  count: number
}

export interface HourlyPoint {
  hour: number
  count: number
}

export interface IPPoint {
  ip: string
  count: number
}

export interface ModelRankItem {
  modelName: string | null
  count: number
  totalTokens: number
}

export interface ActivityData {
  dailyActivity: ActivityPoint[]
  hourlyDistribution: HourlyPoint[]
  ipDistribution: IPPoint[]
  modelRanking: ModelRankItem[]
}

/* ── Constants ── */
export const DIMENSIONS = [
  { key: 'calls', label: '调用量', color: '#0984e3' },
  { key: 'tokens', label: 'Token 消耗', color: '#6c5ce7' },
  { key: 'cost', label: '消费金额', color: '#00b894' },
  { key: 'successRate', label: '成功率', color: '#fdcb6e' },
] as const

export const DATE_RANGES = [
  { value: 7, label: '近 7 天' },
  { value: 14, label: '近 14 天' },
  { value: 30, label: '近 30 天' },
  { value: 90, label: '近 90 天' },
] as const

export const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: '', label: '全部', color: '' },
  { value: 'active', label: '正常', color: 'text-emerald-600 bg-emerald-50' },
  { value: 'disabled', label: '停用', color: 'text-red-600 bg-red-50' },
  { value: 'pending', label: '待审', color: 'text-amber-600 bg-amber-50' },
]

export const PIE_COLORS = ['#0984e3', '#6c5ce7', '#00b894', '#fdcb6e', '#e17055', '#00cec9', '#636e72', '#a29bfe', '#fd79a8', '#55efc4']

export const TABS = [
  { key: 'analysis', label: '调用分析', icon: 'Activity' },
  { key: 'models', label: '模型分布', icon: 'PieChart' },
  { key: 'finance', label: '财务流水', icon: 'Landmark' },
  { key: 'activity', label: '活跃记录', icon: 'MapPin' },
] as const

export const CHART_TOOLTIP_STYLE = { borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }

/* ── Helpers ── */
export function fmt(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtCompact(v: string | number): string {
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toLocaleString('zh-CN')
}

export function fmtPercent(v: number): string {
  return v.toFixed(1) + '%'
}
