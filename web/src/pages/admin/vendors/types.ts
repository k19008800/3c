// ── Vendors Types ──

export const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active: { label: '正常', className: 'bg-green-100 text-green-700' },
  down: { label: '宕机', className: 'bg-red-100 text-red-700' },
  degraded: { label: '降级', className: 'bg-orange-100 text-orange-700' },
  disabled: { label: '已禁用', className: 'bg-slate-100 text-slate-700' },
}

export const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'active', label: '正常' },
  { value: 'down', label: '宕机' },
  { value: 'degraded', label: '降级' },
  { value: 'disabled', label: '已禁用' },
]

export function getStatusBadge(status: string) {
  return STATUS_MAP[status] || { label: status, className: 'bg-slate-100 text-slate-700' }
}