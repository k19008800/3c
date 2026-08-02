# 🔐 密钥/凭据总表（Credentials）

> ⚠️ 高敏感信息，仅在需要时读取，禁止在公共/群聊上下文暴露
> 最后更新：2026-07-23
> **用途**：所有密钥、密码、Token、密钥路径的单一速查入口。以后直接读这一个文件。

---

## 1. SSH 密钥

| 用途 | 密钥文件 | SSH 简写 | 说明 |
|------|----------|----------|------|
| 生产服 1 (3cloud) | `~/.ssh/3cloud_prod` | `ssh 3cloud-prod` 或 `ssh 117.78.2.66` | 华为云生产服 root |
| 生产服 2 (备用) | `~/.ssh/3cloud_prod2` | `ssh 3cloud-prod2` 或 `ssh 123.60.55.62` | 华为云备用生产服 root |
| GitHub deploy | `~/.ssh/3cloud_deploy` | `github.com-3cloud` | 3c 仓库 deploy key |

SSH config 位置：`C:\Users\ZH\.ssh\config`

```
Host github.com-3cloud
    HostName ssh.github.com
    Port 443
    User git
    IdentityFile ~/.ssh/3cloud_deploy

Host 117.78.2.66
    HostName 117.78.2.66
    User root
    IdentityFile ~/.ssh/3cloud_prod
    IdentitiesOnly yes

Host 123.60.55.62 3cloud-prod2
    HostName 123.60.55.62
    User root
    IdentityFile ~/.ssh/3cloud_prod2
    IdentitiesOnly yes

Host 8.149.140.186 3cloud-ali
    HostName 8.149.140.186
    User root
    IdentityFile ~/.ssh/3cloud-ali
    IdentitiesOnly yes
```

---

## 2. 生产服务器

| 项目 | 值 |
|------|-----|
| IP | 117.78.2.66（主） / 123.60.55.62（备） / 8.149.140.186（阿里云） |
| 内网 IP | 172.31.12.64（主） / 172.31.8.165（备） / 172.21.21.32（阿里云） |
| SSH 用户 / 端口 | root / 22（密钥认证） |
| 提供商 | 华为云（主/备）+ 阿里云 |
| SSH 别名 | `ssh 3cloud-prod` / `ssh 3cloud-prod2` / `ssh 3cloud-ali` |
| 阿里云关联手机 | 13819008800 |

---

## 3. 宝塔面板

| 项目 | 值 |
|------|-----|
| **地址（主）** | https://117.78.2.66:8888/login |
| **账号（主）** | unmisa |
| **密码（主）** | AsdX23456 |
| **地址（备）** | https://123.60.55.62:9999/login |
| **账号（备）** | unmias |
| **密码（备）** | Abc123456 |
| **地址（阿里云）** | https://8.149.140.186:8888/a7effe79 |
| **账号（阿里云）** | user |
| **密码（阿里云）** | Abc123456 |

---

## 4. GitHub 仓库

| 项目 | 值 |
|------|-----|
| 仓库 | `git@github.com-3cloud:k19008800/3c.git` |
| 认证 | deploy key `~/.ssh/3cloud_deploy` |

---

## 5. 3cloud 应用账号

| 用途 | 账号 | 密码 |
|------|------|------|
| 超级管理员 | admin@3cloud.dev | admin123 |
| 超级管理员(备) | admin@3cloud.ai | （seed 脚本，角色 super_admin） |

---

## 6. 数据库 / 缓存（本地开发）

| 服务 | 连接串 |
|------|--------|
| PostgreSQL | `postgres://postgres:postgres@localhost:5432/threecloud` |
| Redis (Memurai) | `redis://localhost:6379` |

---

## 7. 3cloud API 密钥（`3cloud/api/.env`）

| 变量 | 值 / 说明 |
|------|-----------|
| JWT_ACCESS_SECRET | `dev-access-secret-change-in-production`（开发；生产需改） |
| JWT_REFRESH_SECRET | `dev-refresh-secret-change-in-production`（开发；生产需改） |
| VENDOR_KEY_ENCRYPTION_KEY | `c63e7e6df5f0e162205ae06458d6f715f41ba6081b20d4052089a8f7cbd2afeb`（厂商 API Key 加密主密钥，⚠️ 丢失则无法解密已存供应商 Key） |
| DATABASE_URL | `postgres://postgres:postgres@localhost:5432/threecloud` |
| REDIS_URL | `redis://localhost:6379` |
| MAIL_FROM | noreply@unmisa.com |

> 完整 .env 见 `3cloud/api/.env`。生产环境的 JWT secret 与加密密钥应与本地不同，部署时单独维护。

---

## 8. 供应商 API Key（OpenClaw 配置）

| 供应商 | API Key | 端点 | 说明 |
|--------|---------|------|------|
| **DeepSeek** | `sk-e1288fb4c4874d2bb07149817f6fa1cd` | `https://api.deepseek.com` | 官方直连，2026-07-13 更新 |
| **LLMRouter** | `sk-JWcdfHnWE0ERENsHd76hZDyB6aJHIY5pbIprkvRdn3bk3Ojq` | `https://llmrouter.top` | 聚合路由，Claude 系列需走 Clash 代理 127.0.0.1:7897 |
| **OspreyAI** | `sk-qBKHkPzWfaSVEEOIPQ5SqYT4KWyp911ClFJ9lqtLA59eZKS1` | `https://open.ospreyai.cn` | 枭毅平台，直连 |
| **天翼云** | `cp_f94068e1981441c2937ccd80aa09870d` | `https://wishub-x6.ctyun.cn/coding/v1` | 天翼云 AI，GLM-5-Pro / DeepSeek-V3.2-Pro |

> 配置位置：`~/.openclaw/openclaw.json` → `models.providers.<name>.apiKey`

---

## 维护约定

- 新增任何密钥/密码/Token → **同步更新本文件**，不要散落在各处。
- 本文件是敏感度 🔴 **高**，`memory_search` 可命中，但绝不在群聊/公共上下文输出具体值。
- 相关文件：`servers.md`（服务器细节）、`baota.md`（宝塔）、`3cloud/api/.env`（应用密钥源）。
