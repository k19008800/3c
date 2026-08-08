import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  SkeletonGroup,
  EmptyState,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/**
 * 销售 — 业绩看板
 * 对齐原型: agent-ranking.html
 * - 业绩统计卡片（4列）
 * - 排行榜表格（排名/代理商/等级/客户数/月消费/佣金/趋势）
 * - 周期/等级筛选
 * - 奖励预览
 */

export default function SalesPerformancePage() {
  const [periodType, setPeriodType] = useState("monthly");
  const [periodMonth, setPeriodMonth] = useState(new Date().toISOString().slice(0, 7));
  const [levelFilter, setLevelFilter] = useState("");

  const q = useQuery({
    queryKey: ["me-sales-performance", periodType, periodMonth],
    queryFn: async () => {
      const params = new URLSearchParams({ period_type: periodType, period: periodMonth });
      return (await api.get(`/me/sales-performance?${params}`)).data.data;
    },
  });

  const rankingQ = useQuery({
    queryKey: ["agent-ranking", periodType, periodMonth, levelFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ period_type: periodType, period: periodMonth, level: levelFilter });
      return (await api.get(`/agent/ranking?${params}`)).data.data;
    },
  });

  const stats = q.data?.stats;
  const perf = q.data?.performance;
  const ranking = rankingQ.data?.list ?? [];
  const rewards = rankingQ.data?.rewards ?? [];

  /* ===== 统计卡片 ===== */
  const cards = [
    { label: "总客户数", value: stats?.customer_count ?? perf?.customer_count ?? 0, color: "var(--color-primary)" },
    { label: "活跃客户", value: stats?.active_count ?? perf?.active_count ?? 0, color: "var(--color-success-text)" },
    { label: "本月新增", value: perf?.new_customers ?? 0, color: "var(--color-warning-text)" },
    {
      label: "活跃率",
      value: stats?.customer_count ? ((stats.active_count / stats.customer_count) * 100).toFixed(1) + "%" : (stats?.active_rate ? stats.active_rate + "%" : "0%"),
      color: "#8b5cf6",
    },
  ];

  /* ===== 排行榜表格列 — 对齐 agent-ranking.html ===== */
  const rankingColumns: ColumnDef<any>[] = [
    {
      key: "rank", title: "排名",
      render: (_, record, index) => {
        const rank = record.rank ?? index + 1;
        if (rank === 1) return <span style={{ fontSize: 20 }}>🥇</span>;
        if (rank === 2) return <span style={{ fontSize: 20 }}>🥈</span>;
        if (rank === 3) return <span style={{ fontSize: 20 }}>🥉</span>;
        return (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: "50%", background: "#f5f5f5",
            fontSize: 12, fontWeight: 700, color: "#999",
          }}>
            {rank}
          </span>
        );
      },
    },
    {
      key: "name", title: "代理商",
      render: (_, record) => (
        <strong style={{ fontSize: 13 }}>
          {record.agent_name || record.name || record.email || `代理${record.agent_id}`}
        </strong>
      ),
    },
    {
      key: "level", title: "等级",
      render: (_, record) => {
        const level = record.level || record.tier || "";
        const tierClass = level === "gold" || level === "金牌" ? "gold"
          : level === "silver" || level === "银牌" ? "silver"
          : level === "bronze" || level === "铜牌" ? "bronze"
          : "normal";
        const tierLabel = level === "gold" ? "金牌" : level === "silver" ? "银牌" : level === "bronze" ? "铜牌" : level || "普通";
        const tierStyles: Record<string, React.CSSProperties> = {
          gold: { background: "linear-gradient(135deg,#fff8e1,#ffecb3)", color: "#bf8a08", border: "1px solid #ffd54f" },
          silver: { background: "linear-gradient(135deg,#f5f5f5,#e0e0e0)", color: "#757575", border: "1px solid #bdbdbd" },
          bronze: { background: "linear-gradient(135deg,#ffe0b2,#ffcc80)", color: "#b06a1a", border: "1px solid #ffb74d" },
          normal: { background: "#f5f5f5", color: "#888", border: "1px solid #d9d9d9" },
        };
        return (
          <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 500, ...tierStyles[tierClass] }}>
            {tierLabel}
          </span>
        );
      },
    },
    {
      key: "customer_count", title: "客户数",
      render: (_, record) => <span style={{ fontSize: 13 }}>{record.customer_count ?? record.clients ?? 0}</span>,
    },
    {
      key: "new_customers", title: "新增客户",
      render: (_, record) => <span style={{ fontSize: 13 }}>{record.new_customers ?? record.new_clients ?? 0}</span>,
    },
    {
      key: "month_consumption", title: "月消费总额",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontWeight: 500 }}>
          ¥{Number(record.month_consumption ?? record.revenue ?? 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "commission", title: "佣金收入",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--color-success-text)" }}>
          ¥{Number(record.commission ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "last_rank", title: "上月排名",
      render: (_, record) => {
        const lastRank = record.last_rank ?? record.previous_rank;
        if (!lastRank) return <span style={{ color: "var(--color-text-secondary)" }}>—</span>;
        return <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>#{lastRank}</span>;
      },
    },
    {
      key: "trend", title: "趋势",
      render: (_, record) => {
        const trend = record.trend ?? record.rank_change ?? 0;
        if (trend === 0) return <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>— 持平</span>;
        if (trend > 0) return <span style={{ color: "#22c55e", fontWeight: 600, fontSize: 12 }}>↑ {trend}</span>;
        return <span style={{ color: "var(--color-danger-text)", fontWeight: 600, fontSize: 12 }}>↓ {Math.abs(trend)}</span>;
      },
    },
  ];

  /* ===== 奖励预览列 ===== */
  const rewardColumns: ColumnDef<any>[] = [
    {
      key: "rank", title: "排名",
      render: (_, record, index) => {
        const r = record.rank ?? index + 1;
        if (r === 1) return <span style={{ fontSize: 18 }}>🥇</span>;
        if (r === 2) return <span style={{ fontSize: 18 }}>🥈</span>;
        if (r === 3) return <span style={{ fontSize: 18 }}>🥉</span>;
        return <span style={{ fontSize: 13, fontWeight: 600 }}>{r}</span>;
      },
    },
    {
      key: "name", title: "代理商",
      render: (_, record) => <strong style={{ fontSize: 13 }}>{record.agent_name || record.name || "-"}</strong>,
    },
    {
      key: "revenue", title: "月消费总额",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace" }}>
          ¥{Number(record.month_consumption ?? record.revenue ?? 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "base_commission", title: "基础佣金",
      render: (_, record) => (
        <span style={{ fontFamily: "monospace" }}>
          ¥{Number(record.base_commission ?? record.commission ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "reward_type", title: "奖励类型",
      render: (_, record) => {
        const rt = record.reward_type;
        const isBonus = rt === "bonus" || rt === "一次性奖金";
        return (
          <span style={{
            display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 12,
            background: isBonus ? "#f0fdf4" : "#eef2ff",
            color: isBonus ? "var(--color-success-text)" : "var(--color-primary)",
          }}>
            {record.reward_type || record.reward_label || "-"}
          </span>
        );
      },
    },
    {
      key: "extra_reward", title: "额外奖励",
      render: (_, record) => (
        <span style={{ color: "var(--color-success-text)", fontWeight: 600 }}>
          +¥{Number(record.extra_reward ?? record.bonus ?? 0).toFixed(2)}
        </span>
      ),
    },
    {
      key: "expect_income", title: "预计总收入",
      render: (_, record) => (
        <span style={{ fontWeight: 700, color: "var(--color-primary)", fontFamily: "monospace" }}>
          ¥{Number(record.expect_income ?? record.total_income ?? 0).toFixed(2)}
        </span>
      ),
    },
  ];

  if (q.isLoading) return <SkeletonGroup lines={5} />;

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        业绩看板
        <HelpIcon text="业绩看板 — 销售业务人员核心指标概览与代理排行榜。支持按周期查看排名、奖励预览。" level="page" />
      </h2>

      {/* 统计卡片 — 对齐 agent-ranking.html */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16, marginTop: 8 }}>
        {cards.map(c => (
          <div key={c.label} style={{
            background: "var(--color-panel)", borderRadius: "var(--radius-lg)",
            padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)",
            border: "1px solid var(--color-border)",
          }}>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* 本月业绩详情 */}
      {perf && (
        <div style={{
          background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
          padding: 16, border: "1px solid var(--color-border)", marginBottom: 16,
        }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 600, color: "var(--color-text)" }}>
            本月业绩详情
          </h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
            <InfoRow label="统计周期" value={`${perf.period_start?.slice(0, 10)} ~ ${perf.period_end?.slice(0, 10)}`} />
            <InfoRow label="总消费" value={`¥${Number(perf.total_revenue || 0).toFixed(2)}`} />
            <InfoRow label="佣金" value={`¥${Number(perf.commission || 0).toFixed(2)}`} />
            <InfoRow label="转化率" value={perf.conversion_rate ? `${perf.conversion_rate}%` : "-"} />
          </div>
        </div>
      )}

      {/* 排行榜筛选 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>周期：</span>
        <select value={periodType} onChange={e => setPeriodType(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, background: "#fff" }}>
          <option value="monthly">月度</option>
          <option value="quarterly">季度</option>
          <option value="yearly">年度</option>
        </select>
        {periodType === "monthly" && (
          <input type="month" value={periodMonth} onChange={e => setPeriodMonth(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, width: 150 }} />
        )}
        <span style={{ fontSize: 13, color: "var(--color-text-secondary)", marginLeft: 8 }}>等级：</span>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, background: "#fff" }}>
          <option value="">全部</option>
          <option value="gold">金牌</option>
          <option value="silver">银牌</option>
          <option value="bronze">铜牌</option>
          <option value="normal">普通</option>
        </select>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => {
            const header = "\uFEFF排名,代理商,等级,客户数,新增客户,月消费,佣金,趋势\n";
            const rows = ranking.map((r: any, i: number) =>
              [r.rank ?? i + 1, r.agent_name || r.name || r.email, r.level || "-", r.customer_count ?? 0, r.new_customers ?? 0, `¥${Number(r.month_consumption ?? 0).toFixed(2)}`, `¥${Number(r.commission ?? 0).toFixed(2)}`, (r.trend ?? 0) > 0 ? `↑${r.trend}` : (r.trend ?? 0) < 0 ? `↓${Math.abs(r.trend ?? 0)}` : "持平"].join(",")
            ).join("\n");
            const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `排行榜_${periodMonth}.csv`;
            a.click();
          }}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            📥 导出 CSV
          </button>
        </div>
      </div>

      {/* 当前周期标识 */}
      <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{
          display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 500,
          background: "var(--color-primary-light)", color: "var(--color-primary)",
        }}>
          📅 {periodMonth} · {periodType === "monthly" ? "月度" : periodType === "quarterly" ? "季度" : "年度"}排行
        </span>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          数据快照时间: {new Date().toISOString().slice(0, 10)}
        </span>
      </div>

      {/* 排行榜表格 */}
      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden", marginBottom: 16,
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6 }}>
            🏆 排行榜 — TOP 20
            <HelpIcon text="按月消费总额降序排列，显示排名变化趋势" level="button" />
          </h3>
        </div>

        {rankingQ.isLoading ? <div style={{ padding: 20 }}><SkeletonGroup lines={4} /></div>
          : ranking.length === 0 ? <EmptyState icon="🏆" title="暂无排行数据" description="当前周期暂无排名数据" />
          : <Table columns={rankingColumns} dataSource={ranking} loading={rankingQ.isLoading} emptyText="暂无排名数据" />
        }
      </div>

      {/* 奖励预览 — 对齐 agent-ranking.html 奖励预览 */}
      {rewards.length > 0 && (
        <div style={{
          background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
          boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden",
        }}>
          <div style={{
            padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 6 }}>
              🎁 本期奖励预览
              <HelpIcon text="排行榜奖励：前3名获得额外佣金加成，4-5名获得一次性奖金" level="button" />
            </h3>
          </div>
          <Table columns={rewardColumns as any} dataSource={rewards} loading={false} emptyText="暂无奖励数据" />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--color-text)" }}>{value}</span>
    </>
  );
}
