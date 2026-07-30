import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { get, post, put, del } from '@/lib/api'

interface StaffSchedule {
  id: number
  staffId: number
  weekday: number
  startTime: string
  endTime: string
  isHoliday: boolean
  createdAt: string
}

interface StaffSlaConfig {
  id: number
  ticketType: string
  firstResponseMin: number
  resolutionMin: number
  escalation50pctTo: string
  escalation100pctTo: string
  escalation200pctTo: string
  workingHoursOnly: boolean
  isDefault: boolean
  createdAt: string
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const TICKET_TYPES = [
  { value: 'urgent', label: '紧急工单' },
  { value: 'high', label: '高优工单' },
  { value: 'normal', label: '普通工单' },
  { value: 'low', label: '低优工单' },
]

export default function AdminStaffSchedule() {
  const [schedules, setSchedules] = useState<StaffSchedule[]>([])
  const [slaConfigs, setSlaConfigs] = useState<StaffSlaConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [staffId, setStaffId] = useState('')
  const [showSlaForm, setShowSlaForm] = useState(false)
  const [slaForm, setSlaForm] = useState<Partial<StaffSlaConfig>>({})

  const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] // 从周一开始

  const loadSchedules = useCallback(async () => {
    try {
      const params = staffId ? `?staffId=${staffId}` : ''
      const res = await get<{ list: StaffSchedule[] }>(`/api/v1/admin/support/schedules${params}`)
      setSchedules(res.list || [])
    } catch (err) {
      console.error('加载排班失败', err)
    }
  }, [staffId])

  const loadSlaConfigs = useCallback(async () => {
    try {
      const res = await get<{ list: StaffSlaConfig[] }>('/api/v1/admin/support/sla-configs')
      setSlaConfigs(res.list || [])
    } catch (err) {
      console.error('加载 SLA 配置失败', err)
    }
  }, [])

  useEffect(() => {
    Promise.all([loadSchedules(), loadSlaConfigs()]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadSchedules() }, [staffId])

  const handleUpsertSchedule = async (weekday: number, startTime: string, endTime: string) => {
    if (!staffId) return alert('请先输入客服 ID')
    try {
      await post('/api/v1/admin/support/schedules', { staffId: Number(staffId), weekday, startTime, endTime })
      loadSchedules()
    } catch (err: any) {
      alert('创建排班失败: ' + (err.message || '未知错误'))
    }
  }

  const handleDeleteSchedule = async (id: number) => {
    await del(`/api/v1/admin/support/schedules/${id}`)
    loadSchedules()
  }

  const handleCreateSla = async () => {
    try {
      await post('/api/v1/admin/support/sla-configs', slaForm)
      setShowSlaForm(false)
      setSlaForm({})
      loadSlaConfigs()
    } catch (err: any) {
      alert('创建 SLA 失败: ' + (err.message || '未知错误'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-100">
          排班与 SLA 管理 <span className="text-xs text-gray-500 align-top">[?]</span>
        </h1>
        <p className="text-sm text-gray-400 mt-1">配置客服排班表、服务等级协议（SLA）和质检评分</p>
      </div>

      {/* ── 排班管理 ── */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-4">排班管理</h2>

        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm text-gray-400">客服 ID:</label>
          <input
            type="number"
            value={staffId}
            onChange={e => setStaffId(e.target.value)}
            placeholder="输入客服用户 ID"
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-gray-200 text-sm w-40"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left py-3 px-4">星期</th>
                <th className="text-left py-3 px-4">开始时间</th>
                <th className="text-left py-3 px-4">结束时间</th>
                <th className="text-center py-3 px-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {WEEKDAYS.map(weekday => {
                const schedule = schedules.find(s => s.weekday === weekday)
                return (
                  <tr key={weekday} className="border-b border-gray-800 hover:bg-gray-700/50">
                    <td className="py-3 px-4 text-gray-200 font-medium">{WEEKDAY_LABELS[weekday]}</td>
                    <td className="py-3 px-4">
                      <input
                        type="time"
                        defaultValue={schedule?.startTime || '09:00'}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
                        id={`start-${weekday}`}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="time"
                        defaultValue={schedule?.endTime || '18:00'}
                        className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 text-sm"
                        id={`end-${weekday}`}
                      />
                    </td>
                    <td className="py-3 px-4 text-center">
                      {schedule ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => {
                              const start = (document.getElementById(`start-${weekday}`) as HTMLInputElement)?.value
                              const end = (document.getElementById(`end-${weekday}`) as HTMLInputElement)?.value
                              handleUpsertSchedule(weekday, start, end)
                            }}
                            className="px-2 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded text-xs"
                          >
                            更新
                          </button>
                          <button
                            onClick={() => handleDeleteSchedule(schedule.id)}
                            className="px-2 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-xs"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={!staffId}
                          onClick={() => {
                            const start = (document.getElementById(`start-${weekday}`) as HTMLInputElement)?.value
                            const end = (document.getElementById(`end-${weekday}`) as HTMLInputElement)?.value
                            handleUpsertSchedule(weekday, start, end)
                          }}
                          className="px-2 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded text-xs disabled:opacity-50"
                        >
                          <Plus className="w-3 h-3 inline mr-1" />添加
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SLA 配置 ── */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-100">SLA 配置</h2>
          <button
            onClick={() => setShowSlaForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm"
          >
            <Plus className="w-4 h-4" />新增 SLA
          </button>
        </div>

        {slaConfigs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无 SLA 配置</p>
          </div>
        ) : (
          <div className="space-y-3">
            {slaConfigs.map(config => {
              const typeLabel = TICKET_TYPES.find(t => t.value === config.ticketType)?.label || config.ticketType
              return (
                <div key={config.id} className="bg-gray-750 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-200 font-medium">{typeLabel}</span>
                    {config.isDefault && <span className="text-xs bg-indigo-600/20 text-indigo-400 px-2 py-0.5 rounded">默认</span>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-gray-500">首次响应:</span> <span className="text-gray-200">{config.firstResponseMin}分钟</span></div>
                    <div><span className="text-gray-500">解决时间:</span> <span className="text-gray-200">{config.resolutionMin}分钟</span></div>
                    <div><span className="text-gray-500">50% 升级:</span> <span className="text-gray-200">{config.escalation50pctTo}</span></div>
                    <div><span className="text-gray-500">100% 升级:</span> <span className="text-gray-200">{config.escalation100pctTo}</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SLA 新增弹窗 */}
      {showSlaForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-full max-w-lg border border-gray-700">
            <h3 className="text-lg font-semibold text-gray-100 mb-4">新增 SLA 配置</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 block mb-1">工单类型</label>
                <select
                  value={slaForm.ticketType || 'normal'}
                  onChange={e => setSlaForm({ ...slaForm, ticketType: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm"
                >
                  {TICKET_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">首次响应（分钟）</label>
                  <input
                    type="number"
                    value={slaForm.firstResponseMin || 60}
                    onChange={e => setSlaForm({ ...slaForm, firstResponseMin: Number(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">解决时间（分钟）</label>
                  <input
                    type="number"
                    value={slaForm.resolutionMin || 1440}
                    onChange={e => setSlaForm({ ...slaForm, resolutionMin: Number(e.target.value) })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={slaForm.workingHoursOnly ?? true}
                  onChange={e => setSlaForm({ ...slaForm, workingHoursOnly: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">仅工作时间计算</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={slaForm.isDefault ?? false}
                  onChange={e => setSlaForm({ ...slaForm, isDefault: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-300">设为默认配置</span>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSlaForm(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">取消</button>
              <button onClick={handleCreateSla} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}