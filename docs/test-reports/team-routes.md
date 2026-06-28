# T5 — Team 路由审计报告

> 生成时间: 2026-06-28 09:53 CST
> 文件: `api/src/routes/team.ts`
> 依赖: `api/src/services/team-service.ts`, `api/src/schemas.ts`, `api/src/middleware/auth.ts`

## 端点覆盖

| 端点 | 方法 | preHandler | Schema | 状态 |
|------|------|-----------|--------|------|
| `/api/v1/team` | POST | authenticateJWT | createTeamSchema | ✅ |
| `/api/v1/team` | GET | authenticateJWT | 无 | ✅ |
| `/api/v1/team/invite` | POST | authenticateJWT | inviteTeamMemberSchema | ✅ |
| `/api/v1/team/members/:userId` | DELETE | authenticateJWT | 无 | ✅ |
| `/api/v1/team/members/:userId` | PATCH | authenticateJWT | updateTeamMemberSchema | ✅ |
| `/api/v1/team/leave` | POST | authenticateJWT | 无 | ✅ |

## Schema 校验

- `createTeamSchema`: name min(1) max(100) ✅
- `inviteTeamMemberSchema`: email + role(enum: team_admin/team_member) + quotaBalance(optional string) ✅
- `updateTeamMemberSchema`: role(enum: team_admin/team_member/team_owner) + quotaBalance(optional) ✅

## 团队角色约束

- role enum: team_owner, team_admin, team_member ✅
- invite 只允许邀请 team_admin/team_member（不能 team_owner）✅
- update 允许更新为 team_owner ✅

## 一人一队校验

- schema 中 `teamMembers` 表有 `userIdIdx: uniqueIndex("team_members_user_id_idx")` → 数据库级一人一队约束 ✅
- 但路由层未做显式校验，依赖 service 层实现

## 成员配额

- quotaBalance 字段为 DECIMAL(18,6) ✅
- invite 时可选设置 ✅
- update 时可修改 ✅

## 错误处理

- AppError ✅
- ZodError ✅
- 响应格式统一 ✅

## 汇总

| 检查项 | 结果 |
|--------|------|
| 端点全覆盖 | ✅ 6/6 |
| Schema 校验 | ✅ |
| 团队角色约束 | ✅ |
| 一人一队 | ✅ (数据库级) |
| 成员配额 | ✅ |
| 错误处理 | ✅ |
| 响应格式 | ✅ |
| 整体评分 | 95/100 |

**建议修复:**
1. 路由层增加一人一队前校验（减少数据库错误依赖）
