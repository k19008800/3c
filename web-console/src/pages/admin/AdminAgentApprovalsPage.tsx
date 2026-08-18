import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, Modal, SkeletonGroup, useToast, ConfirmPopover, EmptyState } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/** 后端报备 DTO（api/src/routes/admin-misc-missing.ts GET /admin/agents/approvals） */
interface ApprovalItem {
  id: number;
  agent_id: number;
  agent_name: string;
  customer_id: number;
  customer_email: string;
  customer_name: string | null;
  customer_company: string | null;
  status: "pending" | "approved" | "bound" | "rejected";
  reject_reason: string | null;
  note: string | null;
  reviewer: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string | null;
  total_commission: number | null;
}

interface ApprovalsData {
  approvals: ApprovalItem[];
  summary: { pending: number; approved: number; bound: number; rejected: number };
}

/** 金额展示（元 → ¥12,480.50） */
function fmtMoney(v: number | null | undefined): string {
  return `¥${Number(v ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminAgentApprovalsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [keyword, setKeyword] = useState("");
  const [agent, setAgent] = useState("");
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-agent-approvals", keyword, agent],
    queryFn: async () => (await api.get(`/admin/agents/approvals?keyword=${encodeURIComponent(keyword)}&agent=${encodeURIComponent(agent)}`)).data.data,
    retry: 0,
  });

  const data: ApprovalsData | undefined = listQ.data;
  const approvals: ApprovalItem[] = data?.approvals ?? [];
  const summary = data?.summary ?? { pending: 0, approved: 0, bound: 0, rejected: 0 };

  // 客户端按状态分组（后端返回扁平 approvals 数组）
  const pending = approvals.filter((a) => a.status === "pending");
  const approved = approvals.filter((a) => a.status === "approved");
  const rejected = approvals.filter((a) => a.status === "rejected");
  const bound = approvals.filter((a) => a.status === "bound");

  // 代理商下拉（由当前数据去重派生；全部=空串）
  const agentOptions = [...new Set(approvals.map((a) => a.agent_name).filter(Boolean))] as string[];

  const approveMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/agents/approvals/${id}/approve`)).data,
    onSuccess: () => { toast.success("已通过"); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  const rejectMut = useMutation<any, unknown, { id: number; reason: string }>({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await api.post(`/admin/agents/approvals/${id}/reject`, { reason })).data,
    onSuccess: () => { toast.success("已驳回"); setRejecting(null); setRejectReason(""); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  const rereviewMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/agents/approvals/${id}/re-review`)).data,
    onSuccess: () => { toast.success("已重新审核"); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  const unbindMut = useMutation<any, unknown, { id: number; from: "approved" | "bound" }>({
    mutationFn: async ({ id, from }: { id: number; from: "approved" | "bound" }) => (await api.post(`/admin/agents/approvals/${id}/unbind`, { from })).data,
    onSuccess: () => { toast.success("已解绑"); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  const statCard = (color: string, badge: number, icon: string, label: string, value: number, unit: string) => (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: "16px 20px" }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{badge}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "#888" }}>{icon} {label}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{value}<span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>{unit}</span></div>
      </div>
    </div>
  );

  const subTab = (key: "pending" | "approved" | "rejected", icon: string, label: string, count?: number) => (
    <button onClick={() => setTab(key)} style={{
      padding: "8px 20px", borderRadius: 8, border: tab === key ? "2px solid #4f6ef7" : "1px solid var(--color-border)",
      background: tab === key ? "#eef2ff" : "var(--color-panel)", color: tab === key ? "#4f6ef7" : "#666",
      cursor: "pointer", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6,
    }}>
      {icon} {label} {count != null && <span style={{ background: tab === key ? "#4f6ef7" : "#e0e0e0", color: tab === key ? "#fff" : "#888", borderRadius: 10, padding: "0 7px", fontSize: 11 }}>{count}</span>}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>代理商客户报备审核</h2>
        <HelpIcon text="审核代理商提交的客户报备申请。通过后客户与代理商建立绑定关系，客户消费计入代理商佣金。" level="page" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
        {statCard("#e53935", summary.pending, "⏳", "待审核报备", summary.pending, "笔")}
        {statCard("#4f6ef7", summary.approved + summary.bound, "✅", "已通过/已绑定", summary.approved + summary.bound, "笔")}
        {statCard("#f59e0b", summary.rejected, "❌", "已驳回", summary.rejected, "笔")}
      </div>

      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={agent} onChange={e => setAgent(e.target.value)}>
          <option value="">全部代理商</option>
          {agentOptions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索客户邮箱/公司名..." value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {subTab("pending", "⏳", "待审核", pending.length)}
        {subTab("approved", "✅", "已通过", approved.length)}
        {subTab("rejected", "❌", "已驳回", rejected.length)}
      </div>

      {listQ.isLoading ? <SkeletonGroup lines={5} /> : listQ.isError ? (
        <EmptyState title="加载失败" description="无法获取报备审核列表，请检查后端服务或稍后重试" />
      ) : (
        <>
          {tab === "pending" && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>待审核报备列表 <HelpIcon text="查看待审核的报备列表，点击「通过」或「驳回」进行审核操作。" /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户公司名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>报备时间</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>备注</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
                </tr></thead>
                <tbody>
                  {pending.map((p: ApprovalItem) => (
                    <tr key={p.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{p.agent_name}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{p.customer_email}</td>
                      <td style={{ padding: "10px 12px" }}>{p.customer_company ?? p.customer_name ?? "-"}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{p.created_at ? new Date(p.created_at).toLocaleString("zh-CN") : "-"}</td>
                      <td style={{ padding: "10px 12px", color: "#888" }}>{p.note ?? "-"}</td>
                      <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                        <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }}
                          onClick={() => approveMut.mutate(p.id)}>通过</button>
                        <button style={{ ...btnBase, background: "#fff", border: "1px solid #e53935", color: "#e53935", fontSize: 12 }}
                          onClick={() => { setRejecting(p); setRejectReason(""); }}>驳回</button>
                      </td>
                    </tr>
                  ))}
                  {pending.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无待审核报备</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === "approved" && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>已通过报备列表 <HelpIcon text="查看已通过的报备记录（已解绑/未绑定），如需解除绑定关系可点击「解绑」。" /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>通过时间</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>审核人</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
                </tr></thead>
                <tbody>
                  {approved.map((a: ApprovalItem) => (
                    <tr key={a.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{a.agent_name}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{a.customer_email}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{a.reviewed_at ? new Date(a.reviewed_at).toLocaleString("zh-CN") : "-"}</td>
                      <td style={{ padding: "10px 12px" }}>{a.reviewer ?? "-"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <ConfirmPopover title={`确认解绑 ${a.customer_email}？`} onConfirm={() => unbindMut.mutate({ id: a.id, from: "approved" })}>
                          <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}>解绑</button>
                        </ConfirmPopover>
                      </td>
                    </tr>
                  ))}
                  {approved.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无已通过报备</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === "rejected" && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>已驳回报备列表 <HelpIcon text="查看被驳回的报备记录，可点击「重新审核」重新进入审核流程。" /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>驳回时间</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>驳回原因</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>审核人</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
                </tr></thead>
                <tbody>
                  {rejected.map((r: ApprovalItem) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.agent_name}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{r.customer_email}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{r.reviewed_at ? new Date(r.reviewed_at).toLocaleString("zh-CN") : "-"}</td>
                      <td style={{ padding: "10px 12px", color: "#e53935" }}>{r.reject_reason ?? "-"}</td>
                      <td style={{ padding: "10px 12px" }}>{r.reviewer ?? "-"}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 12 }}
                          onClick={() => rereviewMut.mutate(r.id)}>重新审核</button>
                      </td>
                    </tr>
                  ))}
                  {rejected.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无已驳回报备</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>已绑定客户列表 <HelpIcon text="展示当前所有代理商-客户绑定关系及累计贡献佣金。" /></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f8f9fa" }}>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>绑定时间</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>累计贡献佣金</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
              </tr></thead>
              <tbody>
                {bound.map((b: ApprovalItem) => (
                  <tr key={b.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>{b.agent_name}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{b.customer_email}</td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{b.reviewed_at ? new Date(b.reviewed_at).toLocaleString("zh-CN") : "-"}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#22c55e" }}>{fmtMoney(b.total_commission)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <ConfirmPopover title={`确认解绑 ${b.customer_email}？`} onConfirm={() => unbindMut.mutate({ id: b.id, from: "bound" })}>
                        <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}>解绑</button>
                      </ConfirmPopover>
                    </td>
                  </tr>
                ))}
                {bound.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无绑定客户</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rejecting && (
        <Modal open onClose={() => setRejecting(null)} title={`驳回报备 · ${rejecting.customer_email}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
            <div style={{ fontSize: 13, color: "#666" }}>
              代理商：{rejecting.agent_name} · 客户：{rejecting.customer_company ?? rejecting.customer_name ?? rejecting.customer_email}
            </div>
            <label>驳回原因 <span style={{ color: "#e53935" }}>*</span>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="请填写驳回原因（必填）"
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", minHeight: 80, marginTop: 4 }} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd" }} onClick={() => setRejecting(null)}>取消</button>
              <button style={{ ...btnBase, background: "#e53935", color: "#fff" }}
                disabled={!rejectReason.trim()}
                onClick={() => rejectMut.mutate({ id: rejecting.id, reason: rejectReason.trim() })}>确认驳回</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
