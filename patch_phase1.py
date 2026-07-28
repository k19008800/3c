#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 1: 7 项文档修正"""
import os, re, glob, sys
sys.stdout.reconfigure(encoding='utf-8')

os.chdir(os.path.join(os.path.dirname(__file__), "docs"))
print("=== Phase 1: 文档修正开始 ===")

# ========== Issue 1: SPEC-§9 标记为废弃，指向 §29 ==========
print("[1/7] §9 -> §29 合并...")

spec9_content = """# 功能说明书：§9 财务模块增强（已废弃）

> **此文档已废弃**，§9 全部功能已合并到 §29 资金与对账管理。
>
> 具体对应关系：
> - 9.1 财务总账（科目余额表） -> 29.1 平台资金流水（platform_ledger 替代 finance_ledger_snapshots）
> - 9.2 月度财务报告 -> 29.5 资金报表中心（月报部分）
> - 9.3 财务日报自动推送 -> 29.5 资金报表中心（日报部分）
> - 9.4 授信额度体系 -> 29.6 违约金与逾期管理（配套功能）
> - 9.5 退款自动化（含佣金扣回）-> 保留为独立功能
> - 9.6 税票统计看板 -> 独立功能，维持不变
>
> **请参考**：[`SPEC-§29-资金与对账管理.md`](SPEC-§29-资金与对账管理.md)

## 子模块迁移对照表

| §9 旧模块 | §29 新位置 | 核心变更 |
|-----------|-----------|---------|
| 9.1 财务总账（科目余额表） | 29.1 平台资金流水 | finance_ledger_snapshots -> platform_ledger（逐笔流水聚合查询），删除双写方案 |
| 9.2 月度财务报告 | 29.5 资金报表中心 | 合并日报/周报/月报统一管理 |
| 9.3 财务日报自动推送 | 29.5 资金报表中心 | 统一推送配置 |
| 9.4 授信额度体系 | 29.6 违约金与逾期管理 | 新增逾期管理配套功能 |
| 9.5 退款自动化 | 独立模块 | 保留 §9.5 规格不变 |
| 9.6 税票统计看板 | 独立模块 | 保留 §9.6 规格不变 |

## 数据表变更

**删除表（不再创建）：**
```sql
-- finance_ledger_snapshots -- 每日财务快照表（废弃，由 platform_ledger 替代）
```

**使用表：**
- `platform_ledger`（§29.1 定义）-- 逐笔流水作为唯一资金来源
- 科目余额汇总通过 `SELECT type, SUM(amount) FROM platform_ledger GROUP BY type` 查询
"""
with open("SPEC-§9-财务模块增强.md", "w", encoding="utf-8") as f:
    f.write(spec9_content)
print("  [OK] SPEC-§9 已标记为废弃并指向 §29")

# ========== Issue 2: 预算熔断 vs 限流优先级 ==========
print("[2/7] 预算熔断 vs 限流优先级...")

with open("SPEC-§20-用户端安全与预算增强.md", "r", encoding="utf-8") as f:
    spec20 = f.read()

budget_note = """
### 预算检查与速率限制优先级

**执行顺序：预算检查 -> 速率限制**

1. **预算检查（budget_check）**：在请求处理管道中优先于费率限制执行。当用户余额/预算不足时，直接返回 `QUOTA_EXCEEDED` 错误码，不再继续执行费率限制检查。
2. **速率限制（rate_limiting）**：在预算检查之后执行。仅当预算/余额充足时才进行速率检查。超限时返回 `RATE_LIMITED` 错误码。

**熔断联动：** 当预算熔断激活（budget_meltdown 状态）后，跳过速率限制直接拒绝所有请求并返回 `QUOTA_EXCEEDED`。
"""

# 插入到熔断机制之前
insert_pos = spec20.find("### 熔断机制")
if insert_pos > 0:
    spec20 = spec20[:insert_pos] + budget_note + "\n\n" + spec20[insert_pos:]
else:
    spec20 += "\n\n---\n" + budget_note

code_note = """
| 错误码 | 含义 | 触发条件 |
|--------|------|---------|
| `QUOTA_EXCEEDED` | 预算/配额不足 | 用户余额或预算熔断激活 |
| `RATE_LIMITED` | 请求频率超限 | 速率限制器检测到超频 |
"""
insert_pos2 = spec20.find("### 错误码")
if insert_pos2 > 0:
    spec20 = spec20[:insert_pos2] + code_note + "\n" + spec20[insert_pos2:]
else:
    spec20 += "\n" + code_note

with open("SPEC-§20-用户端安全与预算增强.md", "w", encoding="utf-8") as f:
    f.write(spec20)
print("  [OK] SPEC-§20 更新预算优先级和错误码区分")

# ========== Issue 3: 2FA + 二次确认分层定义 ==========
print("[3/7] 2FA + 二次确认分层定义...")

with open("SPEC-§20-用户端安全与预算增强.md", "r", encoding="utf-8") as f:
    spec20 = f.read()

fa_section = """

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
  [ON/OFF] -- site_configs 配置，决定系统是否开启 2FA 要求

用户级开关（user_2fa_enabled）：
  [ON/OFF] -- 用户在个人设置中开启自己的 2FA

启用条件：系统开关 ON AND 用户开关 ON（AND 逻辑）
效果：两个开关同时启用时才强制 2FA
```

### 二次确认（Double-Confirm）

写操作时，在 2FA 认证通过后，额外弹窗要求用户再次确认操作详情和风险提示。适用于：

- 提现操作：显示金额、收款账号、手续费 -> 用户确认
- API Key 删除：显示 Key 别名和影响范围 -> 用户确认
- 安全设置变更：显示变更前后对比 -> 用户确认

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
"""

idx_help = spec20.find("### [?] 页面帮助")
if idx_help > 0:
    spec20 = spec20[:idx_help] + fa_section + "\n\n" + spec20[idx_help:]
else:
    spec20 += fa_section

with open("SPEC-§20-用户端安全与预算增强.md", "w", encoding="utf-8") as f:
    f.write(spec20)
print("  [OK] SPEC-§20 更新 2FA 分层定义")

# ========== Issue 4: 提现二审角色可配置 ==========
print("[4/7] 提现二审角色可配置...")

with open("SPEC-§29-资金与对账管理.md", "r", encoding="utf-8") as f:
    spec29 = f.read()

role_config = """
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
"""

idx_btn = spec29.find("### [?] 按钮级帮助对照表")
if idx_btn > 0:
    spec29 = spec29[:idx_btn] + role_config + "\n\n" + spec29[idx_btn:]
else:
    spec29 += role_config

with open("SPEC-§29-资金与对账管理.md", "w", encoding="utf-8") as f:
    f.write(spec29)
print("  [OK] SPEC-§29 更新提现二审角色配置")

# ========== Issue 5: 流程图一致性验证 ==========
print("[5/7] 流程图一致性验证...")

spec_files = sorted(glob.glob("SPEC-§*.md"))
count_check = 0
for fpath in spec_files:
    if "§9" in fpath:
        with open(fpath, encoding="utf-8") as f:
            first = f.read(300)
            if "已废弃" in first or "废弃" in first:
                continue
    with open(fpath, "r+", encoding="utf-8") as f:
        content = f.read()
        if "流程图一致性校验" not in content:
            content = content.replace(
                "### 验收标准",
                "### 验收标准\n\n#### □ 流程图一致性校验 -- 与对应流程图对比验证流程分支、异常处理、决策节点完全一致"
            )
            f.seek(0)
            f.write(content)
            f.truncate()
            count_check += 1

print(f"  [OK] 已为 {count_check} 个 SPEC 增加流程图校验条目")

# ========== Issue 6: SPEC 批量补 [?] ==========
print("[6/7] SPEC 批量补 [?]...")

help_template = """

---

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
"""

count_help = 0
for fpath in spec_files:
    with open(fpath, "r+", encoding="utf-8") as f:
        content = f.read()
        if "[?] 页面帮助" not in content:
            base = os.path.splitext(os.path.basename(fpath))[0]
            name_parts = base.replace("SPEC-§", "§").split("-")
            page_name = "功能说明书：" + " ".join(name_parts)
            section = help_template.replace("{PAGE_NAME}", page_name)
            f.write(section)
            count_help += 1

print(f"  [OK] 已为 {count_help} 个 SPEC 补充 [?] 帮助说明")

print()
print("=== Phase 1 完成 ===")
print(f"处理统计：废弃 SPEC-§9，更新 SPEC-§20/§29 内容，{count_check} 个增加流程校验，{count_help} 个补充帮助说明")
