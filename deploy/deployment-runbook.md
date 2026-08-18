# 3cloud 部署演练 Runbook（P3-3）

> **日期**：2026-08-18
> **前置**：部署闸门通过（本地全量验收 P0–P3 全绿：typecheck 0 错 / 单测 808 / verify 17 / E2E 10 / build / 记账一致），调度-agent 创建 `.deploy-gate-approved` 标记。
> **目标**：生产服 117.78.2.66（华为云 Ubuntu 22.04，2C/1.7G/40G）从空白（2026-08-16 已清空）到 3cloud 可访问。
> **执行方式**：逐步执行，每步有验证点；任何一步失败即停止排查，不跳过。
> **关联**：`deploy/deployment-checklist.md`（检查清单）、`deploy/deploy.sh`（自动化脚本）、`docs/ops-guide.md`。

---

## 阶段 0：前置确认（本地）

```bash
# 1. 本地回归 Gate 最后跑一遍（确认无漂移）
cd /mnt/c/Users/ZH/.openclaw/workspace/3cloud   # 或实际工作目录
pnpm -r typecheck && pnpm test && pnpm verify
cd e2e && pnpm test && cd ..

# 2. 创建部署闸门标记（本地仓库内，随代码上生产）
# 注意：标记只在本仓库存在，生产 clone 后可见；内容为验收摘要
cat > .deploy-gate-approved <<'EOF'
approved: 2026-08-18
by: dispatch-agent
gates: typecheck-0err / vitest-808 / verify-17 / e2e-10 / build-ok / accounting-consistent
EOF
git add .deploy-gate-approved && git commit -m "chore(deploy): 部署闸门批准标记（P0-P3 本地验收全绿）" && git push origin main
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

## 阶段 2：代码部署（SSH）

```bash
# 2.1 拉代码（首次 clone，之后 deploy.sh pull）
git clone git@github.com-3cloud:k19008800/3c.git /root/3cloud
cd /root/3cloud && git checkout main

# 2.2 部署闸门检查（deploy.sh 会自动校验）
test -f .deploy-gate-approved && echo "✅ gate ok" || echo "❌ 无闸门标记"

# 2.3 一键部署（安装→构建→迁移→PM2）
bash deploy/deploy.sh main
```

## 阶段 3：生产配置（SSH）

```bash
cd /root/3cloud

# 3.1 生成生产密钥（JWT/加密），复制到 api/.env
node deploy/gen-prod-config.cjs > api/.env.tmp
# ⚠️ 人工检查 DATABASE_URL / REDIS_URL / SMTP 等占位符后重命名
vi api/.env    # 从 .env.tmp 编辑：填 REDIS 密码、SMTP、api_domain 等
chmod 600 api/.env

# 3.2 PM2 启动
pm2 start deploy/ecosystem.config.js --env production
pm2 save && pm2 startup   # 自启

# 3.3 验证后端
curl -s localhost:3000/health    # {"status":"ok","db":"up","redis":"up"}
curl -s localhost:3000/docs -o /dev/null -w "%{http_code}"   # 200
```

## 阶段 4：前端（SSH）

```bash
# 4.1 Portal 生产模式（:3100）
# Next.js standalone 或 next start；PM2 内可加 portal 条目（或 systemd）
# 本仓库 ecosystem 已含 api；portal 如需 PM2：pm2 start 'cd /root/3cloud/web-portal && pnpm start'
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
| 迁移失败 | PG 迁移前已 pg_dump；`psql -f` 恢复，或重建库 |
| 健康检查失败 | `pm2 logs` 定位；必要时 `git checkout <上一提交>` + 重新部署 |
| 内存不足（1.7G） | api `--max-old-space-size=768`；portal 与 api 不同时高峰；必要时关宝塔面板 |

---

> **状态**：演练文档就绪（P3-3 交付物），未实际执行部署（受部署闸门约束）。
> 关联：`deploy/deployment-checklist.md`、`deploy/deploy.sh`、`deploy/gen-prod-config.cjs`、`docs/ops-guide.md`
