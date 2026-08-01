import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface Campaign {
  id: number; name: string; description: string | null; status: string; status_label: string;
  type: string; type_label: string; budget_amount: number; issued_amount: number; participant_count: number;
  start_at: string | null; end_at: string | null; created_by_email: string;
}
interface Participant { user_id: number; email: string; username: string; amount: number; trigger_type: string; created_at: string; }

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = { draft: { bg: "#f1f5f9", color: "#475569" }, active: { bg: "#dcfce7", color: "#166534" }, ended: { bg: "#fef3c7", color: "#92400e" }, archived: { bg: "#e2e8f0", color: "#64748b" } };
const FILTERS = [{ value: "", label: "全部" }, { value: "draft", label: "草稿" }, { value: "active", label: "进行中" }, { value: "ended", label: "已结束" }, { value: "archived", label: "已归档" }];

export default function AdminCampaignsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<{ id?: number | null; name: string; type: string; budget_amount: string; description: string; start_at: string; end_at: string } | null>(null);
  const [detail, setDetail] = useState<{ campaign: Campaign; participants: Participant[] } | null>(null);
  const [grantForm, setGrantForm] = useState({ user_id: "", amount: "" });
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-campaigns", status],
    queryFn: async () => (await api.get<{ data: { list: Campaign[] } }>(`/admin/campaigns?status=${status}&page_size=50`)).data.data,
  });
  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { name: editor!.name, type: editor!.type, budget_amount: Number(editor!.budget_amount), description: editor!.description, start_at: editor!.start_at || undefined, end_at: editor!.end_at || undefined };
      return editor!.id ? (await api.put(`/admin/campaigns/${editor!.id}`, body)).data : (await api.post("/admin/campaigns", body)).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已保存" }); setEditor(null); qc.invalidateQueries({ queryKey: ["admin-campaigns"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => (await api.post(`/admin/campaigns/${id}/status`, { status })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已切换" }); qc.invalidateQueries({ queryKey: ["admin-campaigns"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const delMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/campaigns/${id}`)).data,
    onSuccess: () => { setNotice({ type: "success", msg: "已删除" }); qc.invalidateQueries({ queryKey: ["admin-campaigns"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const grantMut = useMutation({
    mutationFn: async ({ userId, amount }: { userId: number; amount: number }) => (await api.post(`/admin/campaigns/${detail!.campaign.id}/grant`, { user_id: userId, amount })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已发放" }); setGrantForm({ user_id: "", amount: "" }); qc.invalidateQueries({ queryKey: ["admin-campaign-detail"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const openDetail = async (id: number) => {
    try { const d = (await api.get<{ data: { campaign: Campaign; participants: Participant[] } }>(`/admin/campaigns/${id}`)).data.data; setDetail(d); } catch (e) { setNotice({ type: "error", msg: extractError(e) }); }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>营销活动</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map(f => <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "#2563eb" : "#fff", color: status === f.value ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{f.label}</button>)}
        <button onClick={() => setEditor({ id: null, name: "", type: "new_user", budget_amount: "0", description: "", start_at: "", end_at: "" })} style={{ ...btnBase, background: "#2563eb", color: "#fff", marginLeft: "auto" }}>+ 新建活动</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? <div style={{ color: "#94a3b8" }}>暂无活动</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th style={{ padding: "8px" }}>活动名</th><th style={{ padding: "8px" }}>类型</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>预算</th><th style={{ padding: "8px" }}>已发放</th><th style={{ padding: "8px" }}>参与</th><th style={{ padding: "8px" }}>操作</th></tr></thead>
            <tbody>
              {listQ.data?.list.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "8px" }}>{c.type_label}</td>
                  <td style={{ padding: "8px" }}><span style={{ ...(STATUS_STYLE[c.status] ?? STATUS_STYLE.draft), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{c.status_label}</span></td>
                  <td style={{ padding: "8px" }}>¥{c.budget_amount.toLocaleString()}</td>
                  <td style={{ padding: "8px", color: "#166534" }}>¥{c.issued_amount.toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>{c.participant_count}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => openDetail(c.id)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px" }}>详情</button>
                    {c.status === "draft" && <button onClick={() => statusMut.mutate({ id: c.id, status: "active" })} style={{ ...btnBase, background: "#16a34a", color: "#fff", padding: "4px 10px", marginLeft: 6 }}>发布</button>}
                    {c.status === "active" && <button onClick={() => statusMut.mutate({ id: c.id, status: "ended" })} style={{ ...btnBase, background: "#d97706", color: "#fff", padding: "4px 10px", marginLeft: 6 }}>结束</button>}
                    <button onClick={() => setEditor({ id: c.id, name: c.name, type: c.type, budget_amount: String(c.budget_amount), description: c.description ?? "", start_at: c.start_at ?? "", end_at: c.end_at ?? "" })} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", padding: "4px 10px", marginLeft: 6 }}>编辑</button>
                    <button onClick={() => delMut.mutate(c.id)} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", marginLeft: 6 }}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 编辑弹窗 */}
      {editor && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 520 }}>
            <h3 style={{ marginBottom: 16 }}>{editor.id ? "编辑活动" : "新建活动"}</h3>
            <input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} placeholder="活动名称 *" style={inp} />
            <select value={editor.type} onChange={(e) => setEditor({ ...editor, type: e.target.value })} style={inp}>
              <option value="recharge_gift">充值赠送</option><option value="new_user">新用户礼</option><option value="discount">折扣活动</option>
            </select>
            <input value={editor.budget_amount} onChange={(e) => setEditor({ ...editor, budget_amount: e.target.value })} placeholder="预算金额(元)" type="number" style={inp} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input value={editor.start_at} onChange={(e) => setEditor({ ...editor, start_at: e.target.value })} placeholder="开始时间" type="datetime-local" style={inp} />
              <input value={editor.end_at} onChange={(e) => setEditor({ ...editor, end_at: e.target.value })} placeholder="结束时间" type="datetime-local" style={inp} />
            </div>
            <textarea value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} placeholder="活动描述" rows={2} style={{ ...inp, resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditor(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editor.name} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{saveMut.isPending ? "保存中..." : "保存"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 详情弹窗（发放 + 参与） */}
      {detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 600, maxHeight: "85vh", overflow: "auto" }}>
            <h3 style={{ marginBottom: 12 }}>{detail.campaign.name} · 详情</h3>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>预算 ¥{detail.campaign.budget_amount} · 已发 ¥{detail.campaign.issued_amount} · 参与 {detail.campaign.participant_count} 人</div>
            {detail.campaign.status === "active" && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, background: "#f8fafc", padding: 10, borderRadius: 8 }}>
                <input value={grantForm.user_id} onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })} placeholder="用户 ID" type="number" style={{ ...inp, marginBottom: 0, width: 100 }} />
                <input value={grantForm.amount} onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })} placeholder="金额(元)" type="number" style={{ ...inp, marginBottom: 0, width: 100 }} />
                <button onClick={() => grantMut.mutate({ userId: Number(grantForm.user_id), amount: Number(grantForm.amount) })} disabled={!grantForm.user_id || !grantForm.amount} style={{ ...btnBase, background: "#16a34a", color: "#fff", whiteSpace: "nowrap" }}>发放</button>
              </div>
            )}
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>参与记录</div>
            {detail.participants.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>暂无参与者</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: "#64748b", textAlign: "left" }}><th>用户</th><th>金额</th><th>触发</th><th>时间</th></tr></thead>
                <tbody>
                  {detail.participants.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px" }}>{p.email}</td><td style={{ padding: "6px", color: "#166534" }}>¥{p.amount}</td><td style={{ padding: "6px" }}>{p.trigger_type}</td><td style={{ padding: "6px", color: "#64748b", fontSize: 12 }}>{new Date(p.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 16, textAlign: "right" }}><button onClick={() => setDetail(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button></div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
