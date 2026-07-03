import type { TopConsumer } from '@/types'

interface Props {
  consumers: TopConsumer[]
}

export default function TopUsersTable({ consumers }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">🏆 Top 消费用户</h3>
          <span className="text-xs text-blue-500 cursor-pointer">查看全部</span>
        </div>
      </div>
      {consumers.length === 0 ? (
        <div className="text-center py-10 text-sm text-slate-400">暂无数据</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-xs font-medium text-slate-500">#</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500">用户</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">累计消费</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">本月</th>
                <th className="px-4 py-3 text-xs font-medium text-slate-500 text-right">余额</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {consumers.slice(0, 10).map((c, i) => (
                <tr key={c.userId} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800 max-w-[140px] truncate" title={c.email}>
                    {c.nickname || c.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs ${
                      c.userType === 'enterprise' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'
                    }`}>
                      {c.userType === 'enterprise' ? '🏢' : '👤'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800">
                    ¥{parseFloat(c.totalConsumption).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    ¥{parseFloat(c.monthConsumption).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className={`px-4 py-3 text-right font-mono text-xs ${
                    parseFloat(c.balance) < 10 ? 'text-red-500 font-semibold' : 'text-slate-500'
                  }`}>
                    ¥{parseFloat(c.balance).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 text-center">
        {consumers.length > 10 ? `显示前 10 名，共 ${consumers.length} 位` : `共 ${consumers.length} 位消费用户`}
      </div>
    </div>
  )
}
