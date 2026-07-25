# API 密钥过期时间功能使用指南

## 功能介绍

API 密钥过期时间功能允许您为每个 API 密钥设置有效期，增强安全性：

- **自动过期**：密钥到期后自动禁用，无需手动管理
- **灵活配置**：支持 7 天、30 天、90 天、1 年或永不过期
- **实时提醒**：列表中显示剩余有效时间，颜色标识紧急程度
- **双重保障**：实时验证 + 定时扫描，确保过期密钥无法使用

## 使用方法

### 1. 创建带过期时间的密钥

1. 登录 3cloud 控制台
2. 进入 **API 密钥** 页面
3. 点击 **创建密钥** 按钮
4. 填写密钥名称（如：生产环境）
5. 选择过期时间：
   - **永不过期**：密钥永久有效（不推荐用于生产环境）
   - **7 天后**：适合临时测试
   - **30 天后**：适合短期项目
   - **90 天后**：适合中期项目
   - **1 年后**：适合长期项目
6. 点击 **确认创建**
7. **立即复制密钥**（仅显示一次）

### 2. 查看密钥过期状态

密钥列表中会显示每个密钥的过期信息：

| 状态 | 颜色 | 说明 |
|------|------|------|
| 永不过期 | 灰色 | 密钥永久有效 |
| 剩余 > 30 天 | 绿色 | 安全 |
| 剩余 7-30 天 | 琥珀色 | 注意 |
| 剩余 1-7 天 | 橙色 | 即将过期 |
| 剩余 < 1 天 | 红色 | 紧急 |
| 已过期 | 红色 + (已禁用) | 已自动禁用 |

### 3. 修改密钥过期时间

目前前端暂不支持直接修改过期时间，但可以通过 API 更新：

```bash
curl -X PATCH https://api.3cloud.com/api/v1/api-keys/{keyId} \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "expiresAt": "2025-12-31T23:59:59.000Z"
  }'
```

设置为 `null` 表示永不过期：

```bash
curl -X PATCH https://api.3cloud.com/api/v1/api-keys/{keyId} \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "expiresAt": null
  }'
```

## 安全建议

### 生产环境密钥
- ✅ 设置 **90 天或 1 年** 过期时间
- ✅ 定期轮换密钥
- ✅ 使用权限限制（IP 白名单、模型限制等）
- ❌ 不要使用永不过期

### 测试环境密钥
- ✅ 设置 **7 天或 30 天** 过期时间
- ✅ 测试完成后及时删除
- ❌ 不要用于生产环境

### CI/CD 密钥
- ✅ 设置 **1 年** 过期时间
- ✅ 配置过期提醒（计划中）
- ✅ 使用最小权限原则

## 工作原理

### 实时验证
每次使用 API 密钥时，系统会：
1. 检查密钥是否存在
2. 检查密钥是否启用
3. **检查密钥是否过期** ← 新增
4. 检查权限配置
5. 检查额度限制

如果密钥已过期，返回错误：
```json
{
  "code": 401,
  "message": "API Key 已过期"
}
```

### 定时扫描
系统每小时执行一次过期扫描：
1. 查找所有 `status = true AND expiresAt < now` 的密钥
2. 批量更新 `status = false`
3. 记录操作日志

这确保即使实时验证失败，过期密钥也会被禁用。

## 常见问题

### Q: 过期后能否恢复密钥？
A: 可以。过期只是将 `status` 设为 `false`，您可以：
1. 更新 `status = true` 重新启用
2. 同时更新 `expiresAt` 延长有效期

### Q: 过期时间能否设置为过去的时间？
A: 可以，但密钥会立即被禁用。这可用于临时禁用密钥。

### Q: 永不过期的密钥是否会被扫描？
A: 不会。`expiresAt = null` 的密钥不受定时任务影响。

### Q: 过期提醒如何配置？
A: 即将过期提醒功能正在开发中，计划支持：
- 邮件提醒
- 站内信提醒
- Webhook 通知

### Q: 能否批量设置过期时间？
A: 目前不支持，计划在未来版本添加。

## API 参考

### 创建密钥
```typescript
POST /api/v1/api-keys
{
  "name": string,           // 密钥名称
  "expiresAt"?: string,     // 过期时间（ISO 8601）
  "templateId"?: number,    // 权限模板 ID
  "permissions"?: object    // 权限配置
}
```

### 更新密钥
```typescript
PATCH /api/v1/api-keys/:id
{
  "name"?: string,
  "status"?: boolean,
  "expiresAt"?: string | null,  // null 表示永不过期
  "templateId"?: number,
  "permissions"?: object
}
```

### 查询密钥
```typescript
GET /api/v1/api-keys
Response: {
  list: [{
    id: number,
    name: string,
    keyPrefix: string,
    status: boolean,
    expiresAt: string | null,  // ISO 8601 或 null
    lastUsedAt: string | null,
    createdAt: string,
    ...
  }],
  total: number,
  page: number,
  pageSize: number
}
```

## 最佳实践

### 1. 分环境管理
```
生产环境: Key-Prod (90天过期)
测试环境: Key-Test (7天过期)
开发环境: Key-Dev (30天过期)
```

### 2. 定期轮换
- 设置日历提醒，在密钥过期前 7 天轮换
- 创建新密钥 → 更新应用配置 → 删除旧密钥

### 3. 最小权限
- 为不同用途创建不同密钥
- 每个密钥只授予必要权限
- 设置合理的过期时间

### 4. 监控使用
- 定期检查密钥使用情况
- 删除长期未使用的密钥
- 关注即将过期的密钥

## 更新日志

### v1.0.0 (2026-07-25)
- ✅ 数据库 schema 支持 expiresAt
- ✅ 创建密钥时支持设置过期时间
- ✅ 更新密钥时支持修改过期时间
- ✅ 实时过期验证
- ✅ 定时禁用过期密钥
- ✅ 前端过期时间选择
- ✅ 前端剩余时间显示

### 计划中
- ⏳ 过期前邮件/站内信提醒
- ⏳ 自定义过期时间（日期选择器）
- ⏳ 批量设置过期时间
- ⏳ 过期密钥自动清理
