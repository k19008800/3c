# 3cloud 部署运维手册

> **最后更新**：2026-08-16
> **版本**：v1.0
> **定位**：面向运维工程师的部署、配置、监控、备份、故障排查完整指南

> ⚠️ **部署闸门（2026-08-16 生效）**：生产服 3cloud 已全部清除（主 117.78.2.66 / 备 123.60.55.62 的代码、数据库、Redis、nginx 配置与证书均删除）。**本地 3cloud 未成熟前，禁止按本手册向生产服务器部署任何版本。** 本文档作为部署 SOP 参考保留；实际部署需先通过 `kb/3cloud/development-plan.md` 顶部的部署闸门评审。

---

## 一、环境概览

### 1.1 服务器清单

| 服务器 | IP | 用途 | 配置 | 系统 |
|--------|-----|------|------|------|
| 生产服1（主） | 117.78.2.66 | API 后端 + Web 前端 + 数据库 | 2C/1.7G/40G | Ubuntu 22.04 |
| 生产服2（备） | 123.60.55.62 | 备用节点 | 待确认 | 待确认 |
| 阿里云 | 8.149.140.186 | 3cloud 实例 | 待确认 | 待确认 |
| 本地开发 | DESKTOP-LC0FIIC | 开发环境 | Windows 10 | Windows 10 |

### 1.2 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| API 后端 | 3000 | PM2 cluster 模式 |
| Web 前端 | 443 | Nginx 反向代理（HTTPS） |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存 |
| Nginx | 80/443 | 反向代理 |
| 宝塔面板 | 8888 | 服务器管理面板 |

### 1.3 域名

| 域名 | 指向 | 说明 |
|------|------|------|
| `unmisa.com` | 生产服1 | Portal 首页 / 控制台 |
| `api.unmisa.com` | 生产服1 | **独立 API 网关域名**（vhost：`deploy/api.unmisa.com.conf`），OpenAI base_url=`https://api.unmisa.com/v1`，Anthropic base_url=`https://api.unmisa.com/anthropic` |
| `tokens.unmisa.com` | 生产服1 | 预留 |

> **API 域名后台配置（2026-08-17）**：API 网关域名存 `system_config.api_domain`，可在管理后台
> 「系统设置 → API 服务」修改（PUT `/api/v1/admin/settings/api`）。门户首页、API Key 页接入引导
> 经 `GET /api/v1/public/api-config` 实时读取派生地址（OpenAI base_url / Anthropic base_url）。
> 改域名后需同步：① DNS（api.&lt;host&gt; → 服务器）② nginx vhost（`deploy/api.unmisa.com.conf` 的 server_name）
> ③ SSL 证书（对应域名）。

---

## 二、部署指南

### 2.1 部署流程

```mermaid
flowchart TD
    A[代码提交到 main 分支] --> B[本地执行 deploy.sh]
    B --> C{SSH 连接生产服}
    C -->|成功| D[拉取最新代码]
    C -->|失败| E[检查 SSH 密钥和网络]
    D --> F[前端构建]
    F --> G[后端依赖安装]
    G --> H[数据库迁移]
    H --> I{迁移成功?}
    I -->|是| J[PM2 重启后端]
    I -->|否| K[回滚迁移 + 告警]
    J --> L[Nginx 更新前端静态文件]
    L --> M[验证健康检查]
    M --> N{健康检查通过?}
    N -->|是| O[部署成功]
    N -->|否| P[回滚 + 排查]
```

### 2.2 部署脚本（deploy.sh）

```bash
#!/bin/bash
# 3cloud 自动化部署脚本
# 使用方法: ./deploy.sh [branch=main]

set -e

BRANCH=${1:-main}
PROJECT_DIR="/root/3cloud"
API_DIR="$PROJECT_DIR/api"
WEB_DIR="$PROJECT_DIR/web"

echo "=== 3cloud 部署开始 ==="
echo "分支: $BRANCH"
echo "时间: $(date)"

# 1. 拉取最新代码
cd $PROJECT_DIR
git fetch origin
git checkout $BRANCH
git pull origin $BRANCH

# 2. 前端构建
echo "--- 构建前端 ---"
cd $WEB_DIR
npm ci
npm run build

# 3. 后端依赖安装
echo "--- 安装后端依赖 ---"
cd $API_DIR
npm ci --production

# 4. 数据库迁移
echo "--- 执行数据库迁移 ---"
npx drizzle-kit push

# 5. 重启后端
echo "--- 重启 API 服务 ---"
pm2 reload ecosystem.config.js --update-env

# 6. 更新前端静态文件
echo "--- 更新前端静态文件 ---"
cp -r $WEB_DIR/dist/* /var/www/3cloud/

# 7. 验证
echo "--- 验证部署 ---"
sleep 3
curl -s http://localhost:3000/health | grep -q "ok" && echo "✅ 健康检查通过" || echo "❌ 健康检查失败"

echo "=== 部署完成 ==="
```

### 2.3 PM2 配置（ecosystem.config.js）

```javascript
module.exports = {
  apps: [{
    name: '3cloud-api',
    script: 'dist/index.js',
    instances: 2,  // cluster mode
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/var/log/3cloud/api-error.log',
    out_file: '/var/log/3cloud/api-out.log',
    merge_logs: true,
  }]
};
```

### 2.4 Nginx 配置

```nginx
# API 反向代理
server {
    listen 443 ssl;
    server_name api.unmisa.com;

    ssl_certificate /etc/nginx/ssl/unmisa.com.pem;
    ssl_certificate_key /etc/nginx/ssl/unmisa.com.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时配置
        proxy_connect_timeout 60s;
        proxy_read_timeout 120s;
        proxy_send_timeout 60s;
    }
}

# 前端静态文件
server {
    listen 443 ssl;
    server_name unmisa.com;

    ssl_certificate /etc/nginx/ssl/unmisa.com.pem;
    ssl_certificate_key /etc/nginx/ssl/unmisa.com.key;

    root /var/www/3cloud;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 三、环境配置

### 3.1 环境变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `DATABASE_URL` | 数据库连接串 | `postgres://user:pass@localhost:5432/threecloud` |
| `REDIS_URL` | Redis 连接串 | `redis://localhost:6379` |
| `JWT_SECRET` | JWT 签名密钥 | 随机 64 位字符串 |
| `JWT_REFRESH_SECRET` | Refresh Token 密钥 | 随机 64 位字符串 |
| `SMTP_HOST` | 邮件服务器 | `smtp.example.com` |
| `SMTP_PORT` | 邮件端口 | 465 |
| `SMTP_USER` | 邮件用户名 | `noreply@unmisa.com` |
| `SMTP_PASS` | 邮件密码 | 加密存储 |
| `PAY_WECHAT_*` | 微信支付配置 | 微信商户平台参数 |
| `PAY_ALIPAY_*` | 支付宝配置 | 支付宝商户参数 |
| `CORS_ORIGIN` | 跨域允许地址 | `https://unmisa.com` |
| `LOG_LEVEL` | 日志级别 | `info` |
| `NODE_ENV` | 运行环境 | `production` |

### 3.2 数据库配置

```sql
-- PostgreSQL 优化参数
-- 文件位置: /etc/postgresql/17/main/postgresql.conf

shared_buffers = '512MB'           # 总内存的 25%
effective_cache_size = '1GB'       # 总内存的 50%
work_mem = '16MB'                  # 排序操作内存
maintenance_work_mem = '128MB'     # 维护操作内存
random_page_cost = 1.1             # SSD 优化
effective_io_concurrency = 200     # SSD 优化
wal_level = 'replica'              # WAL 归档级别
max_wal_size = '2GB'
min_wal_size = '512MB'
archive_mode = 'on'                # 开启归档
archive_command = 'cp %p /var/lib/postgresql/17/archive/%f'
```

---

## 四、日常运维

### 4.1 服务管理

| 操作 | 命令 |
|------|------|
| 启动服务 | `pm2 start ecosystem.config.js` |
| 停止服务 | `pm2 stop 3cloud-api` |
| 重启服务 | `pm2 reload 3cloud-api` |
| 查看状态 | `pm2 status` |
| 查看日志 | `pm2 logs 3cloud-api` |
| 查看实时日志 | `pm2 logs 3cloud-api --lines 100` |
| 监控面板 | `pm2 monit` |

### 4.2 数据库操作

| 操作 | 命令 |
|------|------|
| 连接数据库 | `psql -U postgres -d threecloud` |
| 查看表大小 | `SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;` |
| 查看慢查询 | `SELECT * FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start DESC;` |
| 终止查询 | `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid = <pid>;` |
| 查看分区 | `SELECT relname, relkind FROM pg_class WHERE relkind='p' AND relname LIKE '%logs%';` |
| 手动 VACUUM | `VACUUM ANALYZE call_logs;` |

### 4.3 日志查看

| 日志文件 | 路径 | 说明 |
|---------|------|------|
| API 输出日志 | `/var/log/3cloud/api-out.log` | 正常请求日志 |
| API 错误日志 | `/var/log/3cloud/api-error.log` | 错误/异常日志 |
| PM2 日志 | `~/.pm2/logs/` | PM2 进程日志 |
| Nginx 访问日志 | `/var/log/nginx/access.log` | HTTP 请求日志 |
| Nginx 错误日志 | `/var/log/nginx/error.log` | HTTP 错误日志 |
| 数据库日志 | `/var/log/postgresql/postgresql-17-main.log` | PG 日志 |

---

## 五、备份策略

### 5.1 数据库备份

```bash
#!/bin/bash
# 每日数据库备份脚本
# 定时任务: 0 4 * * * /root/scripts/backup-db.sh

BACKUP_DIR="/backup/postgresql"
DB_NAME="threecloud"
DATE=$(date +%Y%m%d)
RETENTION_DAYS=7

# 创建备份目录
mkdir -p "$BACKUP_DIR/$DATE"

# 全量备份
pg_dump -U postgres -d "$DB_NAME" -Fc -f "$BACKUP_DIR/$DATE/$DB_NAME.dump"

# 压缩
gzip "$BACKUP_DIR/$DATE/$DB_NAME.dump"

# 清理过期备份
find "$BACKUP_DIR" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;

echo "备份完成: $BACKUP_DIR/$DATE/$DB_NAME.dump.gz"
```

### 5.2 配置备份

```bash
#!/bin/bash
# 配置备份
# 定时任务: 0 5 * * 0 /root/scripts/backup-config.sh

BACKUP_DIR="/backup/config"
DATE=$(date +%Y%m%d)

mkdir -p "$BACKUP_DIR"

# 备份 Nginx 配置
tar -czf "$BACKUP_DIR/nginx-$DATE.tar.gz" /etc/nginx/

# 备份环境变量
cp /root/3cloud/api/.env "$BACKUP_DIR/env-$DATE"

# 备份 PM2 配置
cp /root/3cloud/ecosystem.config.js "$BACKUP_DIR/ecosystem-$DATE.js"

# 保留最近 30 天
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.env-*" -mtime +30 -delete
```

### 5.3 恢复流程

```
数据库恢复：
  1. 停止 API 服务: pm2 stop 3cloud-api
  2. 重建数据库: dropdb threecloud && createdb threecloud
  3. 恢复数据: pg_restore -U postgres -d threecloud /backup/20260728/threecloud.dump
  4. 重启服务: pm2 start 3cloud-api
  5. 验证: curl http://localhost:3000/health

文件恢复：
  1. 解压配置: tar -xzf nginx-20260728.tar.gz -C /
  2. 重载 Nginx: nginx -s reload
```

---

## 六、监控告警

### 6.1 健康检查端点

```
GET /health

响应:
{
  "status": "ok",
  "timestamp": "2026-07-28T10:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "disk": "ok (45% used)"
  }
}
```

### 6.2 系统监控命令

| 监控项 | 命令 |
|-------|------|
| CPU 使用率 | `top -bn1 | grep "Cpu(s)"` |
| 内存使用 | `free -h` |
| 磁盘使用 | `df -h` |
| 网络连接 | `ss -tlnp` |
| 进程状态 | `ps aux --sort=-%mem | head -10` |
| I/O 状态 | `iostat -x 1 3` |
| 实时带宽 | `nload` 或 `iftop` |

### 6.3 告警阈值

| 指标 | 告警阈值 | 告警级别 | 通知对象 |
|------|---------|---------|---------|
| CPU 使用率 | > 80% 持续 5 分钟 | 🟡 告警 | 运维 |
| 内存使用率 | > 85% | 🟡 告警 | 运维 |
| 磁盘使用率 | > 85% | 🟡 告警 | 运维 |
| 磁盘使用率 | > 95% | 🔴 紧急 | 全部管理员 |
| API 响应时间 P95 | > 2s | 🟡 告警 | 运维 |
| API 错误率 | > 5% | 🔴 紧急 | 全部管理员 |
| 供应商可用率 | < 95% | 🔴 紧急 | 运维 |
| 平台余额 | < ¥100 | 🟡 告警 | super_admin |

---

## 七、故障排查

### 7.1 常见故障

| 故障 | 可能原因 | 排查步骤 | 解决方案 |
|------|---------|---------|---------|
| API 返回 502 | 后端进程崩溃 | `pm2 status` 查看进程状态 | `pm2 restart 3cloud-api` |
| API 返回 503 | 数据库连接失败 | `psql` 能否连接 | 检查 PG 服务 + 连接池 |
| API 响应慢 | 慢查询/高负载 | `pg_stat_activity` 查看慢查询 | 优化查询/加索引/重启 |
| 前端白屏 | 构建文件未更新 | `curl` 检查静态文件 | 重新部署前端 |
| 证书即将过期 | Let's Encrypt 90 天 | 检查证书到期日 | 宝塔自动续签 |
| Redis 连不上 | Redis 进程崩溃 | `redis-cli ping` | `systemctl restart redis` |
| 磁盘空间不足 | 日志文件过大 | `du -sh /var/log/*` | 清理日志/增加磁盘 |

### 7.2 快速恢复流程

```
API 服务不可用：
  1. pm2 status  → 查看进程状态
  2. pm2 logs 3cloud-api --lines 50  → 查看最后 50 行日志
  3. pm2 restart 3cloud-api  → 重启服务
  4. curl http://localhost:3000/health  → 验证恢复
  5. 如果仍不可用 → 检查数据库和 Redis

数据库连接失败：
  1. systemctl status postgresql  → 检查 PG 服务
  2. tail -100 /var/log/postgresql/postgresql-17-main.log  → 查看错误
  3. systemctl restart postgresql  → 重启 PG
  4. psql -U postgres -d threecloud -c "SELECT 1"  → 验证连接

服务器宕机：
  1. 使用备用服务器 (123.60.55.62)
  2. 从备份恢复数据库
  3. 修改 DNS 记录指向备用 IP
  4. 在备用服务器执行部署
```

### 7.3 回滚流程

```bash
# 代码回滚
cd /root/3cloud
git log --oneline -5                 # 查看最近 5 次提交
git revert <commit_hash>             # revert 到指定版本
./deploy.sh                          # 重新部署

# 数据库回滚
cd /root/3cloud/api
npx drizzle-kit push --force         # 回滚到上一版本
# 或从备份恢复
pg_restore -U postgres -d threecloud /backup/20260727/threecloud.dump
```

---

## 八、安全配置

### 8.1 SSH 安全

```bash
# SSH 配置 /etc/ssh/sshd_config
Port 22                              # 建议改为非标准端口
PermitRootLogin without-password     # 仅密钥登录
PasswordAuthentication no            # 禁用密码登录
PubkeyAuthentication yes
MaxAuthTries 3                       # 最大认证尝试次数
ClientAliveInterval 300              # 5 分钟无操作断开
ClientAliveCountMax 2
```

### 8.2 防火墙配置

```bash
# 使用 iptables 或 ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP
ufw allow 443/tcp    # HTTPS
ufw allow 8888/tcp   # 宝塔面板（限制来源 IP）
ufw enable
```

---

## 九、交叉引用

| 其他文档 | 关联内容 |
|---------|---------|
| TOOLS.md | 本地开发环境配置 |
| kb/infrastructure/servers.md | 服务器详细信息 |
| kb/infrastructure/baota.md | 宝塔面板配置 |
| deploy.sh | 自动化部署脚本 |
| ref-7-nfr.md | 可用性 SLA、备份策略、灾备方案 |
| test-cases.md §11 | 部署与运维测试用例 |