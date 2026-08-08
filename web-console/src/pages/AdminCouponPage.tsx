import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

interface CouponItem {
  id: number; batch_code: string; batch_name: string;
  type: string; type_label: string; value: number;
  total_count: number; redeemed_count: number;
  expires_at: string | null; status: string; status_label: string;
  created_at: string;
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  active: "success",
  ending: "warning",
  expired: "default",
  disabled: "danger",
};

export default function AdminCouponPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [generateModal, setGenerateModal] = useState(false);
  const [generate, setGenerate] = useState({ batch_name: "", type: "flat", value: "", total_count: "100", expires_at: "" });

  const q = useQuery({
    queryKey: ["admin-coupons", search],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "100" });
      if (search) params.set("search", search);
      return (await api.get<{ data: { list: CouponItem[] } }>(`/admin/coupons?${params}`)).data.data;
    },
  });

  const generateMut = useMutation({
    mutationFn: async () => (await api.post("/admin/coupons/generate", {
      batch_name: generate.batch_name,
      type: generate.type,
      value: Number(generate.value),
      total_count: Number(generate.total_count),
      expires_at: generate.expires_at || null,
    })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "兑换码生成成功"); setGenerateModal(false); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); },
    onError: (e) => toast.error(extractError(e)),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        🎟️ 兑换码管理
        <HelpIcon text="生成和管理兑换码，查看兑换记录。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索批次名称..." style={{ ...inp, width: 200, marginBottom: 0 }} />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {q.data?.list?.length ?? 0} 个批次</span>
        <button onClick={() => setGenerateModal(true)} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>＋ 生成兑换码</button>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={4} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无兑换码批次" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>批次名称</th>
                <th style={{ padding: "8px" }}>批次码</th>
                <th style={{ padding: "8px" }}>面额</th>
                <th style={{ padding: "8px" }}>类型</th>
                <th style={{ padding: "8px" }}>有效期</th>
                <th style={{ padding: "8px" }}>已兑/总量</th>
                <th style={{ padding: "8px" }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.list ?? []).map((c) => {
                const pct = c.total_count > 0 ? (c.redeemed_count / c.total_count) * 100 : 0;
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{c.batch_name}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12, color: "var(--color-primary)" }}>{c.batch_code}</td>
                    <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-success-text)" }}>¥{c.value}</td>
                    <td style={{ padding: "8px" }}>{c.type_label ?? c.type}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "永久"}</td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 60, height: 6, background: "var(--color-border)", borderRadius: 3 }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "var(--color-primary)", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{c.redeemed_count}/{c.total_count}</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[c.status] ?? "default"}>{c.status_label}</StatusBadge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={generateModal} onClose={() => setGenerateModal(false)} title="生成兑换码" width={480}>
        <>
          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>批次名称</label>
          <input value={generate.batch_name} onChange={(e) => setGenerate({ ...generate, batch_name: e.target.value })} placeholder="例如：开业促销" style={inp} />

          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>类型</label>
          <select value={generate.type} onChange={(e) => setGenerate({ ...generate, type: e.target.value })} style={{ ...inp }}>
            <option value="flat">直减</option>
            <option value="threshold">满减</option>
            <option value="percent">折扣</option>
          </select>

          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>面额（元）</label>
          <input value={generate.value} onChange={(e) => setGenerate({ ...generate, value: e.target.value })} type="number" min="0" step="0.01" placeholder="面额金额" style={inp} />

          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>生成数量</label>
          <input value={generate.total_count} onChange={(e) => setGenerate({ ...generate, total_count: e.target.value })} type="number" min="1" placeholder="生成数量" style={inp} />

          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>有效期（选填，留空为永久有效）</label>
          <input value={generate.expires_at} onChange={(e) => setGenerate({ ...generate, expires_at: e.target.value })} type="date" style={inp} />

          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12, padding: 10, background: "var(--color-warning-bg)", borderRadius: 8 }}>
            生成后兑换码将立即生效，请确认面额和数量无误。
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setGenerateModal(false)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
            <button onClick={() => generateMut.mutate()} disabled={!generate.batch_name || !generate.value || !generate.total_count} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>
              {generateMut.isPending ? "生成中..." : "确认生成"}
            </button>
          </div>
        </>
      </Modal>
    </div>
  );
}
