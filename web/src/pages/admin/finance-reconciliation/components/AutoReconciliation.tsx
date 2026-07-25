import { useState, useEffect } from 'react'
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  Play,
  Download,
  Eye,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import { useAutoReconciliation, type MismatchRecord, type ReconciliationReportDetail } from '../hooks/useAutoReconciliation'

const SEVERITY_COLORS = {
  low: 'text-slate-600 bg-slate-50',
  medium: 'text-yellow-700 bg-yellow-50',
  high: 'text-orange-700 bg-orange-50',
  critical: 'text-red-700 bg-red-50',
}

const SEVERITY_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '严重',
}

const MISMATCH_TYPE_LABELS: Record<string, string> = {
  status_mismatch: '状态不一致',
  amount_mismatch: '金额不一致',
  missing_record: '记录缺失',
  calculation_error: '计算错误',
}

export default function AutoReconciliation() {
  const {
    loading,
    error,
    runReconciliation,
    listReports,
    getReportDetail,
    resolveMismatch,
  } = useAutoReconciliation()

  const [config, setConfig] = useState({
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reconType: 'full' as 'full' | 'recharge' | 'balance' | 'commission',
  })

  const [reports, setReports] = useState<ReconciliationReportDetail['report'][]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedReport, setSelectedReport] = useState<ReconciliationReportDetail | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<any>(null)

  // 加载报告列表
  useEffect(() => {
    loadReports()
  }, [page])

  const loadReports = async () => {
    const result = await listReports({ page, pageSize: 10 })
    if (result) {
      setReports(result.list)
      setTotal(result.total)
    }
  }

  // 执行对账
  const handleRun = async () => {
    setRunning(true)
    setRunResult(null)
    const result = await runReconciliation(config)
    setRunning(false)
    if (result) {
      setRunResult(result)
      loadReports()
    }
  }

  // 查看报告详情
  const handleViewDetail = async (reportId: number) => {
    const detail = await getReportDetail(reportId)
    if (detail) {
      setSelectedReport(detail)
    }
  }

  // 标记异常已解决
  const handleResolve = async (mismatchId: number) => {
    const note = prompt('请输入解决说明（可选）')
    const success = await resolveMismatch(mismatchId, note || undefined)
    if (success && selectedReport) {
      // 刷新详情
      const detail = await getReportDetail(selectedReport.report.id)
      if (detail) {
        setSelectedReport(detail)
      }
    }
  }

  // 导出报告
  const handleExport = (reportId: number) => {
    window.open(`/api/v1/admin/finance/reconciliation/export/${reportId}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* 执行对账 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-4">执行自动对账</h2>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">开始日期</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">结束日期</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">对账类型</label>
            <select
              value={config.reconType}
              onChange={(e) =>
                setConfig({
                  ...config,
                  reconType: e.target.value as any,
                })
              }
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="full">全部对账</option>
              <option value="recharge">充值订单对账</option>
              <option value="balance">余额一致性检查</option>
              <option value="commission">佣金准确性验证</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleRun}
              disabled={running || loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  执行中...
                </>
              ) : (
                <>
                  <Play size={16} />
                  执行对账
                </>
              )}
            </button>
          </div>
        </div>

        {/* 执行结果 */}
        {runResult && (
          <div
            className={`p-4 rounded-lg ${
              runResult.status === 'completed'
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {runResult.status === 'completed' ? (
                <CheckCircle className="text-green-600" size={20} />
              ) : (
                <XCircle className="text-red-600" size={20} />
              )}
              <span className="font-medium">
                {runResult.status === 'completed' ? '对账完成' : '对账失败'}
              </span>
            </div>
            {runResult.status === 'completed' && (
              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-600">总订单：</span>
                  <span className="font-medium">{runResult.summary.totalOrders}</span>
                </div>
                <div>
                  <span className="text-slate-600">匹配：</span>
                  <span className="font-medium text-green-600">
                    {runResult.summary.matchedOrders}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">异常：</span>
                  <span className="font-medium text-red-600">
                    {runResult.summary.mismatchedOrders}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">差额：</span>
                  <span className="font-medium">{runResult.summary.difference}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 报告列表 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
        <h2 className="text-lg font-semibold mb-4">对账报告列表</h2>

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg mb-4">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin" size={24} />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center text-slate-500 py-8">暂无对账报告</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3">ID</th>
                <th className="text-left py-2 px-3">时间范围</th>
                <th className="text-left py-2 px-3">类型</th>
                <th className="text-left py-2 px-3">状态</th>
                <th className="text-right py-2 px-3">总订单</th>
                <th className="text-right py-2 px-3">匹配</th>
                <th className="text-right py-2 px-3">异常</th>
                <th className="text-left py-2 px-3">创建时间</th>
                <th className="text-center py-2 px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b hover:bg-slate-50">
                  <td className="py-2 px-3">{r.id}</td>
                  <td className="py-2 px-3">
                    {r.startDate} ~ {r.endDate}
                  </td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                      {r.reconType === 'full'
                        ? '全部'
                        : r.reconType === 'recharge'
                          ? '充值'
                          : r.reconType === 'balance'
                            ? '余额'
                            : '佣金'}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        r.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : r.status === 'running'
                            ? 'bg-blue-100 text-blue-700'
                            : r.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {r.status === 'completed'
                        ? '完成'
                        : r.status === 'running'
                          ? '执行中'
                          : r.status === 'failed'
                            ? '失败'
                            : '待执行'}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">{r.totalOrders}</td>
                  <td className="py-2 px-3 text-right text-green-600">{r.matchedOrders}</td>
                  <td className="py-2 px-3 text-right text-red-600">{r.mismatchedOrders}</td>
                  <td className="py-2 px-3 text-slate-600">{r.createdAt.slice(0, 19)}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleViewDetail(r.id)}
                        className="p-1 hover:bg-slate-100 rounded"
                        title="查看详情"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => handleExport(r.id)}
                        className="p-1 hover:bg-slate-100 rounded"
                        title="导出"
                      >
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* 分页 */}
        {total > 10 && (
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-slate-600">共 {total} 条</div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page * 10 >= total}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 报告详情弹窗 */}
      {selectedReport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-4/5 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                对账报告 #{selectedReport.report.id}
              </h3>
              <button
                onClick={() => setSelectedReport(null)}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1">
              {/* 汇总 */}
              <div className="grid grid-cols-5 gap-4 mb-6">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">总订单</div>
                  <div className="text-xl font-semibold">
                    {selectedReport.report.totalOrders}
                  </div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-sm text-slate-600">匹配</div>
                  <div className="text-xl font-semibold text-green-600">
                    {selectedReport.report.matchedOrders}
                  </div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="text-sm text-slate-600">异常</div>
                  <div className="text-xl font-semibold text-red-600">
                    {selectedReport.report.mismatchedOrders}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">总金额</div>
                  <div className="text-xl font-semibold">
                    {selectedReport.report.totalAmount}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-sm text-slate-600">差额</div>
                  <div className="text-xl font-semibold">
                    {selectedReport.report.difference}
                  </div>
                </div>
              </div>

              {/* 异常明细 */}
              <h4 className="font-medium mb-3">异常明细</h4>
              {selectedReport.mismatches.length === 0 ? (
                <div className="text-center text-slate-500 py-8">无异常记录</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">ID</th>
                      <th className="text-left py-2 px-2">关联类型</th>
                      <th className="text-left py-2 px-2">异常类型</th>
                      <th className="text-left py-2 px-2">期望值</th>
                      <th className="text-left py-2 px-2">实际值</th>
                      <th className="text-left py-2 px-2">严重级别</th>
                      <th className="text-left py-2 px-2">原因</th>
                      <th className="text-center py-2 px-2">状态</th>
                      <th className="text-center py-2 px-2">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReport.mismatches.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-slate-50">
                        <td className="py-2 px-2">{m.id}</td>
                        <td className="py-2 px-2 text-xs">{m.refType}</td>
                        <td className="py-2 px-2">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                            {MISMATCH_TYPE_LABELS[m.mismatchType] || m.mismatchType}
                          </span>
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {m.expectedValue || '-'}
                        </td>
                        <td className="py-2 px-2 font-mono text-xs">
                          {m.actualValue || '-'}
                        </td>
                        <td className="py-2 px-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${SEVERITY_COLORS[m.severity]}`}
                          >
                            {SEVERITY_LABELS[m.severity]}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-xs max-w-xs truncate" title={m.reason}>
                          {m.reason}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {m.resolved ? (
                            <span className="text-green-600 text-xs">已解决</span>
                          ) : (
                            <span className="text-orange-600 text-xs">待处理</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {!m.resolved && (
                            <button
                              onClick={() => handleResolve(m.id)}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              标记已解决
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
