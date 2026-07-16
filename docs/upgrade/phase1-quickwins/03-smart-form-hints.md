# 03 — 智能表单提示系统

> **后端**: — | **前端**: 1.5 人天 | **依赖**: 无

---

## 1. 背景与目标

**问题**：当前表单错误提示仅展示后端返回的原始消息（如 `name 和 baseUrl 必填`、`Validation failed`），无操作指引。用户遇到错误不知道怎么解决。

**目标**：每个输入框提供 inline hint；每条错误信息附带可操作的解决方案；统一 ErrorBoundary 替代白屏/500 页面。

---

## 2. 核心组件

### `<FormField>` — 统一表单字段组件

```tsx
// 文件：web/src/components/ui/FormField.tsx

interface FormFieldProps {
  label: string
  /** 字段说明文字（显示在 label 下方） */
  hint?: string | ReactNode
  /** 错误信息 */
  error?: string
  /** 错误对应的解决方案 */
  solution?: string | ReactNode  // 可包含超链接：`余额不足，先去<Link>充值</Link>`
  /** 是否必需 */
  required?: boolean
  children: ReactNode
  className?: string
}
```

渲染效果：
```
  厂商名称 *
  ┌──────────────────────────────┐
  │                              │
  └──────────────────────────────┘
  💡 必填项，建议使用英文或拼音命名

  厂商名称 *
  ┌──────────────────────────────┐
  │                              │  ← 红色边框
  └──────────────────────────────┘
  ⚠️ 厂商名称已存在                ← 红色文字
  🔧 请使用其他名称，或先禁用现有厂商后再创建   ← 蓝色解决方案文字
```

### `useFormError` — 错误转换 Hook

```typescript
// 文件：web/src/hooks/use-form-error.ts

interface FieldError {
  field: string
  message: string
  solution: string
}

// API 错误 → 字段级错误映射
const ERROR_SOLUTIONS: Record<string, (msg: string) => FieldError> = {
  '23505': (msg) => ({
    field: 'name',
    message: '名称已存在',
    solution: '请使用其他名称，或先禁用现有记录后再创建',
  }),
  '23503': () => ({
    field: 'vendorId',
    message: '关联的厂商不存在',
    solution: '请先创建厂商，再创建模型映射',
  }),
  'BALANCE_INSUFFICIENT': () => ({
    field: 'balance',
    message: '余额不足',
    solution: '请先去<a href="/recharge">充值中心</a>充值再继续操作',
  }),
  'RATE_LIMIT_EXCEEDED': () => ({
    field: 'rpm',
    message: '限流值超过上限',
    solution: 'RPM 上限为 10000，请输入 10000 以下的值',
  }),
  'INVALID_FORMAT': (msg) => ({
    field: 'apiKey',
    message: msg,
    solution: 'API Key 格式不正确，应为 sk- 开头的 32-128 位字符串',
  }),
}

function useFormError(error: ApiError | null) {
  const fieldErrors = useMemo(() => {
    if (!error) return {}
    const handler = ERROR_SOLUTIONS[error.code]
    if (handler) {
      const fe = handler(error.message)
      return { [fe.field]: { message: fe.message, solution: fe.solution } }
    }
    return {}
  }, [error])
  
  return {
    fieldErrors,           // Record<string, { message: string; solution: string }>
    globalError:           // 无对应 field 的错误信息
      Object.keys(fieldErrors).length === 0 ? error?.message : null,
  }
}
```

---

## 3. 各页面错误映射表

需覆盖 100+ 表单场景，以下是核心场景清单：

| 业务场景 | 错误码/条件 | 错误提示 | 解决方案 |
|----------|------------|----------|---------|
| 创建厂商 - 名称为空 | 400 | `名称不能为空` | 请输入厂商名称，建议使用英文 |
| 创建厂商 - 名称重复 | 409 / 23505 | `厂商名称已存在` | 请使用其他名称，或先禁用该厂商 |
| 创建厂商 - URL 格式错 | 400 | `URL 格式不正确` | 请输入有效的 URL，如 `https://api.example.com` |
| 创建模型 - 名称重复 | 409 | `模型名称已存在` | 请使用其他名称，或先禁用该模型 |
| 创建 API Key - 空名称 | 400 | `密钥名称不能为空` | 请输入一个有意义的名称，如"生产环境 Key" |
| 充值审核 - 金额超限 | 400 | `单笔充值金额不能超过 ¥100,000` | 如需充值更大金额，请联系客服分批充值 |
| 提现 - 余额不足 | 400 | `可提现余额不足` | 当前可提现余额 ¥X，请修改提现金额 |
| 提现 - 未实名 | 403 | `未完成实名认证` | 请先去<a href="/real-name">实名认证</a>页面完成认证 |
| 限流配置 - RPM 超标 | 400 | `RPM 不能超过 10000` | RPM 上限为 10000，请输入 10000 以下的值 |
| 模型定价 - 过高 | 400 | `售价不能超过成本价的 10 倍` | 建议售价为成本的 1.5-3 倍 |
| 角色创建 - 权限不足 | 403 | `权限不足` | 当前角色无法分配此权限，请联系超级管理员 |
| 批量操作 - 无选中 | 400 | `至少选择一个项目` | 请在列表中勾选至少一个项目后再执行操作 |
| 登录 - 密码错误 | 401 | `邮箱或密码不正确` | 忘记密码？<a href="/forgot-password">点击重置</a> |
| 登录 - 账号锁定 | 423 | `账号已被锁定` | 15 分钟后自动解锁，或<a href="/forgot-password">重置密码</a>立即解锁 |

---

## 4. ErrorBoundary 升级

```tsx
// 文件：web/src/components/ErrorBoundary.tsx（升级版）

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  // 根据错误类型展示不同 UI
  if (error.name === 'ChunkLoadError') {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <RefreshCw className="w-12 h-12 text-slate-400" />
        <h2 className="text-lg font-semibold mt-4">页面加载失败</h2>
        <p className="text-slate-500 mt-2">可能是新版本已发布</p>
        <button onClick={() => window.location.reload()}>
          刷新页面
        </button>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col items-center justify-center p-12">
      <AlertTriangle className="w-12 h-12 text-orange-400" />
      <h2 className="text-lg font-semibold mt-4">页面渲染异常</h2>
      <p className="text-slate-500 mt-2">
        发生错误：{error.message}
      </p>
      <div className="flex gap-3 mt-4">
        <button onClick={resetErrorBoundary}>重试</button>
        <button onClick={() => window.location.href = '/admin'}>返回首页</button>
        <button onClick={() => navigator.clipboard.writeText(error.stack)}>
          复制错误信息（反馈给管理员）
        </button>
      </div>
    </div>
  )
}
```

---

## 5. 数据库/后端改动

**后端新增错误码映射端点**（可选，降低前端硬编码维护成本）：

```typescript
GET /api/v1/admin/error-solutions
Response: {
  solutions: Record<string, { message: string; solution: string }>
}
```

前端启动时拉取，合并到 `useFormError` 的映射表中。
不建议强依赖此接口（缓存失败时降级到内置映射）。

---

## 6. 验收标准

- [ ] 每个表单字段展示 inline hint（新建/编辑弹窗）
- [ ] 服务器错误返回后，字段下方显示红字错误 + 蓝字解决方案
- [ ] 全局错误（如 500）展示统一的 ErrorFallback UI
- [ ] 错误解决方案中的超链接可点击跳转
- [ ] ErrorBoundary 捕获 chunk 加载失败（新版本发布场景）
- [ ] 100+ 表单场景的错误映射全部覆盖
