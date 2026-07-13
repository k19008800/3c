import { STATUS_OPTIONS, fmt } from './types'

/* ── Status Badge ── */
export function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find(o => o.value === status)
  if (!opt) return null
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${opt.color}`}>
      {opt.label}
    </span>
  )
}

/* ── Stat Card ── */
export function StatCard({ icon, label, value, sub, color, disabled }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string; disabled?: boolean }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={color || 'text-slate-400'}>{icon}</span>
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color || 'text-slate-800'} mt-0.5`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}
