export default function AlertBar({ system, lowBalanceUsers }: { system: { downVendors: number; activeVendors: number }; lowBalanceUsers: number }) {
  const hasDownVendor = system.downVendors > 0
  const hasLowBalance = lowBalanceUsers > 0

  if (!hasDownVendor && !hasLowBalance) return null

  return (
    <div className="space-y-2">
      {hasDownVendor && (
        <div className="flex items-center gap-2.5 bg-orange-50 border-l-4 border-orange-400 px-4 py-3 rounded-r-lg text-sm text-orange-800">
          <span className="text-lg">⚠️</span>
          <span>
            <b>{system.downVendors} 个厂商宕机</b> — 请检查厂商健康状态面板
          </span>
        </div>
      )}
      {hasLowBalance && (
        <div className="flex items-center gap-2.5 bg-red-50 border-l-4 border-red-500 px-4 py-3 rounded-r-lg text-sm text-red-800">
          <span className="text-lg">🚨</span>
          <span>
            <b>{lowBalanceUsers} 个活跃用户余额低于 ¥10</b> — 可能触发负余额保护
          </span>
        </div>
      )}
    </div>
  )
}
