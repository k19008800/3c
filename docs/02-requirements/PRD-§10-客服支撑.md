# PRD §10 客服支撑（工单 / 在线客服 / 智能辅助 / 知识库）

> 品牌：**浩寅云**　|　代码基线：2026-10-03 工作区
> 状态图例：✅已实现｜🟡部分实现｜❌未实现（规划中）
> 路径权威：以 `api/src/routes/*.ts` 实际注册为准。

---

## 一、功能清单

### 1.1 工单系统（§26）

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 10.1.1 | 用户工单列表 / 创建 / 回复 / 自解决 | `me.ts`：`GET /me/tickets`、`POST /me/tickets`、`POST /:id/reply`、`POST /:id/resolve` | ✅ | 创建仅 type/title/content，无分类/优先级/附件 🟡 |
| 10.1.2 | 用户工单详情 GET /me/tickets/:id | — | ❌ | 路由未注册（仅 list/create/reply/resolve） |
| 10.1.3 | 用户满意度评价 / 附件上传 | — | ❌ | 无 `/satisfaction`、无 `/upload` 端点 |
| 10.1.4 | 管理端工单队列 / 统计 / 详情 | `admin-tickets.ts`：`GET /admin/tickets[/stats]`、`GET /:id` | ✅ | 详情含 replies/operation_logs/satisfaction/tags |
| 10.1.5 | 客服回复 / 状态流转 / 分配 / 内部备注 | `admin-tickets.ts`：`POST /:id/{status,reply,note,assign}` | ✅ | 状态机 open/in_progress/waiting_customer/resolved/closed |
| 10.1.6 | 改优先级 / 标签增删 / 工单导出 | — | ❌ | tags 存 metadata，无独立端点；无 export |

### 1.2 在线客服 WebChat（§27 —— 最大缺口）

> ⚠️ 澄清：现有 `GET /v1/ws`（`ws.ts`）是 **LLM 流式推理中继**（API Key 鉴权→选渠道→结算），**不是客服 WebSocket**；`POST /v1/messages` 是 Anthropic 兼容推理接口。二者均与客服无关。

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 10.2.1 | 客服端会话列表 / 读消息 / 回复 / 关闭 | `admin-support-missing.ts`：`GET /admin/chat/conversations[/:id/messages]`、`POST .../:id/{reply,close}` | ✅ | `chat_messages` 唯一生产写入点是客服 reply |
| 10.2.2 | 用户端历史会话列表 | `me-gap.ts`：`GET /me/chat/history` | ✅ | 仅列表 |
| 10.2.3 | **用户发起会话 / 发送消息 / 读单会话消息 / 满意度** | 无 `/me/chat/start`、`/me/chat/sessions/:id/messages`、`/me/chat/feedback` | ❌ | 用户无法创建会话、无法发消息落库——链路只有「半条」 |
| 10.2.4 | 客服 WebSocket（双端实时）`/ws/chat`、`/ws/chat/staff` | — | ❌ | 无客服 WS（现有 ws.ts 仅推理流转发） |
| 10.2.5 | 等待队列 / 活跃会话 / 客服状态机 / 自动分配 | 无 `/admin/chat/{queue,active,status,staff-status}` | ❌ | 用 conversations 列表近似，无排队/在线忙碌状态/分配规则 |
| 10.2.6 | 预设消息 / 转工单 / 已读回执 / typing | — | ❌ | 无 chat_presets 表、无会话转工单、无消息协议层 |
| 10.2.7 | SLA / 超时升级 / 排班交接班 | — | ❌ | 无 SLA 计时与排班表 |

### 1.3 智能客服与测试工具（§28）

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 10.3.1 | 意图识别 | `admin-support-extra.ts`：`POST /admin/support/assist/intent` | ✅ | — |
| 10.3.2 | 用户异常自动诊断 | `GET /admin/support/assist/diagnose/:id` | ✅ | 含余额/异常聚合 |
| 10.3.3 | 知识推荐自动回复发送链路 | 依赖 intent | 🟡 | intent 端点在，但无「>95% 自动回复」发送链路 |
| 10.3.4 | 临时测试 Key 列表 / 生成 / 撤销 | `GET /admin/support/test-keys`、`POST /admin/support/test-key`、`POST /:id/revoke` | ✅ | — |
| 10.3.5 | 模拟用户调用 simulate-call | — | ❌ | 无此端点 |
| 10.3.6 | 进入/退出用户视角（impersonate） | `admin-customers.ts`：`POST /admin/customers/:id/impersonate`、`/impersonate/exit` | ✅ | 语义等价 SPEC user-perspective（路径不同），签发带 impersonateBy token |

### 1.4 知识库 / 帮助中心 / 客服工作台（§10）

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 10.4.1 | 知识库管理端 CRUD | `admin-support-missing.ts`：`GET/POST/PUT/DELETE /admin/knowledge-base[/:id]` | ✅ | — |
| 10.4.2 | 用户端帮助中心 | `me-gap.ts`：`GET /me/knowledge-base` + `HelpCenterPage.tsx` | ✅ | 含分类/反馈 |
| 10.4.3 | 客服 KPI / 操作审计 | `GET /admin/support/kpi`、`GET /admin/support/audit-logs` | 🟡 | 有 KPI 聚合与审计列表；审计无详情/客服专用回滚（通用 undo 机制近似） |
| 10.4.4 | 客服工作台（用户聚合面板） | `admin-customers.ts/:id/operation-logs` + support/kpi | 🟡 | 用户详情页存在，但无「统一搜索直达聚合面板」单页 |
| 10.4.5 | 快捷回复模板 | — | ❌ | 无模板表/端点 |
| 10.4.6 | 用户操作时间线 | `admin-customers.ts/:id/operation-logs` | ✅ | — |

---

## 二、关键架构

- **会话数据模型**：`chat_conversations` / `chat_messages` 两表已建，但写入端只有客服 reply，用户消息无法落库——在线客服是「半闭环」。
- **诊断/意图分离**：智能辅助为「事后诊断 + 意图分类」工具集，不直接发消息；真正的自动回复发送链路未打通。
- **impersonate 是客服/运营共用的用户视角工具**：进入时签发带 `impersonateBy` 的 token，全程审计留痕，退出即还原。
- **对话记录留存**（合规配套）：`admin-conversation-records.ts` 提供调用记录查询/导出 + 留存策略（read/write/run），归 §4.22 数据生命周期。

---

## 三、未实现 / 规划中（❌ 重点）

1. **10.2 在线客服 WebChat 用户端全链路**（P0）：发起会话、发消息、读消息、满意度——这是本分片最大空白。
2. **10.2.4 真正的客服 WebSocket**（`/ws/chat` 双端）：现有 ws.ts 是推理中继，须新建独立客服通道。
3. **10.2.5 排队/分配/状态机**、**10.2.6 预设消息/转工单/已读回执**、**10.2.7 SLA/排班**。
4. **10.1 工单周边**：用户端详情路由、满意度评价、附件上传、优先级/标签/导出。
5. **10.3.5 simulate-call**、**10.4.5 快捷回复模板**。
