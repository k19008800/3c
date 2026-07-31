# 3cloud 重构 — Phase 0 底座初始化（可执行清单）

> **目标**：搭好干净、规范、可持续的工程底座
> **决策依据**：`kb/decisions/2026-07-31-refactor-tech-roadmap.md`（BOSS 2026-07-31 确认 5 拍板点）
> **状态**：待执行 | **预计工期**：~1 周
> **⚠️ 本地环境**：Node v24.18.0 / npm 11.16.0 / **无 Docker**。本地用原生进程（PostgreSQL 17 + Memurai Redis 已本地运行），docker-compose 仅供生产/可选环境。
> **工作目录**：`C:\Users\ZH\.openclaw\workspace\3cloud`（当前仅 docs/ + PHASE0-INIT.md）

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

**根 `package.json`**（workspaces）：

```json
{
  "name": "3cloud",
  "private": true,
  "workspaces": ["packages/shared", "api", "web-console", "web-portal"],
  "scripts": {
    "dev": "npm-run-all --parallel dev:api dev:console dev:portal",
    "dev:api": "npm run dev -w api",
    "dev:console": "npm run dev -w web-console",
    "dev:portal": "npm run dev -w web-portal",
    "build": "npm-run-all build:api build:console build:portal",
    "build:api": "npm run build -w api",
    "build:console": "npm run build -w web-console",
    "build:portal": "npm run build -w web-portal",
    "test": "npm run test -w api",
    "lint": "npm-run-all lint:*",
    "lint:api": "eslint api/src --ext .ts",
    "lint:web": "eslint web-console/src web-portal/src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit -p api/tsconfig.json && tsc --noEmit -p web-console/tsconfig.json && tsc --noEmit -p web-portal/tsconfig.json",
    "db:generate": "npm run db:generate -w api",
    "db:migrate": "npm run db:migrate -w api"
  },
  "devDependencies": {
    "npm-run-all": "^4.1.5",
    "typescript": "^5.6.0",
    "eslint": "^9.0.0",
    "typescript-eslint": "^8.0.0",
    "prettier": "^3.3.0",
    "@types/node": "^22.0.0"
  }
}
```

```bash
# 安装（在 3cloud 根目录）
npm install
```

**验收**：`npm run typecheck` 空工程零错误（当前仅 shared 空目录）。

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
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0",
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

```bash
cd api
npm install drizzle-orm drizzle-kit fastify @fastify/cors @fastify/jwt @fastify/swagger @fastify/rate-limit zod zod-to-json-schema pg bullmq ioredis pino dotenv
npm install -D tsx typescript vitest @vitest/coverage-v8 @types/pg drizzle-kit
# 别忘了根目录跑 install 链接 shared
cd ..
npm install
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
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/threecloud",
  },
});
```

#### 3.4 `api/.env`

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/threecloud
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

**分区表写法（call_logs 示例）**：

```typescript
import { pgTable, serial, bigint, varchar, timestamp, integer, index } from "drizzle-orm/pg-core";

// Drizzle 支持使用 pg_partman 或原生 partition by；这里定义分区主表
export const callLogs = pgTable(
  "call_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey(),
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
// ⚠️ 分区在 migration SQL 里用原生 "PARTITION BY RANGE (created_at)" 建子表，
// Drizzle 定义主表结构 + 编写 partition 管理 SQL（见 migrate.ts 说明）
```

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
npm run db:generate   # 生成 0001_initial_schema.sql
npm run db:migrate    # 执行（需本地 PG 已建 threecloud 库）
```

> **分区表处理**：drizzle-kit 对分区主表支持有限，`0001_initial_schema.sql` 生成后用脚本在 SQL 末尾**追加分区子表 CREATE TABLE ... PARTITION OF** + 分区清理函数（或启用 pg_partman）。Phase 0 提供一个 `scripts/create-partitions.sql` 手动补充分区。

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
npm run dev
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
npm run worker   # 单独终端启动 worker
node -e "const Q=require('bullmq').Queue;const q=new Q('settlement',{connection:{host:'localhost',port:6379}});q.add('test',{a:1}).then(()=>{console.log('pushed');process.exit()})"
```

**验收**：worker 终端打印"处理结算任务"。

---

### STEP 4 — 前端 Console SPA（React 19 + Vite 6）

```powershell
cd 3cloud
# 用 vite 脚手架生成（或手写）
npm create vite@latest web-console -- --template react-ts
cd web-console
npm install @tanstack/react-query zustand react-router-dom axios
npm install -D tailwindcss @tailwindcss/vite
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

### STEP 5 — 前端 Portal SSR（vike）

```powershell
cd 3cloud
npm create vike@latest web-portal   # 或手写 vike 配置
cd web-portal
npm install react react-dom @tanstack/react-query
```

**vike 目录结构**（SSR 页面在 `pages/`，Page 组件 + +config）：

```
web-portal/src/
├── pages/
│   ├── index/+Page.tsx        # 首页
│   ├── pricing/+Page.tsx      # 定价页(含价格计算器)
│   ├── models/+Page.tsx
│   ├── docs/+Page.tsx
│   ├── status/+Page.tsx
│   └── blog/[slug]/+Page.tsx
├── renderer/
│   ├── +config.h.ts
│   └── +onRenderHtml.ts / +onRenderClient.ts
└── server/ (可选独立 SSR 端口)
```

**Portal SSR 端口**：建议独立端口 `3100`，Nginx 反代。SEO 元数据用 `+Head`/`+data` 提供。

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
npm run test:coverage   # 验证 >= 80% 门槛
```

**Playwright E2E**（根 `e2e/`）：

```bash
cd 3cloud
npm init -y -w e2e 2>$null
npx playwright init e2e
npx playwright install
```

**关键链路用例**（Phase 1 起逐步补）：注册→登录→创建 Key→调用→账单展示。

---

### STEP 7 — Git 规范 + husky + CI

**`.husky/pre-commit`**：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "[pre-commit] 运行类型检查 & lint & 测试 & PUA 检测..."
npm run typecheck
npm run lint
npm run test
python scripts/pre-commit-pua.py   # 复用旧 PUA 检测（防中文编码腐烂）
```

```bash
npm install -D husky
npx husky init
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
          POSTGRES_DB: threecloud
        ports: ["5432:5432"]
      redis:
        image: redis:7
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run db:migrate
        env: { DATABASE_URL: "postgres://postgres:postgres@localhost:5432/threecloud" }
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run test
      - run: npm run build
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

### STEP 8 — 部署（重写 deploy 脚本）

> docker-compose 供生产可选；BOSS 本地无 Docker，生产服若有 Docker 用 compose，否则用 PM2 原生部署。

**`deploy/deploy.sh`**（骨架，替代旧版）：

```bash
#!/bin/bash
set -e
# 1. 拉代码
git pull origin main
# 2. 构建后端
cd api && npm ci && npm run build
# 3. 构建前端(console + portal)
cd ../web-console && npm ci && npm run build
cd ../web-portal && npm ci && npm run build
# 4. 迁移
cd ../api && npm run db:migrate
# 5. PM2 部署 api + worker
pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
pm2 reload worker || pm2 start ecosystem.config.js --only worker
# 6. 同步前端 dist 到 Nginx 目录
# rsync web-console/dist /var/www/console/
# rsync web-portal/dist /var/www/portal/
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
| 1 | monorepo 三工程可 dev | `npm run dev` | 通过 |
| 2 | tsc 全项目零错误 | `npm run typecheck` | 通过 |
| 3 | eslint/prettier 零告警 | `npm run lint` | 通过 |
| 4 | 单测通过且覆盖率 ≥80% | `npm run test:coverage`（api service）| 通过 |
| 5 | migration 0001 空库完整执行（含分区）| `npm run db:migrate` | 通过 |
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
