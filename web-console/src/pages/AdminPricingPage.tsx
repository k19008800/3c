import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

interface PricingItem {
  id: number; model_id: number; model_name: string;
  vendor_id: number | null; vendor_name: string | null;
  input_price_per_1k: number; output_price_per_1k: number;
  currency: string; status: string; status_label: string;
  effective_from: string | null; updated_at: string;
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  active: "success",
  draft: "warning",
  archived: "default",
};

export default function AdminPricingPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editPricing, setEditPricing] = useState<{ id: number; model_name: string; input: string; output: string } | null>(null);

  const q = useQuery({
    queryKey: ["admin-pricing", search],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "100" });
      if (search) params.set("search", search);
      return (await api.get<{ data: { list: PricingItem[] } }>(`/admin/pricing?${params}`)).data.data;
    },
  });

  const updateMut = useMutation({
    mutationFn: async () => (await api.put(`/admin/pricing/${editPricing?.id}`, {
      input_price_per_1k: Number(editPricing?.input),
      output_price_per_1k: Number(editPricing?.output),
    })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "价格更新成功"); setEditPricing(null); qc.invalidateQueries({ queryKey: ["admin-pricing"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        🏷️ 价格管理
        <HelpIcon text="平台标价管理，支持模型定价配置。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索模型名称..." style={{ ...inp, width: 200, marginBottom: 0 }} />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {q.data?.list?.length ?? 0} 个定价</span>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={4} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无定价数据" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>模型</th>
                <th style={{ padding: "8px" }}>供应商</th>
                <th style={{ padding: "8px" }}>输入价格/1K</th>
                <th style={{ padding: "8px" }}>输出价格/1K</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.list ?? []).map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{p.model_name}</td>
                  <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{p.vendor_name ?? "-"}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{p.input_price_per_1k.toFixed(4)}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{p.output_price_per_1k.toFixed(4)}</td>
                  <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[p.status] ?? "success"}>{p.status_label}</StatusBadge></td>
                  <td style={{ padding: "8px" }}>
                    <button
                      onClick={() => setEditPricing({ id: p.id, model_name: p.model_name, input: String(p.input_price_per_1k), output: String(p.output_price_per_1k) })}
                      style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-primary)", padding: "4px 10px" }}
                    >
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!editPricing} onClose={() => setEditPricing(null)} title={`编辑定价 — ${editPricing?.model_name ?? ""}`} width={420}>
        {editPricing && (
          <>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>输入价格 / 1K tokens</label>
            <input value={editPricing.input} onChange={(e) => setEditPricing({ ...editPricing, input: e.target.value })} type="number" step="0.0001" min="0" style={inp} />

            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>输出价格 / 1K tokens</label>
            <input value={editPricing.output} onChange={(e) => setEditPricing({ ...editPricing, output: e.target.value })} type="number" step="0.0001" min="0" style={inp} />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditPricing(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => updateMut.mutate()} disabled={!editPricing.input || !editPricing.output} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>
                {updateMut.isPending ? "保存中..." : "保存"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
