# Phase 1: 7项文档修正脚本
Write-Host "=== Phase 1: 文档修正开始 ===" -ForegroundColor Green

# ========== Issue 1: §9 合并到 §29 ==========
Write-Host "[1/7] §9 合并到 §29..." -ForegroundColor Yellow

# SPEC-§9 标记为废弃，增加跳转指引
$spec9 = Get-Content -Path "docs/SPEC-§9-财务模块增强.md" -Raw
$spec9 = "# 功能说明书：§9 财务模块增强（已废弃）`n`n" + @"
> ⚠️ **此文档已废弃**，§9 全部功能已合并到 §29 资金与对账管理。
>
> 具体对应关系：
> - 9.1 财务总账（科目余额表） → 29.1 平台资金流水（platform_ledger 替代 finance_ledger_snapshots）
> - 9.2 月度财务报告 → 29.5 资金报表中心（月报部分）
> - 9.3 财务日报自动推送 → 29.5 资金报表中心（日报部分）
> - 9.4 授信额度体系 → 29.6 违约金与逾期管理（配套功能）
> - 9.5 退款自动化（含佣金扣回）→ 保留为独立功能
> - 9.6 税票统计看板 → 独立功能，维持不变
>
> **请参考**：[`SPEC-§29-资金与对账管理.md`](SPEC-§29-资金与对账管理.md)

"@ + @"

## 子模块迁移对照表

| §9 旧模块 | §29 新位置 | 核心变更 |
|-----------|-----------|---------|
| 9.1 财务总账（科目余额表） | 29.1 平台资金流水 + §29 财务看板 | finance_ledger_snapshots → platform_ledger（逐笔流水聚合查询），删除双写方案 |
| 9.2 月度财务报告 | 29.5 资金报表中心 | 合并日报/周报/月报统一管理 |
| 9.3 财务日报自动推送 | 29.5 资金报表中心 | 统一推送配置 |
| 9.4 授信额度体系 | 29.6 违约金与逾期管理 | 新增逾期管理配套功能 |
| 9.5 退款自动化 | 独立模块 | 保留 §9.5 规格不变 |
| 9.6 税票统计看板 | 独立模块 | 保留 §9.6 规格不变 |

## 数据表变更

**删除表（不再创建）：**
```sql
-- finance_ledger_snapshots — 每日财务快照表（废弃，由 platform_ledger 替代）
```

**使用表：**
- `platform_ledger`（§29.1 定义）— 逐笔流水作为唯一资金来源
- 科目余额汇总通过 `SELECT type, SUM(amount) FROM platform_ledger GROUP BY type` 查询

"@
Set-Content -Path "docs/SPEC-§9-财务模块增强.md" -Value $spec9 -Encoding UTF8
Write-Host "  ✓ SPEC-§9 已标记为废弃" -ForegroundColor Green

# ========== Issue 2: 预算熔断 vs 限流优先级 ==========
Write-Host "[2/7] 预算熔断 vs 限流优先级..." -ForegroundColor Yellow

# 更新 SPEC-§20
$spec20 = Get-Content -Path "docs/SPEC-§20-用户端安全与预算增强.md" -Raw
# 替换限流和预算的优先级说明
$spec20 = $spec20 -replace '(?s)(预算检查.*?)(?=费率限制|限流)', '预算检查（budget_check）→ 在请求处理管道中优先于费率限制执行。当用户余额/预算不足时，直接返回 QUOTA_EXCEEDED 错误码，不再继续执行费率限制检查。'
$spec20 = $spec20 -replace '(?s)(费率限制.*?)(?=熔断|熔断.*?预算)', '费率限制（rate_limiting）→ 在预算检查之后执行。仅当预算/余额充足时才进行速率检查。超限时返回 RATE_LIMITED 错误码。当预算熔断激活后，跳过费率限制直接拒绝请求。'
Set-Content -Path "docs/SPEC-§20-用户端安全与预算增强.md" -Value $spec20 -Encoding UTF8
Write-Host "  ✓ SPEC-§20 更新预算优先级" -ForegroundColor Green

# ========== Issue 3: 2FA + 二次确认分层定义 ==========
Write-Host "[3/7] 2FA + 二次确认分层定义..." -ForegroundColor Yellow

# 更新 SPEC-§20 中的 2FA 章节
$spec20 = Get-Content -Path "docs/SPEC-§20-用户端安全与预算增强.md" -Raw
# 增加分层定义段落
$2faSection = @"

---

## 2FA 认证与二次确认分层定义

### 分层规则

| 层级 | 操作类型 | 认证要求 | 说明 |
|------|---------|---------|------|
| L1 | 登录认证 | 2FA 仅 | 用户名+密码+OTP（TOTP 或短信） |
| L2 | 敏感读取操作 | 2FA 仅 | 查看 API Key 明文、查看财务详情 |
| L3 | 写操作 | 2FA + 二次确认 | 提现、修改安全设置、删除 Key、大额充值操作 |
| L4 | 高风险操作 | 2FA + 二次确认 + 冷却期 | 注销账号、变更手机号/邮箱 |

### 开关机制（AND 逻辑）

```
系统级开关（require_2fa）:
  [ON/OFF] — site_configs 配置，决定系统是否开启 2FA 要求

用户级开关（user_2fa_enabled）：
  [ON/OFF] — 用户在个人设置中开启自己的 2FA

启用条件：系统开关 ON AND 用户开关 ON（AND 逻辑）
效果：两个开关同时启用时才强制 2FA
```

### 二次确认（Double-Confirm）

写操作时，在 2FA 认证通过后，额外弹窗要求用户再次确认操作详情和风险提示。适用于：

- 提现操作：显示金额、收款账号、手续费 → 用户确认
- API Key 删除：显示 Key 别名和影响范围 → 用户确认
- 安全设置变更：显示变更前后对比 → 用户确认

### 数据库变更

```typescript
// site_configs 新增
require2fa: boolean("require_2fa").default(false);  // 系统级 2FA 开关

// users 表新增
user2faEnabled: boolean("user_2fa_enabled").default(false);  // 用户级 2FA 开关

// security_logs 新增字段
confirmType: varchar("confirm_type", { length: 20 });  // '2fa_only' | '2fa_double'
confirmedAt: timestamp("confirmed_at", { withTimezone: true });
```
"@

# 追加到文件末尾 2FA 相关章节之后（在文件末尾之前）
$spec20 = $spec20 -replace '(?s)(## 22\.1.*?)(?=## 23)', '$1' + $2faSection + '`n`n'
# 更简单的方式：追加到文件末尾的 [?] 帮助之前
$idx = $spec20.LastIndexOf("### [?] 页面帮助")
if ($idx -gt 0) {
    $spec20 = $spec20.Substring(0, $idx) + $2faSection + "`n`n" + $spec20.Substring($idx)
}
Set-Content -Path "docs/SPEC-§20-用户端安全与预算增强.md" -Value $spec20 -Encoding UTF8
Write-Host "  ✓ SPEC-§20 更新 2FA 分层定义" -ForegroundColor Green

# ========== Issue 4: 提现二审角色可配置 ==========
Write-Host "[4/7] 提现二审角色可配置..." -ForegroundColor Yellow

# 更新 SPEC-§29 提现二审相关
$spec29 = Get-Content -Path "docs/SPEC-§29-资金与对账管理.md" -Raw
# 增加配置说明
$roleConfig = @"

### 提现二审角色配置

通过 `site_configs.withdraw_second_review_role` 配置，决定提现二审由哪个角色执行：

| 配置值 | 角色 | 说明 |
|-------|------|------|
| `agent_mgr` | 代理管理岗 | 默认值，由代理管理员二审 |
| `operator` | 运营岗 | 由运营人员二审 |

**配置项：** `site_configs.withdraw_second_review_role`

```typescript
// site_configs 表新增字段
withdrawSecondReviewRole: varchar("withdraw_second_review_role", { length: 20 }).default("agent_mgr");
// 可选值: 'agent_mgr' | 'operator'
```

**权限矩阵影响：** 当 `withdraw_second_review_role = 'operator'` 时，运营角色获得提现二审权限（`withdraw:second_review`）。

**流程图对应：** 泳道图 2（代理提现双审流程）中的"复审审核员"角色根据此配置动态变化。
"@
$idx29 = $spec29.LastIndexOf("### [?] 按钮级帮助对照表")
if ($idx29 -gt 0) {
    $spec29 = $spec29.Substring(0, $idx29) + $roleConfig + "`n`n" + $spec29.Substring($idx29)
}
Set-Content -Path "docs/SPEC-§29-资金与对账管理.md" -Value $spec29 -Encoding UTF8
Write-Host "  ✓ SPEC-§29 更新提现二审角色配置" -ForegroundColor Green

# ========== Issue 5: 流程图一致性验证 ==========
Write-Host "[5/7] 流程图一致性验证..." -ForegroundColor Yellow

# 更新所有 SPEC 验收标准 - 增加流程图一致性检查
$specFiles = Get-ChildItem "docs/SPEC-§*.md" | Where-Object { $_.Name -ne "SPEC-§9-财务模块增强.md" }
foreach ($f in $specFiles) {
    $content = Get-Content -Path $f.FullName -Raw
    if ($content -notmatch "流程图一致性校验") {
        $content = $content -replace '(?s)(验收标准[\s\S]*?)(?=(?:---|### |\[?\])|$)', @"
### 验收标准

#### □ 流程图一致性校验 — 与对应流程图对比验证流程分支、异常处理、决策节点完全一致

"@
        Set-Content -Path $f.FullName -Value $content -Encoding UTF8
        Write-Host "  ✓ $($f.Name) 增加流程图校验" -ForegroundColor Green
    }
}
Write-Host "  ✓ 流程图校验已添加" -ForegroundColor Green

# ========== Issue 6: SPEC 批量补 [?] ==========
Write-Host "[6/7] SPEC 批量补 [?] 帮助说明..." -ForegroundColor Yellow

$helpSection = @"

### [?] 页面帮助

**页面名称**：{PAGE_NAME}

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 {PAGE_NAME} 相关的配置、查询和管理能力。

**核心操作**：
1. 查看列表 / 详情
2. 创建 / 编辑 / 删除条目
3. 筛选 / 搜索 / 导出

**注意事项**：
- 部分操作涉及敏感数据，需二次确认或 2FA 身份验证
- 操作记录会写入操作日志

**常见问题**：
Q: 为什么某些操作不可用？
A: 请检查当前账号的权限角色是否包含对应操作权限。

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |
"@

$specFiles = Get-ChildItem "docs/SPEC-§*.md"
foreach ($f in $specFiles) {
    $content = Get-Content -Path $f.FullName -Raw
    if ($content -notmatch '\?\].*页面帮助') {
        $pageName = "功能说明书：" + ($f.BaseName -replace 'SPEC-§', '§' -replace '-', ' ')
        $section = $helpSection -replace '{PAGE_NAME}', $pageName
        $content = $content.TrimEnd() + "`n`n---`n" + $section
        Set-Content -Path $f.FullName -Value $content -Encoding UTF8
        Write-Host "  ✓ $($f.Name) 补充 [?] 帮助" -ForegroundColor Green
    } else {
        Write-Host "  - $($f.Name) 已有 [?]，跳过" -ForegroundColor Gray
    }
}

# ========== Issue 7: 已在上层完成（PRD-README 重写）==========
Write-Host "[7/7] PRD-README 索引表 — 已在上层完成" -ForegroundColor Green

Write-Host "=== Phase 1 完成 ===" -ForegroundColor Green
