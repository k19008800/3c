# §26 工单系统

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/routes/{admin-tickets,me,admin-support-missing}.ts`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 26.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 26.1-U1 | 用户工单列表 | `me.ts`：`GET /me/tickets` | ✅ | |
| 26.1-U2 | 用户创建工单 | `me.ts`：`POST /me/tickets` | 🟡 | 仅 type/title/content；无分类/优先级/附件字段 |
| 26.1-U3 | 用户工单详情 | — | ❌ | 路由未注册（仅 list/create/reply/resolve） |
| 26.1-U4 | 用户追加回复 | `me.ts`：`POST /me/tickets/:id/reply` | ✅ | |
| 26.1-U5 | 用户标记解决 | `me.ts`：`POST /me/tickets/:id/resolve` | 🟡 | 语义近似 close |
| 26.1-U6 | 满意度评价 | — | ❌ | 无 `POST /me/tickets/:id/satisfaction` 端点 |
| 26.1-U7 | 附件上传 | — | ❌ | 无上传端点（依赖 §16 OSS） |
| 26.2-A1 | 工单队列（管理端） | `admin-tickets.ts`：`GET /admin/tickets`（status/search/page_size） | ✅ | |
| 26.2-A2 | 工单统计 | `GET /admin/tickets/stats` | ✅ | |
| 26.2-A3 | 工单详情 | `GET /admin/tickets/:id`（replies/operation_logs/satisfaction/tags） | ✅ | |
| 26.2-A4 | 客服回复 | `POST /admin/tickets/:id/reply` | ✅ | |
| 26.2-A5 | 分配工单 | `POST /admin/tickets/:id/assign` | ✅ | |
| 26.2-A6 | 变更状态 | `POST /admin/tickets/:id/status` | ✅ | |
| 26.2-A7 | 内部备注 | `POST /admin/tickets/:id/note` | ✅ | |
| 26.2-A8 | 变更优先级 | — | ❌ | 无独立端点 |
| 26.2-A9 | 标签增删 | — | ❌ | tags 存 metadata，无独立 tags 端点 |
| 26.2-A10 | 工单导出 | — | ❌ | |
| 26.3 | 状态机 | open / in_progress / waiting_customer / resolved / closed | ✅ | 前端映射完成 |

## 26.2 关键架构

- 工单与在线客服会话（§27）是两套数据：tickets 表 vs chat_conversations/chat_messages 表；当前**无会话转工单**的生产写入（见 §27.1-12）。
- 满意度字段在 tickets.metadata 内预留，但无写入端点，属"表结构超前于端点"。

## 26.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 用户端工单详情路由、创建时分类/优先级字段 |
| P1 | 满意度评价端点、工单附件上传 |
| P2 | 优先级变更、标签管理、工单导出、会话转工单 |
