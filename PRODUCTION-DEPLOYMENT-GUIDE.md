# 3cloud 生产环境部署指南

> **版本**: v1.0
> **更新时间**: 2026-07-22
> **适用环境**: 生产服务器 (117.78.2.66 / 123.60.55.62)

---

## 📋 目录

1. [部署前检查清单](#部署前检查清单)
2. [环境准备](#环境准备)
3. [代码部署](#代码部署)
4. [数据库迁移](#数据库迁移)
5. [配置管理](#配置管理)
6. [服务启动](#服务启动)
7. [Nginx配置](#nginx配置)
8. [监控告警](#监控告警)
9. [安全加固](#安全加固)
10. [部署验证](#部署验证)
11. [回滚方案](#回滚方案)
12. [运维手册](#运维手册)

---

## 部署前检查清单

### ✅ 代码检查
- [ ] 所有测试通过（单元测试、集成测试）
- [ ] TypeScript编译无错误
- [ ] 代码已提交到Git仓库
- [ ] 版本号已更新
- [ ] CHANGELOG已更新

### ✅ 数据库检查
- [ ] 数据库备份已完成
- [ ] 迁移脚本已准备
- [ ] 迁移脚本已测试
- [ ] 回滚脚本已准备

### ✅ 配置检查
- [ ] 环境变量已配置
- [ ] API密钥已准备
- [ ] 数据库连接信息正确
- [ ] Redis连接信息正确
- [ ] 第三方服务配置正确

### ✅ 服务器检查
- [ ] 服务器资源充足（CPU、内存、磁盘）
- [ ] Node.js版本正确（v20.20.2）
- [ ] PostgreSQL版本正确（v17.10）
- [ ] Redis版本正确（v6.0.16）
- [ ] Nginx版本正确（v1.30.2）
- [ ] PM2已安装（v7.0.1）

---

## 环境准备

### 1. 服务器信息

**生产服（主）**: 117.78.2.66
- 系统: Ubuntu 22.04.2 LTS
- 配置: 2C/1.7G/40G
- 域名: unmisa.com, api.unmisa.com
- 宝塔面板: :8888

**生产服（备）**: 123.60.55.62
- 系统: Ubuntu 22.04.2 LTS
- 配置: 2C/1.7G/40G
- 宝塔面板: :9999

### 2. SSH连接

```bash
# 主服务器
ssh -i ~/.ssh/3cloud_prod root@117.78.2.66

# 备服务器
ssh -i ~/.ssh/3cloud_prod2 root@123.60.55.62
```

### 3. 目录结构

```
/3cloud/
├── api/                 # 后端代码
│   ├── src/
│   ├── dist/           # 编译输出
│   ├── migrations/     # 数据库迁移
│   ├── .env           # 环境变量
│   └── package.json
├── web/                # 前端代码
│   ├── src/
│   ├── dist/          # 构建输出
│   └── package.json
└── logs/              # 日志目录
    ├── api/
    └── web/
```

---

## 代码部署

### 方式1: Git部署（推荐）

```bash
# 1. SSH到服务器
ssh -i ~/.ssh/3cloud_prod root@117.78.2.66

# 2. 进入代码目录
cd /3cloud

# 3. 拉取最新代码
git pull origin main

# 4. 检查更新内容
git log --oneline -10
git diff HEAD~1 HEAD
```

### 方式2: 手动部署

```bash
# 1. 本地打包
cd 3cloud
tar -czf 3cloud-$(date +%Y%m%d).tar.gz api/ web/ --exclude='node_modules' --exclude='dist'

# 2. 上传到服务器
scp -i ~/.ssh/3cloud_prod 3cloud-*.tar.gz root@117.78.2.66:/tmp/

# 3. 解压部署
ssh -i ~/.ssh/3cloud_prod root@117.78.2.66 << 'EOF'
cd /3cloud
tar -xzf /tmp/3cloud-*.tar.gz
rm /tmp/3cloud-*.tar.gz
EOF
```

### 后端构建

```bash
cd /3cloud/api

# 1. 安装依赖
npm install --production

# 2. TypeScript编译
npm run build

# 3. 验证编译结果
ls -lh dist/
```

### 前端构建

```bash
cd /3cloud/web

# 1. 安装依赖
npm install

# 2. 构建生产版本
npm run build

# 3. 验证构建结果
ls -lh dist/

# 4. 部署到Nginx目录
cp -r dist/* /www/wwwroot/3c/web/dist/
```

---

## 数据库迁移

### 1. 备份数据库

```bash
# 创建备份目录
mkdir -p /backup/postgres
cd /backup/postgres

# 全库备份
pg_dump -U postgres -h localhost -d threecloud > threecloud_$(date +%Y%m%d_%H%M%S).sql

# 压缩备份
gzip threecloud_*.sql

# 验证备份
ls -lh /backup/postgres/
```

### 2. 执行迁移

```bash
cd /3cloud/api

# 查看待执行的迁移
ls -lh migrations/

# 执行迁移（按顺序）
for migration in migrations/*.sql; do
  echo "执行迁移: $migration"
  psql -U postgres -h localhost -d threecloud -f $migration
done

# 或者使用迁移工具
npm run migrate
```

### 3. 验证迁移

```bash
# 检查表结构
psql -U postgres -h localhost -d threecloud << 'EOF'
\dt
\d users
\d vendors
\d api_keys
EOF

# 检查数据完整性
psql -U postgres -h localhost -d threecloud << 'EOF'
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM vendors;
SELECT COUNT(*) FROM api_keys;
EOF
```

---

## 配置管理

### 1. 环境变量配置

创建 `/3cloud/api/.env` 文件：

```bash
# 数据库配置
DATABASE_URL=postgres://postgres:PASSWORD@localhost:5432/threecloud

# Redis配置
REDIS_URL=redis://localhost:6379

# 服务配置
PORT=3000
NODE_ENV=production

# JWT密钥
JWT_SECRET=your-jwt-secret-key

# 加密密钥
ENCRYPTION_KEY=your-encryption-key

# 邮件配置
SMTP_HOST=smtp.3cloud.ai
SMTP_PORT=587
SMTP_USER=noreply@3cloud.ai
SMTP_PASS=your-smtp-password

# 第三方服务
DEEPSEEK_API_KEY=your-deepseek-key
OPENAI_API_KEY=your-openai-key
```

### 2. 权限设置

```bash
# 设置文件权限
chown -R www-data:www-data /3cloud
chmod -R 755 /3cloud
chmod 600 /3cloud/api/.env

# 设置日志目录权限
mkdir -p /3cloud/logs/api
chmod -R 777 /3cloud/logs
```

---

## 服务启动

### 1. PM2配置

创建 `/3cloud/api/ecosystem.config.js`：

```javascript
module.exports = {
  apps: [{
    name: '3cloud-api',
    script: 'dist/index.js',
    instances: 2,  // cluster模式，2个实例
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/3cloud/logs/api/error.log',
    out_file: '/3cloud/logs/api/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};
```

### 2. 启动服务

```bash
cd /3cloud/api

# 启动API服务
pm2 start ecosystem.config.js

# 查看服务状态
pm2 status

# 查看日志
pm2 logs 3cloud-api

# 保存PM2配置
pm2 save

# 设置开机自启
pm2 startup
```

### 3. 服务管理命令

```bash
# 重启服务
pm2 restart 3cloud-api

# 停止服务
pm2 stop 3cloud-api

# 查看监控
pm2 monit

# 查看详细信息
pm2 describe 3cloud-api
```

---

## Nginx配置

### 1. API反向代理

创建 `/www/server/panel/vhost/nginx/api.unmisa.com.conf`：

```nginx
upstream api_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name api.unmisa.com;

    # 日志
    access_log /www/wwwlogs/api.unmisa.com.log;
    error_log /www/wwwlogs/api.unmisa.com.error.log;

    # API代理
    location / {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 健康检查
    location /health {
        proxy_pass http://api_backend/health;
        access_log off;
    }
}
```

### 2. 前端SPA配置

创建 `/www/server/panel/vhost/nginx/unmisa.com.conf`：

```nginx
server {
    listen 80;
    server_name unmisa.com www.unmisa.com;

    root /www/wwwroot/3c/web/dist;
    index index.html;

    # 日志
    access_log /www/wwwlogs/unmisa.com.log;
    error_log /www/wwwlogs/unmisa.com.error.log;

    # SPA路由
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 3. 重载Nginx

```bash
# 测试配置
nginx -t

# 重载配置
nginx -s reload

# 或者通过宝塔面板重载
```

---

## 监控告警

### 1. PM2监控

```bash
# 安装pm2-logrotate
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 2. 系统监控脚本

创建 `/3cloud/scripts/health-check.sh`：

```bash
#!/bin/bash

# API健康检查
API_STATUS=$(curl -s http://localhost:3000/health)
if [ "$API_STATUS" != '{"status":"ok"}' ]; then
  echo "API异常: $API_STATUS"
  # 发送告警
  curl -X POST https://your-webhook-url \
    -d '{"text":"3cloud API异常"}'
fi

# 数据库连接检查
DB_CHECK=$(psql -U postgres -h localhost -d threecloud -c "SELECT 1" 2>&1)
if [[ $DB_CHECK == *"error"* ]]; then
  echo "数据库连接异常: $DB_CHECK"
fi

# Redis连接检查
REDIS_CHECK=$(redis-cli ping)
if [ "$REDIS_CHECK" != "PONG" ]; then
  echo "Redis连接异常"
fi

# 磁盘空间检查
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
  echo "磁盘空间不足: ${DISK_USAGE}%"
fi
```

### 3. Cron定时任务

```bash
# 编辑crontab
crontab -e

# 添加监控任务
*/5 * * * * /3cloud/scripts/health-check.sh >> /3cloud/logs/health-check.log 2>&1
0 2 * * * /3cloud/scripts/backup-database.sh >> /3cloud/logs/backup.log 2>&1
```

---

## 安全加固

### 1. 防火墙配置

```bash
# 开放必要端口
ufw allow 22      # SSH
ufw allow 80      # HTTP
ufw allow 443     # HTTPS
ufw allow 8888    # 宝塔面板

# 启用防火墙
ufw enable

# 查看状态
ufw status
```

### 2. SSH安全

编辑 `/etc/ssh/sshd_config`：

```bash
# 禁用密码登录
PasswordAuthentication no

# 禁用root登录
PermitRootLogin no

# 使用密钥登录
PubkeyAuthentication yes

# 重启SSH服务
systemctl restart sshd
```

### 3. 数据库安全

```bash
# 修改PostgreSQL配置
sudo -u postgres psql << 'EOF'
ALTER USER postgres WITH PASSWORD 'new-strong-password';
EOF

# 限制远程访问
# 编辑 /etc/postgresql/17/main/pg_hba.conf
# 只允许本地连接
```

### 4. Redis安全

编辑 `/etc/redis/redis.conf`：

```bash
# 设置密码
requirepass your-redis-password

# 禁用危险命令
rename-command FLUSHALL ""
rename-command FLUSHDB ""
rename-command CONFIG ""

# 重启Redis
systemctl restart redis
```

---

## 部署验证

### 1. 功能验证

```bash
# API健康检查
curl http://localhost:3000/health
# 期望: {"status":"ok"}

# 前端访问检查
curl -I http://unmisa.com
# 期望: HTTP/1.1 200 OK

# API文档访问
curl http://api.unmisa.com/docs
# 期望: 返回API文档页面
```

### 2. 性能验证

```bash
# API响应时间
curl -w "Time: %{time_total}s\n" http://api.unmisa.com/health

# 并发测试
ab -n 100 -c 10 http://api.unmisa.com/health

# 数据库查询性能
psql -U postgres -h localhost -d threecloud << 'EOF'
EXPLAIN ANALYZE SELECT * FROM users LIMIT 10;
EOF
```

### 3. 日志检查

```bash
# API日志
tail -f /3cloud/logs/api/out.log
tail -f /3cloud/logs/api/error.log

# Nginx日志
tail -f /www/wwwlogs/unmisa.com.log
tail -f /www/wwwlogs/api.unmisa.com.log

# PM2日志
pm2 logs 3cloud-api
```

---

## 回滚方案

### 1. 代码回滚

```bash
cd /3cloud

# 回滚到上一个版本
git reset --hard HEAD~1

# 或者回滚到指定版本
git reset --hard <commit-hash>

# 重新构建
cd api && npm run build
cd ../web && npm run build

# 重启服务
pm2 restart 3cloud-api
```

### 2. 数据库回滚

```bash
# 停止API服务
pm2 stop 3cloud-api

# 恢复数据库备份
psql -U postgres -h localhost -d threecloud < /backup/postgres/threecloud_YYYYMMDD.sql

# 重启API服务
pm2 start 3cloud-api
```

### 3. 配置回滚

```bash
# 恢复环境变量
cp /backup/.env.backup /3cloud/api/.env

# 恢复Nginx配置
cp /backup/nginx/*.conf /www/server/panel/vhost/nginx/
nginx -s reload
```

---

## 运维手册

### 日常运维

#### 1. 日志查看

```bash
# 实时查看API日志
pm2 logs 3cloud-api --lines 100

# 查看错误日志
tail -f /3cloud/logs/api/error.log

# 查看访问日志
tail -f /www/wwwlogs/api.unmisa.com.log
```

#### 2. 服务管理

```bash
# 查看服务状态
pm2 status

# 重启服务
pm2 restart 3cloud-api

# 查看资源使用
pm2 monit
```

#### 3. 数据备份

```bash
# 数据库备份
pg_dump -U postgres -h localhost -d threecloud > /backup/threecloud_$(date +%Y%m%d).sql

# 代码备份
tar -czf /backup/3cloud_$(date +%Y%m%d).tar.gz /3cloud
```

### 故障处理

#### 1. API无响应

```bash
# 检查进程
pm2 status

# 查看日志
pm2 logs 3cloud-api --err

# 重启服务
pm2 restart 3cloud-api

# 如果无法启动，检查端口占用
lsof -i:3000
```

#### 2. 数据库连接失败

```bash
# 检查PostgreSQL状态
systemctl status postgresql

# 检查连接数
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# 重启PostgreSQL
systemctl restart postgresql
```

#### 3. 内存不足

```bash
# 查看内存使用
free -h

# 查看进程内存
ps aux --sort=-%mem | head -10

# 重启高内存进程
pm2 restart 3cloud-api
```

### 性能优化

#### 1. 数据库优化

```sql
-- 查看慢查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- 创建缺失索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
```

#### 2. 缓存优化

```bash
# Redis内存使用
redis-cli info memory

# 清理过期键
redis-cli --scan --pattern "*expired*" | xargs redis-cli del
```

#### 3. PM2优化

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    instances: 'max',  // 使用所有CPU核心
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

---

## 部署检查清单

### 部署前
- [ ] 代码已提交并测试
- [ ] 数据库已备份
- [ ] 配置文件已准备
- [ ] 服务器资源充足

### 部署中
- [ ] 代码已拉取/上传
- [ ] 依赖已安装
- [ ] 代码已构建
- [ ] 数据库已迁移
- [ ] 配置已更新

### 部署后
- [ ] 服务已启动
- [ ] Nginx已配置
- [ ] 健康检查通过
- [ ] 功能验证通过
- [ ] 监控已配置
- [ ] 日志正常

---

## 联系支持

- **技术支持**: tech@3cloud.ai
- **运维支持**: ops@3cloud.ai
- **紧急联系**: 13819008800

---

**文档版本**: v1.0
**最后更新**: 2026-07-22
**编写人**: 泥鳅 (dispatch-agent)
