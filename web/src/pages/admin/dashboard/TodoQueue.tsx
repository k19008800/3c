import type { TodoQueue } from '@/types'

interface Props {
  queue: TodoQueue | null
}

export default function TodoQueue({ queue }: Props) {
  if (!queue) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">📋 运营待办队列</h3>
        <div className="text-center py-6 text-sm text-slate-400">加载中...</div>
      </div>
    )
  }

  const urgentItems: { label: string; count: number; amount?: string }[] = []
  if (queue.bankTransfer.needFirstReview.count > 0) {
    urgentItems.push({
      label: '对公转账待一审',
      count: queue.bankTransfer.needFirstReview.count,
      amount: queue.bankTransfer.needFirstReview.totalAmount,
    })
  }
  if (queue.realNamePending > 0) {
    urgentItems.push({ label: '实名认证待审', count: queue.realNamePending })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">📋 运营待办队列</h3>
      </div>
      <div className="p-5 space-y-4">
        {/* Urgent */}
        {urgentItems.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-red-600 mb-2">🔴 紧急</div>
            {urgentItems.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 bg-red-50 border-l-4 border-red-400 px-3 py-2.5 rounded-r-lg text-sm mb-2"
              >
                <span>{item.label}</span>
                <span className="ml-auto text-xs font-bold text-red-600">
                  {item.count} 条{item.amount ? ` · ¥${parseFloat(item.amount).toLocaleString()}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Pending items */}
        <div>
          <div className="text-xs font-semibold text-amber-600 mb-2">🟡 待处理</div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">📄 实名待审</span>
              <span className="font-semibold text-amber-600">{queue.realNamePending} 条</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">💳 对公待一审</span>
              <span className="font-semibold text-amber-600">
                {queue.bankTransfer.needFirstReview.count} 笔
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">💳 对公待二审</span>
              <span className="font-semibold text-amber-600">
                {queue.bankTransfer.needSecondReview.count} 笔
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">🏦 提现待一审</span>
              <span className="font-semibold text-amber-600">
                {queue.withdraws.needFirstReview.count} 笔
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">🏦 提现待二审</span>
              <span className="font-semibold text-amber-600">
                {queue.withdraws.needSecondReview.count} 笔
              </span>
            </div>
            {queue.unacknowledgedSecurityEvents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">🚨 未确认安全事件</span>
                <span className="font-semibold text-red-500">
                  {queue.unacknowledgedSecurityEvents} 个
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2">
          <a
            href="/admin/real-name-review"
            className="block text-center py-2.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs text-blue-600 font-medium transition cursor-pointer"
          >
            📋 打开运营工作台 →
          </a>
        </div>
      </div>
    </div>
  )
}
