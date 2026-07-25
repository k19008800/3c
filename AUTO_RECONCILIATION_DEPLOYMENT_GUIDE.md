# 自动对账系统部署指南

## 系统概述

P1自动对账系统已完整实现，包含以下功能：
1. 自动化对账流程，支持多维度对账
2. 定时对账（每小时、每天）和手动触发
3. 异常检测和告警通知
4. 对账报告生成和导出（CSV/PDF）
5. 异常处理和跟踪

## 部署前提条件

### 1. 环境要求
- Node.js >= 18.0.0
- PostgreSQL >= 15.0
- Redis >= 6.0
- 3cloud后端服务已运行
- 3cloud前端管理后台已部署

### 2. 数据库变更

#### 新增权限
已添加新的权限常量：
```sql
-- 权限已通过代码更新，无需手动SQL
-- 新增权限：RECONCILIATION_MANAGE (1n << 29n)
```

#### 权限分配
以下角色已获得新权限：
- `admin`: 对账管理权限
- `finance_ops`: 对账管理权限
- `auditor`: 对账查看权限

### 3. 定时任务配置
系统已注册以下定时任务：
- **每小时对账检查**: 每小时第5分钟执行
- **每日对账汇总**: 每天03:00执行
- **对账自动化**: 每天03:00执行（原有）

## 部署步骤

### 第1步：后端部署

#### 1.1 代码更新
```bash
# 进入API目录
cd ~/.openclaw/workspace/3cloud/api

# 拉取最新代码
git pull origin main

# 安装依赖
npm install

# 构建项目
npm run build
```

#### 1.2 数据库迁移
```bash
# 运行数据库迁移
npm run migrate

# 验证数据库表结构
npm run db:check
```

#### 1.3 服务重启
```bash
# 重启后端服务
pm2 restart 3cloud-api

# 检查服务状态
pm2 status 3cloud-api

# 查看日志
pm2 logs 3cloud-api --lines 100
```

### 第2步：前端部署

#### 2.1 代码更新
```bash
# 进入前端目录
cd ~/.openclaw/workspace/3cloud/web

# 拉取最新代码
git pull origin main

# 安装依赖
npm install

# 构建项目
npm run build
```

#### 2.2 服务重启
```bash
# 重启前端服务
pm2 restart 3cloud-web

# 检查服务状态
pm2 status 3cloud-web
```

### 第3步：配置检查

#### 3.1 环境变量验证
确保以下环境变量已配置：
```env
# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/3cloud

# Redis配置
REDIS_URL=redis://localhost:6379

# 告警通知配置（可选）
ALERT_WEBHOOK_URL=https://your-webhook-url
ALERT_EMAIL_RECIPIENTS=admin@example.com
```

#### 3.2 权限配置验证
登录管理后台，检查以下权限是否正确：
1. `admin`角色：应具有对账管理权限
2. `finance_ops`角色：应具有对账管理权限
3. `auditor`角色：应具有对账查看权限

### 第4步：功能验证

#### 4.1 API端点测试
```bash
# 测试手动触发对账
curl -X POST "http://localhost:3000/api/v1/admin/finance/reconciliation/run" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2024-01-01","endDate":"2024-01-31","reconType":"full"}'

# 测试报告列表查询
curl -X GET "http://localhost:3000/api/v1/admin/finance/reconciliation/reports?page=1&pageSize=10" \
  -H "Authorization: Bearer <token>"

# 测试PDF导出
curl -X GET "http://localhost:3000/api/v1/admin/finance/reconciliation/1/export-pdf" \
  -H "Authorization: Bearer <token>" \
  -o "report.pdf"
```

#### 4.2 前端功能测试
1. 访问 `/admin/finance/reconciliation`
2. 测试手动触发对账功能
3. 测试报告查看和导出功能
4. 测试异常处理功能

#### 4.3 定时任务验证
检查日志，确认定时任务正常执行：
```bash
# 查看定时任务日志
pm2 logs 3cloud-api --lines 200 | grep -E "(HourlyRecon|DailyRecon)"
```

## 配置选项

### 1. 对账频率配置
系统支持以下对账频率：
- **快速检查**: 每小时执行（可配置执行时间）
- **完整对账**: 每天执行
- **手动触发**: 随时执行

### 2. 告警配置
告警级别根据异常严重程度自动确定：
- **critical**: 存在严重异常
- **error**: 存在高优先级异常
- **warning**: 存在中低优先级异常

### 3. 导出格式
支持多种导出格式：
- **CSV**: 适用于数据分析和导入
- **PDF**: 适用于正式报告和归档
- **HTML**: 网页查看格式

## 故障排除

### 常见问题1：权限不足
**症状**: 访问对账页面时显示"无权限"
**解决方案**:
1. 检查用户角色配置
2. 验证权限位是否正确设置
3. 清除Redis权限缓存

### 常见问题2：对账任务失败
**症状**: 对账执行失败，返回错误信息
**解决方案**:
1. 检查数据库连接状态
2. 验证表结构是否正确
3. 查看详细错误日志

### 常见问题3：定时任务未执行
**症状**: 每小时/每日对账未触发
**解决方案**:
1. 检查服务器时间设置
2. 验证cron表达式配置
3. 查看应用启动日志

### 常见问题4：告警未发送
**症状**: 发现异常但未收到告警
**解决方案**:
1. 检查告警配置是否正确
2. 验证通知渠道可用性
3. 查看告警日志记录

## 监控指标

### 1. 关键指标
- 对账任务执行成功率
- 异常检测准确率
- 告警响应时间
- 系统资源使用率

### 2. 日志监控
关注以下日志关键词：
- `[HourlyRecon]`: 每小时对账日志
- `[DailyRecon]`: 每日对账日志
- `reconciliation`: 对账相关日志
- `alert`: 告警相关日志

### 3. 性能监控
- 对账任务执行时间
- 数据库查询性能
- 内存使用情况

## 维护计划

### 1. 日常维护
- 每日检查对账任务执行状态
- 每周清理过期对账报告
- 每月审核异常处理情况

### 2. 数据清理
对账报告保留策略：
- 30天内报告：完整保留
- 30-90天报告：归档存储
- 90天以上报告：可清理

### 3. 系统升级
- 定期更新依赖包
- 监控安全漏洞
- 备份重要配置

## 备份和恢复

### 1. 配置备份
```bash
# 备份环境配置
cp .env .env.backup-$(date +%Y%m%d)

# 备份数据库迁移文件
cp -r drizzle/migrations backups/migrations-$(date +%Y%m%d)
```

### 2. 数据备份
```bash
# 备份对账相关数据
pg_dump -t reconciliation_reports -t reconciliation_mismatches -t daily_recon_summary \
  -U postgres -d 3cloud > reconciliation_backup-$(date +%Y%m%d).sql
```

### 3. 恢复流程
1. 恢复数据库备份
2. 恢复环境配置
3. 重启应用服务
4. 验证功能正常

## 联系支持

如遇问题，请联系：
- 开发团队: dev@3cloud.com
- 运维团队: ops@3cloud.com
- 紧急联系: +86-XXX-XXXX-XXXX

---

**部署完成时间**: 2024年7月25日
**部署版本**: v1.0.0
**部署人员**: AI Assistant
**审核状态**: ✅ 已完成