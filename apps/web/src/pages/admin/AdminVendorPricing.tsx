import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { api } from "../../services/api";

// ── Types ──
interface VendorModelPrice {
  id: number;
  model_id: number;
  model_name: string;
  display_name: string;
  category: string;
  upstream_model: string;
  cost_input_price: number;
  cost_output_price: number;
  our_input_price: number;
  our_output_price: number;
  weight: number;
  priority: number;
  is_enabled: boolean;
  health_score: number;
  avg_latency_ms: number;
}

interface Vendor {
  id: number;
  name: string;
  code: string;
  status: string;
  status_label: string;
  model_count: number;
}

interface VendorModelsResponse {
  list: VendorModelPrice[];
}

interface VendorListResponse {
  list: Vendor[];
  pagination: { page: number; page_size: number; total: number };
}

export default function AdminVendorPricing() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [pricingData, setPricingData] = useState<{ vendor: string; models: VendorModelPrice[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<VendorModelPrice & { vendor_name: string } | null>(null);

  const [vendorFilter, setVendorFilter] = useState("全部");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all vendors first
      const vendorRes = await api.get<VendorListResponse>("/admin/vendors", { page_size: 100 });
      const vList = vendorRes.list;
      setVendors(vList);

      // Fetch models for each vendor
      const allPricing: { vendor: string; models: VendorModelPrice[] }[] = [];
      for (const v of vList) {
        try {
          const modelRes = await api.get<VendorModelsResponse>(`/admin/vendors/${v.id}/models`);
          if (modelRes.list.length > 0) {
            allPricing.push({ vendor: v.name, models: modelRes.list });
          }
        } catch { /* skip vendor with no models */ }
      }
      setPricingData(allPricing);
    } catch (e: any) {
      setError(e.message ?? "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Flatten pricing for display
  let flatPricing: (VendorModelPrice & { vendor_name: string })[] = [];
  for (const entry of pricingData) {
    if (vendorFilter !== "全部" && entry.vendor !== vendorFilter) continue;
    for (const m of entry.models) {
      flatPricing.push({ ...m, vendor_name: entry.vendor });
    }
  }

  const activePricing = flatPricing.filter((p) => p.is_enabled);
  const totalCost = activePricing.reduce((a, b) => a + (b.cost_input_price ?? 0) + (b.cost_output_price ?? 0), 0);
  const totalRevenue = activePricing.reduce((a, b) => a + (b.our_input_price ?? 0) + (b.our_output_price ?? 0), 0);
  const avgMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(1) : "0";

  const totalPages = Math.max(1, Math.ceil(flatPricing.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = flatPricing.slice((safePage - 1) * pageSize, safePage * pageSize);

  const calcMargin = (cost: number, our: number) => our > 0 ? ((our - cost) / our * 100) : 0;

  const handleSavePricing = async () => {
    if (!editModal) return;
    try {
      await api.put(`/admin/vendor-models/${editModal.id}`, {
        cost_input_price: editModal.cost_input_price,
        cost_output_price: editModal.cost_output_price,
        is_enabled: editModal.is_enabled,
      });
      setEditModal(null);
      fetchData();
    } catch (e: any) {
      alert(e.message ?? "保存失败");
    }
  };

  const uniqueVendors = [...new Set(pricingData.map((e) => e.vendor))];

  return (
    <AdminLayout>
      <h1 className="page-title">
        厂商定价
        <HelpModal title="厂商定价">
          <p>管理各 AI 模型厂商的输入/输出价格，查看利润空间。</p>
          <p style={{ marginTop: 8 }}>
            展示厂商供应价和平台售价，支持编辑厂商定价信息。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理厂商价格与利润率</p>

      {/* Stats */}
      <div className="stats-grid">
        {[
          { l: "活跃定价项", v: String(activePricing.length) },
          { l: "供应商标价总", v: `¥${totalCost.toFixed(2)}` },
          { l: "平台售价总", v: `¥${totalRevenue.toFixed(2)}` },
          { l: "平均利润率", v: `${avgMargin}%` },
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
          <span>定价列表</span>
          <div className="flex-wrap">
            <select className="form-select" style={{ width: 130 }} value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setPage(1); }}>
              <option value="全部">全部厂商</option>
              {uniqueVendors.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className="btn btn-sm btn-secondary" onClick={() => { setVendorFilter("全部"); setPage(1); }}>重置</button>
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
                    <th>厂商</th>
                    <th>模型</th>
                    <th>供应输入价</th>
                    <th>供应输出价</th>
                    <th>平台输入价</th>
                    <th>平台输出价</th>
                    <th>输入利润率</th>
                    <th>输出利润率</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {flatPricing.length === 0 ? (
                    <tr><td colSpan={10} style={{ textAlign: "center", padding: 32, color: "var(--color-text-muted)" }}>暂无定价数据</td></tr>
                  ) : (
                    pageData.map((r) => (
                      <tr key={`${r.vendor_name}-${r.id}`}>
                        <td>{r.vendor_name}</td>
                        <td>{r.display_name || r.model_name}</td>
                        <td className="text-mono">¥{(r.cost_input_price ?? 0).toFixed(2)}/K</td>
                        <td className="text-mono">¥{(r.cost_output_price ?? 0).toFixed(2)}/K</td>
                        <td className="text-mono">¥{((r.cost_input_price ?? 0) * 0).toFixed(2)}/K</td>
                        <td className="text-mono">¥{((r.cost_output_price ?? 0) * 0).toFixed(2)}/K</td>
                        <td>
                          <span className="text-sm text-muted">-</span>
                        </td>
                        <td>
                          <span className="text-sm text-muted">-</span>
                        </td>
                        <td>
                          <StatusBadge status={r.is_enabled ? "active" : "inactive"}>
                            {r.is_enabled ? "上架" : "下架"}
                          </StatusBadge>
                        </td>
                        <td>
                          <button className="btn btn-xs btn-secondary" onClick={() => setEditModal({ ...r, vendor_name: r.vendor_name })}>
                            编辑
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {flatPricing.length > pageSize && (
              <div className="panel-body">
                <div className="flex-between">
                  <span className="text-sm text-muted">共 {flatPricing.length} 条</span>
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
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={!!editModal} onClose={() => setEditModal(null)} title="编辑定价" width={520}>
        {editModal && (
          <>
            <div className="flex-between mb-16">
              <span style={{ fontWeight: 600 }}>{editModal.vendor_name} - {editModal.display_name || editModal.model_name}</span>
              <StatusBadge status={editModal.is_enabled ? "active" : "inactive"}>{editModal.is_enabled ? "上架" : "下架"}</StatusBadge>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group">
                <label className="form-label">供应输入价 (¥/K tokens)</label>
                <input className="form-input" type="number" step="0.0001" value={editModal.cost_input_price ?? 0}
                  onChange={(e) => setEditModal({ ...editModal, cost_input_price: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">供应输出价 (¥/K tokens)</label>
                <input className="form-input" type="number" step="0.0001" value={editModal.cost_output_price ?? 0}
                  onChange={(e) => setEditModal({ ...editModal, cost_output_price: Number(e.target.value) })} />
              </div>
            </div>
            <div className="panel" style={{ marginTop: 12, background: "var(--color-primary-lighter)" }}>
              <div className="panel-body">
                <div className="flex-between">
                  <span className="text-sm text-muted">上游模型</span>
                  <span className="text-mono">{editModal.upstream_model}</span>
                </div>
                <div className="flex-between" style={{ marginTop: 4 }}>
                  <span className="text-sm text-muted">权重/优先级</span>
                  <span className="text-mono">W:{editModal.weight} P:{editModal.priority}</span>
                </div>
                <div className="flex-between" style={{ marginTop: 4 }}>
                  <span className="text-sm text-muted">健康度/延迟</span>
                  <span className="text-mono">{editModal.health_score ?? "-"} / {editModal.avg_latency_ms ?? "-"}ms</span>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setEditModal(null)}>取消</button>
              <button className="btn btn-primary" onClick={handleSavePricing}>保存</button>
            </div>
          </>
        )}
      </Modal>
    </AdminLayout>
  );
}
