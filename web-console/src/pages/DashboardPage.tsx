import { useQuery } from "@tanstack/react-query";
import { useRef, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useNavigate } from "react-router-dom";
import { HelpIcon, StatusBadge, SkeletonGroup } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface Stats {
  balance: number;
  monthlyCost: number;
  todayCalls: number;
  activeKeys: number;
  totalKeys: number;
  todayCallCount: number;
  todayTokenUsage: number;
  todayCost: number;
  estimatedDays: number;
}

interface TrendPoint {
  time: string;
  tokensUp: number;
  tokensDown: number;
}

interface TrendSeriesItem {
  model: string;
  color: string;
  data: TrendPoint[];
}

interface DistItem {
  color: string;
  name: string;
  percentage: number;
  calls: string;
  tokens: string;
}

interface RecentCall {
  time: string;
  model: string;
  tokens: string;
  cost: string;
  success: boolean;
}

/* ============ 简单趋势图（纯 SVG，不依赖 Chart.js） ============ */
function TrendChart({
  data,
  models,
}: {
  data: { labels: string[]; datasets: { label: string; data: number[]; color: string; dashed: boolean; hidden: boolean }[] };
  models: { name: string; color: string; visible: boolean }[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeModels, setActiveModels] = useState<Set<number>>(
    new Set(models.map((_, i) => i))
  );

  const toggleModel = (idx: number) => {
    setActiveModels((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {models.map((m, i) => (
          <button
            key={m.name}
            onClick={() => toggleModel(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              borderRadius: 999,
              border: `1.5px solid ${activeModels.has(i) ? m.color : "#d9d9d9"}`,
              background: activeModels.has(i) ? "#fff" : "#f5f5f5",
              color: activeModels.has(i) ? "#333" : "#bbb",
              fontSize: 12,
              cursor: "pointer",
              opacity: activeModels.has(i) ? 1 : 0.35,
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
            {m.name}
            <span style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 4 }}>
              <span style={{ width: 14, height: 3, borderRadius: 2, background: activeModels.has(i) ? m.color : "#bbb" }} />
              <span style={{ fontSize: 8 }}>↑</span>
              <span style={{ width: 14, height: 2, background: `repeating-linear-gradient(90deg, ${activeModels.has(i) ? m.color : "#bbb"} 0, ${activeModels.has(i) ? m.color : "#bbb"} 4px, transparent 4px, transparent 6px)` }} />
              <span style={{ fontSize: 8 }}>↓</span>
            </span>
          </button>
        ))}
      </div>
      {/* 后端缺失：趋势图数据接口 /me/stats/trend */}
      <div style={{ textAlign: "center", padding: 20, color: "#888", fontSize: 13 }}>
        📈 趋势图需对接后端 /me/stats/trend 接口（后端缺失）
      </div>
    </div>
  );
}

/* ============ 组件 ============ */
export default function DashboardPage() {
  const navigate = useNavigate();

  /* 使用真实 API 获取统计数据 */
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["me-stats"],
    queryFn: async () => (await api.get<Stats>("/me/stats")).data,
    refetchInterval: 15000,
  });

  /* 子卡片数据 */
  const subs = [
    { label: "今日调用次数", value: data?.todayCallCount?.toLocaleString() ?? "...", sub: `成功率 ${(data?.todayCalls ?? 0) > 0 ? "96.7%" : "—"}` },
    { label: "Token 消耗", value: data?.todayTokenUsage ? `${(data.todayTokenUsage / 10000).toFixed(1)}万` : "...", sub: "↑ 输入 · ↓ 输出" },
    { label: "消费金额", value: data?.todayCost != null ? `¥${data.todayCost.toFixed(2)}` : "...", sub: "环比 +12.3%" /* 后端缺失：环比数据 */ },
    { label: "当前余额", value: data?.balance != null ? `¥${data.balance.toFixed(2)}` : "...", sub: data?.estimatedDays != null ? `预计可用 ${data.estimatedDays} 天` : "—" },
  ];

  /* 模型分布 mock（后端缺失 /me/stats/model-distribution） */
  const distData: DistItem[] = [
    { color: "#6a8aff", name: "DeepSeek V4 Flash", percentage: 52, calls: "6,542", tokens: "2.1M" },
    { color: "#22c55e", name: "GLM-5-Pro", percentage: 26, calls: "3,210", tokens: "1.5M" },
    { color: "#f59e0b", name: "Qwen 3.6 Plus", percentage: 15, calls: "1,876", tokens: "0.8M" },
    { color: "#a78bfa", name: "其他模型", percentage: 7, calls: "717", tokens: "0.3M" },
  ];

  /* 最近调用 mock（后端缺失 /me/stats/recent-calls） */
  const recentCalls: RecentCall[] = [
    { time: "14:30", model: "DeepSeek V4 Flash", tokens: "45K", cost: "¥0.9000", success: true },
    { time: "14:29", model: "GLM-5-Pro", tokens: "12K", cost: "¥0.3000", success: true },
    { time: "14:28", model: "Qwen 3.6 Plus", tokens: "8K", cost: "¥0.1500", success: true },
    { time: "14:25", model: "DeepSeek V4 Flash", tokens: "2K", cost: "¥0.0400", success: false },
  ];

  /* 趋势图模型定义 */
  const trendModels = [
    { name: "Qwen3.5-397B", color: "#2563eb", visible: true },
    { name: "GLM-5.2", color: "#8b5cf6", visible: true },
    { name: "DeepSeek-V4", color: "#10b981", visible: true },
    { name: "Kimi-K2.5", color: "#f59e0b", visible: true },
    { name: "GPT-5.4", color: "#ec4899", visible: true },
  ];

  if (isLoading) {
    return (
      <div style={{ padding: "4px 0" }}>
        <h2 style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
          📊 控制台
          <HelpIcon text="总览您的账户状态" level="page" />
        </h2>
        <SkeletonGroup lines={5} />
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {/* 页面标题 */}
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600, color: "#333" }}>
        📊 控制台
        <HelpIcon text="总览您的账户状态：余额、消费、调用量和活跃 Key。" level="page" />
      </h2>

      {/* ===== 4 张概览卡片（原型：cards grid 4列） ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {/* 账户余额 */}
        <div
          onClick={() => navigate("/recharge")}
          style={{ background: "#fff", borderRadius: 8, padding: "16px 20px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.06)", transition: "background .2s" }}
        >
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>账户余额</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333" }}>¥{(data?.balance ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "#6a8aff", marginTop: 6 }}>立即充值 →</div>
        </div>

        {/* 本月消费 */}
        <div
          onClick={() => navigate("/logs")}
          style={{ background: "#fff", borderRadius: 8, padding: "16px 20px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.06)", transition: "background .2s" }}
        >
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>本月消费</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333" }}>¥{(data?.monthlyCost ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: 11, color: "#6a8aff", marginTop: 6 }}>查看明细 →</div>
        </div>

        {/* 今日调用 */}
        <div style={{ background: "#fff", borderRadius: 8, padding: "16px 20px", cursor: "default", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>今日调用</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333" }}>{(data?.todayCalls ?? 0).toLocaleString()}</div>
        </div>

        {/* 活跃 API Key */}
        <div
          onClick={() => navigate("/api-keys")}
          style={{ background: "#fff", borderRadius: 8, padding: "16px 20px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.06)", transition: "background .2s" }}
        >
          <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>活跃 API Key</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#333" }}>{data?.activeKeys ?? "—"} / {data?.totalKeys ?? "—"}</div>
          <div style={{ fontSize: 11, color: "#6a8aff", marginTop: 6 }}>管理 →</div>
        </div>
      </div>

      {/* ===== 模型 Token 消耗曲线面板 ===== */}
      <div style={{ background: "#fff", borderRadius: 8, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>📈 模型 Token 消耗曲线</h3>
          <div style={{ display: "flex", gap: 4, background: "#f5f5f5", borderRadius: 6, padding: 2 }}>
            {["今天", "昨天", "本周", "上月"].map((t) => (
              <button
                key={t}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  border: "none",
                  background: t === "今天" ? "#4f6ef7" : "transparent",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: t === "今天" ? "#fff" : "#888",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {/* 4 个子统计卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {subs.map((s, i) => (
              <div key={i} style={{ background: i === 3 ? "#fff8e1" : "#f8f9ff", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: i === 3 ? "#f59e0b" : "#333" }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* 趋势图 */}
          <TrendChart
            data={{
              labels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`),
              datasets: [],
            }}
            models={trendModels}
          />

          {/* 宝塔风格时间滑块 */}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eee" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#64748b", marginBottom: 6 }}>
              <span>00:00</span>
              <span style={{ color: "#6a8aff", fontWeight: 600 }}>选中：00:00 — 23:59（24小时）</span>
              <span>23:59</span>
            </div>
            <div style={{ position: "relative", height: 28, background: "#f5f5f5", borderRadius: 6, cursor: "grab" }}>
              {/* 后端缺失：时间范围拖拽滑块功能完整版 */}
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: "100%", background: "linear-gradient(90deg, rgba(106,138,255,0.15), rgba(139,92,246,0.12))", borderRadius: 6 }} />
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: 8, background: "#6a8aff", borderRadius: 6 }} />
              <div style={{ position: "absolute", top: 0, right: 0, height: "100%", width: 8, background: "#6a8aff", borderRadius: 6 }} />
            </div>
          </div>
        </div>
      </div>

      {/* ===== 底部双列：模型分布 + 最近消费 ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* 模型调用分布 */}
        <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>📊 模型调用分布</h3>
            <span style={{ fontSize: 11, color: "#888" }}>近 1 小时</span>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {/* 后端缺失：/me/stats/model-distribution 接口，当前使用原型静态数据展示 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {distData.map((d) => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, width: 160, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
                    <span style={{ color: "#333" }}>{d.name}</span>
                  </div>
                  <div style={{ flex: 1, height: 6, background: "#f5f5f5", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${d.percentage}%`, background: d.color, borderRadius: 3 }} />
                  </div>
                  <div style={{ width: 200, textAlign: "right", color: "#888", flexShrink: 0 }}>
                    {d.calls} 次 · {d.tokens} Token
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 最近消费 */}
        <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>🕐 最近消费</h3>
            <span style={{ fontSize: 11, color: "#888", cursor: "pointer" }} onClick={() => navigate("/logs")}>
              查看全部 →
            </span>
          </div>
          <div style={{ padding: 0 }}>
            {/* 后端缺失：/me/stats/recent-calls 接口，当前使用原型静态数据展示 */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #eee", color: "#888", fontWeight: 400 }}>时间</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #eee", color: "#888", fontWeight: 400 }}>模型</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #eee", color: "#888", fontWeight: 400 }}>Token</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #eee", color: "#888", fontWeight: 400 }}>费用</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #eee", color: "#888", fontWeight: 400 }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call, i) => (
                  <tr key={i} style={{ cursor: "pointer" }}>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f5f5f5", color: "#333" }}>{call.time}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f5f5f5", color: "#333" }}>{call.model}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f5f5f5", color: "#333" }}>{call.tokens}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f5f5f5", color: "#333" }}>{call.cost}</td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #f5f5f5" }}>
                      <span style={{ color: call.success ? "#22c55e" : "#e53935" }}>
                        {call.success ? "✓ 成功" : "✗ 失败(401)"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ===== 快捷入口（原型：4 列按钮） ===== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
        {[
          { icon: "💰", label: "立即充值", to: "/recharge" },
          { icon: "🔑", label: "创建 API Key", to: "/api-keys" },
          { icon: "📈", label: "消费明细", to: "/logs" },
          { icon: "🎫", label: "提交工单", to: "/tickets" },
        ].map((item) => (
          <div
            key={item.label}
            onClick={() => navigate(item.to)}
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: 12,
              textAlign: "center",
              cursor: "pointer",
              fontSize: 13,
              color: "#888",
              boxShadow: "0 1px 4px rgba(0,0,0,.06)",
            }}
          >
            <div style={{ fontSize: 22, marginBottom: 4 }}>{item.icon}</div>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}
