/**
 * 供应商旧 6 页别名路由 + 磁盘缓存管理完整闭环 — 测试（gap-fix-spec §10/§11/§12）
 *
 * 覆盖：
 *   - 权限：未登录 → 401；非 admin → 403
 *   - vendor-profiles / vendor-pricing（含 batch-adjust）/ vendor-costs /
 *     vendor-stats / vendor-performance / vendor-models 列表与写操作
 *   - vendor-keys toggle/delete、vendors toggle-status、vendors models/keys
 *   - sys/cache/temp-stats（含目录不存在容错）、sys/cache/config GET/PUT
 *   - temp-cleanup 调度器单次运行（runTempCleanupOnce）可调用不抛错
 *   - IP 黑名单 DELETE
 *
 * 运行：cd 3cloud/api && npx vitest run src/routes/vendor-alias.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { runTempCleanupOnce, startTempCleanupScheduler } from '../services/upstream/temp-cleanup';

const testEnv = {
  LOG_LEVEL: 'error',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/threecloud_v3',
  JWT_SECRET: 'test-jwt-secret-vendor-alias',
  PORT: '3039',
};

describe('Vendor Alias + Disk Cache Loop', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let customerToken: string;
  let adminUserId: number;
  let supplierId: number;
  let modelId: number;
  let pricingId: number;
  let tempDir: string;

  const ts = Date.now();
  const adminEmail = `admin-alias-${ts}@test.com`;
  const customerEmail = `cust-alias-${ts}@test.com`;
  const supplierName = `AliasSup-${ts}`;
  const modelName = `alias-model-${ts}`;

  beforeAll(async () => {
    // 临时资产目录（temp-stats / temp-cleanup 测试用）
    tempDir = await mkdtemp(path.join(os.tmpdir(), '3cloud-tmp-cache-'));
    process.env.MULTIMODAL_TMP_DIR = tempDir;

    app = await buildApp({ envOverrides: testEnv });
    // 别名路由已由主 agent 在 app.ts 统一注册（buildApp 内），此处不再自注册
    // 调度器同样由主 agent 注册；此处按「ready 前注册」路径验证，onClose 在 afterAll 清理 interval
    startTempCleanupScheduler(app);
    await app.ready();

    const { db, schema } = await import('../db');
    const { eq } = await import('drizzle-orm');

    // ── Admin ──
    const adminRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: adminEmail, password: 'Admin12345', name: 'Admin Alias' },
    });
    expect(adminRes.statusCode).toBe(201);
    const [adminUser] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, adminEmail)).limit(1);
    adminUserId = adminUser!.id;
    await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.email, adminEmail));
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: 'Admin12345' },
    });
    expect(adminLogin.statusCode).toBe(200);
    adminToken = JSON.parse(adminLogin.payload).accessToken;

    // ── Customer（非 admin）──
    const custRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/register',
      payload: { email: customerEmail, password: 'Cust12345', name: 'Customer Alias' },
    });
    expect(custRes.statusCode).toBe(201);
    const custLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: customerEmail, password: 'Cust12345' },
    });
    customerToken = JSON.parse(custLogin.payload).accessToken;

    // ── 供应商 + 模型 + 定价（走既有 suppliers 体系创建）──
    const supRes = await app.inject({
      method: 'POST', url: '/api/v1/admin/suppliers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: supplierName, code: `alias-${ts}`, baseUrl: 'https://api.alias.test.com', apiType: 'openai' },
    });
    expect(supRes.statusCode).toBe(201);
    supplierId = JSON.parse(supRes.payload).supplier.id as number;

    const modelRes = await app.inject({
      method: 'POST', url: `/api/v1/admin/suppliers/${supplierId}/models`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { modelName, platformModel: `alias-upstream-${ts}`, inputPrice: '0.001', outputPrice: '0.002' },
    });
    expect(modelRes.statusCode).toBe(201);
    modelId = JSON.parse(modelRes.payload).model.id as number;

    const priceRes = await app.inject({
      method: 'POST', url: '/api/v1/admin/pricing',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { supplierModelId: modelId, inputPrice: '0.01', outputPrice: '0.02', status: 'active' },
    });
    expect(priceRes.statusCode).toBe(201);
    pricingId = JSON.parse(priceRes.payload).pricing.id as number;

    // ── 消费记录（分区表有 DEFAULT 兜底子表，raw SQL 直接插入）──
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`
      INSERT INTO consumption_records (user_id, request_id, model, supplier_id, input_tokens, output_tokens, total_tokens, cost, error_code, created_at)
      VALUES (${adminUserId}, ${`alias-req-ok-${ts}`}, ${modelName}, ${supplierId}, 100, 200, 300, 0.05, NULL, now())
    `);
    await db.execute(sql`
      INSERT INTO consumption_records (user_id, request_id, model, supplier_id, input_tokens, output_tokens, total_tokens, cost, error_code, created_at)
      VALUES (${adminUserId}, ${`alias-req-err-${ts}`}, ${modelName}, ${supplierId}, 10, 20, 30, 0.01, 'upstream_error', now())
    `);

    // ── 清理历史 media.* 配置（此前运行可能写入 temp_ttl_hours=12 等），
    //    保证「GET 返回默认配置」断言确定性 ──
    await db.delete(schema.systemConfig)
      .where(sql`${schema.systemConfig.key} LIKE 'media.%'`)
      .catch(() => {});
  });

  afterAll(async () => {
    await app.close();
    // 清理临时目录（含 missing-dir 测试场景目录）
    await rm(tempDir, { recursive: true, force: true });
    await rm(path.join(os.tmpdir(), '3cloud-tmp-cache-missing'), { recursive: true, force: true });
  });

  // ═══════════════════════════════════════
  // 1. 权限：401 / 403
  // ═══════════════════════════════════════

  describe('权限', () => {
    it('未登录访问 vendor-profiles → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/vendor-profiles' });
      expect(res.statusCode).toBe(401);
    });

    it('未登录访问 sys/cache/temp-stats → 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/sys/cache/temp-stats' });
      expect(res.statusCode).toBe(401);
    });

    it('非 admin 访问 vendor-profiles → 403', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/vendor-profiles',
        headers: { authorization: `Bearer ${customerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('非 admin 访问 vendor-pricing → 403', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/vendor-pricing',
        headers: { authorization: `Bearer ${customerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ═══════════════════════════════════════
  // 2. vendor-profiles（suppliers 表映射）
  // ═══════════════════════════════════════

  describe('vendor-profiles', () => {
    it('GET 列表 → 200 且 data.list 含新建供应商', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/vendor-profiles',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data.list)).toBe(true);
      const found = body.data.list.find((v: any) => v.id === supplierId);
      expect(found).toBeDefined();
      expect(found.name).toBe(supplierName);
      expect(found.base_url).toBe('https://api.alias.test.com');
    });

    it('GET 列表支持 keyword 过滤', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/vendor-profiles?keyword=${encodeURIComponent(supplierName)}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.list.length).toBeGreaterThanOrEqual(1);
      expect(body.data.list[0].name).toBe(supplierName);
    });

    it('PUT 更新 → 200 且写 audit_logs', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/vendor-profiles/${supplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { description: '别名更新描述', status: 'maintenance' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.description).toBe('别名更新描述');
      expect(body.data.status).toBe('maintenance');

      const { db, schema } = await import('../db');
      const { eq, and } = await import('drizzle-orm');
      const [audit] = await db.select({ id: schema.auditLogs.id })
        .from(schema.auditLogs)
        .where(and(eq(schema.auditLogs.action, 'vendor_profiles.update'), eq(schema.auditLogs.resourceId, String(supplierId))))
        .limit(1);
      expect(audit).toBeDefined();
    });
  });

  // ═══════════════════════════════════════
  // 3. vendor-pricing（vendor_pricing 表映射）
  // ═══════════════════════════════════════

  describe('vendor-pricing', () => {
    it('GET 列表 → 200 且 data.list 含售价/成本字段', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/vendor-pricing?page_size=50`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data.list)).toBe(true);
      const item = body.data.list.find((p: any) => p.id === pricingId);
      expect(item).toBeDefined();
      expect(item.model).toBe(modelName);
      expect(item.provider).toBe(supplierName);
      expect(item.input_price).toBe(0.01);
      expect(item.sell_input_price).toBe(0.01);
      expect(item.cost_input_price).toBe(0.001);
      expect(item.status).toBe('active');
    });

    it('PUT 更新售价（sell_input_price）→ 200', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/vendor-pricing/${pricingId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { sell_input_price: 0.015, sell_output_price: 0.025 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.input_price).toBe(0.015);
      expect(body.data.output_price).toBe(0.025);
    });

    it('POST batch-adjust（ids + multiplier）→ 200 updated>=1', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/vendor-pricing/batch-adjust',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ids: [pricingId], multiplier: 1.5 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.updated).toBeGreaterThanOrEqual(1);
    });

    it('POST batch-adjust 缺少 ids/filter → 400', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/admin/vendor-pricing/batch-adjust',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { multiplier: 1.5 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ═══════════════════════════════════════
  // 4. vendor-costs（supplier_models 成本映射）
  // ═══════════════════════════════════════

  describe('vendor-costs', () => {
    it('GET 列表 → 200 且 data.list 含成本字段', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/vendor-costs?page_size=50`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data.list)).toBe(true);
      const item = body.data.list.find((c: any) => c.id === modelId);
      expect(item).toBeDefined();
      expect(item.supplier_id).toBe(supplierId);
      expect(item.model).toBe(modelName);
      expect(item.cost_per_1k).toBe(0.001);
      expect(item.cost_input_price).toBe(0.001);
      expect(item.vendor_name).toBe(supplierName);
    });

    it('PUT 更新成本 → 200', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/vendor-costs/${modelId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { cost_input_price: 0.002, cost_output_price: 0.003 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.cost_input_price).toBe(0.002);
      expect(body.data.cost_output_price).toBe(0.003);
    });
  });

  // ═══════════════════════════════════════
  // 5. vendor-stats / vendor-performance（consumption_records 聚合）
  // ═══════════════════════════════════════

  describe('vendor-stats / vendor-performance', () => {
    it('GET vendor-stats?period=month → 200 且 data.list 含聚合行', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/vendor-stats?period=month',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data.list)).toBe(true);
      const row = body.data.list.find((r: any) => r.supplier_name === supplierName && r.model === modelName);
      expect(row).toBeDefined();
      expect(row.calls).toBeGreaterThanOrEqual(2);
      expect(row.users).toBeGreaterThanOrEqual(1);
      expect(row.tokens).toBeGreaterThanOrEqual(30);
    });

    it('GET vendor-performance?period=month → 200 且 data.list 含错误统计', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/vendor-performance?period=month',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data.list)).toBe(true);
      const row = body.data.list.find((r: any) => r.supplier_name === supplierName);
      expect(row).toBeDefined();
      expect(row.calls).toBeGreaterThanOrEqual(2);
      expect(row.error_count).toBeGreaterThanOrEqual(1);
      expect(typeof row.success_rate).toBe('number');
      expect(typeof row.avg_latency_ms).toBe('number');
    });
  });

  // ═══════════════════════════════════════
  // 6. vendor-models（supplier_models 映射 + priority 落 system_config）
  // ═══════════════════════════════════════

  describe('vendor-models', () => {
    it('GET 列表（vendor_id 过滤）→ 200 且含新建模型', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/admin/vendor-models?vendor_id=${supplierId}&page_size=50`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body.data.list)).toBe(true);
      const item = body.data.list.find((m: any) => m.id === modelId);
      expect(item).toBeDefined();
      expect(item.model).toBe(modelName);
      expect(item.supplier_id).toBe(supplierId);
      expect(item.is_enabled).toBe(true);
      expect(item.priority).toBe(0);
    });

    it('PUT is_enabled=false → 200 且 is_enabled=false', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/vendor-models/${modelId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { is_enabled: false },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.is_enabled).toBe(false);
    });

    it('PUT priority=7 → 200 且持久化（再次 GET 可读）', async () => {
      const res = await app.inject({
        method: 'PUT', url: `/api/v1/admin/vendor-models/${modelId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { priority: 7 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.priority).toBe(7);

      const listRes = await app.inject({
        method: 'GET', url: `/api/v1/admin/vendor-models?vendor_id=${supplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const listBody = JSON.parse(listRes.payload);
      const item = listBody.data.list.find((m: any) => m.id === modelId);
      expect(item.priority).toBe(7);
      expect(item.is_enabled).toBe(false);
    });
  });

  // ═══════════════════════════════════════
  // 7. vendor-keys + vendors（supplier_keys / suppliers 映射）
  // ═══════════════════════════════════════

  describe('vendor-keys / vendors', () => {
    let keyId: number;

    it('POST vendors/:id/keys 添加 Key → 201', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/admin/vendors/${supplierId}/keys`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { keyValue: 'sk-alias-test-abc123', name: 'Alias Key', priority: 3 },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      keyId = body.data.id as number;
      expect(body.data.keyValue).toContain('***');
    });

    it('POST vendor-keys/:id/toggle is_enabled=false → 200', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/admin/vendor-keys/${keyId}/toggle`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { is_enabled: false },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.is_enabled).toBe(false);
    });

    it('DELETE vendor-keys/:id → 200；再删 → 404', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/vendor-keys/${keyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const again = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/vendor-keys/${keyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(again.statusCode).toBe(404);
    });

    it('POST vendors/:id/toggle-status → 200', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/admin/vendors/${supplierId}/toggle-status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'maintenance' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.status).toBe('maintenance');
    });

    it('POST vendors/:id/models 添加模型 → 201', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/admin/vendors/${supplierId}/models`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { modelName: `alias-model-2-${ts}`, platformModel: `alias-upstream-2-${ts}`, inputPrice: '0.003', outputPrice: '0.004' },
      });
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.supplier_id).toBe(supplierId);
    });
  });

  // ═══════════════════════════════════════
  // 8. sys/cache/temp-stats（磁盘扫描 + 目录不存在容错）
  // ═══════════════════════════════════════

  describe('sys/cache/temp-stats', () => {
    it('目录存在且有文件 → 200 且 file_count/dir_size >= 0', async () => {
      await writeFile(path.join(tempDir, 'sample.bin'), Buffer.alloc(1024, 1));
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/sys/cache/temp-stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(typeof body.data.file_count).toBe('number');
      expect(body.data.file_count).toBeGreaterThanOrEqual(1);
      expect(typeof body.data.dir_size).toBe('number');
      expect(body.data.dir_size).toBeGreaterThanOrEqual(1024);
      expect(typeof body.data.usage_pct).toBe('number');
      expect(body.data.dir_path).toBe(tempDir);
      expect(body.data.hit_count).toBe(0);
    });

    it('目录不存在 → 200 且 file_count=0 / dir_size=0 不报错', async () => {
      const missing = path.join(os.tmpdir(), '3cloud-tmp-cache-missing');
      process.env.MULTIMODAL_TMP_DIR = missing;
      try {
        const res = await app.inject({
          method: 'GET', url: '/api/v1/admin/sys/cache/temp-stats',
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.payload);
        expect(body.data.file_count).toBe(0);
        expect(body.data.dir_size).toBe(0);
        expect(body.data.usage_pct).toBe(0);
      } finally {
        process.env.MULTIMODAL_TMP_DIR = tempDir;
      }
    });
  });

  // ═══════════════════════════════════════
  // 9. sys/cache/config GET/PUT
  // ═══════════════════════════════════════

  describe('sys/cache/config', () => {
    it('GET → 200 返回默认配置', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/admin/sys/cache/config',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.temp_ttl_hours).toBe(24);
      expect(body.data.cleanup_interval_minutes).toBe(60);
      expect(body.data.max_total_size_gb).toBe(20);
      expect(body.data.emergency_cleanup_ttl_minutes).toBe(5);
      expect(body.data.audit_retention_days).toBe(180);
    });

    it('PUT → 200 且持久化（再次 GET 生效）', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/sys/cache/config',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { temp_ttl_hours: 12, max_total_size_gb: 5 },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.temp_ttl_hours).toBe(12);
      expect(body.data.max_total_size_gb).toBe(5);

      const again = await app.inject({
        method: 'GET', url: '/api/v1/admin/sys/cache/config',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const againBody = JSON.parse(again.payload);
      expect(againBody.data.temp_ttl_hours).toBe(12);
      expect(againBody.data.max_total_size_gb).toBe(5);
    });

    it('PUT 非法值 → 400', async () => {
      const res = await app.inject({
        method: 'PUT', url: '/api/v1/admin/sys/cache/config',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { temp_ttl_hours: -1 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ═══════════════════════════════════════
  // 10. temp-cleanup 单次运行
  // ═══════════════════════════════════════

  describe('temp-cleanup 调度器单次运行', () => {
    it('runTempCleanupOnce 可调用且不抛错', async () => {
      process.env.MULTIMODAL_TMP_DIR = tempDir;
      const result = await runTempCleanupOnce();
      expect(result).toBeDefined();
      expect(typeof result.deleted).toBe('number');
      expect(typeof result.freedBytes).toBe('number');
      expect(typeof result.emergency).toBe('boolean');
    });

    it('目录不存在时 runTempCleanupOnce 也不抛错', async () => {
      process.env.MULTIMODAL_TMP_DIR = path.join(os.tmpdir(), '3cloud-tmp-cache-never-exists');
      try {
        const result = await runTempCleanupOnce();
        expect(result.deleted).toBe(0);
        expect(result.freedBytes).toBe(0);
      } finally {
        process.env.MULTIMODAL_TMP_DIR = tempDir;
      }
    });

    it('startTempCleanupScheduler 重复注册不抛错（模块级防重）', () => {
      // beforeAll 已注册一次；再次调用应幂等 no-op
      expect(() => startTempCleanupScheduler(app)).not.toThrow();
    });
  });

  // ═══════════════════════════════════════
  // 11. IP 黑名单 DELETE（§12）
  // ═══════════════════════════════════════

  describe('IP 黑名单 DELETE', () => {
    it('创建后 DELETE → 200；再删 → 404', async () => {
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/admin/security/ip-blacklist',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { ip: '203.0.113.77', reason: 'alias test', scope: 'api' },
      });
      expect(createRes.statusCode).toBe(201);
      const id = JSON.parse(createRes.payload).data.id as number;

      const delRes = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/security/ip-blacklist/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(delRes.statusCode).toBe(200);
      const body = JSON.parse(delRes.payload);
      expect(body.data.ok).toBe(true);

      const again = await app.inject({
        method: 'DELETE', url: `/api/v1/admin/security/ip-blacklist/${id}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(again.statusCode).toBe(404);
    });
  });
});
