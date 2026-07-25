// ============================================================
//  3cloud (3C) — 配置版本控制路由（完整版）
//  包含快照管理、审批流程、批量操作等功能
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { 
  configChangeRequests, 
  configSnapshots,
  users 
} from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import {
  recordEnhancedConfigChange,
  createConfigSnapshot,
  restoreConfigSnapshot,
  getConfigSnapshots,
  createConfigChangeRequest,
  processConfigChangeRequest,
  evaluateConfigChangeImpact,
  getConfigDependencies,
  ConfigType
} from "../../../services/config-version-enhanced.js";

export async function configVersionsRoutes(app: FastifyInstance) {
  // ── 创建配置快照 ──
  // POST /api/v1/admin/config/snapshots
  app.post("/api/v1/admin/config/snapshots", {
    preHandler: [requirePerm(Perm.SYSTEM_ACTION)],
  }, async (request, reply) => {
    const body = request.body as {
      name: string;
      description?: string;
      configType: ConfigType;
      isActive?: boolean;
    };

    if (!body.name || !body.configType) {
      reply.status(400).send({ code: 400, data: null, message: "名称和配置类型为必填项" });
      return;
    }

    try {
      const snapshotId = await createConfigSnapshot({
        name: body.name,
        description: body.description,
        configType: body.configType,
        createdBy: request.user!.userId,
        isActive: body.isActive
      });

      reply.status(201).send({
        code: 0, data: { snapshotId },
        message: "配置快照创建成功"
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `创建快照失败: ${error.message}` 
      });
    }
  });

  // ── 获取配置快照列表 ──
  // GET /api/v1/admin/config/snapshots
  app.get("/api/v1/admin/config/snapshots", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const configType = query.configType as ConfigType | undefined;
    const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10)));

    try {
      const result = await getConfigSnapshots({
        configType,
        isActive,
        page,
        pageSize,
      });

      // 获取创建者信息
      const db = getDb();
      const creatorIds = [...new Set(result.list.map((r) => r.createdBy).filter(Boolean))] as number[];
      const creators = creatorIds.length > 0
        ? await db.select({ id: users.id, username: users.username }).from(users).where(sql => sql`id IN (${creatorIds.join(",")})`)
        : [];

      const creatorMap = new Map(creators.map((c) => [c.id, c.username]));

      reply.status(200).send({
        code: 0,
        data: {
          list: result.list.map((r) => ({
            ...r,
            createdByUsername: r.createdBy ? creatorMap.get(r.createdBy) ?? null : null,
            createdAt: r.createdAt.toISOString(),
          })),
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
        },
        message: "ok",
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `获取快照列表失败: ${error.message}` 
      });
    }
  });

  // ── 恢复配置快照 ──
  // POST /api/v1/admin/config/snapshots/:snapshotId/restore
  app.post("/api/v1/admin/config/snapshots/:snapshotId/restore", {
    preHandler: [requirePerm(Perm.SYSTEM_ACTION)],
  }, async (request, reply) => {
    const { snapshotId } = request.params as { snapshotId: string };
    const id = parseInt(snapshotId, 10);
    const body = request.body as { reason?: string };

    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的快照 ID" });
      return;
    }

    try {
      const result = await restoreConfigSnapshot(id, request.user!.userId);

      reply.status(200).send({
        code: 0,
        data: result,
        message: `成功恢复快照，应用了 ${result.changesApplied} 项变更`
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `恢复快照失败: ${error.message}` 
      });
    }
  });

  // ── 获取快照详情 ──
  // GET /api/v1/admin/config/snapshots/:snapshotId
  app.get("/api/v1/admin/config/snapshots/:snapshotId", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const { snapshotId } = request.params as { snapshotId: string };
    const id = parseInt(snapshotId, 10);

    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的快照 ID" });
      return;
    }

    try {
      const db = getDb();
      const [snapshot] = await db
        .select()
        .from(configSnapshots)
        .where(eq(configSnapshots.id, id))
        .limit(1);

      if (!snapshot) {
        reply.status(404).send({ code: 404, data: null, message: "快照不存在" });
        return;
      }

      // 获取创建者信息
      let createdByUsername: string | null = null;
      if (snapshot.createdBy) {
        const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, snapshot.createdBy)).limit(1);
        createdByUsername = user?.username ?? null;
      }

      reply.status(200).send({
        code: 0,
        data: {
          id: snapshot.id,
          name: snapshot.name,
          description: snapshot.description,
          configType: snapshot.configType,
          configData: snapshot.configData,
          createdBy: snapshot.createdBy,
          createdByUsername,
          isActive: snapshot.isActive,
          createdAt: snapshot.createdAt.toISOString(),
        },
        message: "ok",
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `获取快照详情失败: ${error.message}` 
      });
    }
  });

  // ── 创建配置变更请求（审批流程） ──
  // POST /api/v1/admin/config/change-requests
  app.post("/api/v1/admin/config/change-requests", {
    preHandler: [requirePerm(Perm.SYSTEM_EDIT)],
  }, async (request, reply) => {
    const body = request.body as {
      configKey: string;
      configType: ConfigType;
      newValue: any;
      requestReason: string;
    };

    if (!body.configKey || !body.configType || !body.requestReason) {
      reply.status(400).send({ code: 400, data: null, message: "配置键、类型和变更原因为必填项" });
      return;
    }

    try {
      const db = getDb();
      let oldValue: any = null;

      // 获取当前值
      if (body.configType === 'system') {
        const [config] = await db
          .select({ value: systemConfigs.value })
          .from(systemConfigs)
          .where(eq(systemConfigs.key, body.configKey))
          .limit(1);
        
        oldValue = config?.value ? JSON.parse(config.value) : null;
      }

      // 评估变更影响
      const impact = evaluateConfigChangeImpact({
        configKey: body.configKey,
        configType: body.configType,
        oldValue,
        newValue: body.newValue
      });

      // 获取依赖关系
      const dependencies = getConfigDependencies(body.configKey, body.configType);

      const requestId = await createConfigChangeRequest({
        configKey: body.configKey,
        configType: body.configType,
        oldValue,
        newValue: body.newValue,
        requestedBy: request.user!.userId,
        requestReason: body.requestReason
      });

      reply.status(201).send({
        code: 0,
        data: { 
          requestId,
          impact,
          dependencies
        },
        message: "配置变更请求已创建"
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `创建变更请求失败: ${error.message}` 
      });
    }
  });

  // ── 获取配置变更请求列表 ──
  // GET /api/v1/admin/config/change-requests
  app.get("/api/v1/admin/config/change-requests", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const status = query.status;
    const configType = query.configType as ConfigType | undefined;
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10)));

    try {
      const db = getDb();
      const conditions = [];
      if (status) {
        conditions.push(eq(configChangeRequests.status, status));
      }
      if (configType) {
        conditions.push(eq(configChangeRequests.configType, configType));
      }

      // 查询总数
      const [totalRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(configChangeRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      const total = Number(totalRes?.count ?? 0);

      // 查询列表
      const offset = (page - 1) * pageSize;
      const rows = await db
        .select()
        .from(configChangeRequests)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(configChangeRequests.createdAt))
        .limit(pageSize)
        .offset(offset);

      // 获取请求者和审批者信息
      const userIds = [
        ...new Set([
          ...rows.map(r => r.requestedBy),
          ...rows.map(r => r.reviewedBy).filter(Boolean)
        ])
      ].filter(Boolean) as number[];

      const usersList = userIds.length > 0
        ? await db.select({ id: users.id, username: users.username }).from(users).where(sql => sql`id IN (${userIds.join(",")})`)
        : [];

      const userMap = new Map(usersList.map((u) => [u.id, u.username]));

      reply.status(200).send({
        code: 0,
        data: {
          list: rows.map((r) => ({
            id: r.id,
            configKey: r.configKey,
            configType: r.configType,
            oldValue: r.oldValue ? JSON.parse(r.oldValue) : null,
            newValue: r.newValue ? JSON.parse(r.newValue) : null,
            requestedBy: r.requestedBy,
            requestedByUsername: userMap.get(r.requestedBy) ?? null,
            requestReason: r.requestReason,
            status: r.status,
            reviewedBy: r.reviewedBy,
            reviewedByUsername: r.reviewedBy ? userMap.get(r.reviewedBy) ?? null : null,
            reviewNotes: r.reviewNotes,
            reviewedAt: r.reviewedAt?.toISOString(),
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
          total,
          page,
          pageSize,
        },
        message: "ok",
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `获取变更请求列表失败: ${error.message}` 
      });
    }
  });

  // ── 处理配置变更请求 ──
  // POST /api/v1/admin/config/change-requests/:requestId/process
  app.post("/api/v1/admin/config/change-requests/:requestId/process", {
    preHandler: [requirePerm(Perm.SYSTEM_ACTION)],
  }, async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const id = parseInt(requestId, 10);
    const body = request.body as {
      approve: boolean;
      reviewNotes?: string;
    };

    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的请求 ID" });
      return;
    }

    try {
      const result = await processConfigChangeRequest({
        requestId: id,
        reviewerId: request.user!.userId,
        approve: body.approve,
        reviewNotes: body.reviewNotes
      });

      reply.status(200).send({
        code: 0,
        data: result,
        message: body.approve ? "变更请求已批准" : "变更请求已拒绝"
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `处理变更请求失败: ${error.message}` 
      });
    }
  });

  // ── 获取配置变更请求详情 ──
  // GET /api/v1/admin/config/change-requests/:requestId
  app.get("/api/v1/admin/config/change-requests/:requestId", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const { requestId } = request.params as { requestId: string };
    const id = parseInt(requestId, 10);

    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的请求 ID" });
      return;
    }

    try {
      const db = getDb();
      const [request] = await db
        .select()
        .from(configChangeRequests)
        .where(eq(configChangeRequests.id, id))
        .limit(1);

      if (!request) {
        reply.status(404).send({ code: 404, data: null, message: "变更请求不存在" });
        return;
      }

      // 获取用户信息
      const [requester] = await db
        .select({ username: users.username })
        .from(users)
        .where(eq(users.id, request.requestedBy))
        .limit(1);

      let reviewer: { username: string } | null = null;
      if (request.reviewedBy) {
        const [reviewerRow] = await db
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, request.reviewedBy))
          .limit(1);
        reviewer = reviewerRow || null;
      }

      // 评估变更影响
      const impact = evaluateConfigChangeImpact({
        configKey: request.configKey,
        configType: request.configType as ConfigType,
        oldValue: request.oldValue ? JSON.parse(request.oldValue) : null,
        newValue: request.newValue ? JSON.parse(request.newValue) : null
      });

      // 获取依赖关系
      const dependencies = getConfigDependencies(request.configKey, request.configType as ConfigType);

      reply.status(200).send({
        code: 0,
        data: {
          id: request.id,
          configKey: request.configKey,
          configType: request.configType,
          oldValue: request.oldValue ? JSON.parse(request.oldValue) : null,
          newValue: request.newValue ? JSON.parse(request.newValue) : null,
          requestedBy: request.requestedBy,
          requestedByUsername: requester?.username ?? null,
          requestReason: request.requestReason,
          status: request.status,
          reviewedBy: request.reviewedBy,
          reviewedByUsername: reviewer?.username ?? null,
          reviewNotes: request.reviewNotes,
          reviewedAt: request.reviewedAt?.toISOString(),
          createdAt: request.createdAt.toISOString(),
          updatedAt: request.updatedAt.toISOString(),
          impact,
          dependencies
        },
        message: "ok",
      });
    } catch (error: any) {
      reply.status(500).send({ 
        code: 500, 
        data: null, 
        message: `获取变更请求详情失败: ${error.message}` 
      });
    }
  });
}