import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import {
  PageHeader,
  Panel,
  Tag,
  Table,
  SkeletonGroup,
  EmptyState,
  TimeRangeFilter,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef, TimeRangeKey } from "@3cloud/shared-ui";

interface DashboardData {
  month: {
    recharge: number;
    refund: number;
    commission: number;
    grossProfit: number;
  };
  todos: {
    manualTopup: number;
    refund: number;
    invoice: number;
    withdrawal: number;
  };
}

interface Transaction {
  id: number;
  type: string;
  typeLabel: string;
  amount: number;
  status: string;
  statusLabel: string;
  createdAt: string;
  customer: string | null;
}

/** 交易状态 → 原型 tag 类型 + 文案 */
function displayTxStatus(statusLabel: string): { type: "green" | "orange" | "blue" | "red" | "gray"; label: string } {
  if (statusLabel === "成功" || statusLabel === "已到账" || statusLabel === "已结算") return { type: "green", label: statusLabel };
  if (statusLabel === "待审核" || statusLabel === "处理中") return { type: "orange", label: statusLabel };
  if (statusLabel === "已拒绝") return { type: "red", label: statusLabel };
  return { type: "gray", label: statusLabel };
}

/** 元 → ¥ 金额 */
function fmtAmount(n: number): string {
  return `¥${n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

/** 快捷入口 → 对应路由 */
const QUICK_LINKS = [
  { to: "/admin/finance/manual-topup", label: "✋ 人工上账" },
  { to: "/admin/finance/orders", label: "🧾 充值订单" },
  { to: "/admin/finance/refunds", label: "↩️ 退款审核" },
  { to: "/admin/finance/invoices", label: "📄 发票审核" },
  { to: "/admin/finance/withdrawals", label: "💳 提现管理" },
  { to: "/admin/finance/commissions", label: "💸 佣金流水" },
];

export default function AdminFinancePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [range, setRange] = useState<TimeRangeKey>("today");

  const dashQ = useQuery({
    queryKey: ["finance-dashboard"],
    queryFn: async () => (await api.get<{ data: DashboardData }>("/admin/finance/dashboard")).data.data,
  });

  const txQ = useQuery({
    queryKey: ["finance-transactions"],
    queryFn: async () => (await api.get<{ data: Transaction[] }>("/admin/finance/transactions?limit=10")).data.data,
  });

  const dash = dashQ.data;
  const todos = dash?.todos;
  const month = dash?.month;
  const tx = txQ.data ?? [];

  const columns: ColumnDef<Transaction>[] = [
    {
      key: "createdAt",
      title: "时间",
      dataIndex: "createdAt",
      render: (v) => String(v).slice(0, 16).replace("T", " "),
    },
    { key: "customer", title: "客户", dataIndex: "customer", render: (v) => v ?? "—" },
    { key: "typeLabel", title: "类型", dataIndex: "typeLabel" },
    {
      key: "amount",
      title: "金额",
      dataIndex: "amount",
      render: (v) => <span className="c3-rank-amount">{fmtAmount(Number(v))}</span>,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "statusLabel",
      render: (_, r) => {
        const s = displayTxStatus(r.statusLabel);
        return <Tag type={s.type}>{s.label}</Tag>;
      },
    },
  ];

  return (
    <>
      <PageHeader title="财务工作台" help="财务首页，展示待处理事项和本月汇总数据。" />

      {/* 待办事项 — 原型 todo-grid */}
      <div className="c3-todo-grid">
        {[
          { key: "manualTopup", label: "人工上账待审核", icon: "💳", unit: "笔", color: "red", to: "/admin/finance/manual-topup" },
          { key: "refund", label: "退款待审核", icon: "↩️", unit: "笔", color: "orange", to: "/admin/finance/refunds" },
          { key: "invoice", label: "发票待审核", icon: "📄", unit: "份", color: "blue", to: "/admin/finance/invoices" },
          { key: "withdrawal", label: "提现待审核", icon: "💳", unit: "笔", color: "purple", to: "/admin/finance/withdrawals" },
        ].map((card) => (
          <div key={card.key} className={`c3-todo-card ${card.color}`} onClick={() => navigate(card.to)}>
            <div className="c3-todo-badge">{todos?.[card.key as keyof typeof todos] ?? 0}</div>
            <div className="c3-todo-icon">{card.icon}</div>
            <div className="c3-todo-label">{card.label}</div>
            <div className="c3-todo-value">
              {todos?.[card.key as keyof typeof todos] ?? 0}
              <span className="c3-todo-unit">{card.unit}</span>
            </div>
            <div className="c3-todo-action">前往处理 →</div>
          </div>
        ))}
      </div>

      {/* 本月汇总 — 原型 stat-grid */}
      <div className="c3-stat-grid">
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">💰</span>
          <div className="c3-stat-card__label">本月充值总额</div>
          <div className="c3-stat-card__value">{dashQ.isLoading ? "—" : fmtAmount(month?.recharge ?? 0)}</div>
          <div className="c3-stat-card__trend c3-stat-card__trend--up">↑ 本月累计</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">↩️</span>
          <div className="c3-stat-card__label">本月退款总额</div>
          <div className="c3-stat-card__value">{dashQ.isLoading ? "—" : fmtAmount(month?.refund ?? 0)}</div>
          <div className="c3-stat-card__trend c3-stat-card__trend--down">↩ 退款统计</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">💸</span>
          <div className="c3-stat-card__label">佣金支出</div>
          <div className="c3-stat-card__value">{dashQ.isLoading ? "—" : fmtAmount(month?.commission ?? 0)}</div>
          <div className="c3-stat-card__trend c3-stat-card__trend--up">↑ 已结算佣金</div>
        </div>
        <div className="c3-stat-card">
          <span className="c3-stat-card__icon">📈</span>
          <div className="c3-stat-card__label">毛利润</div>
          <div className="c3-stat-card__value" style={{ color: "var(--color-primary)" }}>
            {dashQ.isLoading ? "—" : fmtAmount(month?.grossProfit ?? 0)}
          </div>
          <div className="c3-stat-card__trend c3-stat-card__trend--up">↑ 充值−退款−佣金</div>
        </div>
      </div>

      {/* 快捷入口 — 原型面板 */}
      <Panel title="⚡ 快捷入口" help="快速跳转到财务各功能页。">
        <div className="c3-btn-group">
          {QUICK_LINKS.map((l) => (
            <button key={l.to} type="button" className="c3-btn c3-btn--default" onClick={() => navigate(l.to)}>
              {l.label}
            </button>
          ))}
        </div>
      </Panel>

      {/* 筛选栏 — 原型 filter-bar */}
      <div className="c3-filter-bar">
        <TimeRangeFilter value={range} onChange={setRange} />
        <div className="c3-filter-spacer" />
        <div className="c3-filter-group">
          <span className="c3-filter-label">搜索</span>
          <input className="c3-filter-input c3-filter-input--w200" type="text" placeholder="请输入关键词" />
          <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => toast.info("搜索功能开发中")}>
            搜索
          </button>
          <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => toast.info("导出功能开发中")}>
            导出
          </button>
        </div>
      </div>

      {/* 最近交易 — 原型面板表格 */}
      <Panel title="📋 最近交易" help="近 30 天充值/退款/提现/佣金流水。">
        {txQ.isLoading ? (
          <SkeletonGroup lines={6} />
        ) : tx.length === 0 ? (
          <EmptyState title="暂无交易" description="还没有资金流水记录" />
        ) : (
          <Table columns={columns} dataSource={tx} rowKey={(r) => `${r.type}-${r.id}`} />
        )}
      </Panel>
    </>
  );
}
