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

## 全局功能验证协议

> 核心信条：**页面加载成功 ≠ 功能正常。** 每个页面必须实际交互才有意义。
> 默认走一遍 = 页面打开 + 所有交互操作 + 边界条件 + 端到端数据流，缺一不可。

### 第零步：构建验证（CI 级别）
- [ ] `api: npx tsc --noEmit` 零错误
- [ ] `web: npx tsc --noEmit` 零错误
- [ ] API 能正常启动（端口不冲突）
- [ ] 前端代理到 API 正常

### 第一步：权限骨架（API 级别，最快）
- [ ] 用 `super_admin` / `admin` / `finance_ops` / `ops` / `support` / `auditor` 六个角色，对每个管理端点发请求，验证角色边界与 `ROLE_PERMISSIONS` 一致
- [ ] 检查每一个新增端点的 `preHandler` 是否挂了正确的 `requirePerm()`

### 第二步：交互式走遍前端（核心）

> 这是验证的主流程。对每个管理页面，**进入后立即执行该页面所有可操作功能**，在操作过程中自然覆盖边界条件、数据流、错误处理。

#### 页面清单 + 每页必做操作

##### 📊 管理仪表盘
- [ ] 切换时间范围（今日/本周/本月/近三月/自定义），图表是否响应
- [ ] 切换指标（调用量/Token/成本/营收/耗时/成功率）
- [ ] 切换图表类型（折线/柱状/面积）
- [ ] 点击刷新按钮
- [ ] 点击聚合统计/熔断看板等跳转链接

##### 👤 用户管理
- [ ] **创建用户**：填邮箱/密码 → 提交 → 列表里出现 → 边界：空邮箱提交、格式错误的邮箱
- [ ] **搜索**：精确匹配已存在用户 → 模糊匹配部分关键词 → 搜不存在的字符串 → 清空搜索
- [ ] **筛选**：按状态筛选（正常/禁用/待验证/已注销）→ 按角色筛选 → 组合筛选 → 清除条件
- [ ] **分页**：翻第2页 → 跳到最后一页 → 跳到不存在的页数 → 改每页条数 20→50→100
- [ ] **查看详情**：点击用户详情，检查各个 tab（余额/审计/登录历史/调用统计）
- [ ] **编辑**：修改用户信息后保存 → 刷新页面验证持久化
- [ ] **状态切换**：禁用用户 → 列表状态变化 → 再启用
- [ ] **导出 CSV**：下载并验证内容

##### 🤖 模型管理 / 供应商管理
- [ ] **创建**模型/供应商 → 列表中确认出现
- [ ] **编辑**名称/端点/状态 → 保存 → 刷新后确认
- [ ] **删除** → 确认对话框 → 列表移除
- [ ] **搜索/筛选**：精确、模糊、空结果、组合条件
- [ ] **分页**边界验证
- [ ] 供应商：测试行内展开模型明细、行内开关（启用/禁用）、连通性测试

##### 💰 财务管理（财务工作台 / 佣金 / 对账 / 成本 / 结算 / 充值）
- [ ] 财务工作台：切换概览/趋势/分类/排行 tab，各图表是否加载
- [ ] 对账报表：切换日/周/月粒度 → 点生成报表 → 检查数据 → 导出 CSV
- [ ] 充值订单：筛选状态/时间 → 查看详情弹窗（银行/账号/转账日期/凭证）
- [ ] 提现管理：筛选待审/已审 → 查看每笔详情
- [ ] 结算对账：锁定结算单 → CSV 导出

##### 🛡️ 安全风控（安全总览 / 安全事件 / 封禁 / 告警）
- [ ] 安全总览：图表是否渲染，统计数据是否正确
- [ ] 安全事件：筛选事件类型/等级 → 确认事件 → 查看详情
- [ ] 封禁管理：创建封禁（IP/用户）→ 列表确认 → 解封

##### ⚙️ 运维配置（系统配置 / 站点设置 / 限流管理 / 邮件模板 / 内容管理）
- [ ] **站点设置**：上传 Logo（.png, .jpg, .svg 三种格式都测）→ 保存 → 刷新页面检查持久化
- [ ] 站点设置：上传 Favicon 同上
- [ ] **站点设置边界**：超大文件 → 空文件 → 不支持格式（.exe/.pdf）→ 不填必填字段保存
- [ ] 限流管理：查看实时水位 → 编辑限流规则 → 保存 → 添加用户覆盖规则
- [ ] 邮件模板：查看模板列表 → 编辑模板 → 保存 → 预览
- [ ] 系统配置：修改配置项 → 保存 → 刷新验证

##### 📋 审计合规（审计日志 / 操作日志 / 调用日志 / 公告 / 活动）
- [ ] 审计日志：按操作类型筛选 → 按对象类型筛选 → 按时间范围筛选 → 导出 CSV
- [ ] 每个筛选条件组合后检查列表是否对应
- [ ] 翻页验证（全部列同上）

##### 🔐 角色权限
- [ ] 查看每个角色的权限矩阵（权限一览列全部展开）
- [ ] 创建自定义角色 → 勾选权限 → 保存 → 列表中确认
- [ ] 删除自定义角色
- [ ] 分配用户到角色 → 确认用户出现在角色成员中

### 第三步：每次操作中的嵌入式检查

以上每步交互操作在执行时，**同步检查**以下维度（不再独立列项）：

| 维度 | 嵌入操作的方法 |
|------|---------------|
| **边界条件** | 创建时故意留空、填超长文本、传超大文件、搜不存在的数据，看前端反应 |
| **端到端数据流** | 创建后 → 列表确认 → 编辑 → 刷新确认 → 删除 → 列表消失，形成 CRUD 闭环 |
| **错误处理** | 每次 API 调用后检查 Network 面板状态码；提交非法数据看是否有有意义的错误提示 |
| **数据持久化** | 每次保存操作后 F5 刷新页面，数据应该还在 |
| **临时文件清理** | 上传操作后检查后端 public/uploads/ 目录是否产生垃圾文件 |

### 验证责任
- 开发过程中每完成一个功能模块就按此清单自检
- **严禁只打开页面看一眼就说"验证通过"**
- 遇到权限问题：检查 `src/middleware/auth.ts` 中的 `ROLE_PERMISSIONS`
- 遇到文件处理问题：检查 multipart 字段读取、sharp 入/出路径是否相同、文件扩展名处理
- 遇到显示问题：打开 DevTools → Console 看前端报错 → Network 看请求响应
