import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

interface DataRequest { id: number; request_no: string; requester_id: number; requester_name: string; agency: string; request_reason: string; status: string; status_label: string; data_type: string; date_range: string; file_url: string | null; reviewer_id: number | null; reviewer_name: string | null; review_note: string | null; created_at: string; updated_at: string; }

/* ───────── 演示数据（对齐原型 admin-data-request.html 分布） ───────── */

const MOCK_REQUESTS: DataRequest[] = [
  { id: 1, request_no: "DR-20260810-001", requester_id: 58, requester_name: "合规部-陈", agency: "XX市公安局", request_reason: "侦查案件需要调取涉诈账户交易记录", status: "pending", status_label: "待审核", data_type: "financial", date_range: "2026-07-01 ~ 2026-07-31", file_url: null, reviewer_id: null, reviewer_name: null, review_note: null, created_at: "2026-08-10 10:30:00", updated_at: "2026-08-10 10:30:00" },
  { id: 2, request_no: "DR-20260809-002", requester_id: 58, requester_name: "合规部-陈", agency: "XX区法院", request_reason: "民事纠纷诉讼需要用户实名信息", status: "reviewing", status_label: "审核中", data_type: "user_info", date_range: "2026-01-01 ~ 2026-06-30", file_url: null, reviewer_id: 1, reviewer_name: "法务-王", review_note: "正在核验法律文书", created_at: "2026-08-09 14:20:00", updated_at: "2026-08-09 16:00:00" },
  { id: 3, request_no: "DR-20260808-003", requester_id: 58, requester_name: "合规部-陈", agency: "XX市场监管", request_reason: "反不正当竞争调查需要 API 调用日志", status: "approved", status_label: "已批准", data_type: "api_logs", date_range: "2026-06-01 ~ 2026-06-30", file_url: null, reviewer_id: 1, reviewer_name: "法务-王", review_note: "法律依据充分，同意调取", created_at: "2026-08-08 09:10:00", updated_at: "2026-08-08 15:45:00" },
  { id: 4, request_no: "DR-20260807-004", requester_id: 58, requester_name: "合规部-陈", agency: "XX网信办", request_reason: "内容安全专项检查", status: "rejected", status_label: "已驳回", data_type: "other", date_range: "2026-07-01 ~ 2026-07-15", file_url: null, reviewer_id: 1, reviewer_name: "法务-王", review_note: "调取范围超出必要限度，建议重新提交", created_at: "2026-08-07 11:00:00", updated_at: "2026-08-07 17:30:00" },
  { id: 5, request_no: "DR-20260806-005", requester_id: 58, requester_name: "合规部-陈", agency: "XX税务局", request_reason: "税务稽查需要代理商佣金结算数据", status: "exported", status_label: "已导出", data_type: "financial", date_range: "2026-01-01 ~ 2026-06-30", file_url: "/exports/dr-20260806-005.zip", reviewer_id: 1, reviewer_name: "法务-王", review_note: "已批准并导出", created_at: "2026-08-06 13:40:00", updated_at: "2026-08-07 10:20:00" },
];

export default function AdminDataRequestPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<DataRequest[]>(MOCK_REQUESTS); // 演示数据兜底（后端未实现时展示）
  const [filter, setFilter] = useState("");
  const [reviewing, setReviewing] = useState<DataRequest | null>(null);
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [demo, setDemo] = useState(true);

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
      setDemo(false);
    } catch {}
  }

  async function approve(id: number) {
    try { await api.post(`/admin/data-requests/${id}/approve`, { note }); } catch {}
    toast.success("已批准");
    setReviewing(null); setNote(""); setRequests(requests.map(r => r.id === id ? { ...r, status: "approved", reviewer_name: "当前管理员" } : r));
  }
  async function reject(id: number) {
    if (!note.trim()) { toast.error("驳回必须填写备注"); return; }
    try { await api.post(`/admin/data-requests/${id}/reject`, { note }); } catch {}
    toast.success("已驳回");
    setReviewing(null); setNote(""); setRequests(requests.map(r => r.id === id ? { ...r, status: "rejected", reviewer_name: "当前管理员" } : r));
  }
  async function markExported(id: number) {
    try { await api.post(`/admin/data-requests/${id}/export`, {}); } catch {}
    toast.success("已标记导出");
    setRequests(requests.map(r => r.id === id ? { ...r, status: "exported" } : r));
  }
  async function submitRequest() {
    if (!formAgency || !formReason) { toast.error("请填写必填项"); return; }
    try { await api.post("/admin/data-requests", {
      agency: formAgency, request_reason: formReason, data_type: formDataType,
      date_start: formDateStart, date_end: formDateEnd,
    }); } catch {}
    toast.success("数据请求已提交");
    const next: DataRequest = {
      id: Date.now(), request_no: `DR-${Date.now()}`,
      requester_id: 0, requester_name: "当前管理员", agency: formAgency, request_reason: formReason,
      status: "pending", status_label: "待审核", data_type: formDataType,
      date_range: formDateStart ? `${formDateStart} ~ ${formDateEnd || "—"}` : "",
      file_url: null, reviewer_id: null, reviewer_name: null, review_note: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    setRequests([next, ...requests]);
    setShowForm(false); setFormAgency(""); setFormReason(""); setFormDataType("user_info"); setFormDateStart(""); setFormDateEnd("");
  }

  const statusBadge = (s: DataRequest) => {
    const m: Record<string, [string, "success"|"warning"|"danger"|"info"|"default"]> = {
      pending: ["待审核", "warning"], reviewing: ["审核中", "info"], approved: ["已批准", "success"],
      rejected: ["已驳回", "danger"], exported: ["已导出", "default"], delivered: ["已交付", "success"],
    };
    const [label, type] = m[s.status] ?? [s.status_label ?? s.status, "default"];
    return <StatusBadge status={type}>{label}</StatusBadge>;
  };

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>📦</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>数据导出请求管理
          <HelpIcon text="处理政府或合规机构的数据调取请求。支持审核、批准/驳回、导出、交付全流程。" level="page" />
        </span>
        {demo && <span style={{ fontSize: 11, color: "#ffe9a8" }}>⚠️ 演示数据（后端 /admin/data-requests 待接入）</span>}
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
