# 12 — 调用大盘升级

> **后端**: 1 人天 | **前端**: 1 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：当前调用日志页（`pages/Logs.tsx` 和 `AdminLogs.tsx`）功能完善但缺少：
- 失败请求深度检索（按错误类型/错误码筛选）
- 异常模式检测（高频失败自动标记）
- 失败链路的完整上下文（请求头/响应头/路由链路）

**目标**：将调用大盘升级为运维分析工具，支持失败根因定位、异常模式发现、一键下钻。

---

## 2. 现有分析

当前调用日志已有功能：
- ✅ 状态筛选（全部/成功/失败/超时/已取消/处理中）
- ✅ 列设置（显隐/排序）
- ✅ 详情 Drawer
- ✅ 趋势图（日/周/月）
- ✅ 模型分布图
- ✅ 异常面板
- ✅ CSV 导出

需要升级的：
- ❌ 按错误类型分组聚合
- ❌ 失败请求的完整 Request/Response
- ❌ 异常模式自动检测
- ❌ 按用户/Key/模型下钻的失败率
- ❌ 失败请求的时序热力图

---

## 3. 后端增强

### 失败分析端点

```typescript
// GET /api/v1/admin/logs/failure-analysis
// Query: timeRange, modelId?, vendorId?, userId?

Response: {
  summary: {
    totalCalls: number
    totalFailed: number
    failureRate: number        // 百分比
    avgDurationMs: number      // 失败请求的平均耗时
  }
  byErrorType: [              // 按错误类型分组
    { errorType: 'timeout', count: 156, percentage: 42.3, trend: '+12%' }
    { errorType: '4xx', count: 89, percentage: 24.1, trend: '-3%' }
    { errorType: '5xx', count: 67, percentage: 18.2, trend: '+8%' }
    { errorType: 'rate_limited', count: 45, percentage: 12.2, trend: '-5%' }
    { errorType: 'other', count: 12, percentage: 3.2, trend: '0%' }
  ]
  byModel: [                  // 按模型
    { modelName: 'deepseek-chat', failed: 89, total: 1234, rate: 7.2 }
    // ...
  ]
  byVendor: [                 // 按供应商
    { vendorName: 'DeepSeek', failed: 67, total: 890, rate: 7.5 }
    // ...
  ]
  timeSeries: [               // 时序（按小时）
    { time: '2026-07-16T10:00', total: 120, failed: 5 }
    // ...
  ]
}
```

```typescript
// GET /api/v1/admin/logs/:id/context
// 获取某条调用日志的完整上下文

Response: {
  callLog: CallLog
  // 请求信息
  requestHeaders: Record<string, string>
  requestBody: object
  // 响应信息
  responseHeaders: Record<string, string>
  responseBody: object          // 截断到 10KB
  responseStatus: number
  // 路由链路
  routingPath: {
    selectedVendorModelId: number
    vendorName: string
    upstreamModelName: string
    routingStrategy: string
    apiKeyPrefix: string
    circuitState: string | null
  }
  // 重试信息（如果启用了重试）
  retryAttempts?: AttemptRecord[]
  // 客户端信息
  clientInfo: {
    ip: string
    userAgent: string
    geo: { country: string; city: string } | null
  }
}
```

### 异常模式检测

```typescript
// api/src/cron/anomaly-detection.ts
// 每 5 分钟执行一次

async function detectAnomalyPatterns() {
  // 1. 短时间高频失败
  const burst = await db.execute(sql`
    SELECT 
      user_id,
      COUNT(*) as failed_count,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '5 minutes') as recent_count
    FROM call_logs
    WHERE status IN ('failed', 'timeout')
      AND created_at > NOW() - INTERVAL '30 minutes'
    GROUP BY user_id
    HAVING COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '5 minutes') >= 10
  `)
  
  for (const row of burst.rows) {
    // 创建安全事件
    await createSecurityEvent({
      type: 'request_burst_failure',
      userId: row.user_id,
      severity: 'warning',
      description: `用户 ${row.user_id} 在过去 5 分钟内失败 ${row.recent_count} 次`,
    })
  }
  
  // 2. 特定模型异常波动
  const modelAnomaly = await db.execute(sql`
    SELECT 
      model_name,
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('failed','timeout') THEN 1 ELSE 0 END) as failed,
      ROUND(
        SUM(CASE WHEN status IN ('failed','timeout') THEN 1 ELSE 0 END)::numeric 
        / NULLIF(COUNT(*), 0) * 100, 1
      ) as failure_rate
    FROM call_logs
    WHERE created_at > NOW() - INTERVAL '1 hour'
    GROUP BY model_name
    HAVING 
      SUM(CASE WHEN status IN ('failed','timeout') THEN 1 ELSE 0 END)::numeric 
      / NULLIF(COUNT(*), 0) > 0.2
      AND COUNT(*) >= 20
  `)
  
  for (const row of modelAnomaly.rows) {
    // 创建告警
    await createAlert({
      type: 'model_anomaly',
      severity: row.failure_rate > 50 ? 'critical' : 'warning',
      description: `模型 ${row.model_name} 失败率 ${row.failure_rate}%（1h 内 ${row.total} 次调用）`,
    })
  }
}
```

---

## 4. 前端增强

### 失败分析 Tab（调用日志页新增）

```
调用日志
┌──────────────────────────────────────────────────────┐
│ [全部] [实时] [失败分析 ▼] [趋势] [模型分布] [异常]    │
├──────────────────────────────────────────────────────┤
│                                                        │
│  📊 失败概览                                            │
│  ┌──────┬──────┬──────┬──────┐                         │
│  │ 总调用│ 失败  │ 失败率│ 平均耗时 │                         │
│  │5,320 │ 324  │ 6.1% │ 3.2s  │                         │
│  └──────┴──────┴──────┴──────┘                         │
│                                                        │
│  按错误类型                    按模型                   │
│  ┌─────────────────┐          ┌─────────────────┐      │
│  │ ████████ 超时 42%│          │ deepseek 7.2%   │      │
│  │ ██████ 4xx  24% │          │ gpt-4o   5.1%  │      │
│  │ █████ 5xx  18%  │          │ claude   3.8%  │      │
│  │ ███ 限流  12%   │          │ ...              │      │
│  └─────────────────┘          └─────────────────┘      │
│                                                        │
│  失败时序热力图（24h）                                   │
│  00 ── 04 ── 08 ── 12 ── 16 ── 20 ──                  │
│  ⬛⬛⬜⬛⬜⬛⬛⬜⬛⬛⬛⬜⬜⬛⬜⬛⬛⬜⬛⬛⬜⬛⬛⬛      │
│  (深 = 失败率高, 浅 = 失败率低)                          │
│                                                        │
│  最近异常请求                        ↓ 点击查看详情      │
│  ┌────────────────────────────────────────────────┐   │
│  │ ⚠️ 16:30 │ user#42 │ deepseek-chat │ 超时 30s  │ → │
│  │ ⚠️ 16:28 │ user#42 │ deepseek-chat │ 超时 28s  │ → │
│  │ ❌ 16:25 │ user#88 │ gpt-4o       │ 500       │ → │
│  └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

### 失败的完整上下文 Drawer

点击任意失败请求 → Drawer 展示：

```
┌──────────────────────────────────────────────────┐
│  ❌ 调用详情 #10234          [📋 复制ID] [导出]   │
├──────────────────────────────────────────────────┤
│                                                   │
│  📝 基本信息                                       │
│  时间: 2026-07-16 16:30:22                        │
│  用户: user@example.com (ID: 42)                  │
│  API Key: prod-key-1 (sk-b62e...)                 │
│  模型: deepseek-chat → DeepSeek API               │
│  状态: ❌ 失败  |  耗时: 30,002ms  |  Token: 0     │
│                                                   │
│  🔗 路由链路                                       │
│  (1) API Key 鉴权 → ✅ 通过                        │
│  (2) 余额检查 → ✅ 通过 (¥123.45)                  │
│  (3) 限流检查 → ✅ 通过 (RPM: 45/100)              │
│  (4) 路由选择 → lowest_price → DeepSeek API       │
│  (5) 上游转发 → ❌ 超时 30s (AbortError)           │
│  (6) 重试 → 备用厂商 Aliyun → ❌ 也超时            │
│  (7) 计费 → 未计费（转发失败）                      │
│                                                   │
│  📨 请求详情                        [📋 复制]     │
│  POST /v1/chat/completions                        │
│  Headers: { Authorization: 'Bearer sk-...' }      │
│  Body: { "model": "deepseek-chat", "messages":  } │
│                                                   │
│  📩 响应详情                        [📋 复制]     │
│  Status: ❌ 超时                                   │
│  Body: (无响应 - 连接超时)                          │
│                                                   │
│  🔧 建议                                           │
│  · 检查 DeepSeek API 服务状态                      │
│  · 考虑增加更短的超时时间                           │
│  · 已配置备用厂商，但也都超时                        │
└──────────────────────────────────────────────────┘
```

---

## 5. 数据库索引优化

```sql
-- call_logs 增加查询索引
CREATE INDEX idx_call_logs_status_created ON call_logs(status, created_at);
CREATE INDEX idx_call_logs_user_status ON call_logs(user_id, status, created_at);
CREATE INDEX idx_call_logs_model_status ON call_logs(model_name, status, created_at);
```

---

## 6. 验收标准

- [ ] 失败分析 Tab 展示失败概览、错误类型分布、模型/供应商维度
- [ ] 24h 失败热力图直观展示异常时段
- [ ] 异常模式自动检测：高频失败、模型异常波动
- [ ] 失败请求完整上下文 Drawer（请求/响应/路由链路/重试）
- [ ] 支持按错误类型筛选下钻
- [ ] 批量导出失败请求详情（CSV）
- [ ] 路由链路图展示每一步耗时和状态
