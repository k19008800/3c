# 配置版本控制 - 系统文档

## 📋 功能概述

配置版本控制系统为3cloud平台提供了完整的配置变更追踪、版本管理、回滚和审批流程功能。

## 🎯 核心功能

### 1. 配置变更历史追踪
- 记录所有配置项的变更历史
- 支持变更原因记录和操作者追踪
- 提供IP地址记录和安全审计

### 2. 版本回滚
- 支持回滚到任意历史版本
- 自动记录回滚操作
- 确保数据一致性

### 3. 配置快照
- 创建系统配置的快照
- 一键恢复配置快照
- 支持快照导出和导入

### 4. 变更审批流程
- 重要配置变更需要审批
- 多级审批工作流
- 变更影响评估

### 5. 配置对比
- 可视化配置差异对比
- 支持任意两个版本的对比
- 变更影响分析

## 🗄️ 数据库结构

### 新增表

#### 1. config_versions (配置版本历史)
```sql
CREATE TABLE config_versions (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) NOT NULL,
  config_type VARCHAR(50) NOT NULL DEFAULT 'system',
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id),
  change_reason TEXT,
  ip VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

#### 2. config_snapshots (配置快照)
```sql
CREATE TABLE config_snapshots (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  config_type VARCHAR(50) NOT NULL DEFAULT 'system',
  config_data JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id),
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(name, config_type)
);
```

#### 3. config_change_requests (配置变更请求)
```sql
CREATE TABLE config_change_requests (
  id SERIAL PRIMARY KEY,
  config_key VARCHAR(100) NOT NULL,
  config_type VARCHAR(50) NOT NULL DEFAULT 'system',
  old_value TEXT,
  new_value TEXT NOT NULL,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  request_reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by INTEGER REFERENCES users(id),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### 现有表扩展

#### system_configs 表新增字段
- `version` INTEGER DEFAULT 1 - 配置版本号
- `last_version_id` INTEGER REFERENCES config_versions(id) - 最后版本ID

## 🔌 API 接口

### 配置历史相关

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/config/history` | 获取全局配置变更历史 | SYSTEM_VIEW |
| GET | `/api/v1/admin/config/:type/:key/history` | 获取单配置变更历史 | SYSTEM_VIEW |
| GET | `/api/v1/admin/config/version/:versionId` | 获取指定版本详情 | SYSTEM_VIEW |
| POST | `/api/v1/admin/config/:type/:key/revert/:version` | 回滚到指定版本 | SYSTEM_ACTION |
| GET | `/api/v1/admin/config/:type/:key/diff` | 配置对比 | SYSTEM_VIEW |

### 配置快照相关

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| POST | `/api/v1/admin/config/snapshots` | 创建配置快照 | SYSTEM_ACTION |
| GET | `/api/v1/admin/config/snapshots` | 获取快照列表 | SYSTEM_VIEW |
| GET | `/api/v1/admin/config/snapshots/:snapshotId` | 获取快照详情 | SYSTEM_VIEW |
| POST | `/api/v1/admin/config/snapshots/:snapshotId/restore` | 恢复快照 | SYSTEM_ACTION |

### 变更审批相关

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| POST | `/api/v1/admin/config/change-requests` | 创建变更请求 | SYSTEM_EDIT |
| GET | `/api/v1/admin/config/change-requests` | 获取变更请求列表 | SYSTEM_VIEW |
| GET | `/api/v1/admin/config/change-requests/:requestId` | 获取请求详情 | SYSTEM_VIEW |
| POST | `/api/v1/admin/config/change-requests/:requestId/process` | 处理变更请求 | SYSTEM_ACTION |

### 增强版配置管理

| 方法 | 端点 | 描述 | 权限 |
|------|------|------|------|
| GET | `/api/v1/admin/configs/enhanced` | 获取增强版配置列表 | CONFIG_VIEW |
| PATCH | `/api/v1/admin/configs/enhanced/:key` | 更新配置（带版本控制） | CONFIG_EDIT |
| POST | `/api/v1/admin/configs/enhanced/batch` | 批量更新配置 | CONFIG_EDIT |
| GET | `/api/v1/admin/configs/enhanced/stats` | 配置版本统计 | CONFIG_VIEW |

## 🚀 使用示例

### 1. 查看配置变更历史
```bash
curl -X GET "http://localhost:3000/api/v1/admin/config/history?configType=system&page=1&pageSize=20" \
  -H "Authorization: Bearer <token>"
```

### 2. 回滚配置版本
```bash
curl -X POST "http://localhost:3000/api/v1/admin/config/system/site_name/revert/123" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "错误的配置变更"}'
```

### 3. 创建配置快照
```bash
curl -X POST "http://localhost:3000/api/v1/admin/config/snapshots" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "生产环境备份",
    "description": "2024年7月生产环境配置快照",
    "configType": "system",
    "isActive": false
  }'
```

### 4. 提交变更请求
```bash
curl -X POST "http://localhost:3000/api/v1/admin/config/change-requests" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "configKey": "rate_limit_user",
    "configType": "system",
    "newValue": 1000,
    "requestReason": "提高用户API调用限制"
  }'
```

## 🛠️ 安装和配置

### 1. 数据库迁移
```bash
# 进入api目录
cd api

# 执行迁移脚本
npm run migrate:config
# 或
node scripts/run-config-migration.js
```

### 2. 服务重启
```bash
# 重启API服务
npm run restart
```

### 3. 前端页面访问
配置版本管理页面位于：`/admin/config-versions`

## 📊 配置变更影响评估

系统会自动评估配置变更的影响级别：

| 影响级别 | 说明 | 建议操作 |
|----------|------|----------|
| **Critical** | 关键影响 | 必须进行安全评估，变更后立即验证 |
| **High** | 高影响 | 建议进行测试，变更前进行复核 |
| **Medium** | 中等影响 | 建议在非高峰时段变更，密切监控 |
| **Low** | 低影响 | 常规变更，正常流程处理 |

### 影响评估规则
- **安全相关配置**：Critical级别
- **财务结算配置**：High级别  
- **API限流配置**：Medium级别
- **UI显示配置**：Low级别

## 🔒 安全注意事项

1. **敏感配置保护**
   - 密码、密钥等敏感配置不记录历史值
   - 敏感配置变更需要双重审批

2. **操作审计**
   - 所有配置变更记录操作者IP和时间
   - 支持操作追溯和安全审计

3. **权限控制**
   - 查看权限：SYSTEM_VIEW
   - 编辑权限：SYSTEM_EDIT  
   - 操作权限：SYSTEM_ACTION
   - 审批权限：SYSTEM_APPROVE

4. **数据备份**
   - 重要配置变更前自动创建快照
   - 支持配置导出和离线备份

## 🧪 测试验证

### 单元测试
```bash
# 运行配置版本控制相关测试
npm test -- --testPathPattern=config-version
```

### 集成测试
1. 创建配置变更并验证历史记录
2. 测试版本回滚功能
3. 验证快照创建和恢复
4. 测试审批流程
5. 验证配置对比功能

## 📈 监控和告警

### 关键监控指标
- 配置变更频率
- 回滚操作次数
- 审批等待时间
- 快照创建频率

### 告警规则
- 高频配置变更告警
- 敏感配置变更告警
- 审批超时告警
- 回滚操作告警

## 🤝 与其他系统集成

### 1. 审计日志系统
所有配置变更自动记录到审计日志系统。

### 2. 通知系统
重要配置变更发送通知给相关人员。

### 3. 监控系统
配置变更影响监控指标的调整。

### 4. 安全系统
敏感配置变更触发安全扫描。

## 🔄 维护计划

### 定期维护
- **每日**：检查配置变更频率
- **每周**：清理过期快照
- **每月**：审计配置变更记录
- **每季度**：更新影响评估规则

### 数据清理
- 配置历史记录保留180天
- 快照数据保留365天
- 变更请求记录保留90天

## 📚 常见问题解答

### Q1: 配置变更会影响系统运行吗？
A: 大多数配置变更不会影响系统运行，但关键配置（如安全、财务相关）变更需要谨慎处理。

### Q2: 如何恢复误操作？
A: 可以通过版本回滚功能恢复到之前的任意版本。

### Q3: 快照和版本有什么区别？
A: 版本是单个配置项的变更记录，快照是多个配置项的整体状态保存。

### Q4: 谁可以审批配置变更？
A: 需要具有SYSTEM_APPROVE权限的管理员。

### Q5: 如何导出配置？
A: 可以通过快照功能导出当前配置状态。

---

**最后更新**: 2024年7月25日  
**版本**: v1.0.0  
**维护者**: 3cloud运维团队