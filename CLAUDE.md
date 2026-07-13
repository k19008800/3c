# CLAUDE.md — 3cloud (3C)

> AI Token 聚合平台 — 对接多家模型供应商，为下游用户/代理商提供统一的 Token 计费和路由服务。

## Workspace 目录布局

本项目在 workspace 中有三个目录，各有明确分工：

```
C:\Users\ZH\.openclaw\workspace\
├── 3cloud/              ← 🏠 主项目（当前开发）
├── 3cloud-transfer/     ← 📦 迁移/中转副本
└── 3cloud.worktrees/    ← 🌿 git worktree 分支隔离目录
```

| 目录 | 用途 | 何时操作 |
|------|------|---------|
| `3cloud/` | 主开发目录，日常编码、调试、运行 | 始终 |
| `3cloud-transfer/` | 代码迁移、格式转换、批量处理的过渡区 | 需要隔离操作避免污染主目录时 |
| `3cloud.worktrees/` | git worktree 管理的分支隔离工作区 | 多分支并行开发、hotfix 隔离 |

> **默认工作目录是 `3cloud/`**，除非明确提到迁移或 worktree 操作。

## 架构概览

```
3cloud/
├── api/                    # Fastify + TypeScript 后端
│   └── src/
│       ├── index.ts        # 入口（调用 app.ts 的 startServer）
│       ├── config.ts       # 环境变量配置
│       ├── db/             # Drizzle ORM + PostgreSQL
│       │   ├── index.ts    # 连接池管理
│       │   ├── schema.ts   # 表定义
│       │   ├── migrations/ # SQL 迁移脚本
│       │   └── seed/       # 种子数据
│       ├── redis.ts        # ioredis 连接（Session/缓存/限流）
│       ├── routes/         # Fastify 路由
│       │   └── admin/      # 管理后台路由
│       ├── services/       # 业务逻辑层
│       ├── middleware/      # 中间件（鉴权、幂等）
│       ├── cron/           # 定时任务
│       └── scripts/        # 运维/数据脚本
├── web/                    # Vite + React + Recharts 前端
├── docs/                   # 设计文档
│   ├── routing-engine-flow.md      # 路由引擎流程图
│   └── billing-engine-sequence.md  # 计费引擎时序图
└── docker-compose.yml      # 本地开发环境（PG + Redis + MailDev）
```

## 技术栈

| 层 | 技术 |
|---|------|
| 后端框架 | Fastify 5 + TypeScript |
| ORM | Drizzle ORM (node-postgres) |
| 数据库 | PostgreSQL 17 |
| 缓存/队列 | Redis (ioredis) |
| 前端 | Vite + React + Recharts + Tailwind CSS |
| 认证 | JWT (access + refresh token) |
| 加密 | bcryptjs + AES-256-GCM (vendor key) |

## 常用命令

```bash
# 启动基础设施
docker compose up -d              # 启动 PG + Redis + MailDev

# API 开发
cd api && npx tsx watch src/index.ts   # 热重载开发模式
cd api && npx tsx src/index.ts         # 单次运行

# API 生产构建
cd api && npx tsc && node dist/index.js

# 数据库迁移
cd api && npx tsx src/db/migrate.ts    # 运行迁移

# 前端开发
cd web && npm run dev                   # 端口 :5175

# 前端生产构建
cd web && npm run build
```

## 端口与端点

| 服务 | 端口 | 说明 |
|------|------|------|
| API | `:3000` | Fastify 后端 |
| Web | `:5175` | Vite 开发服务器 |
| PostgreSQL | `:5432` | 数据库 (threecloud) |
| Redis | `:6379` | 缓存 |
| MailDev | `:1025` / `:1080` | SMTP / Web 预览 |

### 关键 API 端点

- `GET /health` — 应用存活检查
- `GET /ready` — 就绪检查（DB + Redis）
- `POST /v1/chat/completions` — Token 代理路由（核心业务入口）

## 核心业务模块

### 1. Token 代理路由 (`services/router.ts`)
- 鉴权 → 余额检查 → 模型解析 → 限流 → 路由策略选择 → 上游转发 → 计费
- 路由策略：自动最低价（默认）、手动指定、加权动态
- 健康检测：被动（成功率采样）+ 主动（每 5 分钟探测宕机厂商）
- 流式请求：SSE 逐块转发、中途断连不计费、余额耗尽允许走完

### 2. 计费引擎
- 扣费公式：`(prompt_tokens × sellPriceInput + completion_tokens × sellPriceOutput) × pricingMultiplier × discountRate`
- 精度：DECIMAL(18,6)，截断不四舍五入
- 充值回补负余额机制

### 3. 代理商体系
- 分佣计算、提现审核、充值双审
- 财务结算对账（锁定结算单、CSV 导出）

### 4. 安全模块
- 登录安全（失败锁定、异地检测）
- 安全事件记录
- RBAC 权限矩阵（6 角色）
- API Key 管理（SHA-256 哈希存储）

### 5. 管理后台
- 仪表盘、用户管理、供应商管理、模型管理
- 限流管理、审计日志、实名审核
- 财务对账、成本看板、活动管理

## 数据库

- 数据库名：`threecloud`
- 本地连接：`postgres://postgres:postgres@localhost:5432/threecloud`
- ORM：Drizzle，schema 定义在 `api/src/db/schema.ts`
- 迁移：按日期命名 `api/src/db/migrations/YYYY-MM-DD-*.ts`

## 生产环境

| 环境 | IP | 说明 |
|------|-----|------|
| 生产服（主） | `117.78.2.66` | 华为云，Ubuntu 22.04，PM2 cluster 模式 :3030 |
| 生产服（备） | `123.60.55.62` | 华为云，宝塔面板 :9999 |
| 生产服（阿里云） | `8.149.140.186` | 阿里云，Alibaba Cloud Linux 3 |

- 域名：`unmisa.com` / `api.unmisa.com` / `tokens.unmisa.com`
- 代码路径：`/3cloud/api/` + `/3cloud/web/`
- 进程管理：PM2（`3cloud-api`）
- SSH：`ssh root@117.78.2.66 -i ~/.ssh/3cloud_prod`

## 开发约定

- 使用 TypeScript ESM（`"type": "module"`）
- 路径别名：无，使用相对路径 `../` 导入
- 环境变量：`.env` 文件 + `dotenv/config`
- 日志：pino logger，通过 `request.log` / `app.log` 使用
- 数据库访问：通过 `getDb()` / `getRedis()` 获取实例
- 迁移脚本：不可变（已运行的迁移不应修改，新建迁移追加）
- 编码：UTF-8（注意 Windows 下中文编码腐烂问题）

## 关键依赖

- `fastify` — Web 框架
- `drizzle-orm` — 数据库 ORM
- `ioredis` — Redis 客户端
- `pg` (node-postgres) — PostgreSQL 驱动
- `pino` — 日志
- `jsonwebtoken` — JWT
- `bcryptjs` — 密码哈希
- `dotenv` — 环境变量

## 关联文档

- 项目详细文档：`kb/projects/3cloud.md`
- BOSS 记忆：`MEMORY.md`（workspace 根目录）
- 路由引擎流程：`docs/routing-engine-flow.md`
- 计费引擎时序：`docs/billing-engine-sequence.md`
