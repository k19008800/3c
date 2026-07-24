// ── Roles Types ──

export interface RoleItem {
  id: number
  name: string
  label: string
  description: string | null
  permissions: bigint
  isSystem: boolean
  userCount: number
  createdAt: string
  updatedAt: string
}

export interface PermItem {
  key: string
  label: string
  bit: number
}

export interface UserInRole {
  userId: number
  email: string
  nickname: string | null
  assignedAt: string | null
}

export interface CandidateUser {
  id: number
  email: string
  nickname: string | null
}

export interface RoleForm {
  name: string
  label: string
  description: string
  permKeys: string[]
}

export const MODULES: { key: string; label: string; permPrefix: string }[] = [
  { key: 'dashboard', label: '仪表盘', permPrefix: 'DASHBOARD' },
  { key: 'users', label: '用户管理', permPrefix: 'USER' },
  { key: 'review', label: '审核', permPrefix: 'REVIEW' },
  { key: 'models', label: '模型供应商', permPrefix: 'MODEL' },
  { key: 'finance', label: '财务', permPrefix: 'FINANCE' },
  { key: 'config', label: '配置', permPrefix: 'CONFIG' },
  { key: 'security', label: '安全', permPrefix: 'SECURITY' },
  { key: 'audit', label: '审计', permPrefix: 'AUDIT' },
  { key: 'agents', label: '代理商', permPrefix: 'AGENT' },
  { key: 'logs', label: '日志', permPrefix: 'LOG' },
  { key: 'ops', label: '运维', permPrefix: 'OPS' },
  { key: 'reconciliation', label: '对账', permPrefix: 'RECONCILIATION' },
]

export function getModuleKey(permKey: string): string {
  const mod = MODULES.find((m) => permKey.startsWith(m.permPrefix))
  return mod?.key ?? 'other'
}

export function hasPerm(permStr: string | bigint, bit: number): boolean {
  const perm = typeof permStr === 'string' ? BigInt(permStr) : permStr
  return (perm & (1n << BigInt(bit))) !== 0n
}

export function setPerm(permStr: string | bigint, bit: number, on: boolean): bigint {
  const perm = typeof permStr === 'string' ? BigInt(permStr) : permStr
  const mask = 1n << BigInt(bit)
  return on ? (perm | mask) : (perm & ~mask)
}