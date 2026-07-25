import { useState, useEffect } from 'react'
import { X, History, RotateCcw, FileDiff, Clock, User, ChevronRight, Loader2 } from 'lucide-react'
import { get, post } from '@/lib/api'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ConfigDiffViewer from './ConfigDiffViewer'
import PaginationBar from '@/components/ui/PaginationBar'

interface ConfigHistoryDialogProps {
  open: boolean
  configKey: string
  configType: 'system' | 'login_security'
  onClose: () => void
  onReverted?: () => void
}

interface Version {
  id: number
  configKey: string
  configType: string
  oldValue: any
  newValue: any
  changedBy: number | null
  changedByUsername: string | null
  changeReason: string | null
  ip: string | null
  createdAt: string
}

export default function ConfigHistoryDialog({
  open,
  configKey,
  configType,
  onClose,
  onReverted,
}: ConfigHistoryDialogProps) {
  const [history, setHistory] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)

  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const [diffData, setDiffData] = useState<any>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const [revertVersion, setRevertVersion] = useState<Version | null>(null)
  const [revertReason, setRevertReason] = useState('')
  const [reverting, setReverting] = useState(false)

  useEffect(() => {
    if (open) {
      fetchHistory()
    }
  }, [open, page, configKey, configType])

  const fetchHistory = async () => {
    setLoading(true)
    try {
      const data = await get<{ list: Version[]; total: number }>(
        `/api/v1/admin/config/${configType}/${configKey}/history`,
        { page, pageSize }
      )
      setHistory(data.list)
      setTotal(data.total)
    } catch (err) {
      console.error('获取历史失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleViewDiff = async (version: Version) => {
    setSelectedVersion(version)
    setShowDiff(true)
    setDiffLoading(true)
    try {
      const data = await get<{ oldValue: any; newValue: any; diff: any }>(
        `/api/v1/admin/config/${configType}/${configKey}/diff`,
        { versionId1: version.id }
      )
      setDiffData(data)
    } catch (err) {
      console.error('获取 diff 失败:', err)
    } finally {
      setDiffLoading(false)
    }
  }

  const handleRevert = async () => {
    if (!revertVersion) return
    setReverting(true)
    try {
      await post(`/api/v1/admin/config/${configType}/${configKey}/revert/${revertVersion.id}`, {
        reason: revertReason || `回滚到版本 #${revertVersion.id}`,
      })
      setRevertVersion(null)
      setRevertReason('')
      fetchHistory()
      onReverted?.()
    } catch (err: any) {
      alert(err.message || '回滚失败')
    } finally {
      setReverting(false)
    }
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className="bg-white rounded-xl w-full max-w-3xl max-h-[80vh] shadow-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <History size={20} className="text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900">
                配置历史：{configKey}
              </h3>
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                {configType}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-slate-400">
                <History size={32} className="mb-2" />
                <p className="text-sm">暂无历史记录</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((v, idx) => (
                  <div
                    key={v.id}
                    className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            #{v.id}
                          </span>
                          {idx === 0 && (
                            <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              最新
                            </span>
                          )}
                          <div className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock size={10} />
                            {new Date(v.createdAt).toLocaleString('zh-CN')}
                          </div>
                        </div>

                        {v.changeReason && (
                          <p className="text-sm text-slate-700 mb-2">{v.changeReason}</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          {v.changedByUsername && (
                            <div className="flex items-center gap-1">
                              <User size={10} />
                              {v.changedByUsername}
                            </div>
                          )}
                          {v.ip && (
                            <div className="font-mono">IP: {v.ip}</div>
                          )}
                        </div>

                        {/* 值预览 */}
                        <div className="mt-3 flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-slate-500 mb-1">新值</div>
                            <code className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded block truncate">
                              {JSON.stringify(v.newValue).slice(0, 100)}
                              {JSON.stringify(v.newValue).length > 100 && '...'}
                            </code>
                          </div>
                          {v.oldValue && (
                            <>
                              <ChevronRight size={14} className="text-slate-400 mt-5" />
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] text-slate-500 mb-1">旧值</div>
                                <code className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded block truncate">
                                  {JSON.stringify(v.oldValue).slice(0, 100)}
                                  {JSON.stringify(v.oldValue).length > 100 && '...'}
                                </code>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1 ml-4">
                        <button
                          onClick={() => handleViewDiff(v)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                          title="查看对比"
                        >
                          <FileDiff size={16} />
                        </button>
                        {idx !== 0 && (
                          <button
                            onClick={() => setRevertVersion(v)}
                            className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition"
                            title="回滚到此版本"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {total > 0 && (
            <div className="px-6 py-4 border-t border-slate-200">
              <PaginationBar
                page={page}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={() => {}}
                total={total}
                totalPages={Math.ceil(total / pageSize)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Diff 对话框 */}
      {showDiff && selectedVersion && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setShowDiff(false) }}
        >
          <div
            className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                版本对比 #{selectedVersion.id}
              </h3>
              <button
                onClick={() => setShowDiff(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {diffLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              ) : diffData ? (
                <ConfigDiffViewer
                  oldValue={diffData.oldValue}
                  newValue={diffData.newValue}
                  diff={diffData.diff}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 回滚确认对话框 */}
      <ConfirmDialog
        open={!!revertVersion}
        title="确认回滚配置"
        message={`确定要回滚到版本 #${revertVersion?.id} 吗？此操作会修改当前配置值。`}
        confirmLabel="确认回滚"
        variant="warning"
        onConfirm={handleRevert}
        onCancel={() => {
          setRevertVersion(null)
          setRevertReason('')
        }}
        loading={reverting}
      />
    </>
  )
}
