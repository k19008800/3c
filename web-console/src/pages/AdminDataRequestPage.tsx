import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

interface DataRequest { id: number; request_no: string; requester_id: number; requester_name: string; agency: string; request_reason: string; status: string; status_label: string; data_type: string; date_range: string; file_url: string | null; reviewer_id: number | null; reviewer_name: string | null; review_note: string | null; created_at: string; updated_at: string; }

export default function AdminDataRequestPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<DataRequest[]>([]);
  const [filter, setFilter] = useState("");
  const [reviewing, setReviewing] = useState<DataRequest | null>(null);
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  // New request form
  const [formAgency, setFormAgency] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formDataType, setFormDataType] = useState("user_info");
  const [formDateStart, setFormDateStart] = useState("");
  const [formDateEnd, setFormDateEnd] = useState("");

  useEffect(() => { loadRequests(); }, [filter]);

  async function loadRequests() {
    try {
      const r = await api.get("/admin/data-requests", { params: { status: filter || undefined } });
      setRequests(r.data?.data?.list ?? []);
    } catch {}
  }

  async function approve(id: number) {
    await api.post(`/admin/data-requests/${id}/approve`, { note });
    toast.success("已批准");
    setReviewing(null); setNote(""); loadRequests();
  }
  async function reject(id: number) {
    if (!note.trim()) { toast.error("驳回必须填写备注"); return; }
    await api.post(`/admin/data-requests/${id}/reject`, { note });
    toast.success("已驳回");
    setReviewing(null); setNote(""); loadRequests();
  }
  async function markExported(id: number) {
    await api.post(`/admin/data-requests/${id}/export`, {});
    toast.success("已标记导出");
    loadRequests();
  }
  async function submitRequest() {
    if (!formAgency || !formReason) { toast.error("请填写必填项"); return; }
    await api.post("/admin/data-requests", {
      agency: formAgency, request_reason: formReason, data_type: formDataType,
      date_start: formDateStart, date_end: formDateEnd,
    });
    toast.success("数据请求已提交");
    setShowForm(false); loadRequests();
  }

  const statusBadge = (s: DataRequest) => {
    const m: Record<string, [string, "success"|"warning"|"danger"|"info"|"default"]> = {
      pending: ["待审核", "warning"], reviewing: ["审核中", "info"], approved: ["已批准", "success"],
      rejected: ["已驳回", "danger"], exported: ["已导出", "default"], delivered: ["已交付", "success"],
    };
    const [label, type] = m[s.status] ?? [s.status_label ?? s.status, "default"];
    return <StatusBadge label={label} variant={type} />;
  };

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📦</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>数据导出请求管理
          <HelpIcon text="处理政府或合规机构的数据调取请求。支持审核、批准/驳回、导出、交付全流程。" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "#666" }}>状态筛选:</span>
        {["", "pending", "reviewing", "approved", "rejected", "exported"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "4px 14px", borderRadius: 14, border: filter === s ? "2px solid #4f6ef7" : "1px solid var(--color-border)",
            background: filter === s ? "#eef2ff" : "var(--color-panel)", color: filter === s ? "#4f6ef7" : "#666",
            cursor: "pointer", fontSize: 12,
          }}>{s === "" ? "全部" : s === "pending" ? "待审核" : s === "reviewing" ? "审核中" : s === "approved" ? "已批准" : s === "rejected" ? "已驳回" : "已导出"}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowForm(true)} style={{ padding: "6px 16px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          + 新建请求 <HelpIcon text="创建新的数据调取请求记录，由审核员处理。" />
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>申请机构 *</label>
              <input value={formAgency} onChange={e => setFormAgency(e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} placeholder="如XX市公安局" />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>数据类型</label>
              <select value={formDataType} onChange={e => setFormDataType(e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }}>
                <option value="user_info">用户信息</option><option value="financial">财务数据</option><option value="api_logs">API日志</option><option value="other">其他</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>日期起</label>
              <input type="date" value={formDateStart} onChange={e => setFormDateStart(e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>日期止</label>
              <input type="date" value={formDateEnd} onChange={e => setFormDateEnd(e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4 }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 4 }}>申请原因 *</label>
              <textarea value={formReason} onChange={e => setFormReason(e.target.value)} style={{ width: "100%", padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, minHeight: 60 }} placeholder="说明调取原因和法律依据" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={submitRequest} style={{ padding: "6px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>提交</button>
            <button onClick={() => setShowForm(false)} style={{ padding: "6px 16px", background: "var(--color-border)", border: "none", borderRadius: 4, cursor: "pointer" }}>取消</button>
          </div>
        </div>
      )}

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>编号</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>申请机构</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>数据类型</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>状态</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>审核人</th>
              <th style={{ padding: "10px 14px", textAlign: "left" }}>申请时间</th>
              <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(r => (
              <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 14px", fontFamily: "monospace", fontSize: 12, color: "#4f6ef7" }}>{r.request_no ?? `#${r.id}`}</td>
                <td style={{ padding: "8px 14px", fontWeight: 500 }}>{r.agency}</td>
                <td style={{ padding: "8px 14px" }}>{r.data_type}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>{statusBadge(r)}</td>
                <td style={{ padding: "8px 14px" }}>{r.reviewer_name ?? "-"}</td>
                <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ padding: "8px 14px", textAlign: "center" }}>
                  {r.status === "pending" && (
                    <button onClick={() => { setReviewing(r); setNote(""); }} style={{ padding: "2px 10px", border: "1px solid #4f6ef7", borderRadius: 4, background: "#eef2ff", color: "#4f6ef7", cursor: "pointer" }}>
                      审核 <HelpIcon text="批准或驳回该数据调取请求。" />
                    </button>
                  )}
                  {r.status === "approved" && (
                    <button onClick={() => markExported(r.id)} style={{ padding: "2px 10px", border: "1px solid #22c55e", borderRadius: 4, background: "#f0fdf4", color: "#22c55e", cursor: "pointer" }}>
                      标记导出 <HelpIcon text="标记数据已导出，准备交付。" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无数据请求</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="审核数据调取请求">
        {reviewing && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>申请机构：{reviewing.agency}</div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>数据类型：{reviewing.data_type}</div>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>申请原因：{reviewing.request_reason}</div>
              <div style={{ fontSize: 13, color: "#666" }}>日期范围：{reviewing.date_range ?? "-"}</div>
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              style={{ width: "100%", minHeight: 80, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13 }}
              placeholder="审核备注（驳回时必填）" />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => { setReviewing(null); }} style={{ padding: "8px 16px", border: "1px solid var(--color-border)", borderRadius: 6, background: "var(--color-panel)", cursor: "pointer" }}>取消</button>
              <button onClick={() => reject(reviewing.id)} style={{ padding: "8px 16px", background: "#e53935", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>驳回</button>
              <button onClick={() => approve(reviewing.id)} style={{ padding: "8px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>批准</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
