# 自动化运维体系 — 设计文档

> **对应章节**：PRD-README.md §5.6 长期能力 — 自动化运维
> **状态**：完整设计 ✅ | **版本**：v1.0 | **最后更新**：2026-07-28
> **定位**：建立自动化运维能力，覆盖备份策略、日志轮转、自动扩缩容、告警关联、部署流水线、自愈机制。
> **设计原则**：先自动化日常运维动作，再逐步引入自愈能力。运维操作可追溯、可回滚。
> **粒度**：备份策略 → 日志轮转 → 自动扩缩容 → 告警关联 → 部署流水线 → 自愈 → API → 配置 → 边界 → 验收

---

## 目录

1. [备份策略](#1-备份策略)
2. [日志轮转与清理](#2-日志轮转与清理)
3. [自动扩容策略](#3-自动扩容策略)
4. [告警关联与收敛](#4-告警关联与收敛)
5. [部署流水线](#5-部署流水线)
6. [自愈机制](#6-自愈机制)
7. [运维大盘](#7-运维大盘)
8. [API 接口规格](#8-api-接口规格)
9. [前端组件 Props](#9-前端组件-props)
10. [运营配置项](#10-运营配置项)
11. [边界条件](#11-边界条件)
12. [验收标准](#12-验收标准)
13. [交叉引用](#13-交叉引用)

---

## 1. 备份策略

### 1.1 备份范围

| 数据 | 备份方式 | 频率 | 保留策略 | 存储位置 |
|------|---------|------|---------|---------|
| PostgreSQL 全库 | pg_dump | 每日 03:00 | 近 7 天本地 + 30 天远程 | 本地磁盘 → OSS/S3 |
| PostgreSQL WAL | 连续归档 | 实时 | 7 天 | 本地磁盘 |
| 配置文件 | 版本控制 | 每次变更 | 永久 | GitHub |
| 上传文件 | rsync | 每日 04:00 | 30 天 | 远程服务器 |
| Redis 数据 | RDB 快照 | 每 6 小时 | 3 天 | 本地磁盘 |

### 1.2 备份脚本

```bash
#!/bin/bash
# backup.sh — 3cloud 数据库备份脚本
# 每日 03:00 由 cron 执行

BACKUP_DIR="/data/backups/db"
DATE=$(date +%Y%m%d)
DB_NAME="threecloud"
RETENTION_LOCAL=7     # 本地保留天数
RETENTION_REMOTE=30    # 远程保留天数

# 创建备份目录
mkdir -p "$BACKUP_DIR/$DATE"

# 1. 全库备份 (压缩)
pg_dump -h localhost -U postgres -Fc "$DB_NAME" -f "$BACKUP_DIR/$DATE/$DB_NAME.dump"
gzip "$BACKUP_DIR/$DATE/$DB_NAME.dump"

# 2. 备份校验
pg_restore -l "$BACKUP_DIR/$DATE/$DB_NAME.dump.gz" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "[OK] 备份校验通过: $DATE" >> "$BACKUP_DIR/backup.log"
else
  echo "[FAIL] 备份校验失败: $DATE" | mail -s "备份失败告警" ops@3cloud.ai
  exit 1
fi

# 3. 清理本地过期备份
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +$RETENTION_LOCAL -exec rm -rf {} \;

# 4. 同步到远程 (OSS/S3)
# aws s3 sync "$BACKUP_DIR" "s3://3cloud-backups/db/" --delete --exclude "*.log"
# 远程清理由 OSS 生命周期策略处理

echo "[DONE] 备份完成: $DATE" >> "$BACKUP_DIR/backup.log"
```

### 1.3 备份验证

| 验证项 | 频率 | 方法 |
|-------|------|------|
| 备份文件完整性 | 每次备份后 | pg_restore -l 校验 |
| 备份文件大小 | 每次备份后 | 文件大小非零 + 与历史对比异常 |
| 恢复演练 | 每月 | 在测试环境执行完整恢复，验证业务可用 |
| 远程备份可达 | 每天 | 检查 OSS/S3 文件存在 |

### 1.4 恢复流程

```
紧急恢复流程:
  1. 确认备份文件可用
  2. 停止 API 服务
  3. 创建数据库 (DROP + CREATE)
  4. 恢复全库: pg_restore -h localhost -U postgres -d threecloud -Fc backup.dump.gz
  5. 恢复 WAL (按需)
  6. 验证数据完整性
  7. 启动 API 服务
  8. 验证业务可用性
  9. 通知相关人员

预计恢复时间: < 30 分钟 (全库 ~5GB 时)
```

---

## 2. 日志轮转与清理

### 2.1 日志类型与保留策略

| 日志类型 | 路径 | 轮转频率 | 保留期限 | 压缩 |
|---------|------|---------|---------|------|
| API 请求日志 | `/var/log/3cloud/api/` | 每天 | 30 天 | gzip (7天后) |
| Nginx 访问日志 | `/var/log/nginx/` | 每天 | 30 天 | gzip (7天后) |
| 应用错误日志 | `/var/log/3cloud/error/` | 每天 | 90 天 | gzip |
| 慢查询日志 | `/var/log/3cloud/slow-query/` | 每天 | 90 天 | gzip |
| 审计日志 | 数据库 | 分区清理 | 180 天 | 数据库分区 |
| 系统日志 | `/var/log/syslog` | 每周 | 90 天 | gzip |

### 2.2 logrotate 配置

```conf
# /etc/logrotate.d/3cloud-api
/var/log/3cloud/api/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
    postrotate
        systemctl reload 3cloud-api || true
    endscript
}

/var/log/3cloud/error/*.log {
    daily
    rotate 90
    compress
    missingok
    notifempty
}

/var/log/3cloud/slow-query/*.log {
    daily
    rotate 90
    compress
    missingok
    notifempty
}
```

### 2.3 数据库日志分区清理

```sql
-- 按月分区清理审计日志
CREATE TABLE admin_key_usage_logs_202607 PARTITION OF admin_key_usage_logs
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- 定时任务: 每月 1 日删除 180 天前的分区
-- 示例: 2026-08-01 删除 2026-01 分区
DROP TABLE IF EXISTS admin_key_usage_logs_202601;
```

---

## 3. 自动扩容策略

### 3.1 扩容触发条件

| 指标 | 阈值 | 评估周期 | 动作 |
|------|------|---------|------|
| CPU 使用率 > 80% | 持续 5 分钟 | 每分钟 | 扩容 API 实例 |
| 内存使用率 > 85% | 持续 5 分钟 | 每分钟 | 扩容 API 实例 |
| API 请求 P99 延迟 > 3s | 持续 5 分钟 | 每分钟 | 扩容 API 实例 |
| 数据库连接池 > 80% | 持续 5 分钟 | 每分钟 | 增加连接池大小 |
| 磁盘使用率 > 85% | 持续 10 分钟 | 每 5 分钟 | 清理临时文件 / 扩容磁盘 |

### 3.2 扩容方式

```
扩容动作:
  └─ API 实例: 增加 PM2 实例数 (cluster mode)
  └─ 数据库连接池: 动态调整 pool_size
  └─ 磁盘: 触发清理脚本 → 仍不足时通知人工扩容

缩容条件:
  └─ CPU/内存 < 40% 持续 30 分钟
  └─ 逐步减少 PM2 实例数到基准值

手动扩容:
  └─ 运营后台可手动触发扩容/缩容
  └─ 支持设置预期实例数
```

### 3.3 扩容脚本

```bash
#!/bin/bash
# scale-up.sh — 扩容 API 实例
# 由监控系统自动触发或运营手动执行

CURRENT=$(pm2 list | grep "3cloud-api" | awk '{print $6}' | head -1)
MAX=8
STEP=2

NEW=$((CURRENT + STEP))
if [ $NEW -gt $MAX ]; then
  NEW=$MAX
fi

pm2 scale 3cloud-api $NEW
echo "[SCALE] 3cloud-api: $CURRENT → $NEW instances"
```

---

## 4. 告警关联与收敛

### 4.1 告警关联规则

```typescript
interface AlertCorrelationRule {
  id: string;
  name: string;
  description: string;
  conditions: {
    // 如: "数据库连接失败" + "磁盘使用率 > 95%" → "磁盘满导致数据库故障"
    alertTypes: string[];           // 关联的告警类型
    timeWindowMs: number;           // 时间窗口，如 300000 (5分钟)
    minAlerts: number;              // 最少触发数
  };
  result: {
    summary: string;                // 关联后的总结
    severity: "info" | "warning" | "critical";
    suggestedAction: string;        // 建议操作
    autoResolve: boolean;           // 是否自动解决（条件消失后）
  };
}
```

### 4.2 预置关联规则

| # | 关联场景 | 条件 | 总结 | 建议操作 |
|---|---------|------|------|---------|
| 1 | 磁盘满导致服务异常 | 磁盘告警 + 数据库告警 + API 告警 (5分钟内) | "磁盘空间不足导致数据库连接失败，进而影响 API 服务" | 清理磁盘或扩容 |
| 2 | 供应商异常连锁 | 供应商 A 连通性告警 + 路由告警 + 用户失败率告警 | "供应商 A 不可达 → 路由切换 → 部分用户请求失败" | 确认供应商状态，切换备用 |
| 3 | 突发流量 | API 延迟告警 + CPU 告警 + 响应时间告警 | "突发流量激增导致资源紧张" | 检查来源，考虑扩容 |
| 4 | 证书过期连锁 | 证书告警 + HTTPS 错误告警 | "SSL 证书即将过期" | 更新证书 |

### 4.3 告警收敛

```typescript
// 告警收敛策略
interface AlertConvergenceConfig {
  // 同告警类型去重
  sameTypeCooldownMs: number;       // 同类型告警最小间隔，如 300000
  // 故障降噪
  noiseThreshold: number;            // 某告警源连续失败 N 次后不再重复
  noiseResetAfter: number;           // 噪声重置时间 (ms)
  // 自动恢复
  autoResolveAfter: number;          // 告警源连续正常 N 次后自动恢复
  // 时间线
  groupByTimeWindow: number;         // 告警合并时间窗口
}
```

---

## 5. 部署流水线

### 5.1 部署流程

```
┌─ 开发分支 ────────────────┐
│  git push → 自动部署       │ → 开发环境部署 (自动)
└─────────────────────────────┘
            │
            ▼
┌─ 测试环境 ────────────────┐
│  手动触发部署               │ → 测试环境 (手动)
│  ├─ 运行迁移                │
│  ├─ 运行测试                │
│  └─ 健康检查                │
└─────────────────────────────┘
            │
            ▼
┌─ 预发布环境 ──────────────┐
│  手动触发部署               │ → 预发布环境 (手动)
│  ├─ 运行迁移                │
│  ├─ 运行测试                │
│  └─ 健康检查                │
└─────────────────────────────┘
            │
            ▼
┌─ 生产环境 ────────────────┐
│  手动触发部署 (审批)        │ → 生产环境 (审批)
│  ├─ 备份数据库              │
│  ├─ 运行迁移                │
│  ├─ 灰度发布 (可选)         │
│  ├─ 健康检查                │
│  └─ 回滚预案                │
└─────────────────────────────┘
```

### 5.2 部署脚本增强

```bash
#!/bin/bash
# deploy.sh — 增强版部署脚本
# 支持: 环境选择、迁移检查、健康检查、回滚

ENV=${1:-"production"}
BRANCH=${2:-"main"}
BACKUP_DIR="/data/backups/deploy"
DEPLOY_LOG="/var/log/3cloud/deploy.log"

echo "[$(date)] 开始部署: ENV=$ENV BRANCH=$BRANCH" >> "$DEPLOY_LOG"

# 1. 拉取代码
git checkout "$BRANCH"
git pull origin "$BRANCH"

# 2. 安装依赖
npm ci --production

# 3. 构建
npm run build

# 4. 备份数据库 (生产环境)
if [ "$ENV" = "production" ]; then
  pg_dump -h localhost -U postgres -Fc threecloud -f "$BACKUP_DIR/pre-deploy-$(date +%Y%m%d%H%M%S).dump"
  echo "[BACKUP] 数据库备份完成" >> "$DEPLOY_LOG"
fi

# 5. 运行迁移 (dry-run first)
npx drizzle-kit push:pg --dry-run
if [ $? -ne 0 ]; then
  echo "[FAIL] 迁移检查失败，中止部署" | mail -s "部署失败" ops@3cloud.ai
  exit 1
fi

# 6. 灰度发布 (生产环境)
if [ "$ENV" = "production" ]; then
  # 重启 50% 实例
  pm2 scale 3cloud-api $(($(pm2 list | grep "3cloud-api" | wc -l) / 2))
  sleep 30
  # 健康检查
  curl -f http://localhost:3000/health || {
    echo "[FAIL] 健康检查失败，回滚中" >> "$DEPLOY_LOG"
    pm2 scale 3cloud-api $(pm2 list | grep "3cloud-api" | wc -l)
    git stash
    exit 1
  }
fi

# 7. 全量发布
pm2 reload 3cloud-api
sleep 5

# 8. 最终健康检查
curl -f http://localhost:3000/health || {
  echo "[FAIL] 最终健康检查失败" >> "$DEPLOY_LOG"
  pm2 scale 3cloud-api $(pm2 list | grep "3cloud-api" | wc -l)
  exit 1
}

# 9. 运行迁移 (正式)
npx drizzle-kit push:pg

echo "[DONE] 部署完成: $(date)" >> "$DEPLOY_LOG"
```

### 5.3 回滚流程

```
触发回滚:
  └─ 部署后健康检查失败 → 自动回滚
  └─ 部署后监控指标异常 → 手动回滚
  └─ 运营后台一键回滚

回滚步骤:
  1. git checkout 上一个部署标签
  2. npm ci --production
  3. npm run build
  4. 如果需要，回滚迁移 (编写 down migration)
  5. pm2 reload 3cloud-api
  6. 健康检查
```

---

## 6. 自愈机制

### 6.1 自愈场景

| 场景 | 检测条件 | 自愈动作 | 预计恢复时间 |
|------|---------|---------|------------|
| API 进程崩溃 | PM2 监控 → 进程退出 | PM2 自动重启 | < 1s |
| 数据库连接池耗尽 | 连接等待 > 5s | 重置连接池 + 增加 pool_size | < 30s |
| Redis 连接丢失 | PING 超时 | 自动重连 + 重建缓存 | < 5s |
| 磁盘空间不足 | 使用率 > 95% | 清理临时文件 + 日志压缩 | < 2min |
| 供应商超时 | 连续 3 次 > 10s | 自动切换到备用供应商 | < 1s |
| 内存泄漏 | 内存持续增长 > 30min | 自动重启 Worker | < 10s |
| 死锁 | 检测到死锁 | 回滚死锁事务 | < 5s |

### 6.2 自愈引擎

```typescript
interface SelfHealingRule {
  type: string;
  condition: (metrics: SystemMetrics) => boolean;
  action: () => Promise<HealingResult>;
  cooldownMs: number;           // 执行后冷却时间，避免频繁触发
  maxRetries: number;           // 最大重试次数
  notify: boolean;              // 是否通知运维
}

interface HealingResult {
  success: boolean;
  action: string;
  duration: number;
  details?: string;
}

// 自愈引擎执行流程
class SelfHealingEngine {
  async checkAndHeal(metrics: SystemMetrics): Promise<void> {
    for (const rule of this.rules) {
      if (rule.condition(metrics)) {
        // 检查冷却时间
        if (this.isInCooldown(rule.type)) continue;
        // 检查重试次数
        if (this.getRetryCount(rule.type) >= rule.maxRetries) {
          this.alertEscalate(rule.type);  // 升级为人工处理
          continue;
        }
        // 执行自愈
        const result = await rule.action();
        this.logHealing(rule.type, result);

        if (result.success && rule.notify) {
          this.notifyOps(rule.type, result);
        }
      }
    }
  }
}
```

### 6.3 自愈日志

```typescript
export const selfHealingLogs = pgTable("self_healing_logs", {
  id: serial("id").primaryKey(),
  checkType: varchar("check_type", { length: 32 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  success: boolean("success").notNull(),
  duration: integer("duration").notNull(),       // ms
  details: text("details"),
  metrics: jsonb("metrics"),                     // 触发时的指标快照
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## 7. 运维大盘

### 7.1 运维看板页面

```
页面路径: /admin/ops/dashboard

┌─ 运维大盘 ── 2026-07-28 10:35 ─────────────────────┐
│                                                       │
│  🔴 紧急: 0   🟡 警告: 2   🟢 正常: 15             │
│                                                       │
│ ┌─ 系统概览 ──────────────────────────────────────┐ │
│ │ CPU: 45%  ████████░░░░░░                        │ │
│ │ 内存: 62% ████████████░░░░░░                    │ │
│ │ 磁盘: 82% ████████████████░░                    │ │
│ │ 负载: 1.5/4.0                                    │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─ 最近自愈记录 ──────────────────────────────────┐ │
│ │ 10:32  🟢 数据库连接池重置成功 (池耗尽)          │ │
│ │ 10:15  🟢 供应商 ds-v4 切换备用 (超时)          │ │
│ │ 09:50  🔴 磁盘清理失败 (需人工介入)              │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ ┌─ 备份状态 ──────────────────────────────────────┐ │
│ │ 🟢 数据库备份: 2026-07-28 03:00 ✅ (2.3GB)      │ │
│ │ 🟢 远程同步: 2026-07-28 04:30 ✅               │ │
│ │ 🟢 备份校验: 通过                               │ │
│ └─────────────────────────────────────────────────┘ │
│                                                       │
│ [手动扩容] [运行备份] [自愈测试] [部署]               │
└───────────────────────────────────────────────────────┘
```

---

## 8. API 接口规格

### 8.1 备份管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/ops/backups` | 备份列表 | OPS_VIEW |
| POST | `/api/v1/admin/ops/backups/run` | 手动触发备份 | OPS_EDIT |
| GET | `/api/v1/admin/ops/backups/:id` | 备份详情 | OPS_VIEW |
| POST | `/api/v1/admin/ops/backups/restore` | 恢复备份（需审批）| OPS_EDIT |

### 8.2 扩容管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/ops/scale` | 当前实例状态 | OPS_VIEW |
| POST | `/api/v1/admin/ops/scale/up` | 扩容 | OPS_EDIT |
| POST | `/api/v1/admin/ops/scale/down` | 缩容 | OPS_EDIT |
| POST | `/api/v1/admin/ops/scale/set` | 设置目标实例数 | OPS_EDIT |

### 8.3 自愈管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/ops/healing` | 自愈历史 | OPS_VIEW |
| GET | `/api/v1/admin/ops/healing/rules` | 自愈规则列表 | OPS_VIEW |
| PATCH | `/api/v1/admin/ops/healing/rules/:type` | 更新自愈规则 | OPS_EDIT |
| POST | `/api/v1/admin/ops/healing/test/:type` | 测试自愈动作 | OPS_EDIT |

### 8.4 部署管理

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/ops/deploy/history` | 部署历史 | OPS_VIEW |
| POST | `/api/v1/admin/ops/deploy/rollback` | 回滚到上次部署 | OPS_EDIT |
| GET | `/api/v1/admin/ops/deploy/status` | 当前部署状态 | OPS_VIEW |

---

## 9. 前端组件 Props

### 9.1 OpsDashboard — 运维大盘

```typescript
interface OpsDashboardProps {
  autoRefresh?: boolean;
  refreshIntervalMs?: number;
}

interface SystemMetricCardProps {
  label: string;
  value: number;
  unit: string;
  threshold: number;
  status: "ok" | "warning" | "critical";
  history: { timestamp: string; value: number }[];
}

interface SelfHealingLogCardProps {
  logs: {
    time: string;
    status: "success" | "failed";
    action: string;
    detail: string;
  }[];
}
```

### 9.2 BackupManager — 备份管理

```typescript
interface BackupManagerProps {
  // 路由页面
}

interface BackupRowProps {
  id: number;
  date: string;
  type: string;
  size: string;
  status: "completed" | "failed" | "running";
  verified: boolean;
  remoteSync: boolean;
  onRestore: (id: number) => void;
  onDownload: (id: number) => void;
}
```

### 9.3 ScaleManager — 扩容管理

```typescript
interface ScaleManagerProps {
  currentInstances: number;
  maxInstances: number;
  minInstances: number;
  metrics: {
    cpu: number;
    memory: number;
    requestLatency: number;
  };
  onScaleUp: () => void;
  onScaleDown: () => void;
  onSetTarget: (count: number) => void;
}
```

### 9.4 DeployHistory — 部署历史

```typescript
interface DeployHistoryProps {
  history: {
    id: number;
    version: string;
    env: string;
    status: "success" | "failed" | "rolling_back";
    deployedAt: string;
    deployedBy: string;
    commitMessage: string;
  }[];
  onRollback: (deployId: number) => void;
}
```

---

## 10. 运营配置项

| 配置项 | 路径 | 类型 | 默认值 | 说明 |
|-------|------|------|--------|------|
| 自动备份启用 | `site_configs.ops.backup.enabled` | boolean | true | — |
| 备份时间 | `site_configs.ops.backup.cron` | string | `0 3 * * *` | 每日 03:00 |
| 本地保留天数 | `site_configs.ops.backup.local_retention` | int | 7 | — |
| 远程保留天数 | `site_configs.ops.backup.remote_retention` | int | 30 | — |
| 自动扩容启用 | `site_configs.ops.scale.auto_enabled` | boolean | false | 默认关闭 |
| 最大实例数 | `site_configs.ops.scale.max_instances` | int | 8 | — |
| 最小实例数 | `site_configs.ops.scale.min_instances` | int | 2 | — |
| 自愈引擎启用 | `site_configs.ops.healing.enabled` | boolean | true | — |
| 自愈告警通知 | `site_configs.ops.healing.notify_ops` | boolean | true | 自愈失败时通知 |
| 部署前备份 | `site_configs.ops.deploy.pre_backup` | boolean | true | — |
| 灰度发布比例 | `site_configs.ops.deploy.canary_percent` | int | 50 | 灰度实例占比 |

---

## 11. 边界条件

### 11.1 备份边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B1 | 备份文件过大（> 10GB）| 分片压缩，单文件不超过 2GB |
| B2 | 备份失败 | 重试 3 次，仍失败则告警 |
| B3 | 磁盘空间不足无法备份 | 跳过备份，告警"磁盘空间不足" |
| B4 | 远程存储不可用 | 保留本地备份，远程同步失败告警 |

### 11.2 扩容边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B5 | 已达到最大实例数 | 不再扩容，记录告警 |
| B6 | 缩容时存在活跃请求 | 等待请求处理完成后再缩容 |
| B7 | 频繁扩缩容 | 设置冷却时间（至少 5 分钟间隔）|

### 11.3 自愈边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B8 | 自愈动作执行失败 | 重试 3 次，升级为人工处理 |
| B9 | 自愈引擎自身崩溃 | 下次进程启动时恢复 |
| B10 | 自愈规则配置错误 | 校验配置，无效配置跳过 |
| B11 | 并发自愈冲突 | 按优先级执行，避免重复操作 |

### 11.4 部署边界

| # | 边界场景 | 处理策略 |
|---|---------|---------|
| B12 | 迁移失败 | 回滚到上一个版本，保留数据库状态 |
| B13 | 部署过程中断 | 继续部署或回滚，由运营决定 |
| B14 | 灰度发布异常 | 停止灰度，回滚到全量旧版本 |

---

## 12. 验收标准

### 12.1 备份

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC1 | 自动备份 | 每日 03:00 自动执行，备份文件完整 |
| AC2 | 备份校验 | 每次备份后校验通过 |
| AC3 | 远程同步 | 备份文件同步到远程存储 |
| AC4 | 备份恢复 | 恢复流程可在 30 分钟内完成 |

### 12.2 扩容

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC5 | 自动扩容 | 满足条件后自动增加实例数 |
| AC6 | 手动扩容 | 运营后台手动扩容生效 |
| AC7 | 缩容 | 满足条件后自动减少实例数 |

### 12.3 自愈

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC8 | 进程崩溃自愈 | PM2 自动重启，服务恢复 |
| AC9 | 连接池耗尽自愈 | 自动重置连接池 |
| AC10 | 供应商超时自愈 | 自动切换备用供应商 |
| AC11 | 自愈失败升级 | 自愈失败后通知运维 |

### 12.4 部署

| # | 验收项 | 通过标准 |
|---|-------|---------|
| AC12 | 部署流程 | 拉取代码 → 构建 → 迁移 → 健康检查 → 完成 |
| AC13 | 回滚 | 一键回滚到上一个版本 |
| AC14 | 灰度发布 | 先发布 50% 实例，健康检查通过后全量 |

---

## 13. 交叉引用

| 关联模块 | 文档 | 关系 |
|---------|------|------|
| 健康巡检 | `ref-4.18-kpi-drill-healthcheck.md` | 巡检触发自愈/告警关联 |
| 告警规则 | `ref-5.4-alert-rules.md` | 告警关联规则数据源 |
| 部署脚本 | `deploy.sh` | 增强脚本集成 |
| 系统配置 | `ref-4.8-system-config.md` | 运维配置存储在 site_configs |
| 监控日志 | `ref-4.7-monitor-logs.md` | 扩容指标数据源 |
| 操作日志 | `ref-4.13-operation-timeline.md` | 运维操作记录 |