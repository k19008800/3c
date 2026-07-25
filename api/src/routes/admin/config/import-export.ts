// ============================================================
//  3cloud (3C) — 系统配置导入导出
//  支持全量导出 JSON、批量导入（upsert）
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../../../db/index.js";
import { systemConfigs, auditLogs } from "../../../db/schema.js";
import { authenticateJWT, requirePerm, Perm } from "../../../middleware/auth.js";
import { recordEnhancedConfigChange } from "../../../services/config-version-enhanced.js";
import { auditActionEnum } from "../../../db/schema/enums.js";

// ── 支持导入导出的配置 key 前缀白名单 ──
// 默认全部允许，可通过此列表限制敏感配置的导出
const ALLOWED_PREFIXES: string[] | null = null; // null = allow all

// ── 字段校验规则 ──
interface ConfigEntry {
  key: string;
  value: any;
  description?: string;
}

interface ValidationError {
  key: string;
  errors: string[];
}

function validateConfigEntry(entry: ConfigEntry): ValidationError | null {
  const errors: string[] = [];

  // key 校验
  if (!entry.key || typeof entry.key !== "string") {
    errors.push("key 必须是非空字符串");
  } else if (entry.key.length > 100) {
    errors.push("key 长度不能超过 100 字符");
  } else if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(entry.key)) {
    errors.push("key 格式无效：必须以字母开头，仅支持字母、数字、点、下划线、连字符");
  }

  // value 校验：允许 string / number / boolean / object / null
  if (entry.value === undefined) {
    errors.push("value 不能为空");
  }

  // description 校验
  if (entry.description !== undefined && entry.description !== null) {
    if (typeof entry.description !== "string") {
      errors.push("description 必须是字符串");
    } else if (entry.description.length > 500) {
      errors.push("description 长度不能超过 500 字符");
    }
  }

  return errors.length > 0 ? { key: entry.key || "<empty>", errors } : null;
}

// ── 安全过滤：是否允许导出/导入该 key ──
function isKeyAllowed(key: string): boolean {
  if (!ALLOWED_PREFIXES) return true;
  return ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export async function configImportExportRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // ── 导出系统配置 ──
  // GET /api/v1/admin/config/export
  app.get("/api/v1/admin/config/export", {
    preHandler: [requirePerm(Perm.CONFIG_VIEW)],
  }, async (request, reply) => {
    const db = getDb();

    const query = request.query as {
      group?: string;
      format?: "json" | "flat";
    };

    const conditions: any[] = [sql`1=1`];
    if (query.group) {
      conditions.push(sql`${systemConfigs.key} LIKE ${query.group + "%"}`);
    }

    const rows = await db
      .select({
        key: systemConfigs.key,
        value: systemConfigs.value,
        description: systemConfigs.description,
        updatedAt: systemConfigs.updatedAt,
        updatedBy: systemConfigs.updatedBy,
      })
      .from(systemConfigs)
      .where(and(...conditions))
      .orderBy(systemConfigs.key);

    // 过滤敏感配置
    const filtered = rows.filter((r) => isKeyAllowed(r.key));

    if (query.format === "flat") {
      // 扁平格式：{ key: parsedValue }
      const flat: Record<string, any> = {};
      for (const row of filtered) {
        try {
          flat[row.key] = JSON.parse(row.value);
        } catch {
          flat[row.key] = row.value;
        }
      }
      reply.status(200).send({
        code: 0,
        data: flat,
        message: "ok",
      });
      return;
    }

    // 标准格式：数组对象
    const exported = filtered.map((r) => ({
      key: r.key,
      value: (() => {
        try {
          return JSON.parse(r.value);
        } catch {
          return r.value;
        }
      })(),
      description: r.description ?? undefined,
      updatedAt: r.updatedAt?.toISOString(),
      updatedBy: r.updatedBy ?? undefined,
    }));

    // 设置响应头提示下载
    reply.header(
      "Content-Disposition",
      `attachment; filename="system-configs-${new Date().toISOString().slice(0, 10)}.json"`
    );
    reply.header("Content-Type", "application/json; charset=utf-8");

    reply.status(200).send({
      code: 0,
      data: {
        exportTime: new Date().toISOString(),
        totalCount: exported.length,
        configs: exported,
      },
      message: "导出成功",
    });
  });

  // ── 导入系统配置 ──
  // POST /api/v1/admin/config/import
  app.post("/api/v1/admin/config/import", {
    preHandler: [requirePerm(Perm.CONFIG_EDIT)],
  }, async (request, reply) => {
    const db = getDb();
    const operatorId = request.user!.userId;
    const ip = request.ip;

    // 支持两种请求体格式：
    // 1. 直接数组：[{ key, value, description }, ...]
    // 2. 包裹对象：{ configs: [...], mode: "upsert"|"skip", dryRun: boolean }
    const body = request.body as
      | ConfigEntry[]
      | {
          configs: ConfigEntry[];
          mode?: "upsert" | "skip" | "overwrite";
          dryRun?: boolean;
        };

    let entries: ConfigEntry[];
    let mode: "upsert" | "skip" | "overwrite" = "upsert";
    let dryRun = false;

    if (Array.isArray(body)) {
      entries = body;
    } else if (body && Array.isArray(body.configs)) {
      entries = body.configs;
      if (body.mode) mode = body.mode;
      if (body.dryRun) dryRun = true;
    } else {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "请求体格式无效：需要数组 [{key, value}] 或 {configs: [...], mode?: string}",
      });
      return;
    }

    // 空数据校验
    if (entries.length === 0) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "导入数据不能为空",
      });
      return;
    }

    // 批量大小限制
    if (entries.length > 500) {
      reply.status(400).send({
        code: 400,
        data: null,
        message: "单次导入最多支持 500 项配置",
      });
      return;
    }

    // ── 字段校验 ──
    const validationResults: ValidationError[] = [];
    const validEntries: ConfigEntry[] = [];

    for (const entry of entries) {
      const err = validateConfigEntry(entry);
      if (err) {
        validationResults.push(err);
      } else {
        validEntries.push(entry);
      }
    }

    // 校验失败时，如果所有条目都失败则直接拒绝
    if (validationResults.length > 0 && validEntries.length === 0) {
      reply.status(400).send({
        code: 400,
        data: {
          total: entries.length,
          validCount: 0,
          validationErrors: validationResults,
        },
        message: `所有 ${entries.length} 项配置均未通过字段校验`,
      });
      return;
    }

    // 安全过滤
    const allowedEntries = validEntries.filter((e) => isKeyAllowed(e.key));
    const blockedKeys = validEntries
      .filter((e) => !isKeyAllowed(e.key))
      .map((e) => e.key);

    if (allowedEntries.length === 0 && blockedKeys.length > 0) {
      reply.status(403).send({
        code: 403,
        data: {
          blockedKeys,
        },
        message: "所有配置均被安全策略拦截，不允许导入",
      });
      return;
    }

    // ── 查询现有配置 ──
    const keys = allowedEntries.map((e) => e.key);
    const existingRows = keys.length > 0
      ? await db
          .select({ key: systemConfigs.key, id: systemConfigs.id, value: systemConfigs.value, version: systemConfigs.version })
          .from(systemConfigs)
          .where(sql`${systemConfigs.key} IN (${keys.join(",")})`)
      : [];

    const existingMap = new Map(existingRows.map((r) => [r.key, r]));

    // 分类：新增 vs 更新 vs 跳过
    const toInsert: ConfigEntry[] = [];
    const toUpdate: Array<{ entry: ConfigEntry; existing: typeof existingRows[0] }> = [];
    const skipped: string[] = [];

    for (const entry of allowedEntries) {
      const existing = existingMap.get(entry.key);
      if (!existing) {
        toInsert.push(entry);
      } else if (mode === "skip") {
        skipped.push(entry.key);
      } else {
        toUpdate.push({ entry, existing });
      }
    }

    // ── dry run：只返回预览结果 ──
    if (dryRun) {
      reply.status(200).send({
        code: 0,
        data: {
          mode,
          dryRun: true,
          total: allowedEntries.length,
          toInsert: toInsert.length,
          toUpdate: toUpdate.length,
          skipped: skipped.length,
          blocked: blockedKeys.length,
          validationErrors: validationResults.length > 0 ? validationResults : undefined,
          preview: {
            newConfigs: toInsert.map((e) => ({
              key: e.key,
              value: e.value,
              description: e.description,
            })),
            updatedConfigs: toUpdate.map(({ entry, existing }) => ({
              key: entry.key,
              oldValue: (() => {
                try {
                  return JSON.parse(existing.value);
                } catch {
                  return existing.value;
                }
              })(),
              newValue: entry.value,
            })),
            skippedKeys: skipped.length > 0 ? skipped : undefined,
            blockedKeys: blockedKeys.length > 0 ? blockedKeys : undefined,
          },
        },
        message: `预览：将新增 ${toInsert.length} 项，更新 ${toUpdate.length} 项，跳过 ${skipped.length} 项`,
      });
      return;
    }

    // ── 执行导入 ──
    const results: Array<{
      key: string;
      action: "created" | "updated" | "skipped" | "blocked";
      oldValue?: any;
      newValue?: any;
    }> = [];
    const errors: string[] = [];

    await db.transaction(async (tx) => {
      // 新增配置
      for (const entry of toInsert) {
        try {
          const [inserted] = await tx
            .insert(systemConfigs)
            .values({
              key: entry.key,
              value: JSON.stringify(entry.value),
              description: entry.description ?? null,
              updatedBy: operatorId,
            })
            .returning({ id: systemConfigs.id });

          // 记录版本变更
          await recordEnhancedConfigChange({
            configKey: entry.key,
            configType: "system",
            oldValue: null,
            newValue: entry.value,
            changedBy: operatorId,
            ip,
            source: "api",
          });

          // 审计日志
          await tx.insert(auditLogs).values({
            operatorId,
            action: "system_config_create" as any,
            targetType: "config",
            targetId: inserted.id,
            after: entry.value,
            ip,
            description: `导入新增配置 ${entry.key}`,
          });

          results.push({
            key: entry.key,
            action: "created",
            newValue: entry.value,
          });
        } catch (error: any) {
          errors.push(`创建配置 "${entry.key}" 失败: ${error.message}`);
        }
      }

      // 更新配置
      for (const { entry, existing } of toUpdate) {
        try {
          // 检查值是否真的变了（mode=overwrite 时强制更新）
          let oldParsed: any;
          try {
            oldParsed = JSON.parse(existing.value);
          } catch {
            oldParsed = existing.value;
          }

          const isSame = mode === "overwrite"
            ? false
            : JSON.stringify(oldParsed) === JSON.stringify(entry.value);

          if (isSame) {
            results.push({
              key: entry.key,
              action: "skipped",
              oldValue: oldParsed,
              newValue: entry.value,
            });
            continue;
          }

          await tx
            .update(systemConfigs)
            .set({
              value: JSON.stringify(entry.value),
              description: entry.description !== undefined ? entry.description : undefined,
              updatedBy: operatorId,
              updatedAt: new Date(),
            })
            .where(eq(systemConfigs.key, entry.key));

          // 记录版本变更
          await recordEnhancedConfigChange({
            configKey: entry.key,
            configType: "system",
            oldValue: oldParsed,
            newValue: entry.value,
            changedBy: operatorId,
            changeReason: "配置导入更新",
            ip,
            version: existing.version ?? 1,
            source: "api",
          });

          // 审计日志
          await tx.insert(auditLogs).values({
            operatorId,
            action: "system_config_update" as any,
            targetType: "config",
            targetId: existing.id,
            before: oldParsed,
            after: entry.value,
            ip,
            description: `导入更新配置 ${entry.key}`,
          });

          results.push({
            key: entry.key,
            action: "updated",
            oldValue: oldParsed,
            newValue: entry.value,
          });
        } catch (error: any) {
          errors.push(`更新配置 "${entry.key}" 失败: ${error.message}`);
        }
      }
    });

    // 记录跳过和拦截的条目
    for (const key of skipped) {
      results.push({ key, action: "skipped" });
    }
    for (const key of blockedKeys) {
      results.push({ key, action: "blocked" });
    }

    // ── 统计 ──
    const createdCount = results.filter((r) => r.action === "created").length;
    const updatedCount = results.filter((r) => r.action === "updated").length;
    const skippedCount = results.filter((r) => r.action === "skipped").length;
    const blockedCount = results.filter((r) => r.action === "blocked").length;

    reply.status(200).send({
      code: 0,
      data: {
        mode,
        total: allowedEntries.length + blockedKeys.length,
        created: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        blocked: blockedCount,
        errors: errors.length > 0 ? errors : undefined,
        validationErrors: validationResults.length > 0 ? validationResults : undefined,
        results,
      },
      message:
        `导入完成：新增 ${createdCount} 项，更新 ${updatedCount} 项，跳过 ${skippedCount} 项` +
        (blockedCount > 0 ? `，拦截 ${blockedCount} 项` : ""),
    });
  });
}
