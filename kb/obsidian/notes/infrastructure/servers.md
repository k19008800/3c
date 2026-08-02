---
title: "Servers"
date: 2026-07-25
tags: [infrastructure]
---
# 服务器清单

> ⚠️ 敏感信息，请勿在公共上下文暴露
> 最后更新：2026-07-06

---

## 生产服务器 1 (3cloud 生产服)

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

**当前运行状态 (2026-07-09)**:
- PM2: `3cloud-api` (id 0, cluster 模式, 端口 3030, 已运行 9 天, 60MB)
- Nginx: 代理 unmisa.com (前端 SPA) + api.unmisa.com (API/Token)
- PostgreSQL: `cloud3` (owner: cloud3)、`zh` 库
- Redis: 6.0.16, 有密码保护
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
