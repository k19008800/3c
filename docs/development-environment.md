# 3cloud (3C) — 开发环境配置

> 最后更新：2026-06-27
> 开发机：Windows 10 x64

---

## 一、环境概览

| 组件 | 版本 | 安装方式 | 状态 |
|---|---|---|---|
| Node.js | v24.16.0 | 系统安装 | ✅ |
| npm | 11.13.0 | 随 Node.js | ✅ |
| PostgreSQL | 17.10 | winget 安装 (EDB) | ✅ 服务运行中 |
| Memurai (Redis) | 4.1.2 | winget 安装 | ✅ 服务运行中 |
| TypeScript | ^6.0.3 | npm 安装 | ✅ |
| Fastify | ^5.3.1 | npm 安装 | ✅ |
| Drizzle ORM | ^0.45.2 | npm 安装 | ✅ |

### 项目结构

```
3cloud/
├── api/                        Fastify 后端
│   ├── src/
│   │   ├── app.ts              应用入口
│   │   ├── index.ts            启动文件
│   │   ├── config.ts           配置模块 (环境变量)
│   │   ├── redis.ts            Redis 连接
│   │   ├── schemas.ts          Zod 校验 Schema
│   │   ├── db/
│   │   │   ├── schema.ts       Drizzle ORM 数据库 Schema
│   │   │   ├── index.ts        数据库连接
│   │   │   └── seed.ts         种子数据
│   │   ├── routes/
│   │   │   └── health.ts       健康检查端点
│   │   ├── middleware/
│   │   │   ├── auth.ts         鉴权中间件 (占位)
│   │   │   ├── rate-limit.ts   限流中间件 (占位)
│   │   │   └── log.ts          审计日志中间件 (占位)
│   │   └── services/
│   │       ├── router.ts       路由引擎 (占位)
│   │       ├── billing.ts      计费引擎 (占位)
│   │       └── health-check.ts 厂商健康检查 (占位)
│   ├── drizzle.config.ts       Drizzle Kit 配置
│   ├── tsconfig.json
│   ├── package.json
│   ├── .env                    开发环境配置
│   └── .env.example            配置模板
├── web/                        前端 (待建)
├── docs/                       项目文档
└── docker-compose.yml          Docker 编排 (参考)
```

---

## 二、安装步骤

### 2.1 基础环境

```powershell
# 检查 Node.js
node --version   # v24.16.0
npm --version    # 11.13.0

# 安装 PostgreSQL（本机已完成）
winget install PostgreSQL.PostgreSQL.17

# 安装 Memurai (Windows Redis)
winget install Memurai.MemuraiDeveloper
```

> **注意：** EDB PostgreSQL 安装时会提示设置 postgres 用户密码。开发环境统一使用 `postgres`。

### 2.2 项目依赖

```powershell
cd 3cloud/api
npm install --legacy-peer-deps
```

### 2.3 创建数据库

```powershell
# 创建项目数据库
psql -U postgres -c "CREATE DATABASE threecloud ENCODING 'UTF8';"

# 推送表结构
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/threecloud"
npx drizzle-kit push --force

# 插入种子数据
npx tsx src/db/seed.ts
```

### 2.4 启动开发服务器

```powershell
# 开发模式（热重载）
cd 3cloud/api
npx tsx watch src/index.ts

# 访问端点
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

---

## 三、数据库

### 连接信息

| 项 | 值 |
|---|---|
| 主机 | localhost:5432 |
| 数据库 | threecloud |
| 用户 | postgres |
| 密码 | postgres |
| 连接串 | `postgres://postgres:postgres@localhost:5432/threecloud` |

### 表结构

共 17 张表，通过 Drizzle ORM 管理：

| 模块 | 表名 | 说明 |
|---|---|---|
| 用户 | `users` | 用户表（含实名、余额、团队、角色） |
| | `api_keys` | API Key（SHA-256 哈希存储） |
| | `team_members` | 团队成员关联 |
| | `user_role_history` | 角色变更轨迹 |
| | `user_discounts` | 用户折扣配置 |
| 模型 & 厂商 | `vendors` | 厂商 |
| | `models` | 模型定义 |
| | `vendor_models` | 厂商-模型关联（含定价、健康状态） |
| 计费 | `call_logs` | 调用日志全量明细 |
| | `recharge_orders` | 充值订单 |
| | `balance_logs` | 余额变动流水 |
| 代理商 | `agents` | 代理商信息 |
| | `agent_clients` | 代理商-客户关联 |
| | `commission_logs` | 佣金流水 |
| | `withdraw_orders` | 提现订单 |
| 系统 | `system_configs` | 系统配置（KV） |
| | `audit_logs` | 操作审计日志 |
| | `email_templates` | 邮件模板 |
| | `page_contents` | 内容管理（API 文档等） |

### 常用 Drizzle 命令

```powershell
# 生成迁移文件
npx drizzle-kit generate

# 推送到数据库
npx drizzle-kit push --force

# 可视化 Studio
npx drizzle-kit studio

# 数据类型规范
# - 金额字段: DECIMAL(18,6)
# - 时间字段: TIMESTAMP WITH TIME ZONE (UTC 存储)
```

### 已有种子数据

`system_configs` 表已预置 23 条系统配置，包括：
- 限流默认值（RPM/TPM）
- 告警阈值
- 定价倍率（1.33）
- 代理商提现限制（每日 3 次）
- 免费体验额度（50000 Token / 7 天）
- 折扣默认值
- 支付密钥 (占位空值)

---

## 四、Redis (Memurai)

本地使用 Memurai（Windows 原生 Redis 兼容实现）作为开发环境缓存。

| 项 | 值 |
|---|---|
| 连接地址 | redis://localhost:6379 |
| 用途 | Session / 缓存 / 限流计数器 / 滑动窗口 |

```powershell
# 验证连接
memurai-cli ping   # 应返回 PONG
```

> **生产环境：** 使用标准 Redis 6.x。Docker Compose 配置参考 `../docker-compose.yml`。

---

## 五、开发命令速查

```powershell
# 启动 API 服务（热重载）
npm run dev

# 构建
npm run build

# 类型检查
npm run lint

# 数据库推送
npm run db:push

# 数据库 Studio（可视化）
npm run db:studio
```

### package.json scripts

```json
{
  "dev": "tsx watch src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "next": "npm run db:push && npm run dev"  // 一键建表+启动
}
```

---

## 六、环境变量

参见 `api/.env.example`，开发环境关键变量：

| 变量 | 开发环境值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/threecloud` | PG 连接 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接 |
| `CORS_ORIGIN` | `http://localhost:5173` | Vite 开发服务器地址 |
| `JWT_ACCESS_SECRET` | 开发密钥 | 生产环境必须更换 |
| `VENDOR_KEY_ENCRYPTION_KEY` | 开发密钥 | 厂商 API Key 加密密钥 |

---

## 七、生产环境参考

| 配置项 | 生产值 |
|---|---|
| 服务器 | 117.78.2.66 |
| 操作系统 | Ubuntu 22.04 |
| CPU/内存/磁盘 | 2C / 1.7G / 40G |
| Node.js | 20.20.2 |
| Nginx | 1.30.2 |
| PostgreSQL | 17 |
| Redis | 6.0.16 |
| 进程管理 | PM2 |

生产部署流程详见 PRD 第九章「开发路线图」。
