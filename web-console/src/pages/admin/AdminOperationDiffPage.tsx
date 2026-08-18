import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup, Pagination } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

/* ───────── 真实接口契约（GET /admin/operation/diff） ───────── */

interface DiffRow {
  id: string | number;
  resource: string;
  resource_id: string | null;
  field: string;
  old_value: string;
  new_value: string;
  operator: string | null;
  action: string;
  created_at: string;
}

interface DiffData {
  diffs: DiffRow[];
  pagination: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

export default function AdminOperationDiffPage() {
  const [period, setPeriod] = useState("");
  const [page, setPage] = useState(1);

  const diffQ = useQuery<DiffData>({
    queryKey: ["admin-operation-diff", period, page],
    queryFn: async () => (await api.get(`/admin/operation/diff?period=${period}&page=${page}&page_size=${PAGE_SIZE}`)).data.data,
    retry: 0,
  });

  const diffs = diffQ.data?.diffs ?? [];
  const total = diffQ.data?.pagination?.total ?? 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>操作差异</h2>
        <HelpIcon text="operation_diff" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={period} onChange={e => { setPeriod(e.target.value); setPage(1); }}>
          <option value="">全部时间</option>
          <option value="today">今日</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {total} 条</span>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🔄 操作差异记录 <HelpIcon text="operation_diff" /></div>
        {diffQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>资源</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>资源ID</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>字段</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作员</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>原值</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>新值</th>
            </tr></thead>
            <tbody>
              {(diffs ?? []).map((d: DiffRow) => (
                <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{d.created_at?.slice(0, 19).replace("T", " ")}</td>
                  <td style={{ padding: "10px 12px" }}>{d.resource}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{d.resource_id ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{d.field}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{d.operator ?? "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#e53935", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.old_value}>{d.old_value || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "#22c55e", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.new_value}>{d.new_value || "—"}</td>
                </tr>
              ))}
              {diffs.length === 0 && !diffQ.isLoading && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无操作差异记录</td></tr>
              )}
            </tbody>
          </table>
        )}
        {total > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12 }}>
            <Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={(p) => setPage(p)} />
          </div>
        )}
      </div>
    </div>
  );
}
