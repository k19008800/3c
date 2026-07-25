# 错误码参考文档功能

## 概述

为用户和管理员提供错误码参考文档，包括错误码列表、搜索、详情展示，以及 API 错误时的文档链接。

## 文件列表

### 后端 (API)

| 文件 | 行数 | 大小 | 说明 |
|------|------|------|------|
| `api/src/constants/error-codes.ts` | 611 行 | 22.4 KB | 错误码定义文件 |
| `api/src/routes/public/error-codes.ts` | 107 行 | 4.0 KB | 公开 API 路由 |
| `api/src/utils/error-response.ts` | 185 行 | 7.3 KB | 错误响应工具函数 |
| `api/src/__tests__/error-codes.test.ts` | 116 行 | 4.8 KB | 单元测试 |

### 前端 (Web)

| 文件 | 行数 | 大小 | 说明 |
|------|------|------|------|
| `web/src/pages/ErrorCodeReference.tsx` | 400 行 | 15.8 KB | 错误码参考页面 |

**总计：1419 行代码，54.4 KB**

## API 接口

### 1. 获取错误码列表

```
GET /api/v1/public/error-codes
```

**查询参数：**
- `category` - 按分类筛选（balance, auth, model, rate-limit, request, service, redemption, verification, invoice, refund, agent, system）
- `search` - 搜索关键词（匹配错误码、错误信息、解决方案）
- `severity` - 按严重程度筛选（error, warning, info）

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "categories": [...],
    "errorCodes": [
      {
        "code": "E001",
        "message": "余额不足",
        "messageEn": "Insufficient balance",
        "category": "balance",
        "categoryLabel": "余额",
        "severity": "error",
        "solution": "请充值后重试...",
        "solutionEn": "Please recharge...",
        "docUrl": "/docs/balance"
      }
    ],
    "total": 50
  },
  "message": "ok"
}
```

### 2. 获取错误码详情

```
GET /api/v1/public/error-codes/:code
```

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "code": "E001",
    "message": "余额不足",
    "messageEn": "Insufficient balance",
    "category": "balance",
    "categoryLabel": "余额",
    "severity": "error",
    "solution": "请充值后重试。您可以在"充值"页面选择合适的充值方式进行充值。",
    "solutionEn": "Please recharge and try again...",
    "docUrl": "/docs/balance"
  },
  "message": "ok"
}
```

### 3. 获取分类统计

```
GET /api/v1/public/error-codes/categories
```

**响应示例：**
```json
{
  "code": 0,
  "data": {
    "categories": [
      { "key": "balance", "label": "余额", "labelEn": "Balance", "icon": "💰", "count": 3 },
      { "key": "auth", "label": "认证", "labelEn": "Authentication", "icon": "🔐", "count": 8 }
    ],
    "total": 50
  },
  "message": "ok"
}
```

## 前端页面

### 访问路径

- `/error-codes` - 错误码列表页面
- `/error-codes/:code` - 错误码详情页面（直接打开详情弹窗）

### 功能特性

1. **分类筛选** - 左侧边栏按分类筛选错误码
2. **严重程度筛选** - 支持按错误/警告/提示筛选
3. **搜索功能** - 支持搜索错误码、错误信息、解决方案
4. **详情展示** - 点击错误码卡片查看详细信息
5. **响应示例** - 展示 API 错误响应格式示例
6. **相关错误码** - 显示关联的其他错误码

## 使用方法

### 1. 在 API 中使用错误响应

```typescript
import { sendErrorResponse, ErrorResponses } from "../utils/error-response.js";

// 方式一：使用预定义快捷方法
return ErrorResponses.insufficientBalance(reply, currentBalance);

// 方式二：使用通用方法
return sendErrorResponse(reply, 400, "E001", "余额不足，当前余额：10.00 元", {
  balance: 10.00,
  required: 100.00
});

// 方式三：创建错误对象（不直接发送）
const errorObj = createErrorObject("E001", undefined, { balance: 10.00 });
// ... 其他处理
return reply.status(400).send(errorObj);
```

### 2. API 错误响应格式

所有 API 错误响应都包含错误码和文档链接：

```json
{
  "code": 1,
  "error": "余额不足",
  "errorCode": "E001",
  "docUrl": "/error-codes/E001",
  "details": {
    "balance": 10.00
  },
  "message": "error"
}
```

用户可以通过 `docUrl` 快速跳转到错误码参考文档。

## 错误码分类

| 分类 | 代码范围 | 说明 |
|------|----------|------|
| 余额 | E001-E010 | 余额不足、冻结、充值相关 |
| 认证 | E011-E020 | API Key、登录、权限相关 |
| 模型 | E021-E030 | 模型不存在、禁用、维护相关 |
| 限流 | E031-E040 | TPM、RPM、并发、配额相关 |
| 请求 | E041-E050 | 参数错误、超时、内容审核相关 |
| 服务 | E051-E060 | 上游服务、熔断器相关 |
| 兑换码 | E061-E070 | 兑换码无效、过期、已使用相关 |
| 实名认证 | E071-E080 | 实名认证状态相关 |
| 发票 | E081-E090 | 发票申请、开具相关 |
| 退款 | E091-E100 | 退款申请、处理相关 |
| 代理 | E101-E110 | 代理账户、佣金、提现相关 |
| 系统 | E901-E910 | 系统内部错误相关 |

## 测试

运行单元测试：

```bash
cd api
npx vitest run src/__tests__/error-codes.test.ts
```

测试覆盖：
- 所有错误码定义完整性
- 分类正确性
- 查询函数正确性
- 搜索功能正确性
- 响应格式正确性

## 扩展指南

### 添加新错误码

在 `api/src/constants/error-codes.ts` 中添加：

```typescript
'E999': {
  code: 'E999',
  message: '新错误',
  messageEn: 'New error',
  category: 'balance',
  categoryLabel: '余额',
  severity: 'error',
  solution: '解决方案',
  solutionEn: 'Solution',
  docUrl: '/docs/xxx', // 可选
  relatedCodes: ['E001'], // 可选
},
```

### 添加快捷响应方法

在 `api/src/utils/error-response.ts` 的 `ErrorResponses` 对象中添加：

```typescript
newError: (reply: FastifyReply, details?: Record<string, unknown>) =>
  sendErrorResponse(reply, 400, "E999", undefined, details),
```
