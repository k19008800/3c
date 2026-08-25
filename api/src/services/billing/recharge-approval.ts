/**
 * recharge_orders 审批态（metadata.approval）工具 — R5 多阶段状态机（ARCH §2.4.2）
 *
 * 存储机制（裁决）：`recharge_orders.status` 保持 `pending` 直到最终批准才置 `paid`
 * （paid 语义 = 已入账，R1–R4 契约）；审批阶段存 `metadata.approval`（jsonb 嵌套，
 * 完整结构见下）+ 顶层便捷键 `approval_level` / `approval_phase`（阶段守卫 SQL
 * `metadata->>'approval_phase'` 依赖顶层键，见 ARCH §2.4.2 原子守卫示例）。
 *
 * 阶段流转（tier 创建时固化，双签 B18 按提交时点）：
 *   tier1（≤level1_max）:        level1_pending → approved（最终批准 → status='paid'）
 *   tier2（>level1_max ≤level2_max）: level1_pending → level2_pending → approved
 *   tier3（>level2_max）:        level1_pending → level2_pending → super_pending → approved
 *   任意阶段 reject → failed（终态，metadata.review_note 记驳回原因）
 *
 * 存量兼容（双签 B18，ARCH v1.1 §7.2）：存量 pending 单无 metadata.approval →
 * **沿用提交时级别（旧规则 = 单审，level=1）**，不重算、不升级；
 * paid/failed/cancelled/refunded 不动。新单据（人工上账创建 / 用户端充值创建）
 * 在创建时写入 metadata.approval（提交时点固化）。
 *
 * metadata.approval 结构（ARCH v1.1 §2.2.1 示例）：
 * {
 *   "level": 2, "phase": "level2_pending",
 *   "first_reviewer": 5, "second_reviewer": null, "super_reviewer": null,
 *   "first_reviewed_at": "...", "second_reviewed_at": null, "super_reviewed_at": null,
 *   "limit_check": { "op_projected_cents": 6000000, "user_projected_cents": 8000000, "escalated": true }
 * }
 *
 * @see docs/ARCH-整改R5-R7-资金风控.md v1.1 §2.2 / §7.2
 * @module services/billing/recharge-approval
 */

/** 审批阶段：level1_pending（待一审，初始）/ level2_pending（待二审）/ super_pending（待 super 终审）/ approved（已终审入账） */
export type RechargeApprovalPhase = 'level1_pending' | 'level2_pending' | 'super_pending' | 'approved';

/** 审批档位：1=单审 / 2=双人 / 3=三人（super_admin 终审） */
export type RechargeApprovalLevel = 1 | 2 | 3;

/** 限额检查快照（ARCH §2.4.2 limit_check） */
export interface LimitCheckMeta {
  op_projected_cents: number;
  user_projected_cents: number;
  escalated: boolean;
}

/** metadata.approval 完整结构 */
export interface RechargeApprovalMeta {
  level: RechargeApprovalLevel;
  phase: RechargeApprovalPhase;
  first_reviewer: number | null;
  second_reviewer: number | null;
  super_reviewer: number | null;
  first_reviewed_at: string | null;
  second_reviewed_at: string | null;
  super_reviewed_at: string | null;
  limit_check: LimitCheckMeta | null;
}

/** 解析后的单据审批态（含原 metadata.created_by） */
export interface ResolvedApproval {
  level: RechargeApprovalLevel;
  phase: RechargeApprovalPhase;
  /** 嵌套 approval 结构（存量单为 null → 由顶层键/重算补全） */
  meta: RechargeApprovalMeta | null;
  /** 创建人（人工上账单 metadata.created_by；用户自助单为 null → 跳过自审校验） */
  createdBy: number | null;
}

/** 阶段流转：当前阶段 approve 后的下一阶段（'approved' = 最终批准 → 置 paid + 入账） */
export function nextPhaseAfterApprove(phase: RechargeApprovalPhase, level: RechargeApprovalLevel): RechargeApprovalPhase {
  switch (phase) {
    case 'level1_pending':
      // tier1 一审即终审；tier2/3 一审进入二审待审
      return level === 1 ? 'approved' : 'level2_pending';
    case 'level2_pending':
      // tier2 二审即终审；tier3 二审进入 super 终审待审
      return level === 3 ? 'super_pending' : 'approved';
    case 'super_pending':
      return 'approved';
    default:
      // 'approved' 已是终态：调用方不应再 approve（返回自身，由守卫 0 行拦截）
      return 'approved';
  }
}

/**
 * 构建初始 approval 结构（创建时固化：level + phase='level1_pending' + limit_check）。
 *
 * @param level - 审批档位（含限额升级后的最终档）
 * @param limitCheck - 创建预检快照（人工上账/调账创建时计算；无则 null）
 */
export function buildApprovalMeta(level: RechargeApprovalLevel, limitCheck: LimitCheckMeta | null): RechargeApprovalMeta {
  return {
    level,
    phase: 'level1_pending',
    first_reviewer: null,
    second_reviewer: null,
    super_reviewer: null,
    first_reviewed_at: null,
    second_reviewed_at: null,
    super_reviewed_at: null,
    limit_check: limitCheck,
  };
}

/**
 * 读取单据当前审批态：无 metadata.approval（存量 pending 单）→ **沿用提交时级别
 * （旧规则 = 单审，level=1 / phase='level1_pending'），不重算、不升级**（双签 B18，
 * ARCH v1.1 §2.2.2/§7.2；修正 v1.0"按金额重算 tier"设计）。新单据（人工上账创建、
 * 用户端 /me/recharge 创建）在创建时已写入 metadata.approval（提交时点固化）。
 *
 * @param metadata - recharge_orders.metadata（jsonb，可为 null）
 * @param amount - 订单金额（元；B18 下不用于重算，保留参数兼容）
 * @returns 解析后的 level/phase + 嵌套 meta（无则 null）+ created_by
 */
export function resolveOrderApproval(metadata: unknown, _amount: number): ResolvedApproval {
  const raw = (metadata ?? {}) as Record<string, unknown>;
  const createdBy = raw.created_by != null && Number.isFinite(Number(raw.created_by)) ? Number(raw.created_by) : null;
  const approval = raw.approval as Partial<RechargeApprovalMeta> | undefined;
  if (approval && typeof approval.level === 'number' && approval.level >= 1 && approval.level <= 3) {
    const phase: RechargeApprovalPhase =
      approval.phase === 'level2_pending' || approval.phase === 'super_pending' || approval.phase === 'approved'
        ? approval.phase
        : 'level1_pending';
    return {
      level: approval.level as RechargeApprovalLevel,
      phase,
      meta: {
        level: approval.level as RechargeApprovalLevel,
        phase,
        first_reviewer: approval.first_reviewer ?? null,
        second_reviewer: approval.second_reviewer ?? null,
        super_reviewer: approval.super_reviewer ?? null,
        first_reviewed_at: approval.first_reviewed_at ?? null,
        second_reviewed_at: approval.second_reviewed_at ?? null,
        super_reviewed_at: approval.super_reviewed_at ?? null,
        limit_check: (approval.limit_check as LimitCheckMeta) ?? null,
      },
      createdBy,
    };
  }
  // 存量 pending 单（B18）：沿用提交时级别 = 旧规则单审，不重算、不升级
  return {
    level: 1,
    phase: 'level1_pending',
    meta: null,
    createdBy,
  };
}

/**
 * 构建阶段推进后的 metadata 整体 patch（调用方以
 * `COALESCE(metadata,'{}'::jsonb) || ${patch}::jsonb` 合并，守卫 UPDATE 用）。
 *
 * 顶层 approval_level / approval_phase 与嵌套 approval 同步更新
 * （守卫 SQL `metadata->>'approval_phase'` 依赖顶层键）。
 *
 * @param metadata - 当前 metadata（可为 null）
 * @param level - 档位
 * @param phase - 当前阶段
 * @param reviewerId - 本次审批人
 * @param nextPhase - 推进后阶段（'approved' 表示最终批准）
 * @param now - 审批时间
 * @returns 合并用 JSON patch（含 approval / approval_level / approval_phase）
 */
export function approveStagePatch(
  metadata: unknown,
  level: RechargeApprovalLevel,
  phase: RechargeApprovalPhase,
  reviewerId: number,
  nextPhase: RechargeApprovalPhase,
  now: Date,
): Record<string, unknown> {
  const raw = (metadata ?? {}) as Record<string, unknown>;
  const prev = (raw.approval ?? {}) as Partial<RechargeApprovalMeta>;
  const iso = now.toISOString();
  const patch: Partial<RechargeApprovalMeta> = { ...prev, level, phase: nextPhase };
  if (phase === 'level1_pending') {
    patch.first_reviewer = reviewerId;
    patch.first_reviewed_at = iso;
  } else if (phase === 'level2_pending') {
    patch.second_reviewer = reviewerId;
    patch.second_reviewed_at = iso;
  } else if (phase === 'super_pending') {
    patch.super_reviewer = reviewerId;
    patch.super_reviewed_at = iso;
  }
  return {
    approval: patch,
    approval_level: level,
    approval_phase: nextPhase,
  };
}
