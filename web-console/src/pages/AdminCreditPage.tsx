import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

interface CreditItem {
  id: number; user_id: number; username: string; email: string;
  quota_total: number; quota_used: number; quota_remaining: number;
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

export default function AdminCreditPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState<{ userId: number; username: string; total: string } | null>(null);

  const q = useQuery({
    queryKey: ["admin-credit", search],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "100" });
      if (search) params.set("search", search);
      return (await api.get<{ data: { list: CreditItem[] } }>(`/admin/credit?${params}`)).data.data;
    },
  });

  const adjustMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/credit/${adjust?.userId}/adjust`, { quota_total: Number(adjust?.total) })).data,
    onSuccess: (d: any) => { toast.success(d?.data?.message ?? "额度调整成功"); setAdjust(null); qc.invalidateQueries({ queryKey: ["admin-credit"] }); },
    onError: (e) => { toast.error(extractError(e)); },
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
        🪙 额度管理
        <HelpIcon text="管理客户的消费额度：设置初始额度、调整额度、查看额度使用记录。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索客户..."
          style={{ ...inp, width: 200, marginBottom: 0 }}
        />
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>
          共 {q.data?.list?.length ?? 0} 个客户
        </span>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={6} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无客户" description="还没有设置额度的客户记录" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>客户</th>
                <th style={{ padding: "8px" }}>总额度</th>
                <th style={{ padding: "8px" }}>已用额度</th>
                <th style={{ padding: "8px" }}>剩余额度</th>
                <th style={{ padding: "8px" }}>使用率</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.list ?? []).map((c) => {
                const pct = c.quota_total > 0 ? (c.quota_used / c.quota_total) * 100 : 0;
                const barColor = pct > 80 ? "var(--color-danger-text)" : pct > 60 ? "#f59e0b" : "var(--color-primary)";
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{c.username || c.email}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{c.email}</div>
                    </td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>¥{c.quota_total.toLocaleString()}</td>
                    <td style={{ padding: "8px", color: "var(--color-danger-text)" }}>¥{c.quota_used.toLocaleString()}</td>
                    <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-success-text)" }}>¥{c.quota_remaining.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 80, height: 6, background: "var(--color-border)", borderRadius: 3 }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: barColor, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px" }}>
                      <button
                        onClick={() => setAdjust({ userId: c.user_id, username: c.username || c.email, total: String(c.quota_total) })}
                        style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-primary)", padding: "4px 10px" }}
                      >
                        调整
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={`调整额度 — ${adjust?.username ?? ""}`} width={400}>
        {adjust && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12 }}>设置该客户的总消费额度（元）。已用额度不受影响。</div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>总额度（元）</label>
            <input value={adjust.total} onChange={(e) => setAdjust({ ...adjust, total: e.target.value })} type="number" min="0" style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAdjust(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button onClick={() => adjustMut.mutate()} disabled={!adjust.total} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>{adjustMut.isPending ? "提交中..." : "确认调整"}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
