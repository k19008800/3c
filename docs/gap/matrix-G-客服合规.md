# 差距矩阵 G：客服 / CRM / 合规 / 增强

> 覆盖章节：§10 客服支撑、§11 业务员支撑(CRM)、§13 数据迁移、§14 错误码、§15 组件库、§23 系统增强、§26 工单、§27 在线客服与客服效能、§28 智能客服与测试工具、§31 故障演练与多环境、§33 合规法务与成本
>
> 生成方式：以代码实际端点（`api/src/routes/*.ts` 中 `app.METHOD('path'`）为唯一权威，逐条对照 `docs/SPEC-§*.md`。
> 状态图例：✅ 已实现 ｜ 🟡 部分实现 ｜ ❌ 未实现 ｜ 📄 文档超前（代码无对应端点）
> 代码基准：git HEAD 91f62d3。

---

## A. 代码实际端点清单

> 仅列本分片相关端点；未列入者即代码中不存在。

### A.1 工单 / 审计（admin-tickets.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/admin/tickets | 工单队列（status/search/page_size） |
| GET | /api/v1/admin/tickets/stats | 工单统计 |
| GET | /api/v1/admin/tickets/:id | 工单详情（含 replies/operation_logs/satisfaction/tags） |
| POST | /api/v1/admin/tickets/:id/status | 变更状态 |
| POST | /api/v1/admin/tickets/:id/reply | 客服回复 |
| POST | /api/v1/admin/tickets/:id/note | 内部备注 |
| POST | /api/v1/admin/tickets/:id/assign | 分配工单 |
| GET | /api/v1/admin/audit-logs | 管理后台审计日志（keyword/action） |

### A.2 用户端工单（me.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/me/tickets | 我的工单列表 |
| POST | /api/v1/me/tickets | 创建工单 |
| POST | /api/v1/me/tickets/:id/reply | 用户追加回复 |
| POST | /api/v1/me/tickets/:id/resolve | 用户标记已解决 |

### A.3 客服缺失补齐（admin-support-missing.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/admin/support/kpi | 客服 KPI |
| GET | /api/v1/admin/support/tickets | 客服工单视图 |
| GET/POST/PUT/DELETE | /api/v1/admin/knowledge-base[/:id] | 管理端知识库 CRUD |
| GET | /api/v1/admin/chat/conversations | 客服会话列表 |
| GET | /api/v1/admin/chat/conversations/:id/messages | 会话消息 |
| POST | /api/v1/admin/chat/conversations/:id/reply | 客服回复（**chat_messages 唯一生产写入点**） |
| POST | /api/v1/admin/chat/conversations/:id/close | 关闭会话 |
| GET | /api/v1/admin/sys/db/tables | DB 表清单（运维） |
| POST | /api/v1/admin/sys/db/query | DB 查询（运维） |
| GET | /api/v1/admin/ops/activity | 运营活动时间线 |

### A.4 智能客服 / 测试工具（admin-support-extra.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/admin/support/assist/diagnose/:id | 用户异常自动诊断 |
| POST | /api/v1/admin/support/assist/intent | 用户意图识别 |
| GET | /api/v1/admin/support/test-keys | 临时测试 Key 列表 |
| POST | /api/v1/admin/support/test-key | 生成临时测试 Key |
| POST | /api/v1/admin/support/test-key/:id/revoke | 撤销测试 Key |
| GET | /api/v1/admin/support/audit-logs | 客服操作审计列表 |

### A.5 会话记录留存（admin-conversation-records.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/admin/conversation-records | 调用会话记录列表 |
| GET/PUT | /api/v1/admin/conversation-records/retention | 留存策略读/写 |
| POST | /api/v1/admin/conversation-records/retention/run | 手动执行留存清理 |
| GET | /api/v1/admin/conversation-records/:requestId | 单次调用详情 |
| GET | /api/v1/admin/conversation-records/export | 导出 |

### A.6 模型同步 / 编码 / 价格变更
| 方法 | 路径 | 文件 |
|---|---|---|
| POST | /api/v1/admin/suppliers/:id/sync-models | admin-model-sync.ts |
| POST | /api/v1/admin/suppliers/sync-all | admin-model-sync.ts |
| GET | /api/v1/admin/model-codes | admin-model-codes.ts |
| PUT | /api/v1/admin/model-codes/:id/status | admin-model-codes.ts |
| POST | /api/v1/admin/model-codes/:id/regenerate | admin-model-codes.ts |
| GET/PUT | /api/v1/admin/model-code-rules | admin-model-codes.ts |
| POST | /api/v1/admin/model-code-rules/preview | admin-model-codes.ts |
| GET | /api/v1/admin/price-changes | admin-price-changes.ts |
| GET | /api/v1/admin/price-changes/stats | admin-price-changes.ts |
| GET | /api/v1/admin/price-changes/:id | admin-price-changes.ts |
| GET | /api/v1/admin/price-changes/:id/impact | admin-price-changes.ts |
| POST | /api/v1/admin/price-changes/:id/notify | admin-price-changes.ts |
| GET | /api/v1/admin/price-changes/dispatch-logs | admin-price-changes.ts |
| GET/PATCH | /api/v1/admin/substitutability | admin-price-changes.ts |
| GET | /api/v1/admin/competitive/monitor | admin-competitive.ts |

### A.7 数据主体权利（合规 §33）
| 方法 | 路径 | 文件 |
|---|---|---|
| POST | /api/v1/me/data-export/request | data-requests.ts |
| GET | /api/v1/me/data-export/requests | data-requests.ts |
| GET | /api/v1/me/data-export/:id | data-requests.ts |
| POST | /api/v1/me/data-export/:id/cancel | data-requests.ts |
| GET | /api/v1/me/data-export/:id/download | data-requests.ts |
| GET | /api/v1/admin/data-requests | data-requests.ts |
| POST | /api/v1/admin/data-requests/:id/approve/reject/export | data-requests.ts |
| GET | /api/v1/me/data-export/grant-status | data-export-grants.ts |
| GET/POST | /api/v1/admin/data-export-grants | data-export-grants.ts |
| PUT/DELETE | /api/v1/admin/data-export-grants/:userId | data-export-grants.ts |
| GET | /api/v1/me/deletion/checks | deletion.ts |
| POST | /api/v1/me/deletion/request | deletion.ts |
| GET | /api/v1/me/deletion/status | deletion.ts |
| POST | /api/v1/me/deletion/cancel | deletion.ts |
| GET | /api/v1/admin/deletion-requests | deletion.ts |
| POST | /api/v1/admin/deletion-requests/:id/approve/reject/execute | deletion.ts |
| GET | /api/v1/me/consent/status | me-gap.ts |
| POST | /api/v1/me/consent/privacy | me-gap.ts |
| POST | /api/v1/me/consent/terms | me-gap.ts |
| GET | /api/v1/admin/consent/policies | admin-marketing-missing.ts |
| PUT | /api/v1/admin/consent/policies/:id | admin-marketing-missing.ts |
| GET | /api/v1/admin/consent/logs | admin-marketing-missing.ts |

### A.8 CRM / 业务员（me-sales.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/me/customer-tags | 客户标签字典 |
| GET | /api/v1/me/customers | 我的客户列表 |
| POST | /api/v1/me/customers/:id/assign | 认领客户 |
| GET | /api/v1/me/customers/:id | 客户详情 |
| POST | /api/v1/me/customers/:id/contacts | 写联系记录 |
| PUT | /api/v1/me/customers/:id/status | 变更客户状态 |
| PUT | /api/v1/me/customers/:id/tags | 打标签 |
| GET | /api/v1/me/customers/:id/consumption | 客户消费 |
| GET | /api/v1/me/customers/:id/recharges | 客户充值 |
| GET/POST | /api/v1/me/follow-reminders | 跟进提醒列表/创建 |
| POST | /api/v1/me/follow-reminders/:id/complete | 完成跟进 |
| POST | /api/v1/me/follow-reminders/:id/ignore | 忽略跟进 |
| GET | /api/v1/me/sales-performance | 业绩看板 |

### A.9 用户视角 /  impersonate（admin-customers.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| POST | /api/v1/admin/customers/:id/impersonate | 进入用户视角（签发带 impersonateBy 的 token） |
| POST | /api/v1/admin/customers/:id/impersonate/exit | 退出用户视角 |
| GET | /api/v1/admin/customers/:id/operation-logs | 客户操作日志 |

### A.10 内容审核（admin-risk-missing.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET | /api/v1/admin/content-moderation | 内容审核队列 |
| POST | /api/v1/admin/content-moderation/:id/:op | 审核（approve/reject） |

### A.11 系统运维（admin-ops.ts）
| 方法 | 路径 | 功能 |
|---|---|---|
| GET/PUT | /api/v1/admin/performance | 性能配置 |
| GET/POST/PUT | /api/v1/admin/content[/:id] | 公告/内容管理 |
| GET/PUT | /api/v1/admin/undo/config | 撤销配置 |
| GET | /api/v1/admin/undo/records | 撤销记录 |
| POST | /api/v1/admin/undo/:id/execute | 执行撤销 |
| GET/PUT | /api/v1/admin/webhook-retry[/:id] | Webhook 重试 |
| GET | /api/v1/admin/sys/version | 版本 |
| GET | /api/v1/admin/sys/migrations | 迁移记录查询（§13） |
| GET | /api/v1/admin/sys/logs | 系统日志 |

### A.12 关键澄清：两个"WebSocket/消息"不是客服
| 路径 | 实际用途 |
|---|---|
| GET /v1/ws（ws.ts） | **LLM 流式转发中继**（OpenAI 兼容，API Key 鉴权），与在线客服无关 |
| POST /v1/messages（messages.ts） | **Anthropic Messages 兼容推理接口**，与客服消息无关 |
| GET /internal/assets/:name（internal-assets.ts） | 内部静态资源，非客服 |

---

## B. 功能点差距矩阵

### B.1 §26 工单系统
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 26.1-U1 | 用户工单列表 | me.ts:1026 | SPEC §26.1 | ✅ | — |
| 26.1-U2 | 创建工单 | me.ts:1064 | SPEC §26.1 | 🟡 | 无分类/优先级/附件字段（仅 type/title/content） |
| 26.1-U3 | 工单详情 GET /me/tickets/:id | — | SPEC §26.1 | ❌ | 路由未注册（仅 list/create/reply/resolve） |
| 26.1-U4 | 用户回复 | me.ts:1100 | SPEC §26.1 | ✅ | — |
| 26.1-U5 | 用户自行关闭 | me.ts:1138（resolve） | SPEC §26.1 | 🟡 | 端点为 resolve 而非 close，语义近似 |
| 26.1-U6 | 满意度评价 POST /me/tickets/:id/satisfaction | — | SPEC §26.1 | ❌ | 无此端点 |
| 26.1-U7 | 附件上传 /me/tickets/upload | — | SPEC §26.1 | ❌ | 无上传端点 |
| 26.2-A1 | 工单队列 | admin-tickets.ts:319 | SPEC §26.2 | ✅ | — |
| 26.2-A2 | 工单统计 | admin-tickets.ts:401 | SPEC §26.6 | ✅ | — |
| 26.2-A3 | 工单详情 | admin-tickets.ts:461 | SPEC §26.2 | ✅ | — |
| 26.2-A4 | 客服回复 | admin-tickets.ts:559 | SPEC §26.3 | ✅ | — |
| 26.2-A5 | 分配 | admin-tickets.ts:655 | SPEC §26.4 | ✅ | — |
| 26.2-A6 | 变更状态 | admin-tickets.ts:499 | SPEC §26.3 | ✅ | — |
| 26.2-A7 | 变更优先级 POST .../priority | — | SPEC §26.2 | ❌ | 无此端点 |
| 26.2-A8 | 标签增删 POST .../tags | — | SPEC §26.2 | ❌ | tags 存 metadata，无独立 tags 端点 |
| 26.2-A9 | 内部备注 | admin-tickets.ts:618 | SPEC §26.3 | ✅ | — |
| 26.2-A10 | 工单导出 GET /admin/tickets/export | — | SPEC §26.2 | ❌ | 无导出端点 |
| 26.3 | 状态机 pending→processing→resolved→closed | admin-tickets.ts:499 | SPEC §26.3 | ✅ | 表值 open/in_progress/waiting_customer/resolved/closed 前端映射 |
| 26.7 | 满意度评价 | — | SPEC §26.7 | ❌ | ticket_satisfaction 表存在于 tickets.metadata，但无写入端点 |

### B.2 §27 在线客服与客服效能（**最大缺口**）
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 27.1-1 | 用户发起聊天 POST /me/chat/start | — | SPEC §27.1.3 | ❌ | 无端点，chat_conversations 无法由用户创建 |
| 27.1-2 | 用户发送消息 | — | SPEC §27.1.1 | ❌ | chat_messages 唯一写入点是客服 reply；用户端无发消息端点 |
| 27.1-3 | 用户历史列表 GET /me/chat/history | me-gap.ts:366 | SPEC §27.1.6 | ✅ | — |
| 27.1-4 | 单会话消息 GET /me/chat/sessions/:id/messages | — | SPEC §27.1.6 | ❌ | 用户端无读取会话消息端点 |
| 27.1-5 | 满意度评价 POST /me/chat/feedback | — | SPEC §27.1.1 | ❌ | 无 |
| 27.1-6 | WebSocket /ws/chat | —（/v1/ws 是 LLM 中继） | SPEC §27.1.7 | ❌ | **无客服 WS；现有 ws.ts 仅做推理流转发** |
| 27.1-7 | 客服 WS /ws/chat/staff | — | SPEC §27.1.7 | ❌ | 无 |
| 27.1-8 | 等待队列 GET /admin/chat/queue | — | SPEC §27.1.3 | ❌ | admin 仅有 conversations 列表，无排队模型 |
| 27.1-9 | 活跃会话 GET /admin/chat/active | admin-support-missing.ts:364（conversations） | SPEC §27.1.3 | 🟡 | 用 conversations 列表近似，无 active/queue 分流 |
| 27.1-10 | 客服会话消息 GET /admin/chat/conversations/:id/messages | admin-support-missing.ts:413 | SPEC §27.1.2 | ✅ | — |
| 27.1-11 | 关闭会话 POST .../close | admin-support-missing.ts:457 | SPEC §27.1.2 | ✅ | — |
| 27.1-12 | 转工单 POST .../transfer | — | SPEC §27.1.5 | ❌ | 无会话转工单端点（source=chat_transfer 无生产写入） |
| 27.1-13 | 客服状态 POST /admin/chat/status | — | SPEC §27.1.3 | ❌ | 无在线/忙碌/离线状态机 |
| 27.1-14 | 客服状态一览 GET /admin/chat/staff-status | — | SPEC §27.1.2 | ❌ | 无 |
| 27.1-15 | 预设消息 CRUD /admin/chat/presets | — | SPEC §27.1.4 | ❌ | 无 chat_presets 表/端点 |
| 27.1-16 | 自动分配 / 排队 / 超时转工单 | — | SPEC §27.1.3 | ❌ | 无分配规则引擎 |
| 27.1-17 | 已读回执 / 正在输入 typing | — | SPEC §27.1.7 | ❌ | 无消息协议层（read_receipt/typing） |
| 27.2 | 客服绩效统计 GET /admin/support/stats | admin-support-missing.ts:134（/support/kpi） | SPEC §27.2 | 🟡 | 仅有 KPI 聚合，无按客服排名/趋势图接口 |
| 27.3-1 | 客服操作审计列表 GET /admin/support/audit-logs | admin-support-extra.ts:499 | SPEC §27.3 | ✅ | — |
| 27.3-2 | 审计详情 GET .../audit-logs/:id | — | SPEC §27.3 | ❌ | 无详情端点 |
| 27.3-3 | 操作回滚 POST .../:id/rollback | admin-ops.ts:317（undo/records） | SPEC §27.3 | 🟡 | 有通用 undo 机制，但非客服操作专用回滚 |
| 27.4 | SLA / 超时升级 / 排班交接班 | — | SPEC §27.4 | ❌ | 无 SLA 计时器、无排班表 |

### B.3 §28 智能客服与测试工具
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 28.1-1 | 意图识别 POST /admin/support/assist/intent | admin-support-extra.ts:324 | SPEC §28.1.1 | ✅ | — |
| 28.1-2 | 自动诊断 GET /admin/support/assist/diagnose/:id | admin-support-extra.ts:167 | SPEC §28.1.3 | ✅ | — |
| 28.1-3 | 知识推荐（>95% 自动回复） | 依赖 intent 端点 | SPEC §28.1.2 | 🟡 | intent 端点存在，但无自动回复发送链路 |
| 28.1-4 | 余额不足主动预警 | diagnose 内联 | SPEC §28.1.4 | 🟡 | 诊断面板含余额，无独立预警标注 |
| 28.2-1 | 临时测试 Key 列表/生成/撤销 | admin-support-extra.ts:381/422/481 | SPEC §28.2.3 | ✅ | — |
| 28.2-2 | 模拟用户调用 POST /admin/support/simulate-call | — | SPEC §28.2.1 | ❌ | 无此端点 |
| 28.2-3 | 进入用户视角 POST .../user-perspective/enter | admin-customers.ts:920（/customers/:id/impersonate） | SPEC §28.2.2 | ✅ | 路径不同（impersonate 代替 user-perspective），语义等价 |
| 28.2-4 | 退出用户视角 POST .../user-perspective/exit | admin-customers.ts:978（/impersonate/exit） | SPEC §28.2.2 | ✅ | 同上 |

### B.4 §10 客服支撑
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 10.1 | 客服工作台（用户聚合面板） | admin-customers.ts:442（operation-logs）+ support/kpi | SPEC §10.1 | 🟡 | 用户详情页存在，但无"统一搜索直达聚合面板"单页 |
| 10.2 | 知识库管理端 CRUD | admin-support-missing.ts:253-347 | SPEC §10.2 | ✅ | — |
| 10.3 | 用户端帮助中心 | me-gap.ts:453（/me/knowledge-base）+ HelpCenterPage.tsx | SPEC §10.3 | ✅ | 含分类/反馈 |
| 10.4 | 快捷回复模板 | — | SPEC §10.4 | ❌ | 无模板表/端点 |
| 10.5 | 在线客服 WebChat | me-gap.ts:366（仅 history） | SPEC §10.5 | ❌ | 用户不能发起/发消息（见 B.2） |
| 10.6 | 用户操作时间线 | admin-customers.ts:442 | SPEC §10.6 | ✅ | — |

### B.5 §11 业务员支撑（CRM 八件套）
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 11.1 | CRM 客户列表/详情/标签/状态/联系记录/消费/充值 | me-sales.ts:204-779 | SPEC §11.1 | ✅ | SalesCustomersPage/SalesCustomerDetailPage 已建 |
| 11.2 | 线索管理（leads CRUD/分配/转换） | — | SPEC §11.2 | ❌ | **无 leads 表/端点，整模块缺失** |
| 11.3 | 客户跟进提醒 | me-sales.ts:821-929 | SPEC §11.3 | ✅ | SalesRemindersPage 已建 |
| 11.4 | 商机与报价（opportunities/quotations/PDF） | — | SPEC §11.4 | ❌ | **无商机/报价表/端点，整模块缺失** |
| 11.5 | 业绩看板 | me-sales.ts:956（/sales-performance） | SPEC §11.5 | ✅ | SalesPerformancePage 已建 |
| 11.6 | 合同管理（模板/生成/审批/签章/续签） | — | SPEC §11.6 | ❌ | **无合同表/端点，整模块缺失** |
| 11.7 | 销售知识库 | admin-support-missing.ts:253（通用知识库复用） | SPEC §11.7 | 🟡 | 复用客服知识库，无销售专属分类 |
| 11.8 | 团队协作与客户交接 | — | SPEC §11.8 | ❌ | 无客户批量转移/团队视图/组长分配线索 |

### B.6 §33 合规法务与成本
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 33.1 | 隐私政策版本管理（版本表/草稿/发布） | admin-marketing-missing.ts:636/692 | SPEC §33.1 | 🟡 | 用通用 consent_policies(key) 实现，非 SPEC 的 privacy_policy_versions 表；无草稿/发布工作流（PUT 即版本+1） |
| 33.2 | 服务条款版本管理 | me-gap.ts:730（/me/consent/terms） | SPEC §33.2 | 🟡 | 同 33.1，复用同一套机制 |
| 33.3 | 用户数据导出（GDPR） | data-requests.ts（5 个 me + 4 个 admin） | SPEC §33.3 | ✅ | 含审批/取消/下载/授权 |
| 33.3b | 删除权（被遗忘权） | deletion.ts（4 me + 4 admin） | SPEC §33 | ✅ | 含 checks/request/status/cancel + 审批/execute |
| 33.4 | 渠道成本分析 | （前端 AdminCostDashboardPage/AdminVendorCostPage 存在） | SPEC §33.4 | 🟡 | 前端页存在，后端端点归 §成本/财务分片，本分片未深核 |
| 33.5 | 活动 ROI | admin-marketing-missing.ts（campaigns，见营销分片） | SPEC §33.5 | 🟡 | 归营销分片 |
| 33.x | 数据导出授权审批 | data-export-grants.ts | SPEC §33 | ✅ | — |

### B.7 §23 系统级能力增强
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 23.1-1 | 用户端操作日志 | me-gap.ts:408（login-history）+ LogsPage.tsx | SPEC §23.1 | 🟡 | 登录历史有；me/operation-logs 通用端点未见独立路由 |
| 23.1-2 | 管理后台审计日志列表 | admin-tickets.ts:704 | SPEC §23.1 | ✅ | — |
| 23.1-3 | 审计详情 GET /admin/audit-logs/:id | — | SPEC §23.1 | ❌ | 无详情端点 |
| 23.1-4 | 审计导出 | — | SPEC §23.1 | ❌ | 无 |
| 23.2 | 全局搜索（Cmd+K） | — | SPEC §23.2 | ❌ | 无全局搜索端点/组件 |
| 23.3 | 快捷键 | — | SPEC §23.3 | ❌ | 无 |
| 23.4 | i18n | admin-i18n.ts + AdminI18nPage.tsx | SPEC §23.4 | ✅ | 已有 i18n 管理页 |
| 23.5 | 移动端适配 | — | SPEC §23.5 | 📄 | 前端响应式范畴，无独立端点 |

### B.8 §13 数据迁移 / §14 错误码 / §15 组件库 / §31 故障演练
| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| §13 | 迁移脚本/幂等/断点续传 | admin-ops.ts:441（GET /admin/sys/migrations 仅查询记录） | SPEC §13 | 🟡 | **仅状态查询端点；迁移本身靠 `pnpm db:migrate:manual` 命令执行，无在线迁移触发/校验 API** |
| §13 | 迁移完整性/引用/一致性校验 API | — | SPEC §13 | ❌ | 无 validate 端点 |
| §14 | 统一错误响应格式 / 错误码枚举 | api/src/lib/errors.ts（AppError） | SPEC §14 | ✅ | 编码规范级，由 lib/errors 统一抛出 |
| §14 | 前端 HTTP 拦截器统一处理 | 前端封装（web-console） | SPEC §14.3 | 🟡 | 前端拦截属通用层，未逐页核验 |
| §15 | 公共组件库（Button/Modal/Table/...） | web-console/src/components/ 仅 6 个业务弹窗组件 | SPEC §15 | 🟡 | **无独立 ui/ 基础组件库目录；页面内联 Tailwind，未沉淀 StatCard/TrendChart/StatusTag 等规范组件** |
| §31.1 | 渠道故障演练 start/stop | — | SPEC §31.1 | ❌ | **无 /admin/drills/* 端点** |
| §31.2 | 多环境配置同步/差异对比 | — | SPEC §31.2 | ❌ | 无 env-sync/diff 端点 |
| §31.3 | 配置沙箱预览 | — | SPEC §31.3 | ❌ | 无 sandbox 端点 |

---

## C. 关键发现

### C.1 🔴 在线客服 WebSocket —— 基本是空壳（最高优先级缺口）
- 现有 `GET /v1/ws`（ws.ts）经核实是 **LLM 流式推理中继**（API Key 鉴权 → selectChannel → 结算），**不是客服 WS**。
- 客服会话链路只有"半条"：
  - DB 表 `chat_conversations` / `chat_messages` 已建；
  - **客服端**可：列表 / 读消息 / 回复 / 关闭（admin-support-missing.ts）；
  - **用户端**只能 `GET /me/chat/history` 看列表，**没有发起会话、没有发送消息、没有读单会话消息、没有满意度评价**。
  - 代码中 `chat_messages` 的唯一生产写入点是客服 reply（admin-support-missing.ts:442），用户消息无法落库。
- 因此 §27.1 排队/自动分配/客服状态机/预设消息/转工单/已读回执/typing 全套 **❌ 未实现**。这是整个分片中最大的一块空白。

### C.2 🔴 CRM 八件套 —— 只做了 3 件半
已实现：11.1 CRM 客户、11.3 跟进提醒、11.5 业绩看板（前端 Sales* 页面齐全）。
**完全缺失（无表无端点）：11.2 线索管理、11.4 商机与报价、11.6 合同管理、11.8 团队交接。** 11.7 销售知识库仅复用客服知识库。即"线索→商机→报价→合同"的企业销售主线在代码中不存在。

### C.3 🟡 智能客服 —— 核心两个端点已建，但闭环未通
- ✅ 意图识别 `POST /admin/support/assist/intent`、自动诊断 `GET /.../diagnose/:id`、临时测试 Key（列表/生成/撤销）、用户视角 impersonate enter/exit **均已实现**。
- ❌ 缺口：`simulate-call`（模拟用户调用）未实现；自动回复推荐无发送链路；操作审计无详情/回滚专用端点。

### C.4 🟡 工单系统 —— 主干已通，周边缺失
- 管理端 8 端点齐全（列表/详情/统计/状态/回复/备注/分配/审计），用户端 list/create/reply/resolve 已通。
- 缺：用户端工单详情路由、满意度评价、附件上传、优先级变更、标签增删、工单导出、客服端转会话。

### C.5 ❌ §31 故障演练 / 多环境 / 沙箱 —— 纯文档
代码中 `drills|sandbox|env-sync|failover` 零命中，**整个 §31 无任何实现**（运维类，符合预期，如实标注）。

### C.6 🟡 §13 数据迁移 —— 仅状态可查
只有 `GET /admin/sys/migrations` 读取本地迁移记录；迁移执行走命令行 `pnpm db:migrate:manual`，**无在线触发/断点续传/校验 API**。

### C.7 🟡 §33 合规 —— 用户权利已闭环，政策版本管理是简化版
- ✅ 数据导出（申请/审批/下载）、删除权（检查/申请/审批/执行）、consent 同意全套已实现。
- 🟡 隐私政策/服务条款用通用 `consent_policies(key)` 实现，非 SPEC 设计的独立版本表 + 草稿/发布流；无新建版本端点（只能 PUT 让 version+1）。

### C.8 🟡 §15 组件库 —— 规范与现状脱节
`web-console/src/components/` 下仅 6 个业务弹窗组件，**没有 §15.1 规定的 Button/Modal/Table/StatCard/TrendChart/StatusTag 等基础组件库沉淀**，各页面内联 Tailwind。属"文档超前"。

---

## D. 补功能优先级建议（供后续派单）

| 优先级 | 缺口 | 工作量预估 |
|---|---|---|
| P0 | 在线客服用户端发消息链路 + 会话读取（chat_conversations 创建/消息发送端点） | 后端 3d |
| P0 | CRM 11.2 线索管理（表 + CRUD + 分配） | 后端 3d + 前端 3d |
| P1 | §31 故障演练 start/stop（最小可用：模拟渠道超时 + 熔断器观察） | 后端 5d |
| P1 | CRM 11.4 商机与报价 | 后端 5d + 前端 5d |
| P1 | 工单满意度评价 + 附件上传 + 用户端详情路由 | 后端 2d + 前端 2d |
| P2 | 客服预设消息 CRUD / 客服状态机 / 转工单 | 后端 4d |
| P2 | CRM 11.6 合同管理 | 后端 5d + 前端 4d |
| P2 | 全局搜索 Cmd+K / 审计详情与导出 | 后端 2d + 前端 2d |
| P3 | 真正的客服 WebSocket（/ws/chat 双端） | 后端 8d |

> 注：本矩阵仅做代码↔文档对照，未修改任何代码。所有端点位置均来自 `api/src/routes/*.ts` 实际 `app.METHOD('path'` 注册语句。
