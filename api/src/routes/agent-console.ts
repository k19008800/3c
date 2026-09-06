/**
 * 代理商控制台端点 — /api/v1/agent/*（A7–A9 契约补齐）
 *
 * 对齐 web-console pages：
 *   GET /agent/dashboard            — 代理商看板指标（累计/本月佣金、名下客户数、累计/本月消费、业绩排名）
 *   GET /agent/consumption/recent   — 名下客户最近消费动态（近 10 条）
 *   GET /agent/customers            — 名下客户列表（搜索 + 分页 + total）
 *   GET /agent/consumption          — 名下客户消费明细（客户名 + 日期范围筛选，含今日/本月统计）
 *
 * 金额单位：DB 为「元」（numeric 18,4 / 18,8），代理商端契约为「分」（×100）。
 * 鉴权：jwtAuth + 当前用户必须是 agents 表中的 active 代理商（复用 agent.ts 的 requireAgent 语义，
 * 通过 agents.userId 反查 agents.id，再以该 id 做 agent_customers / agent_commissions 归属过滤）。
 */
import type { FastifyInstance } from 'fastify';
import { db, schema } from '../db/index.js';
import { eq, and, or, sql, desc, gte, lte, inArray, ilike } from 'drizzle-orm';
import { verifyToken } from '../services/auth/jwt.js';
import { UnauthorizedError, NotFoundError, AppError } from '../lib/errors.js';

/* ───────── 鉴权（与 agent.ts 完全一致） ───────── */

async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid or expired token');
  request.userContext = payload;
}

/** 当前登录用户对应的代理商记录（必须是 agent 角色且 status=active） */
async function requireAgent(request: any) {
  const userId = (request as any).userContext?.userId as number | undefined;
  if (!userId) throw new UnauthorizedError('Missing user');
  const rows = await db
    .select({
      id: schema.agents.id,
      userId: schema.agents.userId,
      status: schema.agents.status,
      commissionRate: schema.agents.commissionRate,
    })
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId))
    .limit(1);
  const agent = rows[0];
  if (!agent) throw new NotFoundError('代理商账号不存在');
  if (agent.status !== 'active') throw new AppError('代理商账号已禁用', 403, 'AGENT_DISABLED');
  return agent;
}

/* ───────── 工具函数 ───────── */

/** 元 → 分（×100 并四舍五入） */
const yuanToCents = (v: unknown): number => Math.round(Number(v ?? 0) * 100);

/** numeric/字符串 → number */
function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** 正整数解析（非法回退默认值，超上限截断） */
function parsePositiveInt(value: unknown, fallback: number, max?: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (isNaN(n) || n <= 0) return fallback;
  return max && n > max ? max : n;
}

/**
 * 时间边界帮助函数。
 *
 * ⚠️ 关键：DB 这些『_at / created_at』列均为 `timestamp without time zone`（drizzle 默认 `timestamp()`），
 * 配合 PG 会话时区（Asia/Shanghai）存储的是**本地墙上钟时间**（naive，无时区）。
 * 因此这里一律返回 PostgreSQL 可比较的 naive 时间字符串（`YYYY-MM-DD HH:MM:SS.mmm`），
 * 绝不传入 JS `Date`——drizzle 会把 Date 序列化成 UTC ISO 字符串，相对本地墙上钟偏移 8 小时，
 * 导致「今日/本月/日期范围」的边界判断错误。
 */

/** 本地墙上钟 → PG timestamp 字符串 */
function pgTs(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** 本月起点（本地时区当月 1 日 00:00，naive 字符串） */
function monthStart(): string {
  const now = new Date();
  return pgTs(new Date(now.getFullYear(), now.getMonth(), 1));
}

/** 今日本地日期（YYYY-MM-DD，本地墙上钟） */
function todayYmd(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 日期字符串（YYYY-MM-DD）→ 当日 00:00 的 PG timestamp 字符串 */
function dayStart(raw: string): string {
  return `${raw} 00:00:00.000`;
}

/** 日期字符串（YYYY-MM-DD）→ 当日 23:59:59.999 的 PG timestamp 字符串 */
function dayEnd(raw: string): string {
  return `${raw} 23:59:59.999`;
}

/** 代理商名下的客户用户 ID 集合（按 agent_customers.agent_id） */
async function agentCustomerIds(agentId: number): Promise<number[]> {
  const rows = await db
    .select({ customerUserId: schema.agentCustomers.customerUserId })
    .from(schema.agentCustomers)
    .where(eq(schema.agentCustomers.agentId, agentId));
  return [...new Set(rows.map((r) => r.customerUserId))];
}

/** 客户展示名（优先 name，兜底 email） */
function customerDisplay(email: string, name: string | null | undefined): string {
  return (name && name.trim()) ? name.trim() : email;
}

/* ───────── 路由 ───────── */

export async function agentConsoleRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/agent/dashboard — 代理商看板指标（分；佣金按 agentId 聚合，消费按名下客户聚合）
   *
   * 返回（web-console AgentDashboardPage.tsx）：
   *   total_commission   累计佣金（分，全部状态）
   *   month_commission   本月佣金（分，settled 且在当月）
   *   total_customers    名下客户总数
   *   active_customers   名下 active 客户数
   *   month_consumption  名下客户本月消费（分）
   *   total_consumption  名下客户累计消费（分）
   *   ranking            当前代理商按累计佣金的排名（1-based，仅统计 active 代理商）
   *   total_agents       代理商总数（active）
   */
  app.get('/api/v1/agent/dashboard', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const mStart = monthStart();
    const customerIds = await agentCustomerIds(agent.id);

    const [custAgg] = await db
      .select({
        count: sql<number>`count(*)::int`,
        activeCount: sql<number>`count(*) filter (where status='active')::int`,
      })
      .from(schema.agentCustomers)
      .where(eq(schema.agentCustomers.agentId, agent.id));

    const [commAgg] = await db
      .select({
        total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)`,
        month: sql<number>`coalesce(sum(${schema.agentCommissions.amount}) filter (where status='settled' and created_at >= ${mStart}),0)`,
      })
      .from(schema.agentCommissions)
      .where(eq(schema.agentCommissions.agentId, agent.id));

    let monthConsumption = 0;
    let totalConsumption = 0;
    if (customerIds.length > 0) {
      const [allAgg, mthAgg] = await Promise.all([
        db
          .select({ total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)` })
          .from(schema.consumptionRecords)
          .where(inArray(schema.consumptionRecords.userId, customerIds)),
        db
          .select({ total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)` })
          .from(schema.consumptionRecords)
          .where(and(inArray(schema.consumptionRecords.userId, customerIds), gte(schema.consumptionRecords.createdAt, sql`${mStart}`))),
      ]);
      totalConsumption = toNumber(allAgg?.[0]?.total ?? 0);
      monthConsumption = toNumber(mthAgg?.[0]?.total ?? 0);
    }

    // 排名：全部 active 代理商按累计佣金降序
    const agents = await db
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(eq(schema.agents.status, 'active'));
    const activeAgentIds = agents.map((a) => a.id);
    const commTotals = new Map<number, number>();
    if (activeAgentIds.length > 0) {
      const rows = await db
        .select({
          agentId: schema.agentCommissions.agentId,
          total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)`,
        })
        .from(schema.agentCommissions)
        .where(inArray(schema.agentCommissions.agentId, activeAgentIds))
        .groupBy(schema.agentCommissions.agentId);
      for (const r of rows) commTotals.set(r.agentId, toNumber(r.total));
    }
    const myTotal = commTotals.get(agent.id) ?? 0;
    const rankedTotals = [...commTotals.values()].sort((a, b) => b - a);
    const ranking = rankedTotals.filter((v) => v > myTotal).length + 1;

    return reply.send({
      data: {
        total_commission: yuanToCents(commAgg?.total ?? 0),
        month_commission: yuanToCents(commAgg?.month ?? 0),
        total_customers: Number(custAgg?.count ?? 0),
        active_customers: Number(custAgg?.activeCount ?? 0),
        month_consumption: yuanToCents(monthConsumption),
        total_consumption: yuanToCents(totalConsumption),
        ranking,
        total_agents: activeAgentIds.length,
      },
    });
  });

  /**
   * GET /api/v1/agent/consumption/recent — 名下客户最近消费动态（近 10 条）
   *
   * 返回 { data: { list: [{ id, customer_name, model_name, tokens, amount(分), created_at }] } }
   */
  app.get('/api/v1/agent/consumption/recent', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const customerIds = await agentCustomerIds(agent.id);

    let list: any[] = [];
    if (customerIds.length > 0) {
      const rows = await db
        .select({
          id: schema.consumptionRecords.id,
          userId: schema.consumptionRecords.userId,
          email: schema.users.email,
          name: schema.users.name,
          model: schema.consumptionRecords.model,
          totalTokens: schema.consumptionRecords.totalTokens,
          cost: schema.consumptionRecords.cost,
          createdAt: schema.consumptionRecords.createdAt,
        })
        .from(schema.consumptionRecords)
        .innerJoin(schema.users, eq(schema.users.id, schema.consumptionRecords.userId))
        .where(inArray(schema.consumptionRecords.userId, customerIds))
        .orderBy(desc(schema.consumptionRecords.id))
        .limit(10);
      list = rows.map((r) => ({
        id: r.id,
        customer_name: customerDisplay(r.email, r.name),
        model_name: r.model,
        tokens: r.totalTokens ?? 0,
        amount: yuanToCents(r.cost),
        created_at: r.createdAt.toISOString(),
      }));
    }

    return reply.send({ data: { list } });
  });

  /**
   * GET /api/v1/agent/customers?search=&page=&page_size= — 名下客户列表
   *
   * 返回 { data: { list, total, page, page_size } }；
   * list 项（web-console AgentCustomersPage.tsx）：
   *   id, username(name), email, balance(分), total_consumed(分), total_commission(分),
   *   commission_rate(%), status(agent_customers.status), joined_at
   */
  app.get('/api/v1/agent/customers', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const search = String(q.search ?? '').trim().toLowerCase();
    const page = parsePositiveInt(q.page, 1);
    const pageSize = parsePositiveInt(q.page_size ?? q.pageSize, 20, 100);
    const offset = (page - 1) * pageSize;

    const relWhere = eq(schema.agentCustomers.agentId, agent.id);
    const relRows = await db
      .select({
        customerUserId: schema.agentCustomers.customerUserId,
        status: schema.agentCustomers.status,
        createdAt: schema.agentCustomers.createdAt,
      })
      .from(schema.agentCustomers)
      .where(relWhere);
    const allCustomerIds = [...new Set(relRows.map((r) => r.customerUserId))];
    const relByCustomer = new Map<number, (typeof relRows)[number]>();
    for (const r of relRows) if (!relByCustomer.has(r.customerUserId)) relByCustomer.set(r.customerUserId, r);

    // 用户基本信息（搜索过滤 / username 展示用）
    const userRows = allCustomerIds.length
      ? await db
          .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            createdAt: schema.users.createdAt,
          })
          .from(schema.users)
          .where(inArray(schema.users.id, allCustomerIds))
      : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    // 余额（availableBalance）
    const balanceRows = allCustomerIds.length
      ? await db
          .select({
            userId: schema.customerBalances.userId,
            availableBalance: schema.customerBalances.availableBalance,
            totalBalance: schema.customerBalances.totalBalance,
          })
          .from(schema.customerBalances)
          .where(inArray(schema.customerBalances.userId, allCustomerIds))
      : [];
    const balanceMap = new Map(
      balanceRows.map((b) => [b.userId, toNumber(b.availableBalance ?? b.totalBalance ?? 0)]),
    );

    // 各客户累计消费 + 累计佣金（限定当前 agent）
    const spentByCustomer = new Map<number, number>();
    const commissionByCustomer = new Map<number, number>();
    if (allCustomerIds.length > 0) {
      const [spentRows, commRows] = await Promise.all([
        db
          .select({
            userId: schema.consumptionRecords.userId,
            total: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)`,
          })
          .from(schema.consumptionRecords)
          .where(inArray(schema.consumptionRecords.userId, allCustomerIds))
          .groupBy(schema.consumptionRecords.userId),
        db
          .select({
            customerUserId: schema.agentCommissions.customerUserId,
            total: sql<number>`coalesce(sum(${schema.agentCommissions.amount}),0)`,
          })
          .from(schema.agentCommissions)
          .where(and(
            eq(schema.agentCommissions.agentId, agent.id),
            inArray(schema.agentCommissions.customerUserId, allCustomerIds),
          ))
          .groupBy(schema.agentCommissions.customerUserId),
      ]);
      for (const r of spentRows) spentByCustomer.set(r.userId, toNumber(r.total));
      for (const r of commRows) commissionByCustomer.set(r.customerUserId, toNumber(r.total));
    }

    // 组装 + 搜索过滤
    let list = [...relByCustomer.entries()].map(([customerUserId, rel]) => {
      const u = userMap.get(customerUserId);
      const email = u?.email ?? '';
      const username = u?.name ?? '';
      return {
        id: customerUserId,
        username,
        email,
        balance: yuanToCents(balanceMap.get(customerUserId) ?? 0),
        total_consumed: yuanToCents(spentByCustomer.get(customerUserId) ?? 0),
        total_commission: yuanToCents(commissionByCustomer.get(customerUserId) ?? 0),
        commission_rate: Number(agent.commissionRate),
        status: rel.status,
        joined_at: rel.createdAt.toISOString(),
      };
    });

    if (search) {
      list = list.filter(
        (c) => c.username.toLowerCase().includes(search) || c.email.toLowerCase().includes(search),
      );
    }

    const filteredTotal = list.length;
    const paged = list.slice(offset, offset + pageSize);

    return reply.send({
      data: {
        list: paged,
        total: filteredTotal,
        page,
        page_size: pageSize,
        pagination: { page, pageSize, total: filteredTotal },
      },
    });
  });

  /**
   * GET /api/v1/agent/consumption?customer_name=&date_start=&date_end=
   *
   * 返回 { data: { list, total, stats } }（web-console AgentConsumptionPage.tsx）：
   *   list 项：{ id, customer_name, model_name, tokens_in, tokens_out, total_tokens, amount(分), created_at }
   *   stats：{ today_tokens, today_amount(分), month_tokens, month_amount(分) }（名下客户今日/本月聚合，不随筛选变化）
   *   total：筛选后记录数
   */
  app.get('/api/v1/agent/consumption', { preHandler: [jwtAuth] }, async (request, reply) => {
    const agent = await requireAgent(request);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const customerName = String(q.customer_name ?? '').trim();
    const dateStartRaw = String(q.date_start ?? '').trim();
    const dateEndRaw = String(q.date_end ?? '').trim();

    const customerIds = await agentCustomerIds(agent.id);

    const baseConds: any[] = [];
    if (customerIds.length > 0) baseConds.push(inArray(schema.consumptionRecords.userId, customerIds));
    else baseConds.push(sql`1 = 0`);

    // 客户名筛选（name 或 email 模糊）
    if (customerName) {
      baseConds.push(or(
        ilike(schema.users.name, `%${customerName}%`),
        ilike(schema.users.email, `%${customerName}%`),
      ));
    }
    // 日期范围（配合用户 join，避免歧义用 consumption.created_at）
    if (dateStartRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateStartRaw)) {
      baseConds.push(gte(schema.consumptionRecords.createdAt, sql`${dayStart(dateStartRaw)}`));
    }
    if (dateEndRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateEndRaw)) {
      baseConds.push(lte(schema.consumptionRecords.createdAt, sql`${dayEnd(dateEndRaw)}`));
    }

    const needJoin = Boolean(customerName);
    let list: any[] = [];
    let total = 0;

    if (!needJoin) {
      // 无需 join users：直接查消费记录（分页；批量补客户名）
      const where = and(...baseConds);
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: schema.consumptionRecords.id,
            userId: schema.consumptionRecords.userId,
            model: schema.consumptionRecords.model,
            inputTokens: schema.consumptionRecords.inputTokens,
            outputTokens: schema.consumptionRecords.outputTokens,
            totalTokens: schema.consumptionRecords.totalTokens,
            cost: schema.consumptionRecords.cost,
            createdAt: schema.consumptionRecords.createdAt,
          })
          .from(schema.consumptionRecords)
          .where(where)
          .orderBy(desc(schema.consumptionRecords.id)),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.consumptionRecords).where(where),
      ]);
      total = Number(countRows[0]?.count ?? 0);
      // 客户名展示：批量查用户
      const userIds = [...new Set(rows.map((r) => r.userId))];
      const userRows = userIds.length
        ? await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds))
        : [];
      const userMap = new Map(userRows.map((u) => [u.id, u]));
      list = rows.map((r) => {
        const u = userMap.get(r.userId);
        return {
          id: r.id,
          customer_name: customerDisplay(u?.email ?? '', u?.name),
          model_name: r.model,
          tokens_in: r.inputTokens ?? 0,
          tokens_out: r.outputTokens ?? 0,
          total_tokens: r.totalTokens ?? 0,
          amount: yuanToCents(r.cost),
          created_at: r.createdAt.toISOString(),
        };
      });
    } else {
      // 需要 join users（客户名筛选）
      const where = and(...baseConds);
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: schema.consumptionRecords.id,
            userId: schema.consumptionRecords.userId,
            email: schema.users.email,
            name: schema.users.name,
            model: schema.consumptionRecords.model,
            inputTokens: schema.consumptionRecords.inputTokens,
            outputTokens: schema.consumptionRecords.outputTokens,
            totalTokens: schema.consumptionRecords.totalTokens,
            cost: schema.consumptionRecords.cost,
            createdAt: schema.consumptionRecords.createdAt,
          })
          .from(schema.consumptionRecords)
          .innerJoin(schema.users, eq(schema.users.id, schema.consumptionRecords.userId))
          .where(where)
          .orderBy(desc(schema.consumptionRecords.id)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.consumptionRecords)
          .innerJoin(schema.users, eq(schema.users.id, schema.consumptionRecords.userId))
          .where(where),
      ]);
      total = Number(countRows[0]?.count ?? 0);
      list = rows.map((r) => ({
        id: r.id,
        customer_name: customerDisplay(r.email, r.name),
        model_name: r.model,
        tokens_in: r.inputTokens ?? 0,
        tokens_out: r.outputTokens ?? 0,
        total_tokens: r.totalTokens ?? 0,
        amount: yuanToCents(r.cost),
        created_at: r.createdAt.toISOString(),
      }));
    }

    // 今日/本月统计（名下客户，不随筛选）
    let stats = { today_tokens: 0, today_amount: 0, month_tokens: 0, month_amount: 0 };
    if (customerIds.length > 0) {
      const tYmd = todayYmd();
      const mStart = monthStart();
      const [todayAgg, monthAgg] = await Promise.all([
        db
          .select({
            tokens: sql<number>`coalesce(sum(${schema.consumptionRecords.totalTokens}),0)`,
            amount: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)`,
          })
          .from(schema.consumptionRecords)
          .where(and(
            inArray(schema.consumptionRecords.userId, customerIds),
            gte(schema.consumptionRecords.createdAt, sql`${dayStart(tYmd)}`),
            lte(schema.consumptionRecords.createdAt, sql`${dayEnd(tYmd)}`),
          )),
        db
          .select({
            tokens: sql<number>`coalesce(sum(${schema.consumptionRecords.totalTokens}),0)`,
            amount: sql<number>`coalesce(sum(${schema.consumptionRecords.cost}),0)`,
          })
          .from(schema.consumptionRecords)
          .where(and(inArray(schema.consumptionRecords.userId, customerIds), gte(schema.consumptionRecords.createdAt, sql`${mStart}`))),
      ]);
      stats = {
        today_tokens: toNumber(todayAgg?.[0]?.tokens ?? 0),
        today_amount: yuanToCents(todayAgg?.[0]?.amount ?? 0),
        month_tokens: toNumber(monthAgg?.[0]?.tokens ?? 0),
        month_amount: yuanToCents(monthAgg?.[0]?.amount ?? 0),
      };
    }

    return reply.send({ data: { list, total, stats } });
  });
}