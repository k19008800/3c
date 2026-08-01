import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { downloadBlob } from "../lib/download";

/* ============ 类型 ============ */
interface CurrentBilling {
  period: string;
  total_cost: number;
  bill_count: number;
  days_left: number;
  next_billing_date: string;
}
interface BillingMonth {
  month: string;
  total_cost: number;
  bill_count: number;
}
interface MonthDetail {
  month: string;
  summary: { total_cost: number; total_refund: number; total_calls: number };
  items: { price_source: string; cost: number; calls: number; refund: number }[];
}
interface DailyCost {
  day: string;
  cost: number;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function BillingPage() {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentQ = useQuery({
    queryKey: ["me-billing-current"],
    queryFn: async () => (await api.get<{ data: CurrentBilling }>("/me/billing/current")).data.data,
  });
  const historyQ = useQuery({
    queryKey: ["me-billing-history"],
    queryFn: async () => (await api.get<{ data: { list: BillingMonth[] } }>("/me/billing/history")).data.data.list,
  });
  const dailyQ = useQuery({
    queryKey: ["me-billing-daily"],
    queryFn: async () => (await api.get<{ data: { list: DailyCost[] } }>("/me/billing/current/daily")).data.data.list,
  });
  const detailQ = useQuery({
    queryKey: ["me-billing-detail", expandedMonth],
    queryFn: async () => (await api.get<{ data: MonthDetail }>(`/me/billing/history/${expandedMonth}`)).data.data,
    enabled: !!expandedMonth,
  });

  const cur = currentQ.data;

  const handleDownload = async () => {
    try {
      const res = await api.get(`/me/billing/history/${cur?.period}/download`, { responseType: "blob" });
      downloadBlob(res.data, `billing-${cur?.period}.csv`);
      setNotice("账单 CSV 已下载");
    } catch (e) {
      setNotice(extractError(e));
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>账单中心</h2>

      {/* 当前周期摘要 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label={`本周期 (${cur?.period ?? "-"}) 消费`} value={`¥${(cur?.total_cost ?? 0).toFixed(4)}`} hint="已出账金额" />
        <StatCard label="计费记录" value={String(cur?.bill_count ?? "-")} hint="本周期订单数" />
        <StatCard label="距离下期结算" value={`${cur?.days_left ?? "-"} 天`} hint="月度账单周期" />
        <button
          onClick={handleDownload}
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            background: "#2563eb",
            color: "#fff",
            alignSelf: "center",
          }}
        >
          下载本月账单 CSV
        </button>
      </div>

      {/* 每日消费趋势 */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>本月每日消费趋势</h3>
        <DailyBarChart data={dailyQ.data ?? []} />
      </div>

      {/* 历史账单列表 + 明细 */}
      <div style={card}>
        <h3 style={{ marginBottom: 16 }}>历史账单</h3>
        {historyQ.isLoading ? (
          <div style={{ color: "#94a3b8" }}>加载中...</div>
        ) : historyQ.data?.length === 0 ? (
          <div style={{ color: "#94a3b8", padding: 20, textAlign: "center" }}>暂无账单记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>周期</th>
                <th style={{ padding: "8px" }}>消费金额</th>
                <th style={{ padding: "8px" }}>计费记录</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {historyQ.data?.map((m) => (
                <MonthRow
                  key={m.month}
                  m={m}
                  expanded={expandedMonth === m.month}
                  detail={expandedMonth === m.month && !detailQ.isLoading ? detailQ.data : undefined}
                  onToggle={() => setExpandedMonth(expandedMonth === m.month ? null : m.month)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: "#2563eb", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/* ============ 统计卡 ============ */
function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{hint}</div>
    </div>
  );
}

/* ============ 历史账单行（可展开明细）============ */
function MonthRow({
  m,
  expanded,
  detail,
  onToggle,
}: {
  m: BillingMonth;
  expanded: boolean;
  detail?: MonthDetail;
  onToggle: () => void;
}) {
  return (
    <>
      <tr style={{ borderTop: "1px solid #f1f5f9" }}>
        <td style={{ padding: "8px", fontWeight: 600 }}>{m.month}</td>
        <td style={{ padding: "8px" }}>¥{m.total_cost.toFixed(4)}</td>
        <td style={{ padding: "8px", color: "#64748b" }}>{m.bill_count} 条</td>
        <td style={{ padding: "8px" }}>
          <button onClick={onToggle} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600 }}>
            {expanded ? "收起" : "查看明细"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} style={{ padding: "16px", background: "#f8fafc" }}>
            {!detail ? (
              <div style={{ color: "#94a3b8" }}>加载中...</div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 24, marginBottom: 12, fontSize: 13, color: "#475569" }}>
                  <span>总消费: <strong>¥{detail.summary.total_cost.toFixed(4)}</strong></span>
                  <span>总退款: <strong>¥{detail.summary.total_refund.toFixed(4)}</strong></span>
                  <span>调用次数: <strong>{detail.summary.total_calls}</strong></span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#64748b", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>定价来源</th>
                      <th style={{ padding: "6px" }}>消费金额</th>
                      <th style={{ padding: "6px" }}>调用次数</th>
                      <th style={{ padding: "6px" }}>退款</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.length === 0 ? (
                      <tr><td colSpan={4} style={{ color: "#94a3b8", padding: "8px" }}>该周期暂无详细记录</td></tr>
                    ) : (
                      detail.items.map((it) => (
                        <tr key={it.price_source} style={{ borderTop: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "6px", fontFamily: "monospace", fontSize: 12 }}>{it.price_source}</td>
                          <td style={{ padding: "6px" }}>¥{it.cost.toFixed(4)}</td>
                          <td style={{ padding: "6px" }}>{it.calls}</td>
                          <td style={{ padding: "6px" }}>¥{it.refund.toFixed(4)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ============ 每日消费柱状图（纯 CSS）============ */
function DailyBarChart({ data }: { data: DailyCost[] }) {
  const max = Math.max(...data.map((d) => d.cost), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, padding: "8px 4px" }}>
      {data.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 13, alignSelf: "center", display: "flex", alignItems: "center", height: 120 }}>
          本月暂无消费数据
        </div>
      ) : (
        data.map((d) => {
          const h = Math.max(2, (d.cost / max) * 100);
          return (
            <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div
                title={`${d.day}: ¥${d.cost.toFixed(4)}`}
                style={{
                  width: "100%",
                  maxWidth: 24,
                  height: h,
                  background: d.cost > 0 ? "#3b82f6" : "#e2e8f0",
                  borderRadius: "3px 3px 0 0",
                }}
              />
              <div style={{ fontSize: 9, color: "#94a3b8", transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>
                {d.day.slice(8)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
