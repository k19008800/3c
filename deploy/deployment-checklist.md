# 3cloud 生产部署检查清单（P3-3）— 受部署闸门约束

> **前置闸门**：以下全部本地验收通过后，调度-agent 才可批准部署（创建 `.deploy-gate-approved` 标记）：
> - [ ] 三端 typecheck 0 错
> - [ ] 全量单测通过（808/808）
> - [ ] verify 17/17
> - [ ] E2E 10/10
> - [ ] pnpm build 三端
> - [ ] 记账一致性通过
> - [ ] 压测报告 `test-reports/stress-20260818.md` 断言全过

---

## 一、生产密钥与配置

- [ ] 运行 `node deploy/gen-prod-config.cjs` 生成生产密钥（JWT_SECRET / JWT_REFRESH_SECRET / ENCRYPTION_KEY）
- [ ] 写入生产 `.env`（`/root/3cloud/api/.env` 或 PM2 env），**禁止复用开发配置**
- [ ] 配置 SMTP（邮件验证/通知/发票必用）
- [ ] 支付配置按需（微信/支付宝商户参数）
- [ ] `system_config.api_domain` 后台设置为 `api.unmisa.com`

## 二、数据库

- [ ] 生产 PG 创建库 `threecloud_v3`（**新库，勿用旧库名**）
- [ ] 迁移执行：`node run-migrations-0017-0022.cjs`（手工 DDL 直跑）
- [ ] 分区表确认：`consumption_records` / `balance_transactions` 为分区表（relkind=p），子表按月
- [ ] 迁移前 pg_dump 备份；保留策略（每日 04:00，7 天）
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

- [ ] PM2 安装；`deploy/ecosystem.config.js` 就位（单实例，内存 1.7G 防 OOM）
- [ ] `pm2 start deploy/ecosystem.config.js`；`pm2 save` + `pm2 startup`
- [ ] 健康检查：`curl localhost:3000/health` → `{"status":"ok","db":"up","redis":"up"}`

## 六、部署后验证（上线冒烟）

- [ ] Portal 首页可访问（HTTPS）
- [ ] Console 登录 / 注册可用
- [ ] `POST https://api.unmisa.com/v1/chat/completions` 用测试 Key 调用成功（真实上游或 mock）
- [ ] `POST https://api.unmisa.com/anthropic/v1/messages` 调用成功
- [ ] 消费记账出现（consumption_records 增长）、余额扣减正确
- [ ] 日志无 ERROR（`pm2 logs 3cloud-api`）

---

> **状态**：本清单为部署准备产物（P3-3），实际部署待闸门批准后执行。
> 关联：`docs/ops-guide.md`、`deploy/deploy.sh`、`deploy/api.unmisa.com.conf`、`kb/3cloud/development-plan.md` 顶部部署闸门
