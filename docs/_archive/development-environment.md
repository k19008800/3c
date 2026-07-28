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

### 7.1 DNS 解析

所有域名解析到 `117.78.2.66`：

| 域名 | 用途 |
|---|---|
| `unmisa.com` | Web 控制台（用户端 + 管理后台） |
| `www.unmisa.com` | Web 控制台（www 别名） |
| `api.unmisa.com` | Token 代理 API（兼容 OpenAI 格式） |
| `tokens.unmisa.com` | Token 代理 API（备用地址） |

### 7.2 磁盘信息

| 服务器 | 117.78.2.66 |
| 操作系统 | Ubuntu 22.04 |
| CPU/内存/磁盘 | 2C / 1.7G / 40G |
| Node.js | 20.20.2 |
| Nginx | 1.30.2（宝塔管理） |
| PostgreSQL | 17 + pgvector 0.8.2 |
| Redis | 6.0.16（密码保留） |
| PM2 | 7.0.1 |
| 进程管理 | PM2 |

生产部署流程详见 PRD 第九章「开发路线图」。

---

## 八、运维交接

### 8.1 服务器信息

| 项 | 值 |
|---|---|
| IP | `117.78.2.66` |
| SSH 用户 | `root` |
| 认证方式 | 密钥认证（密码已禁用） |
| 内网 IP | `172.31.12.64` |
| 操作系统 | Ubuntu 22.04 |
| UFW 规则 | 已开放 22/80/443/8888，key-only |
| Host Key (ED25519) | `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGLy/c9JsWfQEUAQ/ayIuGvBAxiyNukWpS3sCc8+eDPJ` |
| SSH 私钥 | `~/.ssh/3cloud_prod` |
| SSH 公钥指纹 | `SHA256:vnfjagHNE53+4EldSN8OAoGAWN8lcDKGmtu0mdrl7KA` |

```bash
# SSH 登录（密钥认证）
ssh root@117.78.2.66
# 或指定密钥文件：
ssh -i ~/.ssh/3cloud_prod root@117.78.2.66
```

> ⚠️ 首次连接验证 Host Key 指纹与上表一致再接受。本地 SSH 配置已在 `~/.ssh/config` 中预配。

### 8.2 宝塔管理面板

| 项 | 值 |
|---|---|
| 面板地址 | `https://117.78.2.66:8888/login` |
| 用户名 | `unmisa` |
| 密码 | `AsdX23456` |

> ⚠️ 宝塔面板通过 8888 端口 HTTPS 访问，登录后建议修改密码。

### 8.3 数据库连接

| 项 | 值 |
|---|---|
| 数据库 | `cloud3` |
| 用户 | `cloud3` |
| 密码 | `123457` |
| 地址 | `127.0.0.1:5432` |
| SSL | 无（本地连接） |
| 连接串 | `postgres://cloud3:123457@127.0.0.1:5432/cloud3` |

> ⚠️ 生产库名 `cloud3`（非开发库 `threecloud`），注意区分。

### 8.4 Redis 连接

| 项 | 值 |
|---|---|
| 地址 | `127.0.0.1:6379` |
| 密码 | `96647d7581d0b133` |

```bash
# 本地测试
redis-cli -a 96647d7581d0b133 PING
```

### 8.5 数据库扩展

- PostgreSQL 17 已安装 **pgvector 0.8.2** 扩展
- 如需向量检索能力，可直接使用（如 AI 嵌入相关功能）

### 8.6 后台管理员账号

| 项 | 值 |
|---|---|
| 邮箱 | `admin@3cloud.ai` |
| 密码 | `Admin1234!` |
| 角色 | `super_admin` |

> ⚠️ 此为 3cloud 业务系统后台的超级管理员账号。首次登录建议修改密码。

### 8.7 磁盘信息

- **系统盘:** 40GiB
- **Swap:** 2GiB（已配置）
- **内存:** 1.7GiB

### 8.8 运维注意事项

1. **内存紧张:** 1.7G 跑 PG + Redis + Node 很极限，注意监控 OOM
2. **磁盘监控:** PG WAL 日志和 `/uploads/` 可能快速占用磁盘，建议建 crontab 自动清理
3. **数据库备份:** 每日 `pg_dump` 全量备份，保留 7 天；每周一推送外部存储
4. **超级管理员灾备:** SSH 到服务器本地运行 `reset-super-admin.ts` 脚本重置，不暴露到网络端口
5. **CORS:** 生产环境仅允许 `https://unmisa.com`，不设通配符

生产部署流程详见 PRD 第九章「开发路线图」。

