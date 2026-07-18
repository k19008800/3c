import { useEffect, useState, useCallback } from 'react'
import { Loader2, Calendar } from 'lucide-react'
import { get } from '@/lib/api'
import PaginationBar from '@/components/ui/PaginationBar'
import type { ClientOrder, ClientDetailProps } from './types'

const ORDER_PAGE_SIZE = 10

/**
 * 客户详情弹窗（展开行）— 该客户的近期订单列表
 *
 * 【状态覆盖】
 *  - orderLoading：子表 spinner
 *  - 空订单：提示文案
 *  - 正常渲染：订单表格 + 分页 + 日期筛选
 */
export default function ClientDetail({ customerUserId }: ClientDetailProps) {
  const [orderList, setOrderList] = useState<ClientOrder[]>([])
  const [orderTotal, setOrderTotal] = useState(0)
  const [orderPage, setOrderPage] = useState(1)
  const [orderLoading, setOrderLoading] = useState(false)
  const [orderDateStart, setOrderDateStart] = useState('')
  const [orderDateEnd, setOrderDateEnd] = useState('')

  const orderTotalPages = Math.ceil(orderTotal / ORDER_PAGE_SIZE)

  const fetchOrders = useCallback(
    async (p: number) => {
      setOrderLoading(true)
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(ORDER_PAGE_SIZE),
        })
        if (orderDateStart) params.set('startDate', orderDateStart)
        if (orderDateEnd) params.set('endDate', orderDateEnd)
        const res = await get<any>(
          `/api/v1/agent/clients/${customerUserId}/orders?${params.toString()}`,
        )
        setOrderList(res?.list ?? [])
        setOrderTotal(res?.total ?? 0)
      } catch {
        setOrderList([])
        setOrderTotal(0)
      } finally {
        setOrderLoading(false)
      }
    },
    [customerUserId, orderDateStart, orderDateEnd],
  )

  // 首次挂载 / customerUserId 变化
  useEffect(() => {
    setOrderPage(1)
    setOrderDateStart('')
    setOrderDateEnd('')
    setOrderList([])
    setOrderTotal(0)
  }, [customerUserId])

  // 分页变动
  useEffect(() => {
    fetchOrders(orderPage)
  }, [fetchOrders, orderPage])

  const handleDateStartChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOrderDateStart(e.target.value)
    setOrderPage(1)
  }, [])

  const handleDateEndChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOrderDateEnd(e.target.value)
    setOrderPage(1)
  }, [])

  return (
    <div className="space-y-3">
      {/* ── 日期筛选 ── */}
      <div className="flex items-center gap-3">
        <Calendar size={14} className="text-slate-500" />
        <input
          type="date"
          value={orderDateStart}
          onChange={handleDateStartChange}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          placeholder="开始日期"
        />
        <span className="text-slate-400 text-sm">至</span>
        <input
          type="date"
          value={orderDateEnd}
          onChange={handleDateEndChange}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
          placeholder="结束日期"
        />
      </div>

      {/* ── 订单子表 ── */}
      {orderLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : orderList.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-sm">暂无订单数据</div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="text-left px-3 py-2 font-medium text-slate-500">订单号</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">模型</th>
                <th className="text-right px-3 py-2 font-medium text-slate-500">Token</th>
                <th className="text-right px-3 py-2 font-medium text-slate-500">金额</th>
                <th className="text-center px-3 py-2 font-medium text-slate-500">状态</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderList.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-slate-600">{o.orderNo}</td>
                  <td className="px-3 py-2 text-slate-600">{o.modelName || '-'}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-500">{o.totalTokens}</td>
                  <td className="px-3 py-2 text-right font-mono text-green-600">
                    ¥{Number(o.cost || 0).toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 text-[10px] rounded-full ${
                        o.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : o.status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {o.status === 'success' ? '成功' : o.status === 'failed' ? '失败' : o.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {new Date(o.createdAt).toLocaleString('zh-CN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── 订单分页 ── */}
      {orderTotalPages > 1 && (
        <PaginationBar
          page={orderPage}
          onPageChange={setOrderPage}
          pageSize={ORDER_PAGE_SIZE}
          onPageSizeChange={() => {}}
          total={orderTotal}
          totalPages={orderTotalPages}
        />
      )}
    </div>
  )
}
