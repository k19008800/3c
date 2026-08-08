import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { apiGet, apiPut } from "../../services/api";

// ── Types ──
interface ModelService {
  id: string;
  provider: string;
  model_name?: string;
  modelName?: string;
  model_id?: string;
  modelId?: string;
  service_type?: "chat" | "embedding" | "image" | "audio" | "video";
  serviceType?: "chat" | "embedding" | "image" | "audio" | "video";
  enabled: boolean;
  pricing_input?: number;
  pricingInput?: number;
  pricing_output?: number;
  pricingOutput?: number;
  pricing_unit?: string;
  pricingUnit?: string;
  base_price?: number;
  basePrice?: number;
  profit_margin?: number;
  profitMargin?: number;
  sell_price?: number;
  sellPrice?: number;
  concurrency: number;
  max_tokens?: number;
  maxTokens?: number;
  priority: number;
  updated_at?: string;
  updatedAt?: string;
}

const SERVICE_TYPES: { value: string; label: string }[] = [
  { value: "", label: "全部" },
  { value: "chat", label: "对话" },
  { value: "embedding", label: "嵌入" },
  { value: "image", label: "图像" },
  { value: "audio", label: "音频" },
  { value: "video", label: "视频" },
];

const ENABLED_OPTIONS = [
  { value: "", label: "全部" },
  { value: "true", label: "已启用" },
  { value: "false", label: "已停用" },
];

// ── Helpers ──
function getField<T, K1 extends string, K2 extends string>(obj: T, key1: K1, key2: K2): any {
  return (obj as any)[key1] ?? (obj as any)[key2];
}

export default function AdminModelService() {
  const [services, setServices] = useState<ModelService[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ provider: "", type: "", enabled: "", search: "" });
  const [editService, setEditService] = useState<ModelService | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchPrice, setBatchPrice] = useState({ profitMargin: 25 });
  const [showBatchPrice, setShowBatchPrice] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<ModelService[]>("/admin/vendor-models");
      setServices(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载模型服务列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  // Extract unique providers from data
  const providers = [...new Set(services.map((s) => s.provider).filter(Boolean))];
  const providerOptions = [{ value: "", label: "全部厂商" }, ...providers.map((p) => ({ value: p, label: p }))];

  const filtered = services.filter((s) => {
    if (filters.provider && s.provider !== filters.provider) return false;
    const sType = getField(s, "service_type", "serviceType") as string;
    if (filters.type && sType !== filters.type) return false;
    if (filters.enabled === "true" && !s.enabled) return false;
    if (filters.enabled === "false" && s.enabled) return false;
    const modelName = (getField(s, "model_name", "modelName") as string) || "";
    const modelId = (getField(s, "model_id", "modelId") as string) || "";
    if (filters.search && !modelName.toLowerCase().includes(filters.search.toLowerCase()) && !modelId.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  const toggleService = async (id: string) => {
    const svc = services.find((s) => s.id === id);
    if (!svc) return;
    const newEnabled = !svc.enabled;
    setServices((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: newEnabled } : s)));
    try {
      await apiPut(`/admin/vendor-models/${id}`, { enabled: newEnabled });
    } catch {
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: svc.enabled } : s)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  const batchToggle = async (enabled: boolean) => {
    const ids = Array.from(selectedIds);
    setServices((prev) =>
      prev.map((s) => (selectedIds.has(s.id) ? { ...s, enabled } : s))
    );
    setBatchMode(false);
    try {
      for (const id of ids) {
        await apiPut(`/admin/vendor-models/${id}`, { enabled });
      }
    } catch {}
  };

  const batchUpdatePrice = () => {
    setServices((prev) =>
      prev.map((s) => {
        if (!selectedIds.has(s.id)) return s;
        const base = getField(s, "base_price", "basePrice") as number;
        const newMargin = batchPrice.profitMargin;
        const newSellPrice = Math.round(base * (1 + newMargin / 100) * 100) / 100;
        return { ...s, profit_margin: newMargin, profitMargin: newMargin, sell_price: newSellPrice, sellPrice: newSellPrice };
      })
    );
    setShowBatchPrice(false);
    setBatchMode(false);
  };

  const saveEdit = async () => {
    if (!editService) return;
    const id = editService.id;
    const profitMargin = getField(editService, "profit_margin", "profitMargin") as number;
    const sellPrice = getField(editService, "sell_price", "sellPrice") as number;
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...editService, updated_at: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString().slice(0, 10) } : s))
    );
    setEditService(null);
    try {
      await apiPut(`/admin/vendor-models/${id}`, {
        enabled: editService.enabled,
        base_price: getField(editService, "base_price", "basePrice"),
        profit_margin: profitMargin,
        sell_price: sellPrice,
        concurrency: editService.concurrency,
        priority: editService.priority,
        pricing_input: getField(editService, "pricing_input", "pricingInput"),
        pricing_output: getField(editService, "pricing_output", "pricingOutput"),
        pricing_unit: getField(editService, "pricing_unit", "pricingUnit"),
      });
    } catch {}
  };

  return (
    <AdminLayout>
      <h1 className="page-title">
        模型服务管理
        <HelpModal title="模型服务管理">
          <p>管理所有 AI 模型供应商和模型服务的配置，包括价格、并发、开关状态。</p>
          <p style={{ marginTop: 8 }}>💡 功能说明：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li>厂商 × 模型矩阵表格，支持筛选和批量操作</li>
            <li>批量开关：选中多个模型后可一键启用/停用</li>
            <li>批量调价：统一设置利润率，自动计算售价</li>
            <li>编辑弹窗：完整的价格配置、并发、开关设置</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理模型的供应商、定价、并发和服务状态</p>

      {loadError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          ⚠️ {loadError}
        </div>
      )}

      {/* Filters */}
      <div className="flex-between mb-16">
        <div className="flex-wrap">
          <select
            className="form-select"
            style={{ width: 140 }}
            value={filters.provider}
            onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
          >
            {providerOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ width: 120 }}
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            {SERVICE_TYPES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ width: 120 }}
            value={filters.enabled}
            onChange={(e) => setFilters({ ...filters, enabled: e.target.value })}
          >
            {ENABLED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            className="form-input"
            style={{ width: 200 }}
            placeholder="搜索模型名称…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="flex-wrap">
          <button
            className={`btn btn-sm ${batchMode ? "btn-primary" : "btn-secondary"}`}
            onClick={() => { setBatchMode(!batchMode); setSelectedIds(new Set()); }}
          >
            {batchMode ? "退出批量" : "批量操作"}
          </button>
          {batchMode && (
            <>
              <button className="btn btn-sm btn-secondary" onClick={() => batchToggle(true)}>🔛 批量启用</button>
              <button className="btn btn-sm btn-secondary" onClick={() => batchToggle(false)}>🔒 批量停用</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowBatchPrice(true)}>💲 批量调价</button>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                已选 {selectedIds.size} 项
              </span>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        </div>
      ) : (
      <div className="panel">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                {batchMode && (
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                )}
                <th>厂商</th>
                <th>模型名称</th>
                <th>模型ID</th>
                <th>服务类型</th>
                <th>输入价格</th>
                <th>输出价格</th>
                <th>成本价(¥)</th>
                <th>利润率</th>
                <th>售价(¥)</th>
                <th>最大并发</th>
                <th>上下文</th>
                <th>优先级</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={batchMode ? 16 : 15} style={{ textAlign: "center", padding: 60 }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🔌</div>
                    <div style={{ color: "var(--color-text-secondary)" }}>暂无匹配的模型服务</div>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const modelName = getField(s, "model_name", "modelName") as string;
                  const modelId = getField(s, "model_id", "modelId") as string;
                  const sType = getField(s, "service_type", "serviceType") as string;
                  const pricingInput = getField(s, "pricing_input", "pricingInput") as number;
                  const pricingOutput = getField(s, "pricing_output", "pricingOutput") as number;
                  const pricingUnit = getField(s, "pricing_unit", "pricingUnit") as string;
                  const basePrice = getField(s, "base_price", "basePrice") as number;
                  const profitMargin = getField(s, "profit_margin", "profitMargin") as number;
                  const sellPrice = getField(s, "sell_price", "sellPrice") as number;
                  const maxTokens = (getField(s, "max_tokens", "maxTokens") as number) || 0;
                  return (
                  <tr key={s.id} style={{ opacity: s.enabled ? 1 : 0.5 }}>
                    {batchMode && (
                      <td>
                        <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} />
                      </td>
                    )}
                    <td><strong>{s.provider}</strong></td>
                    <td>{modelName}</td>
                    <td><span className="text-mono" style={{ fontSize: 12 }}>{modelId}</span></td>
                    <td>
                      <span className="badge badge-info">{sType}</span>
                    </td>
                    <td>${pricingInput}/{pricingUnit}</td>
                    <td>${pricingOutput}/{pricingUnit}</td>
                    <td>¥{(basePrice || 0).toFixed(2)}</td>
                    <td>{profitMargin || 0}%</td>
                    <td><strong>¥{(sellPrice || 0).toFixed(2)}</strong></td>
                    <td>{s.concurrency}</td>
                    <td>{maxTokens > 0 ? (maxTokens / 1000).toFixed(0) + "K" : "—"}</td>
                    <td>{s.priority}</td>
                    <td>
                      <button
                        className={`btn btn-xs ${s.enabled ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => toggleService(s.id)}
                      >
                        {s.enabled ? "已启用" : "已停用"}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-xs btn-secondary" onClick={() => setEditService({ ...s })}>
                        编辑
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Edit Modal */}
      {editService && (
        <div className="modal-overlay" onClick={() => setEditService(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 600 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>编辑模型配置</h3>
              <button className="modal-close" onClick={() => setEditService(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">厂商</label>
                  <input className="form-input" value={editService.provider} disabled />
                </div>
                <div className="form-group">
                  <label className="form-label">模型名称</label>
                  <input className="form-input" value={getField(editService, "model_name", "modelName") as string || ""} disabled />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">输入价格 ($/1M)</label>
                  <input className="form-input" type="number" value={getField(editService, "pricing_input", "pricingInput") as number || 0} onChange={(e) => setEditService({ ...editService, pricing_input: parseFloat(e.target.value) || 0, pricingInput: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">输出价格 ($/1M)</label>
                  <input className="form-input" type="number" value={getField(editService, "pricing_output", "pricingOutput") as number || 0} onChange={(e) => setEditService({ ...editService, pricing_output: parseFloat(e.target.value) || 0, pricingOutput: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">计价单位</label>
                  <input className="form-input" value={getField(editService, "pricing_unit", "pricingUnit") as string || ""} onChange={(e) => setEditService({ ...editService, pricing_unit: e.target.value, pricingUnit: e.target.value })} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">成本价 (¥)</label>
                  <input className="form-input" type="number" value={getField(editService, "base_price", "basePrice") as number || 0} onChange={(e) => setEditService({ ...editService, base_price: parseFloat(e.target.value) || 0, basePrice: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">利润率 (%)</label>
                  <input className="form-input" type="number" value={getField(editService, "profit_margin", "profitMargin") as number || 0} onChange={(e) => { const m = parseFloat(e.target.value) || 0; const bp = (getField(editService, "base_price", "basePrice") as number) || 0; const sp = Math.round(bp * (1 + m / 100) * 100) / 100; setEditService({ ...editService, profit_margin: m, profitMargin: m, sell_price: sp, sellPrice: sp }); }} />
                </div>
                <div className="form-group">
                  <label className="form-label">售价 (¥)</label>
                  <input className="form-input" type="number" value={getField(editService, "sell_price", "sellPrice") as number || 0} onChange={(e) => setEditService({ ...editService, sell_price: parseFloat(e.target.value) || 0, sellPrice: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">最大并发</label>
                  <input className="form-input" type="number" value={editService.concurrency} onChange={(e) => setEditService({ ...editService, concurrency: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">优先级</label>
                  <input className="form-input" type="number" value={editService.priority} onChange={(e) => setEditService({ ...editService, priority: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="form-group">
                  <label className="form-label">状态</label>
                  <select className="form-select" value={editService.enabled ? "true" : "false"} onChange={(e) => setEditService({ ...editService, enabled: e.target.value === "true" })}>
                    <option value="true">启用</option>
                    <option value="false">停用</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditService(null)}>取消</button>
              <button className="btn btn-primary" onClick={saveEdit}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Price Modal */}
      {showBatchPrice && (
        <div className="modal-overlay" onClick={() => setShowBatchPrice(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
            <div className="modal-header">
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>批量调价</h3>
              <button className="modal-close" onClick={() => setShowBatchPrice(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: "var(--color-text-secondary)" }}>
                将为选中的 {selectedIds.size} 个模型统一设置利润率
              </p>
              <div className="form-group">
                <label className="form-label">统一利润率 (%)</label>
                <input
                  className="form-input"
                  type="number"
                  value={batchPrice.profitMargin}
                  onChange={(e) => setBatchPrice({ profitMargin: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBatchPrice(false)}>取消</button>
              <button className="btn btn-primary" onClick={batchUpdatePrice}>确认调整</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
