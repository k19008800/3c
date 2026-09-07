# 3cloud 生产部署检查清单（P3-3）— 受部署闸门约束

> **前置闸门**：只有 `docs/07-quality-and-acceptance/release-baseline.md` 生成真实候选版本记录并经发布负责人确认后，调度-agent 才可批准部署（创建 `.deploy-gate-approved` 标记）。历史测试数字不作为正式基线：
> - [ ] release-baseline 状态为 `approved`
> - [ ] 同一提交 SHA、依赖锁文件和环境快照
> - [ ] lint / typecheck / build
> - [ ] 单元、API 集成、迁移、权限/2FA/幂等、E2E、verify
> - [ ] 记账一致性与压测证据
> - [ ] 无未登记的 failed/flaky/blocked 门禁

---

## 一、生产密钥与配置

- [ ] 运行 `node deploy/gen-prod-config.cjs` 生成生产密钥（JWT_SECRET / JWT_REFRESH_SECRET / ENCRYPTION_KEY）
- [ ] 写入生产 `.env`（`/root/3cloud/api/.env` 或 PM2 env），**禁止复用开发配置**
- [ ] 配置 SMTP（邮件验证/通知/发票必用）
- [ ] 支付配置按需（微信/支付宝商户参数）
- [ ] `system_config.api_domain` 后台设置为 `api.unmisa.com`

## 二、数据库

- [ ] 生产 PG 创建库 `threecloud_v3`（**新库，勿用旧库名**）
- [ ] 迁移执行：先 `pnpm --filter @3cloud/api db:migrate`，再从 `api/` 执行 `pnpm run db:migrate:manual`（0017-0032，单执行者、失败即停）；禁止使用未确认的 `node api/run-manual-migrations.cjs`
- [ ] 分区表确认：`consumption_records` / `balance_transactions` 为分区表（relkind=p），子表按月
- [ ] 迁移前验证最近成功备份不超过 24 小时、文件存在、大小合理、SHA-256 正确且可恢复；定时备份每日 04:00，本机 7 天、异地 30 天
- [ ] PG 参数优化（shared_buffers / work_mem 等，见 ops-guide §3.2）

## 三、Redis

- [ ] 生产 Redis 运行（systemd / docker），确认 `PING → PONG`
- [ ] 密码设置（生产禁止无密码），`REDIS_URL=redis://:password@localhost:6379`

## 四、Nginx / 域名 / SSL

- [ ] `api.unmisa.com` DNS → 生产服 IP（117.78.2.66）
- [ ] vhost：`deploy/api.unmisa.com.conf`（独立 API 网关：OpenAI `/v1` + Anthropic `/anthropic`）
- [ ] vhost：`deploy/unmisa.com.conf`（Portal：/app SPA + Next.js 3100）
- [ ] SSL 证书：api.unmisa.com + unmisa.com 全链（宝塔 Let's Encrypt）
- [ ] 确认 `/app` 静态托管路径与 `prepare-app.cjs` 产物一致（web-console dist → portal public/app）

## 五、进程管理

- [ ] PM2 安装；`deploy/ecosystem.config.cjs` 就位（API + Portal 单实例，内存 1.7G 防 OOM）
- [ ] `pm2 start deploy/ecosystem.config.cjs`；`pm2 save` + `pm2 startup`
- [ ] 健康检查：`curl localhost:3000/health` → `{"status":"ok","db":"up","redis":"up"}`

## 六、部署后验证（上线冒烟）

- [ ] Portal 首页可访问（HTTPS）
- [ ] Console 登录 / 注册可用
- [ ] `POST https://api.unmisa.com/v1/chat/completions` 用测试 Key 调用成功（真实上游或 mock）
- [ ] `POST https://api.unmisa.com/anthropic/v1/messages` 调用成功
- [ ] 消费记账出现（consumption_records 增长）、余额扣减正确
- [ ] 日志无 ERROR（`pm2 logs 3cloud-api`）

---

> **状态**：本清单为部署准备产物（P3-3），实际部署待闸门批准后执行。正式测试基线唯一来源为 `docs/07-quality-and-acceptance/release-baseline.md`，当前仍为 `not_ready`。
> 关联：`docs/ops-guide.md`、`deploy/deploy.sh`、`deploy/api.unmisa.com.conf`、`kb/3cloud/development-plan.md` 顶部部署闸门
