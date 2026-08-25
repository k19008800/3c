import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { usePerm } from "../lib/permissions";
import { useAuthStore } from "../store/auth";
import { withOperation2fa, isOperation2faCanceled, operation2faErrorText, operation2faHeaders } from "../lib/operation-2fa";
import type { OperationSummaryItem } from "../components/Operation2faModal";
import { parseApproval, approvalChainSegments } from "../lib/approval";
import { HelpIcon, StatusBadge, Modal, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface ManualTopup {
  id: number; user_id: number; username: string; email: string;
  amount: number; evidence_url: string | null; evidence_remark: string | null;
  status: string; status_label: string; review_note: string | null;
  transfer_no: string | null; reviewer_id: number | null; created_at: string;
  /* R5 增量字段（ARCH §2.5.4；后端未返回时为 undefined，防御式解析） */
  approval_level?: number;
  approval_phase?: string;
  first_reviewer_id?: number | null;
  second_reviewer_id?: number | null;
  super_reviewer_id?: number | null;
  approval_stalled?: boolean;
  created_by?: number | null;
  metadata?: unknown;
}

/** GET /admin/manual-topup/users 搜索结果（ARCH §12.4 D1 专用轻量端点；snake_case 字段） */
interface CustomerOption {
  id: number;
  email: string;
  name: string | null;
  status: string;
  available_balance: number;
}

interface ReviewState {
  id: number;
  action: "approve" | "reject";
  note: string;
  /** R5：当前审批阶段（用于弹窗展示下一环节语义） */
  phase?: string;
  level?: number;
  /** R7 两步弹窗第二步的操作摘要（点击时由行数据构造） */
  summary?: OperationSummaryItem[];
}

interface TopupFormState {
  /** 用户选择方式：搜索选择 / 直接输入用户 ID */
  userMode: "search" | "id";
  searchKw: string;
  user: CustomerOption | null;
  directUserId: string;
  /** 入账类型（A6 裁决：仅前端提示，不传后端） */
  topupType: "bank_transfer" | "grant";
  amount: string;
  note: string;
  transferNo: string;
}

/* ============ 常量 ============ */
/** 人工上账单笔上限（双签裁决 B3/Q9：50,000 → 1,000,000；>¥50,000 由多级审批承接） */
const MANUAL_TOPUP_MAX_AMOUNT = 1000000;
/** R6 限额（双签裁决 B5/B6：soft=50,000 / hard=100,000，24h 累计，操作人/被入账用户同值） */
const DAILY_SOFT_LIMIT = 50000;
const DAILY_HARD_LIMIT = 100000;
/** R5 分级阈值（双签裁决 B1/B7，对齐 ARCH §2.2 默认配置） */
const TIER2_THRESHOLD = 10000;
const TIER3_THRESHOLD = 100000;

const EMPTY_FORM: TopupFormState = {
  userMode: "search",
  searchKw: "",
  user: null,
  directUserId: "",
  topupType: "bank_transfer",
  amount: "",
  note: "",
  transferNo: "",
};

/* PRD §8 按钮级帮助对照表（P1 不可降级；文案随 R5 分级/限额/2FA 更新） */
const HELP_CREATE = "为指定用户创建人工上账订单：对公到账需上传凭证并填写转账单号；提交后按金额进入对应审批环节（≤¥10,000 单审、>¥10,000 双人复核、>¥100,000 追加 super_admin 终审），审核通过前不改变用户余额；资金写操作需操作级 2FA + 二次确认";
const HELP_USER_SEARCH = "按邮箱 / 手机号 / 用户ID 搜索并选中目标用户；选中后展示邮箱、名称、当前余额与账户状态，禁用/冻结用户需先解锁";
const HELP_TYPE_BANK = "用于线下/对公转账已到账的入账：凭证与转账单号必填，防止重复入账";
const HELP_TYPE_GRANT = "用于平台赠送 / 补偿 / 纠错 / 客服补单：凭证与转账单号选填，入账原因必填";
const HELP_AMOUNT = "单笔入账金额，最低 ¥0.01、最高 ¥1,000,000；>¥10,000 进入多人审批，>¥100,000 需 super_admin 终审（大额入账将进入多级审批）；24h 累计入账超 ¥50,000 将触发升级审批，最多保留 2 位小数";
const HELP_BALANCE_PREVIEW = "按当前所选用户余额 + 输入金额实时计算入账后的可用余额，供提交前核对";
const HELP_EVIDENCE = "上传对公到账凭证/回单截图，仅支持 JPG/PNG/PDF，大小不超过 5MB";
const HELP_TRANSFER_NO = "银行转账流水号；对公到账必填且全平台唯一，同一单号不可重复上账";
const HELP_CONFIRM = "校验通过后提交（资金写操作），进入操作级 2FA 两步验证：① 输入 TOTP/备用码验证身份 → ② 核对操作摘要后确认执行";
const HELP_APPROVE_L1 = "一级审批：单审档通过即入账；双人/终审档通过后进入下一环节（待双人复核/待终审），不会立即入账；审批人不能是创建人";
const HELP_APPROVE_L2 = "二级复核：双人档在此环节通过后入账生效；审批人不能与一级审批人相同";
const HELP_APPROVE_L2_T3 = "二级复核：通过后进入 super 终审环节，不会立即入账；审批人不能与一级审批人相同";
const HELP_APPROVE_SUPER = "终审通过（super_admin）：终审档（>¥100,000）的最终确认，通过后入账生效；终审人不能是前两级审批人或创建人";
const HELP_REJECT = "驳回：拒绝该单据，必须填写驳回原因；单据变为已驳回，不改变用户余额（任意审批阶段均可驳回）";
const HELP_RESET = "清空当前发起上账表单的全部填写内容，恢复默认状态";
const HELP_STALLED = "等待可用审批人：当前阶段无持有对应权限且可审批的操作者（已排除创建人与已审人），单据滞留该环节；请联系管理员或 super_admin 兜底代审";
const HELP_LIMIT_ESCALATE = "限额升级提示：说明本笔因 24h 累计超限（¥50,000）被升级为双人审批的原因与累计金额";

/* PRD §7 页面帮助（pageKey: finance-manual-topup；随 R5/R6/R7 更新；ARCH §10 双签裁决为权威口径） */
const PAGE_HELP = [
  "【功能定位】管理员/财务为指定用户账户进行资金入账。线下/对公转账已到账的，凭凭证走「人工上账」；平台赠送/补偿/纠错的，走「手动调账」。全过程分级审批、双因素认证、二次确认、留痕可冲正。",
  "",
  "【核心操作】",
  "1. 搜索用户（邮箱 / 手机号 / 用户ID）→ 核对状态与当前余额",
  "2. 点击「发起上账」→ 选择入账类型（对公到账 / 平台赠送）→ 填写金额、原因、转账单号 → 二次确认 + 操作级 2FA → 提交",
  "3. 待审核列表 → 按金额进入对应审批环节：≤¥10,000 单审；>¥10,000 双人复核；>¥100,000 追加 super_admin 终审",
  "4. 审核通过（最终环节）→ 入账 → 用户收到到账通知；驳回 → 填写原因",
  "",
  "【注意事项】",
  "- 发起/审核均为资金写操作，后端强制 2FA + 二次确认（身份验证结果 5 分钟内有效）",
  "- 审批人不能审批自己发起的单据（职责分离）；一级与二级审批不能为同一人；终审人不能是前两级审批人或创建人",
  "- 操作人/被入账用户 24h 累计入账超过 ¥50,000 后，后续入账升级为双人审批；累计超过 ¥100,000 将被拒绝",
  "- 单笔人工上账不超过 ¥1,000,000；大额入账将进入多级审批",
  "- 对公到账需填写转账单号；同一转账单号不可重复入账（凭证上传功能后续版本开放）",
  "- 错误入账通过红字冲销纠正，禁止直接修改/删除",
  "- 所有入账写资金流水与审计日志，用户收到站内信（必发）",
  "",
  "【常见问题】",
  "Q: 为什么审核按钮被禁用并提示\"不能审批自己发起的单据\"？",
  "A: 平台强制职责分离：创建人/申请人不能审批自己发起的单据，请由其他持有财务权限的操作者审批。",
  "Q: 提示\"待双人复核\"是什么意思？",
  "A: 该单据金额超过 ¥10,000，一级审批已通过，需另一名审批人（不能是一级审批人本人）完成二级复核后才能入账。",
  "Q: 提交时提示\"将升级为双人审批\"？",
  "A: 您 24 小时内累计调增/上账已超过 ¥50,000 限额，本笔自动升级为双人审批以控制拆分风险。",
  "Q: 输入验证码后提示\"身份验证已过期\"？",
  "A: 操作级 2FA 验证结果 5 分钟内有效，超时需重新输入验证码。",
  "Q: 提示\"等待可用审批人\"？",
  "A: 当前阶段无持有对应权限且可审批的操作者（已排除创建人与已审人），单据滞留该环节；请联系管理员或 super_admin 兜底代审。",
].join("\n");

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const fieldLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 };
const dangerText: React.CSSProperties = { fontSize: 12, color: "var(--color-danger-text)", marginBottom: 8 };
const hintText: React.CSSProperties = { fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.6 };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
};

/** R5 审批阶段徽标配色 */
const PHASE_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  level1_pending: "warning",
  level2_pending: "info",
  super_pending: "default",
  approved: "success",
  rejected: "danger",
};

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待审核" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
];

/* ============ 工具函数 ============ */

/** 用户状态中文文案（选择器回显用） */
function userStatusLabel(status: string): string {
  switch (status) {
    case "active": return "正常";
    case "disabled": return "已禁用";
    case "frozen": return "已冻结";
    case "banned": return "已封禁";
    default: return status || "—";
  }
}

/** 幂等键生成：优先 crypto.randomUUID()（ARCH §3.4 约定由前端生成），非安全上下文降级 */
function genIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 单据创建人解析：顶层 created_by > metadata.created_by（A8 先例） */
function orderCreatedBy(r: ManualTopup): number | null {
  if (typeof r.created_by === "number") return r.created_by;
  const meta = r.metadata;
  if (meta && typeof meta === "object") {
    const v = (meta as Record<string, unknown>).created_by;
    if (typeof v === "number") return v;
    const n = Number(v);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

/** 金额 → 审批级别（前端镜像，供表单/确认弹窗提示；最终以后端定级为准） */
function tierByAmount(amount: number): 1 | 2 | 3 {
  if (amount > TIER3_THRESHOLD) return 3;
  if (amount > TIER2_THRESHOLD) return 2;
  return 1;
}

/** 创建接口错误码 → 前端文案（对齐 ARCH §2.5.2 / R6 限额错误码表） */
function manualTopupError(err: any): string {
  const status: number | undefined = err?.response?.status;
  const msg: string = extractError(err);
  const code: string | undefined = err?.response?.data?.code;
  // R7：2FA 相关错误优先展示引导文案（避免被通用 403 分支误读为权限不足）
  const op2fa = operation2faErrorText(err);
  if (op2fa) return op2fa;
  if (status === 403) return "无权执行该操作，请联系管理员（PERMISSION_DENIED）";
  if (status === 404) return "用户不存在，请重新搜索";
  if (status === 409) return "请勿重复提交：该请求已处理或该转账单号已存在上账记录";
  if (status === 429) {
    // R6 硬限拒绝（429 DAILY_LIMIT_EXCEEDED）；2FA 锁定（OPERATION_2FA_LOCKED）原样提示
    if (code === "OPERATION_2FA_LOCKED") return msg;
    return "24h 累计超限，请明天再试或联系管理员（DAILY_LIMIT_EXCEEDED）";
  }
  if (status === 400) return `提交未通过校验：${msg}`;
  return msg;
}

/** 校验表单（字段级错误映射，文案对齐 PRD §3.1.3 C1–C9） */
function validateForm(form: TopupFormState): Record<string, string> {
  const errs: Record<string, string> = {};

  const userId = form.userMode === "search" ? form.user?.id : Number(form.directUserId);
  if (form.userMode === "search" && !form.user) {
    errs.user = "请搜索并选择目标用户";
  } else if (form.userMode === "id" && (!form.directUserId.trim() || !Number.isInteger(userId) || (userId ?? 0) <= 0)) {
    errs.user = "请输入有效的用户 ID（正整数）";
  }
  if (form.user && form.user.status !== "active") {
    errs.user = "该用户处于禁用/冻结状态，请先在用户管理中解锁后再上账";
  }

  const amountText = form.amount.trim();
  const amount = Number(amountText);
  if (!amountText) {
    errs.amount = "请输入入账金额";
  } else if (!/^\d+(\.\d{1,2})?$/.test(amountText)) {
    errs.amount = "金额最多保留 2 位小数";
  } else if (amount <= 0) {
    errs.amount = "入账金额必须大于 0";
  } else if (amount > MANUAL_TOPUP_MAX_AMOUNT) {
    errs.amount = `单笔上账金额不得超过 ¥${MANUAL_TOPUP_MAX_AMOUNT.toLocaleString()}；大额入账将进入多级审批（>¥10,000 双人审批、>¥100,000 追加 super_admin 终审）`;
  }

  const note = form.note.trim();
  if (!note) {
    errs.note = "请填写入账原因（对公到账请注明核实说明）";
  } else if (note.length > 500) {
    errs.note = "入账原因不能超过 500 字";
  }

  if (form.transferNo.trim() && form.transferNo.trim().length > 100) {
    errs.transferNo = "转账单号不能超过 100 个字符";
  }

  return errs;
}

/** 审核弹窗的阶段提示（R5：按当前阶段说明通过后的去向） */
function reviewStageHint(phase: string | undefined, level: number | undefined, action: "approve" | "reject"): string {
  if (action === "reject") {
    return "请填写驳回原因；驳回后单据变为已驳回，不改变用户余额（任意审批阶段均可驳回）。";
  }
  switch (phase) {
    case "level2_pending":
      return level === 3
        ? "二审通过后单据进入 super 终审环节，不会立即入账（审批人不能与一审人相同）。"
        : "二级复核通过后入账生效（双人档）。审批人不能与一级审批人相同。";
    case "super_pending":
      return "super_admin 终审通过后入账生效。终审人不能是前两级审批人或创建人。";
    default:
      if (level === 3) return "一级审批通过后单据进入待二审，不会立即入账。";
      if (level === 2) return "一级审批通过后单据进入待二级复核，不会立即入账。";
      return "确认后金额将立即入账到客户账户（单审档）。";
  }
}

/** 审核操作摘要（R7 两步弹窗第二步展示） */
function buildReviewSummary(r: ManualTopup, info: ReturnType<typeof parseApproval>, createdBy: number | null, action: "approve" | "reject", phase: string | undefined): OperationSummaryItem[] {
  const actionLabel = action === "reject"
    ? "人工上账 · 驳回"
    : phase === "level2_pending" ? (info.level === 3 ? "人工上账 · 二审通过" : "人工上账 · 二级复核通过")
      : phase === "super_pending" ? "人工上账 · super 终审通过"
        : "人工上账 · 一审通过";
  const rows: OperationSummaryItem[] = [
    { label: "操作类型", value: actionLabel },
    { label: "用户", value: r.username || r.email },
    { label: "金额", value: `¥${r.amount.toFixed(2)}`, highlight: true },
    { label: "当前阶段", value: info.phaseLabel || "待审核" },
  ];
  const chain = approvalChainSegments(info, { createdBy }).join(" → ");
  if (chain) rows.push({ label: "审批人链", value: chain });
  rows.push({ label: "审批去向", value: reviewStageHint(phase, info.level, action) });
  return rows;
}

export default function AdminManualRechargePage() {
  const canTopup = usePerm("finance.topup");
  const qc = useQueryClient();
  const { toast } = useToast();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const [status, setStatus] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);

  /* ── 发起上账表单状态 ── */
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<TopupFormState>(EMPTY_FORM);
  const [candidates, setCandidates] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [transferNoTouched, setTransferNoTouched] = useState(false);

  const q = useQuery({
    queryKey: ["admin-manual-topup", status],
    queryFn: async () => (await api.get<{ data: { list: ManualTopup[]; pagination: { total: number } } }>(`/admin/manual-topup?status=${status}&page_size=50`)).data.data,
    enabled: canTopup,
  });

  const reviewMut = useMutation({
    mutationFn: async () => withOperation2fa(async (ctx) => {
      return (await api.post(`/admin/manual-topup/${review?.id}/review`, { action: review?.action, note: review?.note }, { headers: operation2faHeaders(ctx) })).data;
    }, review?.summary),
    onSuccess: (d: any) => {
      // R5 多阶段：一审/二审通过后 status 仍 pending，按响应 phase 提示下一环节
      const data = d?.data ?? {};
      if (data.approval_phase === "level2_pending") {
        toast.success(data.message ?? "一级审批通过，等待二级审批");
      } else if (data.approval_phase === "super_pending") {
        toast.success(data.message ?? "二级审批通过，等待 super 终审");
      } else {
        toast.success(data?.message ?? "审核完成");
      }
      setReview(null);
      qc.invalidateQueries({ queryKey: ["admin-manual-topup"] });
    },
    onError: (e) => {
      if (isOperation2faCanceled(e)) return;
      toast.error(extractError(e));
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      const userId = form.userMode === "search" ? form.user!.id : Number(form.directUserId);
      const body: Record<string, unknown> = {
        user_id: userId,
        amount: Number(form.amount),
        note: form.note.trim(),
      };
      if (form.transferNo.trim()) body.transfer_no = form.transferNo.trim();
      // ARCH §3.4：幂等键由前端生成（crypto.randomUUID()），随请求头发送；
      // 2FA 两步验证确认后重放时复用同一幂等键（探测轮被 2FA 中间件拦截，未进入业务处理）
      const idemKey = genIdempotencyKey();
      // R7 两步弹窗第二步操作摘要（PRD §3.3.4）
      const summary: OperationSummaryItem[] = [
        { label: "操作类型", value: "人工上账 · 发起" },
        { label: "用户", value: userDisplay },
        { label: "入账类型", value: form.topupType === "bank_transfer" ? "对公到账" : "平台赠送" },
        { label: "金额", value: `¥${amountNum.toFixed(2)}`, highlight: true },
        { label: "到账后余额", value: previewBalance != null ? `¥${previewBalance.toFixed(2)}` : "以系统校验为准" },
        { label: "审批级别", value: tierHint },
        { label: "限额提示", value: amountNum > DAILY_SOFT_LIMIT ? `大额入账将进入多级审批；24h 累计超 ¥${DAILY_SOFT_LIMIT.toLocaleString()} 将触发升级审批（最终级别以后端定级为准）` : `24h 累计超 ¥${DAILY_SOFT_LIMIT.toLocaleString()} 将触发升级审批`, highlight: amountNum > DAILY_SOFT_LIMIT },
      ];
      return withOperation2fa(async (ctx) => {
        return (await api.post("/admin/manual-topup", body, { headers: operation2faHeaders(ctx, { "Idempotency-Key": idemKey }) })).data;
      }, summary);
    },
    onSuccess: (d: any) => {
      // R5：创建响应新增 approval_level / approval_phase / message（ARCH §2.5.1）
      const data = d?.data ?? {};
      const level = Number(data.approval_level);
      const escalated = data.escalated === true || data.limit_check?.escalated === true;
      const baseMsg = typeof data.message === "string" && data.message
        ? data.message
        : (Number.isInteger(level) && level >= 2 ? "上账申请已创建，已进入多级审批" : "上账申请已创建，待审核");
      if (escalated) {
        toast.warning(`已触发升级审批：24h 累计超限，本笔升级为双人审批。${baseMsg}`);
      } else {
        toast.success(baseMsg);
      }
      setFormOpen(false);
      resetForm();
      qc.invalidateQueries({ queryKey: ["admin-manual-topup"] });
    },
    onError: (e) => {
      if (isOperation2faCanceled(e)) return;
      toast.error(manualTopupError(e));
    },
  });

  /* 用户搜索：防抖 300ms 调 D1 专用端点 /admin/manual-topup/users?search=（邮箱/用户ID/手机号；requirePerm('finance.topup')） */
  useEffect(() => {
    if (form.userMode !== "search") return;
    const kw = form.searchKw.trim();
    if (!kw) { setCandidates([]); setSearching(false); setSearchError(null); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data: { list: CustomerOption[] } }>(`/admin/manual-topup/users?search=${encodeURIComponent(kw)}&page_size=10`);
        setCandidates(res.data.data.list ?? []);
        setSearchError(null);
      } catch (e: any) {
        setCandidates([]);
        // 该端点 requirePerm('finance.topup')；其他无权限角色访问仍会 403，引导直接输入用户 ID
        if (e?.response?.status === 403) {
          setSearchError("当前角色暂无法使用用户搜索服务，请切换「直接输入用户 ID」选择用户（提交时系统将校验用户存在性与账户状态）。");
        } else {
          setSearchError(extractError(e));
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [form.searchKw, form.userMode]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setCandidates([]);
    setSearchError(null);
    setFieldErrors({});
    setFormError(null);
    setTransferNoTouched(false);
  };

  const openForm = () => { resetForm(); setFormOpen(true); };

  const selectUser = (c: CustomerOption) => {
    setForm((f) => ({ ...f, user: c }));
    setFieldErrors((e) => ({ ...e, user: "" }));
    setFormError(null);
  };

  const switchUserMode = () => {
    setForm((f) => ({ ...f, userMode: f.userMode === "search" ? "id" : "search", user: null, directUserId: "", searchKw: "" }));
    setCandidates([]);
    setFieldErrors((e) => ({ ...e, user: "" }));
  };

  const handlePrimarySubmit = () => {
    const errs = validateForm(form);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError("请修正表单中的错误项后再提交");
      return;
    }
    setFormError(null);
    // 校验通过 → 直接进入资金写操作（withOperation2fa 弹两步弹窗：① 2FA 验证 → ② 摘要确认）
    submitMut.mutate();
  };

  /* 到账后余额预览：仅搜索选择用户且有合法金额时计算（直接输入 ID 无余额数据） */
  const amountNum = Number(form.amount) || 0;
  const amountValid = /^\d+(\.\d{1,2})?$/.test(form.amount.trim());
  const baseBalance = form.userMode === "search" ? (form.user?.available_balance ?? null) : null;
  const previewBalance = baseBalance != null && amountValid && amountNum > 0 ? baseBalance + amountNum : null;

  /* 表单实时审批路径提示（R5/R6 前端镜像，最终以后端定级为准） */
  const amountTier = amountValid && amountNum > 0 ? tierByAmount(amountNum) : null;
  const tierHint = amountTier === 3 ? "三级审批（super_admin 终审）" : amountTier === 2 ? "双人审批" : "单审";

  const userDisplay = form.userMode === "search"
    ? form.user ? `${form.user.email} · ${form.user.name ?? "-"} · 用户ID ${form.user.id}` : "未选择"
    : form.directUserId.trim() ? `用户ID ${form.directUserId.trim()}` : "未选择";

  if (!canTopup) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          ✋ 人工上账
          <HelpIcon text={PAGE_HELP} level="page" />
        </h2>
        <div style={card}>
          <EmptyState title="您暂无人工上账操作权限（finance.topup）" description="如需要该能力，请联系管理员为您分配财务权限。" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        ✋ 人工上账
        <HelpIcon text={PAGE_HELP} level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {canTopup && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button onClick={openForm} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>发起上账</button>
              <HelpIcon text={HELP_CREATE} />
            </span>
          )}
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>共 {q.data?.pagination?.total ?? 0} 条</span>
        </span>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={6} /> : q.isError ? (
          <EmptyState title="列表加载失败" description={extractError(q.error)} />
        ) : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无上账申请" />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>申请时间</th>
                <th style={{ padding: "8px" }}>客户</th>
                <th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>凭证</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>审批进度</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(q.data?.list ?? []).map((r) => {
                const info = parseApproval(r);
                const createdBy = orderCreatedBy(r);
                const isSelf = createdBy != null && currentUserId != null && createdBy === currentUserId;
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{r.username || r.email}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email}</div>
                    </td>
                    <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-success-text)" }}>¥{r.amount.toFixed(2)}</td>
                    <td style={{ padding: "8px" }}>
                      {r.evidence_url ? <a href={r.evidence_url} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)" }}>查看凭证</a> : <span style={{ color: "var(--color-text-secondary)" }}>-</span>}
                    </td>
                    <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[r.status] ?? "warning"}>{r.status_label}</StatusBadge></td>
                    {/* R5：审批进度列（当前阶段 + 级别 + 审批人链） */}
                    <td style={{ padding: "8px", minWidth: 170 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <StatusBadge status={PHASE_BADGE[info.phase] ?? "default"}>{info.phaseLabel || "待审核"}</StatusBadge>
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{info.levelLabel}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                        {approvalChainSegments(info, { createdBy }).join(" → ")}
                      </div>
                      {info.escalated && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#fa8c16", marginTop: 2 }}>
                          累计超限·已升级 <HelpIcon text={HELP_LIMIT_ESCALATE} />
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "pending" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {info.phase === "level1_pending" && (
                              <>
                                <button
                                  onClick={() => setReview({ id: r.id, action: "approve", note: "", phase: info.phase, level: info.level, summary: buildReviewSummary(r, info, createdBy, "approve", info.phase) })}
                                  disabled={isSelf}
                                  title={isSelf ? "您不能审批自己发起的单据（职责分离）" : undefined}
                                  style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", padding: "4px 10px", opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
                                >一审通过</button>
                                <HelpIcon text={HELP_APPROVE_L1} />
                              </>
                            )}
                            {info.phase === "level2_pending" && (
                              <>
                                <button
                                  onClick={() => setReview({ id: r.id, action: "approve", note: "", phase: info.phase, level: info.level, summary: buildReviewSummary(r, info, createdBy, "approve", info.phase) })}
                                  disabled={isSelf}
                                  title={isSelf ? "您不能审批自己发起的单据（职责分离）" : undefined}
                                  style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", padding: "4px 10px", opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
                                >二审通过</button>
                                <HelpIcon text={info.level === 3 ? HELP_APPROVE_L2_T3 : HELP_APPROVE_L2} />
                              </>
                            )}
                            {info.phase === "super_pending" && (
                              isSuperAdmin ? (
                                <>
                                  <button
                                    onClick={() => setReview({ id: r.id, action: "approve", note: "", phase: info.phase, level: info.level, summary: buildReviewSummary(r, info, createdBy, "approve", info.phase) })}
                                    disabled={isSelf}
                                    title={isSelf ? "您不能审批自己发起的单据（职责分离）" : undefined}
                                    style={{ ...btnBase, background: "#722ed1", color: "#fff", padding: "4px 10px", opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
                                  >终审通过</button>
                                  <HelpIcon text={HELP_APPROVE_SUPER} />
                                </>
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }} title="终审档需 super_admin 角色">仅 super_admin 可终审</span>
                              )
                            )}
                            <button
                              onClick={() => setReview({ id: r.id, action: "reject", note: "", phase: info.phase, level: info.level, summary: buildReviewSummary(r, info, createdBy, "reject", info.phase) })}
                              disabled={isSelf}
                              title={isSelf ? "您不能驳回自己发起的单据（职责分离）" : undefined}
                              style={{ ...btnBase, background: "var(--color-danger-bg)", color: "var(--color-danger-text)", padding: "4px 10px", opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
                            >驳回</button>
                            <HelpIcon text={HELP_REJECT} />
                          </div>
                          {/* R5 审批人不足滞留提示（ARCH §2.7 fail-closed + 前端提示） */}
                          {info.stalled && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-danger-text)" }}>
                              ⚠️ 等待可用审批人 <HelpIcon text={HELP_STALLED} />
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.status === "approved" ? "已入账" : r.review_note ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── 发起上账表单弹窗 ── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="发起上账" width={560}>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 14, lineHeight: 1.7 }}>
          为指定用户创建人工上账订单，提交后按金额进入对应审批环节（≤¥10,000 单审、&gt;¥10,000 双人复核、&gt;¥100,000 追加 super_admin 终审），审核通过前不改变用户余额。
        </div>

        {/* 用户选择器 */}
        <label style={fieldLabel}>目标用户 <HelpIcon text={HELP_USER_SEARCH} /> *</label>
        {form.userMode === "search" ? (
          <>
            <input
              value={form.searchKw}
              onChange={(e) => setForm((f) => ({ ...f, searchKw: e.target.value, user: null }))}
              placeholder="搜索邮箱 / 手机号 / 用户ID..."
              style={inp}
            />
            {searching && <div style={hintText}>搜索中...</div>}
            {searchError && <div style={{ ...dangerText, background: "var(--color-danger-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 8 }}>{searchError}</div>}
            {!form.user && candidates.length > 0 && (
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, maxHeight: 170, overflowY: "auto", marginBottom: 10 }}>
                {candidates.map((c) => (
                  <div key={c.id} onClick={() => selectUser(c)} style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--color-border)" }}>
                    <div>{c.email} · {c.name ?? "-"}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>用户ID {c.id} · 当前余额 ¥{c.available_balance.toFixed(2)} · {userStatusLabel(c.status)}</div>
                  </div>
                ))}
              </div>
            )}
            {form.user && (
              <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 13 }}>✅ {form.user.email} · {form.user.name ?? "-"}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
                  用户ID {form.user.id} · 当前余额 ¥{form.user.available_balance.toFixed(2)} · {userStatusLabel(form.user.status)}
                </div>
                <button onClick={() => setForm((f) => ({ ...f, user: null }))} style={{ ...btnBase, background: "transparent", color: "var(--color-primary)", fontSize: 12, padding: "2px 0", marginTop: 4 }}>更换用户</button>
              </div>
            )}
            {form.user && form.user.status !== "active" && (
              <div style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-text)", fontSize: 13, padding: "8px 10px", borderRadius: 8, marginBottom: 8 }}>
                ⚠️ 该用户处于禁用/冻结状态，请先在用户管理中解锁后再上账（提交将被拦截）
              </div>
            )}
          </>
        ) : (
          <>
            <input
              type="number"
              min={1}
              value={form.directUserId}
              onChange={(e) => setForm((f) => ({ ...f, directUserId: e.target.value }))}
              placeholder="输入用户 ID（正整数）"
              style={inp}
            />
            <div style={hintText}>直接输入用户 ID 时无法展示余额/状态，提交时系统将校验用户存在性与账户状态（404 用户不存在 / 400 冻结用户将被拒绝）。</div>
          </>
        )}
        <div style={{ marginBottom: 10 }}>
          <span onClick={switchUserMode} style={{ fontSize: 12, color: "var(--color-primary)", cursor: "pointer" }}>
            {form.userMode === "search" ? "改用用户 ID 直接选择" : "改用搜索选择用户"}
          </span>
        </div>
        {fieldErrors.user && <div style={dangerText}>{fieldErrors.user}</div>}

        {/* 入账类型（A6 裁决：仅前端提示，不传后端） */}
        <label style={fieldLabel}>入账类型 *</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name="topupType" checked={form.topupType === "bank_transfer"} onChange={() => setForm((f) => ({ ...f, topupType: "bank_transfer" }))} /> 对公到账
          </label>
          <HelpIcon text={HELP_TYPE_BANK} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
            <input type="radio" name="topupType" checked={form.topupType === "grant"} onChange={() => setForm((f) => ({ ...f, topupType: "grant" }))} /> 平台赠送（赠送·补偿·纠错）
          </label>
          <HelpIcon text={HELP_TYPE_GRANT} />
        </div>

        {/* 凭证占位（R9 后置：不实现上传，仅提示） */}
        <div style={{ ...hintText, background: "var(--color-bg)", padding: "8px 10px", borderRadius: 8 }}>
          📎 凭证上传 <HelpIcon text={HELP_EVIDENCE} />：对公到账凭证（JPG/PNG/PDF，≤5MB）上传将在后续版本开放（R9）。本期请填写转账单号，由后端校验唯一性。
        </div>

        {/* 转账单号 */}
        <label style={fieldLabel}>转账单号 <HelpIcon text={HELP_TRANSFER_NO} /> {form.topupType === "bank_transfer" ? "（对公到账建议填写）" : "（选填）"}</label>
        <input
          value={form.transferNo}
          onChange={(e) => setForm((f) => ({ ...f, transferNo: e.target.value }))}
          onBlur={() => setTransferNoTouched(true)}
          placeholder="银行转账流水号（≤100 字符）"
          style={inp}
        />
        {transferNoTouched && form.transferNo.trim() && (
          <div style={hintText}>已填写转账单号：提交时系统将校验其全平台唯一性（后端兜底），重复创建将被拒绝，请核实是否重复入账。</div>
        )}
        {fieldErrors.transferNo && <div style={dangerText}>{fieldErrors.transferNo}</div>}

        {/* 入账金额 */}
        <label style={fieldLabel}>入账金额（CNY）<HelpIcon text={HELP_AMOUNT} /> *</label>
        <input
          type="number"
          min="0.01"
          max={MANUAL_TOPUP_MAX_AMOUNT}
          step="0.01"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          placeholder="单笔最高 ¥1,000,000；>¥10,000 进入多人审批，>¥100,000 需 super_admin 终审"
          style={inp}
        />
        {/* R5/R6：实时审批路径提示 */}
        {amountValid && amountNum > 0 && (
          <div style={{ fontSize: 12, color: "#fa8c16", marginBottom: 6, lineHeight: 1.6 }}>
            ⚖️ 本笔审批路径：<strong>{tierHint}</strong>
            {amountTier === 3 ? "（>¥100,000 追加 super_admin 终审）" : amountTier === 2 ? "（>¥10,000 双人审批）" : "（≤¥10,000 单审）"}
            <div style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>
              24h 累计入账超 ¥{DAILY_SOFT_LIMIT.toLocaleString()} 将触发升级审批，累计超 ¥{DAILY_HARD_LIMIT.toLocaleString()} 将被拒绝
            </div>
          </div>
        )}
        <div style={hintText}>
          到账后余额预览 <HelpIcon text={HELP_BALANCE_PREVIEW} />：
          {previewBalance != null ? `¥${previewBalance.toFixed(2)}` : "选择用户并输入有效金额后展示"}
        </div>
        {fieldErrors.amount && <div style={dangerText}>{fieldErrors.amount}</div>}

        {/* 入账原因 */}
        <label style={fieldLabel}>入账原因 *</label>
        <textarea
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          rows={4}
          placeholder="对公到账请注明银行流水核实说明；平台赠送请注明赠送/补偿原因（可含工单号）"
          style={{ ...inp, resize: "vertical" }}
        />
        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", textAlign: "right", marginBottom: 8 }}>{form.note.length}/500</div>
        {fieldErrors.note && <div style={dangerText}>{fieldErrors.note}</div>}

        {formError && (
          <div style={{ background: "var(--color-danger-bg)", color: "var(--color-danger-text)", fontSize: 13, padding: "8px 10px", borderRadius: 8, marginBottom: 12 }}>⚠️ {formError}</div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <button onClick={resetForm} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>重置表单</button>
            <HelpIcon text={HELP_RESET} />
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <button onClick={handlePrimarySubmit} disabled={submitMut.isPending} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>
              {submitMut.isPending ? "提交中..." : "确认提交"}
            </button>
            <HelpIcon text={HELP_CONFIRM} />
          </span>
        </div>
      </Modal>

      {/* ── 审核 / 驳回弹窗（R5：按阶段提示下一环节 + 审批人链；R7：确认后进入两步 2FA 弹窗） ── */}
      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title={review?.action === "approve"
          ? (review?.phase === "level2_pending" ? "确认二审通过" : review?.phase === "super_pending" ? "确认终审通过" : "确认一审通过")
          : "驳回上账申请"}
        width={440}
      >
        {review && (
          <>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.8 }}>
              {reviewStageHint(review.phase, review.level, review.action)}
            </div>
            {review.action === "approve" && (
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "var(--color-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 12, lineHeight: 1.7 }}>
                本操作为资金写操作，确认后进入操作级 2FA 两步验证：① 输入 TOTP/备用码验证身份 → ② 核对操作摘要后确认执行（验证结果 5 分钟内有效）。
              </div>
            )}
            <textarea value={review.note} onChange={(e) => setReview({ ...review, note: e.target.value })} placeholder={review.action === "approve" ? "审核意见（选填）" : "驳回原因（必填）"} rows={3} style={inp} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setReview(null)} style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}>取消</button>
              <button
                onClick={() => reviewMut.mutate()}
                disabled={review.action === "reject" && !review.note}
                style={{ ...btnBase, background: review.action === "approve" ? "var(--color-primary)" : "var(--color-danger-text)", color: "#fff" }}
              >
                {reviewMut.isPending ? "提交中..." : review.action === "approve" ? "确认通过" : "确认驳回"}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
