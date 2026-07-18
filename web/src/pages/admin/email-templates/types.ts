export interface EmailTemplate {
  id: number
  name: string
  subjectZh: string
  subjectEn: string
  bodyHtmlZh: string
  bodyHtmlEn: string
  updatedAt: string | null
}

export interface EditForm {
  subjectZh: string
  subjectEn: string
  bodyHtmlZh: string
  bodyHtmlEn: string
}

export const TEMPLATE_LABELS: Record<string, string> = {
  register_verify: '注册验证',
  password_reset: '密码重置',
  recharge_confirm: '充值确认',
  real_name_result: '实名结果通知',
  login_alert: '异地登录提醒',
  account_banned: '账号封禁通知',
}

export const TEMPLATE_ORDER = [
  'register_verify',
  'password_reset',
  'recharge_confirm',
  'real_name_result',
  'login_alert',
  'account_banned',
]
