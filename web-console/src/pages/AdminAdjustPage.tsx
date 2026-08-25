import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { usePerm } from "../lib/permissions";
import { useAuthStore } from "../store/auth";
import { withOperation2fa, isOperation2faCanceled, operation2faErrorText, operation2faHeaders } from "../lib/operation-2fa";
import type { OperationSummaryItem } from "../components/Operation2faModal";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/**
 * 手动调账（产品裁决 2026-08-15，对齐原型 admin-adjust.html；R5–R7 整改叠加）
 * 三页签：发起调账 / 待我审批 / 调账台账
 *
 * R5：调增免审取消（默认一级）；>¥100,000 三级审批（pending_super，super_admin 终审）；
 *     调减恰 ¥10,000 仍双人特例保留（双签裁决 B1/B2）
 * R6：24h 累计限额 soft=¥50,000 升级双人、hard=¥100,000 拒绝（双签裁决 B5/B6）
 * R7：发起/审批/复核/驳回/红冲均挂操作级 2FA + 二次确认
 */

interface AdjustRecord {
  id: number;
  user_id: number;
  username: string | null;
  email: string | null;
  direction: string;
  direction_label: string;
  amount: number;
  reason: string;
  subject: string;
  reference_no: string | null;
  approval_level: string;
  status: string;
  status_label: string;
  balance_before: number;
  balance_after: number;
  requested_by: number;
  requester_email: string | null;
  reject_reason: string | null;
  reversed_by_id: number | null;
  created_at: string;
  /* R5 增量字段（防御式解析，后端未返回时缺省） */
  approved_by?: number | null;
  reviewed_by?: number | null;
  super_reviewer_id?: number | null;
  approval_stalled?: boolean;
  limit_escalated?: boolean;
}

/** 驳回原因输入（R7：两步弹窗承载摘要确认，本弹窗仅收集必填原因） */
interface RejectState {
  record: AdjustRecord;
  reason: string;
}

const SUBJECTS = ["充值退款", "消费冲正", "佣金调整", "优惠赠送", "坏账核销", "其他"];
const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  pending_level2: "warning",
  pending_super: "info",
  approved: "success",
  rejected: "danger",
  reversed: "default",
};

/* R6 限额（双签裁决 B5/B6：soft=¥50,000 / hard=¥100,000，24h 累计） */
const DAILY_SOFT_LIMIT = 50000;
const DAILY_HARD_LIMIT = 100000;

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const fieldLabel: React.CSSProperties = { display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 };

/* PRD §8 按钮级帮助对照表（P1 不可降级；文案随 R5–R7 更新） */
const HELP_CREATE_ADJUST = "发起/审核调账仅限 admin / super_admin（finance 角色不可见）。调增免审批已取消，全部调增至少一级审批；按金额分级：≤¥10,000 单审、>¥10,000 双人复核、>¥100,000 追加 super_admin 终审（调减恰 ¥10,000 亦双人）。错误调账不删除不编辑，通过红冲生成反向记录。资金写操作需操作级 2FA + 二次确认";
const HELP_APPROVE_L1 = "一级审批：单审档通过即生效；双人/终审档通过后进入下一环节（待双人复核/待终审），不会立即生效；审批人不能是申请人";
const HELP_REVIEW_L2 = "二级复核：双人档在此环节通过后生效；终审档通过后进入 super 终审；审批人不能与一级审批人相同";
const HELP_SUPER = "终审通过（super_admin）：终审档（>¥100,000）的最终确认，通过后调账生效；终审人不能是前两级审批人或申请人";
const HELP_REJECT = "驳回：拒绝该调账，必须填写驳回原因；单据变为已驳回，不改变用户余额（任意审批阶段均可驳回）";
const HELP_REVERSE = "红字冲销：对已生效的错误调账生成反向记录进行冲正，需独立审批，不删除原记录；反向记录按自身金额重新定级（需操作级 2FA + 二次确认）";
const HELP_PENDING_FILTER = "待我审批（筛选）：按审批环节筛选待办：单审 / 待双人复核 / 待终审；队列已排除您自己申请的单据";
const HELP_LIMIT_ESCALATE = "限额升级提示：本笔因 24h 累计超限（¥50,000）被升级为双人审批（累计超 ¥100,000 将拒绝）";

/* PRD §7.2 页面帮助（pageKey: finance-adjust） */
const PAGE_HELP = [
  "【功能定位】为指定用户调增/调减余额（平台赠送、补偿、纠错、扣减），按金额分级审批，防拆分，全程审计，错误调账可红冲。",
  "",
  "【核心操作】",
  "1. 发起调账：选择用户 → 方向（调增/调减）→ 金额 → 会计科目 → 原因 → 二次确认 + 操作级 2FA → 提交",
  "2. 金额 ≤¥10,000 单审；>¥10,000 双人复核；>¥100,000 追加 super_admin 终审",
  "3. 待我审批：一级/二级/终审队列，排除自己申请的单据",
  "4. 调账生效后错误可「红字冲销」生成反向记录",
  "",
  "【注意事项】",
  "- 调增免审批已取消（除非开启白名单科目免审：仅赠送/补偿/纠错且 ≤¥1,000）",
  "- 申请人 ≠ 审批人；一级 ≠ 二级；终审人 ≠ 前两级审批人；红冲需独立审批",
  "- 操作人/被入账用户 24h 累计调增+上账超过 ¥50,000 → 后续笔升级双人审批；超过 ¥100,000 → 拒绝",
  "- 资金写操作需 2FA + 二次确认",
  "- 错误调账不删除不编辑，通过红字冲销纠正",
  "",
  "【常见问题】",
  "Q: 调增 ¥500 也要审批吗？",
  "A: 默认是的（免审批已取消）；若运营开启白名单免审（赠送/补偿/纠错科目且 ≤¥1,000），符合条件的调增可提交即生效。",
  "Q: 为什么\"待我审批\"看不到某些单据？",
  "A: 该队列已排除您自己申请的单据（职责分离）。",
  "Q: 调减如何审批？",
  "A: 调减按金额分级：≤¥10,000 单审、>¥10,000 双人复核（恰为 ¥10,000 亦双人，保留更严语义）、>¥100,000 追加 super_admin 终审。",
].join("\n");

/** 调账定级（前端镜像，双签裁决 B1/B2：调减恰 ¥10,000 仍双人特例；最终以后端定级为准） */
function adjustTier(direction: string, amount: number): 1 | 2 | 3 {
  if (direction === "increase") {
    if (amount > 100000) return 3;
    if (amount > 10000) return 2;
    return 1;
  }
  // 调减：恰 ¥10,000 保留更严双人档（裁决 B1 特例）
  if (amount > 100000) return 3;
  if (amount >= 10000) return 2;
  return 1;
}

/** 状态中文兜底（后端 pending_super 标签未就绪时前端渲染） */
function adjustStatusLabel(r: AdjustRecord): string {
  if (r.status_label) return r.status_label;
  switch (r.status) {
    case "pending": return "一级待审";
    case "pending_level2": return "二级待审";
    case "pending_super": return "待终审";
    case "approved": return "已生效";
    case "rejected": return "已驳回";
    case "reversed": return "已红冲";
    default: return r.status;
  }
}

/** 审批人链（申请人 → 一级 → 二级 → 终审；台账展示） */
function adjustChain(r: AdjustRecord): string {
  const segs: string[] = [`申请 ${r.requester_email ?? `#${r.requested_by}`}`];
  segs.push(r.approved_by ? `一审 #${r.approved_by}` : "一审 —");
  segs.push(r.reviewed_by ? `二审 #${r.reviewed_by}` : "二审 —");
  if (r.super_reviewer_id) segs.push(`终审 #${r.super_reviewer_id}`);
  return segs.join(" → ");
}

/** R7 两步弹窗第二步的操作摘要（审批/驳回/红冲） */
function buildAdjustSummary(r: AdjustRecord, kind: "approve" | "review" | "super" | "reject" | "reverse", reason?: string): OperationSummaryItem[] {
  const kindLabel: Record<string, string> = {
    approve: "调账 · 一级审批通过",
    review: "调账 · 二级复核通过",
    super: "调账 · super 终审通过",
    reject: "调账 · 驳回",
    reverse: "调账 · 红字冲销",
  };
  const rows: OperationSummaryItem[] = [
    { label: "操作类型", value: kindLabel[kind] ?? kind },
    { label: "用户", value: r.username || r.email || `#${r.user_id}` },
    { label: "方向", value: r.direction_label },
    { label: "金额", value: `¥${r.amount.toLocaleString()}`, highlight: true },
    { label: "科目", value: r.subject },
    {
      label: "审批级别",
      value: r.approval_level === "level3" ? "三级审批（super_admin 终审）"
        : r.approval_level === "level2" ? "二级审批（双人复核）"
          : "一级审批（单审）",
    },
  ];
  if (reason) rows.push({ label: "驳回原因", value: reason });
  if (kind === "reverse") {
    rows.push({ label: "红冲提示", value: "将生成一笔反向记录冲正原调账，原记录保留不删除；反向记录按自身金额重新定级审批", highlight: true });
  }
  return rows;
}

export default function AdminAdjustPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const canAdjust = usePerm("finance.adjust");
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const [tab, setTab] = useState<"create" | "approve" | "ledger">("create");

  // ── 发起调账表单 ──
  const [form, setForm] = useState({
    user_id: "",
    direction: "increase",
    amount: "",
    reason: "",
    subject: "充值退款",
    reference_no: "",
  });

  // ── 台账筛选 ──
  const [ledgerStatus, setLedgerStatus] = useState("");

  // ── 驳回原因输入（R7：两步弹窗承载摘要确认，本弹窗仅收集必填原因） ──
  const [rejectState, setRejectState] = useState<RejectState | null>(null);

  const ledgerQ = useQuery({
    queryKey: ["admin-adjust-ledger", ledgerStatus],
    queryFn: async () => (await api.get<{ data: { list: AdjustRecord[]; pagination: { total: number } } }>(`/admin/adjust/ledger?status=${ledgerStatus}&page_size=50`)).data.data,
    enabled: canAdjust,
  });
  const pendingQ = useQuery({
    queryKey: ["admin-adjust-pending"],
    queryFn: async () => (await api.get<{ data: { list: AdjustRecord[] } }>("/admin/adjust/pending?level=1")).data.data,
    enabled: canAdjust,
  });
  const pendingL2Q = useQuery({
    queryKey: ["admin-adjust-pending-l2"],
    queryFn: async () => (await api.get<{ data: { list: AdjustRecord[] } }>("/admin/adjust/pending?level=2")).data.data,
    enabled: canAdjust,
  });
  /** R5：三级终审队列（pending_super；仅 super_admin 可终审） */
  const pendingL3Q = useQuery({
    queryKey: ["admin-adjust-pending-l3"],
    queryFn: async () => (await api.get<{ data: { list: AdjustRecord[] } }>("/admin/adjust/pending?level=3")).data.data,
    enabled: canAdjust,
  });

  /** R6 硬限/2FA 错误码区分提示（R7 2FA 错误优先引导文案） */
  const adjustError = (e: any): string => {
    if (isOperation2faCanceled(e)) return "";
    const op2fa = operation2faErrorText(e);
    if (op2fa) return op2fa;
    const code = e?.response?.data?.code;
    if (e?.response?.status === 429 && code !== "OPERATION_2FA_LOCKED") {
      return "24h 累计超限，请明天再试或联系管理员（DAILY_LIMIT_EXCEEDED）";
    }
    return extractError(e);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      // R7 两步弹窗第二步操作摘要（创建时预占累计语义：提交即计入 24h 累计）
      const summary: OperationSummaryItem[] = [
        { label: "操作类型", value: "调账 · 发起" },
        { label: "用户", value: `用户ID ${form.user_id}` },
        { label: "方向", value: isIncrease ? "调增" : "调减" },
        { label: "金额", value: `¥${amount.toLocaleString()}`, highlight: true },
        { label: "科目", value: form.subject },
        { label: "审批级别", value: tierHint },
        {
          label: "限额提示",
          value: `提交即计入 24h 累计；累计调增/上账超 ¥${DAILY_SOFT_LIMIT.toLocaleString()} 将触发升级审批（已触发升级审批），超 ¥${DAILY_HARD_LIMIT.toLocaleString()} 将被拒绝（最终级别以后端定级为准）`,
          highlight: amount > 0 && adjustTier(form.direction, amount) === 1,
        },
      ];
      return withOperation2fa(async (ctx) => {
        return (await api.post("/admin/adjust", {
          user_id: Number(form.user_id),
          direction: form.direction,
          amount: Number(form.amount),
          reason: form.reason,
          subject: form.subject,
          reference_no: form.reference_no || undefined,
        }, { headers: operation2faHeaders(ctx) })).data;
      }, summary);
    },
    onSuccess: (d: { data?: { message?: string; approval_level?: number } }) => {
      // R5：创建响应新增 approval_level（1|2|3），免审消息仅白名单科目命中时出现
      const level = Number(d?.data?.approval_level);
      const levelMsg = level === 3 ? "已提交三级审批（super_admin 终审）" : level === 2 ? "已提交二级审批（双人复核）" : "已提交一级审批";
      toast.success(d?.data?.message ?? levelMsg);
      setForm({ user_id: "", direction: "increase", amount: "", reason: "", subject: "充值退款", reference_no: "" });
      qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] });
      qc.invalidateQueries({ queryKey: ["admin-adjust-pending"] });
      qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] });
      qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l3"] });
    },
    onError: (e) => { const m = adjustError(e); if (m) toast.error(m); },
  });

  const approveMut = useMutation({
    mutationFn: async ({ id, summary }: { id: number; summary: OperationSummaryItem[] }) => withOperation2fa(async (ctx) => {
      return (await api.post(`/admin/adjust/${id}/approve`, {}, { headers: operation2faHeaders(ctx) })).data;
    }, summary),
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "一级审批通过"); qc.invalidateQueries({ queryKey: ["admin-adjust-pending"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); },
    onError: (e) => { const m = adjustError(e); if (m) toast.error(m); },
  });
  const reviewMut = useMutation({
    mutationFn: async ({ id, summary }: { id: number; summary: OperationSummaryItem[] }) => withOperation2fa(async (ctx) => {
      return (await api.post(`/admin/adjust/${id}/review`, {}, { headers: operation2faHeaders(ctx) })).data;
    }, summary),
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "二级复核通过"); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l3"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); },
    onError: (e) => { const m = adjustError(e); if (m) toast.error(m); },
  });
  const rejectMut = useMutation({
    mutationFn: async ({ id, reason, summary }: { id: number; reason: string; summary: OperationSummaryItem[] }) => withOperation2fa(async (ctx) => {
      return (await api.post(`/admin/adjust/${id}/reject`, { reason }, { headers: operation2faHeaders(ctx) })).data;
    }, summary),
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已驳回"); setRejectState(null); qc.invalidateQueries({ queryKey: ["admin-adjust-pending"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l3"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); },
    onError: (e) => { const m = adjustError(e); if (m) toast.error(m); },
  });
  const reverseMut = useMutation({
    mutationFn: async ({ id, summary }: { id: number; summary: OperationSummaryItem[] }) => withOperation2fa(async (ctx) => {
      return (await api.post(`/admin/adjust/${id}/reverse`, {}, { headers: operation2faHeaders(ctx) })).data;
    }, summary),
    onSuccess: (d: { data?: { message?: string } }) => { toast.success(d?.data?.message ?? "已红冲"); qc.invalidateQueries({ queryKey: ["admin-adjust-ledger"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending"] }); qc.invalidateQueries({ queryKey: ["admin-adjust-pending-l2"] }); },
    onError: (e) => { const m = adjustError(e); if (m) toast.error(m); },
  });

  /** 驳回原因弹窗确认 → 带摘要进入 withOperation2fa */
  const confirmReject = () => {
    if (!rejectState) return;
    const reason = rejectState.reason.trim();
    if (!reason) { toast.error("请填写驳回原因"); return; }
    rejectMut.mutate({ id: rejectState.record.id, reason, summary: buildAdjustSummary(rejectState.record, "reject", reason) });
  };

  /* 无 finance.adjust 权限（如 finance 角色）：整页隐藏，不出现"能见不能点"的假入口 */
  if (!canAdjust) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          手动调账
          <HelpIcon text={PAGE_HELP} level="page" />
        </h2>
        <div style={card}>
          <EmptyState title="您暂无手动调账权限（finance.adjust）" description="调账仅限 admin / super_admin；如需要该能力，请联系管理员调整角色权限。" />
        </div>
      </div>
    );
  }

  const amount = Number(form.amount) || 0;
  const isIncrease = form.direction === "increase";
  const tier = adjustTier(form.direction, amount);
  const tierHint = tier === 3 ? "三级审批（super_admin 终审）" : tier === 2 ? "二级审批（双人复核）" : "一级审批（单审）";
  const canSubmit = Number(form.user_id) > 0 && amount > 0 && form.reason.trim() !== "";

  const rows = tab === "ledger"
    ? ledgerQ.data?.list ?? []
    : tab === "approve"
      ? [...(pendingQ.data?.list ?? []), ...(pendingL2Q.data?.list ?? []), ...(pendingL3Q.data?.list ?? [])]
      : [];

  /** 待我审批行当前阶段操作按钮（R5 按状态渲染；R7：点击即进入两步 2FA 弹窗） */
  const renderPendingActions = (r: AdjustRecord) => {
    const isSelf = currentUserId != null && r.requested_by === currentUserId;
    const approveBtn = (label: string, kind: "approve" | "review" | "super", color: string, help: string, disabled = false) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
        <button
          onClick={() => {
            const summary = buildAdjustSummary(r, kind);
            if (kind === "super") reviewMut.mutate({ id: r.id, summary });
            else if (kind === "review") reviewMut.mutate({ id: r.id, summary });
            else approveMut.mutate({ id: r.id, summary });
          }}
          disabled={disabled || isSelf}
          title={isSelf ? "您不能审批自己申请的单据（职责分离）" : undefined}
          style={{ ...btnBase, background: color, color: "#fff", padding: "4px 10px", fontSize: 12, opacity: disabled || isSelf ? 0.5 : 1, cursor: disabled || isSelf ? "not-allowed" : "pointer" }}
        >{label}</button>
        <HelpIcon text={help} />
      </span>
    );

    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        {r.status === "pending" && approveBtn("一级审批通过", "approve", "#22c55e", HELP_APPROVE_L1)}
        {r.status === "pending_level2" && approveBtn("二级复核通过", "review", "#4f6ef7", HELP_REVIEW_L2)}
        {r.status === "pending_super" && (
          isSuperAdmin
            ? approveBtn("终审通过", "super", "#722ed1", HELP_SUPER)
            : <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }} title="终审档需 super_admin 角色">仅 super_admin 可终审</span>
        )}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 6 }}>
          <button
            onClick={() => setRejectState({ record: r, reason: "" })}
            disabled={isSelf}
            title={isSelf ? "您不能驳回自己申请的单据（职责分离）" : undefined}
            style={{ ...btnBase, background: "var(--color-danger-text)", color: "#fff", padding: "4px 10px", fontSize: 12, opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
          >驳回</button>
          <HelpIcon text={HELP_REJECT} />
        </span>
        {r.approval_stalled === true && (
          <span style={{ fontSize: 12, color: "var(--color-danger-text)" }}>⚠️ 等待可用审批人</span>
        )}
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        手动调账
        <HelpIcon text={PAGE_HELP} level="page" />
      </h2>

      {/* 统计卡 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 16 }}>
        <div style={{ ...card, cursor: "pointer", marginBottom: 0 }} onClick={() => setTab("approve")}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>🕓 待我审批</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{(pendingQ.data?.list?.length ?? 0) + (pendingL2Q.data?.list?.length ?? 0) + (pendingL3Q.data?.list?.length ?? 0)}</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }} onClick={() => setTab("ledger")}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>📋 调账台账</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{ledgerQ.data?.pagination?.total ?? 0}</div>
        </div>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {([["create", "➕ 发起调账"], ["approve", "✅ 待我审批"], ["ledger", "📋 调账台账"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ ...btnBase, display: "inline-flex", alignItems: "center", gap: 4, background: tab === key ? "var(--color-primary)" : "var(--color-panel)", color: tab === key ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {label}
            {key === "create" && <HelpIcon text={HELP_CREATE_ADJUST} />}
            {key === "approve" && <HelpIcon text={HELP_PENDING_FILTER} />}
          </button>
        ))}
      </div>

      {/* Tab 1 发起调账 */}
      {tab === "create" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={card}>
            <h3 style={{ marginBottom: 12 }}>📝 调账申请单</h3>
            <div>
              <label style={fieldLabel}>被调账用户 ID *</label>
              <input type="number" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} placeholder="输入用户 ID" style={inp} />
            </div>
            <div>
              <label style={fieldLabel}>业务类型（会计科目）*</label>
              <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} style={inp}>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <label style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name="dir" checked={form.direction === "increase"} onChange={() => setForm({ ...form, direction: "increase" })} /> 调增
              </label>
              <label style={{ flex: 1, display: "flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
                <input type="radio" name="dir" checked={form.direction === "decrease"} onChange={() => setForm({ ...form, direction: "decrease" })} /> 调减
              </label>
            </div>
            <div>
              <label style={fieldLabel}>调账金额（元）*</label>
              <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" style={inp} />
            </div>
            <div>
              <label style={fieldLabel}>调账原因 *</label>
              <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="说明调账背景与依据，调减操作必须填写" style={{ ...inp, height: 72, resize: "vertical" }} />
            </div>
            <div>
              <label style={fieldLabel}>关联单号</label>
              <input value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} placeholder="工单 / 订单 / 退款单号" style={inp} />
            </div>
            {/* R5：调增免审取消 + 分级提示；R6：限额提示 */}
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.8 }}>
              ⚖️ 审批路径：<strong style={{ color: "#fa8c16" }}>{tierHint}</strong>
              {tier === 3 ? "（>¥100,000 追加 super_admin 终审）" : tier === 2 ? "（>¥10,000 双人复核）" : "（调增免审批已取消，至少一级审批）"}
              <div style={{ marginTop: 2 }}>
                💰 24h 累计调增/上账超 ¥{DAILY_SOFT_LIMIT.toLocaleString()} → 本笔升级双人审批；超 ¥{DAILY_HARD_LIMIT.toLocaleString()} → 拒绝
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
                  <HelpIcon text={HELP_LIMIT_ESCALATE} />
                </span>
              </div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => createMut.mutate()}
                disabled={!canSubmit || createMut.isPending}
                style={{ ...btnBase, width: "100%", background: canSubmit ? "var(--color-primary)" : "#a0b4f9", color: "#fff", height: 42, fontSize: 14 }}
              >
                {createMut.isPending ? "提交中..." : "🚀 提交调账申请"}
              </button>
              <HelpIcon text={HELP_CREATE_ADJUST} />
            </span>
          </div>

          <div style={card}>
            <h3 style={{ marginBottom: 12 }}>⚖️ 分级审批规则</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px" }}>方向</th><th style={{ padding: "6px 8px" }}>金额</th><th style={{ padding: "6px 8px" }}>审批要求</th>
              </tr></thead>
              <tbody>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调增</td><td style={{ padding: "6px 8px" }}>≤ ¥10,000</td><td style={{ padding: "6px 8px", color: "#fa8c16" }}>一级审批（单审；免审已取消）</td></tr>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调增</td><td style={{ padding: "6px 8px" }}>&gt; ¥10,000</td><td style={{ padding: "6px 8px", color: "#fa8c16" }}>二级审批（双人复核）</td></tr>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调增/调减</td><td style={{ padding: "6px 8px" }}>&gt; ¥100,000</td><td style={{ padding: "6px 8px", color: "#e53935" }}>三级审批（super_admin 终审）</td></tr>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调减</td><td style={{ padding: "6px 8px" }}>&lt; ¥10,000</td><td style={{ padding: "6px 8px", color: "#fa8c16" }}>一级审批（单审）</td></tr>
                <tr style={{ borderTop: "1px solid var(--color-border)" }}><td style={{ padding: "6px 8px" }}>调减</td><td style={{ padding: "6px 8px" }}>≥ ¥10,000（含恰 ¥10,000）</td><td style={{ padding: "6px 8px", color: "#e53935" }}>二级审批（双人复核，恰 ¥10,000 亦双人）</td></tr>
              </tbody>
            </table>
            <div style={{ marginTop: 14, fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
              <div>🔒 <strong>职责分离</strong>：申请人 ≠ 审批人，一级 ≠ 二级，系统自动拦截自审</div>
              <div>💰 <strong>24h 限额</strong>：操作人/被入账用户累计调增+上账超 ¥50,000 升级双人、超 ¥100,000 拒绝（R6）</div>
              <div>🔐 <strong>操作级 2FA</strong>：发起/审批/复核/终审/驳回/红冲均需 2FA + 二次确认（R7）</div>
              <div>📌 <strong>科目映射</strong>：每笔调账自动对应会计科目</div>
              <div>💾 <strong>前后快照</strong>：记录调账前 / 后余额，账实一致</div>
              <div>🔴 <strong>红字冲销</strong>：错误调账不删除不编辑，通过「红冲」生成反向记录</div>
              <div>📦 <strong>永久归档</strong>：调账记录不可篡改，随凭证永久留存</div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2 待我审批 */}
      {tab === "approve" && (
        <div style={card}>
          <h3 style={{ marginBottom: 12 }}>✅ 待我审批（职责分离：不含自己申请的；单审 / 待双人复核 / 待终审）</h3>
          {pendingQ.isLoading ? <SkeletonGroup lines={3} /> : rows.length === 0 ? (
            <EmptyState title="暂无待审批调账" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>用户</th><th style={{ padding: "8px" }}>方向</th><th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>科目</th><th style={{ padding: "8px" }}>原因</th><th style={{ padding: "8px" }}>阶段</th>
                <th style={{ padding: "8px" }}>申请时间</th><th style={{ padding: "8px" }}>操作</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px" }}><div style={{ fontWeight: 600 }}>{r.username || r.email}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email}</div></td>
                    <td style={{ padding: "8px" }}><span style={{ color: r.direction === "increase" ? "#22c55e" : "#e53935", fontWeight: 600 }}>{r.direction_label}</span></td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>¥{r.amount.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{r.subject}</td>
                    <td style={{ padding: "8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason}</td>
                    <td style={{ padding: "8px" }}>
                      <StatusBadge status={STATUS_MAP[r.status] ?? "default"}>{adjustStatusLabel(r)}</StatusBadge>
                      {r.approval_level === "level3" && <span style={{ fontSize: 11, color: "var(--color-text-secondary)", marginLeft: 4 }}>终审档</span>}
                    </td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{renderPendingActions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3 调账台账 */}
      {tab === "ledger" && (
        <div style={card}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>📋 调账台账</h3>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
              {([["", "全部"], ["approved", "已生效"], ["pending", "一级待审"], ["pending_level2", "二级待审"], ["pending_super", "待终审"], ["rejected", "已驳回"], ["reversed", "已红冲"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setLedgerStatus(v)} style={{ ...btnBase, fontSize: 12, padding: "4px 10px", background: ledgerStatus === v ? "var(--color-primary)" : "var(--color-bg)", color: ledgerStatus === v ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>{l}</button>
              ))}
            </div>
          </div>
          {ledgerQ.isLoading ? <SkeletonGroup lines={5} /> : rows.length === 0 ? (
            <EmptyState title="暂无调账记录" />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>ID</th><th style={{ padding: "8px" }}>用户</th><th style={{ padding: "8px" }}>方向</th><th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>科目</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>余额前→后</th>
                <th style={{ padding: "8px" }}>审批链</th><th style={{ padding: "8px" }}>时间</th><th style={{ padding: "8px" }}>操作</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>#{r.id}</td>
                    <td style={{ padding: "8px" }}>{r.username || r.email || `#${r.user_id}`}</td>
                    <td style={{ padding: "8px" }}><span style={{ color: r.direction === "increase" ? "#22c55e" : "#e53935", fontWeight: 600 }}>{r.direction_label}</span></td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>¥{r.amount.toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>{r.subject}</td>
                    <td style={{ padding: "8px" }}>
                      <StatusBadge status={STATUS_MAP[r.status] ?? "default"}>{adjustStatusLabel(r)}</StatusBadge>
                      {r.limit_escalated === true && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#fa8c16" }}>
                          累计超限·已升级 <HelpIcon text={HELP_LIMIT_ESCALATE} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>¥{r.balance_before.toFixed(2)} → ¥{r.balance_after.toFixed(2)}</td>
                    <td style={{ padding: "8px", fontSize: 11, color: "var(--color-text-secondary)" }}>{adjustChain(r)}</td>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "approved" && !r.reversed_by_id && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <button onClick={() => reverseMut.mutate({ id: r.id, summary: buildAdjustSummary(r, "reverse") })} disabled={reverseMut.isPending} style={{ ...btnBase, background: "#fff1f0", color: "#c62828", border: "1px solid #fca5a5", padding: "4px 10px", fontSize: 12 }}>红字冲销</button>
                          <HelpIcon text={HELP_REVERSE} />
                        </span>
                      )}
                      {r.reject_reason && <span style={{ fontSize: 11, color: "var(--color-danger-text)" }} title={r.reject_reason}>驳回</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 驳回原因输入弹窗（R7：摘要确认由两步 2FA 弹窗承载，本弹窗仅收集必填原因） ── */}
      <Modal open={!!rejectState} onClose={() => setRejectState(null)} title="驳回调账" width={420}>
        {rejectState && (
          <>
            <div style={{ fontSize: 13, lineHeight: 2, marginBottom: 8 }}>
              <div>调账：<strong>#{rejectState.record.id} {rejectState.record.direction_label} ¥{rejectState.record.amount.toLocaleString()} → {rejectState.record.username || rejectState.record.email || `#${rejectState.record.user_id}`}</strong></div>
              <div style={{ color: "var(--color-text-secondary)" }}>驳回后单据变为已驳回，不改变用户余额；驳回原因必填并落库。</div>
            </div>
            <textarea
              value={rejectState.reason}
              onChange={(e) => setRejectState({ ...rejectState, reason: e.target.value })}
              placeholder="驳回原因（必填）"
              rows={3}
              style={inp}
            />
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "var(--color-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 14 }}>
              确认后进入操作级 2FA 两步验证：① 身份验证 → ② 操作摘要确认执行。
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setRejectState(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button
                onClick={confirmReject}
                disabled={!rejectState.reason.trim() || rejectMut.isPending}
                style={{ ...btnBase, background: "var(--color-danger-text)", color: "#fff" }}
              >
                {rejectMut.isPending ? "提交中..." : "确认驳回"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
