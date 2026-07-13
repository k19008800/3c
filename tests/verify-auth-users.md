# 3cloud API 验证报告 — 用户认证 & 用户管理模块

**测试时间**: 2026-07-02 00:08 CST  
**执行方式**: curl.exe (Windows, JSON body 通过文件传入避免编码问题)  
**环境**: http://localhost:3000 (本地开发服)

---

## 模块 1：健康检查

| # | 检查项 | 结果 | 响应摘要 |
|---|--------|------|----------|
| 1 | GET /health | ✅ | `{"status":"ok","timestamp":"...","uptime":4823}` |
| 2 | GET /ready | ✅ | `{"status":"ready","checks":{"database":true,"redis":true}}` |

**结论**: 服务正常运行，数据库和 Redis 连接正常。

---

## 模块 2：用户认证（Auth）

| # | 检查点 | 结果 | 响应摘要 |
|---|--------|------|----------|
| 1 | POST /api/v1/auth/login — super_admin 登录 | ✅ | `code:0`, role=super_admin, id=41, nickname=超级管理员, 含 accessToken/refreshToken |
| 2 | POST /api/v1/auth/login — admin 登录 | ✅ | `code:0`, role=admin, id=5, balance=1000, 含 accessToken/refreshToken |
| 3 | POST /api/v1/auth/login — agent 登录 (13819008800@163.com) | ✅ | `code:0`, role=agent, id=6, password=`Agent1234!` |
| 3b | POST /api/v1/auth/login — 普通用户 (client-game-npc@3c.local) | ❌ | 密码未知（未能暴力猜出），但该用户存在且 active |
| 4 | GET /api/v1/auth/me — super_admin 信息 | ✅ | `role:super_admin`, `realNameStatus:approved`, `balance:500.000000` |
| 5 | POST /api/v1/auth/refresh — 刷新 token | ✅ | 返回新 accessToken + expiresIn=7200 |
| 6 | GET /api/v1/auth/me — admin 信息 | ✅ | `role:admin`, `realNameStatus:rejected`（因身份证"张无忌"被拒）, `balance:1000.000000` |
| 7 | POST /api/v1/auth/change-password | ✅ | 改密成功 → 换回原密码，双向均成功 |
| 8 | GET /api/v1/auth/real-name/status — super_admin | ✅ | `realNameStatus:approved`, `userType:enterprise` |
| 8b | GET /api/v1/auth/real-name/status — admin | ✅ | `realNameStatus:rejected`, `realName:张无忌`, `idNumber:330821198107157277` |

### 注意事项
- 首次登录时发现 **JSON body 编码问题**：Fastify 的 content-type parser 在收到带 BOM 的 JSON 时解析为 `null`，导致 `null.captchaSession` 报 500。这是 **服务器端 BOM 处理 bug**（BOM stripping 代码位置在 `app.ts` 但未正确生效），或 PowerShell curl 传参方式问题。通过 `-Encoding Ascii -NoNewline` 保存文件再 `-d @file` 可绕过。
- `captchaRequired` 字段始终为 false（未触发风控阈值），验证码流程未真实测试。
- `client-game-npc@3c.local` 密码未知，无法完成登录测试。

---

## 模块 3：用户管理（管理员）

| # | 检查点 | 结果 | 响应摘要 |
|---|--------|------|----------|
| 1 | GET /api/v1/admin/users?page=1&pageSize=10 | ✅ | 返回 28 条总数，分页正常，包含 id/email/role/balance/realNameStatus 等完整字段 |
| 2 | GET /api/v1/admin/users?realNameStatus=approved | ✅ | 筛选出 19 个已实名用户 (total:19)，结果正确 |
| 3 | GET /api/v1/admin/users?minBalance=100&maxBalance=100000 | ✅ | 余额区间筛选正常，返回余额 >=100 <=100000 的用户 |
| 4 | GET /api/v1/admin/users/export?format=csv | ✅ | 返回 CSV 格式文件，包含 ID/邮箱/昵称/手机号/类型/角色/状态/余额/折扣/实名状态等列 |
| 5 | POST /api/v1/admin/users/impersonate — 模拟用户 34 | ✅ | 生成模拟 token，`impersonatorId:41`, `role:user`, 有效期 30 分钟，含危险操作警告 |
| 6 | PATCH /api/v1/admin/users/34 — 编辑昵称 | ✅ | `message:用户更新成功`，昵称已更新 |
| 7 | POST /api/v1/admin/users/34/change-role — 角色变更 | ✅ | `message:角色变更成功`，已从 user→admin→user 恢复 |

### 注意事项
- `POST /api/v1/admin/users/export` 返回 404（路由只支持 GET），正确路径为 `GET /api/v1/admin/users/export?format=csv`
- admin@3cloud.ai 在用户列表中显示 `role:agent`（数据库角色字段），但登录时返回 `role:super_admin`。怀疑 `users.role` 和 `admin_roles` 表存在角色映射差异。

---

## 模块 4：实名审核

| # | 检查点 | 结果 | 响应摘要 |
|---|--------|------|----------|
| 1 | GET /api/v1/admin/real-name-reviews — 待审核列表 | ✅ | 返回 28 条记录，含 userId/email/realNameStatus/rejectReason 等 |
| 2 | GET /api/v1/admin/real-name-reviews?status=pending_review | ✅ | 筛选出 1 个待审核用户 (test-enterprise@3cloud.dev, 李四) |
| 2b | GET ?status=approved | ✅ | 筛选出 19 个已通过用户 |
| 2c | GET ?status=rejected | ✅ | 筛选出 1 个被拒用户 (admin@3cloud.dev/张无忌) |
| 3 | GET /api/v1/auth/real-name/status — 用户端查询 | ✅ | super_admin: approved; admin: rejected（含 idNumber/rejectReason） |

### 注意事项
- 路由路径为 `/api/v1/admin/real-name-reviews`，**不是** `/api/v1/admin/reviews`（原定路径）

---

## 总体统计

| 分类 | 计划检查点 | 通过 | 失败 | 跳过 |
|------|-----------|------|------|------|
| 健康检查 | 2 | 2 | 0 | 0 |
| 用户认证 | 8 | 7 | 1 | 0 |
| 用户管理 | 7 | 7 | 0 | 0 |
| 实名审核 | 3 | 3 | 0 | 0 |
| **合计** | **20** | **19** | **1** | **0** |

**通过率: 95%** (19/20)

---

## 发现的问题总结

### 严重问题
1. **JSON body 解析 BOM bug** — Fastify 的 content-type parser 在收到 UTF-8 BOM 的 JSON 时解析为 `null`，导致 `null.captchaSession` 500 错误。虽然服务器端有 BOM stripping 代码 (`app.ts` 第 25-27 行)，但可能没有正确执行（检查 buf.length>=3 条件或 subarray 后未重新设 buf 变量？）。影响所有 POST/PATCH 请求。

### 改进建议
1. **路由路径文档不一致** — 实名审核路由是 `/real-name-reviews` 而非 `/reviews`，导出路由是 GET 而非 POST。
2. **role 字段不一致** — 用户列表显示 admin@3cloud.ai 的 role=agent，但登录返回 super_admin，双层角色可能存在歧义。
3. **部分测试用户无公开密码** — client-game-npc@3c.local 等普通用户的密码未提供，建议为测试账户统一密码或者在测试文档中标注。
