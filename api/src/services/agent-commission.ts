// ============================================================
//  3cloud (3C) — 佣金服务 (Business Logic)
// ============================================================
//
// ── 业务逻辑 ──
//
// 【佣金查询 (getAgentCommissions)】
//   - 数据源: commission_logs (分区表, 按 createdAt 分区)
//   - 筛选: agentId (强制的), status, commissionType, startDate/endDate, customerSearch (nickname/email ILIKE)
//   - 单次查询强制 agentId IS NOT NULL (避免全表扫描)
//   - 关联: LEFT JOIN users (sourceCustomerId) → 客户名称/邮箱
//
// 【佣金汇总 (getAgentCommissionSummary)】
//   - 全部: sum commissionAmount, pendingAmount/settledAmount, pendingCount/settledCount
//   - 本月: sum WHERE createdAt >= monthStart
//   - 状态筛选用 FILTER 子句
//
// 【佣金详情 (getAgentCommissionDetail)】
//   - 双重校验: commissionId + agentId (防止跨代理商查看)
//   - 返回: callCost, commissionAmount, commissionType, voucherNo, feeRate/feeAmount/netAmount, calcDetail, ruleSnapshot, settledAt
//
// 【管理后台列表 (listAllCommissions)】
//   - 数据源: commission_daily_rollup (预聚合, 非 commission_logs 分区表)
//   - 筛选: agentId, agentSearch (email/nickname LIKE), reportDate range
//   - 返回: 每日分佣汇总 (sale/renewal/activity 三维拆分)
//
// 【管理后台明细 (listAllCommissionsDetail)】
//   - 从列表页点击 → 走 commission_logs 分区表
//   - 强制定位: agentId + date range (单分区扫描)
//   - 筛选: status, commissionType
//
// 【佣金规则 CRUD (upsertCommissionRule / deleteCommissionRule)】
//   - 唯一键: (agentId, ruleType) — 每种规则类型唯一
//   - ruleType: 'sale', 'team', 'renewal', 'activity'
//   - upsert 字段: rate, isEnabled, minTriggerAmount, maxCap, validFrom/validUntil, activityName/activityType, fixedAmount, teamLevelLimit
//   - 审计: 所有操作写入 audit_logs
//   - delete: 需要 agentId + ruleId 双重验证
//
// 【团队层级 (setAgentParent)】
//   - 设置上级: UPDATE agents SET parentAgentId, teamDepth = parent.teamDepth + 1
//   - 循环引用防护: 不能自引用, 不能下级的上级反指
//   - 审计写入
//
// 【CSV 导出 (exportAgentCommissionsCsv)】
//   - 自定义双引号转义: replace(/"/g, '""')
//   - 头部: 标题行 + 导出时间 + 筛选条件
//   - 列: ID, 客户, 调用成本, 佣金, 手续费, 净佣金, 类型, 状态, 凭证号, 关联订单, 创建时间, 结算时间
//
// 【集成点】
//   - billing.ts: processCommission → INSERT commission_logs (status=pending)
//   - agent-finance.ts: 日汇总聚合, rollup 刷新
//   - agent-helpers.ts: 状态标签, 精度工具

import { eq, and, sql, desc, asc, count, inArray, gte, lte, lt, like } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  users,
  agents,
  agentClients,
  agentCustomerConsumption,
  commissionLogs,
  callLogs,
  withdrawOrders,
  rechargeOrders,
  systemConfigs,
  auditLogs,
  userRoleHistory,
  dailyReconSummary,
  balanceLogs,
  commissionDailyRollup,
  commissionRules,
} from "../db/schema.js";
import { AppError } from "./auth-service.js";
import { getRedis } from "../redis.js";
import { nanoid } from "nanoid";
import { generateVoucherNo } from "./voucher-service.js";
import { getAgentByUserId, getStatusLabel, COMMISSION_TYPE_LABEL, num } from "./agent-helpers.js";

// ── 辅助: 获取系统配置值 ──

async function getSystemConfig(key: string): Promise<string | null> {
  const db = getDb();
  const [config] = await db
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, key))
    .limit(1);
  return config?.value ?? null;
}

// ══════════════════════════════════════════════
//  Settlement helpers (新增)
// ══════════════════════════════════════════════

/**
 * 批量生成凭证号（一次查询最大序号，避免逐条 SELECT）
 */
/**
 * 结算指定代理商的待结算佣金（分批处理，每批 1000 条）
 * @param agentId 可选，不传则结算所有 pending 佣金
 * @returns 结算记录数
 */
export async function getAgentCommissions(
  userId: number,
  page: number,
  pageSize: number,
  filters?: {
    status?: string;
    commissionType?: string;
    startDate?: string;
    endDate?: string;
    customerSearch?: string;
  },
) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [eq(commissionLogs.agentId, agent.id)];
  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate)));
  }
  if (filters?.customerSearch) {
    const kw = `%${filters.customerSearch}%`;
    conditions.push(sql`(${users.nickname} ILIKE ${kw} OR ${users.email} ILIKE ${kw})`);
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      calcDetail: commissionLogs.calcDetail,
      ruleSnapshot: commissionLogs.ruleSnapshot,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      id: r.id,
      callCost: r.callCost,
      commissionAmount: r.commissionAmount,
      commissionType: r.commissionType,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      voucherNo: r.voucherNo,
      sourceOrderId: r.sourceOrderId,
      sourceOrderAmount: r.sourceOrderAmount,
      feeRate: r.feeRate,
      feeAmount: r.feeAmount ?? "0.000000",
      netAmount: r.netAmount ?? "0.000000",
      calcDetail: r.calcDetail,
      ruleSnapshot: r.ruleSnapshot,
      status: r.status,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      createdAt: r.createdAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  佣金汇总统计 (代理商视角)
// ══════════════════════════════════════════════


export async function getAgentCommissionSummary(userId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  // 当前月份范围
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  // PERF: 添加默认时间范围限制（过去一年），避免扫描全部历史记录
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  const [totalStat] = await db
    .select({
      totalCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      pendingAmount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}) filter (where ${commissionLogs.status} = 'pending'), '0.000000')`,
      settledAmount: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}) filter (where ${commissionLogs.status} = 'settled'), '0.000000')`,
      pendingCount: sql<number>`count(*) filter (where ${commissionLogs.status} = 'pending')`,
      settledCount: sql<number>`count(*) filter (where ${commissionLogs.status} = 'settled')`,
    })
    .from(commissionLogs)
    .where(and(
      eq(commissionLogs.agentId, agent.id),
      gte(commissionLogs.createdAt, oneYearAgo),
    ));

  const [monthStat] = await db
    .select({
      monthCommission: sql<string>`coalesce(sum(${commissionLogs.commissionAmount}), '0.000000')`,
      monthCount: sql<number>`count(*)`,
    })
    .from(commissionLogs)
    .where(and(
      eq(commissionLogs.agentId, agent.id),
      gte(commissionLogs.createdAt, monthStart),
    ));

  return {
    totalCommission: totalStat?.totalCommission ?? "0.000000",
    monthCommission: monthStat?.monthCommission ?? "0.000000",
    monthCount: Number(monthStat?.monthCount ?? 0),
    pendingAmount: totalStat?.pendingAmount ?? "0.000000",
    pendingCount: Number(totalStat?.pendingCount ?? 0),
    settledAmount: totalStat?.settledAmount ?? "0.000000",
    settledCount: Number(totalStat?.settledCount ?? 0),
  };
}

// ══════════════════════════════════════════════
//  单条佣金详情
// ══════════════════════════════════════════════


export async function getAgentCommissionDetail(userId: number, commissionId: number) {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const [row] = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      calcDetail: commissionLogs.calcDetail,
      ruleSnapshot: commissionLogs.ruleSnapshot,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(
      eq(commissionLogs.id, commissionId),
      eq(commissionLogs.agentId, agent.id),
    ))
    .limit(1);

  if (!row) {
    throw new AppError("NOT_FOUND", "佣金记录不存在", 404);
  }

  return {
    id: row.id,
    callCost: row.callCost,
    commissionAmount: row.commissionAmount,
    commissionType: row.commissionType,
    commissionTypeLabel: getStatusLabel(row.commissionType ?? "", COMMISSION_TYPE_LABEL),
    voucherNo: row.voucherNo,
    sourceOrderId: row.sourceOrderId,
    sourceOrderAmount: row.sourceOrderAmount,
    feeRate: row.feeRate,
    feeAmount: row.feeAmount ?? "0.000000",
    netAmount: row.netAmount ?? "0.000000",
    calcDetail: row.calcDetail,
    ruleSnapshot: row.ruleSnapshot,
    status: row.status,
    customerName: row.customerName,
    customerEmail: row.customerEmail,
    sourceCustomerId: row.sourceCustomerId,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}

// ══════════════════════════════════════════════
//  佣金 CSV 导出 (代理商视角)
// ══════════════════════════════════════════════


export async function exportAgentCommissionsCsv(
  userId: number,
  filters?: {
    status?: string;
    commissionType?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<string> {
  const db = getDb();
  const agent = await getAgentByUserId(userId);

  const conditions: any[] = [eq(commissionLogs.agentId, agent.id)];
  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }
  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionLogs.createdAt, new Date(filters.endDate)));
  }

  const rows = await db
    .select({
      id: commissionLogs.id,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      commissionType: commissionLogs.commissionType,
      voucherNo: commissionLogs.voucherNo,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceOrderAmount: commissionLogs.sourceOrderAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      status: commissionLogs.status,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
      customerName: users.nickname,
      customerEmail: users.email,
    })
    .from(commissionLogs)
    .leftJoin(users, eq(commissionLogs.sourceCustomerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt));

  const STATUS_LABEL: Record<string, string> = {
    pending: "待结算",
    settled: "已结算",
    cancelled: "已取消",
  };

  const lines: string[] = [];
  lines.push('"3cloud 代理商佣金导出"');
  lines.push(`"导出时间","${new Date().toISOString()}"`);
  if (filters?.status) lines.push(`"筛选状态","${STATUS_LABEL[filters.status] || filters.status}"`);
  if (filters?.startDate) lines.push(`"开始日期","${filters.startDate}"`);
  if (filters?.endDate) lines.push(`"结束日期","${filters.endDate}"`);
  lines.push('');
  lines.push('"ID","客户昵称","客户邮箱","调用成本","佣金金额","手续费","净佣金","类型","状态","凭证号","关联订单","创建时间","结算时间"');

  for (const r of rows) {
    const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    lines.push([
      r.id,
      esc(r.customerName),
      esc(r.customerEmail),
      r.callCost,
      r.commissionAmount,
      r.feeAmount ?? "0.000000",
      r.netAmount ?? "0.000000",
      COMMISSION_TYPE_LABEL[r.commissionType ?? ""] || r.commissionType || "",
      STATUS_LABEL[r.status] || r.status,
      esc(r.voucherNo),
      esc(r.sourceOrderId),
      r.createdAt.toISOString(),
      r.settledAt?.toISOString() ?? "",
    ].join(","));
  }

  return lines.join("\n");
}

// ══════════════════════════════════════════════
//  获取上次成功提现的银行信息（预填用）
// ══════════════════════════════════════════════


export async function listAllCommissions(
  page: number,
  pageSize: number,
  filters?: {
    agentId?: number;
    agentSearch?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    commissionType?: string;
    cursor?: string;
  },
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  const conditions: any[] = [sql`1=1`];

  if (filters?.agentId) {
    conditions.push(eq(commissionDailyRollup.agentId, filters.agentId));
  }
  if (filters?.agentSearch) {
    const keyword = `%${filters.agentSearch}%`;
    conditions.push(
      sql`(${users.email} ILIKE ${keyword} OR ${users.nickname} ILIKE ${keyword})`
    );
  }
  if (filters?.startDate) {
    conditions.push(gte(commissionDailyRollup.reportDate, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(commissionDailyRollup.reportDate, filters.endDate));
  }

  // COUNT 走 rollup 表，数据量极小
  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionDailyRollup)
    .innerJoin(agents, eq(commissionDailyRollup.agentId, agents.id))
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionDailyRollup.id,
      agentId: commissionDailyRollup.agentId,
      agentEmail: users.email,
      agentNickname: users.nickname,
      reportDate: commissionDailyRollup.reportDate,
      totalRecords: commissionDailyRollup.totalRecords,
      totalCallCost: commissionDailyRollup.totalCallCost,
      totalCommissionAmount: commissionDailyRollup.totalCommissionAmount,
      totalFeeAmount: commissionDailyRollup.totalFeeAmount,
      totalNetAmount: commissionDailyRollup.totalNetAmount,
      pendingCount: commissionDailyRollup.pendingCount,
      settledCount: commissionDailyRollup.settledCount,
      cancelledCount: commissionDailyRollup.cancelledCount,
      pendingAmount: commissionDailyRollup.pendingAmount,
      settledAmount: commissionDailyRollup.settledAmount,
      saleCount: commissionDailyRollup.saleCount,
      renewalCount: commissionDailyRollup.renewalCount,
      activityCount: commissionDailyRollup.activityCount,
      saleAmount: commissionDailyRollup.saleAmount,
      renewalAmount: commissionDailyRollup.renewalAmount,
      activityAmount: commissionDailyRollup.activityAmount,
    })
    .from(commissionDailyRollup)
    .innerJoin(agents, eq(commissionDailyRollup.agentId, agents.id))
    .innerJoin(users, eq(agents.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(commissionDailyRollup.reportDate), desc(commissionDailyRollup.id))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      totalCallCost: r.totalCallCost ?? "0.000000",
      totalCommissionAmount: r.totalCommissionAmount ?? "0.000000",
      totalFeeAmount: r.totalFeeAmount ?? "0.000000",
      totalNetAmount: r.totalNetAmount ?? "0.000000",
      pendingAmount: r.pendingAmount ?? "0.000000",
      settledAmount: r.settledAmount ?? "0.000000",
      saleAmount: r.saleAmount ?? "0.000000",
      renewalAmount: r.renewalAmount ?? "0.000000",
      activityAmount: r.activityAmount ?? "0.000000",
    })),
    total,
    page,
    pageSize,
    nextCursor: undefined,
  };
}

/**
 * 管理后台佣金明细（走分区表 commission_logs，强制 agentId + date 范围）
 * 从列表页点击某行后跳转进来
 */

export async function listAllCommissionsDetail(
  page: number,
  pageSize: number,
  filters: {
    agentId: number;
    date: string;
    status?: string;
    commissionType?: string;
  },
) {
  const db = getDb();
  const offset = (page - 1) * pageSize;

  // 只查指定代理商当天的数据 → 强制走索引，范围限定在一个分区内
  const dateStart = new Date(filters.date + "T00:00:00Z");
  const dateEnd = new Date(filters.date + "T23:59:59.999Z");

  const conditions: any[] = [
    eq(commissionLogs.agentId, filters.agentId),
    gte(commissionLogs.createdAt, dateStart),
    lte(commissionLogs.createdAt, dateEnd),
  ];

  if (filters?.status) {
    conditions.push(eq(commissionLogs.status, filters.status as any));
  }

  if (filters?.commissionType) {
    conditions.push(eq(commissionLogs.commissionType, filters.commissionType));
  }

  const [totalResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commissionLogs)
    .where(and(...conditions));
  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select({
      id: commissionLogs.id,
      agentId: commissionLogs.agentId,
      voucherNo: commissionLogs.voucherNo,
      commissionType: commissionLogs.commissionType,
      callCost: commissionLogs.callCost,
      commissionAmount: commissionLogs.commissionAmount,
      feeRate: commissionLogs.feeRate,
      feeAmount: commissionLogs.feeAmount,
      netAmount: commissionLogs.netAmount,
      status: commissionLogs.status,
      sourceOrderId: commissionLogs.sourceOrderId,
      sourceCustomerId: commissionLogs.sourceCustomerId,
      createdAt: commissionLogs.createdAt,
      settledAt: commissionLogs.settledAt,
    })
    .from(commissionLogs)
    .where(and(...conditions))
    .orderBy(desc(commissionLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    list: rows.map((r) => ({
      ...r,
      commissionTypeLabel: getStatusLabel(r.commissionType ?? "", COMMISSION_TYPE_LABEL),
      feeAmount: r.feeAmount ?? "0.000000",
      netAmount: r.netAmount ?? "0.000000",
      createdAt: r.createdAt.toISOString(),
      settledAt: r.settledAt?.toISOString() ?? null,
    })),
    total,
    page,
    pageSize,
  };
}

// ══════════════════════════════════════════════
//  Admin: Reconciliation Report (增强版)
//  支持日/周/月粒度、维度拆分、资金平衡校验、异常检测、趋势
// ══════════════════════════════════════════════

interface ReconParams {
  startDate?: string
  endDate?: string
  granularity?: 'day' | 'week' | 'month'
}

/** 数字转固定精度字符串，保持 DECIMAL(18,6) 格式 */
function toDecStr(v: string | number | null | undefined): string {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0
  return n.toFixed(6)
}

/** 字符串数字加法 */
function addDec(a: string, b: string): string {
  return (parseFloat(a) + parseFloat(b)).toFixed(6)
}

/** 字符串数字减法 */
function subDec(a: string, b: string): string {
  return (parseFloat(a) - parseFloat(b)).toFixed(6)
}


export async function getAgentCommissionRules(agentId: number) {
  const db = getDb();
  return db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.agentId, agentId))
    .orderBy(commissionRules.ruleType);
}

// ──────────────────────────────────────────────
//  Upsert a Commission Rule (按 agentId + ruleType)
// ──────────────────────────────────────────────


export async function upsertCommissionRule(
  agentId: number,
  data: {
    ruleType: string;
    rate?: string;
    isEnabled?: boolean;
    minTriggerAmount?: string;
    maxCap?: string;
    validFrom?: string;
    validUntil?: string;
    activityName?: string;
    activityType?: string;
    fixedAmount?: string;
    teamLevelLimit?: number;
  },
  operatorId: number,
) {
  const db = getDb();

  // 验证代理商存在
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  const now = new Date();

  // 构造更新数据（排除 undefined 字段）
  const upsertData: Record<string, any> = {
    agentId,
    ruleType: data.ruleType,
    updatedAt: now,
  };

  if (data.rate !== undefined) upsertData.rate = data.rate;
  if (data.isEnabled !== undefined) upsertData.isEnabled = data.isEnabled;
  if (data.minTriggerAmount !== undefined) upsertData.minTriggerAmount = data.minTriggerAmount;
  if (data.maxCap !== undefined) upsertData.maxCap = data.maxCap;
  if (data.validFrom !== undefined) upsertData.validFrom = new Date(data.validFrom);
  if (data.validUntil !== undefined) upsertData.validUntil = new Date(data.validUntil);
  if (data.activityName !== undefined) upsertData.activityName = data.activityName;
  if (data.activityType !== undefined) upsertData.activityType = data.activityType;
  if (data.fixedAmount !== undefined) upsertData.fixedAmount = data.fixedAmount;
  if (data.teamLevelLimit !== undefined) upsertData.teamLevelLimit = data.teamLevelLimit;

  const [existing] = await db
    .select({ id: commissionRules.id })
    .from(commissionRules)
    .where(and(
      eq(commissionRules.agentId, agentId),
      eq(commissionRules.ruleType, data.ruleType as any),
    ))
    .limit(1);

  if (existing) {
    // 更新已有规则
    await (db
      .update(commissionRules)
      .set(upsertData as any)
      .where(eq(commissionRules.id, existing.id)));

    await db.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "commission_rules",
      targetId: existing.id,
      before: null,
      after: upsertData,
      ip: null,
      description: `更新代理商 #${agentId} 佣金规则: ${data.ruleType}`,
    });

    return { id: existing.id, ...upsertData };
  } else {
    // 新建规则
    const result = await db.transaction(async (tx) => {
      const [rule] = await tx
        .insert(commissionRules)
        .values({ ...upsertData, createdBy: operatorId } as any)
        .returning();

      await tx.insert(auditLogs).values({
        operatorId,
        action: "agent_create",
        targetType: "commission_rules",
        targetId: rule.id,
        before: null,
        after: upsertData,
        ip: null,
        description: `创建代理商 #${agentId} 佣金规则: ${data.ruleType}`,
      });

      return rule;
    });

    return result;
  }
}

// ──────────────────────────────────────────────
//  Delete a Commission Rule
// ──────────────────────────────────────────────


export async function deleteCommissionRule(
  agentId: number,
  ruleId: number,
  operatorId: number,
) {
  const db = getDb();

  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(and(
      eq(commissionRules.id, ruleId),
      eq(commissionRules.agentId, agentId),
    ))
    .limit(1);

  if (!rule) {
    throw new AppError("RULE_NOT_FOUND", "佣金规则不存在", 404);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(commissionRules)
      .where(eq(commissionRules.id, ruleId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "commission_rules",
      targetId: ruleId,
      before: { ruleType: rule.ruleType, rate: rule.rate },
      after: null,
      ip: null,
      description: `删除代理商 #${agentId} 佣金规则: ${rule.ruleType}`,
    });
  });
}

// ══════════════════════════════════════════════
//  代理商团队层级管理
// ══════════════════════════════════════════════

// ──────────────────────────────────────────────
//  Set Agent Parent (设置上级代理商)
// ──────────────────────────────────────────────


export async function setAgentParent(
  agentId: number,
  parentAgentId: number | null,
  operatorId: number,
) {
  const db = getDb();

  // 验证代理商存在
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    throw new AppError("AGENT_NOT_FOUND", "代理商不存在", 404);
  }

  if (parentAgentId) {
    // 验证上级代理商存在
    const [parent] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.id, parentAgentId))
      .limit(1);

    if (!parent) {
      throw new AppError("PARENT_NOT_FOUND", "上级代理商不存在", 404);
    }

    // 防止循环引用（不能把自己设为自己的上级）
    if (parentAgentId === agentId) {
      throw new AppError("SELF_PARENT", "不能将自己设为上级代理商", 400);
    }

    // 防止循环引用（上级的下级不能反过来成为上级）
    const [cycle] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(
        eq(agents.parentAgentId, agentId),
        eq(agents.id, parentAgentId),
      ))
      .limit(1);

    if (cycle) {
      throw new AppError("CYCLE_DETECTED", "循环引用: 该代理商的下级不能成为其上级", 400);
    }
  }

  // 计算新的深度
  let newDepth = 0;
  if (parentAgentId) {
    const [parent] = await db
      .select({ teamDepth: agents.teamDepth })
      .from(agents)
      .where(eq(agents.id, parentAgentId))
      .limit(1);
    newDepth = (parent?.teamDepth ?? 0) + 1;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(agents)
      .set({
        parentAgentId: parentAgentId,
        teamDepth: newDepth,
      })
      .where(eq(agents.id, agentId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "agent_update",
      targetType: "agent",
      targetId: agentId,
      before: null,
      after: { parentAgentId, teamDepth: newDepth },
      ip: null,
      description: `设置代理商 #${agentId} 的上级为 #${parentAgentId ?? "无"}`,
    });
  });

  return { id: agentId, parentAgentId, teamDepth: newDepth };
}

// ══════════════════════════════════════════════
//  收入趋势 — Dashboard 收入曲线数据
// ══════════════════════════════════════════════

