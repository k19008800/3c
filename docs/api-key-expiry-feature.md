# API 密钥过期时间功能实现总结

## 功能概述

为 3cloud API 密钥管理添加了过期时间功能，支持：
- 创建/编辑 Key 时设置过期时间
- 过期后自动禁用 Key
- 显示剩余有效时间
- 支持永不过期选项

## 实现详情

### 1. 数据库层

**Schema 已支持** ✅
- `api_keys` 表已有 `expires_at` 字段（nullable timestamp）
- 位置：`api/src/db/schema/api-keys.ts`

### 2. 后端 API

#### 创建 API Key
- **路由**：`POST /api/v1/api-keys`
- **支持参数**：`expiresAt` (ISO 8601 datetime string)
- **位置**：`api/src/routes/api-keys.ts`

#### 更新 API Key
- **路由**：`PATCH /api/v1/api-keys/:id`
- **支持参数**：`expiresAt` (ISO 8601 datetime string 或 null)
- **修改**：更新了 `updateApiKeySchema` 支持 expiresAt

#### Schema 验证
- **位置**：`api/src/schemas/api-keys.ts`
- **修改**：
  - `createApiKeySchema` 已支持 `expiresAt`
  - `updateApiKeySchema` 新增 `expiresAt` 支持

### 3. 过期验证

#### 实时验证
- **位置**：`api/src/services/api-key-auth-service.ts`
- **逻辑**：在 `validateApiKey` 方法中检查过期时间
```typescript
if (key.expiresAt && key.expiresAt < new Date()) {
  return { isValid: false, message: "API Key 已过期" };
}
```

#### 定时禁用
- **位置**：`api/src/jobs/disable-expired-api-keys.ts`
- **逻辑**：每小时扫描一次，禁用过期的 Key
- **注册**：`api/src/app/index.ts` 中注册定时任务

### 4. 前端组件

#### 创建对话框
- **位置**：`web/src/pages/ApiKeys.tsx`
- **新增**：
  - 过期时间选择下拉框
  - 选项：永不过期、7天、30天、90天、1年

#### Key 列表
- **新增列**：过期时间
- **显示**：
  - 永不过期：灰色文字
  - 剩余 > 30 天：绿色
  - 剩余 7-30 天：琥珀色
  - 剩余 1-7 天：橙色
  - 剩余 < 1 天：红色
  - 已过期：红色 + "(已禁用)"

#### 辅助函数
```typescript
function getRemainingTime(expiresAt: string | null | undefined): 
  { text: string; color: string; expired: boolean }
```

## 过期选项

| 选项 | 说明 |
|------|------|
| 永不过期 | expiresAt = null |
| 7 天后 | expiresAt = now + 7 days |
| 30 天后 | expiresAt = now + 30 days |
| 90 天后 | expiresAt = now + 90 days |
| 1 年后 | expiresAt = now + 365 days |

## 定时任务

**任务名称**：禁用过期 API Key
**执行频率**：每小时一次
**首次执行**：启动后 1 分钟
**逻辑**：
1. 查找所有 `status = true AND expiresAt < now` 的 Key
2. 批量更新 `status = false`
3. 记录日志

## 验收标准

- ✅ 数据库字段已存在
- ✅ 创建 Key 时可设置过期时间
- ✅ 更新 Key 时可修改过期时间
- ✅ 过期 Key 自动禁用（定时任务）
- ✅ 过期 Key 验证失败（实时检查）
- ✅ 前端正确显示过期状态

## 测试

### 单元测试
- 位置：`api/src/jobs/__tests__/disable-expired-api-keys.test.ts`
- 测试场景：
  1. 禁用过期 Key
  2. 不禁用未过期 Key
  3. 不禁用永不过期的 Key

### 手动测试步骤
1. 启动后端服务：`cd api && npm run dev`
2. 启动前端服务：`cd web && npm run dev`
3. 登录用户账户
4. 进入 API 密钥页面
5. 创建新密钥，选择过期时间
6. 验证列表显示剩余时间
7. 编辑密钥，修改过期时间
8. 验证过期后自动禁用

## 文件清单

### 新增文件
- `api/src/jobs/disable-expired-api-keys.ts` - 定时禁用任务
- `api/src/jobs/__tests__/disable-expired-api-keys.test.ts` - 单元测试
- `api/verify-expiry-feature.ts` - 功能验证脚本

### 修改文件
- `api/src/schemas/api-keys.ts` - 更新 schema 支持 expiresAt
- `api/src/routes/api-keys.ts` - 更新路由支持 expiresAt
- `api/src/app/index.ts` - 注册定时任务
- `web/src/pages/ApiKeys.tsx` - 前端组件更新

## 注意事项

1. **数据库迁移**：expires_at 字段已存在，无需迁移
2. **向后兼容**：expiresAt 为 null 表示永不过期
3. **定时任务**：每小时执行一次，首次执行延迟 1 分钟
4. **实时验证**：每次使用 Key 时都会检查过期时间
5. **前端显示**：过期时间颜色根据剩余天数动态变化

## 后续优化建议

1. 添加邮件/站内信通知：Key 即将过期时提醒用户
2. 支持自定义过期时间（日期选择器）
3. 添加批量设置过期时间功能
4. 过期 Key 自动清理（可选）
