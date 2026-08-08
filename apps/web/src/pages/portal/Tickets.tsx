import { useState, useEffect, useCallback } from "react";
import PortalLayout from "../../components/PortalLayout";
import HelpIcon from "../../components/HelpIcon";
import Modal from "../../components/Modal";
import api from "../../services/api";

interface Ticket {
  id: string;
  number: string;
  title: string;
  status: "open" | "processing" | "closed";
  priority: "low" | "medium" | "high";
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  open: { label: "待处理", cls: "badge-warning" },
  processing: { label: "处理中", cls: "badge-info" },
  closed: { label: "已关闭", cls: "badge-default" },
};

const PRIORITY_MAP: Record<string, { label: string; cls: string }> = {
  low: { label: "低", cls: "badge-default" },
  medium: { label: "中", cls: "badge-info" },
  high: { label: "高", cls: "badge-danger" },
};

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    priority: "medium",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const formatTime = (ticket: Ticket) => ticket.created_at || ticket.createdAt || "";
  const formatUpdateTime = (ticket: Ticket) => ticket.updated_at || ticket.updatedAt || "";

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await api.get<Ticket[]>("/me/tickets");
      if (error) throw new Error(error);
      setTickets(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载工单列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleCreate = async () => {
    if (!createForm.title.trim() || !createForm.description.trim()) {
      showToast("请填写完整的工单信息", "error");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await api.post("/me/tickets", {
        title: createForm.title,
        priority: createForm.priority,
        description: createForm.description,
      });
      if (error) throw new Error(error);
      setShowCreate(false);
      setCreateForm({ title: "", priority: "medium", description: "" });
      showToast("工单创建成功！客服将尽快处理");
      fetchTickets();
    } catch (e: any) {
      showToast(e.message || "创建工单失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalLayout>
      {toast && (
        <div className={`toast${toast.type === "error" ? " error" : ""}`}>
          {toast.message}
        </div>
      )}

      <h1 className="page-title">
        工单 <HelpIcon title="提交技术支持工单，查看工单处理进度" />
      </h1>
      <p className="page-subtitle">提交和管理您的技术支持工单</p>

      <div className="section mt-4">
        {loading ? (
          <div className="empty-state"><div className="empty-state-icon">⏳</div><div>加载中...</div></div>
        ) : loadError ? (
          <div className="empty-state"><div className="empty-state-icon">⚠️</div><div>{loadError}</div></div>
        ) : (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}>工单列表</div>
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + 新建工单 <HelpIcon title="描述您遇到的问题或需求，提交工单" />
            </button>
          </div>
          {tickets.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎫</div>
              <div>暂无工单</div>
            </div>
          ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>工单编号</th>
                  <th>标题</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => {
                  const status = STATUS_MAP[ticket.status] || STATUS_MAP["open"];
                  const priority = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP["medium"];
                  return (
                    <tr key={ticket.id}>
                      <td style={{ fontFamily: "monospace" }}>{ticket.number}</td>
                      <td>{ticket.title}</td>
                      <td>
                        <span className={`badge ${priority.cls}`}>{priority.label}</span>
                      </td>
                      <td>
                        <span className={`badge ${status.cls}`}>{status.label}</span>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        {formatTime(ticket)}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        {formatUpdateTime(ticket)}
                      </td>
                      <td>
                        <div className="flex-row gap-2">
                          <button className="btn btn-outline btn-sm">查看详情</button>
                          {ticket.status !== "closed" && (
                            <button className="btn btn-danger btn-sm" style={{ fontSize: 12 }}>
                              关闭
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="新建工单">
        <div className="form-group">
          <label className="form-label">工单标题 <HelpIcon title="简明扼要地描述您的问题或需求" /></label>
          <input
            className="form-input"
            type="text"
            placeholder="请输入工单标题"
            value={createForm.title}
            onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">优先级</label>
          <select
            className="form-input"
            value={createForm.priority}
            onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))}
          >
            <option value="low">低 — 一般咨询</option>
            <option value="medium">中 — 功能需求</option>
            <option value="high">高 — 影响使用</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">详细描述 <HelpIcon title="详细描述问题现象、复现步骤和期望结果" /></label>
          <textarea
            className="form-textarea"
            rows={4}
            placeholder="请详细描述您遇到的问题或需求..."
            value={createForm.description}
            onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="flex-row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-outline" onClick={() => setShowCreate(false)}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={submitting || !createForm.title || !createForm.description}
          >
            {submitting ? "提交中..." : "提交工单"}
          </button>
        </div>
      </Modal>
    </PortalLayout>
  );
}
