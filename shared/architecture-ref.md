# 架构参考 — 3cloud 多模块并行开发

## 技术栈约定

| 项目 | 规范 |
|------|------|
| 后端框架 | Fastify + TypeScript (tsx watch) |
| ORM | DrizzleORM (schema in db/schema.ts) |
| 数据库 | PostgreSQL 17, 库名 threecloud |
| 缓存 | Memurai (Redis) localhost:6379 |
| 前端 | Vite + React + Tailwind + Recharts |
| 后端入口 | `app.ts` → 注册路由 |
| 前端入口 | `App.tsx` → 注册 Route + Sidebar |
| API 响应格式 | `{ code: 0, data: ..., message: "ok" }` |
| 数字精度 | DECIMAL(18,6) for 所有金额字段 |
| 时间戳 | TIMESTAMPTZ (UTC) |
| 认证 | JWT + `authenticateJWT` + `requirePerm(Perm.XXX)` |

## 权限枚举 (Perm)

```typescript
// 在 middleware/auth.ts 中
export enum Perm {
  DASHBOARD_VIEW = "dashboard.view",
  FINANCE_VIEW = "finance.view",
  FINANCE_COMMISSION = "finance.commission",
  RECONCILIATION_VIEW = "reconciliation.view",
  USER_MANAGE = "user.manage",
  // 已有如上；新模块使用 FINANCE_VIEW + 路径细分
}
```

## 后端 Route 注册模式

```typescript
// app.ts 中注册
import { profitRoutes } from "./routes/admin/profit.js";
await app.register(profitRoutes);

// route 文件模式
export async function profitRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);
  
  app.get("/api/v1/admin/finance/profit", {
    preHandler: [requirePerm(Perm.FINANCE_VIEW)],
  }, async (request, reply) => {
    // ... handler
  });
}
```

## DB Migration 模式

```typescript
// api/src/db/migrations/2026-07-11-xxx.ts
// 使用 raw SQL (pg client), 不依赖 Drizzle
// 格式: idempotent (CREATE IF NOT EXISTS)
import "dotenv/config";
import { Pool } from "pg";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // ... SQL
    await client.query("COMMIT");
  } catch(e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release(); await pool.end();
  }
}
run();
```

## 前端 Route + Sidebar 模式

```typescript
// App.tsx 添加 Route:
import AdminXxx from '@/pages/admin/Xxx'
<Route path="admin/finance/xxx" element={<AdminRoute><AdminXxx /></AdminRoute>} />

// Sidebar.tsx 添加导航项:
{ to: '/admin/finance/xxx', icon: PieChart, label: 'XXX', roles: ['super_admin', 'finance_ops'] }
```

## 文件命名规则

| 类型 | 命名 |
|------|------|
| 新 service | `services/xxx-service.ts` |
| 新 route | `routes/admin/xxx.ts` |
| 新 DB migration | `db/migrations/2026-07-11-xxx.ts` |
| 新 cron | `cron/xxx.ts` 或 `scripts/xxx.ts` |
| 新前端页面 | `pages/admin/Xxx.tsx` |
| 子目录 | `pages/admin/finance/Xxx.tsx` |

## 本模块依赖关系

```
Migration → Service → Route → app.ts 注册
                                ↓
                           前端页面 → App.tsx 路由 → Sidebar 导航
```

所有后端模块无文件级冲突（各自独立新文件），前端页面也无冲突（各自独立新页面）。
