# Fix Report: L8 — JWT Secret 生产环境硬编码检测

## 问题
`config.ts` 中 `JWT_ACCESS_SECRET` 和 `JWT_REFRESH_SECRET` 的默认值分别为 `"dev-access-secret"` 和 `"dev-refresh-secret"`。开发环境无问题，但生产环境忘记设环境变量时会使用这些不安全的默认值，造成安全风险。

## 修复内容

文件：`api/src/config.ts`

在 `export const config = { ... } as const;` 之后新增了一段生产环境运行时校验：

- 当 `NODE_ENV === "production"` 时，检查 `JWT_ACCESS_SECRET` 是否未设置或等于默认值 `"dev-access-secret"`，如是则 `throw new Error`
- 同理检查 `JWT_REFRESH_SECRET`
- 该校验仅在模块加载时执行一次，不影响运行时性能
- 非 production 环境完全不受影响（开发模式正常使用默认值）

```typescript
// 生产环境强制校验 JWT secret，禁止使用不安全的默认值
if (process.env.NODE_ENV === "production") {
  if (
    !process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET === "dev-access-secret"
  ) {
    throw new Error(
      "JWT_ACCESS_SECRET 未配置，生产环境禁止使用默认值"
    );
  }
  if (
    !process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_REFRESH_SECRET === "dev-refresh-secret"
  ) {
    throw new Error(
      "JWT_REFRESH_SECRET 未配置，生产环境禁止使用默认值"
    );
  }
}
```

## 验证结果

### 场景 1：生产环境 + 默认 secret → 预期抛错 ✅

```powershell
$env:NODE_ENV="production"
$env:JWT_ACCESS_SECRET="dev-access-secret"
# 启动后立即抛出
```

实际输出：
```
Error: JWT_ACCESS_SECRET 未配置，生产环境禁止使用默认值
    at <anonymous> (src/config.ts:81:11)
```

### 场景 2：生产环境 + 自定义 secret → 正常启动 ✅

```powershell
$env:NODE_ENV="production"
$env:JWT_ACCESS_SECRET="myAccessSecret123"
$env:JWT_REFRESH_SECRET="myRefreshSecret456"
```

输出：
```
OK
```

### 场景 3：开发环境（默认）→ 正常启动 ✅

```powershell
# 不设 NODE_ENV（或设为 development），不用设 JWT secret
```

输出：
```
OK
```

开发模式正常使用默认 secret，不受影响。

## 影响范围

- 仅新增 1 段独立校验逻辑，无其他代码变更
- 不影响现有 config 的 TypeScript 类型 (`as const` 保留)
- 零运行时开销（校验在模块加载时执行一次）
- 所有原环境变量读取路径保持不变

## 结论

✅ 修复完成，所有验证场景通过。
