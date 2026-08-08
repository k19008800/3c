import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

interface Batch {
  id: number;
  name: string;
  amount: number;
  total_count: number;
  used_count: number;
  status: string;
  status_label: string;
  note: string | null;
  created_at: string;
  expires_at: string | null;
}
interface CodeItem { id: number; code: string; status: string; used_by_email: string | null; used_at: string | null; }

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

export default function AdminRedemptionPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", amount: "", total_count: "10", expires_at: "", note: "" });
  const { toast } = useToast();

  const listQ = useQuery({
    queryKey: ["admin-redemption"],
    queryFn: async () => (await api.get<{ data: { list: Batch[] } }>("/admin/redemption/batches")).data.data,
  });
  const detailQ = useQuery({
    queryKey: ["admin-redemption-detail", detailId],
    queryFn: async () => (await api.get<{ data: { batch: Batch; codes: CodeItem[] } }>(`/admin/redemption/batches/${detailId}`)).data.data,
    enabled: !!detailId,
  });
  const createMut = useMutation({
    mutationFn: async () => (await api.post("/admin/redemption/batches", { ...form, amount: Number(form.amount), total_count: Number(form.total_count), expires_at: form.expires_at || undefined })).data,
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "批次已创建"); setShowCreate(false); setForm({ name: "", amount: "", total_count: "10", expires_at: "", note: "" }); qc.invalidateQueries({ queryKey: ["admin-redemption"] }); },
    onError: (e) => toast.error(extractError(e)),
  });
  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => (await api.post(`/admin/redemption/batches/${id}/toggle`, { status })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-redemption"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        兑换码批次
        <HelpIcon text="管理兑换码批次。创建批次自动生成兑换码，支持启用/停用批次，查看各码使用状态。兑换码可用于用户充值优惠。" level="page" />
      </h2>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => setShowCreate(true)} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>+ 新建批次</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无批次" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>批次名</th>
                <th style={{ padding: "8px" }}>面额</th>
                <th style={{ padding: "8px" }}>数量</th>
                <th style={{ padding: "8px" }}>已用</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>过期</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((b) => (
                <tr key={b.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{b.name}</td>
                  <td style={{ padding: "8px" }}>¥{b.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px" }}>{b.total_count}</td>
                  <td style={{ padding: "8px" }}>{b.used_count}</td>
                  <td style={{ padding: "8px" }}>
                    <StatusBadge status={b.status === "active" ? "success" : "default"}>{b.status_label}</StatusBadge>
                  </td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : "永久"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setDetailId(b.id)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", padding: "4px 10px" }}>查看</button>
                    <button onClick={() => toggleMut.mutate({ id: b.id, status: b.status === "active" ? "disabled" : "active" })} style={{ ...btnBase, background: b.status === "active" ? "var(--color-danger-bg)" : "var(--color-success-bg)", color: b.status === "active" ? "var(--color-danger-text)" : "var(--color-success-text)", padding: "4px 10px", marginLeft: 6 }}>{b.status === "active" ? "停用" : "启用"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="新建兑换码批次" width={440}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="批次名称 *" style={inp} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="单码面额(元) *" type="number" style={inp} />
          <input value={form.total_count} onChange={(e) => setForm({ ...form, total_count: e.target.value })} placeholder="生成数量 *" type="number" style={inp} />
        </div>
        <input value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} placeholder="过期时间(留空永久)" type="datetime-local" style={inp} />
        <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="备注" rows={2} style={{ ...inp, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setShowCreate(false)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
          <button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.amount} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>{createMut.isPending ? "创建中..." : "创建并生成"}</button>
        </div>
      </Modal>

      <Modal open={!!detailId} onClose={() => setDetailId(null)} title={`${detailQ.data?.batch?.name ?? ""} · 兑换码列表`} width={640}>
        {detailId && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>共 {detailQ.data?.codes?.length ?? 0} 个码，已用 {detailQ.data?.batch?.used_count}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {detailQ.data?.codes?.map((c) => (
                <div key={c.id} style={{ padding: "6px 10px", borderRadius: 6, background: c.status === "used" ? "var(--color-bg)" : "var(--color-panel)", display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: 12 }}>
                  <span>{c.code}</span>
                  <span style={{ color: c.status === "used" ? "var(--color-danger-text)" : "var(--color-success-text)" }}>{c.status === "used" ? "已用" : "未用"}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
