# 🚀 3cloud 本地启动方案（Local Dev Setup）

> 最后更新：2026-08-26
> 适用：本地开发环境（Windows）
> 用途：**启动 3cloud 项目时，直接按本文执行即可，无需重新排查环境。**

---

## ✅ 前置条件（已就绪，无需再检查）

| 组件 | 版本/说明 | 入口 |
|------|-----------|------|
| Node.js | v24.18.0 | `node -v` |
| pnpm | 11.x（monorepo 包管理器） | `pnpm -v` |
| PostgreSQL | 17，本地已运行，端口 5432 | 数据库名：**`threecloud_v3`** |
| **Redis** | **通过 Docker Desktop 提供**（容器 `redis:7-alpine`，端口 6379） | 见下方「Redis 说明」 |

> ⚠️ **数据库名是 `threecloud_v3`**（不是 `threecloud`，也不是 `threecloud_v2`）。
> 配置源：`3cloud/api/.env` → `DATABASE_URL=postgres://postgres:postgres@localhost:5432/threecloud_v3`

---

## 🐳 Redis 说明（重要 — 不要再搜 Memurai）

> **本机已卸载 Memurai**（`C:\Program Files\Memurai` 下仅剩配置文件，可执行文件与服务早已移除）。
> **Redis 统一用 Docker Desktop 跑**：容器 `redis`（镜像 `redis:7-alpine`），端口 `6379` → `6379`。

**启动 Redis 的步骤**（Docker Desktop 引擎就绪后容器会自动起）：

```powershell
# 1. 若 Docker 引擎未运行，先启动 Docker Desktop
Start-Process "C:\Users\ZH\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"

# 2. 等待引擎就绪（轮询）
while (-not (& docker version *> $null)) { Start-Sleep -Seconds 5 }

# 3. 容器应自动运行；若未运行，手动启动
docker start redis     # 容器已存在（--restart 策略自动拉起）

# 4. 确认
docker ps --filter "name=redis"
# 期望输出：redis | redis:7-alpine | Up ... | 0.0.0.0:6379->6379/tcp
```

**验证 Redis 是否对该 API 可见**：

```powershell
Invoke-WebRequest http://localhost:3000/api/v1/health -UseBasicParsing | Select-Object -ExpandProperty Content
# 期望：{"status":"ok","db":"up","redis":"up",...}
```

> 若健康检查返回 `"redis":"down"`，说明 Redis 容器未运行或未映射端口，回到上面「启动 Redis」步骤。

---

## ▶️ 启动 3cloud

在项目根目录 `C:\Users\ZH\.openclaw\workspace\3cloud` 执行：

```powershell
cd C:\Users\ZH\.openclaw\workspace\3cloud
pnpm dev
```

**这条命令会做三件事**（见根 `package.json`）：

1. `predev` → `node scripts/prepare-app.cjs`：构建 `web-console` 并把 `dist/` 拷贝到 `web-portal/public/app/`（web-console 由 portal 静态托管，不再单独依赖 Vite dev server）。
2. `--filter @3cloud/api dev` → `tsx watch` 启动 API（端口 **3000**）。
3. `--filter web-portal dev` → `next dev -p 5177` 启动 Portal（端口 **5177**）。

---

## 🔗 访问地址

| 入口 | URL | 说明 |
|------|-----|------|
| API 健康检查 | `http://localhost:3000/api/v1/health` | 绿：`db up` + `redis up` |
| Swagger 文档 | `http://localhost:3000/docs` | API 在线文档 |
| Web Portal（门户） | `http://localhost:5177` | Next.js SSR 门户 |
| Console（管理/控制台） | `http://localhost:5177/app` | 由 Portal 托管，走 `/app/` |

---

## 🗄️ 数据库操作

| 命令 | 说明 |
|------|------|
| `pnpm --filter @3cloud/api db:seed` | **初始化/演示数据**（幂等，可重复执行；含管理员 + 演示客户 + 实名认证样例 + 系统配置等） |
| `pnpm --filter @3cloud/api db:push` | 用 schema 直接同步数据库（drizzle push） |
| `pnpm --filter @3cloud/api db:migrate` | 执行 migration（drizzle-kit migrate） |

**演示账号（db:seed 产生）**：

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 超级管理员 | `admin@3cloud.dev` | `Admin@2024!` |
| 演示用户 | `demo@3cloud.dev` | `Demo@1234` |

---

## 📝 其它脚本（根 package.json）

| 命令 | 说明 |
|------|------|
| `pnpm dev:api` | 只起 API |
| `pnpm dev:portal` | 只起 Portal |
| `pnpm dev:app` | 只起 web-console（Vite dev） |
| `pnpm build` | 构建 shared + api + console + portal |
| `pnpm test` | API 单测（vitest） |
| `pnpm lint` | 全量 ESLint |

---

## 🔧 常见故障排错

| 症状 | 原因 / 处理 |
|------|-------------|
| health 返回 `"redis":"down"` | Redis 容器未运行 → 按「启动 Redis」步骤拉起 `docker start redis` |
| `localhost:3000` 无响应 | 之前后台 dev 任务已退出 → 重新 `pnpm dev` |
| `predev`/构建很慢 | 正常，web-console 生产构建约 10~15s，耐心等待 |
| 端口冲突（3000/5177） | 用 `netstat -ano \| findstr :3000` 查占用进程并结束，或改 `.env`/脚本端口 |
| 数据库连接失败 | 确认 PostgreSQL 本地服务运行，且库名是 `threecloud_v3` |

---

## 🔗 相关文件

- 根 `package.json`（dev 脚本定义）
- `scripts/prepare-app.cjs`（predev：构建 console → portal 托管）
- `3cloud/api/.env`（DATABASE_URL / REDIS_URL / JWT secrets）
- `PHASE0-INIT.md`（工程底座初始化说明，含旧环境信息，以本文为准）