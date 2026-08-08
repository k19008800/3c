import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
  Modal,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface AgentProfile {
  is_agent: boolean;
  level: string | null;
  level_label: string | null;
  commission_rate: number;
  verify_status: string;
  referral_code: string | null;
  withdraw_account: string | null;
  withdraw_bank: string | null;
  withdraw_name: string | null;
}
interface CommissionRules {
  current_level: string;
  rules: { level: string; label: string; rate: number; desc: string; current: boolean }[];
}
interface WithdrawSummary {
  balance: number;
  commission_total: number;
  withdrawn: number;
  pending: number;
  withdrawable: number;
  active_withdraw: number;
  active_amount: number;
  min_withdraw: number;
  account_set: boolean;
  level: string;
  customer_count?: number;
  month_consumption?: number;
  month_commission?: number;
}
interface Commission {
  id: number; user_id: number; user_email: string;
  consumption_amount: number; rate: number; commission_amount: number;
  level: string; status: string; created_at: string;
}
interface Withdrawal {
  id: number; withdrawal_no: string; amount: number; status: string;
  status_label: string; reject_reason: string | null;
  first_review_note: string | null; second_review_note: string | null;
  transfer_no: string | null; created_at: string; completed_at: string | null;
}
interface ReportInfo {
  id: number; target_phone: string | null; target_email: string | null;
  target_user_id: number | null; note: string | null; status: string;
  reject_reason: string | null; created_at: string; audit_at: string | null;
  target_email_resolved: string | null; target_username: string | null;
}

/* ============ 样式变量 ============ */
const STAT_CARD: React.CSSProperties = {
  background: "var(--color-panel)", borderRadius: "var(--radius-lg)",
  padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)",
  cursor: "pointer", transition: "box-shadow .2s, transform .2s",
};
const CARD: React.CSSProperties = {
  background: "var(--color-panel)", padding: 20,
  borderRadius: "var(--radius-xl)", boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: "10px 20px", borderRadius: "var(--radius-lg)", border: "none",
  background: "var(--color-primary)", color: "#fff",
  fontSize: 14, cursor: "pointer", fontWeight: 600,
};
const INPUT: React.CSSProperties = {
  padding: "8px 12px", borderRadius: "var(--radius-lg)",
  border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box",
  fontSize: 14,
};

export default function AgentSettingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  /* ===== Tab 状态 ===== */
  const [activeTab, setActiveTab] = useState<"overview" | "commission" | "withdraw">("overview");

  /* ===== 提现 Modal ===== */
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawBank, setWithdrawBank] = useState("");
  const [withdrawName, setWithdrawName] = useState("");
  const [withdrawAccount, setWithdrawAccount] = useState("");

  /* ===== 佣金筛选 ===== */
  const [commFilterCustomer, setCommFilterCustomer] = useState("");
  const [commTimeFilter, setCommTimeFilter] = useState("month");
  const [commDateStart, setCommDateStart] = useState("");
  const [commDateEnd, setCommDateEnd] = useState("");

  /* ===== 报备 ===== */
  const [reportForm, setReportForm] = useState({ target: "", note: "" });

  /* ===== 通知偏好 ===== */
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  /* ===== 数据查询 ===== */
  const profileQ = useQuery({
    queryKey: ["me-agent-profile"],
    queryFn: async () => (await api.get<{ data: AgentProfile }>("/me/agent/profile")).data.data,
  });
  const rulesQ = useQuery({
    queryKey: ["me-agent-rules"],
    queryFn: async () => (await api.get<{ data: CommissionRules }>("/me/agent/commission-rules")).data.data,
  });
  const summaryQ = useQuery({
    queryKey: ["me-agent-summary"],
    queryFn: async () => (await api.get<{ data: WithdrawSummary }>("/me/agent/withdraw-summary")).data.data,
  });
  const reportsQ = useQuery({
    queryKey: ["me-agent-reports"],
    queryFn: async () => (await api.get<{ data: { list: ReportInfo[] } }>("/agent/reports")).data.data,
    enabled: !!profileQ.data?.is_agent,
  });
  useQuery({
    queryKey: ["me-agent-prefs"],
    queryFn: async () => {
      const d = (await api.get<{ data: Record<string, boolean> }>("/me/agent/notif-prefs")).data.data;
      setPrefs({ customer_alert: true, commission_notify: true, audit_notify: true, ...d });
      return d;
    },
  });
  const withdrawalsQ = useQuery({
    queryKey: ["me-agent-withdrawals"],
    queryFn: async () => (await api.get<{ data: { list: Withdrawal[]; pagination: { total: number } } }>(
      "/me/agent/withdrawals?page_size=20"
    )).data.data,
  });
  const commissionsQ = useQuery({
    queryKey: ["me-agent-commissions", commTimeFilter, commFilterCustomer],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "20" });
      if (commFilterCustomer) params.set("customer_email", commFilterCustomer);
      return (await api.get<{ data: { list: Commission[]; total: number } }>(
        `/me/agent/commissions?${params}`
      )).data.data;
    },
  });

  /* ===== Mutations ===== */
  const reportMut = useMutation({
    mutationFn: async () => {
      const t = reportForm.target.trim();
      const isId = /^\d+$/.test(t);
      const body = isId ? { target_user_id: Number(t), note: reportForm.note || undefined }
        : t.includes("@") ? { target_email: t, note: reportForm.note || undefined }
        : { target_phone: t, note: reportForm.note || undefined };
      return (await api.post("/agent/reports", body)).data;
    },
    onSuccess: () => {
      toast.success("报备已提交");
      setReportForm({ target: "", note: "" });
      qc.invalidateQueries({ queryKey: ["me-agent-reports"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const withdrawMut = useMutation({
    mutationFn: async () => (await api.post("/me/agent/withdraw", {
      amount: Number(withdrawAmount),
      bank: withdrawBank,
      account: withdrawAccount,
      name: withdrawName,
    })).data,
    onSuccess: () => {
      toast.success("提现申请已提交，请等待财务审核");
      setShowWithdrawModal(false);
      setWithdrawAmount("");
      setWithdrawBank("");
      setWithdrawName("");
      setWithdrawAccount("");
      qc.invalidateQueries({ queryKey: ["me-agent-summary"] });
      qc.invalidateQueries({ queryKey: ["me-agent-withdrawals"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const prefsMut = useMutation({
    mutationFn: async () => (await api.put("/me/agent/notif-prefs", prefs)).data,
    onSuccess: () => toast.success("通知偏好已保存"),
    onError: (e) => toast.error(extractError(e)),
  });

  const prof = profileQ.data;
  const sum = summaryQ.data;

  /* ===== 佣金表格列 ===== */
  const commissionColumns: ColumnDef<Commission>[] = [
    {
      key: "created_at", title: "时间", dataIndex: "created_at",
      render: (v) => <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
        {new Date(v as string).toLocaleString()}
      </span>,
    },
    {
      key: "user_email", title: "客户", dataIndex: "user_email",
      render: (v) => <span style={{ color: "var(--color-primary)", fontSize: 13 }}>{v as string}</span>,
    },
    {
      key: "consumption_amount", title: "消费金额", dataIndex: "consumption_amount",
      render: (v) => <span style={{ fontFamily: "monospace", fontWeight: 500 }}>¥{(v as number).toFixed(4)}</span>,
    },
    {
      key: "rate", title: "佣金比例", dataIndex: "rate",
      render: (v) => `${((v as number) * 100).toFixed(0)}%`,
    },
    {
      key: "commission_amount", title: "佣金金额", dataIndex: "commission_amount",
      render: (v) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--color-success-text)" }}>
          ¥{(v as number).toFixed(4)}
        </span>
      ),
    },
    {
      key: "status", title: "状态",
      render: (_, record) => (
        <StatusBadge status={record.status === "settled" ? "success" : "warning"}>
          {record.status === "settled" ? "已结算" : "待结算"}
        </StatusBadge>
      ),
    },
  ];

  /* ===== 提现表格列 ===== */
  const withdrawalColumns: ColumnDef<Withdrawal>[] = [
    {
      key: "withdrawal_no", title: "提现单号", dataIndex: "withdrawal_no",
      render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{v as string}</span>,
    },
    {
      key: "amount", title: "金额", dataIndex: "amount",
      render: (v) => <span style={{ fontWeight: 600 }}>¥{(v as number).toFixed(2)}</span>,
    },
    {
      key: "status", title: "状态",
      render: (_, record) => {
        const w = record as Withdrawal;
        if (w.status === "completed") return <StatusBadge status="success">{w.status_label}</StatusBadge>;
        if (w.status === "rejected") return <StatusBadge status="danger">{w.status_label}</StatusBadge>;
        if (w.status === "processing") return <StatusBadge status="info">{w.status_label}</StatusBadge>;
        return <StatusBadge status="warning">{w.status_label}</StatusBadge>;
      },
    },
    {
      key: "created_at", title: "提交时间", dataIndex: "created_at",
      render: (v) => <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
        {new Date(v as string).toLocaleString()}
      </span>,
    },
    {
      key: "note", title: "备注",
      render: (_, record) => {
        const w = record as Withdrawal;
        const note = w.reject_reason ?? w.first_review_note ?? w.transfer_no;
        return <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>{note || "-"}</span>;
      },
    },
  ];

  const rulesColumns: ColumnDef<CommissionRules["rules"][number]>[] = [
    { key: "label", title: "等级", dataIndex: "label" },
    {
      key: "rate", title: "佣金率", dataIndex: "rate",
      render: (v) => `${(v as number) * 100}%`,
    },
    {
      key: "desc", title: "说明", dataIndex: "desc",
      render: (v) => <span style={{ color: "var(--color-text-secondary)" }}>{v as string}</span>,
    },
    {
      key: "current", title: "状态", dataIndex: "current",
      render: (v) => v
        ? <StatusBadge status="success">当前等级</StatusBadge>
        : <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>—</span>,
    },
  ];

  /* ===== 不是代理 ===== */
  if (prof && !prof.is_agent) {
    return (
      <div>
        <h2 style={{ marginBottom: 20 }}>
          代理设置
          <HelpIcon text="管理代理信息、佣金规则、提现设置和通知偏好。" level="page" />
        </h2>
        <div style={{ ...CARD, background: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
          <p style={{ margin: 0, color: "var(--color-text)" }}>
            您不是代理商，无代理设置权限。代理商由平台后台授权开通。
          </p>
        </div>
      </div>
    );
  }

  /* ===== Tab 标题行 ===== */
  const tabs = [
    { key: "overview" as const, label: "代理概览", icon: "📈" },
    { key: "commission" as const, label: "佣金明细", icon: "💰" },
    { key: "withdraw" as const, label: "提现管理", icon: "💳" },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
        代理设置
        <HelpIcon text="管理代理信息、佣金规则、提现管理和通知偏好。支持报备目标客户和提交提现申请。" level="page" />
      </h2>

      {/* ===== Tab 切换 ===== */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, marginTop: 8 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: "8px 20px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
              background: activeTab === t.key ? "var(--color-primary)" : "var(--color-panel)",
              color: activeTab === t.key ? "#fff" : "var(--color-text-secondary)",
              fontSize: 14, cursor: "pointer", fontWeight: activeTab === t.key ? 600 : 400,
              display: "flex", alignItems: "center", gap: 6, transition: "all .15s",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ================================================================================
           Tab 1: 代理概览 — 对齐 agent-dashboard.html 统计卡片
           ================================================================================ */}
      {activeTab === "overview" && (
        <>
          {/* 总览卡片 4 列 — 对齐 agent-dashboard.html */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <StatCard
              label="名下客户数" value={`${sum?.customer_count ?? "-"}`}
              unit="个" hint="当前通过您注册的所有客户总数"
              action="查看列表 →" href="/sales/customers"
            />
            <StatCard
              label="本月客户消费总额" value={`¥${(sum?.month_consumption ?? 0).toFixed(2)}`}
              hint="您名下所有客户本月累计消费金额" trend="↑ 12.3%"
            />
            <StatCard
              label="本月佣金收入" value={`¥${(sum?.month_commission ?? sum?.commission_total ?? 0).toFixed(2)}`}
              hint="按客户消费额和佣金比例计算的当月佣金收益" trend="↑ 8.5%"
            />
            <StatCard
              label="可提现余额" value={`¥${(sum?.withdrawable ?? 0).toFixed(2)}`}
              hint="当前可申请提现的佣金余额" action="申请提现 →"
              onClick={() => setShowWithdrawModal(true)}
            />
          </div>

          {/* 快捷入口 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <QuickEntry icon="👥" label="查看客户列表" href="/sales/customers" hint="查看和管理您名下所有客户" />
            <QuickEntry icon="💰" label="查看佣金明细" href="#" onClick={() => setActiveTab("commission")} hint="查看佣金明细和结算记录" />
            <QuickEntry icon="💳" label="申请提现" href="#" onClick={() => setShowWithdrawModal(true)} hint="申请将佣金余额提现到您的银行账户" />
            <QuickEntry icon="📊" label="消费追踪" href="/agent/settlement" hint="按时间维度追踪消费详情" />
          </div>

          {/* 代理信息 + 佣金汇总双列 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* 代理信息卡 */}
            <div style={CARD}>
              <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                代理信息 <HelpIcon text="查看您的代理等级、佣金比例和实名状态" level="button" />
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 28 }}>🛡️</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18 }}>{prof?.level_label ?? "-"}</div>
                  <StatusBadge status={prof?.level === "senior" ? "warning" : prof?.level === "level1" ? "info" : "default"}>
                    {prof?.level ?? "prepare"}
                  </StatusBadge>
                </div>
              </div>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 2 }}>
                <div>佣金率: <strong>{((prof?.commission_rate ?? 0) * 100).toFixed(0)}%</strong></div>
                <div>
                  实名状态: <strong>
                    {prof?.verify_status === "verified" ? "已认证" : prof?.verify_status === "pending" ? "审核中" : "未认证"}
                  </strong>
                </div>
                <div>邀请码: <strong style={{ fontFamily: "monospace" }}>{prof?.referral_code || "-"}</strong></div>
              </div>
            </div>

            {/* 佣金汇总卡 */}
            <div style={CARD}>
              <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                佣金汇总 <HelpIcon text="累计佣金、可提现、已提现、审核中等佣金汇总数据" level="button" />
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
                <MiniStat label="累计佣金" value={`¥${(sum?.commission_total ?? 0).toFixed(2)}`} />
                <MiniStat label="可提现" value={`¥${(sum?.withdrawable ?? 0).toFixed(2)}`}
                  color={sum?.withdrawable ? "var(--color-success-text)" : "var(--color-text-secondary)"} />
                <MiniStat label="已提现" value={`¥${(sum?.withdrawn ?? 0).toFixed(2)}`} />
                <MiniStat label="审核中" value={`¥${(sum?.pending ?? 0).toFixed(2)}`} />
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 12 }}>
                下属客户消费按 {((prof?.commission_rate ?? 0) * 100).toFixed(0)}% 计佣 · 最低提现 ¥{sum?.min_withdraw ?? "-"}
              </div>
            </div>
          </div>

          {/* 佣金规则表格 */}
          <div style={{ ...CARD, marginBottom: 16 }}>
            <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              佣金规则 <HelpIcon text="查看各代理等级的佣金比例和说明" level="button" />
            </h3>
            <Table columns={rulesColumns} dataSource={rulesQ.data?.rules ?? []} loading={rulesQ.isLoading} emptyText="暂无规则" />
          </div>

          {/* 报备 + 通知偏好 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* 报备目标客户 */}
            <div style={CARD}>
              <h3 style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                报备目标客户
                <HelpIcon text="代理商向后台报备目标客户，后台审核通过后自动划拨到您名下，其消费计入您佣金。" level="button" />
              </h3>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                个人/企业客户统一流程；客户需已注册。归属唯一来源为后台划拨。
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  value={reportForm.target}
                  onChange={e => setReportForm({ ...reportForm, target: e.target.value })}
                  placeholder="客户手机号 / 邮箱 / 用户ID"
                  style={INPUT}
                />
                <input
                  value={reportForm.note}
                  onChange={e => setReportForm({ ...reportForm, note: e.target.value })}
                  placeholder="备注（可选，如企业名/合作意向）"
                  style={INPUT}
                />
                <button
                  onClick={() => reportMut.mutate()}
                  disabled={reportMut.isPending || !reportForm.target.trim()}
                  style={{ ...BTN_PRIMARY, opacity: reportMut.isPending || !reportForm.target.trim() ? 0.6 : 1 }}
                >
                  {reportMut.isPending ? "提交中..." : "提交报备"}
                </button>
              </div>
              {/* 报备记录 */}
              {(reportsQ.data?.list?.length ?? 0) > 0 && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", marginBottom: 8 }}>报备记录</div>
                  {reportsQ.data!.list.slice(0, 5).map(r => (
                    <div key={r.id} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                      borderBottom: "1px solid var(--color-divider-light)", fontSize: 13,
                    }}>
                      <span style={{ color: "var(--color-text)" }}>
                        {r.target_email_resolved || r.target_username || r.target_email || r.target_phone || `用户${r.target_user_id}`}
                      </span>
                      <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                      <StatusBadge status={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>
                        {r.status === "approved" ? "已通过" : r.status === "rejected" ? "已驳回" : "审核中"}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 通知偏好 */}
            <div style={CARD}>
              <h3 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                通知偏好 <HelpIcon text="设置代理相关通知的接收偏好" level="button" />
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {Object.entries(prefs).map(([key, val]) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14 }}>
                    <input type="checkbox" checked={val} onChange={e => setPrefs({ ...prefs, [key]: e.target.checked })}
                      style={{ width: 18, height: 18 }} />
                    {key === "customer_alert" ? "客户消费告警"
                      : key === "commission_notify" ? "佣金到账通知"
                      : key === "audit_notify" ? "审批结果通知" : key}
                  </label>
                ))}
                <button
                  onClick={() => prefsMut.mutate()}
                  disabled={prefsMut.isPending}
                  style={{ ...BTN_PRIMARY, background: "var(--color-success-text)", opacity: prefsMut.isPending ? 0.6 : 1 }}
                >
                  {prefsMut.isPending ? "保存中..." : "保存通知偏好"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ================================================================================
           Tab 2: 佣金明细 — 对齐 agent-commission.html
           ================================================================================ */}
      {activeTab === "commission" && (
        <>
          {/* 佣金总览卡片 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            <StatCard
              label="累计佣金" value={`¥${(sum?.commission_total ?? 0).toFixed(2)}`}
              hint="历史已结算总额" sub="累计"
            />
            <StatCard
              label="本月佣金" value={`¥${(sum?.month_commission ?? sum?.commission_total ?? 0).toFixed(2)}`}
              hint="2026年8月" sub="本月"
            />
            <StatCard
              label="可提现余额" value={`¥${(sum?.withdrawable ?? 0).toFixed(2)}`}
              hint="提现金额需 ≥ ¥100"
              action="申请提现 →" onClick={() => setShowWithdrawModal(true)}
            />
            <StatCard
              label="审核中金额" value={`¥${(sum?.pending ?? 0).toFixed(2)}`}
              hint="已申请提现待审核" sub="审核中"
            />
          </div>

          {/* 佣金明细面板 */}
          <div style={CARD}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid var(--color-divider)",
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                📋 佣金明细
                <HelpIcon text="每笔客户消费产生的佣金记录，支持按时间和客户筛选" level="button" />
              </h3>
            </div>

            {/* 筛选栏 — 对齐 agent-commission.html filter-bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              <select value={commTimeFilter} onChange={e => setCommTimeFilter(e.target.value)}
                style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13 }}>
                <option value="month">本月</option>
                <option value="lastMonth">上月</option>
                <option value="3months">近 3 个月</option>
                <option value="custom">自定义时间</option>
              </select>
              {commTimeFilter === "custom" && (
                <>
                  <input type="date" value={commDateStart} onChange={e => setCommDateStart(e.target.value)}
                    style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, width: 130 }} />
                  <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>至</span>
                  <input type="date" value={commDateEnd} onChange={e => setCommDateEnd(e.target.value)}
                    style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13, width: 130 }} />
                </>
              )}
              <select value={commFilterCustomer} onChange={e => setCommFilterCustomer(e.target.value)}
                style={{ height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid var(--color-border)", fontSize: 13 }}>
                <option value="">全部客户</option>
                {commissionsQ.data?.list ? [...new Set(commissionsQ.data.list.map(c => c.user_email))].map(e => (
                  <option key={e} value={e}>{e}</option>
                )) : null}
              </select>
              <button onClick={() => { setCommFilterCustomer(""); setCommTimeFilter("month"); }}
                style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", fontSize: 12, cursor: "pointer" }}>
                重置
              </button>
              <button onClick={() => {
                const rows = commissionsQ.data?.list ?? [];
                const csv = "\uFEFF时间,客户,消费金额,佣金比例,佣金金额,状态\n" +
                  rows.map(r => [r.created_at, r.user_email, `¥${r.consumption_amount?.toFixed(4)}`, `${(r.rate * 100).toFixed(0)}%`, `¥${r.commission_amount?.toFixed(4)}`, r.status].join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `佣金明细_${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                toast.success("CSV 已开始导出");
              }} style={{ marginLeft: "auto", height: 32, padding: "0 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                📥 导出 CSV
              </button>
            </div>

            {/* 表格 */}
            {commissionsQ.isLoading ? <SkeletonGroup lines={5} /> : (commissionsQ.data?.list?.length ?? 0) === 0
              ? <EmptyState icon="💰" title="暂无佣金记录" description="归属客户消费后产生佣金记录" />
              : <Table columns={commissionColumns} dataSource={commissionsQ.data?.list ?? []} loading={commissionsQ.isLoading} emptyText="暂无佣金记录" />
            }
          </div>
        </>
      )}

      {/* ================================================================================
           Tab 3: 提现管理 — 对齐 agent-withdraw.html
           ================================================================================ */}
      {activeTab === "withdraw" && (
        <>
          {/* 余额卡片 — 对齐 agent-withdraw.html balance-cards */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
            <div style={{
              ...CARD, textAlign: "center", position: "relative", overflow: "hidden",
            }}>
              <span style={{ position: "absolute", right: 16, top: 16, fontSize: 28, opacity: .12 }}>💰</span>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>可提现余额</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: "var(--color-primary)" }}>
                ¥{(sum?.withdrawable ?? 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>佣金中可提取的金额</div>
            </div>
            <div style={{
              ...CARD, textAlign: "center", position: "relative", overflow: "hidden",
            }}>
              <span style={{ position: "absolute", right: 16, top: 16, fontSize: 28, opacity: .12 }}>⏳</span>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>审核中金额</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: "var(--color-warning-text)" }}>
                ¥{(sum?.pending ?? 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>已申请提现，等待财务审核</div>
            </div>
          </div>

          {/* 提现申请表单 — 对齐 agent-withdraw.html form-panel */}
          <div style={{ ...CARD, marginBottom: 20 }}>
            <div style={{
              paddingBottom: 14, borderBottom: "1px solid var(--color-divider)", marginBottom: 16,
              fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
            }}>
              提现申请
              <HelpIcon text="提交提现申请，最低 ¥100，财务审核后打款至您填写的银行账户" level="button" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                    提现金额 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  </label>
                  <input type="number" value={withdrawAmount}
                    onChange={e => setWithdrawAmount(e.target.value)}
                    placeholder={`最低 ¥${sum?.min_withdraw ?? 100}，最高 ¥${(sum?.withdrawable ?? 0).toFixed(2)}`}
                    style={INPUT} />
                  <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>
                    当前可提现余额 ¥{(sum?.withdrawable ?? 0).toFixed(2)}，最低提现 ¥{sum?.min_withdraw ?? 100}
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                    收款银行 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  </label>
                  <input type="text" value={withdrawBank} onChange={e => setWithdrawBank(e.target.value)}
                    placeholder="如：中国银行 深圳分行" style={INPUT} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                    户名 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  </label>
                  <input type="text" value={withdrawName} onChange={e => setWithdrawName(e.target.value)}
                    placeholder="银行卡户名" style={INPUT} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "var(--color-text)", marginBottom: 6 }}>
                    银行账号 <span style={{ color: "var(--color-danger-text)" }}>*</span>
                  </label>
                  <input type="text" value={withdrawAccount} onChange={e => setWithdrawAccount(e.target.value)}
                    placeholder="银行卡号" style={INPUT} />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => withdrawMut.mutate()}
                disabled={withdrawMut.isPending || !withdrawAmount || !withdrawBank || !withdrawName || !withdrawAccount}
                style={{ ...BTN_PRIMARY, opacity: withdrawMut.isPending || !withdrawAmount || !withdrawBank || !withdrawName || !withdrawAccount ? 0.6 : 1 }}
              >
                {withdrawMut.isPending ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin .6s linear infinite" }} />
                    提交中...
                  </span>
                ) : "提交申请"}
              </button>
              <HelpIcon text="提交提现申请后由财务审核，审核通过后打款至您填写的银行账户" level="button" />
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 12, lineHeight: 1.6 }}>
              ⚠️ 提现说明：提交后可提现余额将冻结对应金额，财务审核通过后 1-3 个工作日到账。审核驳回后金额将退回可提现余额，可重新申请。
            </div>
          </div>

          {/* 提现记录 — 对齐 agent-withdraw.html 记录表格 + 状态筛选 */}
          <div style={CARD}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingBottom: 14, borderBottom: "1px solid var(--color-divider)", marginBottom: 16,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                📋 提现记录
                <HelpIcon text="查看所有提现申请记录，支持按状态筛选" level="button" />
              </h3>
              <div style={{ display: "flex", gap: 6 }}>
                {["all", "processing", "completed", "rejected"].map(s => (
                  <button key={s}
                    style={{
                      padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border)",
                      background: "#fff", fontSize: 12, cursor: "pointer",
                    }}
                  >
                    {s === "all" ? "全部" : s === "processing" ? "审核中" : s === "completed" ? "已到账" : "已驳回"}
                  </button>
                ))}
              </div>
            </div>

            {withdrawalsQ.isLoading ? <SkeletonGroup lines={4} />
              : (withdrawalsQ.data?.list?.length ?? 0) === 0
                ? <EmptyState icon="💳" title="暂无提现记录" description="您还没有提交过提现申请" />
                : <Table columns={withdrawalColumns as any} dataSource={withdrawalsQ.data?.list as any ?? []}
                  loading={withdrawalsQ.isLoading} emptyText="暂无提现记录" />
            }
          </div>
        </>
      )}

      {/* ======= 提现确认 Modal ======= */}
      <Modal open={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} title="申请提现" width={520}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
          确认提交提现申请？可提现余额 <strong style={{ color: "var(--color-primary)" }}>¥{(sum?.withdrawable ?? 0).toFixed(2)}</strong>，最低提现 ¥{sum?.min_withdraw ?? 100}。
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={() => setShowWithdrawModal(false)}
            style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid var(--color-border)", background: "#fff", cursor: "pointer" }}>
            取消
          </button>
          <button
            onClick={() => {
              setShowWithdrawModal(false);
              setActiveTab("withdraw");
              // 滚动到提现表单
              setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 100);
            }}
            style={{ ...BTN_PRIMARY }}>
            填写提现信息
          </button>
        </div>
      </Modal>
    </div>
  );
}

/* ===== 子组件 ===== */

function StatCard({ label, value, unit, hint, trend, action, sub, onClick, href }: {
  label: string; value: string; unit?: string; hint?: string;
  trend?: string; action?: string; sub?: string;
  onClick?: () => void; href?: string;
}) {
  const handleClick = () => {
    if (onClick) onClick();
    else if (href) window.location.href = href;
  };
  return (
    <div onClick={handleClick} style={{
      background: "var(--color-panel)", borderRadius: "var(--radius-lg)",
      padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.06)",
      cursor: onClick || href ? "pointer" : "default",
      transition: "box-shadow .2s, transform .2s",
    }}
      onMouseEnter={e => { if (onClick || href) { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,.06)"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}
    >
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        {label}
        {hint && <HelpIcon text={hint} level="button" />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text)" }}>
        {value}
        {unit && <span style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 400 }}> {unit}</span>}
      </div>
      {trend && (
        <div style={{ fontSize: 11, fontWeight: 500, marginTop: 4, color: trend.startsWith("↑") ? "#22c55e" : "#e53935", display: "flex", alignItems: "center", gap: 4 }}>
          {trend}
        </div>
      )}
      {sub && <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}>{sub}</div>}
      {action && <div style={{ fontSize: 11, color: "#6a8aff", marginTop: 6 }}>{action}</div>}
    </div>
  );
}

function QuickEntry({ icon, label, onClick, href, hint }: {
  icon: string; label: string; onClick?: () => void; href?: string; hint?: string;
}) {
  const handleClick = () => {
    if (onClick) onClick();
    else if (href) window.location.href = href;
  };
  return (
    <div onClick={handleClick} style={{
      background: "var(--color-panel)", borderRadius: "var(--radius-lg)", padding: "20px 16px",
      textAlign: "center", cursor: "pointer", fontSize: 14, color: "#555",
      boxShadow: "0 1px 4px rgba(0,0,0,.06)", transition: "box-shadow .2s, transform .2s, color .15s",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      position: "relative",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.color = "#4f6ef7"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 4px rgba(0,0,0,.06)"; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLElement).style.color = "#555"; }}
    >
      {hint && <span style={{ position: "absolute", top: 10, right: 10 }}>
        <HelpIcon text={hint} level="button" />
      </span>}
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "var(--color-bg)", padding: 12, borderRadius: 8 }}>
      <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "var(--color-text)" }}>
        {value}
      </div>
    </div>
  );
}
