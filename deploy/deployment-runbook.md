# 3cloud 部署演练 Runbook（P3-3）

> **日期**：2026-08-30
> **状态**：review；实际部署未执行。
> **前置**：必须先完成并确认 `docs/07-quality-and-acceptance/release-baseline.md`，由发布负责人确认后才可创建 `.deploy-gate-approved`。历史 1159/1132/808 不作为正式基线。
> **目标**：生产服 117.78.2.66（华为云 Ubuntu 22.04，2C/1.7G/40G）从空白（2026-08-16 已清空）到 3cloud 可访问。
> **执行方式**：逐步执行，每步有验证点；任何一步失败即停止排查，不跳过。
> **关联**：`deploy/deployment-checklist.md`（检查清单）、`deploy/deploy.sh`（自动化脚本）、`docs/ops-guide.md`。

---

## 阶段 0：前置确认（本地）

```bash
# 1. 在发布候选提交上执行并登记全部门禁
# 命令、范围、结果和环境必须写入 docs/07-quality-and-acceptance/release-baseline.md
pnpm -r lint && pnpm -r typecheck && pnpm test && pnpm verify
cd e2e && pnpm test && cd ..
pnpm -r build

# 2. 只有 release-baseline 获发布负责人确认后，才允许创建部署标记
# 当前阶段不得创建 .deploy-gate-approved，不得执行 git add/commit/push。
```

## 阶段 1：生产服基础就绪（SSH 117.78.2.66）

```bash
ssh -i ~/.ssh/3cloud_prod root@117.78.2.66

# 1.1 系统依赖（宝塔已有 nginx/pg/redis，确认版本）
nginx -v                                   # 应 ≥ 1.30
psql --version                             # 应 17.x（/usr/lib/postgresql/17/bin 或宝塔）
redis-cli ping                             # 应 PONG

# 1.2 建库（新库 threecloud_v3，勿用旧名）
sudo -u postgres psql -c "CREATE DATABASE threecloud_v3 OWNER postgres;"

# 1.3 Redis 密码（生产禁止无密码）→ 记录到生产 .env
redis-cli CONFIG SET requirepass '<GENERATED>'
redis-cli -a '<GENERATED>' PING            # 验证

# 1.4 Node/pnpm
node -v                                    # 应 ≥ 20.11（import.meta.dirname 需要）
corepack enable && corepack prepare pnpm@9.0.5 --activate
```

## 阶段 2：生产配置与 preflight（SSH；必须先于代码部署）

```bash
# 2.1 拉代码（首次 clone，之后 deploy.sh pull）
git clone git@github.com-3cloud:k19008800/3c.git /root/3cloud
cd /root/3cloud && git checkout main

# 2.2 生成并核验生产配置（必须在 deploy.sh 前完成）
node deploy/gen-prod-config.cjs > api/.env.tmp
# ⚠️ 人工检查 DATABASE_URL / REDIS_URL / SMTP 等占位符并写入 api/.env
vi api/.env
chmod 600 api/.env
# 验证 DATABASE_URL/REDIS_URL、数据库连通性、Redis PING 和生产配置权限

# 2.3 部署闸门检查（当前阶段不得创建标记）
test -f .deploy-gate-approved && echo "✅ gate ok" || echo "❌ 无闸门标记"
```

> 注意：`deploy/deploy.sh` 在安装和构建前要求 `api/.env` 存在。必须完成上述生产配置、权限和数据库/Redis 连通性检查后，才可进入阶段 3。

## 阶段 3：代码部署（SSH；仅在 release-baseline approved 且 preflight 通过后）

```bash
# 3.1 一键部署（仅在环境/备份/release-baseline 均通过后）
bash deploy/deploy.sh main

# 3.2 PM2 启动（deploy.sh 已执行时无需重复启动）
mkdir -p /var/log/3cloud
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save && pm2 startup   # 自启

# 3.3 验证后端
curl -s localhost:3000/health    # {"status":"ok","db":"up","redis":"up"}
curl -s localhost:3000/docs -o /dev/null -w "%{http_code}"   # 200
```

## 阶段 4：前端（SSH）

```bash
# 4.1 Portal 生产模式（:3100）
# deploy/ecosystem.config.cjs 已包含 3cloud-portal，直接由 PM2 托管。
# （生产内存 1.7G：api + portal 两个 node 进程需控制，必要时 api 用 --max-old-space-size=768）

# 4.2 验证 portal 本地
curl -s localhost:3100/robots.txt | head -1
curl -s localhost:3100/app | grep -c '<div id="root">'   # SPA shell 存在
```

## 阶段 5：Nginx + 域名 + SSL（宝塔）

```bash
# 5.1 上传 vhost 配置
# deploy/api.unmisa.com.conf → /www/server/panel/vhost/nginx/api.unmisa.com.conf
# deploy/unmisa.com.conf     → /www/server/panel/vhost/nginx/unmisa.com.conf
# 或宝塔面板「网站」手动创建并替换配置

# 5.2 DNS 确认（本地查）
nslookup api.unmisa.com    # → 117.78.2.66
nslookup unmisa.com        # → 117.78.2.66

# 5.3 SSL 证书（宝塔 Let's Encrypt 申请，或已有证书）
# api.unmisa.com fullchain/privkey → /www/server/panel/vhost/cert/api.unmisa.com/
# unmisa.com fullchain/privkey     → /www/server/panel/vhost/cert/unmisa.com/

# 5.4 重载 nginx
nginx -t && nginx -s reload
```

## 阶段 6：上线冒烟（本地浏览器/curl）

```bash
# 6.1 主站
curl -sI https://unmisa.com | head -3                    # 200
curl -s https://unmisa.com/app | grep -c '<div id="root">'
curl -s https://unmisa.com/pricing -o /dev/null -w "%{http_code}\n"   # 200

# 6.2 API 网关双 base_url（需先注册用户建 Key）
curl -s https://api.unmisa.com/health
curl -s https://api.unmisa.com/v1/models -H "Authorization: Bearer <KEY>" | head -c 200
curl -s https://api.unmisa.com/anthropic/v1/messages -H "x-api-key: <KEY>" -H "anthropic-version: 2023-06-01" -d '{"model":"claude-3-5-sonnet","max_tokens":16,"messages":[{"role":"user","content":"hi"}]}' | head -c 200

# 6.3 后台系统设置 → API 服务：确认 api_domain=api.unmisa.com（新版本默认派生，改域名仅需此处+nginx+DNS）
```

## 阶段 7：收尾

```bash
# 7.1 记账冒烟：调一次 chat → 查 consumption_records 增长 + 余额扣减
# 7.2 日志检查
pm2 logs 3cloud-api --lines 50 | grep -i error   # 应无 ERROR
tail -50 /www/wwwlogs/api.unmisa.com.error.log
# 7.3 更新 kb/infrastructure/servers.md 部署状态
# 7.4 部署报告归档 docs/test-reports/ 或 memory
```

---

## 回滚预案

| 场景 | 动作 |
|------|------|
| 构建失败 | 保留旧 dist + PM2 旧进程，`pm2 reload` 不执行；排查后重试 |
| 迁移失败 | 立即停止且不启动 PM2；custom dump 使用 `pg_restore`。无经验证的逆向脚本时仅允许备份恢复，并执行结构/数据校验 |
| 健康检查失败 | `pm2 logs` 定位；必要时 `git checkout <上一提交>` + 重新部署 |
| 内存不足（1.7G） | api `--max-old-space-size=768`；portal 与 api 不同时高峰；必要时关宝塔面板 |

---

> **状态**：演练文档为 review 草案，未实际执行部署（受部署闸门约束）。正式测试基线引用 `docs/07-quality-and-acceptance/release-baseline.md`。
> 关联：`deploy/deployment-checklist.md`、`deploy/deploy.sh`、`deploy/gen-prod-config.cjs`、`docs/ops-guide.md`
