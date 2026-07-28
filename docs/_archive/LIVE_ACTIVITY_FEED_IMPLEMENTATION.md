# 实时活动流功能实现文档

## 功能概述

在用户仪表盘添加了实时活动流组件，实时显示用户最新的 API 调用记录。

## 实现内容

### 1. 后端 WebSocket 端点

**文件**: `api/src/routes/ws/activity.ts`

- 端点: `GET /ws/activity`
- 认证: JWT Token
- 功能:
  - 实时推送用户的 API 调用事件
  - 支持暂停/恢复实时更新
  - 心跳保持连接
  - 自动重连机制
  - 最多缓存 50 条事件

### 2. 活动推送服务

**文件**: `api/src/services/activity-push-service.ts`

- 管理 WebSocket 连接和订阅
- 支持 Redis Pub/Sub（多实例部署）
- 提供推送接口供其他服务调用

### 3. 前端 WebSocket Hook

**文件**: `web/src/hooks/useActivityFeed.ts`

- 管理 WebSocket 连接
- 自动重连（最多 5 次，间隔 3 秒）
- 消息队列管理
- 暂停/恢复功能

### 4. 实时活动流组件

**文件**: `web/src/pages/dashboard/components/LiveActivityFeed.tsx`

- 滚动列表，新消息从顶部插入
- 状态图标（成功✓/失败✗）
- 暂停/恢复按钮
- 清空按钮
- 空状态提示
- 连接状态指示

### 5. 集成点

#### Dashboard 集成

**文件**: `web/src/pages/Dashboard.tsx`

- 在 Alert Center 之后添加 LiveActivityFeed 组件

#### 路由注册

**文件**: `api/src/app/routes.ts`

- 注册 WebSocket 路由

#### 计费集成

**文件**: `api/src/services/billing/charge.ts`

- 在 `charge()` 函数中，调用完成后推送活动事件

## 数据结构

```typescript
interface ActivityEvent {
  id: string;              // 格式: `${userId}-${callLogId}`
  timestamp: Date;         // 事件时间
  model: string;           // 模型名称
  status: 'success' | 'error';  // 调用状态
  inputTokens: number;     // 输入 tokens
  outputTokens: number;    // 输出 tokens
  cost: number;            // 费用（元）
  keyName?: string;        // API Key 名称（可选）
}
```

## WebSocket 消息协议

### 客户端 → 服务器

```typescript
// 暂停实时更新
{ action: "pause" }

// 恢复实时更新
{ action: "resume" }

// 心跳响应
{ action: "heartbeat" }
```

### 服务器 → 客户端

```typescript
// 连接确认
{
  type: "connected",
  userId: number,
  timestamp: string,
  message: string
}

// 活动事件
{
  type: "activity",
  data: ActivityEvent,
  timestamp: string
}

// 队列事件（恢复时）
{
  type: "queued_events",
  data: ActivityEvent[],
  timestamp: string
}

// 暂停确认
{
  type: "paused",
  timestamp: string
}

// 恢复确认
{
  type: "resumed",
  timestamp: string
}

// 心跳
{
  type: "heartbeat",
  timestamp: string
}

// 错误
{
  type: "error",
  message: string
}
```

## 验收标准

✅ WebSocket 连接正常
✅ 实时推送调用事件
✅ 组件正确显示活动流
✅ 暂停/恢复功能正常
✅ 自动重连机制
✅ 最多显示 50 条记录
✅ 空状态提示
✅ 连接状态指示

## 使用说明

1. 用户登录后访问仪表盘页面
2. LiveActivityFeed 组件自动连接 WebSocket
3. 当用户进行 API 调用时，调用完成后自动推送到活动流
4. 用户可以暂停/恢复实时更新
5. 用户可以清空活动流

## 技术要点

### WebSocket 认证

- 使用 JWT Token 进行认证
- Token 通过 URL 参数传递: `ws://host/ws/activity?token=xxx`

### 心跳机制

- 服务器每 30 秒发送心跳
- 客户端响应心跳重置超时计时器
- 连接超时时间: 300 秒

### 重连机制

- 自动重连最多 5 次
- 重连间隔: 3 秒
- 用户可手动重连

### 消息队列

- 暂停时，新事件加入队列
- 队列最多缓存 50 条
- 恢复时，发送队列中的所有事件

### Redis Pub/Sub

- 支持多实例部署
- 频道: `3cloud:activity:push`
- 本地推送 + Redis 广播

## 性能考虑

- WebSocket 连接数: 每个用户 1 个连接
- 事件缓存: 最多 50 条
- 心跳间隔: 30 秒
- 连接超时: 300 秒
- Redis Pub/Sub: 异步推送，不阻塞主流程

## 未来优化

1. 添加事件过滤（按模型、状态、时间范围）
2. 添加事件统计（成功率、平均耗时）
3. 添加事件导出功能
4. 添加事件详情查看
5. 支持多语言
6. 添加声音提示
7. 添加桌面通知
