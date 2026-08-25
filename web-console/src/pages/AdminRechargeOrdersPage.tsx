import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { withOperation2fa, isOperation2faCanceled, operation2faErrorText, operation2faHeaders } from "../lib/operation-2fa";
import type { OperationSummaryItem } from "../components/Operation2faModal";
import { parseApproval, approvalChainSegments } from "../lib/approval";
import { HelpIcon, StatusBadge, SkeletonGroup, EmptyState, Pagination, SearchBar, useToast } from "@3cloud/shared-ui";

interface RechargeOrder {
  id: number; order_no: string; user_id: number; username: string; email: string;
  amount: number; payment_method: string; payment_method_label: string;
  status: string; status_label: string; created_at: string; completed_at: string | null;
  /* R5 增量字段（ARCH §2.5.4；后端未返回时防御式解析） */
  approval_level?: number;
  approval_phase?: string;
  first_reviewer_id?: number | null;
  second_reviewer_id?: number | null;
  super_reviewer_id?: number | null;
  approval_stalled?: boolean;
  created_by?: number | null;
  metadata?: unknown;
}

/** 审核/驳回操作（R7：直接进入两步 2FA 弹窗，摘要由行数据构造） */
interface AuditAction {
  id: number;
  action: "audit" | "reject";
  summary: OperationSummaryItem[];
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

const STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning",
  completed: "success",
  failed: "danger",
  cancelled: "default",
};

/** R5 审批阶段徽标配色（同人工上账） */
const PHASE_BADGE: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  level1_pending: "warning",
  level2_pending: "info",
  super_pending: "default",
  approved: "success",
  rejected: "danger",
};

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "pending", label: "待确认" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "已失败" },
];

/* PRD §8 按钮级帮助对照表（P1 不可降级） */
const HELP_AUDIT_L1 = "一级审批：单审档通过即入账；双人/终审档通过后进入下一环节（待双人复核/待终审），不会立即入账；用户自助单天然满足创建人≠审批人";
const HELP_AUDIT_L2 = "二级复核：双人档在此环节通过后入账生效；审批人不能与一级审批人相同";
const HELP_AUDIT_SUPER = "终审通过（super_admin）：终审档（>¥100,000）的最终确认，通过后入账生效；终审人不能是前两级审批人或创建人";
const HELP_REJECT = "驳回：拒绝该订单，单据变为已驳回，不改变用户余额（任意审批阶段均可驳回）";
const HELP_STALLED = "等待可用审批人：当前阶段无持有对应权限且可审批的操作者（已排除创建人与已审人），单据滞留该环节；请联系管理员或 super_admin 兜底代审";
const HELP_LIMIT_ESCALATE = "限额升级提示：本笔因 24h 累计超限被升级为双人审批";

/* PRD §7.1 页面帮助（pageKey: finance-recharge-audit；充值订单审核与人工上账共用分级口径） */
const PAGE_HELP = [
  "【功能定位】管理员/财务审核用户充值订单（含用户自助对公转账），确认到账后入账；按金额分级审批、双因素认证、二次确认、留痕可冲正。",
  "",
  "【核心操作】",
  "1. 查看充值订单列表（搜索订单号/客户 + 状态筛选）",
  "2. 待确认订单按金额进入对应审批环节：≤¥10,000 单审；>¥10,000 双人复核；>¥100,000 追加 super_admin 终审（对公转账正是该规则目标）",
  "3. 审核通过（最终环节）→ 入账 → 用户收到到账通知；驳回 → 不改变用户余额",
  "4. 审核前必须通过操作级 2FA（输入 TOTP/备用码）并二次确认",
  "",
  "【注意事项】",
  "- 用户自助单（在线充值）创建人是用户本人，天然满足职责分离；人工补单同样禁止自审",
  "- 一级与二级审批不能为同一人；终审人不能是前两级审批人或创建人",
  "- 审核为资金写操作，后端强制 2FA + 二次确认（验证结果 5 分钟内有效）",
  "- 多级审批期间订单状态保持「待确认」，最终批准后才入账并置为已完成",
  "- 错误入账通过红字冲销纠正，禁止直接修改/删除",
  "",
  "【常见问题】",
  "Q: 提示\"待双人复核\"是什么意思？",
  "A: 该订单金额超过 ¥10,000，一级审批已通过，需另一名审批人（不能是一级审批人本人）完成二级复核后才能入账。",
  "Q: 输入验证码后提示\"身份验证已过期\"？",
  "A: 操作级 2FA 验证结果 5 分钟内有效，超时需重新输入验证码。",
].join("\n");

/** 订单创建人解析：顶层 created_by > metadata.created_by（manual 单；用户自助单无此字段） */
function orderCreatedBy(r: RechargeOrder): number | null {
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

/** R7 两步弹窗第二步操作摘要（审核/驳回） */
function buildAuditSummary(r: RechargeOrder, info: ReturnType<typeof parseApproval>, action: "audit" | "reject"): OperationSummaryItem[] {
  const actionLabel = action === "reject"
    ? "充值订单 · 驳回"
    : info.phase === "level2_pending" ? (info.level === 3 ? "充值订单 · 二审通过" : "充值订单 · 二级复核通过")
      : info.phase === "super_pending" ? "充值订单 · super 终审通过"
        : "充值订单 · 一审通过";
  const rows: OperationSummaryItem[] = [
    { label: "操作类型", value: actionLabel },
    { label: "订单号", value: r.order_no },
    { label: "客户", value: r.username || r.email },
    { label: "金额", value: `¥${r.amount.toFixed(2)}`, highlight: true },
    { label: "当前阶段", value: info.phaseLabel || "待确认" },
    { label: "审批去向", value: stageActionLabel(info.phase, info.level) },
  ];
  return rows;
}

export default function AdminRechargeOrdersPage() {
  // 支持 ?search=<邮箱/订单号> 直达定位（客户详情页「去充值」入口跳转而来）
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") ?? "";
  const [search, setSearch] = useState(urlSearch);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const qc = useQueryClient();
  const { toast } = useToast();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isSuperAdmin = useAuthStore((s) => s.user?.role === "super_admin");

  const q = useQuery({
    queryKey: ["admin-recharge-orders", status, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: String(pageSize), page: String(page) });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      return (await api.get<{ data: { list: RechargeOrder[]; pagination: { total: number } } }>(`/admin/recharge-orders?${params}`)).data.data;
    },
  });

  const auditMut = useMutation({
    mutationFn: async ({ id, action, summary }: AuditAction) => withOperation2fa(async (ctx) => {
      return (await api.post(`/admin/recharge-orders/${id}/${action}`, {}, { headers: operation2faHeaders(ctx) })).data;
    }, summary),
    onSuccess: (d: any) => {
      // R5 多阶段：一审通过后 status 仍 pending，按响应 phase 提示下一环节
      const data = d?.data ?? {};
      if (data.approval_phase === "level2_pending") {
        toast.success(data.message ?? "一级审批通过，等待二级审批");
      } else if (data.approval_phase === "super_pending") {
        toast.success(data.message ?? "二级审批通过，等待 super 终审");
      } else {
        toast.success(data.message ?? "操作成功，余额已更新");
      }
      qc.invalidateQueries({ queryKey: ["admin-recharge-orders"] });
    },
    onError: (e) => {
      if (isOperation2faCanceled(e)) return;
      toast.error(operation2faErrorText(e) ?? extractError(e));
    },
  });

  const total = q.data?.pagination?.total ?? 0;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        🧾 充值订单
        <HelpIcon text={PAGE_HELP} level="page" />
      </h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <SearchBar placeholder="搜索订单号/客户..." value={search} onChange={(v) => { setSearch(v); setPage(1); }} />
        {STATUS_FILTERS.map((f) => (
          <button key={f.value} onClick={() => { setStatus(f.value); setPage(1); }} style={{ ...btnBase, background: status === f.value ? "var(--color-primary)" : "var(--color-panel)", color: status === f.value ? "#fff" : "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-secondary)" }}>共 {total} 条</span>
      </div>

      <div style={card}>
        {q.isLoading ? <SkeletonGroup lines={6} /> : (q.data?.list?.length ?? 0) === 0 ? (
          <EmptyState title="暂无充值订单" />
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>订单号</th>
                  <th style={{ padding: "8px" }}>客户</th>
                  <th style={{ padding: "8px" }}>金额</th>
                  <th style={{ padding: "8px" }}>支付方式</th>
                  <th style={{ padding: "8px" }}>状态</th>
                  <th style={{ padding: "8px" }}>审批进度</th>
                  <th style={{ padding: "8px" }}>创建时间</th>
                  <th style={{ padding: "8px" }}>完成时间</th>
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
                      <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{r.order_no}</td>
                      <td style={{ padding: "8px" }}>
                        <div style={{ fontWeight: 600 }}>{r.username || r.email}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{r.email}</div>
                      </td>
                      <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-success-text)" }}>¥{r.amount.toFixed(2)}</td>
                      <td style={{ padding: "8px" }}>{r.payment_method_label || r.payment_method}</td>
                      <td style={{ padding: "8px" }}><StatusBadge status={STATUS_MAP[r.status] ?? "default"}>{r.status_label}</StatusBadge></td>
                      {/* R5：审批进度列（当前阶段 + 级别 + 审批人链） */}
                      <td style={{ padding: "8px", minWidth: 170 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <StatusBadge status={PHASE_BADGE[info.phase] ?? "default"}>{info.phaseLabel || "待确认"}</StatusBadge>
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
                      <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                      <td style={{ padding: "8px", color: "var(--color-text-secondary)", fontSize: 13 }}>{r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}</td>
                      <td style={{ padding: "8px" }}>
                        {r.status === "pending" ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              {info.phase === "level1_pending" && (
                                <>
                                  <button
                                    onClick={() => auditMut.mutate({ id: r.id, action: "audit", summary: buildAuditSummary(r, info, "audit") })}
                                    disabled={isSelf}
                                    title={isSelf ? "您不能审批自己创建的单据（职责分离）" : undefined}
                                    style={{ ...btnBase, background: "#22c55e", color: "#fff", padding: "4px 10px", fontSize: 12, opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
                                  >一审通过</button>
                                  <HelpIcon text={HELP_AUDIT_L1} />
                                </>
                              )}
                              {info.phase === "level2_pending" && (
                                <>
                                  <button
                                    onClick={() => auditMut.mutate({ id: r.id, action: "audit", summary: buildAuditSummary(r, info, "audit") })}
                                    disabled={isSelf}
                                    title={isSelf ? "您不能审批自己创建的单据（职责分离）" : undefined}
                                    style={{ ...btnBase, background: "#22c55e", color: "#fff", padding: "4px 10px", fontSize: 12, opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
                                  >二审通过</button>
                                  <HelpIcon text={HELP_AUDIT_L2} />
                                </>
                              )}
                              {info.phase === "super_pending" && (
                                isSuperAdmin ? (
                                  <>
                                    <button
                                      onClick={() => auditMut.mutate({ id: r.id, action: "audit", summary: buildAuditSummary(r, info, "audit") })}
                                      disabled={isSelf}
                                      title={isSelf ? "您不能审批自己创建的单据（职责分离）" : undefined}
                                      style={{ ...btnBase, background: "#722ed1", color: "#fff", padding: "4px 10px", fontSize: 12, opacity: isSelf ? 0.5 : 1, cursor: isSelf ? "not-allowed" : "pointer" }}
                                    >终审通过</button>
                                    <HelpIcon text={HELP_AUDIT_SUPER} />
                                  </>
                                ) : (
                                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }} title="终审档需 super_admin 角色">仅 super_admin 可终审</span>
                                )
                              )}
                              <button
                                onClick={() => auditMut.mutate({ id: r.id, action: "reject", summary: buildAuditSummary(r, info, "reject") })}
                                style={{ ...btnBase, background: "#ef4444", color: "#fff", padding: "4px 10px", fontSize: 12 }}
                              >驳回</button>
                              <HelpIcon text={HELP_REJECT} />
                            </div>
                            {/* R5 审批人不足滞留提示（ARCH §2.7） */}
                            {info.stalled && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--color-danger-text)" }}>
                                ⚠️ 等待可用审批人 <HelpIcon text={HELP_STALLED} />
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 16 }}>
              <Pagination current={page} total={total} pageSize={pageSize} onChange={(p) => setPage(p)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** 按审批阶段描述审核通过的去向 */
function stageActionLabel(phase: string | undefined, level: number | undefined): string {
  if (phase === "level2_pending") {
    return level === 3 ? "二审通过 → 进入 super 终审" : "二审通过 → 入账生效";
  }
  if (phase === "super_pending") return "super 终审通过 → 入账生效";
  return level === 3 ? "一审通过 → 进入待二审" : level === 2 ? "一审通过 → 进入待二级复核" : "审核通过 → 立即入账";
}
