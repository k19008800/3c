import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, StatusBadge, Tag, Table, SkeletonGroup, EmptyState } from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/* ═══════════════════════════════════════
 * 类型
 * ═══════════════════════════════════════ */

interface ModelHealth {
  model: string;
  supplier_count: number;
  success_rate: number | null;
  p50_ms: number;
  p99_ms: number;
  status: "healthy" | "degraded" | "unavailable" | "no_data";
  min_price: number | null;
  traffic_volume: number;
}

interface SupplierHealth {
  id: number;
  name: string;
  success_rate: number | null;
  error_rate: number | null;
  p50_ms: number;
  p99_ms: number;
  status: "active" | "disabled" | "testing";
  price_input: number | null;
  price_output: number | null;
  traffic_volume: number;
}

/* ═══════════════════════════════════════
 * 常量
 * ═══════════════════════════════════════ */

const WINDOWS = [
  { key: "5m", label: "5min" },
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
] as const;

type WindowKey = (typeof WINDOWS)[number]["key"];

const STATUS_META: Record<ModelHealth["status"], { text: string; badge: "success" | "warning" | "danger" | "default" }> = {
  healthy: { text: "健康", badge: "success" },
  degraded: { text: "降级", badge: "warning" },
  unavailable: { text: "异常", badge: "danger" },
  no_data: { text: "无数据", badge: "default" },
};

const SORT_OPTIONS = [
  { key: "status", label: "状态排序" },
  { key: "success_asc", label: "成功率 ↑" },
  { key: "p50_asc", label: "P50延迟 ↑" },
  { key: "price_asc", label: "最低价格 ↑" },
] as const;

const fmtPct = (v: number | null) => (v == null ? "—" : `${v}%`);
const fmtMs = (v: number) => (v > 0 ? `${v}ms` : "—");
const fmtPrice = (v: number | null) => (v == null ? "—" : `¥${v}`);
const fmtNum = (v: number) => (v > 0 ? v.toLocaleString() : "0");

/* ═══════════════════════════════════════
 * 样式
 * ═══════════════════════════════════════ */

const card: React.CSSProperties = {
  background: "var(--color-panel)",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
  marginBottom: 20,
};

const cellStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, borderBottom: "1px solid #f0f0f0" };
const thStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 600, background: "#f5f6f8", textAlign: "left" };

/* ═══════════════════════════════════════
 * 页面
 * ═══════════════════════════════════════ */

export default function AdminMarketplaceHealthPage() {
  const [windowKey, setWindowKey] = useState<WindowKey>("1h");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState("status");
  const [expanded, setExpanded] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["admin-marketplace-health", windowKey],
    queryFn: async () =>
      (await api.get<{ data: { items: ModelHealth[] } }>(`/admin/models/marketplace?window=${windowKey}`)).data.data.items,
    refetchInterval: 30000, // 每 30s 自动刷新
  });

  // 展开行的供应商详情（懒加载）
  const detailQ = useQuery({
    queryKey: ["admin-marketplace-suppliers", expanded, windowKey],
    enabled: !!expanded,
    queryFn: async () =>
      (await api.get<{ data: { suppliers: SupplierHealth[] } }>(
        `/admin/models/marketplace/${encodeURIComponent(expanded!)}/suppliers?window=${windowKey}`,
      )).data.data.suppliers,
  });

  /* ── 过滤 + 排序 ── */
  const items = useMemo(() => {
    let list = listQ.data ?? [];
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter((it) => it.model.toLowerCase().includes(kw));
    }
    if (statusFilter) list = list.filter((it) => it.status === statusFilter);

    const sorted = [...list];
    switch (sortKey) {
      case "success_asc":
        sorted.sort((a, b) => (a.success_rate ?? -1) - (b.success_rate ?? -1));
        break;
      case "p50_asc":
        sorted.sort((a, b) => a.p50_ms - b.p50_ms);
        break;
      case "price_asc":
        sorted.sort((a, b) => (a.min_price ?? Infinity) - (b.min_price ?? Infinity));
        break;
      default:
        // 后端已按 健康→降级→异常→无数据 排，这里保持
        break;
    }
    return sorted;
  }, [listQ.data, keyword, statusFilter, sortKey]);

  const toggleExpand = (model: string) => {
    setExpanded((prev) => (prev === model ? null : model));
  };

  const exportCsv = () => {
    const header = ["模型", "供应商数", "成功率", "P50延迟", "P99延迟", "状态", "最低价格", "请求量"].join(",");
    const rows = items.map((it) =>
      [it.model, it.supplier_count, it.success_rate ?? "", it.p50_ms, it.p99_ms, STATUS_META[it.status].text, it.min_price ?? "", it.traffic_volume].join(","),
    );
    const blob = new Blob(["﻿" + [header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `模型市场-${windowKey}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
  };

  /* ── 供应商详情子表（展开行） ── */
  const renderDetail = () => {
    if (!expanded) return null;
    const suppliers = detailQ.data;
    return (
      <div style={{ marginTop: 10, borderRadius: 8, border: "1px solid #e8e9ec", overflow: "hidden", background: "#fafbfc" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>供应商</th>
              <th style={thStyle}>成功率</th>
              <th style={thStyle}>错误率</th>
              <th style={thStyle}>P50延迟</th>
              <th style={thStyle}>P99延迟</th>
              <th style={thStyle}>价格(输入/输出)</th>
              <th style={thStyle}>状态</th>
            </tr>
          </thead>
          <tbody>
            {detailQ.isError ? (
              <tr><td colSpan={7} style={{ ...cellStyle, textAlign: "center", padding: 20, color: "#dc2626" }}>供应商明细加载失败，请重试</td></tr>
            ) : !suppliers ? (
              <tr><td colSpan={7} style={{ ...cellStyle, textAlign: "center", padding: 20 }}>
                <SkeletonGroup lines={3} />
              </td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td colSpan={7} style={{ ...cellStyle, textAlign: "center", padding: 20 }}>暂无供应商数据</td></tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id}>
                  <td style={cellStyle}><strong>{s.name}</strong></td>
                  <td style={{ ...cellStyle, color: rateColor(s.success_rate), fontWeight: 600 }}>{fmtPct(s.success_rate)}</td>
                  <td style={{ ...cellStyle, color: rateColor(s.error_rate, true), fontWeight: 600 }}>{fmtPct(s.error_rate)}</td>
                  <td style={cellStyle}>{fmtMs(s.p50_ms)}</td>
                  <td style={cellStyle}>{fmtMs(s.p99_ms)}</td>
                  <td style={cellStyle}>{fmtPrice(s.price_input)} / {fmtPrice(s.price_output)}</td>
                  <td style={cellStyle}>{supplierStatusTag(s.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const columns: ColumnDef<ModelHealth>[] = [
    {
      key: "model",
      title: "模型",
      dataIndex: "model",
      render: (v, record) => (
        <div style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleExpand(record.model)}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              display: "inline-block",
              transition: "transform .2s",
              fontSize: 10,
              color: "#999",
              transform: expanded === record.model ? "rotate(90deg)" : undefined,
            }}>▶</span>
            <strong>{record.model}</strong>
            <span style={{ fontSize: 11, color: "#888" }}>· {fmtNum(record.traffic_volume)} 请求</span>
          </div>
          {expanded === record.model && renderDetail()}
        </div>
      ),
    },
    { key: "supplier_count", title: "供应商数", dataIndex: "supplier_count" },
    {
      key: "success_rate",
      title: "成功率",
      dataIndex: "success_rate",
      render: (v) => <span style={{ color: rateColor(v as number | null), fontWeight: 600 }}>{fmtPct(v as number | null)}</span>,
    },
    { key: "p50_ms", title: "P50延迟", dataIndex: "p50_ms", render: (v) => fmtMs(v as number) },
    { key: "p99_ms", title: "P99延迟", dataIndex: "p99_ms", render: (v) => fmtMs(v as number) },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => {
        const meta = STATUS_META[v as ModelHealth["status"]];
        return <StatusBadge status={meta.badge}>{meta.text}</StatusBadge>;
      },
    },
    { key: "min_price", title: "最低价格(¥/1M tokens)", dataIndex: "min_price", render: (v) => <strong>{fmtPrice(v as number | null)}</strong> },
  ];

  return (
    <div>
      {/* 标题 + 帮助 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>🤖 模型市场</h2>
        <HelpIcon text="marketplace" />
      </div>

      {/* 筛选区 */}
      <div style={{ ...card, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {/* 数据窗口 */}
        <div style={{ display: "inline-flex", background: "#f0f2f5", borderRadius: 6, padding: 2, gap: 2 }}>
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              style={{
                padding: "4px 14px",
                fontSize: 12,
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                background: windowKey === w.key ? "#4f6ef7" : "transparent",
                color: windowKey === w.key ? "#fff" : "#888",
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: "#888" }}>每 30s 自动刷新</span>

        <div style={{ flex: 1 }} />

        {/* 搜索 */}
        <input
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: 200 }}
          placeholder="搜索模型..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        {/* 状态筛选 */}
        <select
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全部状态</option>
          <option value="healthy">健康</option>
          <option value="degraded">降级</option>
          <option value="unavailable">异常</option>
          <option value="no_data">无数据</option>
        </select>
        {/* 排序 */}
        <select
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
        {/* 导出 */}
        <button
          onClick={exportCsv}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        >
          导出
        </button>
      </div>

      {/* 表格 */}
      <div style={{ ...card }}>
        {listQ.isError ? (
          <EmptyState title="加载失败" description="模型市场数据拉取失败，请确认 API 服务与聚合 Worker 状态" />
        ) : listQ.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : items.length === 0 ? (
          <EmptyState title="暂无模型数据" description="当前窗口没有模型健康数据，请切换数据窗口或等待聚合 Worker 产出数据" />
        ) : (
          <Table
            columns={columns}
            dataSource={items}
            rowKey="model"
            emptyText="暂无匹配的模型"
          />
        )}
      </div>

      {/* 口径说明 */}
      <div style={{ fontSize: 11, color: "#888", marginTop: -8 }}>
        成功率≥95% 健康 · 90~95% 降级 · &lt;90% 异常 · 零流量显示"无数据"。数据来自最近 {windowKey} 生产流量 + 通道测试。
        最低价格 = 各供应商输入价最低值。
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
 * 工具
 * ═══════════════════════════════════════ */

function rateColor(v: number | null, invert = false): string {
  if (v == null) return "#8a919f";
  // 错误率：数字越大越红；成功率：数字越小越红
  const bad = invert ? v > 5 : v < 90;
  const warn = invert ? v > 1 : v < 95;
  if (bad) return "#dc2626";
  if (warn) return "#d97706";
  return "#16a34a";
}

function supplierStatusTag(status: SupplierHealth["status"]) {
  switch (status) {
    case "active":
      return <Tag type="green">active</Tag>;
    case "testing":
      return <Tag type="blue">testing</Tag>;
    default:
      return <Tag type="gray">disabled</Tag>;
  }
}
