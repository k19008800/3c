# 异常告警中心实现文档

## 概述

实现了用户仪表盘的异常告警中心功能，聚合多种告警类型并支持实时监控和操作。

## 实现内容

### 1. 类型定义 (`3cloud/web/src/types/alert.ts`)

- `AlertLevel`: 告警级别 (info/warning/error/critical)
- `AlertType`: 告警类型 (failure_rate_spike/quota_exhaustion/suspicious_login/abnormal_call_pattern)
- `AlertItem`: 告警项完整定义
- `AlertStats`: 告警统计
- `AlertCenterData`: 告警中心数据结构

### 2. 后端服务 (`3cloud/api/src/services/alert-service.ts`)

**告警检测逻辑：**

1. **失败率突增** (`detectFailureRateSpike`)
   - 按模型聚合调用统计
   - 成功率 < 95% → warning
   - 成功率 < 90% → error
   - 成功率 < 80% → critical
   - 最少 10 次调用才统计

2. **配额即将耗尽** (`detectQuotaExhaustion`)
   - 用户级配额 + Key 级配额
   - 使用率 > 80% → warning
   - 使用率 > 90% → error
   - 使用率 > 95% → critical

3. **异地登录提醒** (`detectSuspiciousLogin`)
   - 检测最近 30 天内的新城市登录
   - 自动对比历史常用登录地
   - level: warning

4. **异常调用模式** (`detectAbnormalCallPattern`)
   - 10 分钟内失败次数超过 50 次
   - level: error

**配置参数：**

```typescript
const ALERT_CONFIG = {
  failureRateThresholds: { warning: 95, error: 90, critical: 80 },
  quotaUsageThresholds: { warning: 80, error: 90, critical: 95 },
  abnormalCallThreshold: 50,
  abnormalCallWindowMinutes: 10,
  suspiciousLoginWindowDays: 30,
}
```

### 3. 后端路由 (`3cloud/api/src/routes/alerts.ts`)

- `GET /api/v1/me/alerts` - 获取告警中心数据
- `POST /api/v1/me/alerts/acknowledge` - 确认/忽略告警

### 4. 前端组件 (`3cloud/web/src/pages/dashboard/components/AlertCenter.tsx`)

**功能特性：**

- ✅ 展示告警列表（按级别和时间排序）
- ✅ 告警级别过滤（全部/严重/错误/警告/提示）
- ✅ 告警统计徽章（显示各级别数量）
- ✅ 告警确认/忽略操作
- ✅ 跳转到详情页（关联日志/安全/充值页面）
- ✅ 自动刷新（默认 1 分钟）
- ✅ 手动刷新按钮
- ✅ 展开/折叠状态
- ✅ 无告警时显示正常状态

**UI 设计：**

- 参考现有 QuotaInfo 组件风格
- 使用 Lucide 图标
- 告警级别颜色编码：
  - critical: 红色
  - error: 橙色
  - warning: 琥珀色
  - info: 蓝色

### 5. 集成到用户仪表盘

在 `3cloud/web/src/pages/Dashboard.tsx` 中集成：

```tsx
{/* Alert Center */}
<AlertCenter defaultExpanded={false} refreshInterval={60000} />
```

位置：Quick Connect 面板之后，统计卡片之前。

## API 接口

### GET /api/v1/me/alerts

**响应：**

```json
{
  "code": 0,
  "data": {
    "alerts": [
      {
        "id": "failure_rate_spike_gpt_4o_1234567890",
        "type": "failure_rate_spike",
        "level": "error",
        "title": "模型 gpt-4o 失败率异常",
        "message": "模型 gpt-4o 在近期调用中失败率为 12.5%...",
        "createdAt": "2026-07-25T06:20:00.000Z",
        "acknowledged": false,
        "metadata": {
          "modelName": "gpt-4o",
          "failureRate": 12.5,
          "totalCalls": 200,
          "failedCalls": 25
        },
        "detailPath": "/logs?model=gpt-4o&status=failed"
      }
    ],
    "stats": {
      "total": 3,
      "critical": 0,
      "error": 1,
      "warning": 2,
      "info": 0,
      "unacknowledged": 3
    }
  },
  "message": "ok"
}
```

### POST /api/v1/me/alerts/acknowledge

**请求：**

```json
{
  "alertId": "failure_rate_spike_gpt_4o_1234567890",
  "action": "acknowledge"
}
```

**响应：**

```json
{
  "code": 0,
  "data": {
    "alertId": "failure_rate_spike_gpt_4o_1234567890",
    "action": "acknowledge"
  },
  "message": "操作成功"
}
```

## 后续优化建议

1. **持久化存储**
   - 当前告警确认状态仅在内存中
   - 建议使用 Redis 或创建 `alerts` 表持久化
   - 记录确认时间和操作人

2. **实时推送**
   - 当前使用轮询（1 分钟间隔）
   - 可升级为 WebSocket 实时推送
   - 减少延迟和服务器负载

3. **告警规则配置**
   - 允许用户自定义阈值
   - 支持告警静默时段
   - 告警通知渠道（邮件/短信/Webhook）

4. **告警历史**
   - 记录告警生命周期
   - 支持告警趋势分析
   - 告警报表导出

5. **智能降噪**
   - 相同告警合并
   - 告警频率限制
   - 智能告警抑制

## 测试验证

### 编译验证

```bash
# 后端
cd 3cloud/api
npx tsc --noEmit  # ✅ 通过

# 前端
cd 3cloud/web
npx tsc --noEmit  # ✅ 通过
```

### 功能测试

1. 启动后端服务：`cd 3cloud/api && npm run dev`
2. 启动前端服务：`cd 3cloud/web && npm run dev`
3. 访问用户仪表盘：`http://localhost:5175/`
4. 验证告警中心组件显示
5. 测试告警确认/忽略操作
6. 验证自动刷新功能

## 文件清单

### 新增文件

- `3cloud/web/src/types/alert.ts` - 告警类型定义
- `3cloud/api/src/services/alert-service.ts` - 告警检测服务
- `3cloud/api/src/routes/alerts.ts` - 告警路由

### 修改文件

- `3cloud/web/src/types/index.ts` - 导出告警类型
- `3cloud/api/src/app/routes.ts` - 注册告警路由
- `3cloud/web/src/pages/Dashboard.tsx` - 集成告警中心组件
