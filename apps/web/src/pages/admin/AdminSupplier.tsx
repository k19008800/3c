import { useState, useEffect, useCallback, useRef } from "react";
import { Chart, registerables } from "chart.js";
import HelpModal from "../../components/HelpModal";
import Modal from "../../components/Modal";
import StatusBadge from "../../components/StatusBadge";
import { apiGet } from "../../services/api";

Chart.register(...registerables);

// ── API types ──

interface VendorData {
  id: number;
  name: string;
  code: string;
  status: string;
  status_label: string;
  base_url: string;
  api_format: string;
  currency: string;
  contact: string;
  is_active: boolean;
  model_count: number;
  created_at: string;
}

interface VendorKey {
  id: number;
  key_prefix: string;
  is_enabled: boolean;
  last_used_at: string;
  failed_count: number;
  created_at: string;
}

interface VendorModel {
  id: number;
  model_id: number;
  model_name: string;
  display_name: string;
  category: string;
  upstream_model: string;
  cost_input_price: number;
  cost_output_price: number;
  weight: number;
  priority: number;
  is_enabled: boolean;
  health_score: number;
  avg_latency_ms: number;
}

export default function AdminSupplier() {
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Detail state ──
  const [selectedVendor, setSelectedVendor] = useState<VendorData | null>(null);
  const [detailTab, setDetailTab] = useState<"info" | "keys" | "pricing">("info");
  const [vendorKeys, setVendorKeys] = useState<VendorKey[]>([]);
  const [vendorModels, setVendorModels] = useState<VendorModel[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  // ── Fetch vendor list ──
  const fetchVendors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ list: VendorData[]; pagination: { total: number } }>(
        "/admin/vendors",
        { page: 1, page_size: 100 },
      );
      setVendors(data.list ?? []);
    } catch (e: any) {
      setError(e.message ?? "加载供应商列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // ── When a vendor is selected, load keys + models ──
  useEffect(() => {
    if (!selectedVendor) return;
    setDetailLoading(true);

    Promise.all([
      apiGet<{ list: VendorKey[] }>(`/admin/vendors/${selectedVendor.id}/keys`).catch(() => ({ list: [] })),
      apiGet<{ list: VendorModel[] }>(`/admin/vendors/${selectedVendor.id}/models`).catch(() => ({ list: [] })),
    ]).then(([keys, models]) => {
      setVendorKeys(keys.list);
      setVendorModels(models.list);
    }).finally(() => setDetailLoading(false));
  }, [selectedVendor]);

  // ── Chart on vendor selection ──
  useEffect(() => {
    if (!chartRef.current || !selectedVendor) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const latencies = vendorModels.length > 0
      ? vendorModels.map((vm) => vm.avg_latency_ms || 100 + Math.random() * 50)
      : [selectedVendor.status === "active" ? 80 + Math.random() * 40 : 300 + Math.random() * 400];

    chartInstance.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: hours,
        datasets: latencies.length === 1 && vendorModels.length === 0
          ? [
              {
                label: "估计延迟 (ms)",
                data: Array.from({ length: 24 }, () => 80 + Math.random() * 60),
                borderColor: "#4f6ef7",
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
              },
            ]
          : vendorModels.filter((vm) => vm.avg_latency_ms > 0).slice(0, 6).map((vm, i) => ({
              label: vm.display_name || vm.model_name,
              data: Array.from({ length: 24 }, () => vm.avg_latency_ms + (Math.random() - 0.5) * vm.avg_latency_ms * 0.3),
              borderColor: ["#4f6ef7", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"][i % 6],
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 0,
              fill: false,
            })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: "top" } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: "ms" } },
          x: { grid: { display: false } },
        },
      },
    });

    return () => { chartInstance.current?.destroy(); };
  }, [selectedVendor, vendorModels]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return "success";
      case "maintenance": return "warning";
      case "offline": return "error";
      case "pending": return "pending";
      default: return "info";
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <h2 className="admin-page-title">
          供应商管理
          <HelpModal title="供应商管理">
            <p>管理所有 AI 模型供应商的接入信息、API Key 和模型映射价格配置。</p>
            <p><strong>数据来源</strong>：GET /api/v1/admin/vendors · GET /api/v1/admin/vendors/:id/keys · GET /api/v1/admin/vendors/:id/models</p>
            <p><strong>连通性监控</strong>：Chart.js 折线图展示供应商各模型延迟估计。</p>
          </HelpModal>
        </h2>
        <button className="btn btn-sm btn-secondary" onClick={fetchVendors} disabled={loading}>
          {loading ? "⏳" : "🔄"} 刷新
        </button>
      </div>

      {error && (
        <div className="panel" style={{ marginBottom: 12, background: "#fef2f2", borderColor: "#fecaca" }}>
          <div className="panel-body" style={{ color: "#dc2626" }}>⚠️ {error}</div>
        </div>
      )}

      {/* Supplier List */}
      <div className="panel">
        <div className="panel-body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th><th>供应商名称</th><th>状态</th><th>模型数</th><th>格式</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {vendors.length > 0 ? vendors.map((v) => (
                  <tr key={v.id} onClick={() => setSelectedVendor(v)} style={{ cursor: "pointer" }}>
                    <td>{v.id}</td>
                    <td><strong>{v.name}</strong></td>
                    <td>
                      <StatusBadge status={statusBadge(v.status)}>
                        {v.status_label}
                      </StatusBadge>
                    </td>
                    <td>{v.model_count}</td>
                    <td className="text-mono" style={{ fontSize: 12 }}>{v.api_format}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-xs btn-primary" onClick={() => setSelectedVendor(v)}>详情</button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: 40, color: "#888" }}>暂无供应商数据</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Supplier Detail Modal */}
      <Modal
        open={!!selectedVendor}
        onClose={() => setSelectedVendor(null)}
        title={`供应商详情 — ${selectedVendor?.name ?? ""}`}
        width={720}
      >
        {selectedVendor && (
          <>
            <div className="admin-detail-tabs">
              {(["info", "keys", "pricing"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`admin-detail-tab${detailTab === tab ? " active" : ""}`}
                  onClick={() => setDetailTab(tab)}
                >
                  {tab === "info" ? "📋 基本信息" : tab === "keys" ? "🔑 API Key 管理" : "💰 模型与价格"}
                </button>
              ))}
            </div>

            {detailTab === "info" && (
              <div style={{ marginTop: 16 }}>
                <div className="admin-detail-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div><strong>名称：</strong>{selectedVendor.name}</div>
                  <div><strong>编码：</strong>{selectedVendor.code}</div>
                  <div><strong>状态：</strong>
                    <StatusBadge status={statusBadge(selectedVendor.status)}>
                      {selectedVendor.status_label}
                    </StatusBadge>
                  </div>
                  <div><strong>活跃：</strong>{selectedVendor.is_active ? "✅" : "❌"}</div>
                  <div><strong>模型数量：</strong>{selectedVendor.model_count}</div>
                  <div><strong>货币：</strong>{selectedVendor.currency}</div>
                  <div><strong>联系邮箱：</strong>{selectedVendor.contact || "—"}</div>
                  <div><strong>API 端点：</strong><span className="text-mono" style={{ fontSize: 11 }}>{selectedVendor.base_url || "—"}</span></div>
                  <div><strong>格式：</strong>{selectedVendor.api_format}</div>
                  <div><strong>创建时间：</strong>{new Date(selectedVendor.created_at).toLocaleDateString("zh-CN")}</div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <h4 style={{ marginBottom: 8 }}>📈 模型延迟概览</h4>
                  <div className="chart-wrapper" style={{ height: 220 }}>
                    <canvas ref={chartRef} />
                  </div>
                </div>
              </div>
            )}

            {detailTab === "keys" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
                  GET /api/v1/admin/vendors/{selectedVendor.id}/keys
                </div>
                {detailLoading ? (
                  <div style={{ padding: 20, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr><th>ID</th><th>前缀</th><th>状态</th><th>失败次数</th><th>最后使用</th><th>创建时间</th></tr>
                    </thead>
                    <tbody>
                      {vendorKeys.length > 0 ? vendorKeys.map((k) => (
                        <tr key={k.id}>
                          <td>{k.id}</td>
                          <td className="text-mono">{k.key_prefix}</td>
                          <td>
                            <StatusBadge status={k.is_enabled ? "success" : "error"}>
                              {k.is_enabled ? "启用" : "停用"}
                            </StatusBadge>
                          </td>
                          <td>{k.failed_count}</td>
                          <td style={{ fontSize: 12 }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString("zh-CN") : "—"}</td>
                          <td style={{ fontSize: 12 }}>{new Date(k.created_at).toLocaleDateString("zh-CN")}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={6} style={{ textAlign: "center", padding: 20, color: "#888" }}>暂无 Key</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {detailTab === "pricing" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
                  GET /api/v1/admin/vendors/{selectedVendor.id}/models
                </div>
                {detailLoading ? (
                  <div style={{ padding: 20, textAlign: "center", color: "#888" }}>⏳ 加载中…</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th><th>模型</th><th>上游模型</th><th>输入价格</th><th>输出价格</th><th>权重</th><th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorModels.length > 0 ? vendorModels.map((vm) => (
                        <tr key={vm.id}>
                          <td>{vm.id}</td>
                          <td><strong>{vm.display_name || vm.model_name}</strong><br /><span style={{ fontSize: 11, color: "#888" }}>{vm.category}</span></td>
                          <td className="text-mono" style={{ fontSize: 12 }}>{vm.upstream_model}</td>
                          <td className="text-mono">¥{vm.cost_input_price.toFixed(4)}</td>
                          <td className="text-mono">¥{vm.cost_output_price.toFixed(4)}</td>
                          <td>{vm.weight} (P{vm.priority})</td>
                          <td>
                            <StatusBadge status={vm.is_enabled ? "success" : "inactive"}>
                              {vm.is_enabled ? "启用" : "停用"}
                            </StatusBadge>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={7} style={{ textAlign: "center", padding: 20, color: "#888" }}>暂无模型映射</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
