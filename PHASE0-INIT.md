# 3cloud 重构 — Phase 0 底座初始化（可执行清单）

> **目标**：搭好干净、规范、可持续的工程底座
> **决策依据**：`kb/decisions/2026-07-31-refactor-tech-roadmap.md`（BOSS 2026-07-31 确认 5 拍板点）
> **状态**：待执行 | **预计工期**：~1 周
> **⚠️ 本地环境**：Node v24.18.0 / pnpm 9.0.5 / **无 Docker**。本地用原生进程（PostgreSQL 17 + Memurai Redis 已本地运行）。
> **数据库名**：`threecloud_v2`（新库，避免与旧库混淆）
> **工作目录**：`C:\Users\ZH\.openclaw\workspace\3cloud`（当前仅 docs/ + PHASE0-INIT.md）
> **部署**：等开发环境验收完整项目后再部署生产（Phase 0-2 先本地跑）

---

## 分步执行（每步带命令 + 文件 + 验收）

### STEP 1 — Monorepo 骨架

```powershell
cd C:\Users\ZH\.openclaw\workspace\3cloud
# 创建目录结构
mkdir packages\shared\src\types, packages\shared\src\enums, packages\shared\src\constants
mkdir api\src\db\schema, api\src\db\migrations, api\src\plugins, api\src\middleware
mkdir api\src\routes, api\src\services, api\src\jobs, api\src\schemas, api\src\lib
mkdir api\test
mkdir web-console\src, web-portal\src
mkdir e2e
mkdir deploy
mkdir .github\workflows
mkdir .husky
```

**根 `package.json`**（pnpm workspaces）：

```json
{
  "name": "3cloud",
  "private": true,
  "packageManager": "pnpm@9.0.5",
  "workspaces": ["packages/shared", "api", "web-console", "web-portal"],
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "test": "pnpm -w api test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "db:generate": "pnpm -w api db:generate",
    "db:migrate": "pnpm -w api db:migrate",
    "worker": "pnpm -w api worker"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "eslint": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "prettier": "^3.3.0",
    "@types/node": "^22.0.0"
  }
}
```

```bash
# 安装（在 3cloud 根目录，用 pnpm）
pnpm install
```

**验收**：`pnpm -r typecheck` 空工程零错误。

---

### STEP 2 — shared 包（共享类型）

**`packages/shared/package.json`**：

```json
{
  "name": "@3cloud/shared",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "private": true
}
```

**`packages/shared/src/index.ts`**：导出类型/枚举的统一入口。

**`packages/shared/src/enums/index.ts`** 初始内容：

```typescript
// 核心枚举（后续按 ref/SPEC 扩展）
export const OrderStatus = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  REFUNDED: "refunded",
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const CommissionType = {
  PERCENT: "percent",
  FIXED: "fixed",
  MIXED: "mixed",
} as const;
export type CommissionType = (typeof CommissionType)[keyof typeof CommissionType];

// 错误码（对齐 docs/PRD-错误码规范.md）
export const ErrorCodes = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  ROUTING_ALL_DOWN: "ROUTING_ALL_DOWN",
  INSUFFICIENT_BALANCE: "INSUFFICIENT_BALANCE",
} as const;
export type ErrorCodes = (typeof ErrorCodes)[keyof typeof ErrorCodes];
```

**验收**：api 能 `import { ErrorCodes } from "@3cloud/shared"` 且 tsc 通过。

---

### STEP 3 — 后端 api（Fastify 5 + TS strict + Drizzle + BullMQ）

#### 3.1 `api/package.json`

```json
{
  "name": "api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "worker": "tsx src/jobs/worker.ts"
  },
  "dependencies": {
    "@3cloud/shared": "*",
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/jwt": "^9.0.0",
    "@fastify/swagger": "^9.0.0",
    "@fastify/rate-limit": "^10.0.0",
    "drizzle-orm": "^0.36.0",
    "pg": "^8.13.0",
    "bullmq": "^5.12.0",
    "ioredis": "^5.4.0",
    "pino": "^9.5.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.27.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@vitest/coverage-v8": "^2.1.0",
    "@types/pg": "^8.11.0"
  }
}
```

> 注：API 校验用 **Fastify 原生 JSON Schema**（route `schema` 选项），不引入 zod-to-json-schema。Zod 仅用于 service 层内部换算校验（如价格计算、费率折算）。

```bash
cd api
# 用 pnpm 安装（依赖会通过 workspace 链接到根）
pnpm add drizzle-orm fastify @fastify/cors @fastify/jwt @fastify/swagger @fastify/rate-limit pg bullmq ioredis pino dotenv
pnpm add -D drizzle-kit tsx typescript vitest @vitest/coverage-v8 @types/pg
# 在根目录跑一次，链接 shared
cd ..
pnpm install
```

#### 3.2 `api/tsconfig.json`（strict）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### 3.3 `api/drizzle.config.ts`

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/threecloud_v2",
  },
});
```

#### 3.4 `api/.env`

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/threecloud_v2
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-prod
PORT=3000
NODE_ENV=development
```

#### 3.5 `api/src/db/schema/index.ts`（Drizzle schema 统一入口）

```typescript
// 所有域 schema 在此统一聚合导出
export * from "./users";
export * from "./vendors";
export * from "./models";
export * from "./call-logs";
export * from "./billing";
export * from "./recharge";
// ... 每域一个文件，Phase 0 先建核心表，后续按 supplement/07 扩展
```

**核心表（Phase 0 首批，P0）**：`users`、`api_keys`、`vendors`、`models`、`vendor_models`、`call_logs`（分区）、`billing_logs`（分区）、`balance_logs`（分区）、`recharge_orders`、`platform_ledger`、`agents`、`operation_logs`（分区）、`site_configs`。
（完整字段对齐 `supplement/07-Schema重设计建议.md`，不在此展开。）

**分区表写法（call_logs 示例，配合 pg_partman）**：

```typescript
import { pgTable, bigint, integer, varchar, timestamp, index } from "drizzle-orm/pg-core";

// Drizzle 定义分区主表结构（PARTITIONED TABLE）
export const callLogs = pgTable(
  "call_logs",
  {
    userId: integer("user_id").notNull(),
    apiKeyId: integer("api_key_id"),
    modelId: integer("model_id"),
    vendorId: integer("vendor_id"),
    requestTokens: integer("request_tokens").default(0),
    responseTokens: integer("response_tokens").default(0),
    cost: integer("cost").default(0), // 单位: 分
    status: varchar("status", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_call_logs_user_created").on(table.userId, table.createdAt)],
);
// ⚠️ 实际建表时，call_logs 是 PARENT（分区主表），在 migration 中手写：
//   CREATE TABLE call_logs ... PARTITION BY RANGE (created_at);
// 然后启用 pg_partman 自动管理子表（见下方 3.6 partition 初始化）
```

**3.5.1 pg_partman 分区初始化（migration 中执行）**：

```sql
-- 启用扩展（需超级用户，Phase 0 首次安装）
CREATE EXTENSION IF NOT EXISTS pg_partman;
CREATE SCHEMA IF NOT EXISTS partman;
-- 注意：pg_partman 子表主键/约束要求分区列必须包含在唯一约束中，
-- 因此分区表不可用 serial 自增主键，改用 bigserial 分区列或业务唯一键（如 id + created_at 复合主键）

-- 对 call_logs 配置按月分区（前 12 个月 + 未来 3 个月预建）
SELECT partman.create_parent(
  p_parent_table => 'public.call_logs',
  p_control => 'created_at',
  p_interval => '1 month',
  p_premake => 3
);

-- 自动清理：保留 12 个月，每月 1 日 02:00 由 pg_partman 后台调度
UPDATE partman.part_config
SET retention = '12 months', retention_keep_table = false, infinite_time_partitions = true
WHERE parent_table = 'public.call_logs';

-- 其它分区表（billing_logs / balance_logs / operation_logs / audit_logs）同理各配置一份
```

> **pg_partman 调度**：用 `pg_catalog.pg_extension_config_dump` + 后台 worker 或 `partman.run_maintenance_proc()` 定时调用。生产可挂系统 cron/PG 内置 schedule 每 10 分钟跑一次 `CALL partman.run_maintenance()`,确保新分区自动建、旧分区自动删。

#### 3.6 `api/src/db/migrate.ts`（migration 执行器）

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import "dotenv/config";

const { Pool } = pg;
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  console.log("运行 migration...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("migration 完成");
  await pool.end();
}
main().catch((e) => {
  console.error("migration 失败", e);
  process.exit(1);
});
```

```bash
# 生成首个正式 migration（需先建好 schema 文件）
cd api
pnpm db:generate   # 生成 0001_initial_schema.sql
pnpm db:migrate    # 执行（需本地 PG 已建 threecloud_v2 库）

# ⚠️ 首次需先建库 + 启用 pg_partman 扩展（migration 不含扩展安装时可手动执行）：
psql -U postgres -h localhost -c "CREATE DATABASE threecloud_v2;"
psql -U postgres -h localhost -d threecloud_v2 -c "CREATE EXTENSION IF NOT EXISTS pg_partman;"
```

> **分区表处理（pg_partman 方案）**：
> 1. 分区主表在 Drizzle schema 中定义，migration 生成时手写补上 `PARTITION BY RANGE (created_at)`（Drizzle 对分区 DDL 支持有限，需在生成的 migration SQL 末尾追加）。
> 2. 启用 pg_partman：对 call_logs/billing_logs/balance_logs/operation_logs/audit_logs 各调 `partman.create_parent()` 按月分区。
> 3. 配置 retention（保留 12 个月）+ infinite_time_partitions（未来预建）。
> 4. 维护调度：`CALL partman.run_maintenance()` 定时跑。
> 5. 分区表注意：分区列需包含在唯一约束/主键中，避免用 `serial` 自增主键（用复合主键 `(id, created_at)` 或业务唯一键）。

#### 3.7 `api/src/app.ts`（Fastify 装配）

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import swagger from "@fastify/swagger";
import rateLimit from "@fastify/rate-limit";
import { registerRoutes } from "./routes/index";
import { errorHandler } from "./lib/error-handler";

export function buildApp() {
  const app = Fastify({ logger: true });

  void app.register(cors, { origin: true, credentials: true });
  void app.register(jwt, { secret: process.env.JWT_SECRET! });
  void app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  void app.register(swagger, {
    openapi: { info: { title: "3cloud API", version: "0.1.0" } },
  });

  app.setErrorHandler(errorHandler);

  registerRoutes(app); // ← 唯一路由注册入口

  return app;
}
```

#### 3.8 `api/src/routes/index.ts`（唯一注册入口——防漏注册）

```typescript
import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health";

export function registerRoutes(app: FastifyInstance) {
  // 所有业务路由必须在此挂载注册
  void app.register(healthRoutes, { prefix: "/api/v1/health" });
  // Phase 1+ :  void app.register(userRoutes, { prefix: "/api/v1/users" });
  //            void app.register(authRoutes, { prefix: "/api/v1/auth" });
  //            ...
}
```

#### 3.9 `api/src/index.ts`（入口）

```typescript
import "dotenv/config";
import { buildApp } from "./app";

const app = buildApp();
const port = Number(process.env.PORT) || 3000;

async function start() {
  try {
    await app.listen({ port, host: "0.0.0.0" });
    app.swagger(); // 输出 swagger JSON
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
start();

// graceful shutdown
process.on("SIGTERM", async () => await app.close());
process.on("SIGINT", async () => await app.close());
```

```bash
# 启动 + 验证
cd api
pnpm dev
curl http://localhost:3000/api/v1/health   # → {"status":"ok"}
curl http://localhost:3000/docs            # → Swagger UI
```

#### 3.10 BullMQ（`api/src/jobs/`）

**`api/src/jobs/queues.ts`**：

```typescript
import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis";

export const queues = {
  settlement: new Queue("settlement", { connection: redisConnection }),
  commission: new Queue("commission", { connection: redisConnection }),
  reconciliation: new Queue("reconciliation", { connection: redisConnection }),
  notification: new Queue("notification", { connection: redisConnection }),
  webhook: new Queue("webhook", { connection: redisConnection }),
};
```

**`api/src/lib/redis.ts`**：

```typescript
import { IORedis } from "ioredis";

export const redisConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null, // bullmq 要求
});
export const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");
```

**`api/src/jobs/worker.ts`**（worker 独立进程）：

```typescript
import { Worker } from "bullmq";
import { redisConnection } from "../lib/redis";

const worker = new Worker(
  "settlement",
  async (job) => {
    console.log(`处理结算任务 ${job.id}:`, job.data);
    // 调用结算 service
  },
  { connection: redisConnection },
);

console.log("worker 已启动");
```

```bash
# 测试：推一个任务并消费
pnpm worker   # 单独终端启动 worker
node -e "const Q=require('bullmq').Queue;const q=new Q('settlement',{connection:{host:'localhost',port:6379}});q.add('test',{a:1}).then(()=>{console.log('pushed');process.exit()})"
```

**验收**：worker 终端打印"处理结算任务"。

---

### STEP 4 — 前端 Console SPA（React 19 + Vite 6）

```powershell
cd 3cloud
pnpm create vite web-console --template react-ts
cd web-console
pnpm add @tanstack/react-query zustand react-router-dom axios
pnpm add -D tailwindcss @tailwindcss/vite
```

**`web-console/src/lib/api.ts`**（axios 封装，含 401 拦截器 + 错误码映射 + loading）：

```typescript
import axios from "axios";

export const api = axios.create({ baseURL: "/api/v1" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);
```

```bash
# dev 代理配置 web-console/vite.config.ts → api 到 3000
```

---

### STEP 5 — 前端 Portal SSR（Next.js App Router，BOSS 拍板）

```powershell
cd 3cloud
pnpm create next-app@latest web-portal \
  --ts --app --tailwind --eslint --src-dir\
  --import-alias "@/*" --use-pnpm
cd web-portal
pnpm add @tanstack/react-query
```

**Next.js 项目结构**（App Router，SSR 默认服务端渲染，利于 SEO）：

```
web-portal/src/
├── app/
│   ├── layout.tsx             # 根布局(Header/Footer + 元数据)
│   ├── page.tsx               # 首页 (SSR, SEO metadata)
│   ├── pricing/page.tsx       # 定价页(含价格计算器)
│   ├── models/page.tsx        # 模型目录
│   ├── docs/page.tsx          # 开发者文档
│   ├── status/page.tsx        # 服务状态页
│   ├── blog/
│   │   ├── page.tsx           # 文章列表
│   │   └── [slug]/page.tsx    # 文章详情
│   ├── sitemap.ts             # 动态 sitemap.xml
│   └── robots.ts              # robots.txt
└── components/                # Portal 组件(对比表/价格计算器等)
```

**SEO 关键点**：
- 每页 `export const metadata: Metadata = { title, description, openGraph }`（对齐 ref/SPEC §21.1 元数据表）
- `app/sitemap.ts` 动态生成全部页面 URL；`app/robots.ts` 指向 sitemap
- 首页/定价/模型/状态页为**服务端组件**（SSR 默认），其余页面可按需 client
- JSON-LD 结构化数据用 `export const metadata` 的 `other` 字段或 `script` 标签注入

**Portal 端口**：Next.js dev 默认 `3000`，与 API 冲突。启动时指定 `next dev -p 3100`，Nginx 反代。根 package.json 的 `dev:portal` 脚本写成 `next dev -p 3100`。

> **React 19**：Next.js 15+ 支持 React 19，与 Console 保持一致（BOSS 拍板 A）。

---

### STEP 6 — 测试护栏

**`api/vitest.config.ts`**：

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/services/**/*.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
```

```bash
cd api
pnpm test:coverage   # 验证 >= 80% 门槛
```

**Playwright E2E**（根 `e2e/`）：

```bash
cd 3cloud
pnpm dlx playwright init e2e
pnpm dlx playwright install
```

**关键链路用例**（Phase 1 起逐步补）：注册→登录→创建 Key→调用→账单展示。

---

### STEP 7 — Git 规范 + husky + CI

**`.husky/pre-commit`**（精简版——只跑快速检查，typecheck 放 CI）：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "[pre-commit] lint + 单测 + PUA 检测..."
pnpm -r lint
pnpm -w api test
python scripts/pre-commit-pua.py   # 复用旧 PUA 检测（防中文编码腐烂）
# 注: typecheck 不放这里(全项目太慢), 由 CI 执行
```

```bash
pnpm add -D husky
pnpm dlx husky init
# 把旧 pre-commit-pua.py 拷到 scripts/（旧项目已删除，从 3cloud-backup 或 git 历史取）
```

**`.github/workflows/ci.yml`**：

```yaml
name: CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: threecloud_v2
        ports: ["5432:5432"]
      redis:
        image: redis:7
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -w api db:migrate
        env: { DATABASE_URL: "postgres://postgres:postgres@localhost:5432/threecloud_v2" }
      - run: pnpm -r typecheck
      - run: pnpm -r lint
      - run: pnpm -w api test
      - run: pnpm -r build
```

**`.gitignore`**（根）：

```
node_modules/
dist/
.env
*.log
.DS_Store
coverage/
playwright-report/
```

---

### STEP 8 — 部署（⚠️ 延迟到开发验收完整项目后再执行）

> **BOSS 拍板**：等 Phase 0-2 开发环境验收完整项目后，再部署到生产服。本 STEP 仅**预写脚本**，Phase 0 不执行部署。
> 生产服 117.78.2.66（2C/1.7G/40G，内存小）需注意 api + worker + 前端进程可能 OOM，部署时 worker 与 api 分离或按需启停。
> 本地无 Docker，生产服若有 Docker 用 compose，否则用 PM2 原生部署。

**`deploy/deploy.sh`**（骨架，替代旧版）：

```bash
#!/bin/bash
set -e
# ⚠️ 本脚本在开发验收后执行，Phase 0-2 阶段不要运行
# 1. 拉代码
cd /root/3cloud && git pull origin main
# 2. 安装依赖(pnpm)
corepack enable && pnpm install --frozen-lockfile
# 3. 构建后端
pnpm -w api build
# 4. 构建前端(console + portal)
pnpm -w web-console build && pnpm -w web-portal build
# 5. 迁移
pnpm -w api db:migrate
# 6. PM2 部署 api + worker(注意生产服内存小,worker可另行控制)
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
# 7. 同步前端 dist 到 Nginx 目录
# rsync web-console/.next/... /var/www/console/ (Next.js build output)
# rsync web-console/dist /var/www/console/
# rsync web-portal/.next /var/www/portal/
```

**`api/ecosystem.config.js`**（PM2 cluster）：

```javascript
module.exports = {
  apps: [
    { name: "3cloud-api", script: "dist/index.js", instances: "max", exec_mode: "cluster", env: { NODE_ENV: "production" } },
    { name: "3cloud-worker", script: "dist/jobs/worker.js", instances: 1, env: { NODE_ENV: "production" } },
  ],
};
```

---

## Phase 0 验收清单（完工判定）

| # | 检查项 | 命令/方法 | 判定 |
|---|--------|----------|------|
| 1 | monorepo 三工程可 dev(pre+console+portal) | `pnpm dev` | 通过 |
| 2 | tsc 全项目零错误 | `pnpm -r typecheck` | 通过 |
| 3 | eslint/prettier 零告警 | `pnpm -r lint` | 通过 |
| 4 | 单测通过且覆盖率 ≥80% | `pnpm -w api test:coverage`（api service）| 通过 |
| 5 | migration 0001 空库完整执行（含分区+pg_partman）| `pnpm -w api db:migrate` | 通过 |
| 6 | Swagger /docs 可访问 | `curl localhost:3000/docs` | 通过 |
| 7 | CI pipeline 跑通 | push 触发 Actions | 通过 |
| 8 | BullMQ 推/消费闭环 | worker 测试命令 | 通过 |
| 9 | console 空壳 + portal SSR 可访问 | 浏览器 | 通过 |
| 10 | 分区表近月/历史数据落对分区 | SQL 查询 pg_partitions | 通过 |

**全部通过 → 进入 Phase 1（§5 核心引擎先行，§1/§6 Portal → §2/§3/§4）**

---

## 关键约定（防止旧病复发）

1. **Schema 一次设计全**（依据 supplement/07），schema↔DB 由 drizzle-kit 保证一致，禁止手写 ALTER 补列。
2. **路由必须注册 routes/index.ts**，CI 有 Swagger 输出可对账。
3. **每功能点先 service（带单测）→ route → UI**，dev 可跑通才提交。
4. **分区表从第一天建**，不后期补。
5. **异步任务一律走 BullMQ 队列**，不在请求处理里做重活。
6. **严禁跳过 Phase 0**。
