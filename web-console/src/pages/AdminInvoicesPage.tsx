import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface Invoice {
  id: number;
  user_id: number;
  invoice_no: string | null;
  amount: number;
  tax_rate: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  type: string;
  type_label: string;
  status: string;
  status_label: string;
  title: string;
  tax_no: string | null;
  email: string | null;
  created_at: string;
  email_user: string;
  username: string;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#fef3c7", color: "#92400e" },
  issued: { bg: "#dcfce7", color: "#166534" },
  rejected: { bg: "#fee2e2", color: "#991b1b" },
  voided: { bg: "#f1f5f9", color: "#475569" },
};
const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待开票" },
  { value: "issued", label: "已开票" },
  { value: "rejected", label: "已驳回" },
];

export default function AdminInvoicesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [issueNo, setIssueNo] = useState("");
  const [issueTarget, setIssueTarget] = useState<Invoice | null>(null);

  const downloadPdf = (id: number) => {
    window.open(`/api/v1/admin/invoices/${id}/download?token=${localStorage.getItem("token")}`, "_blank");
  };
  const summaryQ = useQuery({
    queryKey: ["inv-summary"],
    queryFn: async () => (await api.get<{ data: any }>("/admin/invoice-stats/summary")).data.data,
  });
  const trendQ = useQuery({
    queryKey: ["inv-trend"],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>("/admin/invoice-stats/trend?months=12")).data.data,
  });
  const uninvoicedQ = useQuery({
    queryKey: ["inv-uninvoiced"],
    queryFn: async () => (await api.get<{ data: any }>("/admin/invoice-stats/uninvoiced")).data.data,
  });
  const listQ = useQuery({
    queryKey: ["admin-invoices", status],
    queryFn: async () => (await api.get<{ data: { list: Invoice[]; pagination: { total: number } } }>(`/admin/invoices?status=${status}&page_size=50`)).data.data,
  });

  const issueMut = useMutation({
    mutationFn: async ({ id }: { id: number }) => (await api.post(`/admin/invoices/${id}/issue`, { invoice_no: issueNo || undefined })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已开票" }); setIssueTarget(null); setIssueNo(""); qc.invalidateQueries({ queryKey: ["admin-invoices"] }); qc.invalidateQueries({ queryKey: ["inv-summary"] }); qc.invalidateQueries({ queryKey: ["inv-trend"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const rejectMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/invoices/${id}/reject`, { reason: "信息有误" })).data,
    onSuccess: (d: { data?: { message?: string } }) => { setNotice({ type: "success", msg: d?.data?.message ?? "已驳回" }); qc.invalidateQueries({ queryKey: ["admin-invoices"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const s = summaryQ.data;
  const trend = trendQ.data;
  const maxTrend = Math.max(...(trend?.list ?? []).map((x) => Number(x.amount)), 1);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>税票管理</h2>

      {/* 汇总卡 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div style={card}><div style={{ color: "#64748b", fontSize: 13 }}>本月开票数</div><div style={{ fontSize: 26, fontWeight: 700 }}>{s?.count ?? 0}</div></div>
        <div style={card}><div style={{ color: "#64748b", fontSize: 13 }}>本月开票金额</div><div style={{ fontSize: 26, fontWeight: 700, color: "#2563eb" }}>¥{(s?.amount ?? 0).toLocaleString()}</div></div>
        <div style={card}><div style={{ color: "#64748b", fontSize: 13 }}>专票</div><div style={{ fontSize: 26, fontWeight: 700 }}>¥{(s?.special_amount ?? 0).toLocaleString()}<span style={{ fontSize: 12, color: "#94a3b8" }}> ({s?.special_count ?? 0}张)</span></div></div>
        <div style={card}><div style={{ color: "#64748b", fontSize: 13 }}>普票</div><div style={{ fontSize: 26, fontWeight: 700 }}>¥{(s?.ordinary_amount ?? 0).toLocaleString()}<span style={{ fontSize: 12, color: "#94a3b8" }}> ({s?.ordinary_count ?? 0}张)</span></div></div>
        <div style={card}><div style={{ color: "#64748b", fontSize: 13 }}>未开票预估</div><div style={{ fontSize: 26, fontWeight: 700, color: "#dc2626" }}>¥{(uninvoicedQ.data?.uninvoiced_amount ?? 0).toLocaleString()}</div></div>
      </div>

      {/* 开票趋势 */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>近 12 月开票趋势</h3>
        {trend && trend.list.length > 0 ? (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
            {trend.list.map((t) => (
              <div key={t.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "#64748b" }}>¥{Number(t.amount).toFixed(0)}</div>
                <div style={{ width: "70%", background: Number(t.amount) > 0 ? "#3b82f6" : "#e2e8f0", height: `${Math.max(2, (Number(t.amount) / maxTrend) * 80)}px`, borderRadius: "4px 4px 0 0" }} />
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>{t.month.slice(5)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: "#94a3b8", fontSize: 13 }}>本月暂无开票记录</div>
        )}
      </div>

      {/* 列表 + 筛选 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "#2563eb" : "#fff", color: status === f.value ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "#64748b" }}>共 {listQ.data?.pagination?.total ?? 0} 条</span>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无发票记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>用户</th>
                <th style={{ padding: "8px" }}>抬头</th>
                <th style={{ padding: "8px" }}>金额(含税)</th>
                <th style={{ padding: "8px" }}>类型</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>发票号</th>
                <th style={{ padding: "8px" }}>申请时间</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.list.map((inv) => (
                <tr key={inv.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px" }}><div style={{ fontWeight: 600 }}>{inv.username || inv.email_user}</div><div style={{ fontSize: 12, color: "#64748b" }}>{inv.email_user}</div></td>
                  <td style={{ padding: "8px" }}>{inv.title}</td>
                  <td style={{ padding: "8px", fontWeight: 600 }}>¥{Number(inv.total_amount ?? inv.amount).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>{inv.type_label}</td>
                  <td style={{ padding: "8px" }}><span style={{ ...(STATUS_STYLE[inv.status] ?? STATUS_STYLE.pending), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{inv.status_label}</span></td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{inv.invoice_no ?? "-"}</td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{new Date(inv.created_at).toLocaleString()}</td>
                  <td style={{ padding: "8px" }}>
                    {inv.status === "pending" && (
                      <>
                        <button onClick={() => setIssueTarget(inv)} style={{ ...btnBase, background: "#16a34a", color: "#fff", padding: "4px 10px" }}>开票</button>
                        <button onClick={() => rejectMut.mutate(inv.id)} style={{ ...btnBase, background: "#fee2e2", color: "#991b1b", padding: "4px 10px", marginLeft: 6 }}>驳回</button>
                      </>
                    )}
                    {inv.status === "issued" && (
                      <button onClick={() => downloadPdf(inv.id)} style={{ ...btnBase, background: "#dbeafe", color: "#1e40af", padding: "4px 10px" }}>下载PDF</button>
                    )}
                    {(inv.status === "rejected" || inv.status === "voided") && <span style={{ fontSize: 12, color: "#94a3b8" }}>-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 开票弹窗 */}
      {issueTarget && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ ...card, width: 400 }}>
            <h3 style={{ marginBottom: 16 }}>开票 · {issueTarget.title}</h3>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>金额: <strong>¥{Number(issueTarget.total_amount ?? issueTarget.amount).toLocaleString()}</strong> | 类型: {issueTarget.type_label}</div>
            <input value={issueNo} onChange={(e) => setIssueNo(e.target.value)} placeholder="发票号（留空自动生成）" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setIssueTarget(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => issueMut.mutate({ id: issueTarget.id })} disabled={issueMut.isPending} style={{ ...btnBase, background: "#16a34a", color: "#fff" }}>{issueMut.isPending ? "开票中..." : "确认开票"}</button>
            </div>
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
