import { useState } from "react";
import AgentLayout from "../../components/AgentLayout";
import HelpModal from "../../components/HelpModal";

/**
 * 客户消费明细页
 *
 * TODO: 后端消费端点 GET /api/v1/me/agent/customers/:id/consumption 尚未实现。
 * 当前使用 mock 数据展示 UI，待后端上线后替换。
 */

// ── Types ──
interface ConsumptionRecord {
  id: string;
  date: string;
  customerName: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

interface CustomerOption {
  id: string;
  name: string;
}

// ── Mock Data (TODO: replace with API) ──
const MOCK_CUSTOMERS: CustomerOption[] = [
  { id: "all", name: "全部客户" },
  { id: "C001", name: "星辰科技有限公司" },
  { id: "C002", name: "云帆网络" },
  { id: "C003", name: "智慧未来 AI" },
  { id: "C004", name: "数据驱动科技" },
  { id: "C010", name: "麒麟软件" },
];

const MODELS = ["DeepSeek-V4", "GLM-5.2", "Qwen3.5", "Kimi-K2.5", "GPT-5.4"];

const MOCK_RECORDS: ConsumptionRecord[] = Array.from({ length: 87 }, (_, i) => {
  const customers = MOCK_CUSTOMERS.filter((c) => c.id !== "all");
  const c = customers[i % customers.length]!;
  const day = String(Math.floor(Math.random() * 8) + 1).padStart(2, "0");
  const hour = String(Math.floor(Math.random() * 24)).padStart(2, "0");
  const min = String(Math.floor(Math.random() * 60)).padStart(2, "0");
  return {
    id: String(i + 1),
    date: `2026-08-${day} ${hour}:${min}`,
    customerName: c.name,
    model: MODELS[i % 5]!,
    tokensIn: Math.round(500 + Math.random() * 9500),
    tokensOut: Math.round(200 + Math.random() * 8000),
    cost: +(Math.random() * 19.9 + 0.01).toFixed(4),
  };
}).sort((a, b) => b.date.localeCompare(a.date));

// ── Component ──
export default function AgentConsumption() {
  const [customerFilter, setCustomerFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("全部");
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-08");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  let filtered = MOCK_RECORDS;
  if (customerFilter !== "all") {
    const c = MOCK_CUSTOMERS.find((x) => x.id === customerFilter);
    if (c) filtered = filtered.filter((r) => r.customerName === c.name);
  }
  if (modelFilter !== "全部") {
    filtered = filtered.filter((r) => r.model === modelFilter);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const totalCost = filtered.reduce((a, r) => a + r.cost, 0);
  const totalTokens = filtered.reduce((a, r) => a + r.tokensIn + r.tokensOut, 0);
  const avgCost = filtered.length > 0 ? totalCost / filtered.length : 0;

  const handleExport = () => {
    const headers = ["日期", "客户", "模型", "输入Token", "输出Token", "费用(元)"];
    const rows = filtered.map((r) => [r.date, r.customerName, r.model, String(r.tokensIn), String(r.tokensOut), r.cost.toFixed(4)]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consumption-export-${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AgentLayout>
      <h1 className="page-title">
        📊 客户消费明细
        <HelpModal title="客户消费明细">
          <p>查看您旗下所有客户的 API 消费明细。</p>
          <p style={{ marginTop: 8 }}>
            可按客户和模型筛选，选择日期范围查看消费记录。支持导出 CSV 报表。
          </p>
        </HelpModal>
      </h1>
      <p className="page-subtitle">追踪客户 API 调用和 Token 消耗情况</p>

      {/* TODO Banner */}
      <div className="panel mb-16" style={{ background: "var(--color-warning-light, #fff8e1)", padding: "10px 16px", borderRadius: "var(--radius-lg)" }}>
        <span style={{ color: "var(--color-warning-text, #8d6e00)", fontSize: 13 }}>
          ⚠️ 消费明细接口 (GET /api/v1/me/agent/customers/:id/consumption) 尚未上线，当前为示例数据。
        </span>
      </div>

      {/* Filter Bar */}
      <div className="flex-between mb-16" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="flex-wrap gap-8">
          <select
            className="form-select"
            style={{ width: 200 }}
            value={customerFilter}
            onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }}
          >
            {MOCK_CUSTOMERS.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ width: 160 }}
            value={modelFilter}
            onChange={(e) => { setModelFilter(e.target.value); setPage(1); }}
          >
            <option value="全部">全部模型</option>
            {MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
            className="form-input"
            style={{ width: 150 }}
          />
          <span className="text-muted">至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
            className="form-input"
            style={{ width: 150 }}
          />
        </div>
        <button className="btn btn-sm btn-secondary" onClick={handleExport}>
          📥 导出 CSV
        </button>
      </div>

      {/* Summary */}
      <div className="stats-grid">
        {[
          { l: "消费笔数", v: String(filtered.length) },
          { l: "总费用", v: `¥${totalCost.toFixed(2)}` },
          { l: "总 Token", v: totalTokens.toLocaleString() },
          { l: "笔均费用", v: `¥${avgCost.toFixed(4)}` },
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
          <span>消费记录</span>
          <span className="text-sm text-muted">
            共 {filtered.length} 条记录
          </span>
        </div>
        <div className="panel-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>客户</th>
                <th>模型</th>
                <th>输入 Token</th>
                <th>输出 Token</th>
                <th>费用</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center" style={{ padding: 40, color: "var(--color-text-secondary)" }}>
                    暂无消费记录
                  </td>
                </tr>
              ) : (
                pageData.map((r) => (
                  <tr key={r.id}>
                    <td>{r.date}</td>
                    <td>{r.customerName}</td>
                    <td>{r.model}</td>
                    <td>{r.tokensIn.toLocaleString()}</td>
                    <td>{r.tokensOut.toLocaleString()}</td>
                    <td className="text-mono">¥{r.cost.toFixed(4)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="panel-body">
          <div className="flex-between">
            <span className="text-sm text-muted">
              第 {safePage}/{totalPages} 页，共 {filtered.length} 条
            </span>
            <div className="flex-wrap">
              <button
                className="btn btn-sm btn-secondary"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                ‹ 上一页
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === "..." ? (
                    <span key={`d-${i}`} className="text-muted" style={{ padding: "0 4px" }}>…</span>
                  ) : (
                    <button
                      key={p}
                      className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-secondary"}`}
                      style={p === safePage ? undefined : { padding: "6px 12px" }}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  ),
                )}
              <button
                className="btn btn-sm btn-secondary"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                下一页 ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </AgentLayout>
  );
}
