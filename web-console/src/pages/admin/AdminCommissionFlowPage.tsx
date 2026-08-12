import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup, StatusBadge } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface FlowData {
  summary: {
    total: number; agent_count: number; avg_rate: number; max_commission: number;
    month_settled: number; total_withdrawable: number; total_in_review: number;
    total_future: number; pending_withdraw_count: number;
  };
  agents: AgentLedger[];
  list: FlowItem[];
  pagination: { page: number; pageSize: number; total: number };
}
interface AgentLedger {
  id: number; user_id: number; agent_name: string; email: string;
  level: string; level_label: string; rate: number; customer_count: number;
  settled: number; month_settled: number; pending: number;
  withdrawable: number; in_review: number; withdrawn: number; future: number;
  total_earnings: number; available_balance: number; balance_matched: boolean;
}
interface FlowItem {
  id: number; agent_id: number; agent_name: string; customer_name: string;
  consume_amount: number | null; commission_rate: number; commission: number;
  status: string; created_at: string;
}

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border)", cursor: "pointer", fontWeight: 600, fontSize: 13, background: "#fff" };

const fmt = (n: number | null | undefined) => (n == null ? "—" : `¥${Number(n).toFixed(2)}`);
const COMM_STATUS_LABEL: Record<string, { text: string; badge: "success" | "warning" | "danger" }> = {
  settled: { text: "已结算", badge: "success" },
  pending: { text: "待结算", badge: "warning" },
  cancelled: { text: "已冲销", badge: "danger" },
};
const PERIODS = [
  { value: "today", label: "今日" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "all", label: "全部" },
];
const STATUS_FILTERS = [
  { value: "", label: "全部状态" },
  { value: "settled", label: "已结算" },
  { value: "pending", label: "待结算" },
  { value: "cancelled", label: "已冲销" },
];

export default function AdminCommissionFlowPage() {
  const [keyword, setKeyword] = useState("");
  const [period, setPeriod] = useState("month");
  const [status, setStatus] = useState("");
  const [agentId, setAgentId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["admin-commission-flow", keyword, period, status, agentId],
    queryFn: async () => {
      const params = new URLSearchParams({ keyword, period, status });
      params.set("page_size", "50");
      if (agentId) params.set("agent_id", String(agentId));
      return (await api.get<{ data: FlowData }>(`/admin/commission/flow?${params.toString()}`)).data.data;
    },
  });

  const d = q.data;
  const summary = d?.summary;
  const focused = agentId != null;
  const focusedAgent = d?.agents?.find((a) => a.id === agentId);

  /* A 全局概览（聚焦某代理时即该代理口径） */
  const cards = [
    { icon: "💸", label: focused ? "累计佣金支出" : "累计佣金支出", value: fmt(summary?.total), hint: "已结算佣金合计" },
    { icon: "📅", label: "本月佣金", value: fmt(summary?.month_settled), hint: "本月已结算佣金" },
    { icon: "🏦", label: focused ? "可提现合计" : "全部可提现合计", value: fmt(summary?.total_withdrawable), hint: "已结算 − 已提现 − 审核中" },
    { icon: "⏳", label: focused ? "审核中" : "审核中合计", value: fmt(summary?.total_in_review), hint: "提现 待审核 + 打款中" },
    { icon: "🔮", label: focused ? "预计未来佣金" : "预计未来佣金", value: fmt(summary?.total_future), hint: "客户可用余额 × 佣金率（估算）" },
    { icon: "📄", label: focused ? "提现待审核" : "提现待审核笔数", value: summary?.pending_withdraw_count ?? "—", hint: "待审核提现申请数量" },
  ];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>佣金流水</h2>
        <HelpIcon text="佣金工作台：查看所有代理商的佣金账本、可提现/待提现与未来可收佣。点击账本行可聚焦单个代理商。" level="page" />
        {focused && (
          <button onClick={() => setAgentId(null)} style={{ ...btnBase, marginLeft: "auto", color: "var(--color-primary)", borderColor: "var(--color-primary)" }}>
            清除聚焦：{focusedAgent?.agent_name ?? `#${agentId}`} ×
          </button>
        )}
      </div>

      {/* 筛选条 */}
      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {PERIODS.map((p) => (
          <button key={p.value} style={{ ...btnBase, background: period === p.value ? "#4f6ef7" : "#fff", color: period === p.value ? "#fff" : "#333" }}
            onClick={() => setPeriod(p.value)}>{p.label}</button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}>
          {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1, minWidth: 200 }}
          placeholder="搜索代理商..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
        {summary && (
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            有佣代理商 <strong>{summary.agent_count}</strong> · 平均比例 <strong>{summary.avg_rate}%</strong> · 最高单笔 <strong>{fmt(summary.max_commission)}</strong>
          </span>
        )}
      </div>

      {/* A 全局概览 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 16, marginBottom: 20 }}>
        {cards.map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 22 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: i === 4 ? "var(--color-primary)" : undefined }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>{s.hint}</div>
          </div>
        ))}
      </div>

      {/* B 代理商账本 */}
      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📒 代理商佣金账本 <HelpIcon text="勾稽：可提现（按流水实时算）与代理商账户余额差异 &lt; ¥0.01 视为一致。" /></div>
        {q.isLoading ? <SkeletonGroup lines={4} /> : (d?.agents?.length ?? 0) === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无代理商数据</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa", color: "#555" }}>
              <th style={{ padding: "10px 10px", textAlign: "left" }}>代理商</th>
              <th style={{ padding: "10px 10px", textAlign: "left" }}>等级 · 比例</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>客户数</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>累计已结算</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>本月</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>待结算</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>可提现</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>审核中</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>已提现</th>
              <th style={{ padding: "10px 10px", textAlign: "right" }}>未来可收佣</th>
              <th style={{ padding: "10px 10px", textAlign: "center" }}>勾稽</th>
            </tr></thead>
            <tbody>
              {(d?.agents ?? []).map((a) => (
                <tr key={a.id} onClick={() => setAgentId(agentId === a.id ? null : a.id)}
                  style={{ borderTop: "1px solid #f0f0f0", cursor: "pointer", background: agentId === a.id ? "#eef3ff" : "transparent" }}>
                  <td style={{ padding: "10px" }}>
                    <div style={{ fontWeight: 600 }}>{a.agent_name}</div>
                    <div style={{ fontSize: 11, color: "#aaa" }}>{a.email}</div>
                  </td>
                  <td style={{ padding: "10px" }}>{a.level_label} · {a.rate}%</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{a.customer_count}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{fmt(a.settled)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{fmt(a.month_settled)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{fmt(a.pending)}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{fmt(a.withdrawable)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "#e65100" }}>{fmt(a.in_review)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>{fmt(a.withdrawn)}</td>
                  <td style={{ padding: "10px", textAlign: "right", color: "var(--color-primary)" }}>{fmt(a.future)}</td>
                  <td style={{ padding: "10px", textAlign: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: a.balance_matched ? "#2e7d32" : "#e53935" }}>
                      {a.balance_matched ? "一致" : "不一致"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* C 明细流水 */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>
          💸 佣金流水明细 {focused ? <span style={{ color: "var(--color-primary)", fontSize: 13 }}>（已聚焦：{focusedAgent?.agent_name}）</span> : null}
          <span style={{ float: "right", fontWeight: 400, fontSize: 13, color: "var(--color-text-secondary)" }}>
            共 {d?.pagination?.total ?? 0} 条
          </span>
        </div>
        {q.isLoading ? <SkeletonGroup lines={5} /> : (d?.list?.length ?? 0) === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无流水</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>客户</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>消费金额</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>佣金率</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>佣金</th>
              <th style={{ padding: "10px 12px", textAlign: "center" }}>状态</th>
            </tr></thead>
            <tbody>
              {(d?.list ?? []).map((c) => {
                const st = COMM_STATUS_LABEL[c.status] ?? { text: c.status, badge: "info" as const };
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{new Date(c.created_at).toLocaleString()}</td>
                    <td style={{ padding: "10px 12px" }}>{c.agent_name}</td>
                    <td style={{ padding: "10px 12px" }}>{c.customer_name}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{fmt(c.consume_amount)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>{c.commission_rate}%</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#4f6ef7" }}>{fmt(c.commission)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <StatusBadge status={st.badge}>{st.text}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
