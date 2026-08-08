import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup, EmptyState, Pagination, SearchBar } from "@3cloud/shared-ui";

interface RechargeOrder {
  id: number; order_no: string; user_id: number; username: string; email: string;
  amount: number; payment_method: string; payment_method_label: string;
  status: string; status_label: string; created_at: string; completed_at: string | null;
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "default",
};

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待确认" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "已失败" },
];

export default function AdminRechargeOrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const q = useQuery({
    queryKey: ["admin-recharge-orders", status, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: String(pageSize), page: String(page) });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      return (await api.get<{ data: { list: RechargeOrder[]; pagination: { total: number } } }>(`/admin/recharge-orders?${params}`)).data.data;
    },
  });

  const total = q.data?.pagination?.total ?? 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        🧾 充值订单
        <HelpIcon text="查看充值订单记录，支持搜索筛选和导出。" level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchBar placeholder="搜索订单号/客户..." value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => { setStatus(f.value); setPage(1); }} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {total} 条</span>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={6} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无充值订单" />
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>订单号</th>
                  <th style={{ padding: "8px" }}>客户</th>
                  <th style={{ padding: "8px" }}>金额</th>
                  <th style={{ padding: "8px" }}>支付方式</th>
                  <th style={{ padding: "8px" }}>状态</th>
                  <th style={{ padding: "8px" }}>创建时间</th>
                  <th style={{ padding: "8px" }}>完成时间</th>
                </tr>
              </thead>
              <tbody>
                {(q.data?.list ?? []).map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{r.order_no}</td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{r.username || r.email}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email}</div>
                    </td>
                    <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-success-text)" }}>¥{r.amount.toFixed(2)}</td>
                    <td style={{ padding: "8px" }}>{r.payment_method_label || r.payment_method}</td>
                    <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[r.status] ?? "default"}>{r.status_label}</StatusBadge></td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 16 }}>
              <Pagination current={page} total={total} pageSize={pageSize} onChange={(p) => setPage(p)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
