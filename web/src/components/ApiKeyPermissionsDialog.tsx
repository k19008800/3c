import { useState, useEffect } from 'react'
import { X, Save, Settings, Clock, Globe, Shield, DollarSign, List, Calendar } from 'lucide-react'
import type { ApiKeyPermissions, TimeRestriction, QuotaRestrictions } from '@/types/api-key'

interface ApiKeyPermissionsDialogProps {
  open: boolean
  onClose: () => void
  onSave: (permissions: ApiKeyPermissions) => Promise<void>
  initialPermissions?: ApiKeyPermissions | null
}

const weekdays = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
]

export function ApiKeyPermissionsDialog({
  open,
  onClose,
  onSave,
  initialPermissions,
}: ApiKeyPermissionsDialogProps) {
  const [permissions, setPermissions] = useState<ApiKeyPermissions>({})
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'models' | 'ip' | 'time' | 'quota' | 'endpoints'>('models')

  // 初始化权限数据
  useEffect(() => {
    if (initialPermissions) {
      setPermissions(initialPermissions)
    } else {
      setPermissions({
        allowedModels: [],
        ipWhitelist: [],
        ipBlacklist: [],
        allowedEndpoints: [],
        rateLimitPerMinute: null,
        timeRestrictions: {},
        quotaRestrictions: {},
        requireModelCheck: true,
      })
    }
  }, [initialPermissions, open])

  // 处理模型权限
  const [newModel, setNewModel] = useState('')
  const handleAddModel = () => {
    if (newModel.trim() && !permissions.allowedModels?.includes(newModel.trim())) {
      setPermissions(prev => ({
        ...prev,
        allowedModels: [...(prev.allowedModels || []), newModel.trim()],
      }))
      setNewModel('')
    }
  }

  const handleRemoveModel = (model: string) => {
    setPermissions(prev => ({
      ...prev,
      allowedModels: prev.allowedModels?.filter(m => m !== model) || [],
    }))
  }

  // 处理IP白名单/黑名单
  const [newIp, setNewIp] = useState('')
  const handleAddIp = (listType: 'whitelist' | 'blacklist') => {
    if (newIp.trim()) {
      const ipList = listType === 'whitelist' ? 'ipWhitelist' : 'ipBlacklist'
      setPermissions(prev => ({
        ...prev,
        [ipList]: [...(prev[ipList] || []), newIp.trim()],
      }))
      setNewIp('')
    }
  }

  const handleRemoveIp = (ip: string, listType: 'whitelist' | 'blacklist') => {
    const ipList = listType === 'whitelist' ? 'ipWhitelist' : 'ipBlacklist'
    setPermissions(prev => ({
      ...prev,
      [ipList]: prev[ipList]?.filter(i => i !== ip) || [],
    }))
  }

  // 处理端点权限
  const [newEndpoint, setNewEndpoint] = useState('')
  const handleAddEndpoint = () => {
    if (newEndpoint.trim() && !permissions.allowedEndpoints?.includes(newEndpoint.trim())) {
      setPermissions(prev => ({
        ...prev,
        allowedEndpoints: [...(prev.allowedEndpoints || []), newEndpoint.trim()],
      }))
      setNewEndpoint('')
    }
  }

  const handleRemoveEndpoint = (endpoint: string) => {
    setPermissions(prev => ({
      ...prev,
      allowedEndpoints: prev.allowedEndpoints?.filter(e => e !== endpoint) || [],
    }))
  }

  // 处理时间段配置
  const updateTimeRestriction = (field: keyof TimeRestriction, value: any) => {
    setPermissions(prev => ({
      ...prev,
      timeRestrictions: {
        ...prev.timeRestrictions,
        [field]: value,
      },
    }))
  }

  const toggleWeekday = (weekday: number) => {
    const currentWeekdays = permissions.timeRestrictions?.weekdays || []
    const newWeekdays = currentWeekdays.includes(weekday)
      ? currentWeekdays.filter(w => w !== weekday)
      : [...currentWeekdays, weekday]
    
    updateTimeRestriction('weekdays', newWeekdays)
  }

  // 处理额度配置
  const updateQuotaRestriction = (field: keyof QuotaRestrictions, value: number) => {
    setPermissions(prev => ({
      ...prev,
      quotaRestrictions: {
        ...prev.quotaRestrictions,
        [field]: value,
      },
    }))
  }

  // 保存权限
  const handleSave = async () => {
    try {
      setSaving(true)
      
      // 清理空值
      const cleanedPermissions: ApiKeyPermissions = {
        ...permissions,
        allowedModels: permissions.allowedModels?.length ? permissions.allowedModels : null,
        ipWhitelist: permissions.ipWhitelist?.length ? permissions.ipWhitelist : null,
        ipBlacklist: permissions.ipBlacklist?.length ? permissions.ipBlacklist : null,
        allowedEndpoints: permissions.allowedEndpoints?.length ? permissions.allowedEndpoints : null,
        timeRestrictions: Object.keys(permissions.timeRestrictions || {}).length ? permissions.timeRestrictions : null,
        quotaRestrictions: Object.keys(permissions.quotaRestrictions || {}).length ? permissions.quotaRestrictions : null,
      }

      await onSave(cleanedPermissions)
      onClose()
    } catch (error) {
      console.error('保存权限失败:', error)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="border-b border-slate-200 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Settings className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">API Key 权限配置</h2>
              <p className="text-sm text-slate-500">配置细粒度的访问控制和额度限制</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-200px)]">
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-200 p-4 space-y-1">
            {[
              { id: 'models', label: '模型权限', icon: List },
              { id: 'ip', label: 'IP控制', icon: Globe },
              { id: 'time', label: '时间段限制', icon: Clock },
              { id: 'quota', label: '额度限制', icon: DollarSign },
              { id: 'endpoints', label: '端点权限', icon: Shield },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                  activeTab === tab.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* 模型权限配置 */}
            {activeTab === 'models' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">模型访问权限</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    限制此 API Key 可以访问的模型列表。留空表示允许访问所有模型。
                  </p>
                  
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newModel}
                      onChange={(e) => setNewModel(e.target.value)}
                      placeholder="输入模型名称，如 gpt-4-turbo"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
                    />
                    <button
                      onClick={handleAddModel}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      添加
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {permissions.allowedModels?.map(model => (
                      <div
                        key={model}
                        className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm font-medium text-slate-800">{model}</span>
                        <button
                          onClick={() => handleRemoveModel(model)}
                          className="p-1 hover:bg-slate-200 rounded transition"
                        >
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {(!permissions.allowedModels || permissions.allowedModels.length === 0) && (
                    <div className="text-center py-8 text-slate-400">
                      <p>未配置模型限制 - 允许访问所有模型</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="requireModelCheck"
                    checked={permissions.requireModelCheck !== false}
                    onChange={(e) => setPermissions(prev => ({
                      ...prev,
                      requireModelCheck: e.target.checked,
                    }))}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="requireModelCheck" className="text-sm text-slate-700">
                    强制检查模型权限（建议开启）
                  </label>
                </div>
              </div>
            )}

            {/* IP控制配置 */}
            {activeTab === 'ip' && (
              <div className="space-y-8">
                {/* IP白名单 */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">IP白名单</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    只允许来自这些IP地址的请求。支持CIDR格式（如 192.168.1.0/24）。
                  </p>
                  
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                      placeholder="输入IP地址或CIDR，如 192.168.1.1 或 192.168.1.0/24"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddIp('whitelist')}
                    />
                    <button
                      onClick={() => handleAddIp('whitelist')}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                    >
                      添加到白名单
                    </button>
                  </div>

                  <div className="space-y-2">
                    {permissions.ipWhitelist?.map(ip => (
                      <div
                        key={ip}
                        className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm font-medium text-slate-800">{ip}</span>
                        <button
                          onClick={() => handleRemoveIp(ip, 'whitelist')}
                          className="p-1 hover:bg-green-200 rounded transition"
                        >
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {(!permissions.ipWhitelist || permissions.ipWhitelist.length === 0) && (
                    <div className="text-center py-4 text-slate-400">
                      <p>未配置IP白名单 - 允许所有IP访问</p>
                    </div>
                  )}
                </div>

                {/* IP黑名单 */}
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">IP黑名单</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    阻止来自这些IP地址的请求。
                  </p>
                  
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                      placeholder="输入IP地址或CIDR"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddIp('blacklist')}
                    />
                    <button
                      onClick={() => handleAddIp('blacklist')}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                    >
                      添加到黑名单
                    </button>
                  </div>

                  <div className="space-y-2">
                    {permissions.ipBlacklist?.map(ip => (
                      <div
                        key={ip}
                        className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm font-medium text-slate-800">{ip}</span>
                        <button
                          onClick={() => handleRemoveIp(ip, 'blacklist')}
                          className="p-1 hover:bg-red-200 rounded transition"
                        >
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 时间段限制配置 */}
            {activeTab === 'time' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">时间段限制</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    限制API Key只能在特定时间段内使用。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 时间范围 */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-slate-800">允许的时间范围</h4>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-sm text-slate-600 mb-1">开始时间</label>
                        <select
                          value={permissions.timeRestrictions?.startHour ?? ''}
                          onChange={(e) => updateTimeRestriction('startHour', e.target.value ? parseInt(e.target.value) : undefined)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">不限</option>
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm text-slate-600 mb-1">结束时间</label>
                        <select
                          value={permissions.timeRestrictions?.endHour ?? ''}
                          onChange={(e) => updateTimeRestriction('endHour', e.target.value ? parseInt(e.target.value) : undefined)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">不限</option>
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 允许的星期 */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-slate-800">允许的星期</h4>
                    <div className="grid grid-cols-7 gap-2">
                      {weekdays.map(day => {
                        const isSelected = permissions.timeRestrictions?.weekdays?.includes(day.value) || false
                        return (
                          <button
                            key={day.value}
                            onClick={() => toggleWeekday(day.value)}
                            className={`py-2 rounded-lg transition ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                          >
                            <div className="text-xs font-medium">{day.label}</div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-500">
                  <p>提示：不配置任何时间限制表示全天候可用。</p>
                </div>
              </div>
            )}

            {/* 额度限制配置 */}
            {activeTab === 'quota' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">额度限制</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    设置API Key的使用额度限制（单位：元）。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* 每日额度限制 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">每日额度限制</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={permissions.quotaRestrictions?.dailyLimit ?? ''}
                        onChange={(e) => updateQuotaRestriction('dailyLimit', parseFloat(e.target.value) || 0)}
                        placeholder="不限"
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</div>
                    </div>
                    <p className="text-xs text-slate-500">0 表示不限制</p>
                  </div>

                  {/* 每月额度限制 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">每月额度限制</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={permissions.quotaRestrictions?.monthlyLimit ?? ''}
                        onChange={(e) => updateQuotaRestriction('monthlyLimit', parseFloat(e.target.value) || 0)}
                        placeholder="不限"
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</div>
                    </div>
                    <p className="text-xs text-slate-500">0 表示不限制</p>
                  </div>

                  {/* 单次请求额度限制 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">单次请求额度限制</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={permissions.quotaRestrictions?.perRequestLimit ?? ''}
                        onChange={(e) => updateQuotaRestriction('perRequestLimit', parseFloat(e.target.value) || 0)}
                        placeholder="不限"
                        className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">¥</div>
                    </div>
                    <p className="text-xs text-slate-500">0 表示不限制</p>
                  </div>
                </div>

                <div className="text-sm text-slate-500">
                  <p>提示：额度限制会在API Key独立额度之外额外生效。</p>
                </div>
              </div>
            )}

            {/* 端点权限配置 */}
            {activeTab === 'endpoints' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">端点权限</h3>
                  <p className="text-sm text-slate-500 mb-4">
                    限制此API Key可以访问的端点。支持路径前缀匹配（如 /v1/chat）。
                  </p>
                  
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newEndpoint}
                      onChange={(e) => setNewEndpoint(e.target.value)}
                      placeholder="输入端点路径，如 /v1/chat/completions"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddEndpoint()}
                    />
                    <button
                      onClick={handleAddEndpoint}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      添加
                    </button>
                  </div>

                  <div className="space-y-2">
                    {permissions.allowedEndpoints?.map(endpoint => (
                      <div
                        key={endpoint}
                        className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                      >
                        <span className="text-sm font-medium text-slate-800">{endpoint}</span>
                        <button
                          onClick={() => handleRemoveEndpoint(endpoint)}
                          className="p-1 hover:bg-slate-200 rounded transition"
                        >
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {(!permissions.allowedEndpoints || permissions.allowedEndpoints.length === 0) && (
                    <div className="text-center py-8 text-slate-400">
                      <p>未配置端点限制 - 允许访问所有端点</p>
                    </div>
                  )}
                </div>

                {/* 速率限制 */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">速率限制（每分钟请求数）</label>
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={permissions.rateLimitPerMinute ?? ''}
                    onChange={(e) => setPermissions(prev => ({
                      ...prev,
                      rateLimitPerMinute: e.target.value ? parseInt(e.target.value) : null,
                    }))}
                    placeholder="使用系统默认"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-slate-500">留空表示使用系统默认速率限制</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 p-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存权限配置
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}