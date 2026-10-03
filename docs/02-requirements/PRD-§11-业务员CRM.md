# PRD §11 业务员支撑（CRM 客户 / 线索 / 商机 / 报价 / 业绩）

> 品牌：**浩寅云**　|　代码基线：2026-10-03 工作区（含 Step 4 补全：leads/opportunities/quotes 已落地）
> 状态图例：✅已实现｜🟡部分实现｜❌未实现（规划中）
> 路径权威：以 `api/src/routes/{me-sales,me-crm}.ts` 实际注册为准。
> 角色：sales / admin / super_admin。业务员只见「归属自己」的数据，admin 见全部。

---

## 一、功能清单

### 1.1 客户档案（§11.1）

| 编号 | 功能点 | 实际端点（`me-sales.ts`） | 状态 | 说明 |
|---|---|---|---|---|
| 11.1.1 | 客户标签字典 | `GET /api/v1/me/customer-tags` | ✅ | — |
| 11.1.2 | 我的客户列表 / 详情 | `GET /api/v1/me/customers`、`GET /:id` | ✅ | SalesCustomersPage / SalesCustomerDetailPage |
| 11.1.3 | 认领客户 | `POST /api/v1/me/customers/:id/assign` | ✅ | — |
| 11.1.4 | 写联系记录 / 改状态 / 打标签 | `POST /:id/contacts`、`PUT /:id/status`、`PUT /:id/tags` | ✅ | — |
| 11.1.5 | 客户消费 / 充值视图 | `GET /:id/consumption`、`GET /:id/recharges` | ✅ | — |

### 1.2 线索管理（§11.2）—— Step 4 已落地 ✅

| 编号 | 功能点 | 实际端点（`me-crm.ts`） | 状态 | 说明 |
|---|---|---|---|---|
| 11.2.1 | 线索 CRUD | `GET/POST /api/v1/me/crm/leads`、`GET/PUT/DELETE /:id` | ✅ | 表 `sales_leads`；状态 new/contacted/qualified/lost |
| 11.2.2 | 线索备注 | `POST /api/v1/me/crm/leads/:id/notes` | ✅ | notes 数组追加，上限 200 条，单条 ≤1000 字 |
| 11.2.3 | 线索转商机 | `POST /api/v1/me/crm/leads/:id/convert` | ✅ | 写 `sales_opportunities`，线索自动置 qualified |
| 11.2.4 | 线索分配 | sales 只能归自己；admin 可显式 `assigned_to` | ✅ | 归属校验在 handler |

### 1.3 商机管理（§11.4 上半）—— Step 4 已落地 ✅

| 编号 | 功能点 | 实际端点（`me-crm.ts`） | 状态 | 说明 |
|---|---|---|---|---|
| 11.3.1 | 商机 CRUD | `GET/POST /api/v1/me/crm/opportunities`、`GET/PUT/DELETE /:id` | ✅ | 表 `sales_opportunities`；阶段 proposal/negotiation/closed_won/closed_lost |
| 11.3.2 | 商机详情（含报价列表） | `GET /api/v1/me/crm/opportunities/:id` | ✅ | 附带该商机下全部报价单 |
| 11.3.3 | 预估金额 / 预计成交日 | `expected_value_cents`、`expected_close_date` 字段 | ✅ | 金额 integer(分) |

### 1.4 报价单（§11.4 下半）—— Step 4 已落地 ✅

| 编号 | 功能点 | 实际端点（`me-crm.ts`） | 状态 | 说明 |
|---|---|---|---|---|
| 11.4.1 | 报价单 CRUD | `GET/POST /api/v1/me/crm/quotes`、`GET/PUT/DELETE /:id` | ✅ | 表 `sales_quotes`；状态 draft/sent/accepted/rejected |
| 11.4.2 | 行项金额后端重算 | `summarizeItems()`：total_cents = Σ unit×qty | ✅ | 不信任前端小计，防篡改 |
| 11.4.3 | 版本号 | 同商机下 version = 现有数+1 | ✅ | 报价迭代留痕 |
| 11.4.4 | 报价单 PDF 导出 / 客户外发 | — | ❌ | 报价为结构化数据，无 PDF 生成/外发链接 |

### 1.5 跟进提醒 / 业绩看板（§11.3 / §11.5）

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 11.5.1 | 跟进提醒列表 / 创建 / 完成 / 忽略 | `me-sales.ts`：`GET/POST /me/follow-reminders`、`POST /:id/{complete,ignore}` | ✅ | SalesRemindersPage |
| 11.5.2 | 业绩看板 | `GET /me/sales-performance` | ✅ | SalesPerformancePage |

### 1.6 其余 CRM 能力

| 编号 | 功能点 | 实际端点 | 状态 | 说明 |
|---|---|---|---|---|
| 11.6 | 合同管理（模板/生成/审批/签章/续签） | — | ❌ | 无合同表/端点，整模块缺失 |
| 11.7 | 销售知识库 | 复用 `admin/knowledge-base` | 🟡 | 复用客服知识库，无销售专属分类 |
| 11.8 | 团队协作 / 客户交接 | — | ❌ | 无客户批量转移/团队视图/组长分派线索 |

---

## 二、关键架构

- **销售漏斗主线已贯通**：线索(leads) → 转商机(convert) → 商机(opportunities) → 报价(quotes)，Step 4 补齐后「线索→商机→报价」闭环在代码中真实存在。
- **三表归属模型**：`leads.assigned_to`、`opportunities.sales_user_id`、`quotes.sales_user_id`；sales 只见自己，admin 见全部；写操作全部落 `audit_logs`（action: `sales.lead.* / sales.opportunity.* / sales.quote.*`）。
- **金额口径**：一律 integer（分），与 me-sales 响应 snake_case 契约保持一致。
- **与 §9 的边界**：报价单是销售侧意向数据，不直接触发资金流水；成交后走 §9 充值/授信主链路。

---

## 三、未实现 / 规划中（❌）

1. **11.6 合同管理**：模板/生成/审批/电子签章/续签全缺。
2. **11.8 团队协作与客户交接**：无客户批量转移、团队视图、组长分派。
3. **11.4.4 报价 PDF / 外发**：结构化报价已通，缺文档化产物。
4. **11.7 销售专属知识库**：当前仅复用客服知识库。
