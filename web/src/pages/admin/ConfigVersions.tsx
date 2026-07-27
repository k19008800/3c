import { useEffect, useState, useCallback } from 'react'
import { get, post, patch } from '@/lib/api'
import type { PaginatedData, ConfigVersion, ConfigSnapshot, ConfigChangeRequest } from '@/types'
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  History, 
  GitCompare, 
  Camera, 
  RotateCcw,
  Filter,
  Download,
  Upload,
  Clock,
  User,
  Eye,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'
import { formatDistanceToNow, format } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export default function ConfigVersions() {
  const [activeTab, setActiveTab] = useState<'history' | 'snapshots' | 'requests' | 'compare'>('history')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // 历史版本状态
  const [history, setHistory] = useState<PaginatedData<ConfigVersion>>({ 
    list: [], total: 0, page: 1, pageSize:18 
  })
  const [historyFilters, setHistoryFilters] = useState({
    configKey: '',
    configType: '',
    page: 1,
    pageSize: 18
  })

  // 快照状态
  const [snapshots, setSnapshots] = useState<PaginatedData<ConfigSnapshot>>({
    list: [], total: 0, page: 1, pageSize: 18
  })
  const [newSnapshot, setNewSnapshot] = useState({
    name: '',
    description: '',
    configType: 'system' as 'system' | 'security' | 'login_security'
  })

  // 变更请求状态
  const [changeRequests, setChangeRequests] = useState<PaginatedData<ConfigChangeRequest>>({
    list: [], total: 0, page: 1, pageSize: 18
  })

  // 对比状态
  const [compareData, setCompareData] = useState({
    version1: '',
    version2: '',
    result: null as any
  })

  // 获取配置历史
  const fetchConfigHistory = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const queryParams = new URLSearchParams()
      if (historyFilters.configKey) queryParams.append('configKey', historyFilters.configKey)
      if (historyFilters.configType) queryParams.append('configType', historyFilters.configType)
      queryParams.append('page', historyFilters.page.toString())
      queryParams.append('pageSize', historyFilters.pageSize.toString())

      const data = await get<PaginatedData<ConfigVersion>>(
        `/api/v1/admin/config/history?${queryParams.toString()}`
      )
      setHistory(data)
    } catch (err: any) {
      setError(err.message || '获取配置历史失败')
    } finally {
      setLoading(false)
    }
  }, [historyFilters])

  // 获取配置快照
  const fetchConfigSnapshots = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')
    try {
      const data = await get<PaginatedData<ConfigSnapshot>>(
        `/api/v1/admin/config/snapshots?page=${page}&pageSize=18`
      )
      setSnapshots(data)
    } catch (err: any) {
      setError(err.message || '获取配置快照失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 获取变更请求
  const fetchChangeRequests = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')
    try {
      const data = await get<PaginatedData<ConfigChangeRequest>>(
        `/api/v1/admin/config/change-requests?page=${page}&pageSize=18`
      )
      setChangeRequests(data)
    } catch (err: any) {
      setError(err.message || '获取变更请求失败')
    } finally {
      setLoading(false)
    }
  }, [])

  // 创建快照
  const handleCreateSnapshot = async () => {
    if (!newSnapshot.name) {
      setError('快照名称不能为空')
      return
    }

    setLoading(true)
    setError('')
    try {
      await post('/api/v1/admin/config/snapshots', newSnapshot)
      setSuccessMsg('快照创建成功')
      setNewSnapshot({ name: '', description: '', configType: 'system' })
      fetchConfigSnapshots(1)
    } catch (err: any) {
      setError(err.message || '创建快照失败')
    } finally {
      setLoading(false)
    }
  }

  // 恢复快照
  const handleRestoreSnapshot = async (snapshotId: number, snapshotName: string) => {
    if (!confirm(`确定要恢复快照 "${snapshotName}" 吗？`)) return

    setLoading(true)
    setError('')
    try {
      await post(`/api/v1/admin/config/snapshots/${snapshotId}/restore`, {})
      setSuccessMsg(`快照 "${snapshotName}" 恢复成功`)
      fetchConfigHistory()
    } catch (err: any) {
      setError(err.message || '恢复快照失败')
    } finally {
      setLoading(false)
    }
  }

  // 对比配置版本
  const handleCompareVersions = async () => {
    if (!compareData.version1 || !compareData.version2) {
      setError('请选择两个版本进行对比')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await get(
        `/api/v1/admin/config/system/value/diff?versionId1=${compareData.version1}&versionId2=${compareData.version2}`
      )
      setCompareData({ ...compareData, result })
    } catch (err: any) {
      setError(err.message || '对比版本失败')
    } finally {
      setLoading(false)
    }
  }

  // 处理变更请求
  const handleProcessChangeRequest = async (requestId: number, approve: boolean) => {
    const action = approve ? '批准' : '拒绝'
    if (!confirm(`确定要${action}此变更请求吗？`)) return

    setLoading(true)
    setError('')
    try {
      await post(`/api/v1/admin/config/change-requests/${requestId}/process`, { approve })
      setSuccessMsg(`变更请求已${action}`)
      fetchChangeRequests(1)
    } catch (err: any) {
      setError(err.message || '处理变更请求失败')
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载
  useEffect(() => {
    fetchConfigHistory()
  }, [fetchConfigHistory])

  // 切换标签页时加载相应数据
  useEffect(() => {
    if (activeTab === 'snapshots') {
      fetchConfigSnapshots()
    } else if (activeTab === 'requests') {
      fetchChangeRequests()
    }
  }, [activeTab, fetchConfigSnapshots, fetchChangeRequests])

  // 渲染配置历史标签页
  const renderHistoryTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">配置变更历史</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="搜索配置项..."
              value={historyFilters.configKey}
              onChange={(e) => setHistoryFilters({ ...historyFilters, configKey: e.target.value })}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={historyFilters.configType}
            onChange={(e) => setHistoryFilters({ ...historyFilters, configType: e.target.value })}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">所有类型</option>
            <option value="system">系统配置</option>
            <option value="security">安全配置</option>
            <option value="login_security">登录安全</option>
          </select>
          <button
            onClick={fetchConfigHistory}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            <Filter size={16} />
            筛选
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">版本ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">配置项</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">类型</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">旧值</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">新值</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作者</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">变更原因</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {history.list.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    {loading ? '加载中...' : '暂无变更历史'}
                  </td>
                </tr>
              ) : (
                history.list.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-mono text-slate-800">#{item.id}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-800">{item.configKey}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        item.configType === 'system' ? 'bg-blue-100 text-blue-800' :
                        item.configType === 'security' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {item.configType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate">
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                          {typeof item.oldValue === 'object' 
                            ? JSON.stringify(item.oldValue).slice(0, 50) + '...'
                            : String(item.oldValue || '-').slice(0, 50) + '...'}
                        </code>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-xs truncate">
                        <code className="text-xs bg-green-100 px-2 py-1 rounded">
                          {typeof item.newValue === 'object' 
                            ? JSON.stringify(item.newValue).slice(0, 50) + '...'
                            : String(item.newValue || '-').slice(0, 50)}
                        </code>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400" />
                        <span>{item.changedByUsername || '系统'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs">
                      {item.changeReason || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-slate-400" />
                        <span title={format(new Date(item.createdAt), 'yyyy-MM-dd HH:mm:ss')}>
                          {formatDistanceToNow(new Date(item.createdAt), { 
                            addSuffix: true, 
                            locale: zhCN 
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            // 查看详情
                            window.open(`/admin/config/version/${item.id}`, '_blank')
                          }}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                          title="查看详情"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => {
                            // 回滚到此版本
                            if (confirm(`确定要回滚配置 "${item.configKey}" 到版本 #${item.id} 吗？`)) {
                              post(`/api/v1/admin/config/${item.configType}/${item.configKey}/revert/${item.id}`, {})
                                .then(() => {
                                  setSuccessMsg(`已回滚到版本 #${item.id}`)
                                  fetchConfigHistory()
                                })
                                .catch(err => setError(err.message))
                            }
                          }}
                          className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-800"
                          title="回滚到此版本"
                        >
                          <RotateCcw size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {history.total > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              共 {history.total} 条记录，第 {history.page} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHistoryFilters({ ...historyFilters, page: historyFilters.page - 1 })}
                disabled={historyFilters.page <= 1}
                className="flex items-center gap-1 px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
                上一页
              </button>
              <span className="px-3 py-1 bg-slate-100 rounded text-sm">
                {historyFilters.page}
              </span>
              <button
                onClick={() => setHistoryFilters({ ...historyFilters, page: historyFilters.page + 1 })}
                disabled={historyFilters.page >= Math.ceil(history.total / historyFilters.pageSize)}
                className="flex items-center gap-1 px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                下一页
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // 渲染快照标签页
  const renderSnapshotsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">配置快照</h2>
        <div className="flex items-center gap-3">
          <div className="bg-white p-4 rounded-lg border border-slate-200">
            <h3 className="text-sm font-medium text-slate-700 mb-3">创建新快照</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="快照名称"
                value={newSnapshot.name}
                onChange={(e) => setNewSnapshot({ ...newSnapshot, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="描述（可选）"
                value={newSnapshot.description}
                onChange={(e) => setNewSnapshot({ ...newSnapshot, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={newSnapshot.configType}
                onChange={(e) => setNewSnapshot({ 
                  ...newSnapshot, 
                  configType: e.target.value as 'system' | 'security' | 'login_security' 
                })}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="system">系统配置</option>
                <option value="security">安全配置</option>
                <option value="login_security">登录安全</option>
              </select>
              <button
                onClick={handleCreateSnapshot}
                disabled={!newSnapshot.name || loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera size={16} />
                创建快照
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {snapshots.list.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400">
            {loading ? '加载中...' : '暂无快照'}
          </div>
        ) : (
          snapshots.list.map((snapshot) => (
            <div key={snapshot.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-slate-800">{snapshot.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{snapshot.description}</p>
                </div>
                {snapshot.isActive && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    活跃
                  </span>
                )}
              </div>
              
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">类型：</span>
                  <span className="font-mono">{snapshot.configType}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">创建者：</span>
                  <span>{snapshot.createdByUsername || '系统'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">创建时间：</span>
                  <span>{format(new Date(snapshot.createdAt), 'yyyy-MM-dd HH:mm')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                <button
                  onClick={() => handleRestoreSnapshot(snapshot.id, snapshot.name)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                >
                  <RotateCcw size={14} />
                  恢复
                </button>
                <button
                  onClick={() => {
                    // 导出快照
                    const dataStr = JSON.stringify(snapshot, null, 2)
                    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
                    const link = document.createElement('a')
                    link.setAttribute('href', dataUri)
                    link.setAttribute('download', `snapshot_${snapshot.name}_${snapshot.id}.json`)
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-slate-300 rounded text-sm hover:bg-slate-50 transition"
                >
                  <Download size={14} />
                  导出
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )

  // 渲染变更请求标签页
  const renderRequestsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">变更请求</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('/admin/config/new-request', '_blank')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition"
          >
            <Upload size={16} />
            新建请求
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-4 py-3 text-sm font-medium text-slate-500">请求ID</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">配置项</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">请求者</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">变更原因</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">状态</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">创建时间</th>
                <th className="px-4 py-3 text-sm font-medium text-slate-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {changeRequests.list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    {loading ? '加载中...' : '暂无变更请求'}
                  </td>
                </tr>
              ) : (
                changeRequests.list.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 text-sm font-mono text-slate-800">#{request.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm text-slate-800">{request.configKey}</div>
                      <div className="text-xs text-slate-500 mt-1">{request.configType}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400" />
                        <span>{request.requestedByUsername}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs">
                      {request.requestReason}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        request.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {request.status === 'pending' ? '待审批' :
                         request.status === 'approved' ? '已批准' : '已拒绝'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {format(new Date(request.createdAt), 'MM-dd HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {request.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleProcessChangeRequest(request.id, true)}
                              className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800"
                              title="批准"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => handleProcessChangeRequest(request.id, false)}
                              className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
                              title="拒绝"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => window.open(`/admin/config/request/${request.id}`, '_blank')}
                          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                          title="查看详情"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  // 渲染对比标签页
  const renderCompareTab = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-800">版本对比</h2>
      
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">选择版本1</label>
            <select
              value={compareData.version1}
              onChange={(e) => setCompareData({ ...compareData, version1: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择版本...</option>
              {/* 这里应该从API获取版本列表 */}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">选择版本2</label>
            <select
              value={compareData.version2}
              onChange={(e) => setCompareData({ ...compareData, version2: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择版本...</option>
              {/* 这里应该从API获取版本列表 */}
            </select>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleCompareVersions}
            disabled={!compareData.version1 || !compareData.version2 || loading}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GitCompare size={18} />
            开始对比
          </button>
        </div>

        {compareData.result && (
          <div className="mt-8 p-4 bg-slate-50 rounded-lg">
            <h3 className="text-lg font-medium text-slate-800 mb-4">对比结果</h3>
            <pre className="text-sm bg-white p-4 rounded border border-slate-200 overflow-auto">
              {JSON.stringify(compareData.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )

  if (loading && activeTab === 'history') {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">配置版本控制</h1>
      <FeatureDescription page="admin/config-versions" className="ml-2" />

      {successMsg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 标签页导航 */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <History size={16} />
              变更历史
            </div>
          </button>
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition ${
              activeTab === 'snapshots'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Camera size={16} />
              配置快照
            </div>
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition ${
              activeTab === 'requests'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Upload size={16} />
              变更请求
            </div>
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={`py-3 px-1 border-b-2 text-sm font-medium transition ${
              activeTab === 'compare'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <GitCompare size={16} />
              版本对比
            </div>
          </button>
        </nav>
      </div>

      {/* 标签页内容 */}
      <div className="pt-4">
        {activeTab === 'history' && renderHistoryTab()}
        {activeTab === 'snapshots' && renderSnapshotsTab()}
        {activeTab === 'requests' && renderRequestsTab()}
        {activeTab === 'compare' && renderCompareTab()}
      </div>
    </div>
  )
}