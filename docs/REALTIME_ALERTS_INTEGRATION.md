# 3cloud 实时告警推送系统 - 集成指南

## 📋 概述

实时告警推送系统为 3cloud 平台提供了实时的用户告警通知功能，支持 WebSocket 实时推送、浏览器通知、移动端推送等多种通知渠道。

## 🏗️ 系统架构

### 后端组件
1. **WebSocket 服务** (`/ws/alerts`) - 实时推送告警
2. **告警服务** (`alert-service.ts`) - 检测和生成告警
3. **告警推送服务** (`alert-push-service.ts`) - 管理推送逻辑
4. **订阅管理 API** (`/api/v1/me/notifications/*`) - 管理用户偏好

### 前端组件
1. **useRealTimeAlerts Hook** - WebSocket 连接和状态管理
2. **RealTimeNotification 组件** - UI 组件库
3. **AlertNotification 组件** - 管理后台组件

### 数据库表
1. **user_notification_subscriptions** - 用户订阅设置
2. **user_notification_preferences** - 用户通知偏好
3. **alert_push_history** - 推送历史记录（30天自动清理）

## 🚀 快速开始

### 1. 数据库迁移

```powershell
cd api
.\scripts\run-realtime-alerts-migration.ps1
```

或手动执行 SQL 文件：
```sql
psql -U postgres -d 3cloud -f src/db/migrations/20240726_add_real_time_alerts_tables.sql
```

### 2. 启动服务

```bash
# 启动 API 服务
cd api
npm run dev

# 启动前端服务
cd web
npm run dev
```

### 3. 功能测试

```powershell
cd api
.\scripts\test-realtime-alerts.ps1
```

## 🎯 前端集成

### 基本使用

```tsx
import { RealTimeNotification } from '../components/RealTimeNotification';

// 在应用根组件中添加
function App() {
  return (
    <>
      <YourAppContent />
      <RealTimeNotification 
        showBell={true}
        showToast={true}
        enableBrowserNotifications={true}
        onAlertClick={(alert) => console.log('Alert clicked:', alert)}
      />
    </>
  );
}
```

### Hook 使用

```tsx
import { useRealTimeAlerts } from '../hooks/useRealTimeAlerts';

function YourComponent() {
  const {
    isConnected,
    alerts,
    stats,
    preferences,
    acknowledgeAlert,
    refreshAlerts,
    updatePreferences,
    browserNotificationsEnabled,
    requestNotificationPermission
  } = useRealTimeAlerts({
    autoConnect: true,
    enableBrowserNotifications: true,
    onAlert: (alert) => {
      // 处理新告警
      console.log('New alert:', alert);
    }
  });

  // 使用示例
  return (
    <div>
      <button onClick={() => refreshAlerts()}>刷新告警</button>
      <div>连接状态: {isConnected ? '已连接' : '未连接'}</div>
      <div>未读告警: {stats?.unacknowledged || 0}</div>
    </div>
  );
}
```

### 组件变体

```tsx
// 简化版本（只显示铃铛）
import { RealTimeNotificationBellOnly } from '../components/RealTimeNotification';

// 最小版本
import { RealTimeNotificationMinimal } from '../components/RealTimeNotification';

// 完全自定义
<RealTimeNotification
  showBell={true}                    // 显示通知铃铛
  showToast={true}                   // 显示Toast通知
  showNotificationCenter={true}      // 显示通知中心按钮
  enableBrowserNotifications={true}  // 启用浏览器通知
  toastDuration={7000}               // Toast显示时长(ms)
  maxToasts={3}                      // 最大Toast数量
  autoAcknowledgeAfter={30000}       // 30秒后自动确认
  onAlertClick={(alert) => {         // 点击告警回调
    // 跳转到详情页
    if (alert.detailPath) {
      window.location.href = alert.detailPath;
    }
  }}
/>
```

## 🔧 API 参考

### WebSocket 端点

```
GET /ws/alerts
```

**连接参数**: JWT Token 通过标准 Authorization 头传递

**消息格式**:
```json
// 客户端 -> 服务端
{
  "action": "subscribe",
  "types": ["failure_rate_spike", "quota_exhaustion"]
}

{
  "action": "get_alerts"
}

{
  "action": "acknowledge",
  "alertId": "alert_123",
  "action": "acknowledge"
}

{
  "action": "heartbeat"
}

// 服务端 -> 客户端
{
  "type": "alert",
  "data": {
    "id": "alert_123",
    "severity": "warning",
    "title": "配额即将耗尽",
    "message": "您的月度配额已使用85%",
    "type": "quota_exhaustion",
    "metadata": {},
    "createdAt": "2024-01-01T12:00:00Z"
  }
}

{
  "type": "connected",
  "userId": 123,
  "message": "WebSocket连接已建立"
}
```

### REST API

#### 获取通知偏好
```
GET /api/v1/me/notifications/preferences
```

#### 更新通知设置
```
PUT /api/v1/me/notifications/settings
```
```json
{
  "settings": {
    "browserNotifications": true,
    "mobilePush": true,
    "emailNotifications": false,
    "quietHours": {
      "enabled": true,
      "start": "22:00",
      "end": "08:00"
    },
    "criticalAlertsAlways": true,
    "soundEnabled": true,
    "vibrationEnabled": true
  },
  "alertFilters": {
    "enabledLevels": ["critical", "error", "warning", "info"],
    "minimumLevel": "info"
  }
}
```

#### 获取订阅设置
```
GET /api/v1/me/notifications/subscriptions
```

#### 更新订阅设置
```
PUT /api/v1/me/notifications/subscriptions
```
```json
{
  "subscriptions": [
    {"type": "failure_rate_spike", "subscribed": true},
    {"type": "quota_exhaustion", "subscribed": true},
    {"type": "suspicious_login", "subscribed": false}
  ]
}
```

#### 获取告警列表
```
GET /api/v1/me/alerts
```

## ⚙️ 配置选项

### 告警类型
| 类型 | 描述 | 默认订阅 |
|------|------|----------|
| `failure_rate_spike` | 失败率突增 | ✅ |
| `quota_exhaustion` | 配额耗尽 | ✅ |
| `suspicious_login` | 异地登录 | ✅ |
| `abnormal_call_pattern` | 异常调用模式 | ✅ |
| `security_event` | 安全事件 | ❌ |
| `system_maintenance` | 系统维护 | ❌ |
| `feature_update` | 功能更新 | ❌ |
| `billing_reminder` | 账单提醒 | ❌ |

### 告警级别
| 级别 | 描述 | 默认启用 |
|------|------|----------|
| `critical` | 严重 - 需要立即处理 | ✅ |
| `error` | 错误 - 需要关注 | ✅ |
| `warning` | 警告 - 需要注意 | ✅ |
| `info` | 信息 - 仅供参考 | ✅ |

### 通知渠道
| 渠道 | 描述 | 默认启用 |
|------|------|----------|
| 浏览器通知 | 桌面浏览器推送通知 | ✅ |
| 移动推送 | 移动端推送（待实现） | ✅ |
| 邮件通知 | 邮件通知 | ❌ |

## 🛠️ 开发指南

### 添加新的告警类型

1. **扩展枚举类型** (`enums.ts`):
```typescript
// 添加新的告警类型
export const alertTypeEnum = pgEnum("alert_type", [
  // 现有类型...
  "your_new_alert_type",  // 添加新类型
]);
```

2. **更新默认订阅** (`notification-subscriptions.ts`):
```typescript
const DEFAULT_SUBSCRIPTIONS = [
  // 现有订阅...
  'your_new_alert_type',  // 添加到默认订阅
];
```

3. **创建检测逻辑** (`alert-service.ts`):
```typescript
async function detectYourNewAlert(userId: number): Promise<AlertItem[]> {
  // 实现检测逻辑
  return [{
    id: generateAlertId('your_new_alert_type', 'unique_id'),
    type: 'your_new_alert_type',
    level: 'warning',
    title: '新类型告警',
    message: '检测到新类型告警',
    createdAt: new Date().toISOString(),
    acknowledged: false
  }];
}
```

4. **集成到主检测流程**:
```typescript
// 在 getUserAlerts 中添加新的检测函数
const [failureAlerts, quotaAlerts, loginAlerts, abnormalAlerts, yourNewAlerts] =
  await Promise.all([
    detectFailureRateSpike(userId, since24h),
    detectQuotaExhaustion(userId),
    detectSuspiciousLogin(userId),
    detectAbnormalCallPattern(userId),
    detectYourNewAlert(userId),  // 添加新的检测
  ]);
```

### 自定义通知行为

```typescript
// 自定义告警处理
const handleCustomAlert = (alert: AlertItem) => {
  // 根据告警类型执行不同操作
  switch (alert.type) {
    case 'failure_rate_spike':
      // 发送到监控系统
      sendToMonitoringSystem(alert);
      break;
    case 'quota_exhaustion':
      // 触发自动充值
      triggerAutoRecharge(alert);
      break;
    default:
      // 默认处理
      break;
  }
};

// 在组件中使用
<RealTimeNotification
  onAlertClick={handleCustomAlert}
/>
```

## 📊 监控和调试

### 日志查看

```bash
# API 服务日志
tail -f api/logs/app.log

# WebSocket 连接日志
grep "WebSocket\|Alert" api/logs/app.log

# Redis Pub/Sub 日志
grep "Redis\|PubSub" api/logs/app.log
```

### 连接状态检查

```javascript
// 浏览器开发者工具
// 检查 WebSocket 连接
const ws = new WebSocket('ws://localhost:3000/ws/alerts');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
ws.onerror = (e) => console.error('Error:', e);
ws.onclose = () => console.log('Closed');

// 检查通知权限
console.log('Notification permission:', Notification.permission);
```

### 性能指标

| 指标 | 目标值 | 监控方法 |
|------|--------|----------|
| WebSocket 连接延迟 | < 100ms | 浏览器 Network 面板 |
| 告警推送延迟 | < them50ms | 服务端日志时间戳 |
| 并发连接数 | < 1000 | Redis 监控 |
| 内存使用 | < 100MB/实例 | 进程监控 |

## 🔒 安全考虑

### 认证和授权
- WebSocket 连接使用 JWT Token 认证
- 每个告警都关联到特定用户
- 订阅设置受用户权限控制

### 数据保护
- 敏感信息在告警消息中脱敏
- 推送历史30天自动清理
- 数据库连接使用SSL加密

### 防滥用
- WebSocket 连接频率限制
- 心跳机制检测僵尸连接
- Redis Pub/Sub 消息大小限制

## 🚨 故障排除

### 常见问题

1. **WebSocket 连接失败**
   ```
   检查项:
   - API 服务是否运行
   - Token 是否有效
   - 防火墙是否允许 WebSocket 连接
   - CORS 配置是否正确
   ```

2. **浏览器通知不显示**
   ```
   检查项:
   - 浏览器是否支持 Notification API
   - 通知权限是否被授予
   - 是否在静默时段
   - 告警级别是否在过滤范围内
   ```

3. **告警检测不触发**
   ```
   检查项:
   - 数据库连接是否正常
   - Redis 是否运行
   - 检测阈值配置是否正确
   - 用户数据是否满足检测条件
   ```

4. **内存泄漏**
   ```
   检查项:
   - WebSocket 连接是否正确关闭
   - Redis 订阅是否正确清理
   - 定时器是否正确清除
   ```

### 调试命令

```bash
# 检查数据库表
psql -U postgres -d 3cloud -c "\dt user_notification_*"

# 检查枚举类型
psql -U postgres -d 3cloud -c "\dT+ alert_type"
psql -U postgres -d 3cloud -c "\dT+ alert_level"

# 检查数据
psql -U postgres -d 3cloud -c "SELECT COUNT(*) FROM alert_push_history;"
psql -U postgres -d 3cloud -c "SELECT * FROM user_notification_subscriptions LIMIT 5;"

# Redis 监控
redis-cli info clients
redis-cli pubsub channels
```

## 📈 扩展计划

### 短期计划
1. ✅ 基本 WebSocket 推送功能
2. ✅ 浏览器通知集成
3. ✅ 用户偏好设置
4. 📅 移动端推送集成
5. 📅 邮件通知集成
6. 📅 高级过滤规则

### 中长期计划
1. 📅 AI驱动的告警优先级
2. 📅 多语言通知支持
3. 📅 通知模板系统
4. 📅 第三方集成（Slack、钉钉、微信）
5. 📅 通知分析和报告

## 📞 支持

如有问题，请联系：
- **技术负责人**: 后端开发团队
- **文档维护**: 文档团队
- **问题反馈**: GitHub Issues

---

**最后更新**: 2026-07-26  
**版本**: v1.0.0  
**状态**: 🟢 生产就绪