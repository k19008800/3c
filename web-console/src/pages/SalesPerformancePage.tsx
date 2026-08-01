import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * §11.5 业绩看板
 * [?] 查看个人业绩概览：新增客户数、活跃客户数、总客户数、活跃率等关键指标。
 */
export default function SalesPerformancePage() {
  const q = useQuery({
    queryKey: ["me-sales-performance"],
    queryFn: async () => (await api.get("/me/sales-performance")).data.data,
  });

  const stats = q.data?.stats;
  const perf = q.data?.performance;

  const cards = [
    { label: "总客户数", value: stats?.customer_count || 0, color: "#3b82f6" },
    { label: "活跃客户", value: stats?.active_count || 0, color: "#22c55e" },
    { label: "新增客户（本月）", value: perf?.new_customers || 0, color: "#f59e0b" },
    { label: "活跃率", value: stats?.customer_count ? ((stats.active_count / stats.customer_count) * 100).toFixed(1) + "%" : "0%", color: "#8b5cf6" },
  ];

  return (
    <div>
      <h2>
        业绩看板
        <span
          title="业绩看板 — 展示销售业务人员的核心指标概览：客户总数、活跃客户数、本月新增客户数和活跃率。实时数据。"
          style={{ cursor: "help", fontSize: 14, color: "#94a3b8", marginLeft: 6 }}
        >
          [?]
        </span>
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 20 }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {perf && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, color: "#334155" }}>本月业绩详情</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>统计周期</div><div style={{ fontSize: 13 }}>{perf.period_start?.slice(0, 10)} ~ {perf.period_end?.slice(0, 10)}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>总消费</div><div style={{ fontSize: 13 }}>¥{Number(perf.total_revenue || 0).toFixed(2)}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>佣金</div><div style={{ fontSize: 13 }}>¥{Number(perf.commission || 0).toFixed(2)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
