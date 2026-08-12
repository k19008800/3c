import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader, Panel, SkeletonGroup, EmptyState } from "@3cloud/shared-ui";

/** 资金账户 · 平台资金总览（原型 Tab2 重建） */

interface AccountOverview {
  total_balance: number;
  available_balance: number;
  frozen_balance: number;
  frozen_detail: { label: string; amount: number }[];
  user_recharge_total: number;
  user_consumption_total: number;
  refund_total: number;
  agent_commission_paid: number;
  agent_commission_pending: number;
  withdrawal_pending: number;
  withdrawal_completed: number;
  platform_gross_profit: number;
  platform_gross_margin: number;
}

interface TrendPoint {
  date: string;
  total: number;
  net: number;
}

/** 元 → ¥ 金额 */
function fmtAmount(n: number): string {
  return `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

export default function AdminFundsAccountsPage() {
  const accQ = useQuery({
    queryKey: ["finance-accounts"],
    queryFn: async () => (await api.get<{ data: AccountOverview }>("/admin/finance/accounts")).data.data,
  });
  const trendQ = useQuery({
    queryKey: ["finance-accounts-trend"],
    queryFn: async () => (await api.get<{ data: { trend: TrendPoint[] } }>("/admin/finance/accounts/trend?days=30")).data.data,
  });

  const acc = accQ.data;
  const trend = trendQ.data?.trend ?? [];
  const loading = accQ.isLoading;

  const kpis = [
    { label: "平台总余额", value: acc?.total_balance ?? 0, icon: "💰", color: "var(--color-primary)" },
    { label: "可用余额", value: acc?.available_balance ?? 0, icon: "💳", color: "var(--color-success)" },
    { label: "冻结资金", value: acc?.frozen_balance ?? 0, icon: "🧊", color: "var(--color-warning)" },
    { label: "平台毛利", value: acc?.platform_gross_profit ?? 0, icon: "📈", color: "#1e40af" },
    { label: "毛利率", value: `${acc?.platform_gross_margin ?? 0}%`, icon: "📊", color: "#7c3aed" },
  ];

  const fundRows = [
    ["用户充值总额", acc?.user_recharge_total ?? 0],
    ["用户消费总额", acc?.user_consumption_total ?? 0],
    ["退款总额", acc?.refund_total ?? 0],
    ["已发放代理佣金", acc?.agent_commission_paid ?? 0],
    ["待结算代理佣金", acc?.agent_commission_pending ?? 0],
    ["进行中提现", acc?.withdrawal_pending ?? 0],
    ["已完成提现", acc?.withdrawal_completed ?? 0],
  ];

  const maxTotal = Math.max(...trend.map((p) => p.total), 1);

  return (
    <>
      <PageHeader title="资金账户" help="平台资金总览：总余额、可用/冻结资金、充值消费、代理佣金与毛利。冻结资金含代理待结算佣金、进行中提现、用户冻结余额。" />

      {/* KPI 卡片 */}
      <div className="c3-stat-grid">
        {kpis.map((k) => (
          <div key={k.label} className="c3-stat-card">
            <span className="c3-stat-card__icon">{k.icon}</span>
            <div className="c3-stat-card__label">{k.label}</div>
            <div className="c3-stat-card__value" style={{ color: k.color }}>
              {loading ? "—" : typeof k.value === "number" ? fmtAmount(k.value) : k.value}
            </div>
            <div className="c3-stat-card__trend">平台资金池</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, marginTop: 16, alignItems: "start" }}>
        {/* 冻结资金明细 */}
        <Panel title="🧊 冻结资金明细" help="当前平台冻结资金构成">
          {loading ? (
            <SkeletonGroup lines={3} />
          ) : (acc?.frozen_detail?.length ?? 0) === 0 ? (
            <EmptyState title="暂无冻结资金" description="当前无冻结项" />
          ) : (
            <div>
              {acc?.frozen_detail.map((f) => (
                <div
                  key={f.label}
                  style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--color-border, #e2e8f0)" }}
                >
                  <span style={{ color: "var(--color-text-muted)" }}>{f.label}</span>
                  <strong>{fmtAmount(f.amount)}</strong>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12 }}>
                <span style={{ fontWeight: 600 }}>合计</span>
                <strong style={{ color: "var(--color-primary)" }}>{loading ? "—" : fmtAmount(acc?.frozen_balance ?? 0)}</strong>
              </div>
            </div>
          )}
        </Panel>

        {/* 资金构成 */}
        <Panel title="💰 资金构成" help="平台累计充值、消费、退款与代理佣金（数据源：balance_transactions）">
          <div className="c3-grid c3-grid--auto" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            {fundRows.map(([k, v]) => (
              <div key={k as string} style={{ padding: 12, background: "var(--color-bg-soft, #f8fafc)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{k}</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 4 }}>{loading ? "—" : fmtAmount(v as number)}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* 资金变动趋势 */}
      <div style={{ marginTop: 16 }}>
        <Panel title="📈 资金变动趋势" help="近 30 天平台资金累计余额（按天累加充值/消费/退款/佣金/提现净额）。">
        {trendQ.isLoading ? (
          <SkeletonGroup lines={3} />
        ) : trend.length === 0 ? (
          <EmptyState title="暂无趋势数据" description="近 30 天无资金流水" />
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140 }}>
              {trend.map((p) => (
                <div
                  key={p.date}
                  title={`${p.date}: ${fmtAmount(p.total)}`}
                  style={{
                    flex: 1,
                    background: "var(--color-primary, #2563eb)",
                    opacity: 0.8,
                    height: `${Math.max((p.total / maxTotal) * 100, 2)}%`,
                    borderRadius: "2px 2px 0 0",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-text-muted)", fontSize: 12, marginTop: 6 }}>
              <span>{trend[0]?.date ?? ""}</span>
              <span>{trend[trend.length - 1]?.date ?? ""}</span>
            </div>
          </div>
        )}
        </Panel>
      </div>
    </>
  );
}
