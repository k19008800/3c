import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";

// ── Types (mapped from admin/tickets endpoint) ──
interface TicketRecord {
  id: number;
  ticket_no: string;
  user_id: number;
  email: string;
  username: string;
  assignee_name: string;
  title: string;
  category: string;
  category_label: string;
  priority: string;
  priority_label: string;
  status: string;
  status_label: string;
  created_at: string;
  updated_at: string;
}

interface ApiListResponse {
  list: TicketRecord[];
  pagination: { page: number; page_size: number; total: number };
  stats: { pending: number; processing: number; resolved: number; closed: number };
}

interface TicketDetail {
  ticket: any;
  replies: any[];
  operation_logs: any[];
}

const PRIORITY_LABELS: Record<string, string> = { low: "低", normal: "普通", high: "高", urgent: "紧急" };
const TYPE_LABELS: Record<string, string> = { billing: "账单争议", service: "服务投诉", account: "账户问题", other: "其他" };

export default function AdminDispute() {
  const [records, setRecords] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ pending: 0, processing: 0, resolved: 0, closed: 0 });

  const [statusFilter, setStatusFilter] = useState("全部");
  const [priorityFilter, setPriorityFilter] = useState("全部");
  const [detailModal, setDetailModal] = useState<TicketRecord | null>(null);
  const [detailData, setDetailData] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, limit: pageSize };
      if (statusFilter !== "全部") params.status = statusFilter;
      if (priorityFilter !== "全部") params.priority = priorityFilter;
      const res = await api.get<ApiListResponse>("/admin/tickets", params);
      setRecords(res.list);
      setTotalCount(res.pagination.total);
      setStats(res.stats);
    } catch (e: any) {
      setError(e.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, priorityFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDetail = async (record: TicketRecord) => {
    setDetailModal(record);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await api.get<TicketDetail>(`/admin/tickets/${record.id}`);
      setDetailData(res);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  };

  const handleStatusChange = async (record: TicketRecord, newStatus: string) => {
    try {
      await api.post(`/admin/tickets/${record.id}/status`, { status: newStatus });
      setDetailModal(null);
      fetchData();
    } catch (e: any) {
      alert(e.message ?? "操作失败");
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const openCount = stats.pending + stats.processing;
  const resolvedCount = stats.resolved + stats.closed;

  return (
    <AdminLayout>
      <h1 className="page-title">
        争议处理
        <HelpModal title="争议处理">
          <p>管理用户的争议和投诉工单，跟踪处理流程。</p>
          <p style={{ marginTop: 8 }}>
            工单处理流程：待处理 → 处理中 → 已解决/已关闭。
            支持回复、分配和状态变更操作。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">工单处理与争议管理</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "工单总数", v: String(totalCount) },
          { l: "处理中", v: String(openCount) },
          { l: "已解决", v: String(resolvedCount) },
          { l: "待处理", v: String(stats.pending) },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panel-header">
          <span>工单列表</span>
          <div className="flex-wrap">
            <select className="form-select" style={{ width: 110 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              <option value="全部">全部状态</option>
              <option value="pending">待处理</option>
              <option value="processing">处理中</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </select>
            <select className="form-select" style={{ width: 100 }} value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}>
              <option value="全部">全部优先级</option>
              <option value="urgent">紧急</option>
              <option value="high">高</option>
              <option value="normal">普通</option>
              <option value="low">低</option>
            </select>
            <button className="btn btn-sm btn-secondary" onClick={() => { setStatusFilter("全部"); setPriorityFilter("全部"); setPage(1); }}>重置</button>
          </div>
        </div>

        {loading && <div className="panel-body"><div className="loading-spinner" /> 加载中...</div>}
        {error && <div className="panel-body"><div className="alert alert-danger">{error} <button className="btn btn-xs btn-secondary" onClick={fetchData}>重试</button></div></div>}

        {!loading && !error && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>工单号</th>
                    <th>用户</th>
                    <th>分类</th>
                    <th>标题</th>
                    <th>状态</th>
                    <th>优先级</th>
                    <th>负责人</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无工单</td></tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id} style={r.priority === "urgent" ? { background: "var(--color-danger-bg)" } : undefined}>
                        <td className="text-mono" style={{ fontSize: 11 }}>{r.ticket_no}</td>
                        <td>{r.email || r.username}</td>
                        <td>
                          <span className={`badge ${r.category === "billing" ? "badge-warning" : r.category === "service" ? "badge-info" : "badge-success"}`}>
                            {r.category_label}
                          </span>
                        </td>
                        <td>{r.title}</td>
                        <td>
                          <StatusBadge status={r.status === "pending" ? "pending" : r.status === "processing" ? "info" : r.status === "resolved" ? "success" : "inactive"}>
                            {r.status_label}
                          </StatusBadge>
                        </td>
                        <td>
                          <StatusBadge status={r.priority === "urgent" ? "error" : r.priority === "high" ? "warning" : r.priority === "normal" ? "info" : "default"}>
                            {PRIORITY_LABELS[r.priority] ?? r.priority_label}
                          </StatusBadge>
                        </td>
                        <td>{r.assignee_name ?? "-"}</td>
                        <td style={{ fontSize: 12 }}>{r.created_at ? new Date(r.created_at).toLocaleDateString("zh-CN") : "-"}</td>
                        <td>
                          <button className="btn btn-xs btn-secondary" onClick={() => openDetail(r)}>
                            处理
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-body">
              <div className="flex-between">
                <span className="text-sm text-muted">共 {totalCount} 条</span>
                <div className="flex-wrap">
                  <button className="btn btn-sm btn-secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const p = safePage <= 3 ? i + 1 : safePage >= totalPages - 2 ? totalPages - 4 + i : safePage - 2 + i;
                    return p >= 1 && p <= totalPages ? (
                      <button key={p} className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-secondary"}`} style={p === safePage ? undefined : { padding: "6px 12px" }} onClick={() => setPage(p)}>{p}</button>
                    ) : null;
                  })}
                  <button className="btn btn-sm btn-secondary" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail/Processing Modal */}
      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} title="工单处理" width={640}>
        {detailModal && (
          <>
            <table className="data-table">
              <tbody>
                <tr><td style={{ width: 100 }}>工单号</td><td className="text-mono">{detailModal.ticket_no}</td></tr>
                <tr><td>用户</td><td>{detailModal.email || detailModal.username}</td></tr>
                <tr><td>分类</td><td><span className="badge badge-warning">{detailModal.category_label}</span></td></tr>
                <tr><td>标题</td><td>{detailModal.title}</td></tr>
                <tr><td>状态</td><td><StatusBadge status={detailModal.status === "pending" ? "pending" : "info"}>{detailModal.status_label}</StatusBadge></td></tr>
                <tr><td>优先级</td><td><StatusBadge status={detailModal.priority === "urgent" ? "error" : "warning"}>{PRIORITY_LABELS[detailModal.priority] ?? detailModal.priority_label}</StatusBadge></td></tr>
                <tr><td>负责人</td><td>{detailModal.assignee_name ?? "未分配"}</td></tr>
                <tr><td>创建时间</td><td>{detailModal.created_at ? new Date(detailModal.created_at).toLocaleString("zh-CN") : "-"}</td></tr>
              </tbody>
            </table>

            {/* Operation Logs (from detail) */}
            {detailLoading && <div className="panel" style={{ marginTop: 12 }}><div className="panel-body"><div className="loading-spinner" /> 加载详情...</div></div>}

            {detailData && detailData.operation_logs && detailData.operation_logs.length > 0 && (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panel-header">
                  <span>📝 操作日志</span>
                </div>
                <div className="panel-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {detailData.operation_logs.map((log: any, i: number) => (
                      <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: i < detailData.operation_logs.length - 1 ? "1px solid var(--color-divider-light)" : "none", fontSize: 12 }}>
                        <span style={{ color: "var(--color-text-muted)", minWidth: 130 }}>{log.createdAt ? new Date(log.createdAt).toLocaleString("zh-CN") : "-"}</span>
                        <span style={{ fontWeight: 500 }}>{log.action}</span>
                        <span style={{ color: "var(--color-text-secondary)" }}>{log.detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              {detailModal.status === "pending" && (
                <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(detailModal, "processing")}>受理</button>
              )}
              {detailModal.status === "processing" && (
                <button className="btn btn-primary btn-sm" onClick={() => handleStatusChange(detailModal, "resolved")}>解决</button>
              )}
              {detailModal.status === "resolved" && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange(detailModal, "closed")}>关闭</button>
              )}
              {detailModal.status === "closed" && (
                <button className="btn btn-secondary btn-sm" onClick={() => handleStatusChange(detailModal, "pending")}>重开</button>
              )}
            </div>
          </>
        )}
      </Modal>
    </AdminLayout>
  );
}
