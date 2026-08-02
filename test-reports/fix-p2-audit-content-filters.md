# 修复报告: MED-4 内容过滤 CRUD 写审计日志

## 问题描述
内容过滤规则的创建（POST）、更新（PATCH）、删除（DELETE）三个 handler 均未写入 `audit_logs` 表，违反了审计合规要求。

## 修改文件

### 1. `src/db/schema/enums.ts`
- 在 `auditActionEnum` 末尾新增三个审计动作值：
  - `content_filter_create`
  - `content_filter_update`
  - `content_filter_delete`

### 2. `src/routes/admin/content-filters.ts`
- 导入新增 `auditLogs`：
  ```typescript
  import { contentFilters, filterLogs, auditLogs } from "../../db/schema.js";
  ```

#### POST handler — 创建规则
- Insert 成功后写入审计日志，记录 `after` 快照（name, pattern, matchType, action, stage, scope, priority）

#### PATCH handler — 更新规则
- 更新前先读取 `before` 快照
- 更新后写入审计日志，包含 `before` + `after` 快照（含 status 字段）
- 若规则不存在则直接 404 返回，不写日志

#### DELETE handler — 删除规则
- 删除前先读取 `before` 快照
- 删除后写入审计日志，记录 `before` 快照
- 若规则不存在，写入审计日志但 `before` 为 null

## 新增文件

### 3. `src/db/migrations/2026-07-18-content-filter-audit-actions.ts`
- 为 PostgreSQL 的 `audit_action` 枚举类型添加三个新值（`ALTER TYPE ... ADD VALUE IF NOT EXISTS`）
- 参考 `2026-07-09-announcements-audit-actions.ts` 的模式

## 编译验证
```
npx tsc --noEmit
```
通过，`content-filters.ts` 和 `enums.ts` 均无编译错误。现有 12 个预存错误（在其他文件中）保持不变。

## 数据库迁移
```bash
cd 3cloud/api && npx tsx src/db/migrations/2026-07-18-content-filter-audit-actions.ts
```

## 功能验证步骤
1. 启动后端：`cd 3cloud/api && npm run dev`
2. 运行迁移：用 admin 账号的 JWT token
3. 创建规则：
```bash
curl -X POST http://localhost:3000/api/v1/admin/content-filters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试敏感词","pattern":"赌博","matchType":"keyword","action":"block"}'
```
4. 查询审计日志：
```bash
psql -U postgres -d 3cloud -c "SELECT id, action, target_type, target_id, description FROM audit_logs ORDER BY id DESC LIMIT 3;"
```
应看到：
- `content_filter_create` 记录

5. 更新规则同上，PATCH /:id 后应看到 `content_filter_update`
6. 删除规则同上，DELETE /:id 后应看到 `content_filter_delete`
