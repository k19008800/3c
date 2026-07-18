// ============================================================
//  SiteSettings — 共享类型与常量
// ============================================================

/** 站点设置的 key-value 映射 */
export type SiteSettings = Record<string, string>

/** 图片字段元信息 */
export interface ImageMeta {
  label: string
  displayW: number
  displayH: number
  allowedTypes: string
}

/** 字段定义 */
export interface FieldDef {
  key: string
  label?: string
  type: 'text' | 'textarea' | 'image'
  hint?: string
}

/** 字段分组 */
export interface FieldGroup {
  label: string
  fields: FieldDef[]
}

/** 上传成功后服务端返回的元数据 */
export interface UploadResult {
  url: string
  width: number
  height: number
  size: number
  processed: boolean
}

/** 字段变化回调 */
export type OnFieldChange = (key: string, value: string) => void

// ── 图片字段尺寸约束 ──

export const IMAGE_DISPLAY: Record<string, ImageMeta> = {
  site_logo_url: {
    label: 'Logo',
    displayW: 200, displayH: 60,
    allowedTypes: 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml',
  },
  site_favicon_url: {
    label: 'Favicon',
    displayW: 32, displayH: 32,
    allowedTypes: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml',
  },
  site_wechat_qr_url: {
    label: '公众号二维码',
    displayW: 300, displayH: 300,
    allowedTypes: 'image/png,image/jpeg,image/jpg,image/webp',
  },
}

// ── 通用设置字段分组 ──

export const GENERAL_FIELD_GROUPS: FieldGroup[] = [
  {
    label: '平台标识',
    fields: [
      { key: 'site_logo_url', type: 'image' },
      { key: 'site_favicon_url', type: 'image' },
      { key: 'site_name', label: '平台名称', type: 'text', hint: '显示在浏览器标签和页面标题' },
      { key: 'site_company_name', label: '公司名称', type: 'text', hint: '显示在版权信息中' },
    ],
  },
  {
    label: '备案信息',
    fields: [
      { key: 'site_icp', label: 'ICP 备案号', type: 'text', hint: '如：京ICP备xxxxxx号' },
      { key: 'site_icp_link', label: 'ICP 备案链接', type: 'text', hint: 'https://beian.miit.gov.cn' },
      { key: 'site_police_icp', label: '公安备案号', type: 'text', hint: '如：京公网安备xxxxxx号' },
    ],
  },
  {
    label: '联系方式',
    fields: [
      { key: 'site_contact_email', label: '联系邮箱', type: 'text', hint: '' },
      { key: 'site_contact_phone', label: '联系电话', type: 'text', hint: '如：400-xxx-xxxx' },
      { key: 'site_wechat_qr_url', type: 'image' },
    ],
  },
  {
    label: '页脚信息',
    fields: [
      { key: 'site_copyright', label: '版权信息', type: 'text', hint: '如：© 2026 3Cloud. All rights reserved.' },
      { key: 'site_footer_html', label: '底部自定义 HTML', type: 'textarea', hint: '可自定义页脚内容（HTML）' },
    ],
  },
]

// ── 邮件配置字段分组 ──

export const EMAIL_FIELD_GROUPS: FieldGroup[] = [
  {
    label: 'SMTP 服务器',
    fields: [
      { key: 'email_smtp_host', label: 'SMTP 主机', type: 'text', hint: '如：smtp.qq.com' },
      { key: 'email_smtp_port', label: 'SMTP 端口', type: 'text', hint: '587（TLS）或 465（SSL）' },
      { key: 'email_encryption', label: '加密方式', type: 'text', hint: 'tls / ssl / none' },
    ],
  },
  {
    label: '身份验证',
    fields: [
      { key: 'email_smtp_user', label: 'SMTP 用户名', type: 'text', hint: '完整的邮箱地址' },
      { key: 'email_smtp_pass', label: 'SMTP 密码/授权码', type: 'text', hint: '部分邮箱需使用授权码' },
    ],
  },
  {
    label: '发件人信息',
    fields: [
      { key: 'email_sender', label: '发件人地址', type: 'text', hint: '系统发出的邮件显示的发件人' },
      { key: 'email_sender_name', label: '发件人名称', type: 'text', hint: '如：3Cloud 平台' },
    ],
  },
]

// ── 安全参数字段分组 ──

export const SECURITY_FIELD_GROUPS: FieldGroup[] = [
  {
    label: '登录安全',
    fields: [
      { key: 'security_login_attempts', label: '最大登录尝试次数', type: 'text', hint: '超过此次数后锁定账号，默认 5' },
      { key: 'security_lockout_minutes', label: '锁定时间（分钟）', type: 'text', hint: '账号被锁定后自动解锁的时间，默认 30' },
      { key: 'security_password_min_length', label: '密码最小长度', type: 'text', hint: '用户密码最小字符数，默认 8' },
    ],
  },
  {
    label: '会话策略',
    fields: [
      { key: 'security_session_timeout', label: '会话超时（分钟）', type: 'text', hint: '用户无操作后自动登出时间，默认 60' },
      { key: 'security_two_factor', label: '强制双因素认证', type: 'text', hint: '启用 / 禁用' },
      { key: 'security_ip_whitelist', label: 'IP 白名单', type: 'textarea', hint: '每行一个 IP 或 CIDR 网段' },
    ],
  },
]

// ── API 参数字段分组 ──

export const API_FIELD_GROUPS: FieldGroup[] = [
  {
    label: '速率限制',
    fields: [
      { key: 'api_rate_limit', label: '请求限制（次/窗口）', type: 'text', hint: '时间窗口内允许的最大请求数，默认 100' },
      { key: 'api_rate_window', label: '时间窗口（秒）', type: 'text', hint: '速率限制的时间窗口大小，默认 60' },
    ],
  },
  {
    label: '请求限制',
    fields: [
      { key: 'api_max_concurrent', label: '最大并发数', type: 'text', hint: '单用户允许的最大并发请求数，默认 10' },
      { key: 'api_max_body_size', label: '最大请求体（MB）', type: 'text', hint: '请求体大小上限，默认 10' },
      { key: 'api_request_timeout', label: '请求超时（秒）', type: 'text', hint: 'API 请求超时时间，默认 30' },
    ],
  },
  {
    label: '跨域配置',
    fields: [
      { key: 'api_cors_origins', label: 'CORS 允许域名', type: 'textarea', hint: '每行一个域名，支持通配符' },
    ],
  },
]

// ── 计费配置字段分组 ──

export const BILLING_FIELD_GROUPS: FieldGroup[] = [
  {
    label: '基础参数',
    fields: [
      { key: 'billing_currency', label: '结算货币', type: 'text', hint: '如：CNY、USD' },
      { key: 'billing_tax_rate', label: '税率（%）', type: 'text', hint: '如：6（表示 6%）' },
    ],
  },
  {
    label: '充值设置',
    fields: [
      { key: 'billing_min_recharge', label: '最低充值金额', type: 'text', hint: '单次充值最小金额，单位元' },
      { key: 'billing_max_recharge', label: '最高充值金额', type: 'text', hint: '单次充值最大金额，单位元' },
    ],
  },
  {
    label: '发票与结算',
    fields: [
      { key: 'billing_invoice_prefix', label: '发票编号前缀', type: 'text', hint: '自动生成的发票编号前缀' },
      { key: 'billing_auto_settle', label: '自动结算', type: 'text', hint: '启用 / 禁用' },
      { key: 'billing_settle_cycle', label: '结算周期（天）', type: 'text', hint: '代理/分销商自动结算周期' },
    ],
  },
]

// ── 工具函数 ──

/** 从 field groups 和 IMAGE_DISPLAY 中查找字段的显示名 + 提示 */
export function getFieldMeta(
  key: string,
  groups: FieldGroup[],
): { label: string; hint: string } {
  const img = IMAGE_DISPLAY[key]
  if (img) {
    return {
      label: img.label,
      hint: `上传后自动缩放至 ${img.displayW}×${img.displayH}px 附近`,
    }
  }
  for (const g of groups) {
    for (const f of g.fields) {
      if (f.key === key) return { label: f.label ?? key, hint: f.hint ?? '' }
    }
  }
  return { label: key, hint: '' }
}

/** 文件大小格式化 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
