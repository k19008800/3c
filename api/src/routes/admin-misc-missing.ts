/**
 * 管理端缺失端点补齐 — /api/v1/admin/{multimodal-models,deletion,agents/approvals}
 *
 * 对齐原型（此前仅有前端页面与 MOCK，后端缺失）：
 *
 * ── 多模态模型管理（AdminMultimodalModelsPage）──
 *   GET /admin/multimodal-models?keyword=&type=&page=&pageSize=
 *       多模态模型列表（数据源 supplier_models + suppliers join）
 *   PUT /admin/multimodal-models/:id
 *       更新状态（is_enabled / status）与价格（input_price / output_price）
 *
 * ── 账号注销管理别名端点（AdminDeletionPage 契约 /admin/deletion/*，内部复用 deletion_requests）──
 *   GET  /admin/deletion/requests?status=&page=&pageSize=   列表（status 支持 cooling→approved、completed→deleted）
 *   GET  /admin/deletion/stats                               统计（含 *_count 别名）
 *   GET  /admin/deletion/requests/:id                        详情（request + user + checklist）
 *   POST /admin/deletion/requests/:id/reject { reason }     驳回（pending→rejected）
 *   POST /admin/deletion/requests/:id/complete { force }    执行删除（force=true 跳过冷静期；等同 deletion.ts execute）
 *
 * ── 代理商客户报备审核（AdminAgentApprovalsPage，migration 0023 agent_approvals 表）──
 *   GET  /admin/agents/approvals?keyword=&agent=            报备审核列表（四态：pending/approved/bound/rejected）
 *   POST /admin/agents/approvals/:id/approve                通过并自动划拨（写 agent_customers 绑定，状态→bound）
 *   POST /admin/agents/approvals/:id/reject { reason }      驳回（pending→rejected，原因必填）
 *   POST /admin/agents/approvals/:id/re-review              重新审核（rejected/approved→pending）
 *   POST /admin/agents/approvals/:id/unbind { from }        解绑（bound→approved，删除 agent_customers 绑定）
 *   POST /admin/agents/approvals                            创建报备（补充端点，便于联调/种子）
 *
 * 全部端点带 adminAuth（JWT + role ∈ {admin, super_admin}，对齐 admin-finance.ts）；
 * 写操作写 audit_logs 留痕；numeric 字段统一 Number() 转换。
 *
 * @see docs/prototype-gap-mapping.md（admin-multimodal-models.html / admin-agent-customer-approval.html）
 * @see api/src/routes/deletion.ts（execute 数据清除策略复用）
 * @see docs/PRD-代理商体系-后台主导版.md（报备划拨制）
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db';
import { eq, and, or, ilike, sql, desc, inArray } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt';
import { getBalance } from '../services/billing/balance';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  AppError,
} from '../lib/errors';

/* ───────── 鉴权（对齐 admin-finance.ts 模式） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

async function adminAuth(request: any, reply: any) {
  await jwtAuth(request, reply);
  const { role } = request.userContext as { role: string };
  if (role !== 'admin' && role !== 'super_admin') {
    throw new ForbiddenError('Admin access required');
  }
}

/* ───────── 工具函数 ───────── */

/** 管理端操作审计写库（资源维度由调用方指定） */
async function writeAudit(request: any, action: string, resource: string, resourceId: string | null, details: unknown) {
  const ctx = request.userContext ?? {};
  await db.insert(schema.auditLogs).values({
    userId: ctx.userId ?? null,
    action,
    resource,
    resourceId,
    details: details as any,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  });
}

/** 数字型字段 → Number（numeric 列返回 string） */
function toNum(v: unknown): number {
  return Number(v ?? 0);
}

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/** 统一分页参数：page（默认 1）/ pageSize（默认 20，上限 100） */
function parsePageQuery(q: Record<string, unknown>): { page: number; pageSize: number } {
  return {
    page: parsePositiveInt(q.page, 1),
    pageSize: parsePositiveInt(q.pageSize, 20, 100),
  };
}

/** 路径参数 id → 正整数 */
function paramId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Invalid id');
  return id;
}

/** 时间可空序列化（ISO 字符串或 null） */
function isoOrNull(v: unknown): string | null {
  return v instanceof Date ? v.toISOString() : v ? String(v) : null;
}

/* ══════════════════════════════════════════════════════════════
 * 一、多模态模型管理（AdminMultimodalModelsPage）
 * ══════════════════════════════════════════════════════════════ */

/** 多模态类型判定规则（优先级从高到低，命中即返回；不命中返回 null=纯文本模型，过滤掉） */
const MULTIMODAL_TYPE_RULES: Array<{ type: string; re: RegExp }> = [
  // 音频（TTS/STT/ASR）
  { type: 'audio', re: /(^|[^a-z])(audio|tts|stt|whisper|speech|voice|asr|transcri)/i },
  // 图片生成
  { type: 'image_gen', re: /(dall-?e|midjourney|sdxl|stable-?diffusion|flux|imagen|image-?gen|文生图)/i },
  // 视频生成
  { type: 'video_gen', re: /(runway|sora|veo|kling|pika|pixverse|hailuo|video-?gen|文生视频)/i },
  // 视频理解
  { type: 'video', re: /(^|[^a-z])video/i },
  // 视觉理解
  { type: 'vision', re: /(vision|visual|vlm|\bocr\b|vl($|[-_]))/i },
  // 已知多模态大模型家族（图片/视频理解能力）
  { type: 'multimodal', re: /(gpt-4o|gpt-4\.1|gpt-4-vision|claude|gemini|qwen-vl|qwen2\.5-vl|llava|internvl|minicpm|glm-4v|moonshot|kimi|omni|multimodal|janus|deepseek-vl)/i },
];

/** 判定模型是否多模态并推导类型（结合 model_name + capabilities） */
function deriveMultimodalType(modelName: string, capabilities: string[] | null | undefined): string | null {
  const capText = (capabilities ?? []).join(' ').toLowerCase();
  const haystack = `${modelName} ${capText}`;
  for (const rule of MULTIMODAL_TYPE_RULES) {
    if (rule.re.test(haystack)) return rule.type;
  }
  return null;
}

/** 类型兜底能力标签（capabilities 为空时按类型给出默认展示） */
const DEFAULT_CAPABILITIES: Record<string, string[]> = {
  vision: ['图片理解', 'OCR'],
  image_gen: ['文生图'],
  audio: ['语音转文字', '语音合成'],
  video: ['视频理解'],
  video_gen: ['文生视频'],
  multimodal: ['图片理解', '多模态'],
};

/** 模型 DTO（对齐 AdminMultimodalModelsPage 契约） */
function modelDTO(row: any, supplierName?: string | null) {
  const type = deriveMultimodalType(row.modelName, row.capabilities);
  const caps = Array.isArray(row.capabilities) && row.capabilities.length > 0
    ? row.capabilities
    : (DEFAULT_CAPABILITIES[type ?? ''] ?? []);
  const priceUnit = row.priceUnit ?? 'per_1M_tokens';
  return {
    id: row.id,
    model_name: row.modelName,
    display_name: row.platformModel || row.modelName,
    type,
    vendor_id: row.supplierId,
    vendor_name: supplierName ?? `#${row.supplierId}`,
    capabilities: caps,
    input_price: toNum(row.inputPrice),
    output_price: toNum(row.outputPrice),
    price_unit: priceUnit,
    max_tokens: row.maxTokens != null ? Number(row.maxTokens) : null,
    status: row.status,
    is_enabled: row.status === 'active',
  };
}

/* ══════════════════════════════════════════════════════════════
 * 二、账号注销管理别名端点（AdminDeletionPage 契约）
 * ══════════════════════════════════════════════════════════════ */

/** 前端状态筛选 → deletion_requests.status（前端冷却期/已完成对应 approved/deleted） */
function mapDeletionStatusFilter(raw: string): string | undefined {
  switch (raw) {
    case 'pending': return 'pending';
    case 'cooling': return 'approved';
    case 'completed': return 'deleted';
    case 'cancelled': return 'cancelled';
    case 'rejected': return 'rejected';
    default: return undefined;
  }
}

/** 注销申请 DTO（同时给 snake_case 契约字段与前端 camelCase 字段） */
function deletionDTO(row: any) {
  return {
    id: row.id,
    user_id: row.userId,
    user_email: row.userEmail,
    user_name: row.userName,
    email: row.userEmail,
    username: row.userName,
    reason: row.reason,
    status: row.status,
    admin_id: row.adminId,
    admin_note: row.adminNote,
    cool_down_until: isoOrNull(row.coolDownUntil),
    cooling_deadline: isoOrNull(row.coolDownUntil),
    rejected_reason: row.adminNote ?? null,
    completed_at: isoOrNull(row.deletedAt),
    reviewed_at: isoOrNull(row.reviewedAt),
    created_at: isoOrNull(row.createdAt),
    updated_at: isoOrNull(row.updatedAt),
    // camelCase 别名（前端页面直接消费）
    userId: row.userId,
    userEmail: row.userEmail,
    userName: row.userName,
    coolingDeadline: isoOrNull(row.coolDownUntil),
    rejectedReason: row.adminNote ?? null,
    completedAt: isoOrNull(row.deletedAt),
  };
}

/** 注销申请列表行（join users 取邮箱/昵称） */
function deletionListSelect() {
  return {
    id: schema.deletionRequests.id,
    userId: schema.deletionRequests.userId,
    userEmail: schema.users.email,
    userName: schema.users.name,
    reason: schema.deletionRequests.reason,
    status: schema.deletionRequests.status,
    adminId: schema.deletionRequests.adminId,
    adminNote: schema.deletionRequests.adminNote,
    coolDownUntil: schema.deletionRequests.coolDownUntil,
    deletedAt: schema.deletionRequests.deletedAt,
    reviewedAt: schema.deletionRequests.reviewedAt,
    createdAt: schema.deletionRequests.createdAt,
    updatedAt: schema.deletionRequests.updatedAt,
  };
}

/** 注销数据清除（与 deletion.ts execute 同策略，单事务内执行；force 跳过冷静期校验） */
async function executeDeletion(tx: any, deletionRequest: any, force: boolean) {
  const uid = deletionRequest.userId;
  // 1. API Key 全部删除（立即失效）
  await tx.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, uid));
  // 2. 会话删除（refresh token 失效）
  await tx.delete(schema.userSessions).where(eq(schema.userSessions.userId, uid));
  // 3. 余额清零 + 记账（注明注销清零）
  const balance = await getBalance(uid);
  const total = Number(balance.totalBalance || 0);
  if (total !== 0) {
    await tx.update(schema.customerBalances)
      .set({ totalBalance: '0', availableBalance: '0', frozenBalance: '0', version: sql`version + 1`, updatedAt: new Date() })
      .where(eq(schema.customerBalances.userId, uid));
    await tx.insert(schema.balanceTransactions).values({
      userId: uid,
      type: 'adjustment',
      amount: `-${total}`,
      balanceAfter: '0',
      referenceType: 'account_deletion',
      referenceId: String(deletionRequest.id),
      description: `账号注销余额清零（deletion_request #${deletionRequest.id}）`,
    });
  }
  // 4. 代理商身份（级联删除 agent_customers 归属记录）
  await tx.delete(schema.agents).where(eq(schema.agents.userId, uid));
  // 5. 实名信息物理删除
  await tx.delete(schema.realNameRecords).where(eq(schema.realNameRecords.userId, uid));
  // 6. 其他用户绑定/偏好数据
  await tx.delete(schema.user2fa).where(eq(schema.user2fa.userId, uid));
  await tx.delete(schema.userOauthBindings).where(eq(schema.userOauthBindings.userId, uid));
  await tx.delete(schema.userWebhooks).where(eq(schema.userWebhooks.userId, uid));
  await tx.delete(schema.userGroupMemberships).where(eq(schema.userGroupMemberships.userId, uid));
  // 7. 账号标记 deleted（登录校验 status='active' → 永久拒绝）
  await tx.update(schema.users)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(schema.users.id, uid));
  // 8. 注销申请收尾
  await tx.update(schema.deletionRequests)
    .set({ status: 'deleted', deletedAt: sql`NOW()`, updatedAt: new Date() })
    .where(eq(schema.deletionRequests.id, deletionRequest.id));
}

/** 注销详情检查清单（对齐 /me/deletion/checks 的边界语义） */
async function buildDeletionChecklist(userId: number) {
  const balance = await getBalance(userId);
  const balanceTotal = Number(balance.totalBalance || 0);

  const [ticketRow, rechargeRow, exportRow] = await Promise.all([
    db.select({ v: sql<number>`count(*)::int` }).from(schema.tickets)
      .where(and(eq(schema.tickets.userId, userId), inArray(schema.tickets.status, ['open', 'in_progress', 'waiting_customer']))),
    db.select({ v: sql<number>`count(*)::int` }).from(schema.rechargeOrders)
      .where(and(eq(schema.rechargeOrders.userId, userId), eq(schema.rechargeOrders.status, 'pending'))),
    db.select({ v: sql<number>`count(*)::int` }).from(schema.dataRequests)
      .where(and(eq(schema.dataRequests.userId, userId), inArray(schema.dataRequests.status, ['pending', 'approved']))),
  ]);
  const activeTickets = Number(ticketRow[0]?.v ?? 0);
  const pendingRecharge = Number(rechargeRow[0]?.v ?? 0);
  const pendingExports = Number(exportRow[0]?.v ?? 0);

  return [
    {
      id: 1,
      check_item: '余额结清',
      passed: balanceTotal === 0 ? 'true' : 'false',
      detail: balanceTotal === 0 ? null : `当前余额 ¥${balanceTotal}，注销后清零`,
    },
    {
      id: 2,
      check_item: '未结订单 / 进行中工单',
      passed: pendingRecharge === 0 && activeTickets === 0 ? 'true' : 'false',
      detail: pendingRecharge > 0 ? `有 ${pendingRecharge} 笔待处理充值` : activeTickets > 0 ? `有 ${activeTickets} 个进行中工单` : null,
    },
    {
      id: 3,
      check_item: '导出个人数据',
      passed: pendingExports === 0 ? 'true' : 'false',
      detail: pendingExports > 0 ? `有 ${pendingExports} 个进行中的数据导出申请` : null,
    },
  ];
}

/* ══════════════════════════════════════════════════════════════
 * 三、代理商客户报备审核（AdminAgentApprovalsPage）
 * ══════════════════════════════════════════════════════════════ */

/** 报备 DTO */
function approvalDTO(row: any, agentName: string | null, reviewerName: string | null) {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: agentName ?? `#${row.agentId}`,
    customer_id: row.customerId,
    customer_email: row.customerEmail,
    customer_name: row.customerName,
    customer_company: row.customerName ?? null,
    status: row.status,
    reject_reason: row.rejectReason ?? null,
    note: row.note ?? null,
    reviewer: reviewerName ?? null,
    reviewed_at: isoOrNull(row.reviewedAt),
    created_at: isoOrNull(row.createdAt),
    updated_at: isoOrNull(row.updatedAt),
    total_commission: row.totalCommission ?? null,
  };
}

export async function adminMiscMissingRoutes(app: FastifyInstance) {
  // ═══ 一、多模态模型管理 ═══

  /**
   * GET /api/v1/admin/multimodal-models?keyword=&type=&page=&pageSize=
   * 多模态模型列表：supplier_models + suppliers join；
   * 模型名含 image/vision/audio/video/tts/stt 等关键字（或已知多模态家族）视为多模态，纯文本模型过滤。
   */
  app.get('/api/v1/admin/multimodal-models', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);
    const keyword = String(q.keyword ?? '').trim();
    const typeFilter = String(q.type ?? '').trim();

    // SQL 层先按关键字过滤（模型名 / 平台模型名 / 供应商名）
    const conditions: any[] = [];
    if (keyword) {
      const like = `%${keyword}%`;
      conditions.push(or(
        ilike(schema.supplierModels.modelName, like),
        ilike(schema.supplierModels.platformModel, like),
        ilike(schema.suppliers.name, like),
      ));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: schema.supplierModels.id,
        supplierId: schema.supplierModels.supplierId,
        modelName: schema.supplierModels.modelName,
        platformModel: schema.supplierModels.platformModel,
        inputPrice: schema.supplierModels.inputPrice,
        outputPrice: schema.supplierModels.outputPrice,
        priceUnit: schema.supplierModels.priceUnit,
        status: schema.supplierModels.status,
        capabilities: schema.supplierModels.capabilities,
        maxTokens: schema.supplierModels.maxTokens,
        supplierName: schema.suppliers.name,
      })
      .from(schema.supplierModels)
      .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.supplierModels.supplierId))
      .where(whereClause)
      .orderBy(desc(schema.supplierModels.updatedAt));

    // 内存过滤：仅保留多模态模型 + type 筛选
    const filtered = rows
      .map((r) => modelDTO(r, r.supplierName))
      .filter((m) => m.type !== null && (!typeFilter || m.type === typeFilter));

    const total = filtered.length;
    const list = filtered.slice((page - 1) * pageSize, page * pageSize);

    return reply.send({ data: { list, total, page, pageSize } });
  });

  /**
   * PUT /api/v1/admin/multimodal-models/:id
   * 更新状态（is_enabled 布尔 / status 枚举）与价格（input_price / output_price）。
   */
  app.put('/api/v1/admin/multimodal-models/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const body = (request.body ?? {}) as {
      is_enabled?: boolean;
      status?: string;
      input_price?: number | string;
      output_price?: number | string;
    };

    const [row] = await db.select().from(schema.supplierModels).where(eq(schema.supplierModels.id, id)).limit(1);
    if (!row) throw new NotFoundError('SupplierModel', id);

    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) {
      if (!['active', 'inactive', 'deprecated', 'beta'].includes(String(body.status))) {
        throw new ValidationError('status 非法，可选 active/inactive/deprecated/beta');
      }
      set.status = String(body.status);
    } else if (body.is_enabled !== undefined) {
      set.status = body.is_enabled ? 'active' : 'inactive';
    }
    if (body.input_price !== undefined) {
      const p = Number(body.input_price);
      if (isNaN(p) || p < 0) throw new ValidationError('input_price 必须为非负数字');
      set.inputPrice = String(p);
    }
    if (body.output_price !== undefined) {
      const p = Number(body.output_price);
      if (isNaN(p) || p < 0) throw new ValidationError('output_price 必须为非负数字');
      set.outputPrice = String(p);
    }

    const [updated] = await db.update(schema.supplierModels).set(set).where(eq(schema.supplierModels.id, id)).returning();
    if (!updated) throw new AppError('模型更新失败', 500, 'MODEL_UPDATE_FAILED');
    await writeAudit(request, 'multimodal_model.update', 'supplier_model', String(id), { ...set, modelName: row.modelName });
    return reply.send({
      data: { id: updated.id, model_name: updated.modelName, status: updated.status, input_price: toNum(updated.inputPrice), output_price: toNum(updated.outputPrice) },
      message: '模型已更新',
    });
  });

  // ═══ 二、账号注销管理别名端点（/admin/deletion/*） ═══

  /** GET /api/v1/admin/deletion/requests?status=&page=&pageSize= — 注销申请列表（前端契约别名） */
  app.get('/api/v1/admin/deletion/requests', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, unknown>;
    const { page, pageSize } = parsePageQuery(q);
    const statusFilter = mapDeletionStatusFilter(String(q.status ?? '').trim());

    const conditions: any[] = [];
    if (statusFilter) conditions.push(eq(schema.deletionRequests.status, statusFilter));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db.select(deletionListSelect())
        .from(schema.deletionRequests)
        .leftJoin(schema.users, eq(schema.deletionRequests.userId, schema.users.id))
        .where(whereClause)
        .orderBy(desc(schema.deletionRequests.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests).where(whereClause),
    ]);

    return reply.send({
      data: {
        list: rows.map((r) => deletionDTO(r)),
        total: Number(totalRows[0]?.v ?? 0),
        page,
        pageSize,
      },
    });
  });

  /** GET /api/v1/admin/deletion/stats — 注销申请统计（含任务要求的 *_count 别名） */
  app.get('/api/v1/admin/deletion/stats', { preHandler: [adminAuth] }, async (_request: any, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [pending, approved, deleted, cancelled, rejected, todayNew, overdue] = await Promise.all([
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests).where(eq(schema.deletionRequests.status, 'pending')),
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests).where(eq(schema.deletionRequests.status, 'approved')),
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests).where(eq(schema.deletionRequests.status, 'deleted')),
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests).where(eq(schema.deletionRequests.status, 'cancelled')),
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests).where(eq(schema.deletionRequests.status, 'rejected')),
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests).where(sql`${schema.deletionRequests.createdAt} >= ${today.toISOString()}`),
      db.select({ v: sql<number>`count(*)::int` }).from(schema.deletionRequests)
        .where(and(eq(schema.deletionRequests.status, 'approved'), sql`${schema.deletionRequests.coolDownUntil} <= NOW()`)),
    ]);

    const num = (r: { v?: number } | undefined) => Number(r?.v ?? 0);
    const pendingCount = num(pending[0]);
    const approvedCount = num(approved[0]);
    const executedCount = num(deleted[0]);
    const rejectedCount = num(rejected[0]);

    return reply.send({
      data: {
        // 前端卡片字段
        pending: pendingCount,
        cooling: approvedCount,
        completed: executedCount,
        cancelled: num(cancelled[0]),
        rejected: rejectedCount,
        today_new: num(todayNew[0]),
        overdue: num(overdue[0]),
        // 任务契约别名
        pending_count: pendingCount,
        approved_count: approvedCount,
        executed_count: executedCount,
        rejected_count: rejectedCount,
      },
    });
  });

  /** GET /api/v1/admin/deletion/requests/:id — 注销申请详情（request + user + checklist） */
  app.get('/api/v1/admin/deletion/requests/:id', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const [row] = await db.select(deletionListSelect())
      .from(schema.deletionRequests)
      .leftJoin(schema.users, eq(schema.deletionRequests.userId, schema.users.id))
      .where(eq(schema.deletionRequests.id, id))
      .limit(1);
    if (!row) throw new NotFoundError('DeletionRequest', id);

    const [userRows, checklist] = await Promise.all([
      db.select({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        status: schema.users.status,
        realNameStatus: schema.users.realNameStatus,
        createdAt: schema.users.createdAt,
      }).from(schema.users).where(eq(schema.users.id, row.userId)).limit(1),
      buildDeletionChecklist(row.userId),
    ]);

    const user = userRows[0];
    const balance = await getBalance(row.userId);

    return reply.send({
      data: {
        request: deletionDTO(row),
        user: user
          ? {
              id: user.id,
              email: user.email,
              username: user.name,
              status: user.status,
              balance: Math.round(toNum(balance.totalBalance) * 100), // 前端按“分”展示
              real_name_status: user.realNameStatus,
              created_at: isoOrNull(user.createdAt),
            }
          : null,
        checklist,
      },
    });
  });

  /** POST /api/v1/admin/deletion/requests/:id/reject { reason } — 驳回（pending→rejected） */
  app.post('/api/v1/admin/deletion/requests/:id/reject', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const body = (request.body ?? {}) as { reason?: string; note?: string };
    const reason = String(body.reason ?? body.note ?? '').trim();
    if (!reason) throw new ValidationError('驳回原因（reason）必填');

    const [row] = await db.select().from(schema.deletionRequests).where(eq(schema.deletionRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DeletionRequest', id);
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许驳回，仅 pending 可 reject`, 400, 'INVALID_STATE');
    }

    const adminId = request.userContext.userId;
    const [updated] = await db
      .update(schema.deletionRequests)
      .set({ status: 'rejected', adminId, adminNote: reason, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.deletionRequests.id, id))
      .returning();
    await writeAudit(request, 'deletion.reject', 'deletion_request', String(id), { userId: row.userId, reason });
    return reply.send({ data: deletionDTO(updated), message: '注销申请已驳回' });
  });

  /**
   * POST /api/v1/admin/deletion/requests/:id/complete { force } — 执行删除（前端契约别名，等同 deletion.ts execute）
   * force=true 跳过冷静期校验，允许 pending/approved 直接执行；force=false 与 execute 同规则（approved + 冷静期已过）。
   */
  app.post('/api/v1/admin/deletion/requests/:id/complete', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const body = (request.body ?? {}) as { force?: boolean };
    const force = body.force === true;

    const [row] = await db.select().from(schema.deletionRequests).where(eq(schema.deletionRequests.id, id)).limit(1);
    if (!row) throw new NotFoundError('DeletionRequest', id);

    if (row.status === 'approved') {
      if (!force) {
        // 非强制：冷静期判定在 SQL 侧做（timestamp 无时区语义）
        const [cooledDown] = await db
          .select({ id: schema.deletionRequests.id })
          .from(schema.deletionRequests)
          .where(and(eq(schema.deletionRequests.id, id), sql`${schema.deletionRequests.coolDownUntil} <= NOW()`))
          .limit(1);
        if (!cooledDown) {
          throw new AppError('7 天冷静期尚未结束，暂不能执行删除', 400, 'COOL_DOWN_NOT_REACHED');
        }
      }
    } else if (row.status === 'pending') {
      if (!force) {
        throw new AppError('当前状态（pending）尚未审核通过，不能执行删除；如需强制完成请传 force=true', 400, 'INVALID_STATE');
      }
    } else {
      throw new AppError(`当前状态（${row.status}）不允许执行删除`, 400, 'INVALID_STATE');
    }

    await db.transaction(async (tx) => {
      await executeDeletion(tx, row, force);
    });

    await writeAudit(request, 'deletion.execute', 'deletion_request', String(id), {
      userId: row.userId,
      force,
      cleared: ['api_keys', 'user_sessions', 'customer_balances', 'agents', 'real_name_records', 'user_2fa', 'oauth_bindings', 'user_webhooks', 'user_group_memberships'],
      retained: ['consumption_records', 'balance_transactions', 'users'],
    });
    return reply.send({ message: force ? '管理员强制注销完成' : '账号删除已执行', data: { id, userId: row.userId, status: 'deleted' } });
  });

  // ═══ 三、代理商客户报备审核 ═══

  /**
   * GET /api/v1/admin/agents/approvals?keyword=&agent=
   * 报备审核列表：四态（pending/approved/bound/rejected），附 summary 计数；
   * bound 行附带累计贡献佣金（agent_commissions 聚合）。
   */
  app.get('/api/v1/admin/agents/approvals', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const q = (request.query || {}) as Record<string, unknown>;
    const keyword = String(q.keyword ?? '').trim();
    const agent = String(q.agent ?? '').trim();

    // 代理商筛选：可能是代理商 id 或名称/邮箱 → 先解析出 agent_id 集合
    let agentIdFilter: number[] | null = null;
    if (agent) {
      const agentCond: any[] = [];
      const agentNum = Number(agent);
      if (Number.isInteger(agentNum) && agentNum > 0) agentCond.push(eq(schema.agents.id, agentNum));
      const like = `%${agent}%`;
      agentCond.push(ilike(schema.users.name, like), ilike(schema.users.email, like));
      const agentRows = await db
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
        .where(or(...agentCond));
      agentIdFilter = agentRows.map((r) => r.id);
      if (agentIdFilter.length === 0) {
        // 无匹配代理商 → 直接返回空
        return reply.send({ data: { approvals: [], summary: { pending: 0, approved: 0, bound: 0, rejected: 0 } } });
      }
    }

    // 报备行 + 客户信息（users 为报备客户）
    const conditions: any[] = [];
    if (agentIdFilter) conditions.push(inArray(schema.agentApprovals.agentId, agentIdFilter));
    if (keyword) {
      const like = `%${keyword}%`;
      conditions.push(or(
        ilike(schema.users.email, like),
        ilike(schema.users.name, like),
      ));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: schema.agentApprovals.id,
        agentId: schema.agentApprovals.agentId,
        customerId: schema.agentApprovals.customerId,
        status: schema.agentApprovals.status,
        rejectReason: schema.agentApprovals.rejectReason,
        note: schema.agentApprovals.note,
        reviewerId: schema.agentApprovals.reviewerId,
        reviewedAt: schema.agentApprovals.reviewedAt,
        createdAt: schema.agentApprovals.createdAt,
        updatedAt: schema.agentApprovals.updatedAt,
        customerEmail: schema.users.email,
        customerName: schema.users.name,
      })
      .from(schema.agentApprovals)
      .innerJoin(schema.users, eq(schema.users.id, schema.agentApprovals.customerId))
      .where(whereClause)
      .orderBy(desc(schema.agentApprovals.createdAt));

    // 代理商名映射（agents.userId → users.name）
    const agentIds = [...new Set(rows.map((r) => r.agentId))];
    const agentNameMap: Record<number, string> = {};
    if (agentIds.length > 0) {
      const agentRows = await db
        .select({ id: schema.agents.id, name: schema.users.name })
        .from(schema.agents)
        .innerJoin(schema.users, eq(schema.users.id, schema.agents.userId))
        .where(inArray(schema.agents.id, agentIds));
      for (const a of agentRows) agentNameMap[a.id] = a.name;
    }

    // 审核人映射
    const reviewerIds = [...new Set(rows.map((r) => r.reviewerId).filter((v): v is number => !!v))];
    const reviewerNameMap: Record<number, string> = {};
    if (reviewerIds.length > 0) {
      const reviewerRows = await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(inArray(schema.users.id, reviewerIds));
      for (const u of reviewerRows) reviewerNameMap[u.id] = u.name;
    }

    // 已绑定行的累计贡献佣金（agent_commissions 聚合，settled+pending 均计贡献口径）
    const commissionMap: Record<string, number> = {};
    if (rows.some((r) => r.status === 'bound')) {
      const customerIds = [...new Set(rows.map((r) => r.customerId))];
      const commRows = await db
        .select({
          agentId: schema.agentCommissions.agentId,
          customerUserId: schema.agentCommissions.customerUserId,
          total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)`,
        })
        .from(schema.agentCommissions)
        .where(and(
          inArray(schema.agentCommissions.agentId, agentIds),
          inArray(schema.agentCommissions.customerUserId, customerIds),
        ))
        .groupBy(schema.agentCommissions.agentId, schema.agentCommissions.customerUserId);
      for (const c of commRows) {
        commissionMap[`${c.agentId}:${c.customerUserId}`] = toNum(c.total);
      }
    }

    // keyword 追加匹配代理商名（SQL 层已匹配客户邮箱/姓名）
    let approvals = rows.map((r) => {
      const dto = approvalDTO(
        { ...r, customerEmail: r.customerEmail, customerName: r.customerName },
        agentNameMap[r.agentId] ?? null,
        r.reviewerId ? reviewerNameMap[r.reviewerId] ?? null : null,
      );
      dto.total_commission = r.status === 'bound' ? commissionMap[`${r.agentId}:${r.customerId}`] ?? 0 : null;
      return dto;
    });
    if (keyword) {
      const kw = keyword.toLowerCase();
      approvals = approvals.filter((a) =>
        (a.agent_name ?? '').toLowerCase().includes(kw)
        || (a.customer_email ?? '').toLowerCase().includes(kw)
        || (a.customer_name ?? '').toLowerCase().includes(kw)
        || (a.customer_company ?? '').toLowerCase().includes(kw)
      );
    }

    const summary = {
      pending: approvals.filter((a) => a.status === 'pending').length,
      approved: approvals.filter((a) => a.status === 'approved').length,
      bound: approvals.filter((a) => a.status === 'bound').length,
      rejected: approvals.filter((a) => a.status === 'rejected').length,
    };

    return reply.send({ data: { approvals, summary } });
  });

  /**
   * POST /api/v1/admin/agents/approvals/:id/approve — 通过并自动划拨
   * 写入 agent_customers 绑定（报备划拨制：审核通过=归属生效），状态 pending→bound。
   * 说明：任务契约中「置 approved」与「unbind: bound→approved」并存，为使 bound 状态可达、
   * 解绑闭环成立，approve 落库为 bound（通过即绑定）；已通过但已解绑的记录状态为 approved。
   */
  app.post('/api/v1/admin/agents/approvals/:id/approve', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const [row] = await db.select().from(schema.agentApprovals).where(eq(schema.agentApprovals.id, id)).limit(1);
    if (!row) throw new NotFoundError('AgentApproval', id);
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许通过，仅 pending 可 approve`, 400, 'INVALID_STATE');
    }
    const adminId = request.userContext.userId;

    await db.transaction(async (tx) => {
      // 1. 写入 agent_customers 绑定（已存在则跳过，避免重复绑定）
      const [existingBinding] = await tx
        .select({ id: schema.agentCustomers.id })
        .from(schema.agentCustomers)
        .where(and(eq(schema.agentCustomers.agentId, row.agentId), eq(schema.agentCustomers.customerUserId, row.customerId)))
        .limit(1);
      if (!existingBinding) {
        await tx.insert(schema.agentCustomers).values({
          agentId: row.agentId,
          customerUserId: row.customerId,
          status: 'active',
          source: 'agent_approval',
        });
      }
      // 2. 报备状态 → bound（通过即绑定）
      await tx.update(schema.agentApprovals)
        .set({ status: 'bound', reviewerId: adminId, reviewedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.agentApprovals.id, id));
    });

    await writeAudit(request, 'agent_approval.approve', 'agent_approval', String(id), { agentId: row.agentId, customerId: row.customerId });
    return reply.send({ message: '报备已通过，客户已绑定至代理商', data: { id, status: 'bound' } });
  });

  /** POST /api/v1/admin/agents/approvals/:id/reject { reason } — 驳回（pending→rejected，原因必填） */
  app.post('/api/v1/admin/agents/approvals/:id/reject', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const reason = String((request.body ?? {}).reason ?? '').trim();
    if (!reason) throw new ValidationError('驳回原因（reason）必填');

    const [row] = await db.select().from(schema.agentApprovals).where(eq(schema.agentApprovals.id, id)).limit(1);
    if (!row) throw new NotFoundError('AgentApproval', id);
    if (row.status !== 'pending') {
      throw new AppError(`当前状态（${row.status}）不允许驳回，仅 pending 可 reject`, 400, 'INVALID_STATE');
    }

    const adminId = request.userContext.userId;
    const [updated] = await db
      .update(schema.agentApprovals)
      .set({ status: 'rejected', rejectReason: reason, reviewerId: adminId, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.agentApprovals.id, id))
      .returning();
    if (!updated) throw new AppError('报备驳回失败', 500, 'APPROVAL_REJECT_FAILED');
    await writeAudit(request, 'agent_approval.reject', 'agent_approval', String(id), { agentId: row.agentId, customerId: row.customerId, reason });
    return reply.send({ message: '报备已驳回', data: { id, status: updated.status } });
  });

  /**
   * POST /api/v1/admin/agents/approvals/:id/re-review — 重新审核
   * rejected（或已解绑的 approved）→ pending，重新进入审核队列。
   */
  app.post('/api/v1/admin/agents/approvals/:id/re-review', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const [row] = await db.select().from(schema.agentApprovals).where(eq(schema.agentApprovals.id, id)).limit(1);
    if (!row) throw new NotFoundError('AgentApproval', id);
    if (row.status !== 'rejected' && row.status !== 'approved') {
      throw new AppError(`当前状态（${row.status}）不允许重新审核，仅 rejected/approved 可 re-review`, 400, 'INVALID_STATE');
    }

    const [updated] = await db
      .update(schema.agentApprovals)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(schema.agentApprovals.id, id))
      .returning();
    if (!updated) throw new AppError('报备重新审核失败', 500, 'APPROVAL_REREVIEW_FAILED');
    await writeAudit(request, 'agent_approval.re_review', 'agent_approval', String(id), { from: row.status });
    return reply.send({ message: '报备已重新进入审核队列', data: { id, status: updated.status } });
  });

  /**
   * POST /api/v1/admin/agents/approvals/:id/unbind { from } — 解绑
   * 删除 agent_customers 绑定；状态 bound→approved（解绑后保留为「已通过、未绑定」）。
   */
  app.post('/api/v1/admin/agents/approvals/:id/unbind', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const id = paramId(request.params.id);
    const body = (request.body ?? {}) as { from?: string };
    const from = String(body.from ?? '').trim() || 'bound';

    const [row] = await db.select().from(schema.agentApprovals).where(eq(schema.agentApprovals.id, id)).limit(1);
    if (!row) throw new NotFoundError('AgentApproval', id);

    await db.transaction(async (tx) => {
      // 1. 删除该代理商-客户的归属绑定
      await tx.delete(schema.agentCustomers)
        .where(and(eq(schema.agentCustomers.agentId, row.agentId), eq(schema.agentCustomers.customerUserId, row.customerId)));
      // 2. bound → approved（已通过但未绑定）
      if (row.status === 'bound') {
        await tx.update(schema.agentApprovals)
          .set({ status: 'approved', updatedAt: new Date() })
          .where(eq(schema.agentApprovals.id, id));
      }
    });

    await writeAudit(request, 'agent_approval.unbind', 'agent_approval', String(id), {
      agentId: row.agentId, customerId: row.customerId, from, status: row.status,
    });
    return reply.send({ message: '客户已解绑', data: { id, status: row.status === 'bound' ? 'approved' : row.status } });
  });

  /**
   * POST /api/v1/admin/agents/approvals — 创建报备（补充端点，便于联调/种子数据）
   * body: agent_id（或 agent_user_id） + customer_id（或 customer_email），可选 note。
   * 同一代理商对同一客户存在 pending/approved/bound 报备时返回 400 重复报备。
   */
  app.post('/api/v1/admin/agents/approvals', { preHandler: [adminAuth] }, async (request: any, reply) => {
    const body = (request.body ?? {}) as {
      agent_id?: number | string;
      agent_user_id?: number | string;
      customer_id?: number | string;
      customer_email?: string;
      note?: string;
    };

    // 解析代理商（agent_id 优先，否则按 user_id）
    let agentId = Number(body.agent_id);
    if ((!Number.isInteger(agentId) || agentId <= 0) && body.agent_user_id !== undefined) {
      const uid = Number(body.agent_user_id);
      const [agentRow] = await db.select({ id: schema.agents.id }).from(schema.agents).where(eq(schema.agents.userId, uid)).limit(1);
      if (!agentRow) throw new NotFoundError('Agent (by user_id)', uid);
      agentId = agentRow.id;
    }
    if (!Number.isInteger(agentId) || agentId <= 0) throw new ValidationError('agent_id 或 agent_user_id 必填');

    // 解析客户（customer_id 优先，否则按 email）
    let customerId = Number(body.customer_id);
    if ((!Number.isInteger(customerId) || customerId <= 0) && body.customer_email) {
      const email = String(body.customer_email).trim().toLowerCase();
      if (!email) throw new ValidationError('customer_email 不能为空');
      const [userRow] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!userRow) throw new NotFoundError('User (by email)', email);
      customerId = userRow.id;
    }
    if (!Number.isInteger(customerId) || customerId <= 0) throw new ValidationError('customer_id 或 customer_email 必填');

    // 重复报备检查：同一代理商对同一客户存在未完结报备
    const [dup] = await db
      .select({ id: schema.agentApprovals.id, status: schema.agentApprovals.status })
      .from(schema.agentApprovals)
      .where(and(
        eq(schema.agentApprovals.agentId, agentId),
        eq(schema.agentApprovals.customerId, customerId),
        inArray(schema.agentApprovals.status, ['pending', 'approved', 'bound']),
      ))
      .limit(1);
    if (dup) {
      throw new AppError(`该客户已有${dup.status === 'pending' ? '待审核' : dup.status === 'bound' ? '已绑定' : '已通过'}报备，请勿重复报备`, 400, 'DUPLICATE_APPROVAL', { approvalId: dup.id });
    }

    const [created] = await db
      .insert(schema.agentApprovals)
      .values({ agentId, customerId, status: 'pending', note: body.note ? String(body.note).trim() || null : null })
      .returning();
    if (!created) throw new AppError('报备创建失败', 500, 'APPROVAL_CREATE_FAILED');
    await writeAudit(request, 'agent_approval.create', 'agent_approval', String(created.id), { agentId, customerId });
    return reply.status(201).send({ message: '报备已提交，等待审核', data: { id: created.id, agent_id: agentId, customer_id: customerId, status: 'pending' } });
  });
}
