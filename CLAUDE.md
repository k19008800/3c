# CLAUDE.md — 3cloud (3C)

> AI Token 聚合平台 — 对接多家模型供应商，为下游用户/代理商提供统一的 Token 计费和路由服务。

## Workspace 目录布局

```
3cloud/               ← 🏠 主项目（日常开发）
3cloud-transfer/      ← 📦 迁移/中转过渡区（隔离操作）
3cloud.worktrees/     ← 🌿 git worktree 分支隔离
```

> **默认工作目录是 `3cloud/`**。文档在 `kb/projects/3cloud.md`。

## 架构概览

```
api/                  Fastify + TypeScript 后端
  src/db/             Drizzle ORM schema + migrations
  src/routes/admin/   管理后台路由
  src/services/       业务逻辑层
  src/middleware/      鉴权/中间件
  src/cron/           定时任务
web/                  Vite + React + Recharts 前端
docs/                 设计文档（routing-engine-flow.md, billing-engine-sequence.md）
```

**技术栈**: Fastify 5 + TS / Drizzle ORM + PG 17 / Redis (ioredis) / Vite + React + Recharts + Tailwind / JWT / bcryptjs + AES-256-GCM

## 常用命令

```bash
# API 开发
cd api && npx tsx watch src/index.ts          # 热重载 :3000
# 数据库迁移
cd api && npx tsx src/db/migrate.ts
# 前端开发
cd web && npm run dev                          # :5175
# 生产构建
cd api && npx tsc && node dist/index.js        # API 构建
cd web && npm run build                        # 前端构建
# 启动基础设施
docker compose up -d                           # PG + Redis + MailDev
```

**关键端点**: `GET /health` / `GET /ready` / `POST /v1/chat/completions`（核心代理入口）

## 核心业务模块

- **Token 代理路由** (`services/router.ts`): 鉴权 → 余额检查 → 模型解析 → 限流 → 路由策略 → 上游转发 → 计费
- **计费引擎**: `(prompt_tokens × sellPriceInput + completion_tokens × sellPriceOutput) × pricingMultiplier × discountRate`，DECIMAL(18,6) 截断
- **代理商体系**: 分佣、提现审核、充值双审、结算对账（锁定结算单/CSV 导出）
- **安全模块**: 登录锁定/异地检测/安全事件/RBAC 6 角色/API Key SHA-256 哈希
- **管理后台**: 仪表盘/用户/供应商/模型/限流/审计/实名/财务/成本/活动

## 生产环境

| 环境 | IP | 说明 |
|------|-----|------|
| 主服 | `117.78.2.66` | 华为云, PM2 cluster :3030 |
| 备服 | `123.60.55.62` | 华为云, 宝塔 :9999 |
| 阿里云 | `8.149.140.186` | Alibaba Cloud Linux 3 |

域名: `unmisa.com` / `api.unmisa.com` / `tokens.unmisa.com`
SSH: `ssh root@117.78.2.66 -i ~/.ssh/3cloud_prod`

## 开发约定

- TypeScript ESM, 相对路径导入, pino logger, `getDb()`/`getRedis()`
- 迁移脚本**不可变**（已运行的迁移不修改，新建迁移追加）
- 编码 UTF-8（注意 Windows PUA 编码问题）
- side nav（`Sidebar.tsx`）与路由（`App.tsx`）**必须成对添加**

## Gotchas ⚠️

| 陷阱 | 说明 |
|------|------|
| **中文编码腐烂** | Windows 下 Vite oxc 解析 TSX 时可能产生 PUA 字符替换中文字符。修复：`git checkout` 恢复，或手动修正反引号/中文字符串 |
| **Sidebar + Route 成对** | 侧边栏导航链接与 `App.tsx` 路由配置必须同时新增/删除，缺一不可 |
| **迁移不可变** | 已运行的 Drizzle 迁移禁止修改，必须新建迁移文件追加变更 |
| **Vite proxy `/api` → `/api/`** | picomatch 前缀匹配 `/api` 会拦截 `/api-keys` SPA 路由，Vite proxy 必须写成 `/api/`（带斜杠） |
| **Drizzle 泛型约束** | 某些边界条件需用 `table: any` 绕过 PgTable 泛型不满足的问题 |
| **供应商 modelCount** | 数据库 `count(*)` 返回 bigint，需 `Number()` 转换避免前端类型错误 |
| **部署 web 隔离** | 生产 `web/dist/` 在 `/www/wwwroot/3c/` 而非源码目录，构建后需 `cp` |
| **`NOT` 条件** | 在 SQL 筛选/RBAC 中 `NOT` 不同入精确值时需显式写 `!=` 而非 `NOT` |

## AI 编程行为准则（Karpathy 四项原则）

1. **先思考，再编码** — 编码前阐明假设，有多个方案先列出不暗自选择，拿不准先问
2. **简洁优先** — 用最少代码解决问题，不搞推测性设计 / 提前抽象 / 不必要的扩展点
3. **精准改动** — 只改任务必需的文件和行，不乱改相邻代码/注释/格式，每行 diff 可追溯
4. **目标驱动执行** — 定义可验证的成功标准，用测试闭环完成任务（先写测试再实现）

## 关联文档

- 项目详情: `kb/projects/3cloud.md`
- 验证协议: `docs/verification-protocol.md`（覆盖 8 个管理页面 + 权限验证 + 嵌入式检查）
- 路由流程: `docs/routing-engine-flow.md`
- 计费时序: `docs/billing-engine-sequence.md`
