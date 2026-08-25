/**
 * 多级审批展示辅助（R5）— 审批阶段 / 级别 / 审批人链解析
 *
 * 数据源（ARCH §2.4.2 / §2.5.4，防御式解析：后端 R5 字段未就绪时回退现状结构）：
 * - 顶层新字段：approval_level / approval_phase / first_reviewer_id / second_reviewer_id /
 *   super_reviewer_id / approval_stalled（GET 列表增量字段，纯增量向后兼容）
 * - metadata.approval：{ level, phase, first_reviewer, second_reviewer, super_reviewer,
 *   limit_check: { op_projected_cents, user_projected_cents, escalated } }（jsonb 存储）
 * - 状态推导兜底：pending → level1_pending；pending_level2 → level2_pending；
 *   pending_super → super_pending；级别按金额回退（>¥100,000 → 3；>¥10,000 → 2；否则 1）
 *
 * @see 3cloud/docs/ARCH-整改R5-R7-资金风控.md §2.4 / §2.5.4 / §2.7
 * @module lib/approval
 */

/** 审批信息（解析后的纯数据，供列表/弹窗展示） */
export interface ApprovalInfo {
  /** 审批级别：1=单审 / 2=双人 / 3=三人（super_admin 终审） */
  level: number;
  /** 当前阶段：level1_pending / level2_pending / super_pending / approved / rejected / "" */
  phase: string;
  /** 阶段中文文案（如"待一审"） */
  phaseLabel: string;
  /** 级别中文文案（如"双人审批"） */
  levelLabel: string;
  /** 一审人 ID（顶层字段或 metadata.approval.first_reviewer） */
  firstReviewerId: number | null;
  /** 二审人 ID */
  secondReviewerId: number | null;
  /** super 终审人 ID */
  superReviewerId: number | null;
  /** 是否审批人不足滞留（"等待可用审批人"提示） */
  stalled: boolean;
  /** 是否因 24h 累计限额升级审批级别（R6） */
  escalated: boolean;
  /** 限额检查快照（metadata.approval.limit_check） */
  limitCheck: { op_projected_cents?: number; user_projected_cents?: number; escalated?: boolean } | null;
}

/** 阶段中文文案（ARCH §2.4.2 phase 语义） */
export function approvalPhaseLabel(phase: string, level?: number): string {
  switch (phase) {
    case "level1_pending": return "待一审";
    case "level2_pending": return level === 3 ? "待二审" : "待二级复核";
    case "super_pending": return "待 super 终审";
    case "approved": return "已终审";
    case "rejected": return "已驳回";
    default: return "";
  }
}

/** 级别中文文案 */
export function approvalLevelLabel(level: number): string {
  switch (level) {
    case 3: return "三人审批（super 终审）";
    case 2: return "双人审批";
    default: return "单审";
  }
}

/** 解析行对象的 metadata（jsonb 可能是对象或 JSON 字符串） */
function pickMetadata(row: unknown): Record<string, any> {
  if (!row || typeof row !== "object") return {};
  const meta = (row as Record<string, any>).metadata;
  if (!meta) return {};
  if (typeof meta === "string") {
    try { return JSON.parse(meta) as Record<string, any>; } catch { return {}; }
  }
  if (typeof meta === "object") return meta as Record<string, any>;
  return {};
}

/** 从行对象解析审批信息（后端字段缺失时逐级回退，保证旧数据/旧后端可展示） */
export function parseApproval(row: unknown): ApprovalInfo {
  const r = (row ?? {}) as Record<string, any>;
  const meta = pickMetadata(r);
  const approval = (meta.approval && typeof meta.approval === "object"
    ? meta.approval
    : {}) as Record<string, any>;

  // 阶段：顶层新字段 > metadata.approval.phase > 状态推导
  const phaseRaw: unknown = r.approval_phase ?? approval.phase;
  const status: string = r.status ?? "";
  let phase = "";
  if (typeof phaseRaw === "string" && phaseRaw) {
    phase = phaseRaw;
  } else if (status === "pending_level2") {
    phase = "level2_pending";
  } else if (status === "pending_super") {
    phase = "super_pending";
  } else if (status === "pending") {
    phase = "level1_pending";
  }

  // 级别：顶层 > metadata.approval.level > 金额推导
  let level = Number(r.approval_level ?? approval.level);
  if (!Number.isInteger(level) || level < 1 || level > 3) {
    const amount = Number(r.amount) || 0;
    level = amount > 100000 ? 3 : amount > 10000 ? 2 : 1;
  }

  const limitCheckRaw = approval.limit_check;
  const limitCheck = limitCheckRaw && typeof limitCheckRaw === "object"
    ? limitCheckRaw as { op_projected_cents?: number; user_projected_cents?: number; escalated?: boolean }
    : null;

  return {
    level,
    phase,
    phaseLabel: approvalPhaseLabel(phase, level),
    levelLabel: approvalLevelLabel(level),
    firstReviewerId: toNullableId(r.first_reviewer_id ?? approval.first_reviewer),
    secondReviewerId: toNullableId(r.second_reviewer_id ?? approval.second_reviewer),
    superReviewerId: toNullableId(r.super_reviewer_id ?? approval.super_reviewer),
    stalled: r.approval_stalled === true || approval.stalled === true,
    escalated: limitCheck?.escalated === true || approval.escalated === true,
    limitCheck,
  };
}

/** 审批人 ID 转 number|null（兼容 null/undefined/字符串） */
function toNullableId(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 审批人链展示（含已审/未审占位；id 展示为 #id，后端补充邮箱/姓名后自动带上） */
export function approvalChainSegments(info: ApprovalInfo, extra?: { createdBy?: number | null }): string[] {
  const segs: string[] = [];
  if (extra?.createdBy) segs.push(`创建 #${extra.createdBy}`);
  segs.push(info.firstReviewerId ? `一审 #${info.firstReviewerId}` : "一审 —");
  if (info.level >= 2) segs.push(info.secondReviewerId ? `二审 #${info.secondReviewerId}` : "二审 —");
  if (info.level >= 3) segs.push(info.superReviewerId ? `终审 #${info.superReviewerId}` : "终审 —");
  return segs;
}
