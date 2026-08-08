import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { api } from "../../services/api";

// ── Types ──
interface LedgerRecord {
  id: number;
  serial_no: string;
  type: string;
  type_label: string;
  direction: string;
  amount: number;
  balance_after: number;
  user_id: number;
  related_order_no: string;
  external_ref: string;
  status: string;
  status_label: string;
  remark: string;
  created_at: string;
}

interface ApiListResponse {
  list: LedgerRecord[];
  pagination: { page: number; page_size: number; total: number };
  summary: { total_in: number; total_out: number; net_flow: number };
}

const TYPES = ["全部", "recharge", "consumption", "refund", "adjust", "commission", "withdrawal"];
const STATUSES = ["全部", "completed", "pending", "reversed", "failed"];

export default function AdminConsumptionStream() {
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({ total_in: 0, total_out: 0, net_flow: 0 });

  const [typeFilter, setTypeFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (typeFilter !== "全部") params.type = typeFilter;
      if (statusFilter !== "全部") params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get<ApiListResponse>("/admin/finance/ledger", params);
      setRecords(res.list);
      setTotalCount(res.pagination.total);
      setSummary(res.summary);
    } catch (e: any) {
      setError(e.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, statusFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const handleExport = () => {
    const headers = ["流水号", "时间", "类型", "方向", "金额", "余额", "关联单号", "状态"];
    const rows = records.map((r) => [r.serial_no, r.created_at, r.type_label, r.direction === "in" ? "收入" : "支出", String(r.amount), String(r.balance_after), r.related_order_no ?? "", r.status_label]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "consumption-stream.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <h1 className="page-title">
        消费流水
        <HelpModal title="消费流水">
          <p>查看平台所有用户的 API 调用消费流水明细。</p>
          <p style={{ marginTop: 8 }}>支持按类型、状态筛选和搜索。可导出 CSV 报表。</p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">平台资金流水记录</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "总收入", v: `¥${summary.total_in.toFixed(2)}` },
          { l: "总支出", v: `¥${summary.total_out.toFixed(2)}` },
          { l: "净流水", v: `¥${summary.net_flow.toFixed(2)}` },
          { l: "总记录数", v: totalCount.toLocaleString() },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="panel">
        <div className="panel-header">
          <span>流水记录</span>
          <div className="flex-wrap">
            <select className="form-select" style={{ width: 120 }} value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
              {TYPES.map((t) => <option key={t} value={t}>{t === "全部" ? "全部类型" : t}</option>)}
            </select>
            <select className="form-select" style={{ width: 110 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s === "全部" ? "全部状态" : s}</option>)}
            </select>
            <input className="form-input" style={{ width: 160 }} placeholder="搜索流水号/单号..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            <button className="btn btn-sm btn-secondary" onClick={handleExport}>📥 导出</button>
          </div>
        </div>

        {loading && <div className="panel-body"><div className="loading-spinner" /> 加载中...</div>}
        {error && <div className="panel-body"><div className="alert alert-danger">{error} <button className="btn btn-xs btn-secondary" onClick={fetchData}>重试</button></div></div>}

        {!loading && !error && (
          <>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>流水号</th>
                    <th>时间</th>
                    <th>类型</th>
                    <th>方向</th>
                    <th>金额</th>
                    <th>余额</th>
                    <th>关联单号</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无流水记录</td></tr>
                  ) : (
                    records.map((r) => (
                      <tr key={r.id}>
                        <td className="text-mono" style={{ fontSize: 11 }}>{r.serial_no}</td>
                        <td style={{ fontSize: 12 }}>{r.created_at ? new Date(r.created_at).toLocaleString("zh-CN") : "-"}</td>
                        <td><span className="badge badge-info">{r.type_label}</span></td>
                        <td>
                          <span style={{ color: r.direction === "in" ? "var(--color-success-text)" : "var(--color-danger-text)", fontWeight: 600 }}>
                            {r.direction === "in" ? "+" : "-"}¥{r.amount.toFixed(2)}
                          </span>
                        </td>
                        <td className="text-mono">¥{r.balance_after.toFixed(2)}</td>
                        <td className="text-mono" style={{ fontSize: 11 }}>{r.related_order_no ?? "-"}</td>
                        <td><span className={`badge ${r.status === "completed" ? "badge-success" : r.status === "reversed" ? "badge-danger" : "badge-warning"}`}>{r.status_label}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-body">
              <div className="flex-between">
                <span className="text-sm text-muted">共 {totalCount} 条，第 {safePage}/{Math.max(totalPages, 1)} 页</span>
                <div className="flex-wrap">
                  <button className="btn btn-sm btn-secondary" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const p = safePage <= 3 ? i + 1 : safePage >= totalPages - 2 ? totalPages - 4 + i : safePage - 2 + i;
                    return p >= 1 && p <= totalPages ? (
                      <button key={p} className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-secondary"}`} style={p === safePage ? undefined : { padding: "6px 12px" }} onClick={() => setPage(p)}>{p}</button>
                    ) : null;
                  })}
                  <button className="btn btn-sm btn-secondary" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
