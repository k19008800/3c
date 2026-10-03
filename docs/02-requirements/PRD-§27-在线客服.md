# §27 在线客服与客服效能

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/routes/{admin-support-missing,me-gap}.ts`、`api/src/routes/ws.ts`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

> **关键澄清（以代码为准）**：现有 `GET /v1/ws`（ws.ts）是 **LLM 流式推理中继**（?api_key= 鉴权 → selectChannel → 结算），**不是客服 WebSocket**。本主题的客服实时通道当前为空壳。

## 27.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 27.1-1 | 用户发起聊天 | — | ❌ | 无 `POST /me/chat/start`，chat_conversations 无法由用户创建 |
| 27.1-2 | 用户发送消息 | — | ❌ | chat_messages 唯一生产写入点是客服 reply；用户消息无法落库 |
| 27.1-3 | 用户历史会话列表 | `me-gap.ts`：`GET /me/chat/history` | ✅ | |
| 27.1-4 | 用户读单会话消息 | — | ❌ | 无 `/me/chat/sessions/:id/messages` |
| 27.1-5 | 用户满意度评价 | — | ❌ | |
| 27.1-6 | 客服 WebSocket（双端实时） | —（/v1/ws 为推理中继） | 🟡 | 通道基建存在但语义不对；独立 `/ws/chat` 未建——整体标空壳 |
| 27.1-7 | 客服端会话列表/消息/回复/关闭 | `admin-support-missing.ts`：`/admin/chat/conversations[/:id/messages,/:id/reply,/:id/close]` | ✅ | 客服侧四条链路齐 |
| 27.1-8 | 等待队列 / 活跃会话分流 | — | ❌ | 无排队模型；active 用 conversations 列表近似 |
| 27.1-9 | 会话转工单 | — | ❌ | source=chat_transfer 无生产写入 |
| 27.1-10 | 客服在线/忙碌/离线状态机 | — | ❌ | 无 `/admin/chat/status`、无 staff-status 一览 |
| 27.1-11 | 预设消息（快捷话术） | — | ❌ | 无 chat_presets 表/CRUD |
| 27.1-12 | 自动分配/超时转工单 | — | ❌ | 无分配规则引擎 |
| 27.1-13 | 已读回执 / 正在输入 typing | — | ❌ | 无消息协议层 |
| 27.2 | 客服 KPI 绩效 | `admin-support-missing.ts`：`GET /admin/support/kpi` | 🟡 | KPI 聚合有；缺按客服排名/趋势图 |
| 27.3 | 客服操作审计 | `admin-support-extra.ts`：`GET /admin/support/audit-logs` | 🟡 | 列表有；缺审计详情与客服专用回滚（通用 undo 在 §23） |
| 27.4 | SLA 计时 / 超时升级 / 排班交接班 | — | ❌ | 无 SLA 计时器、无排班表 |

## 27.2 关键架构

- 现状是"半条客服链路"：DB 表 chat_conversations/chat_messages 已建，客服端四操作齐，用户端只能看历史列表。要闭环最小集：用户 start → 用户发消息落库 → 客服实时收到 → 双向 typing/read 回执。
- 实时通道应新建独立 `/ws/chat`（用户端 + 客服端两个命名空间），**不复用** `/v1/ws` 推理中继，避免鉴权方式（api_key vs 会话 JWT）与结算语义冲突。

## 27.3 未实现项（按优先级）

| 优先级 | 事项 |
|---|---|
| P0 | 用户端发起会话 + 发消息落库 + 读单会话消息 |
| P2 | 独立客服 WebSocket 双端通道 |
| P2 | 排队/自动分配、客服状态机、预设话术、转工单、SLA/排班 |
