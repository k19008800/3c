// 兑换码详情弹窗

import { useState, useEffect } from 'react'
import { get } from '@/lib/api'
import { X, Clock, Info, History, User } from 'lucide-react'
import type { CodeDetail } from '../types'
import { usageActionMap } from '../constants'

interface DetailModalProps {
  codeId: number | null
  codeDisplay: string
  onClose: () => void
}

export function DetailModal({ codeId, codeDisplay, onClose }: DetailModalProps) {
  const [detail, setDetail] = useState<CodeDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!codeId) return
    setLoading(true)
    setError('')
    get<CodeDetail>(`/api/v1/redemption/codes/${codeId}`)
      .then(setDetail)
      .catch(err => setError(err.message || '获取详情失败'))
      .finally(() => setLoading(false))
  }, [codeId])

  if (!codeId) return null

  const code = detail?.code
  const totalAmount = code ? parseFloat(code.amount) : 0
  const balance = code ? parseFloat(code.balance) : 0
  const isPartial = totalAmount !== balance && balance > 0

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">兑换码详情</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading && (
            <div className="text-center py-8 text-slate-500">加载中...</div>
          )}

          {error && (
            <div className="text-center py-8 text-red-500">{error}</div>
          )}

          {detail && code && (
            <>
              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">兑换码</span>
                  <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                    {codeDisplay}
                  </code>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">金额</span>
                  <span className="font-semibold text-slate-900">¥{totalAmount.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">剩余余额</span>
                  <span className="font-semibold text-slate-900">¥{balance.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">状态</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    code.status === 'unused' ? 'bg-blue-100 text-blue-700' :
                    code.status === 'used' ? 'bg-green-100 text-green-700' :
                    code.status === 'expired' ? 'bg-slate-100 text-slate-500' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {code.status === 'unused' ? '未使用' : 
                     code.status === 'used' ? '已使用' : 
                     code.status === 'expired' ? '已过期' : '已作废'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">所属批次</span>
                  <span className="text-sm text-slate-700">{code.batchName || '—'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">创建时间</span>
                  <span className="text-sm text-slate-700">
                    {new Date(code.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>

                {code.usedByEmail && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">使用者</span>
                    <span className="text-sm text-slate-700">{code.usedByEmail}</span>
                  </div>
                )}

                {isPartial && (
                  <div className="flex items-center gap-2 text-xs bg-amber-50 text-amber-700 rounded-lg px-3 py-2">
                    <Info size={14} />
                    <span>此兑换码存在部分使用记录，已使用 ¥{(totalAmount - balance).toFixed(2)}，剩余 ¥{balance.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Usage timeline */}
              <div>
                <h4 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5">
                  <History size={14} className="text-slate-500" />
                  使用时间线
                </h4>

                {detail.timeline.length === 0 ? (
                  <p className="text-sm text-slate-400 bg-slate-50 rounded-lg p-3">暂无使用记录</p>
                ) : (
                  <div className="relative pl-5 border-l-2 border-slate-200 space-y-3">
                    {detail.timeline.map((event, idx) => {
                      const actionInfo = usageActionMap[event.action] || { label: event.action, color: 'bg-slate-100 text-slate-700' }
                      return (
                        <div key={event.id || idx} className="relative">
                          <div className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                            actionInfo.color.includes('green') ? 'bg-green-500' :
                            actionInfo.color.includes('blue') ? 'bg-blue-500' :
                            actionInfo.color.includes('purple') ? 'bg-purple-500' :
                            actionInfo.color.includes('orange') ? 'bg-orange-500' :
                            actionInfo.color.includes('amber') ? 'bg-amber-500' :
                            actionInfo.color.includes('red') ? 'bg-red-500' :
                            'bg-slate-400'
                          }`} />
                          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${actionInfo.color}`}>
                                {actionInfo.label}
                              </span>
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock size={10} />
                                {new Date(event.createdAt).toLocaleString('zh-CN')}
                              </span>
                            </div>
                            {event.email && (
                              <p className="text-xs text-slate-600 flex items-center gap-1">
                                <User size={10} />
                                {event.email}
                              </p>
                            )}
                            {event.description && (
                              <p className="text-xs text-slate-500 mt-1">{event.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-1.5 text-xs">
                              <span className="text-slate-500">
                                金额: <span className="font-medium text-slate-700">¥{Number(event.amount).toFixed(4)}</span>
                              </span>
                              <span className="text-slate-500">
                                余额: <span className="font-medium text-slate-700">¥{Number(event.balanceAfter).toFixed(4)}</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}