export interface AutoRule {
  id: number
  name: string
  description: string | null
  eventType: string
  countThreshold: number
  timeWindowSeconds: number
  action: string
  actionParams: Record<string, any>
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface RuleFormData {
  name: string
  description: string
  eventType: string
  countThreshold: number
  timeWindowSeconds: number
  action: string
  actionParams: string
  enabled: boolean
}

export interface RuleStats {
  total: number
  enabled: number
  disabled: number
  banActions: number
  notifyActions: number
}

export const EVENT_TYPES = [
  { value: 'login_failed', label: '登录失败' },
  { value: 'brute_force', label: '暴力破解' },
  { value: 'unusual_ip', label: '异常IP' },
  { value: 'multi_device', label: '多设备登录' },
  { value: 'suspicious_operation', label: '可疑操作' },
  { value: 'api_abuse', label: 'API滥用' },
] as const

export const ACTIONS = [
  { value: 'ban_ip', label: '封禁IP' },
  { value: 'ban_user', label: '封禁用户' },
  { value: 'notify_admin', label: '通知管理员' },
  { value: 'limit_login', label: '限制登录' },
] as const

export const FALLBACK_EVENT_LABEL = '未知事件'
export const FALLBACK_ACTION_LABEL = '未知动作'

export function eventTypeLabel(value: string): string {
  return EVENT_TYPES.find((e) => e.value === value)?.label ?? FALLBACK_EVENT_LABEL
}

export function actionLabel(value: string): string {
  return ACTIONS.find((a) => a.value === value)?.label ?? FALLBACK_ACTION_LABEL
}

export const emptyForm: RuleFormData = {
  name: '',
  description: '',
  eventType: 'login_failed',
  countThreshold: 5,
  timeWindowSeconds: 300,
  action: 'notify_admin',
  actionParams: '{}',
  enabled: true,
}
