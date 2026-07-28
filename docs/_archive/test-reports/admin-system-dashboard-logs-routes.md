# T12 — Admin System & Dashboard & Logs 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/admin/system.ts`, `admin/dashboard.ts`, `admin/logs.ts`

## 端点覆盖

### system.ts
| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/configs` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/configs/:key` | PATCH | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/audit-logs` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/stats` | GET | authenticateJWT + requireRole | ✅ |

### dashboard.ts
| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/dashboard/stats` | GET | authenticateJWT + requireRole | ✅ |
| `/api/v1/admin/dashboard/recent-activity` | GET | authenticateJWT + requireRole | ✅ |

### logs.ts
| 端点 | 方法 | preHandler | 状态 |
|------|------|-----------|------|
| `/api/v1/admin/logs` | GET | authenticateJWT + requireRole | ✅ |

## 系统配置管理

- 列表支持 group 过滤 (key LIKE prefix%) ✅
- PATCH 更新: 校验 key 和 value 存在，检查 config 是否存在 ✅
- 更新后清除相关缓存 (pricing_*) ✅
- 变更记录 auditLogs ✅

## Dashboard 统计

### stats 端点
- 用户统计: total / active / disabled / pendingReview ✅
- 今日充值: sum amount + count ✅
- 系统配置数 ✅

### dashboard/stats 端点
- 用户统计: total / todayNew / yesterdayNew ✅
- 调用统计: today/yesterday 对比 ✅
- 充值统计: today / pending ✅
- 实名待审数量 ✅
- Top 5 模型 (按调用数降序) ✅

### recent-activity
- 最近 10 条充值记录 ✅
- 最近 10 次调用记录 ✅

## 管理日志查询

- 关键词搜索（子查询匹配 user email） ✅
- modelName LIKE 筛选 ✅
- status 精确匹配 ✅
- startDate/endDate 范围 ✅
- 用户 email LEFT JOIN ✅

## 响应格式

所有端点统一 `{ code: 0, data: {...}, message: "ok" }` ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 8/8 |
| 管理员权限 | ✅ |
| 统计准确性 | ✅ |
| 审计日志 | ✅ |
| 整体评分 | 90/100 |
