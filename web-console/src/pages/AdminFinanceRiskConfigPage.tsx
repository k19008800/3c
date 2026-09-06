/**
 * 风控规则配置页（R5–R7/B17，pageKey: finance-risk-config，PRD §7.3）
 *
 * 配置三段：大额规则（large_amount）/ 24h 限额（limits）/ 操作级 2FA 策略（operation_2fa）
 * - GET/PUT /admin/finance/rules（requirePerm('sys.config')；operation_2fa 段仅 super_admin，B17）
 * - 保存为敏感写操作：操作级 2FA 两步弹窗（withOperation2fa）+ 二次确认
 * - 配置变更即时生效（60s 缓存）；存量单据按提交时点固化，不受调整影响
 *
 * @see 3cloud/docs/ARCH-整改R5-R7-资金风控.md §2.1 / §4.8
 * @see 3cloud/docs/PRD-整改R5-R7-资金风控.md §7.3 / §8（[?] 帮助数据源）
 * @module pages/AdminFinanceRiskConfigPage
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { usePerm } from "../lib/permissions";
import { useAuthStore } from "../store/auth";
import { withOperation2fa, isOperation2faCanceled, operation2faErrorText, operation2faHeaders } from "../lib/operation-2fa";
import type { OperationSummaryItem } from "../components/Operation2faModal";
import { HelpIcon, EmptyState, SkeletonGroup, useToast } from "@3cloud/shared-ui";

/** 风控规则配置；人工上账默认单笔上限以 accepted ADR-0001 为准（¥50,000） */
interface FinanceRules {
  manual_topup?: { max_amount?: number };
  large_amount?: {
    single_review_max?: number;
    dual_review_threshold?: number;
    super_review_threshold?: number;
    review_exempt?: { enabled?: boolean; max_amount?: number; subjects?: string[] };
    adjustment_decrease_same_tier?: boolean;
  };
  limits?: {
    soft_limit?: number;
    hard_limit?: number;
    exceed_action?: "escalate" | "reject";
    exempt_roles?: string[];
    count_decrease?: boolean;
    count_refund_review?: boolean;
  };
  operation_2fa?: {
    policy?: "mandatory_admin" | "disabled";
    token_ttl_seconds?: number;
    lock_threshold?: number;
    lock_minutes?: number;
    allow_backup_code?: boolean;
    scopes?: string[];
  };
}

/** 表单草稿（可编辑字段） */
interface Draft {
  maxAmount: string;
  singleReviewMax: string;
  dualThreshold: string;
  superThreshold: string;
  exemptEnabled: boolean;
  exemptMaxAmount: string;
  exemptSubjects: string;
  decreaseSameTier: boolean;
  softLimit: string;
  hardLimit: string;
  exceedAction: "escalate" | "reject";
  exemptRoles: string;
  countDecrease: boolean;
  countRefundReview: boolean;
  policy: "mandatory_admin" | "disabled";
  tokenTtl: string;
  lockThreshold: string;
  lockMinutes: string;
  allowBackupCode: boolean;
  scopes: string;
}

function rulesToDraft(r: FinanceRules): Draft {
  return {
    maxAmount: String(r.manual_topup?.max_amount ?? 50000),
    singleReviewMax: String(r.large_amount?.single_review_max ?? 10000),
    dualThreshold: String(r.large_amount?.dual_review_threshold ?? 10000),
    superThreshold: String(r.large_amount?.super_review_threshold ?? 100000),
    exemptEnabled: r.large_amount?.review_exempt?.enabled ?? false,
    exemptMaxAmount: String(r.large_amount?.review_exempt?.max_amount ?? 1000),
    exemptSubjects: (r.large_amount?.review_exempt?.subjects ?? []).join(","),
    decreaseSameTier: r.large_amount?.adjustment_decrease_same_tier ?? true,
    softLimit: String(r.limits?.soft_limit ?? 50000),
    hardLimit: String(r.limits?.hard_limit ?? 100000),
    exceedAction: r.limits?.exceed_action ?? "escalate",
    exemptRoles: (r.limits?.exempt_roles ?? []).join(","),
    countDecrease: r.limits?.count_decrease ?? false,
    countRefundReview: r.limits?.count_refund_review ?? false,
    policy: r.operation_2fa?.policy ?? "mandatory_admin",
    tokenTtl: String(r.operation_2fa?.token_ttl_seconds ?? 300),
    lockThreshold: String(r.operation_2fa?.lock_threshold ?? 5),
    lockMinutes: String(r.operation_2fa?.lock_minutes ?? 15),
    allowBackupCode: r.operation_2fa?.allow_backup_code ?? true,
    scopes: (r.operation_2fa?.scopes ?? []).join(","),
  };
}

function draftToRules(d: Draft): FinanceRules {
  const toNum = (s: string, fallback: number): number => {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const splitList = (s: string): string[] => s.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
  return {
    manual_topup: { max_amount: toNum(d.maxAmount, 50000) },
    large_amount: {
      single_review_max: toNum(d.singleReviewMax, 10000),
      dual_review_threshold: toNum(d.dualThreshold, 10000),
      super_review_threshold: toNum(d.superThreshold, 100000),
      review_exempt: {
        enabled: d.exemptEnabled,
        max_amount: toNum(d.exemptMaxAmount, 1000),
        subjects: splitList(d.exemptSubjects),
      },
      adjustment_decrease_same_tier: d.decreaseSameTier,
    },
    limits: {
      soft_limit: toNum(d.softLimit, 50000),
      hard_limit: toNum(d.hardLimit, 100000),
      exceed_action: d.exceedAction,
      exempt_roles: splitList(d.exemptRoles),
      count_decrease: d.countDecrease,
      count_refund_review: d.countRefundReview,
    },
    operation_2fa: {
      policy: d.policy,
      token_ttl_seconds: toNum(d.tokenTtl, 300),
      lock_threshold: toNum(d.lockThreshold, 5),
      lock_minutes: toNum(d.lockMinutes, 15),
      allow_backup_code: d.allowBackupCode,
      scopes: splitList(d.scopes),
    },
  };
}

/* PRD §8 按钮级帮助对照表（P1 不可降级） */
const HELP_SAVE = "保存大额规则/限额/2FA 策略修改；配置即时生效（存量单据按提交时点固化），保存需操作级 2FA + 二次确认";
const HELP_MAX_AMOUNT = "人工上账创建单笔上限（元）：默认 ¥50,000（accepted ADR-0001）；审批阈值与单笔上限分别校验";
const HELP_LARGE = "统一大额审批规则：≤单审上限单审；>双人触发线双人复核；>终审触发线追加 super_admin 终审；白名单科目免审仅限赠送/补偿/纠错且 ≤ 免审上限（调增）";
const HELP_LIMITS = "24h 累计限额（soft 升级 / hard 拒绝）：soft 阈值（默认 ¥50,000）内单审、超 soft → 升级双人审批（exceed_action=escalate，默认）；超 hard 阈值（默认 ¥100,000）→ 429 拒绝（或 exceed_action=reject 时超 soft 即拒）；操作人与被入账用户同值；exempt_roles 豁免角色（默认空，super_admin 不豁免）";
const HELP_2FA = "操作级 2FA 策略（仅 super_admin 可改）：mandatory_admin 强制资金角色启用；token_ttl_seconds 令牌有效期（秒，默认 300）；lock_threshold/lock_minutes 连续失败锁定阈值与时长（与登录共享计数）";

/* PRD §7.3 页面帮助（pageKey: finance-risk-config） */
const PAGE_HELP = [
  "【功能定位】配置统一大额审批规则、24h 累计限额与操作级 2FA 策略，全局即时生效（新提交单据按新规则定级）。",
  "",
  "【核心操作】",
  "1. 大额规则：单审上限（默认 ¥10,000）、双人触发线（>¥10,000）、super_admin 终审线（>¥100,000）、白名单免审开关",
  "2. 限额：操作人 24h 累计、被入账用户 24h 累计（默认 ¥50,000）、超限行为（升级/拒绝）、豁免角色",
  "3. 2FA 策略：操作级 2FA 开关（mandatory_admin / disabled）、令牌有效期、锁定阈值（仅 super_admin）",
  "",
  "【注意事项】",
  "- 配置变更即时生效；已提交单据的审批级别按提交时点固化，不受后续调整影响",
  "- 保存配置为敏感写操作，需 2FA + 二次确认并写审计",
  "- 不建议将超限行为设为\"拒绝\"以外长期策略误用（默认升级）",
  "",
  "【常见问题】",
  "Q: 修改阈值后存量待审单据会怎样？",
  "A: 存量单据沿用提交时确定的审批级别，不受新配置影响。",
  "Q: 为什么 2FA 策略只有 super_admin 能改？",
  "A: 2FA 策略属最高安全策略，仅超级管理员可调整，防止低权限者自降风控。",
].join("\n");

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13 };
const fieldRow: React.CSSProperties = { marginBottom: 12 };
const fieldLabel: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 4 };
const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginBottom: 12 };

export default function AdminFinanceRiskConfigPage() {
  const canConfig = usePerm("sys.config");
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);

  const rulesQ = useQuery({
    queryKey: ["admin-finance-rules"],
    queryFn: async () => {
      const res = await api.get<{ data: unknown }>("/admin/finance/rules");
      const raw = res.data?.data;
      const rules = (raw && typeof raw === "object" && "rules" in (raw as object))
        ? (raw as { rules: FinanceRules }).rules
        : (raw as FinanceRules | undefined) ?? {};
      setDraft(rulesToDraft(rules));
      return rules;
    },
    enabled: canConfig,
    retry: false,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("配置未加载");
      const body = draftToRules(draft);
      const summary: OperationSummaryItem[] = [
        { label: "操作类型", value: "保存风控规则配置" },
        { label: "人工上账上限", value: `¥${Number(body.manual_topup?.max_amount).toLocaleString()}`, highlight: true },
        { label: "大额规则", value: `单审 ≤${body.large_amount?.single_review_max} / 双人 >${body.large_amount?.dual_review_threshold} / 终审 >${body.large_amount?.super_review_threshold}${body.large_amount?.review_exempt?.enabled ? "（白名单免审开）" : ""}` },
        { label: "24h 限额", value: `soft ¥${body.limits?.soft_limit}（升级）/ hard ¥${body.limits?.hard_limit}（拒绝）；超限行为=${body.limits?.exceed_action === "reject" ? "拒绝" : "升级审批"}` },
        { label: "2FA 策略", value: `${body.operation_2fa?.policy === "disabled" ? "disabled" : "mandatory_admin"}；令牌 ${body.operation_2fa?.token_ttl_seconds}s；锁定 ${body.operation_2fa?.lock_threshold} 次/${body.operation_2fa?.lock_minutes} 分钟` },
      ];
      return withOperation2fa(async (ctx) => {
        return (await api.put("/admin/finance/rules", body, { headers: operation2faHeaders(ctx) })).data;
      }, summary);
    },
    onSuccess: (d: any) => {
      toast.success(d?.data?.message ?? "风控规则配置已保存（60s 缓存后生效）");
      qc.invalidateQueries({ queryKey: ["admin-finance-rules"] });
    },
    onError: (e: any) => {
      if (isOperation2faCanceled(e)) return;
      toast.error(operation2faErrorText(e) ?? extractError(e));
    },
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  if (!canConfig) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
          🛡️ 风控规则配置
          <HelpIcon text={PAGE_HELP} level="page" />
        </h2>
        <div style={card}>
          <EmptyState title="您暂无风控规则配置权限（sys.config）" description="风控规则配置仅限 admin / super_admin；2FA 策略段仅 super_admin 可修改。" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        🛡️ 风控规则配置
        <HelpIcon text={PAGE_HELP} level="page" />
      </h2>

      {rulesQ.isLoading ? (
        <div style={card}><SkeletonGroup lines={8} /></div>
      ) : rulesQ.isError ? (
        <div style={card}>
          <EmptyState title="风控规则配置加载失败" description={`${extractError(rulesQ.error)}（GET /admin/finance/rules 未就绪或无权访问）；请稍后重试。`} />
        </div>
      ) : !draft ? (
        <div style={card}><EmptyState title="暂无配置数据" /></div>
      ) : (
        <>
          {/* ── 大额规则 ── */}
          <div style={card}>
            <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 6 }}>
              📏 大额审批规则 <HelpIcon text={HELP_LARGE} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <div style={fieldRow}>
                <label style={fieldLabel}>人工上账创建单笔上限（元）<HelpIcon text={HELP_MAX_AMOUNT} /></label>
                <input type="number" value={draft.maxAmount} onChange={(e) => set("maxAmount", e.target.value)} style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>单审档金额上限（元）</label>
                <input type="number" value={draft.singleReviewMax} onChange={(e) => set("singleReviewMax", e.target.value)} style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>双人档触发线（元，&gt; 此值双人）</label>
                <input type="number" value={draft.dualThreshold} onChange={(e) => set("dualThreshold", e.target.value)} style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>终审档触发线（元，&gt; 此值 super_admin 终审）</label>
                <input type="number" value={draft.superThreshold} onChange={(e) => set("superThreshold", e.target.value)} style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>调减与调增同档（含恰 ¥10,000 仍双人特例）</label>
                <select value={draft.decreaseSameTier ? "1" : "0"} onChange={(e) => set("decreaseSameTier", e.target.value === "1")} style={inp}>
                  <option value="1">是</option>
                  <option value="0">否</option>
                </select>
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>白名单科目免审</label>
                <select value={draft.exemptEnabled ? "1" : "0"} onChange={(e) => set("exemptEnabled", e.target.value === "1")} style={inp}>
                  <option value="1">开启（仅赠送/补偿/纠错且 ≤ 免审上限）</option>
                  <option value="0">关闭（默认）</option>
                </select>
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>白名单免审单笔上限（元）</label>
                <input type="number" value={draft.exemptMaxAmount} onChange={(e) => set("exemptMaxAmount", e.target.value)} style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>白名单科目（逗号分隔）</label>
                <input value={draft.exemptSubjects} onChange={(e) => set("exemptSubjects", e.target.value)} placeholder="赠送,补偿,纠错" style={inp} />
              </div>
            </div>
          </div>

          {/* ── 24h 限额 ── */}
          <div style={card}>
            <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 6 }}>
              💰 24h 累计限额 <HelpIcon text={HELP_LIMITS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <div style={fieldRow}>
                <label style={fieldLabel}>24h 累计限额 soft 阈值（元，超限升级审批）</label>
                <input type="number" value={draft.softLimit} onChange={(e) => set("softLimit", e.target.value)} style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>24h 累计限额 hard 阈值（元，超限拒绝 429）</label>
                <input type="number" value={draft.hardLimit} onChange={(e) => set("hardLimit", e.target.value)} style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>超限行为</label>
                <select value={draft.exceedAction} onChange={(e) => set("exceedAction", e.target.value as "escalate" | "reject")} style={inp}>
                  <option value="escalate">升级双人审批（默认）</option>
                  <option value="reject">直接拒绝（429）</option>
                </select>
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>豁免角色（逗号分隔，默认空）</label>
                <input value={draft.exemptRoles} onChange={(e) => set("exemptRoles", e.target.value)} placeholder="super_admin" style={inp} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>调减是否计入累计</label>
                <select value={draft.countDecrease ? "1" : "0"} onChange={(e) => set("countDecrease", e.target.value === "1")} style={inp}>
                  <option value="0">否（默认）</option>
                  <option value="1">是</option>
                </select>
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>充值订单审核是否计入</label>
                <select value={draft.countRefundReview ? "1" : "0"} onChange={(e) => set("countRefundReview", e.target.value === "1")} style={inp}>
                  <option value="0">否（默认，完全不计入）</option>
                  <option value="1">是</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── 操作级 2FA 策略（仅 super_admin） ── */}
          <div style={card}>
            <div style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 6 }}>
              🔐 操作级 2FA 策略 <HelpIcon text={HELP_2FA} />
              {!isSuperAdmin && <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>（仅 super_admin 可修改，当前只读）</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
              <div style={fieldRow}>
                <label style={fieldLabel}>策略</label>
                <select value={draft.policy} disabled={!isSuperAdmin} onChange={(e) => set("policy", e.target.value as "mandatory_admin" | "disabled")} style={{ ...inp, opacity: isSuperAdmin ? 1 : 0.6 }}>
                  <option value="mandatory_admin">mandatory_admin（强制，默认）</option>
                  <option value="disabled">disabled（关闭，不推荐）</option>
                </select>
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>令牌有效期（秒）</label>
                <input type="number" value={draft.tokenTtl} disabled={!isSuperAdmin} onChange={(e) => set("tokenTtl", e.target.value)} style={{ ...inp, opacity: isSuperAdmin ? 1 : 0.6 }} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>锁定阈值（连续失败次数）</label>
                <input type="number" value={draft.lockThreshold} disabled={!isSuperAdmin} onChange={(e) => set("lockThreshold", e.target.value)} style={{ ...inp, opacity: isSuperAdmin ? 1 : 0.6 }} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>锁定时长（分钟）</label>
                <input type="number" value={draft.lockMinutes} disabled={!isSuperAdmin} onChange={(e) => set("lockMinutes", e.target.value)} style={{ ...inp, opacity: isSuperAdmin ? 1 : 0.6 }} />
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>允许备用码</label>
                <select value={draft.allowBackupCode ? "1" : "0"} disabled={!isSuperAdmin} onChange={(e) => set("allowBackupCode", e.target.value === "1")} style={{ ...inp, opacity: isSuperAdmin ? 1 : 0.6 }}>
                  <option value="1">是（一次性，默认）</option>
                  <option value="0">否</option>
                </select>
              </div>
              <div style={fieldRow}>
                <label style={fieldLabel}>适用操作 scopes（逗号分隔）</label>
                <input value={draft.scopes} disabled={!isSuperAdmin} onChange={(e) => set("scopes", e.target.value)} placeholder="manual_topup.create,..." style={{ ...inp, opacity: isSuperAdmin ? 1 : 0.6 }} />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", height: 40, fontSize: 14 }}>
                {saveMut.isPending ? "提交中..." : "💾 保存风控配置"}
              </button>
              <HelpIcon text={HELP_SAVE} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
