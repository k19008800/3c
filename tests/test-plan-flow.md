# 3cloud 用户行为测试方案

> **目标**: 模拟真实用户行为链，生成完整的"注册→调用→计费"数据  
> **上次验证的缺口**: ⚠️ 只读了现有数据，未产生新用户、新调用日志

---

## 一、问题根因分析

| 问题 | 根因 | 影响 |
|------|------|------|
| 用户数未增加 | 验证计划模块 2.1 未勾选——未调用 `POST /api/v1/auth/register` | 测试未覆盖注册流程 |
| 今日无调用日志 | 验证只调了 `POST /v1/chat/completions`（无 API Key → 401 正确拦截）未完成"创建 Key→调用"全流程 | 调用日志模块只验证了已有 seed 数据 |
| 余额流水无今日记录 | 没有实际调用就没有扣费，没有充值就没有入账 | 时序验证缺失 |

**核心结论**: 上次验证是**只读验证**（SELECT + GET 端点检查），不是**行为驱动验证**。

---

## 二、行为链设计

```
┌─────────────────────────────────────────────────────────┐
│                    用户注册（注册新账号）                     │
│  POST /api/v1/auth/register                             │
│  → 生成新用户记录 (users表)                               │
│  → 发送验证邮件 (notifications表)                         │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                    邮箱验证（如需要）                       │
│  POST /api/v1/auth/verify-email                         │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                    登录 + 实名                           │
│  POST /api/v1/auth/login                                │
│  POST /api/v1/auth/real-name/personal                   │
│  → 生成实名审核记录 (user_real_name_reviews表)            │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                    创建 API Key                          │
│  POST /api/v1/api-keys                                  │
│  → 生成 api_keys 记录                                   │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                🔥 代理调用（核心数据生成）                  │
│  POST /v1/chat/completions (Authorization: Bearer $KEY) │
│  → 生成 call_logs 记录  ⭐                            │
│  → 生成 balance_ledger 扣费记录  ⭐                    │
│  → 不修改余额（需要上游厂商响应才会实际扣费）              │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│                    充值与提现                             │
│  POST /api/v1/billing/recharge                          │
│  → 生成 recharge_orders 记录                             │
│  POST /api/v1/agent/withdraw                            │
│  → 生成 withdraw_orders 记录                             │
└─────────────────────────────────────────────────────────┘
```

---

## 三、测试用户矩阵

| 批次 | 邮箱 | 密码 | 角色目标 | 用途 | 预期生成数据 |
|------|------|------|---------|------|-----------|
| T1 | test-register-a@3cloud.dev | TestPass123! | 普通用户 | 基本注册+调用 | 1 user + N 条 call_logs |
| T2 | test-register-b@3cloud.dev | TestPass456! | 普通用户 | 注册+调用+充值 | 1 user + call_logs + 充值单 |
| T3 | test-register-c@3cloud.dev | TestPass789! | 代理商用户 | 注册+实名+调用 | 1 user + 实名审核记录 + call_logs |

---

## 四、调用日志生成原理

### 调用链
```
用户 → POST /v1/chat/completions (Bearer: API Key)
  → 中间件 authenticateApiKey（查 api_keys 表）
  → 中间件 checkRateLimit（Redis 限流）
  → resolveModel（解析模型名）
  → selectRoute（路由选择上游厂商）
  → forwardRequest（转发到上游厂商 API）
  → 上游响应 → charge() 扣费
     → INSERT INTO call_logs
     → INSERT INTO balance_ledger
     → UPDATE users.balance
```

### 关键：即使上游厂商返回错误，call_logs 仍会写入（status=failed）

所以即使厂商 API Key 是假的/失效的，调用也会在 call_logs 表中生成记录，只是 status 为 failed。

### 需要确认的上游依赖

| 厂商 | API Key 状态 | 预期 |
|------|------------|------|
| OpenAI | ? | 需密钥有效才能返回 success |
| DeepSeek | ? | 同上 |
| Anthropic | ? | 同上 |
| 天翼云 | ? | 同上 |

> 如果所有厂商 API Key 都无效，调用日志生成的记录都是 status=failed，但**记录仍然会写**——这已经达到了"生成测试数据"的目标。如果要验证完整计费链路，需要配置有效 API Key。

---

## 五、测试脚本

<details>
<summary>PowerShell 测试脚本（展开查看）</summary>

```powershell
# 3cloud-行为测试.ps1
# 模拟用户行为链：注册 → 登录 → 创建Key → 调用 → 充值 → 提现

$API = "http://localhost:3000"
$Results = @()
$PASS = 0; $FAIL = 0

function Check {
    param($Name, $Expected, $Actual)
    if ($Actual -match $Expected) {
        Write-Host "  ✅ $Name" -ForegroundColor Green
        $script:PASS++
    } else {
        Write-Host "  ❌ $Name" -ForegroundColor Red
        Write-Host "     期望: $Expected"
        Write-Host "     实际: $($Actual.Substring(0, [Math]::Min(300, $Actual.Length)))"
        $script:FAIL++
    }
    $script:Results += @{Name=$Name; Pass=($Actual -match $Expected)}
}

# ── 阶段1: 健康检查 ──
Write-Host "`n═══ 阶段1: 健康检查 ═══" -ForegroundColor Cyan
$r = curl -s "$API/health"
Check "API 存活" '"status":"ok"' $r

# ── 阶段2: 注册新用户 ──
Write-Host "`n═══ 阶段2: 注册新用户 ═══" -ForegroundColor Cyan
$users = @(
    @{email="test-flow-a-$(Get-Date -Format yyyyMMddHHmmss)@3cloud.dev"; pass="TestFlow123!"},
    @{email="test-flow-b-$(Get-Date -Format yyyyMMddHHmmss)@3cloud.dev"; pass="TestFlow456!"},
    @{email="test-flow-c-$(Get-Date -Format yyyyMMddHHmmss)@3cloud.dev"; pass="TestFlow789!"}
)

foreach ($u in $users) {
    $body = "{`"email`":`"$($u.email)`",`"password`":`"$($u.pass)`",`"confirmPassword`":`"$($u.pass)`"}"
    $body | Out-File -Encoding ascii -NoNewline "$env:TEMP\reg-body.json"
    $r = curl -s "$API/api/v1/auth/register" -H "Content-Type: application/json" -d "@$env:TEMP\reg-body.json"
    Check "注册新用户: $($u.email)" '"message"' $r
}

# ── 阶段3: 登录 + 创建 API Key + 调用 ──
Write-Host "`n═══ 阶段3: 登录 → 建Key → 调用 ═══" -ForegroundColor Cyan

# 先以管理员身份获取 token（操作 API Keys）
$adminBody = "{`"email`":`"admin@3cloud.ai`",`"password`":`"Admin1234!`"}"
$adminBody | Out-File -Encoding ascii -NoNewline "$env:TEMP\login-body.json"
$adminLogin = curl -s "$API/api/v1/auth/login" -H "Content-Type: application/json" -d "@$env:TEMP\login-body.json"
$adminToken = ($adminLogin | Select-String '"accessToken":"([^"]+)"').Matches[0].Groups[1].Value
Check "超级管理员登录" '"accessToken"' $adminLogin

foreach ($u in $users) {
    # 3a. 用户登录
    $body = "{`"email`":`"$($u.email)`",`"password`":`"$($u.pass)`"}"
    $body | Out-File -Encoding ascii -NoNewline "$env:TEMP\login-body.json"
    $loginR = curl -s "$API/api/v1/auth/login" -H "Content-Type: application/json" -d "@$env:TEMP\login-body.json"
    $token = ($loginR | Select-String '"accessToken":"([^"]+)"').Matches[0].Groups[1].Value
    Check "用户 $($u.email) 登录" '"accessToken"' $loginR
    if (-not $token) { continue }

    # 3b. 创建 API Key
    $keyName = "test-key-$([System.Guid]::NewGuid().ToString().Substring(0,8))"
    $keyBody = "{`"name`":`"$keyName`",`"model`":`"deepseek-chat`"}"
    $keyBody | Out-File -Encoding ascii -NoNewline "$env:TEMP\key-body.json"
    $keyR = curl -s "$API/api/v1/api-keys" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "@$env:TEMP\key-body.json"
    $apiKey = ($keyR | Select-String '"key":"([^"]+)"').Matches[0].Groups[1].Value
    Check "用户 $($u.email) 创建 API Key" '"key"' $keyR
    if (-not $apiKey) { continue }

    # 3c. 🔥 调用代理（生成 call_logs）
    foreach ($model in @("deepseek-chat", "gpt-4o-mini")) {
        $chatBody = "{`"model`":`"$model`",`"messages`":[{`"role`":`"user`",`"content`":`"Hello, test message at $(Get-Date -Format HH:mm:ss)`"}],`"max_tokens`":10}"
        $chatBody | Out-File -Encoding ascii -NoNewline "$env:TEMP\chat-body.json"
        $callR = curl -s -w "`n%{http_code}" "$API/v1/chat/completions" -H "Content-Type: application/json" -H "Authorization: Bearer $apiKey" -d "@$env:TEMP\chat-body.json"
        $httpCode = $callR.Split("`n")[-1]
        # 即使失败（上游厂商无有效密钥），call_logs 也会记录（status=failed）
        Check "调用 $model：HTTP $httpCode" "[45]0[0-9]" $httpCode
    }
}

# ── 阶段4: 充值流程 ──
Write-Host "`n═══ 阶段4: 充值+提现 ═══" -ForegroundColor Cyan
# 管理员为用户充值
$rechargeBody = "{`"userId`":2,`"amount`":500.00,`"method`":`"manual`",`"remark`":`"测试充值-t$(Get-Date -Format HHmmss)`"}"
$rechargeBody | Out-File -Encoding ascii -NoNewline "$env:TEMP\recharge-body.json"
$r = curl -s "$API/api/v1/admin/finance/recharge" -H "Content-Type: application/json" -H "Authorization: Bearer $adminToken" -d "@$env:TEMP\recharge-body.json"
Check "管理员充值" '"message"' $r

# ── 阶段5: 验证生成的数据 ──
Write-Host "`n═══ 阶段5: 数据验证 ═══" -ForegroundColor Cyan

# 查今天注册的用户数
$date = (Get-Date -Format yyyy-MM-dd)
$sqlUsers = "SELECT COUNT(*) as total FROM users WHERE created_at::date = '$date'"
$sqlCalls = "SELECT COUNT(*) as total, status, COUNT(*) FILTER (WHERE created_at::date = '$date') as today_count FROM call_logs GROUP BY status"
$sqlRecharges = "SELECT COUNT(*) as total FROM recharge_orders WHERE created_at::date = '$date'"

Write-Host "`nSQL 验证 (需在 psql 中执行):"
Write-Host "  今日注册用户: $sqlUsers"
Write-Host "  调用日志(按状态): $sqlCalls"
Write-Host "  今日充值订单: $sqlRecharges"

# ── 总结 ──
Write-Host "`n═══════════════════════════════════" -ForegroundColor Cyan
Write-Host " 测试完成: 通过=$PASS  失败=$FAIL" -ForegroundColor $([System.ConsoleColor]::Yellow)
Write-Host "═══════════════════════════════════" -ForegroundColor Cyan
```
</details>

---

## 六、可验证的数据指标

| 指标 | 阶段 | 验证方式 |
|------|------|----------|
| 新增用户数 ≥ 3 | 阶段2 | `SELECT COUNT(*) FROM users WHERE created_at::date = CURRENT_DATE` |
| 新增 API Key ≥ 3 | 阶段3b | `SELECT COUNT(*) FROM api_keys WHERE created_at::date = CURRENT_DATE` |
| 新增 call_logs ≥ 6 | 阶段3c | `SELECT COUNT(*) FROM call_logs WHERE created_at::date = CURRENT_DATE` |
| call_logs 状态分布 | 阶段3c | `SELECT status, COUNT(*) FROM call_logs GROUP BY status` |
| 新增充值订单 | 阶段4 | `SELECT COUNT(*) FROM recharge_orders WHERE created_at::date = CURRENT_DATE` |
| 新增余额流水 | 阶段3c+4 | `SELECT COUNT(*) FROM balance_ledger WHERE created_at::date = CURRENT_DATE` |
| 新增审计日志 | 全流程 | `SELECT COUNT(*) FROM audit_logs WHERE created_at::date = CURRENT_DATE` |

---

## 七、执行计划

```
1. 确认 API 服务运行（GET /health）
2. 启动测试脚本
3. 查看输出的 call_logs 生成结果
4. psql 执行 SQL 验证新增数据
5. 登录 Web 前端检查新用户/新日志是否可见
```

---

## 八、要点总结

| 对比项 | 上次测试 | 本次方案 |
|--------|---------|---------|
| 方法 | 只读验证（查现有数据） | 行为驱动（模拟用户操作） |
| 用户 | 28 个 seed 数据 | +N 个新注册用户 |
| 调用日志 | 246 条 seed 数据 | +N 条今日实时调用记录 |
| 时间戳 | 全是旧时间 | 全是 `2026-07-02` 时间戳 |
| 覆盖率 | API 端点功能 | 全用户行为链 + 数据流贯通 |
