import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 演示数据（对齐原型 admin-reconciliation-diff.html 分布） ───────── */

interface DiffRow { id: number; created_at: string; vendor_name: string; diff_type: string; platform_amount: number; vendor_amount: number; amount_diff: number; status: string; }
interface DiffData { list: DiffRow[]; demo?: boolean; }

const MOCK: DiffData = {
  list: [
    { id: 1, created_at: "2026-08-10 09:00", vendor_name: "DeepSeek", diff_type: "金额差异", platform_amount: 14328, vendor_amount: 14250, amount_diff: 78, status: "unresolved" },
    { id: 2, created_at: "2026-08-10 08:45", vendor_name: "OpenAI", diff_type: "用量差异", platform_amount: 9832, vendor_amount: 9856, amount_diff: -24, status: "unresolved" },
    { id: 3, created_at: "2026-08-09 22:10", vendor_name: "GLM", diff_type: "缺单", platform_amount: 4520, vendor_amount: 0, amount_diff: 4520, status: "unresolved" },
    { id: 4, created_at: "2026-08-09 18:32", vendor_name: "Anthropic", diff_type: "多单", platform_amount: 0, vendor_amount: 3420, amount_diff: -3420, status: "resolved" },
    { id: 5, created_at: "2026-08-09 15:20", vendor_name: "阿里云", diff_type: "单价差异", platform_amount: 5680, vendor_amount: 5600, amount_diff: 80, status: "resolved" },
    { id: 6, created_at: "2026-08-09 11:05", vendor_name: "智谱AI", diff_type: "金额差异", platform_amount: 12050, vendor_amount: 12050, amount_diff: 0, status: "ignored" },
  ],
  demo: true,
};

export default function AdminReconciliationDiffPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");

  const diffQ = useQuery({
    queryKey: ["admin-reconciliation-diffs", status],
    queryFn: async () => (await api.get(`/admin/reconciliation/diffs?status=${status}&page_size=50`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const data: DiffData = diffQ.data?.list != null ? diffQ.data : MOCK;

  const resolveMut = useMutation({
    mutationFn: async ({ id, op, reason }: { id: number; op: string; reason?: string }) =>
      (await api.post(`/admin/reconciliation/diffs/${id}/${op}`, { reason })).data,
    onSuccess: () => { toast.success("已处理"); qc.invalidateQueries({ queryKey: ["admin-reconciliation-diffs"] }); },
    onError: (e: any) => toast.error(extractError(e)),
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>对账差异</h2>
        <HelpIcon text="reconciliation_diff" />
        {data.demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/reconciliation/diffs 待接入）</span>}
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部</option>
          <option value="unresolved">待处理</option>
          <option value="resolved">已处理</option>
          <option value="ignored">已忽略</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🔍 对账差异列表 <HelpIcon text="reconciliation_diff" /></div>
        {diffQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>ID</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>差异类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>平台记录</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>供应商记录</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>差额</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(data.list ?? []).map((d: DiffRow) => (
                <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888" }}>#{d.id}</td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{d.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{d.vendor_name}</td>
                  <td style={{ padding: "10px 12px" }}>{d.diff_type}</td>
                  <td style={{ padding: "10px 12px" }}>¥{d.platform_amount}</td>
                  <td style={{ padding: "10px 12px" }}>¥{d.vendor_amount}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: d.amount_diff > 0 ? "#e53935" : "#22c55e" }}>
                    ¥{d.amount_diff}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={d.status === "unresolved" ? "warning" : "success"}>
                      {({ unresolved: "待处理", resolved: "已处理", ignored: "已忽略" } as Record<string, string>)[d.status] ?? d.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                    {d.status === "unresolved" && (
                      <>
                        <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }}
                          onClick={() => resolveMut.mutate({ id: d.id, op: "resolve" })}>确认</button>
                        <button style={{ ...btnBase, background: "#f0f0f0", fontSize: 12 }}
                          onClick={() => resolveMut.mutate({ id: d.id, op: "ignore" })}>忽略</button>
                      </>
                    )}
                    {d.status !== "unresolved" && <span style={{ fontSize: 11, color: "#888" }}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
