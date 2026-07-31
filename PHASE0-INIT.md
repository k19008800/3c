# 3cloud 重构 — Phase 0 底座初始化清单

> **目标**：搭好干净、规范、可持续的工程底座，杜绝旧病复发
> **决策依据**：`kb/decisions/2026-07-31-refactor-tech-roadmap.md`（BOSS 2026-07-31 确认）
> **状态**：待执行 | **预计工期**：~1 周
> **工作目录**：`C:\Users\ZH\.openclaw\workspace\3cloud`（当前仅剩 docs/）

---

## 0. 先决条件（已就绪）

| 项 | 状态 |
|----|------|
| 需求资产 docs 233 篇（含 supplement Schema 重设计建议）| ✅ `3cloud-backup/` + `3cloud/docs/` |
| Node 24 本地开发机 | ✅ |
| PostgreSQL 17（localhost:5432, postgres/postgres）| ✅ |
| Redis（Memurai, localhost:6379）| ✅ |
| GitHub repo `git@github.com-3cloud:k19008800/3c.git` + deploy key | ✅ |
| 生产服1 117.78.2.66（主）/ 生产服2 123.60.55.62（备）| ✅ |

---

## 1. 工程骨架（monorepo）

```
3cloud/
├── docs/                    # 需求文档（保留，不删）
├── kb/                      # 知识库（保留，不删）
├── packages/
│   └── shared/              # 共享 TS 类型/常量（前后端共用）
│       ├── src/
│       │   ├── types/       # 领域类型（User/Order/Model...）
│       │   ├── enums/       # 枚举（订单状态/佣金类型...）
│       │   └── constants/   # 常量（错误码/角色权限位...）
│       └── package.json
├── api/                     # 后端（Fastify 5 + TS strict）
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema/      # Drizzle schema（按域分文件）
│   │   │   ├── migrations/  # drizzle-kit 生成的正式 migration
│   │   │   └── index.ts
│   │   ├── plugins/         # Fastify 插件（zod/swagger/jwt/rate-limit）
│   │   ├── middleware/      # 自定义中间件
│   │   ├── routes/          # 路由（集中注册）
│   │   │   └── index.ts     # ← 所有路由的唯一注册入口
│   │   ├── services/        # 业务逻辑层
│   │   ├── jobs/            # BullMQ worker/job 定义
│   │   ├── schemas/         # Zod 校验 schema
│   │   ├── lib/             # 工具（logger/redis/encryption）
│   │   └── index.ts         # 入口（boot + listen + graceful shutdown）
│   ├── test/                # Vitest 单测（server >=80%）
│   ├── drizzle.config.ts
│   ├── package.json
│   └── tsconfig.json        # strict: true
├── web-console/             # 前端 Console SPA（React 19 + Vite 6 + TS strict）
├── web-portal/              # 前端 Portal SSR（React + vike）
├── e2e/                     # Playwright E2E
├── docker-compose.yml       # api + web-console + web-portal + pg + redis
├── .github/workflows/       # CI pipeline
├── .eslintrc / .prettierrc
├── .husky/                  # pre-commit 钩子
└── deploy/                  # 部署脚本（重写 deploy.sh 替代旧版）
```

---

## 2. 配置清单

### 2.1 基础工具链配置
- [ ] `tsconfig.json`：`"strict": true`（api + 两个 web + shared 各自一份，extends 公共 base）
- [ ] ESLint（typescript-eslint recommended + react-hooks）
- [ ] Prettier（统一格式，防止乱码/排版腐烂）
- [ ] **`.husky/pre-commit`**：跑 `tsc --noEmit` + `eslint` + `vitest run` + **PUA 检测脚本**（抄旧项目 `pre-commit-pua.py`，防止中文编码腐烂复现）

### 2.2 后端（api/）
- [ ] Fastify 5 + `@fastify/cors` + `@fastify/jwt` + `@fastify/swagger` + `@fastify/rate-limit`
- [ ] Zod 校验插件（统一 body/params/query 校验）
- [ ] **Swagger 自动生成**（由 route schema 产出，对齐 docs/api-reference.md）
- [ ] Drizzle ORM + `drizzle-kit`（generate/push 工作流）
- [ ] BullMQ（`bullmq` + `ioredis`）连接 Memurai
- [ ] Prisma 风格 DB 连接池（`pg` / `postgres.js`）
- [ ] 日志：`pino`（Fastify 原生友好）
- [ ] 统一错误响应中间件（对齐 docs/PRD-错误码规范.md）

### 2.3 前端
- **web-console（SPA）**：
  - [ ] React 19 + Vite 6 + TS strict
  - [ ] Router + TanStack Query + Zustand
  - [ ] TailwindCSS 4 + 组件库（对齐 SPEC-§15 组件库规范）
  - [ ] Axios 封装（401 拦截器/错误码映射/loading）
- **web-portal（SSR）**：
  - [ ] React + **vike**（vite-plugin-ssr）
  - [ ] 首页/定价/模型目录/文档/状态页 SSR + SEO（sitemap/robots/JSON-LD）
  - [ ] 其余 Portal 页 CSR 降级

### 2.4 测试
- [ ] Vitest（api service 层，>=80% 覆盖率门槛）
- [ ] Playwright（关键链路 E2E）
- [ ] `vitest.config.ts` + Playwright config

### 2.5 CI/CD
- [ ] **`.github/workflows/ci.yml`**：push/PR 触发 → `tsc --noEmit` → `eslint` → `vitest` → `vite build`（console+portal）→ 全过才可合
- [ ] **`.github/workflows/deploy.yml`**：main 合并后自动 build + 部署脚本（SSH 到生产服）

### 2.6 基础设施
- [ ] `docker-compose.yml`：api / web-console / web-portal / postgres(17) / redis —— 本地一键 `docker compose up`
- [ ] `deploy/deploy.sh`：重写（前端 dist 与源码目录隔离，替代旧版）
- [ ] `deploy/nginx.conf`：区分 SSR 页面（porxy 到 web-portal）与 SPA 页面（web-console）

---

## 3. 数据库 Schema 设计（Phase 0 核心）

> 输入：`3cloud-backup/docs/supplement/07-Schema重设计建议.md` + `docs/data-dictionary.md` + 各 ref/SPEC

### 3.1 完整 Schema 一次性设计
- [ ] 基于 supplement/07 的表总览（users/api_keys/models/vendors/call_logs/billing_logs/recharge_orders/platform_ledger/agents...）**一次设计完整**
- [ ] 全部表 + 枚举 + 索引 + 外键 + 唯一约束，**用 Drizzle 定义**，不手写缺列
- [ ] 关键表带行级锁/乐观锁/唯一约束（如余额变动、佣金结算）

### 3.2 分区建表（第 1 天就建，BOSS 已确认）
以下日志/流水表**从 schema 设计日就按时间分区**（range partition by 月/日）：
- [ ] `api_call_logs`（调用日志，按日/月分区）
- [ ] `balance_logs` / `user_balance_logs`（余额流水）
- [ ] `operation_logs`（操作日志）
- [ ] `audit_logs`（审计日志，量大）
- [ ] `billing_logs`（计费日志）
- [ ] `reconciliation_logs`（对账记录）
- [ ] 分区自动清理策略（保留 N 个月，cron 清理旧分区）

### 3.3 migration 工作流
- [ ] `drizzle-kit generate` 生成 **`0001_initial_schema`**（正式首个 migration）
- [ ] 之后所有 schema 变更走新 migration（0002/0003...）
- [ ] **禁止**"跑起来再 ALTER TABLE 补列"
- [ ] migration 在启动时或显式脚本执行（`npm run db:migrate`）

---

## 4. 路由注册规范（防漏注册）

- [ ] `routes/index.ts` 为**唯一**路由注册入口，所有子路由必须在此挂载
- [ ] CI 增加**路由健康检查**：启动后扫描已注册 route 列表 vs docs/api-reference.md，差异报警
- [ ] 每新增一个路由文件 → 必须同步注册 `routes/index.ts` + 更新 swagger + 对齐 gap 分析

---

## 5. BullMQ 初始化（异步中间件）

- [ ] 安装 `bullmq` + `ioredis`
- [ ] 定义队列（按域）：`settlement`（结算）/ `commission`（佣金）/ `reconciliation`（对账）/ `notification`（邮件/站内）/ `webhook`（投递）
- [ ] worker 进程注册（独立于 API 主进程或在同一进程 cluster 内隔离）
- [ ] 失败重试 + 死信队列（reconciliation 失败告警）
- [ ] 定时任务（BullMQ repeat）：每日对账 / 预算重置 / 锁账结转 / 分区清理

---

## 6. Phase 0 验收标准（完工判定）

| # | 检查项 | 判定 |
|---|--------|------|
| 1 | `docker compose up` 本地一键起全套 | 通过 |
| 2 | `tsc --noEmit` 全项目零错误 | 通过 |
| 3 | `eslint` + `prettier` 零告警 | 通过 |
| 4 | `vitest run` 基础测试通过 | 通过 |
| 5 | `migration 0001` 能在空库完整执行（create all tables + 分区 + 索引）| 通过 |
| 6 | Swagger `/docs` 可访问且返回 route 文档 | 通过 |
| 7 | CI pipeline（tsc→lint→test→build）跑通 | 通过 |
| 8 | BullMQ：往 settlement 队列推任务 → worker 消费 → 结果写入 DB | 通过 |
| 9 | web-console 空壳 + web-portal 首页 SSR 都能访问 | 通过 |
| 10 | 分区表：插入近月+历史数据 → 正确落入对应分区 | 通过 |

**Phase 0 全部通过后** → 进入 Phase 1（§5 核心引擎先行）。

---

## 7. 风险与注意

- `3cloud-backup/routing/` 为空（0 文件）；dispatch 配置在 `workspace/routing/`，Phase 0 不涉及。
- 旧业务数据（PG `threecloud` 库）已删，Phase 0 从空库建 schema，无迁移负担。
- **严禁跳过 Phase 0**：底座不牢，回到老路。
- 分区表在 drizzle 里用 `pgTable(..., table => { return { ... } })` 自定义 partition 定义，注意 Drizzle 分区支持方式（或 migration 里手写 partition SQL）。
