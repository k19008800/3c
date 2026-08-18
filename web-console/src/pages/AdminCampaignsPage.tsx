import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

interface Campaign {
  id: number; name: string; description: string | null; status: string; status_label: string;
  type: string; type_label: string; budget_amount: number; issued_amount: number; participant_count: number;
  start_at: string | null; end_at: string | null; created_by_email: string;
}
interface Participant { user_id: number; email: string; username: string; amount: number; trigger_type: string; created_at: string; }

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  draft: "default",
  active: "success",
  ended: "warning",
  archived: "info",
};
const FILTERS = [{ value: "", label: "全部" }, { value: "draft", label: "草稿" }, { value: "active", label: "进行中" }, { value: "ended", label: "已结束" }, { value: "archived", label: "已归档" }];
const STATUS_LABEL: Record<string, string> = { draft: "草稿", active: "进行中", ended: "已结束", archived: "已归档" };
const TYPE_LABEL: Record<string, string> = { recharge_gift: "充值赠送", new_user: "新用户礼", discount: "折扣活动" };

export default function AdminCampaignsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [editor, setEditor] = useState<{ id?: number | null; name: string; type: string; budget_amount: string; description: string; start_at: string; end_at: string } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [grantForm, setGrantForm] = useState({ user_id: "", amount: "" });
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["admin-campaigns", status],
    queryFn: async () => (await api.get<{ data: { list: Campaign[] } }>(`/admin/campaigns?status=${status}&page_size=50`)).data.data,
    retry: 0,
  });
  const list = listQ.data?.list ?? [];

  // 活动详情（含参与者列表），直连 GET /admin/campaigns/:id
  const detailQ = useQuery({
    queryKey: ["admin-campaign-detail", detailId],
    queryFn: async () => (await api.get<{ data: { campaign: Campaign; participants: Participant[] } }>(`/admin/campaigns/${detailId}`)).data.data,
    enabled: detailId != null,
    retry: 0,
  });
  const detail = detailQ.data ?? null;

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = { name: editor!.name, type: editor!.type, budget_amount: Number(editor!.budget_amount), description: editor!.description, start_at: editor!.start_at || undefined, end_at: editor!.end_at || undefined };
      return editor!.id ? (await api.put(`/admin/campaigns/${editor!.id}`, body)).data : (await api.post("/admin/campaigns", body)).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已保存"); setEditor(null); qc.invalidateQueries({ queryKey: ["admin-campaigns"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });
  const statusMut = useMutation<any, unknown, { id: number; status: string }>({
    mutationFn: async ({ id, status }: { id: number; status: string }) => (await api.post(`/admin/campaigns/${id}/status`, { status })).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已切换"); qc.invalidateQueries({ queryKey: ["admin-campaigns"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });
  const delMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.delete(`/admin/campaigns/${id}`)).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已删除"); qc.invalidateQueries({ queryKey: ["admin-campaigns"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });
  const grantMut = useMutation<any, unknown, { userId: number; amount: number }>({
    mutationFn: async ({ userId, amount }: { userId: number; amount: number }) => (await api.post(`/admin/campaigns/${detailId}/grant`, { user_id: userId, amount })).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已发放"); setGrantForm({ user_id: "", amount: "" }); qc.invalidateQueries({ queryKey: ["admin-campaign-detail"] }); qc.invalidateQueries({ queryKey: ["admin-campaigns"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        营销活动
        <HelpIcon text="管理平台营销活动。创建充值赠送、新用户礼、折扣活动等，支持发布/结束/归档生命周期管理，可向指定用户发放奖励。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map(f => <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>{f.label}</button>)}
        <button onClick={() => setEditor({ id: null, name: "", type: "new_user", budget_amount: "0", description: "", start_at: "", end_at: "" })} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", marginLeft: "auto" }}>+ 新建活动 <HelpIcon text="创建营销活动：填写名称、类型与预算后保存为草稿，再发布上线。" /></button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : list.length === 0 ? <EmptyState title="暂无活动" /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}><th style={{ padding: "8px" }}>活动名</th><th style={{ padding: "8px" }}>类型</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>预算</th><th style={{ padding: "8px" }}>已发放</th><th style={{ padding: "8px" }}>参与</th><th style={{ padding: "8px" }}>操作</th></tr></thead>
            <tbody>
              {list.map(c => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: "8px" }}>{c.type_label}</td>
                  <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[c.status] ?? "default"}>{c.status_label}</StatusBadge></td>
                  <td style={{ padding: "8px" }}>¥{c.budget_amount.toLocaleString()}</td>
                  <td style={{ padding: "8px", color: "var(--color-success-text)" }}>¥{c.issued_amount.toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>{c.participant_count}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setDetailId(c.id)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", padding: "4px 10px" }}>详情 <HelpIcon text="查看活动参与者与已发放金额，可向指定用户手动发放奖励。" /></button>
                    {c.status === "draft" && <button onClick={() => statusMut.mutate({ id: c.id, status: "active" })} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", padding: "4px 10px", marginLeft: 6 }}>发布 <HelpIcon text="将草稿活动发布为进行中，发布后用户可参与。" /></button>}
                    {c.status === "active" && <button onClick={() => statusMut.mutate({ id: c.id, status: "ended" })} style={{ ...btnBase, background: "var(--color-warning-text)", color: "#fff", padding: "4px 10px", marginLeft: 6 }}>结束 <HelpIcon text="结束进行中的活动，结束后不再发放奖励。" /></button>}
                    <button onClick={() => setEditor({ id: c.id, name: c.name, type: c.type, budget_amount: String(c.budget_amount), description: c.description ?? "", start_at: c.start_at ?? "", end_at: c.end_at ?? "" })} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", padding: "4px 10px", marginLeft: 6 }}>编辑 <HelpIcon text="修改活动名称、类型、预算与时间范围。" /></button>
                    <button onClick={() => delMut.mutate(c.id)} style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px", marginLeft: 6 }}>删除 <HelpIcon text="删除活动及其参与记录，不可恢复。" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editor} onClose={() => setEditor(null)} title={editor?.id ? "编辑活动" : "新建活动"} width={520}>
        {editor && (
          <>
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
              <button onClick={() => setEditor(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editor.name} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>{saveMut.isPending ? "保存中..." : "保存"}</button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetailId(null)} title={`${detail?.campaign.name ?? ""} · 详情`} width={600}>
        {detail && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>预算 ¥{detail.campaign.budget_amount} · 已发 ¥{detail.campaign.issued_amount} · 参与 {detail.campaign.participant_count} 人</div>
            {detail.campaign.status === "active" && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, background: "var(--color-bg)", padding: 10, borderRadius: 8 }}>
                <input value={grantForm.user_id} onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })} placeholder="用户 ID" type="number" style={{ ...inp, marginBottom: 0, width: 100 }} />
                <input value={grantForm.amount} onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })} placeholder="金额(元)" type="number" style={{ ...inp, marginBottom: 0, width: 100 }} />
                <button onClick={() => grantMut.mutate({ userId: Number(grantForm.user_id), amount: Number(grantForm.amount) })} disabled={!grantForm.user_id || !grantForm.amount} style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", whiteSpace: "nowrap" }}>发放 <HelpIcon text="向指定用户手动发放奖励，发放金额计入用户余额并写入资金流水。" /></button>
              </div>
            )}
            <div style={{ color: "var(--color-text-secondary)", fontSize: 13, marginBottom: 8 }}>参与记录</div>
            {detail.participants.length === 0 ? <EmptyState title="暂无参与者" /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}><th>用户</th><th>金额</th><th>触发</th><th>时间</th></tr></thead>
                <tbody>
                  {detail.participants.map((p, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: "6px" }}>{p.email}</td><td style={{ padding: "6px", color: "var(--color-success-text)" }}>¥{p.amount}</td><td style={{ padding: "6px" }}>{p.trigger_type}</td><td style={{ padding: "6px", color: "var(--color-text-secondary)", fontSize: 12 }}>{new Date(p.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
