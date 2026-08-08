import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { downloadBlob } from "../lib/download";
import {
  HelpIcon,
  Table,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

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
  model_items: { model: string; calls: number; cost: number }[];
}
interface DailyCost {
  day: string;
  cost: number;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function BillingPage() {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const { toast } = useToast();

  const currentQ = useQuery({
    queryKey: ["me-billing-current"],
    queryFn: async () =>
      (await api.get<{ data: CurrentBilling }>("/me/billing/current")).data.data,
  });
  const historyQ = useQuery({
    queryKey: ["me-billing-history"],
    queryFn: async () =>
      (await api.get<{ data: { list: BillingMonth[] } }>("/me/billing/history")).data.data.list,
  });
  const dailyQ = useQuery({
    queryKey: ["me-billing-daily"],
    queryFn: async () =>
      (await api.get<{ data: { list: DailyCost[] } }>("/me/billing/current/daily")).data.data.list,
  });
  const detailQ = useQuery({
    queryKey: ["me-billing-detail", expandedMonth],
    queryFn: async () =>
      (await api.get<{ data: MonthDetail }>(`/me/billing/history/${expandedMonth}`)).data.data,
    enabled: !!expandedMonth,
  });

  const cur = currentQ.data;

  const handleDownload = async () => {
    try {
      const res = await api.get(`/me/billing/history/${cur?.period}/download`, {
        responseType: "blob",
      });
      downloadBlob(res.data, `billing-${cur?.period}.csv`);
      toast.success("账单 CSV 已下载");
    } catch (e) {
      toast.error(extractError(e));
    }
  };

  const historyColumns: ColumnDef<BillingMonth>[] = [
    { key: "month", title: "周期", dataIndex: "month" },
    {
      key: "total_cost",
      title: "消费金额",
      dataIndex: "total_cost",
      render: (v) => `¥${(v as number).toFixed(4)}`,
    },
    { key: "bill_count", title: "计费记录", dataIndex: "bill_count", render: (v) => `${v} 条` },
    {
      key: "action",
      title: "操作",
      render: (_, record) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpandedMonth(expandedMonth === (record as BillingMonth).month ? null : (record as BillingMonth).month);
          }}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-primary)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {expandedMonth === (record as BillingMonth).month ? "收起" : "查看明细"}
        </button>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>
        账单中心
        <HelpIcon text="查看您的消费账单和每日消费趋势。支持按月查看详细计费记录和按模型汇总，可下载本月账单 CSV。" level="page" />
      </h2>

      {/* 当前周期摘要 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard
          label={`本周期 (${cur?.period ?? "-"}) 消费`}
          value={`¥${(cur?.total_cost ?? 0).toFixed(4)}`}
          hint="已出账金额"
        />
        <StatCard label="计费记录" value={String(cur?.bill_count ?? "-")} hint="本周期订单数" />
        <StatCard
          label="距离下期结算"
          value={`${cur?.days_left ?? "-"} 天`}
          hint="月度账单周期"
        />
        <button
          onClick={handleDownload}
          style={{
            padding: "12px 18px",
            borderRadius: 8,
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
            background: "var(--color-primary)",
            color: "#fff",
            alignSelf: "center",
          }}
        >
          下载本月账单 CSV
        </button>
      </div>

      {/* 每日消费趋势 */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>
          本月每日消费趋势
          <HelpIcon text="以柱状图展示本月的每日消费金额变化趋势。" level="button" />
        </h3>
        <DailyBarChart data={dailyQ.data ?? []} />
      </div>

      {/* 历史账单列表 + 明细 */}
      <div style={card}>
        <h3 style={{ marginBottom: 16 }}>历史账单</h3>
        {historyQ.isLoading ? (
          <SkeletonGroup lines={5} />
        ) : historyQ.data?.length === 0 ? (
          <EmptyState icon="📋" title="暂无账单记录" description="当前没有账单数据" />
        ) : (
          <>
            <Table
              columns={historyColumns}
              dataSource={historyQ.data ?? []}
              loading={historyQ.isLoading}
              emptyText="暂无账单记录"
            />
            {expandedMonth && detailQ.data && (
              <div style={{ padding: "16px", background: "var(--color-bg)", marginTop: 8, borderRadius: 8 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 24,
                    marginBottom: 12,
                    fontSize: 13,
                    color: "var(--color-text)",
                  }}
                >
                  <span>
                    总消费: <strong>¥{detailQ.data.summary.total_cost.toFixed(4)}</strong>
                  </span>
                  <span>
                    总退款: <strong>¥{detailQ.data.summary.total_refund.toFixed(4)}</strong>
                  </span>
                  <span>
                    调用次数: <strong>{detailQ.data.summary.total_calls}</strong>
                  </span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                      <th style={{ padding: "6px" }}>定价来源</th>
                      <th style={{ padding: "6px" }}>消费金额</th>
                      <th style={{ padding: "6px" }}>调用次数</th>
                      <th style={{ padding: "6px" }}>退款</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailQ.data.items.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ color: "var(--color-text-secondary)", padding: "8px" }}>
                          该周期暂无详细记录
                        </td>
                      </tr>
                    ) : (
                      detailQ.data.items.map((it) => (
                        <tr key={it.price_source} style={{ borderTop: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "6px", fontFamily: "monospace", fontSize: 12 }}>
                            {it.price_source}
                          </td>
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
            {expandedMonth && detailQ.isLoading && <SkeletonGroup lines={4} style={{ marginTop: 8 }} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ============ 统计卡 ============ */
function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{hint}</div>
    </div>
  );
}

/* ============ 每日消费柱状图（纯 CSS）============ */
function DailyBarChart({ data }: { data: DailyCost[] }) {
  const max = Math.max(...data.map((d) => d.cost), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, padding: "8px 4px" }}>
      {data.length === 0 ? (
        <div
          style={{
            color: "var(--color-text-secondary)",
            fontSize: 13,
            alignSelf: "center",
            display: "flex",
            alignItems: "center",
            height: 120,
          }}
        >
          本月暂无消费数据
        </div>
      ) : (
        data.map((d) => {
          const h = Math.max(2, (d.cost / max) * 100);
          return (
            <div
              key={d.day}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
            >
              <div
                title={`${d.day}: ¥${d.cost.toFixed(4)}`}
                style={{
                  width: "100%",
                  maxWidth: 24,
                  height: h,
                  background: d.cost > 0 ? "var(--color-primary)" : "var(--color-border)",
                  borderRadius: "3px 3px 0 0",
                }}
              />
              <div
                style={{
                  fontSize: 9,
                  color: "var(--color-text-secondary)",
                  transform: "rotate(-45deg)",
                  whiteSpace: "nowrap",
                }}
              >
                {d.day.slice(8)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
