# 服务器清单

> ⚠️ 敏感信息，请勿在公共上下文暴露
> 最后更新：2026-10-11

---

## 生产演示数据（2026-10-11 已灌入）

- **100 万条** `consumption_records`，`request_id` 前缀 `seed-`，可一键清理
- **60 个隔离演示用户** `seed-user0001~0060@demo.3cloud.local` + 专用密钥 `sk-seed0001~0060`
  （与真实账号 `demo-ent@3cloud.dev` 等完全隔离，清理时删用户即可 CASCADE 带走记录）
- 覆盖 2026-04-15~ 2026-10-11 共 7 个月，每月 8~17 万条均匀分布
- 3 家供应商全覆盖（DeepSeek/OpenAI/Anthropic），**缺归属 0 条、未归因成本 ¥0**
- 总成本 ¥11,544.47；消费表 350MB，库体积 350MB（造数前 18MB）
- 补齐 `consumption_records` 的 2026_04~2026_09 六个月度分区（原分区只到 2027_01，
  不补的话 180 天窗口内约 6/10 数据会落进 default 分区）
- 验证：对账端点 `supplier_id=1&period=2026-09` 返回 `status=matched`、`diff=0`；
  `/list` 端点 16.7 万条/月汇总 169ms 返回，接口合计与 SQL `sum(cost)` 逐位一致

**相关脚本**（本地 `scripts/`，生产 `/opt/3cloud-seed/`）：

| 脚本 | 用途 |
|------|------|
| `prepare-partitions.sql` | 补齐月度分区（造数前置，必须先跑） |
| `seed-demo-users.sql` | 建 60 演示用户 + 密钥 + 余额（幂等） |
| `seed-demo-data.sql` | 生成消费记录，参数化分批 `-v total= -v batch= -v offset=` |
| `cleanup-seed.sql` | 配对清理，只删 `request_id LIKE 'seed-%'` |

**踩坑记录（3 个，都不报错但结果不对）**：
1. **分批 offset 切分**必须无重叠覆盖 `[0,total)`。若写 `0/10000/260000/510000/760000`，
   最后溢出成 101 万条——不报错，只是数字不对。
2. **幂等保护不能查全表**，只查本批区间。否则第 2 批会被上一批存量误拦，
   分批流程根本跑不下去。
3. **时间轴必须夹逼到当下**。`(random() * interval '1 day')` 的抖动会让末尾约
   1% 的记录溢出到未来（实测 10,608 条），导致"本月至今"趋势图失真。

---

## 生产服务器 1 (3cloud 生产服)

**最新部署状态 (2026-10-11，覆盖式部署)**: 代码 `8b4f485`（对外品牌 3Cloud），PM2 `3cloud-api`(:3000) + `3cloud-portal`(:3100) 双进程 online；PostgreSQL `threecloud_v3` 已重建并迁移至 0049 + seed（admin@3cloud.dev / Admin@2024!）；对外域名 unmisa.com / api.unmisa.com，HTTPS 证书有效，nginx 代理缓存已清理；健康检查 `{"status":"ok","db":"up","redis":"up"}`；站点配置 `site_name=3Cloud`。⚠️ 待办：SMTP 未配置（注册邮件验证不可用）。

**基础数据（2026-10-11 已补齐，脚本 /root/seed-base-data/init-base-data.cjs，幂等可重跑）**:
- 管理员：`admin@3cloud.dev` / `Admin@2024!`
- 测试用户（密码 `Demo@1234`）：`demo-ent@3cloud.dev`（企业/合同/已实名，¥10000，2 个 Key，3 条消费流水）、`demo-dev@3cloud.dev`（个人/已实名，¥200，1 个 Key，1 条消费流水）
- 代理商：`agent@3cloud.dev` / `Demo@1234`（partner、佣金 12%、邀请码 `3C-AGENT001`、关联客户 2、佣金记录 2）
- 供应商 3 家（DeepSeek/OpenAI/Anthropic）+ 6 模型（deepseek-chat/reasoner、gpt-4o/mini、claude-sonnet/opus-4.5）+ 模拟密钥（sk-mock-*）+ 6 条对外定价（¥/1K）+ 门户账号 `vendor-deepseek@3cloud.dev` 等（密码 `Vendor@2024!`）
- 说明：供应商密钥为模拟值（`sk-mock-*`），真实调用需在后台替换为真实上游 Key；定价为参考市场价演示值，可后台调整。

| 项目 | 值 |
|------|-----|
| **IP** | 117.78.2.66 |
| **SSH 用户** | root |
| **SSH 端口** | 22 |
| **SSH 密钥** | `~/.ssh/3cloud_prod` |
| **SSH 别名** | `ssh -i ~/.ssh/3cloud_prod root@117.78.2.66` |
| **内网 IP** | 172.31.12.64 |
| **提供商** | 华为云 |
| **主机名** | hcss-ecs-38a9 |
| **OS** | Ubuntu 22.04.2 LTS (5.15.0-76-generic x86_64) |
| **CPU/内存** | 2 核 / 1.7GiB (680Mi 使用, 863Mi avail) |
| **磁盘** | 40G (13G 使用, 25G 可用) |
| **Uptime** | 25 天 |
| **UFW** | 22/80/443/8888/465/993/995 已放行，密钥认证 |

**当前运行状态 (2026-10-11 更新)**:
- 代码目录：`/root/3cloud`（git 仓库，pnpm monorepo，与本地同源 `git@github.com-3cloud:k19008800/3c.git`）
- 部署方式：`bash deploy/deploy.sh main`（受 `.deploy-gate-approved` 闸门约束；自动备份 → 拉代码 → 构建 → 跑迁移 → PM2 reload → 健康检查）
- 数据库备份：`/var/backups/3cloud/pre-<commit>-<timestamp>.dump`（pg_dump -Fc）
- PM2: `3cloud-api` (id 0, fork, 端口 3000) + `3cloud-portal` (id 1, fork, 端口 3100)，均 online
- Nginx: 代理 unmisa.com (前端 SPA) + api.unmisa.com (API/Token)
- PostgreSQL: `threecloud_v3`（owner postgres）、Redis: 有密码保护
- 健康检查：`curl localhost:3000/health` → `{"status":"ok","db":"up","redis":"up"}`
- 错误日志：`/var/log/3cloud/api-error.log`

> ⚠️ **生产环境仍在使用开发默认凭据** `admin@3cloud.dev` / `Admin@2024!`（2026-10-11 部署时核实）。
> 该账号为 `super_admin`，等于生产后台对任何人开放——**待处理，优先级高**。
> 代理商 `agent@3cloud.dev` / `Demo@1234`、供应商门户 `Vendor@2024!` 等演示凭据同属此类。

**历史状态记录 (2026-07-09，已过时)**:
- PM2: `3cloud-api` (id 0, cluster 模式, 端口 3030, 已运行 9 天, 60MB)
- PostgreSQL: `cloud3` (owner: cloud3)、`zh` 库
- 代码: `/3cloud/api/` (API 后端) + `/3cloud/web/` (前端 4 子项目: admin/landing/user/shared)
- 前端构建: `/www/wwwroot/3c/web/dist/` **尚未构建**
- SSL: ❌ 无 HTTPS 证书 (无 certbot)

## 生产服务器 2 (备用 — 已部署 3cloud)

| 项目 | 值 |
|------|-----|
| **IP** | 123.60.55.62 |
| **SSH 用户** | root |
| **SSH 端口** | 22 |
| **SSH 密钥** | `~/.ssh/3cloud_prod2` |
| **SSH 别名** | `ssh 3cloud-prod2` |
| **内网 IP** | 172.31.8.165/20 |
| **提供商** | 华为云 |
| **主机名** | hcss-ecs-7cd3 |
| **OS** | Ubuntu 22.04.2 LTS (5.15.0-76-generic x86_64) |
| **CPU/内存** | 2 核 / 1.7GiB (557Mi 使用, 937Mi 可用) |
| **磁盘** | 40G (7.9G 使用, 30G 可用, 22%) |
| **Node.js** | v22.23.1 |
| **UFW** | 22/80/443/5432/8888/9999 等已放行 |
| **已装** | Nginx, PostgreSQL, 宝塔面板, PM2, Node.js 应用 |

## 生产服务器 3 (阿里云 – TeslaMate + Baota)

| 项目 | 值 |
|------|-----|
| **IP** | 8.149.140.186 |
| **SSH 用户** | root |
| **SSH 端口** | 22 |
| **SSH 密钥** | `~/.ssh/3cloud-ali` |
| **SSH 别名** | `ssh 3cloud-ali` 或 `ssh 8.149.140.186` |
| **内网 IP** | 172.21.21.32 |
| **提供商** | 阿里云 |
| **关联手机** | 13819008800 |
| **主机名** | mail.zheng1997.online |
| **OS** | Alibaba Cloud Linux 3 (OpenAnolis Edition) 5.10.134-19.2.al8.x86_64 |
| **CPU/内存** | 2 核 / 1.8Gi (315Mi avail, 紧张) |
| **磁盘** | 40G (29G 使用, 9.1G 可用, 76%) |
| **Swap** | 2Gi (1Gi 使用) |
| **Uptime** | 186 天 |
| **防火墙** | firewalld 未启用（依赖阿里云安全组） |
| **SSH 密钥** | 已安装（3cloud-ali.pub） |

**已安装服务**：
- Docker: TeslaMate (Tesla 监控) – Grafana:3000, HTTP:4000, Mosquitto:1883
- 宝塔面板 (port 8888)
- Nginx 1.24.0 (端口 80/443/888/8080/8088)
- MySQL/MariaDB 10.5 (port 3306) ← Baota 依赖
- PHP-FPM (9999 localhost) ← Baota 依赖
- Redis (localhost:6379) ← Baota 依赖
- 阿里云原生: aliyun、cloudmonitor、hbrclient

**已清理（2026-07-06）**：
- ❌ 3cloud (PM2 + API + Web, ~1G) — 已删除
- ❌ PostgreSQL 17 独立实例 (1.7G) — 已删除
- ❌ iRedMail 邮件系统 (Postfix/Dovecot/OpenLDAP/iRedAdmin/uWSGI) — 已停用删除
- ❌ ClamAV / SpamAssassin — 已删除
- ❌ Netdata (监控) — 已停用
- ❌ Fail2ban — 已停用
- ✅ journald 日志 3.8G → 500M（回收 3.2G）

**磁盘**: 29G → 21G 使用 (76% → 56%, 可用 17G)

## DNS

| 域名 | 指向 |
|------|------|
| unmisa.com | 117.78.2.66 |
| api.unmisa.com | 117.78.2.66 |
| tokens.unmisa.com | 117.78.2.66 |
| www.unmisa.com | 117.78.2.66 |
| mail.zheng1997.online | 8.149.140.186 |

## 服务端口

### 生产服务器 1 (117.78.2.66)

| 服务 | 端口 | 说明 |
|------|------|------|
| SSH | 22 | 密钥认证 |
| HTTP | 80 | Nginx 1.30.2 |
| HTTPS | 443 | Nginx |
| 3cloud API | 3030 | PM2 管理 (名称: 3cloud-api) |
| PostgreSQL | 5432 | 17.10, 仅 localhost (用户 cloud3, 库 cloud3) |
| Redis | 6379 | 6.0.16, 仅 localhost, 有密码 |
| 宝塔面板 | 8888 | Web 管理 |
| SMTP | 25/465 | Postfix (邮件服务) |
| IMAP | 993/995 | Dovecot (邮件服务) |

### 生产服务器 2 (123.60.55.62)

| 服务 | 端口 | 说明 |
|------|------|------|
| SSH | 22 | 密钥认证 |
| HTTP | 80 | Nginx |
| 宝塔面板 | 9999 | Web 管理 (端口不同) |
| PostgreSQL | 5432 | 仅 localhost |
| UFW | 21,888,14024,39000-40000 | 额外已放行 |

---

## 注意事项

1. 生产服上 `3cloud/api/` 的 PM2 条目名称为 `3cloud-api`
2. 代码实际路径为 `/3cloud/api/`（非 `/www/wwwroot/`）
3. Nginx 配置的 proxy_pass 应指向 `localhost:3030`
4. 生产服前端需 `npm run build` 生成 `dist/` 目录
5. Redis 有密码（.env.production 可用）
6. 无 HTTPS 证书 — 部署时需确认是否配 SSL
7. DNS: unmisa.com / api.unmisa.com 均指向此服务器 117.78.2.66
