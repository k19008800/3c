import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface Vendor {
  id: string;
  name: string;
  desc: string;
  logoColor: string;
  logoText: string;
  inputPrice: number;
  outputPrice: number;
  credit: string;
  creditClass: string;
  recommended: boolean;
  recommendReason?: string;
  health: number;
  latency: number;
  maintenance: boolean;
}

interface ModelOption {
  id: string;
  label: string;
  vendors: Vendor[];
}

/* ============ 模拟模型-厂商数据（后端缺失 /vendors/by-model） ============ */
const MODEL_VENDORS: Record<string, Vendor[]> = {
  "glm-5.2": [
    { id: "vendor_a", name: "智谱AI", desc: "原厂直供，官方授权服务商", logoColor: "#4f6ef7", logoText: "智", inputPrice: 1.00, outputPrice: 2.00, credit: "AAA", creditClass: "aaa", recommended: true, recommendReason: "原厂直供，稳定性最高，响应速度最优", health: 99, latency: 180, maintenance: false },
    { id: "vendor_b", name: "云厂商B", desc: "规模化部署，高性价比之选", logoColor: "#e67e22", logoText: "B", inputPrice: 0.80, outputPrice: 1.60, credit: "AA", creditClass: "aa", recommended: false, health: 97, latency: 210, maintenance: false },
    { id: "vendor_c", name: "云厂商C", desc: "经济型选择，适合低频调用", logoColor: "#16a085", logoText: "C", inputPrice: 0.70, outputPrice: 1.40, credit: "A", creditClass: "a", recommended: false, health: 95, latency: 250, maintenance: false },
  ],
  "deepseek-v4": [
    { id: "vendor_a", name: "DeepSeek", desc: "原厂直供，官方授权", logoColor: "#1a73e8", logoText: "D", inputPrice: 0.50, outputPrice: 1.20, credit: "AAA", creditClass: "aaa", recommended: true, recommendReason: "原厂直供，最低延迟，最高稳定性", health: 98, latency: 160, maintenance: false },
    { id: "vendor_b", name: "云厂商B", desc: "分布式部署，多区域容灾", logoColor: "#e67e22", logoText: "B", inputPrice: 0.45, outputPrice: 1.08, credit: "AA", creditClass: "aa", recommended: false, health: 96, latency: 200, maintenance: false },
  ],
  "gpt-4o": [
    { id: "vendor_a", name: "OpenAI 官方", desc: "原厂 API，官方授权", logoColor: "#10a37f", logoText: "O", inputPrice: 2.50, outputPrice: 10.00, credit: "AAA", creditClass: "aaa", recommended: true, recommendReason: "官方直供，无中间环节，稳定性最高", health: 99, latency: 220, maintenance: false },
    { id: "vendor_b", name: "云厂商B", desc: "中转代理，经济实惠", logoColor: "#e67e22", logoText: "B", inputPrice: 2.20, outputPrice: 8.80, credit: "AA", creditClass: "aa", recommended: false, health: 94, latency: 280, maintenance: false },
    { id: "vendor_c", name: "云厂商C", desc: "经济型中转", logoColor: "#16a085", logoText: "C", inputPrice: 2.00, outputPrice: 8.00, credit: "A", creditClass: "a", recommended: false, health: 88, latency: 320, maintenance: true },
  ],
  "claude-4-sonnet": [
    { id: "vendor_a", name: "Anthropic 官方", desc: "原厂直供", logoColor: "#d97706", logoText: "A", inputPrice: 3.00, outputPrice: 15.00, credit: "AAA", creditClass: "aaa", recommended: true, recommendReason: "官方直供，无中间环节", health: 98, latency: 200, maintenance: false },
    { id: "vendor_b", name: "云厂商B", desc: "代理中转", logoColor: "#e67e22", logoText: "B", inputPrice: 2.70, outputPrice: 13.50, credit: "AA", creditClass: "aa", recommended: false, health: 92, latency: 260, maintenance: false },
  ],
  "qwen3-72b": [
    { id: "vendor_a", name: "阿里云", desc: "原厂直供，通义千问官方", logoColor: "#ff6a00", logoText: "阿", inputPrice: 0.40, outputPrice: 1.00, credit: "AAA", creditClass: "aaa", recommended: true, recommendReason: "原厂直供，最优价格与延迟", health: 99, latency: 150, maintenance: false },
    { id: "vendor_b", name: "云厂商B", desc: "代理部署", logoColor: "#e67e22", logoText: "B", inputPrice: 0.36, outputPrice: 0.90, credit: "AA", creditClass: "aa", recommended: false, health: 95, latency: 220, maintenance: false },
  ],
};

function healthColor(score: number): string {
  if (score >= 95) return "#22c55e";
  if (score >= 80) return "#f0ad4e";
  return "#e53935";
}

function sortVendors(vendors: Vendor[]): Vendor[] {
  return [...vendors].sort((a, b) => {
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    if (a.inputPrice !== b.inputPrice) return a.inputPrice - b.inputPrice;
    const order = { AAA: 3, AA: 2, A: 1 };
    return (order[b.credit as keyof typeof order] || 0) - (order[a.credit as keyof typeof order] || 0);
  });
}

export default function VendorSelectorPage() {
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null); // null = auto
  const [compareExpanded, setCompareExpanded] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  /* 可用模型列表（后端缺失：/vendors/models 获取可选的模型列表） */
  const modelOptions = Object.keys(MODEL_VENDORS).map((id) => ({
    id,
    label: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  const vendors = MODEL_VENDORS[selectedModel] ?? [];
  const sortedVendors = useMemo(() => sortVendors(vendors), [vendors]);

  const selectedVendor = selectedModel ? (selectedVendorId ? vendors.find((v) => v.id === selectedVendorId) ?? null : null) : null;

  /* 厂商列表页（后端缺失：/vendors/public 公共列表接口） */
  const publicVendorsQ = useQuery({
    queryKey: ["vendors-public"],
    queryFn: async () => {
      try {
        const r = await api.get<{ data: { list: Vendor[] } }>("/vendors/public");
        return r.data.data.list;
      } catch {
        return [];
      }
    },
    staleTime: 60000,
  });

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    setSelectedVendorId(null);
  };

  const handleSelectAuto = () => {
    setSelectedVendorId(null);
  };

  const handleSelectVendor = (id: string) => {
    const v = vendors.find((x) => x.id === id);
    if (v && !v.maintenance) {
      setSelectedVendorId(id);
    }
  };

  const showTooltip = (e: React.MouseEvent, text: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ text, x: rect.left, y: rect.bottom + 8 });
  };

  const hideTooltip = () => {
    setTooltip(null);
  };

  return (
    <div>
      {/* 标题 */}
      <h2 style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
        🔑 模型厂商选择
        <HelpIcon text="选择调用模型时使用的厂商。不同厂商价格、稳定性、延迟不同，可自行判断性价比" level="page" />
      </h2>

      {/* ===== 1. 模型选择区 ===== */}
      <div style={{ background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>调用模型</label>
          <HelpIcon text="选择要调用的 AI 模型，不同模型支持不同厂商" />
          <select
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            style={{
              height: 40,
              minWidth: 280,
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              padding: "0 12px",
              fontSize: 14,
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="">— 请选择模型 —</option>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: "#888", marginLeft: 8 }}>
            {selectedModel ? `已加载 ${vendors.length} 个可用厂商` : "选择模型后自动加载可选厂商"}
          </span>
        </div>
      </div>

      {/* ===== 2. 厂商选择器面板（原型：vendor-panel） ===== */}
      {selectedModel && (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
              厂商选择
              <HelpIcon text="同一模型可由不同厂商提供，价格和服务质量不同。选择自动则由系统智能路由" />
            </h3>
            <span style={{ fontSize: 13, color: "#888" }}>{vendors.length} 个厂商可选</span>
          </div>

          {/* 自动选择选项 */}
          <div
            onClick={handleSelectAuto}
            style={{
              padding: "14px 20px",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              background: selectedVendorId === null ? "#f8f9ff" : "transparent",
              transition: "background .15s",
            }}
          >
            <input
              type="radio"
              name="vendor"
              checked={selectedVendorId === null}
              onChange={() => {}}
              style={{ width: 18, height: 18, accentColor: "#4f6ef7", cursor: "pointer" }}
            />
            <span style={{ fontSize: 14, fontWeight: 500, color: "#333" }}>自动选择</span>
            <span style={{ fontSize: 12, color: "#888", marginLeft: 8 }}>
              系统智能路由，自动选择最优厂商
            </span>
            <span style={{ marginLeft: "auto" }}>
              <HelpIcon text="系统根据健康度、延迟、价格综合评分，自动选择当前最优厂商" />
            </span>
          </div>

          {/* 厂商卡片列表 */}
          {sortedVendors.map((v) => {
            const isSelected = selectedVendorId === v.id;
            return (
              <div
                key={v.id}
                onClick={() => handleSelectVendor(v.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 20px",
                  borderBottom: "1px solid #f5f5f5",
                  cursor: v.maintenance ? "not-allowed" : "pointer",
                  background: isSelected ? "#eef1ff" : v.maintenance ? "#fafafa" : "transparent",
                  opacity: v.maintenance ? 0.5 : 1,
                  transition: "background .15s",
                }}
              >
                <input
                  type="radio"
                  name="vendor"
                  checked={isSelected}
                  disabled={v.maintenance}
                  onChange={() => {}}
                  style={{ width: 18, height: 18, accentColor: "#4f6ef7", cursor: "pointer", flexShrink: 0 }}
                />

                {/* 厂商 Logo */}
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    background: v.logoColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    fontWeight: 700,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {v.logoText}
                </div>

                {/* 厂商信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "#333" }}>{v.name}</span>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        background: v.creditClass === "aaa" ? "#e8f5e9" : v.creditClass === "aa" ? "#e3f2fd" : "#f5f5f5",
                        color: v.creditClass === "aaa" ? "#2e7d32" : v.creditClass === "aa" ? "#1565c0" : "#888",
                      }}
                    >
                      {v.credit}
                    </span>
                    {v.recommended && (
                      <span
                        onMouseEnter={(e) => v.recommendReason && showTooltip(e, v.recommendReason)}
                        onMouseLeave={hideTooltip}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 500,
                          background: "#fff8e1",
                          color: "#f57c00",
                          cursor: "default",
                        }}
                      >
                        <span style={{ color: "#ffc107" }}>⭐</span> 推荐
                      </span>
                    )}
                    {v.maintenance && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          background: "#ffebee",
                          color: "#c62828",
                        }}
                      >
                        🔧 维护中
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{v.desc}</div>
                </div>

                {/* 价格 */}
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 140 }}>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                    输入 <span style={{ fontWeight: 600, color: "#333" }}>¥{v.inputPrice.toFixed(2)}</span> /1M
                  </div>
                  <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                    输出 <span style={{ fontWeight: 600, color: "#333" }}>¥{v.outputPrice.toFixed(2)}</span> /1M
                  </div>
                </div>

                {/* 健康度和延迟 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, minWidth: 90 }}>
                  <span
                    onMouseEnter={(e) => showTooltip(e, `健康分：${v.health}/100，平均延迟：${v.latency}ms`)}
                    onMouseLeave={hideTooltip}
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: healthColor(v.health),
                      cursor: "default",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#888" }}>健康 {v.health}</span>
                  <span style={{ fontSize: 12, color: "#888" }}>延迟 {v.latency}ms</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 3. 调用预览（原型：call-preview） ===== */}
      {selectedModel && vendors.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 6 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
              调用预览
              <HelpIcon text="展示当前选择的实际调用参数和预估价格" />
            </h3>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#888" }}>实际调用 model 值</span>
                <span
                  style={{
                    fontFamily: "SF Mono, Fira Code, Consolas, monospace",
                    background: "#f5f5f5",
                    padding: "4px 10px",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  {selectedModel}{selectedVendor ? `@${selectedVendor.id}` : "@auto"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#888" }}>预估单价（输入）</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#4f6ef7" }}>
                  {selectedVendor
                    ? `¥${selectedVendor.inputPrice.toFixed(2)} /1M tokens`
                    : sortedVendors.length > 0
                    ? `¥${sortedVendors[0]!.inputPrice.toFixed(2)} ~ ¥${sortedVendors[sortedVendors.length - 1]!.inputPrice.toFixed(2)} /1M tokens`
                    : "—"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#888" }}>预估单价（输出）</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#4f6ef7" }}>
                  {selectedVendor
                    ? `¥${selectedVendor.outputPrice.toFixed(2)} /1M tokens`
                    : sortedVendors.length > 0
                    ? `¥${sortedVendors[0]!.outputPrice.toFixed(2)} ~ ¥${sortedVendors[sortedVendors.length - 1]!.outputPrice.toFixed(2)} /1M tokens`
                    : "—"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "#888" }}>厂商</span>
                <span style={{ fontSize: 14, color: "#333" }}>
                  {selectedVendor ? selectedVendor.name : "系统智能路由"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => alert("模拟调用（原型演示）")}
                style={{
                  padding: "12px 32px",
                  fontSize: 15,
                  borderRadius: 8,
                  border: "none",
                  background: "#4f6ef7",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                ▶ 发起调用
                <HelpIcon text="使用当前配置发起一次 API 调用" />
              </button>
              <button
                onClick={() => alert("已保存默认配置")}
                style={{
                  padding: "12px 24px",
                  fontSize: 14,
                  borderRadius: 8,
                  border: "1px solid #d9d9d9",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                ⭐ 保存为默认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 4. 厂商对比表（原型：可折叠） ===== */}
      {selectedModel && vendors.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div
            onClick={() => setCompareExpanded(!compareExpanded)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
              padding: "12px 0",
              fontSize: 14,
              color: "#4f6ef7",
              userSelect: "none",
            }}
          >
            <span style={{ transform: compareExpanded ? "rotate(90deg)" : "none", transition: "transform .2s", fontSize: 12 }}>
              ▶
            </span>
            <span>厂商对比表</span>
            <HelpIcon text="横向对比所有厂商的价格、信用、延迟和健康分" />
          </div>
          {compareExpanded && (
            <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "10px 12px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>厂商</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>
                      输入价格<br /><span style={{ fontSize: 11 }}>(¥/1M tokens)</span>
                    </th>
                    <th style={{ textAlign: "center", padding: "10px 12px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>
                      输出价格<br /><span style={{ fontSize: 11 }}>(¥/1M tokens)</span>
                    </th>
                    <th style={{ textAlign: "center", padding: "10px 12px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>信用评级</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>健康分</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>平均延迟</th>
                    <th style={{ textAlign: "center", padding: "10px 12px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedVendors.map((v) => (
                    <tr key={v.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <strong>{v.name}</strong>{v.recommended ? " ⭐" : ""}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>¥{v.inputPrice.toFixed(2)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>¥{v.outputPrice.toFixed(2)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            background: v.creditClass === "aaa" ? "#e8f5e9" : v.creditClass === "aa" ? "#e3f2fd" : "#f5f5f5",
                            color: v.creditClass === "aaa" ? "#2e7d32" : v.creditClass === "aa" ? "#1565c0" : "#888",
                          }}
                        >
                          {v.credit}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: healthColor(v.health), marginRight: 4 }} />
                        {v.health}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>{v.latency}ms</td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {v.maintenance ? (
                          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#f5f5f5", color: "#888" }}>维护中</span>
                        ) : (
                          <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 11, background: "#e8f5e9", color: "#2e7d32" }}>可用</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tooltip 浮层 */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y,
            background: "#333",
            color: "#fff",
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            zIndex: 9999,
            pointerEvents: "none",
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
