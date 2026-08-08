import { useState, useEffect, useCallback, useMemo } from "react";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet, apiPost } from "../../services/api";

// ── API types ──

interface TicketData {
  id: number;
  ticket_no: string;
  title: string;
  category: string;
  category_label: string;
  priority: string;
  priority_label: string;
  status: string;
  status_label: string;
  user_id: number;
  email: string;
  username: string;
  assignee_id: number | null;
  assignee_name: string | null;
  content: string;
  is_spam: boolean;
  created_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

interface TicketReply {
  id: number;
  ticket_id: number;
  user_id: number;
  is_staff: boolean;
  content: string;
  attachments: string[];
  created_at: string;
}

interface TicketDetail {
  ticket: TicketData & { attachments: string[] };
  replies: TicketReply[];
  operation_logs: { id: number; action: string; detail: string; created_at: string }[];
}

interface TicketStats {
  pending: number;
  processing: number;
  resolved: number;
  closed: number;
}

const STAFF_MEMBERS = ["客服小王", "客服小李", "客服小张", "客服小赵"];

export default function AdminTickets() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [search, setSearch] = useState("");

  // ── Ticket list ──
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [stats, setStats] = useState<TicketStats>({ pending: 0, processing: 0, resolved: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // ── Detail ──
  const [selectedTicket, setSelectedTicket] = useState<TicketData | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState("");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: 1, limit: 200 };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (search) params.search = search;

      const data = await apiGet<{
        list: TicketData[];
        stats: TicketStats;
        avg_response_seconds: number;
        avg_resolve_seconds: number;
        pagination: { total: number };
      }>("/admin/tickets", params);
      setTickets(data.list ?? []);
      setStats(data.stats ?? { pending: 0, processing: 0, resolved: 0, closed: 0 });
    } catch (e: any) {
      setError(e.message ?? "加载工单列表失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, search]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  // ── Fetch detail when selected ──
  useEffect(() => {
    if (!selectedTicket) { setDetail(null); return; }
    setDetailLoading(true);
    apiGet<TicketDetail>(`/admin/tickets/${selectedTicket.id}`)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedTicket]);

  const filtered = useMemo(() => tickets, [tickets]); // server-side filtered

  const statusTabLabel = (s: string, label: string) => {
    const cnt = stats[s as keyof TicketStats] ?? 0;
    return `${label} (${cnt})`;
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setActionLoading(true);
    try {
      await apiPost(`/admin/tickets/${selectedTicket.id}/reply`, { content: replyText });
      setReplyText("");
      // Refresh detail
      const d = await apiGet<TicketDetail>(`/admin/tickets/${selectedTicket.id}`);
      setDetail(d);
      await fetchTickets();
    } catch (e: any) {
      alert(e.message ?? "回复失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async (ticketId: number, assigneeId: number) => {
    setActionLoading(true);
    try {
      await apiPost(`/admin/tickets/${ticketId}/assign`, { assignee_id: assigneeId });
      await fetchTickets();
      if (selectedTicket?.id === ticketId) setSelectedTicket(null);
    } catch (e: any) {
      alert(e.message ?? "分配失败");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (ticketId: number, newStatus: string) => {
    setActionLoading(true);
    try {
      await apiPost(`/admin/tickets/${ticketId}/status`, { status: newStatus });
      await fetchTickets();
      if (selectedTicket) {
        const d = await apiGet<TicketDetail>(`/admin/tickets/${ticketId}`);
        setDetail(d);
        setSelectedTicket((prev) => prev ? { ...prev, status: newStatus, status_label: newStatus } : null);
      }
    } catch (e: any) {
      alert(e.message ?? "状态变更失败");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h2 className="admin-page-title">
          工单管理
          <HelpModal title="工单管理">
            <p>管理客户提交的工单，数据来源于 GET /api/v1/admin/tickets。</p>
            <p><strong>状态流转</strong>：待处理 → 处理中 → 已解决 → 已关闭。</p>
            <p><strong>操作</strong>：回复 (POST /admin/tickets/:id/reply)、分配 (POST /admin/tickets/:id/assign)、状态变更 (POST /admin/tickets/:id/status)。</p>
          </HelpModal>
        </h2>
        <button className="btn btn-sm btn-secondary" onClick={fetchTickets} disabled={loading}>
          {loading ? "⏳" : "🔄"} 刷新
        </button>
      </div>

      {error && (
        <div className="panel" style={{ marginBottom: 12, background: "#fef2f2", borderColor: "#fecaca" }}>
          <div className="panel-body" style={{ color: "#dc2626" }}>⚠️ {error}</div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-body">
          <div className="filter-tabs">
            <button className={`filter-tab${statusFilter === "" ? " active" : ""}`} onClick={() => setStatusFilter("")}>
              全部 ({tickets.length})
            </button>
            <button className={`filter-tab${statusFilter === "pending" ? " active" : ""}`} onClick={() => setStatusFilter("pending")}>
              {statusTabLabel("pending", "⏳ 待处理")}
            </button>
            <button className={`filter-tab${statusFilter === "processing" ? " active" : ""}`} onClick={() => setStatusFilter("processing")}>
              {statusTabLabel("processing", "🔄 处理中")}
            </button>
            <button className={`filter-tab${statusFilter === "resolved" ? " active" : ""}`} onClick={() => setStatusFilter("resolved")}>
              {statusTabLabel("resolved", "✅ 已解决")}
            </button>
            <button className={`filter-tab${statusFilter === "closed" ? " active" : ""}`} onClick={() => setStatusFilter("closed")}>
              {statusTabLabel("closed", "🔒 已关闭")}
            </button>
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <select
              className="form-select"
              style={{ width: 120 }}
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">全部优先级</option>
              <option value="high">高</option>
              <option value="normal">中</option>
              <option value="low">低</option>
            </select>
            <input
              className="form-input"
              style={{ width: 200 }}
              placeholder="搜索工单号/标题/用户…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Ticket List */}
      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>工单号</th><th>用户</th><th>主题</th><th>分类</th><th>优先级</th><th>状态</th><th>负责人</th><th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? filtered.map((t) => (
                  <tr key={t.id} onClick={() => setSelectedTicket(t)} style={{ cursor: "pointer" }}>
                    <td className="text-mono" style={{ fontSize: 11 }}>{t.ticket_no}</td>
                    <td>{t.email || t.username || `#${t.user_id}`}</td>
                    <td>{t.title}</td>
                    <td>{t.category_label}</td>
                    <td>
                      <span className={`badge${t.priority === "high" ? " badge-danger" : t.priority === "urgent" ? " badge-danger" : t.priority === "normal" ? " badge-warning" : " badge-info"}`}>
                        {t.priority_label}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={
                        t.status === "pending" ? "warning" :
                        t.status === "processing" ? "info" :
                        t.status === "resolved" ? "success" : "inactive"
                      }>
                        {t.status_label}
                      </StatusBadge>
                    </td>
                    <td>{t.assignee_name || "—"}</td>
                    <td style={{ fontSize: 12 }}>{t.created_at ? new Date(t.created_at).toLocaleString("zh-CN") : "—"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8} style={{ textAlign: "center", padding: 40, color: "#888" }}>📭 没有符合条件的工单</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Ticket Detail Modal */}
      <Modal
        open={!!selectedTicket}
        onClose={() => { setSelectedTicket(null); setReplyText(""); }}
        title={`工单详情 — ${selectedTicket?.ticket_no ?? ""}`}
        width={640}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setSelectedTicket(null); setReplyText(""); }}>
              关闭
            </button>
            {selectedTicket && selectedTicket.status === "pending" && (
              <button
                className="btn btn-primary"
                disabled={actionLoading}
                onClick={() => handleStatusChange(selectedTicket.id, "processing")}
              >
                接单处理
              </button>
            )}
            {selectedTicket && selectedTicket.status === "processing" && (
              <button
                className="btn btn-primary"
                disabled={actionLoading}
                onClick={() => handleStatusChange(selectedTicket.id, "resolved")}
              >
                标记已解决
              </button>
            )}
            {selectedTicket && selectedTicket.status === "resolved" && (
              <button
                className="btn btn-secondary"
                disabled={actionLoading}
                onClick={() => handleStatusChange(selectedTicket.id, "closed")}
              >
                关闭工单
              </button>
            )}
          </>
        }
      >
        {selectedTicket && (
          <>
            <div className="admin-detail-grid" style={{ marginBottom: 16 }}>
              <div><strong>工单号：</strong>{selectedTicket.ticket_no}</div>
              <div><strong>用户：</strong>{selectedTicket.email || selectedTicket.username || `#${selectedTicket.user_id}`}</div>
              <div><strong>主题：</strong>{selectedTicket.title}</div>
              <div><strong>分类：</strong>{selectedTicket.category_label}</div>
              <div><strong>优先级：</strong>{selectedTicket.priority_label}</div>
              <div><strong>状态：</strong>{selectedTicket.status_label}</div>
              <div><strong>负责人：</strong>{selectedTicket.assignee_name || "—"}</div>
            </div>

            {/* Assign */}
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">分配客服</label>
              <select
                className="form-select"
                onChange={(e) => {
                  if (e.target.value) handleAssign(selectedTicket.id, Number(e.target.value));
                }}
                defaultValue=""
              >
                <option value="" disabled>选择客服 ID…</option>
                {/* In a full implementation, staff list would come from /admin/users */}
                <option value="1">客服小王 (ID:1)</option>
                <option value="2">客服小李 (ID:2)</option>
                <option value="3">客服小张 (ID:3)</option>
                <option value="4">客服小赵 (ID:4)</option>
              </select>
            </div>

            {/* Replies */}
            <div className="admin-ticket-replies">
              {detailLoading ? (
                <div style={{ padding: 20, textAlign: "center", color: "#888" }}>⏳ 加载详情…</div>
              ) : detail?.replies?.length ? detail.replies.map((r) => (
                <div key={r.id} className={`admin-ticket-reply${r.is_staff ? " staff" : ""}`}>
                  <div className="admin-ticket-reply-header">
                    <strong>{r.is_staff ? "客服" : "用户"} #{r.user_id}</strong>
                    <span className="text-muted text-sm">{new Date(r.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                  <div className="admin-ticket-reply-body">{r.content}</div>
                </div>
              )) : (
                <div style={{ padding: 20, textAlign: "center", color: "#888" }}>暂无回复记录</div>
              )}
            </div>

            {/* Reply form */}
            {selectedTicket.status !== "closed" && (
              <div style={{ marginTop: 16 }}>
                <label className="form-label">回复</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="输入回复内容…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={actionLoading || !replyText.trim()}
                    onClick={handleReply}
                  >
                    {actionLoading ? "发送中…" : "发送回复"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
