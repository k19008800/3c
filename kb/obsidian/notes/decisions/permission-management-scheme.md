---
title: "Permission Management Scheme"
date: 2026-07-25
tags: [arch-decision]
---
# 3cloud 权限管理方案

> 基于现有的 Bitset 权限系统，面向未来扩展。

---

## 一、当前权限模型（已实现）

### 权限定义（64-bit BigInt）

在 `middleware/auth.ts` 中定义了 27 个权限位，覆盖：
- **仪表盘**: `DASHBOARD_VIEW`
- **用户管理**: `USER_LIST / VIEW / EDIT / CREATE / DELETE / RESET_PWD / CHANGE_ROLE / BALANCE / IMPERSONATE`
- **实名审核**: `REVIEW_LIST / REVIEW_ACTION`
- **模型管理**: `MODEL_MANAGE`
- **代理商**: `AGENT_LIST / AGENT_MANAGE`
- **财务管理**: `FINANCE_VIEW / FINANCE_COMMISSION / FINANCE_WITHDRAW / FINANCE_RECHARGE`
- **对账报表**: `RECONCILIATION_VIEW`
- **系统配置**: `CONFIG_VIEW / CONFIG_EDIT`
- **安全**: `SECURITY_VIEW / SECURITY_ACTION`
- **审计**: `AUDIT_VIEW`
- **日志**: `LOG_VIEW`
- **运维**: `OPS_READ`

### 角色-权限映射（已实现）

| 角色 | 类型 | 权限范围 |
|------|------|---------|
| `super_admin` | 系统预设 | 全部权限 `~0n` |
| `admin` | 系统预设 | 用户管理 + 实名审核 + 模型 + 代理商 + 财务 + 对账 + 系统配置 + 安全 + 审计 + 日志 |
| `finance_ops` | 系统预设 | 仅财务相关（工作台/佣金/提现/充值/对账）+ 用户查看 |
| `ops` | 系统预设 | 基础运维（仪表盘/用户查看/审核查看/日志/模型/代理商） |
| `support` | 系统预设 | 客服（用户列表/查看/重置密码/审核/日志） |
| `auditor` | 系统预设 | 审计（审计日志 + 对账报表） |
| `user` | 终端用户 | 无管理权限 |
| `agent` | 代理商 | 无管理权限 |

---

## 二、已修复的内容（本次）

### 1. admin 角色补全缺失权限

```typescript
// 已添加：
USER_CHANGE_ROLE    // 变更用户角色
USER_IMPERSONATE    // 模拟登录
USER_BALANCE        // 手动调余额
FINANCE_VIEW        // 财务工作台
FINANCE_COMMISSION  // 佣金流水
FINANCE_WITHDRAW    // 提现管理
FINANCE_RECHARGE    // 充值订单
RECONCILIATION_VIEW // 对账报表
CONFIG_EDIT         // 编辑系统配置
```

### 2. 前端导航栏菜单与权限对齐

前端 `Sidebar.tsx` 的菜单项按角色过滤。对于有权限但角色不匹配的管理员，菜单不可见。

---

## 三、权限管理增强建议（后续实施）

### 方案 1：后台角色管理页面（推荐）

**实现路径**：
1. 新建 `roles` 表（支持自定义角色）
   ```sql
   roles: id, name, description, permissions(bigint), isSystem(boolean)
   ```
2. 新建 `user_roles` 关联表（用户可拥有多个角色，取并集）
   ```sql
   user_roles: userId, roleId
   ```
3. 管理后台增加"角色管理"页面
   - 列表展示所有角色（系统角色 + 自定义角色）
   - 编辑角色时以**复选框**展示所有权限位
   - 分配角色到用户（在用户详情页）

**修改范围**：
- 后端：新增 `roles` / `user_roles` 表 + CRUD API → 约 2-3 天
- 前端：角色管理页面 + 用户分配角色交互 → 约 1-2 天

### 方案 2：权限异常检测

在审计日志中增加"权限拒绝"事件记录（已有 `permission_denied` action），可分析：
- 哪些用户频繁尝试越权操作
- 角色权限配置是否合理（哪些权限被高频访问但缺权限）

---

## 四、权限检查清单

每次新增功能时需同步检查：

- [ ] 新增 API 是否需要权限校验
- [ ] 是否需要在 `Perm` 中新增权限位
- [ ] 哪些角色应该拥有该权限
- [ ] 前端菜单是否需要加入新路由
- [ ] 前端菜单的角色过滤是否同步更新
