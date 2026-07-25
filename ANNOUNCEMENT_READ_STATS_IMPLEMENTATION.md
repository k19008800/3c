# 公告阅读统计功能实现报告

## 实现时间
2026-07-25

## 功能概述
在公告管理中添加阅读统计功能，支持：
- 记录每个用户对每篇公告的阅读状态
- 统计公告的阅读人数、阅读率
- 显示未读/已读用户列表
- 支持分页查看阅读记录

## 数据库设计
**已存在的表结构**（无需新增）：
- `announcements` - 公告表
- `announcement_reads` - 公告阅读记录表（id, announcement_id, user_id, read_at）
  - 唯一约束：(user_id, announcement_id) - 同一用户对同一公告只记录一次
  - 索引：user_id, announcement_id - 快速查询

## 后端 API 实现

### 1. 阅读统计 API
**路由**: `GET /api/v1/admin/announcements/:id/stats`

**权限**: `CONFIG_VIEW`

**返回数据**:
```json
{
  "code": 0,
  "data": {
    "announcementId": 1,
    "title": "公告标题",
    "totalUsers": 100,
    "readUsers": 45,
    "unreadUsers": 55,
    "readRate": 45.00
  },
  "message": "ok"
}
```

**实现逻辑**:
1. 统计活跃用户总数（status = 'active'）
2. 统计已读用户数（从 announcement_reads 表）
3. 计算阅读率 = 已读用户数 / 总用户数 * 100

### 2. 阅读用户列表 API
**路由**: `GET /api/v1/admin/announcements/:id/readers`

**权限**: `CONFIG_VIEW`

**查询参数**:
- `page` - 页码（默认 1）
- `pageSize` - 每页数量（默认 20，最大 100）
- `readStatus` - 阅读状态筛选（'read' | 'unread' | 不传=全部）

**返回数据**:
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "email": "user@example.com",
        "nickname": "用户昵称",
        "isRead": true,
        "readAt": "2026-07-25T10:30:00Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "message": "ok"
}
```

**实现逻辑**:
- `readStatus=read`: 返回已读用户，按阅读时间倒序
- `readStatus=unread`: 返回未读用户（活跃用户 - 已读用户）
- 不传 `readStatus`: 返回所有活跃用户，附带阅读状态

### 3. 已有的用户端 API
用户端 API 已在 `src/routes/announcements.ts` 中实现：
- `POST /api/v1/announcements/:id/read` - 标记已读（用户打开公告详情时自动调用）
- `POST /api/v1/announcements/read-all` - 全部标记已读
- `GET /api/v1/announcements/unread-count` - 未读公告数量

## 前端实现

### 1. 阅读统计组件
**文件**: `web/src/pages/admin/announcements/AnnounceReadStats.tsx`

**功能**:
- 显示统计概览卡片（总用户数、已读、未读、阅读率）
- 阅读率进度条可视化
- 可展开查看详细用户列表
- 支持筛选：全部 / 已读 / 未读
- 分页查看用户列表

**UI 设计**:
```
┌─────────────────────────────────────┐
│ 👁 阅读统计              [查看详情] │
├─────────────────────────────────────┤
│  👥 总用户   👁 已读   👁 未读   📈 阅读率 │
│    100       45       55      45%   │
│  ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  45%          │
└─────────────────────────────────────┘
```

### 2. 公告列表组件修改
**文件**: `web/src/pages/admin/announcements/AnnounceList.tsx`

**改动**:
- 添加"统计"按钮（仅已发布公告显示）
- 点击按钮展开/收起阅读统计卡片
- 使用 `useExpandedStats` hook 管理展开状态

**UI 位置**:
```
操作列:
[统计 ▼] [编辑] [删除]
```

## 自动标记已读机制
用户端 `Announcements.tsx` 已实现：
- 用户展开公告详情时自动调用 `POST /api/v1/announcements/:id/read`
- 使用 `onConflictDoNothing()` 避免重复记录
- 本地状态即时更新，无需刷新

## 测试验证

### 测试脚本
创建了测试脚本 `test-announcement-read-stats.ps1`，测试内容：
1. 管理员登录
2. 获取公告列表
3. 测试阅读统计 API
4. 测试阅读用户列表 API（全部/已读/未读）

### 运行测试
```powershell
cd ~/.openclaw/workspace/3cloud
./test-announcement-read-stats.ps1
```

## 文件清单

### 后端
- `api/src/routes/admin/announcements.ts` - 添加阅读统计和用户列表 API

### 前端
- `web/src/pages/admin/announcements/AnnounceReadStats.tsx` - 新建阅读统计组件
- `web/src/pages/admin/announcements/AnnounceList.tsx` - 添加统计按钮和展开逻辑

### 测试
- `test-announcement-read-stats.ps1` - API 测试脚本

## 验收标准完成情况

| 标准 | 状态 | 说明 |
|------|------|------|
| 阅读记录正确保存 | ✅ | 使用 `onConflictDoNothing()` 避免重复 |
| 统计数据准确 | ✅ | 基于数据库实时计算 |
| 已读/未读列表正常 | ✅ | 支持筛选和分页 |
| 自动标记已读正常 | ✅ | 用户展开公告时自动调用 |

## 注意事项

1. **性能优化**:
   - 用户列表查询使用分页，避免一次加载过多数据
   - 已读/未读筛选使用 SQL 子查询，避免全量加载

2. **数据一致性**:
   - `announcement_reads` 表有外键约束，公告删除时自动级联删除
   - 用户删除时自动级联删除阅读记录

3. **权限控制**:
   - 所有管理端 API 需要 `CONFIG_VIEW` 权限
   - 用户端标记已读只需要登录即可

## 后续优化建议

1. **导出功能**: 可添加导出阅读记录为 CSV/Excel 的功能
2. **阅读趋势**: 统计每日新增阅读人数，绘制趋势图
3. **邮件提醒**: 对长时间未读重要公告的用户发送提醒邮件
