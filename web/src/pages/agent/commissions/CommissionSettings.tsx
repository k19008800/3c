import { memo, useEffect, useRef } from 'react'
import { X, CheckCircle2, ArrowUpRight } from 'lucide-react'
import type { AgentCommission } from '@/types'
import { STATUS_BADGE, STATUS_LABEL, fmt4 } from './types'

// ── Props ──

interface Props {
  commission: AgentCommission | null
  open: boolean
  onClose: () => void
}

// ── Component ──

function CommissionSettings({ commission, open, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && (e.target as HTMLElement).closest('.drawer-overlay')) {
        onClose()
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose])

  if (!commission) return null

  const calc = commission.calcDetail
  const rule = commission.ruleSnapshot

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="absolute inset-0 bg-black/30 drawer-overlay" />

      <div
        ref={ref}
        className={`absolute top-0 right-0 h-full w-full max-w-lg bg-white shadow-2xl transition-transform duration-300 overflow-y-auto ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-slate-900">佣金详情</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 transition">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* 客户信息 */}
          <section>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">客户信息</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">昵称</span>
                <span className="text-sm font-medium text-slate-800">{commission.customerName || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">邮箱</span>
                <span className="text-sm text-slate-700">{commission.customerEmail || '-'}</span>
              </div>
              {commission.sourceOrderId && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">关联订单</span>
                  <span className="text-sm font-mono text-slate-700">{commission.sourceOrderId}</span>
                </div>
              )}
            </div>
          </section>

          {/* 计算明细 */}
          <section>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">计算明细</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">调用成本</span>
                <span className="text-sm font-medium text-slate-800">¥{fmt4(commission.callCost)}</span>
              </div>
              {calc && (
                <>
                  {calc.inputTokens && (
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>输入 Tokens</span>
                      <span>{calc.inputTokens}</span>
                    </div>
                  )}
                  {calc.outputTokens && (
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>输出 Tokens</span>
                      <span>{calc.outputTokens}</span>
                    </div>
                  )}
                </>
              )}
              {commission.feeRate && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">手续费率</span>
                  <span className="text-sm text-slate-700">{commission.feeRate}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">手续费</span>
                <span className="text-sm text-slate-700">-¥{fmt4(commission.feeAmount)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between">
                <span className="text-sm font-semibold text-slate-700">净佣金</span>
                <span className="text-sm font-semibold text-green-600">+¥{fmt4(commission.netAmount)}</span>
              </div>
            </div>
          </section>

          {/* 规则快照 (佣金规则设置) */}
          {rule && (
            <section>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">分佣规则</h3>
              <div className="bg-blue-50/60 rounded-lg p-4">
                {rule.commissionRate != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">分佣比例</span>
                    <span className="font-medium text-blue-700">{(Number(rule.commissionRate) * 100).toFixed(1)}%</span>
                  </div>
                )}
                {rule.ruleName && (
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-500">规则名称</span>
                    <span className="text-slate-700">{rule.ruleName}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 基本信息 */}
          <section>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">基本信息</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">类型</span>
                <span className="text-sm font-medium">{commission.commissionTypeLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">状态</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[commission.status] || ''}`}>
                  {commission.status === 'settled' && <CheckCircle2 size={12} />}
                  {STATUS_LABEL[commission.status] || commission.status}
                </span>
              </div>
              {commission.voucherNo && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">凭证号</span>
                  <span className="text-sm font-mono text-slate-700">{commission.voucherNo}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-slate-500">创建时间</span>
                <span className="text-sm text-slate-700">{new Date(commission.createdAt).toLocaleString('zh-CN')}</span>
              </div>
              {commission.settledAt && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">结算时间</span>
                  <span className="text-sm text-slate-700">{new Date(commission.settledAt).toLocaleString('zh-CN')}</span>
                </div>
              )}
            </div>
          </section>

          {/* 查看关联客户订单 */}
          {commission.sourceCustomerId && (
            <a
              href={`/agent/clients`}
              className="flex items-center justify-center gap-1 w-full py-2.5 text-sm text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition font-medium"
            >
              查看该客户全部订单 <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default memo(CommissionSettings)
