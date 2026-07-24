# Roles.tsx 拆分计划

**源文件**: `3cloud/web/src/pages/admin/Roles.tsx` (686 行)
**约束**: RoleFormModal 组件 props 接口复杂

## 拆分策略

### 1. Types (types.ts)
- RoleItem, PermItem, UserInRole, CandidateUser 接口
- MODULES 配置

### 2. Hooks
- `useRoles.ts` - 角色数据管理
- `useRoleUsers.ts` - 角色用户管理

### 3. Components
- `RoleList.tsx` - 角色列表
- `PermissionMatrix.tsx` - 权限矩阵
- `UserAssignment.tsx` - 用户分配

## 预期结果
- 主文件: 686 → ~150 行
- 新增文件: 2 hooks + 3 components + types

## 状态: ✅ 已完成
**结果**: 主文件 686 → 164 行（减少 76%）
**产出**: 2 Hooks + 3 组件 + types