// ============================================================
//  3cloud (3C) — 配置版本控制路由
//  GET    /api/v1/admin/config/history                  — 全局配置变更历史
//  GET    /api/v1/admin/config/:type/:key/history       — 单配置变更历史
//  GET    /api/v1/admin/config/version/:versionId       — 获取指定版本详情
//  POST   /api/v1/admin/config/:type/:key/revert/:version — 回滚到指定版本
//  GET    /api/v1/admin/config/:type/:key/diff          — 配置对比
// ============================================================

import { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { systemConfigs, loginSecurityConfigs, users } from "../../../db/schema.js";
import { requirePerm, Perm } from "../../../middleware/auth.js";
import {
  recordConfigChange,
  getConfigHistory,
  getConfigVersion,
  diffConfigs,
  ConfigType,
} from "../../../services/config-version.js";
import { clearSecurityConfigCache } from "../../../services/login-security.js";

export async function configHistoryRoutes(app: FastifyInstance) {
  // ── 全局配置变更历史 ──
  // GET /api/v1/admin/config/history
  app.get("/api/v1/admin/config/history", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const configType = query.configType as ConfigType | undefined;
    const configKey = query.configKey;
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10)));

    const result = await getConfigHistory({
      configKey,
      configType,
      page,
      pageSize,
    });

    // 获取操作者信息
    const db = getDb();
    const operatorIds = [...new Set(result.list.map((r) => r.changedBy).filter(Boolean))] as number[];
    const operators = operatorIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(sql => sql`id IN (${operatorIds.join(",")})`)
      : [];

    const operatorMap = new Map(operators.map((o) => [o.id, o.username]));

    reply.status(200).send({
      code: 0,
      data: {
        list: result.list.map((r) => ({
          ...r,
          changedByUsername: r.changedBy ? operatorMap.get(r.changedBy) ?? null : null,
          createdAt: r.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
      message: "ok",
    });
  });

  // ── 单配置变更历史 ──
  // GET /api/v1/admin/config/:type/:key/history
  app.get("/api/v1/admin/config/:type/:key/history", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const { type, key } = request.params as { type: string; key: string };
    const query = request.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? "20", 10)));

    const result = await getConfigHistory({
      configKey: key,
      configType: type as ConfigType,
      page,
      pageSize,
    });

    // 获取操作者信息
    const db = getDb();
    const operatorIds = [...new Set(result.list.map((r) => r.changedBy).filter(Boolean))] as number[];
    const operators = operatorIds.length > 0
      ? await db.select({ id: users.id, username: users.username }).from(users).where(sql => sql`id IN (${operatorIds.join(",")})`)
      : [];

    const operatorMap = new Map(operators.map((o) => [o.id, o.username]));

    reply.status(200).send({
      code: 0,
      data: {
        list: result.list.map((r) => ({
          ...r,
          changedByUsername: r.changedBy ? operatorMap.get(r.changedBy) ?? null : null,
          createdAt: r.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
      message: "ok",
    });
  });

  // ── 获取指定版本详情 ──
  // GET /api/v1/admin/config/version/:versionId
  app.get("/api/v1/admin/config/version/:versionId", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    const id = parseInt(versionId, 10);

    if (isNaN(id)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的版本 ID" });
      return;
    }

    const version = await getConfigVersion(id);

    if (!version) {
      reply.status(404).send({ code: 404, data: null, message: "版本不存在" });
      return;
    }

    // 获取操作者信息
    let changedByUsername: string | null = null;
    if (version.changedBy) {
      const db = getDb();
      const [user] = await db.select({ username: users.username }).from(users).where(eq(users.id, version.changedBy)).limit(1);
      changedByUsername = user?.username ?? null;
    }

    reply.status(200).send({
      code: 0,
      data: {
        ...version,
        changedByUsername,
        createdAt: version.createdAt.toISOString(),
      },
      message: "ok",
    });
  });

  // ── 配置对比（diff） ──
  // GET /api/v1/admin/config/:type/:key/diff
  app.get("/api/v1/admin/config/:type/:key/diff", {
    preHandler: [requirePerm(Perm.SYSTEM_VIEW)],
  }, async (request, reply) => {
    const { type, key } = request.params as { type: string; key: string };
    const query = request.query as Record<string, string | undefined>;
    const versionId1 = query.versionId1 ? parseInt(query.versionId1, 10) : undefined;
    const versionId2 = query.versionId2 ? parseInt(query.versionId2, 10) : undefined;

    const db = getDb();

    let oldValue: any;
    let newValue: any;

    if (versionId1 && versionId2) {
      // 对比两个版本
      const v1 = await getConfigVersion(versionId1);
      const v2 = await getConfigVersion(versionId2);

      if (!v1 || !v2) {
        reply.status(404).send({ code: 404, data: null, message: "版本不存在" });
        return;
      }

      oldValue = v1.newValue;
      newValue = v2.newValue;
    } else {
      // 对比当前值与最新历史版本
      let currentValue: any;

      if (type === "system") {
        const [row] = await db.select().from(systemConfigs).where(eq(systemConfigs.key, key)).limit(1);
        currentValue = row?.value ? JSON.parse(row.value) : null;
      } else if (type === "login_security") {
        const [row] = await db.select().from(loginSecurityConfigs).where(eq(loginSecurityConfigs.key, key)).limit(1);
        currentValue = row?.value ?? null;
      } else {
        reply.status(400).send({ code: 400, data: null, message: "不支持的配置类型" });
        return;
      }

      // 获取最新历史版本
      const history = await getConfigHistory({ configKey: key, configType: type as ConfigType, page: 1, pageSize: 1 });
      const latestVersion = history.list[0];

      if (!latestVersion) {
        reply.status(404).send({ code: 404, data: null, message: "无历史版本" });
        return;
      }

      oldValue = latestVersion.newValue;
      newValue = currentValue;
    }

    const diff = diffConfigs(oldValue, newValue);

    reply.status(200).send({
      code: 0,
      data: {
        oldValue,
        newValue,
        diff,
      },
      message: "ok",
    });
  });

  // ── 回滚到指定版本 ──
  // POST /api/v1/admin/config/:type/:key/revert/:version
  app.post("/api/v1/admin/config/:type/:key/revert/:version", {
    preHandler: [requirePerm(Perm.SYSTEM_ACTION)],
  }, async (request, reply) => {
    const { type, key, version } = request.params as { type: string; key: string; version: string };
    const operatorId = request.user!.userId;
    const body = request.body as { reason?: string };
    const versionId = parseInt(version, 10);

    if (isNaN(versionId)) {
      reply.status(400).send({ code: 400, data: null, message: "无效的版本 ID" });
      return;
    }

    const targetVersion = await getConfigVersion(versionId);

    if (!targetVersion) {
      reply.status(404).send({ code: 404, data: null, message: "版本不存在" });
      return;
    }

    if (targetVersion.configKey !== key || targetVersion.configType !== type) {
      reply.status(400).send({ code: 400, data: null, message: "版本与配置不匹配" });
      return;
    }

    const db = getDb();
    const revertValue = targetVersion.newValue;

    if (type === "system") {
      const [existing] = await db.select().from(systemConfigs).where(eq(systemConfigs.key, key)).limit(1);

      if (!existing) {
        reply.status(404).send({ code: 404, data: null, message: "配置不存在" });
        return;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(systemConfigs)
          .set({
            value: JSON.stringify(revertValue),
            updatedBy: operatorId,
            updatedAt: new Date(),
          })
          .where(eq(systemConfigs.key, key));

        await recordConfigChange({
          configKey: key,
          configType: "system",
          oldValue: JSON.parse(existing.value),
          newValue: revertValue,
          changedBy: operatorId,
          changeReason: body.reason ?? `回滚到版本 #${versionId}`,
          ip: request.ip,
        });
      });
    } else if (type === "login_security") {
      const [existing] = await db.select().from(loginSecurityConfigs).where(eq(loginSecurityConfigs.key, key)).limit(1);

      if (!existing) {
        reply.status(404).send({ code: 404, data: null, message: "配置不存在" });
        return;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(loginSecurityConfigs)
          .set({
            value: revertValue,
            updatedAt: new Date(),
          })
          .where(eq(loginSecurityConfigs.key, key));

        await recordConfigChange({
          configKey: key,
          configType: "login_security",
          oldValue: existing.value,
          newValue: revertValue,
          changedBy: operatorId,
          changeReason: body.reason ?? `回滚到版本 #${versionId}`,
          ip: request.ip,
        });
      });

      clearSecurityConfigCache();
    } else {
      reply.status(400).send({ code: 400, data: null, message: "不支持的配置类型" });
      return;
    }

    reply.status(200).send({
      code: 0,
      data: null,
      message: `已回滚到版本 #${versionId}`,
    });
  });
}
