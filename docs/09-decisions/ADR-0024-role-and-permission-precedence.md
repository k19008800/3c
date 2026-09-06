# ADR-0024：角色枚举与权限 grant/deny 优先级

- 状态：accepted
- 决策日期：2026-08-29
- 生效版本：v1.0.0
- 决策来源：BOSS 对 `open-issues.md` 项 5 的确认
- 关联 ADR：ADR-0004

## 背景
既有资料对 `admin` 与 `super_admin` 的标签和权限边界不一致，同时未冻结显式 grant、deny、角色并集和管理员强制策略的计算优先级。

## 决策
- 当前正式角色仅保留：`customer`、`agent`、`sales`、`admin`、`super_admin`。
- `super_admin` 为最高权限；`admin` 不包含角色管理权限；其他角色按既定业务域使用。
- `finance_ops`、`ops`、`support`、`auditor` 等不是当前数据库角色枚举；未来启用必须另行 ADR 和迁移。
- 权限计算优先级为：显式 `deny` > 管理员强制策略 > 显式 `grant` > 角色权限并集 > 默认最小权限。
- 多角色权限先取并集，最终按 deny 优先；无明确授权默认拒绝。
- 前端展示必须与后端 effective permission 一致；缓存仅作加速，权限变更必须失效。
- `super_admin` 的 `*` 仅由统一权限守卫解释；最后一个 `super_admin` 不得删除、降权或锁定。
- 权限变更不追溯已完成资金记录；权限拒绝统一返回 HTTP 403 `PERMISSION_DENIED`。

## 影响与迁移
更新角色数据字典、权限 SPEC/API/ARCH、前端标签、权限缓存和组合矩阵测试；将非 canonical 角色移出当前枚举并标为 planned；统一 grant/deny 计算、最后一个 super_admin 保护和拒绝响应。

## 关联文件
- `docs/06-data-and-architecture/permissions-and-authorization.md`
- `docs/00-index/glossary.md`
- `docs/00-index/open-issues.md`
- `audit/08-deployment/document-decision-log.md#dec-024`
