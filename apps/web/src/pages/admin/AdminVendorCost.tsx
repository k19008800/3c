import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";

// ── Types ──
interface VendorSettlement {
  id: number;
  vendor_id: number;
  vendor_name: string;
  period: string;
  total_calls: number;
  success_calls: number;
  failed_calls: number;
  total_tokens: number;
  total_cost: number;
  user_revenue: number;
  settlement_amount: number;
  status: string;
  status_label: string;
}

interface ApiListResponse {
  list: VendorSettlement[];
  pagination: { page: number; page_size: number; total: number };
}

const STATUSES = ["全部", "generated", "confirmed", "paid", "disputed"];
const STATUS_LABELS: Record<string, string> = { generated: "已生成", confirmed: "已确认", paid: "已打款", disputed: "争议" };

export default function AdminVendorCost() {
  const [records, setRecords] = useState<VendorSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const [vendorFilter, setVendorFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page, page_size: pageSize };
      if (statusFilter !== "全部") params.status = statusFilter;
      const res = await api.get<ApiListResponse>("/admin/vendor-settlements", params);
      setRecords(res.list);
      setTotalCount(res.pagination.total);
    } catch (e: any) {
      setError(e.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Client-side vendor filter
  const filtered = vendorFilter !== "全部"
    ? records.filter((r) => r.vendor_name === vendorFilter)
    : records;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const totalVendorCost = filtered.reduce((a, b) => a + b.total_cost, 0);
  const totalRevenue = filtered.reduce((a, b) => a + b.user_revenue, 0);
  const totalProfit = filtered.reduce((a, b) => a + b.user_revenue - b.total_cost, 0);
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100).toFixed(1) : "0";

  // Vendor comparison (unique vendors from current data)
  const vendorMap = new Map<string, { cost: number; revenue: number }>();
  for (const r of filtered) {
    const name = r.vendor_name || `供应商#${r.vendor_id}`;
    const entry = vendorMap.get(name) || { cost: 0, revenue: 0 };
    entry.cost += r.total_cost;
    entry.revenue += r.user_revenue;
    vendorMap.set(name, entry);
  }
  const vendorComparison = Array.from(vendorMap.entries()).map(([vendor, v]) => ({
    vendor,
    cost: v.cost,
    revenue: v.revenue,
    margin: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue * 100).toFixed(1) : "0",
  })).filter((v) => v.cost > 0).sort((a, b) => b.cost - a.cost);

  const maxVendorCost = Math.max(...vendorComparison.map((v) => v.cost), 1);
  const uniqueVendors = [...new Set(records.map((r) => r.vendor_name).filter(Boolean))];

  return (
    <AdminLayout>
      <h1 className="page-title">
        供应商成本
        <HelpModal title="供应商成本">
          <p>查看各 AI 模型厂商的供应商成本明细和利润贡献。</p>
          <p style={{ marginTop: 8 }}>
            展示每个供应商周期的 Token 消耗量、供应商成本、平台收入和毛利。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">供应商成本明细与利润分析</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "供应商总成本", v: `¥${totalVendorCost.toFixed(2)}` },
          { l: "平台总收入", v: `¥${totalRevenue.toFixed(2)}` },
          { l: "总毛利", v: `¥${totalProfit.toFixed(2)}` },
          { l: "平均毛利率", v: `${avgMargin}%` },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ cursor: "default" }}>
            <div className="stat-card-label">{s.l}</div>
            <div className="stat-card-value">{s.v}</div>
          </div>
        ))}
      </div>

      {/* Vendor Comparison Bars */}
      {vendorComparison.length > 0 && (
        <div className="panel mb-16">
          <div className="panel-header">
            <span>📊 供应商成本对比</span>
          </div>
          <div className="panel-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {vendorComparison.map((v) => {
                const pct = maxVendorCost > 0 ? (v.cost / maxVendorCost) * 100 : 0;
                return (
                  <div key={v.vendor} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 90, textAlign: "right", fontSize: 13, fontWeight: 500 }}>{v.vendor}</div>
                    <div style={{ flex: 1, background: "#f0f2f5", borderRadius: 4, height: 28, position: "relative", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--color-primary)", borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 8, opacity: 0.8 }}>
                        <span style={{ color: "#fff", fontSize: 12, fontWeight: 500 }}>¥{v.cost.toFixed(0)}</span>
                      </div>
                    </div>
                    <div style={{ width: 120, fontSize: 12, color: "var(--color-text-secondary)" }}>
                      收入 ¥{v.revenue.toFixed(0)}
                    </div>
                    <div style={{ width: 60, fontSize: 12 }}>
                      <StatusBadge status={Number(v.margin) > 30 ? "success" : Number(v.margin) > 20 ? "info" : "warning"}>
                        {v.margin}%
                      </StatusBadge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detail Table */}
      <div className="panel">
        <div className="panel-header">
          <span>成本明细</span>
          <div className="flex-wrap">
            <select className="form-select" style={{ width: 140 }} value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}>
              <option value="全部">全部供应商</option>
              {uniqueVendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <select className="form-select" style={{ width: 110 }} value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
              {STATUSES.map((s) => <option key={s} value={s}>{s === "全部" ? "全部状态" : STATUS_LABELS[s] ?? s}</option>)}
            </select>
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
                    <th>周期</th>
                    <th>供应商</th>
                    <th>总调用</th>
                    <th>总Token</th>
                    <th>供应商成本</th>
                    <th>平台收入</th>
                    <th>结算金额</th>
                    <th>毛利</th>
                    <th>毛利率</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无成本数据</td></tr>
                  ) : (
                    filtered.map((r) => {
                      const profit = r.user_revenue - r.total_cost;
                      const margin = r.user_revenue > 0 ? (profit / r.user_revenue * 100) : 0;
                      return (
                        <tr key={r.id}>
                          <td>{r.period}</td>
                          <td>{r.vendor_name}</td>
                          <td>{r.total_calls?.toLocaleString()}</td>
                          <td>{Number(r.total_tokens).toLocaleString()}</td>
                          <td className="text-mono">¥{r.total_cost.toFixed(2)}</td>
                          <td className="text-mono">¥{r.user_revenue.toFixed(2)}</td>
                          <td className="text-mono" style={{ fontWeight: 600 }}>¥{r.settlement_amount.toFixed(2)}</td>
                          <td className="text-mono" style={{ color: profit >= 0 ? "var(--color-success-text)" : "var(--color-danger-text)" }}>
                            ¥{profit.toFixed(2)}
                          </td>
                          <td>
                            <StatusBadge status={margin > 35 ? "success" : margin > 20 ? "info" : "warning"}>
                              {margin.toFixed(1)}%
                            </StatusBadge>
                          </td>
                          <td>
                            <StatusBadge status={r.status === "paid" ? "success" : r.status === "confirmed" ? "info" : r.status === "disputed" ? "error" : "pending"}>
                              {r.status_label}
                            </StatusBadge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="panel-body">
              <div className="flex-between">
                <span className="text-sm text-muted">共 {totalCount} 条</span>
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
