# 3cloud 交付核对 — 工作记录（2026-09，goal 进行中）

> 依据 3cloud 需求文档（00-index + approved PRD/SPEC/API + ADR）核对当前代码，持续补齐直至交付。

## 交付闸门基线（实测）
| 检查 | 初始 | 现状 |
|---|---|---|
| `pnpm -r typecheck` | FAIL（web-console test TS） | **0 错**（已修 4 处 strict TS：AdminCustomerDetail/AdminCustomers/sharedUiMock/renderWithProviders）|
| API 单测 `pnpm test` | 1189/1189 | **1221/1221（84 文件）** |
| `verify`（test-integration） | 17/17 | **17/17** |
| `pnpm build` | 通过 | **shared+api+console+portal 全过** |

## 摇杆补齐的代码缺口（Wave 1 — drill §4.1 七项，已全部实现）
- A `GET /me/recharge/records`、B `GET /me/redemption/history` → `recharge.ts`（元单位，total，days/自定义区间筛选）；附带修 TopupRecordsPage 金额 `/100` bug（全局用元）。
- C `GET /me/chat/history` → `me-gap.ts`（LEFT JOIN+GROUP BY 聚合 msg_count，修复 drizzle 相关子查询渲染 bug）。
- D `GET /me/login-history` → `me-gap.ts` + **migration 0035 (login_history 表，已应用) + auth.ts 成功/失败写入**。
- E `GET/PUT /me/preferences/notifications` + reset → `me-gap.ts`（system_config JSON 持久化，validate/clamp/forced）。
- G `GET /admin/models`（聚合 supplier_models，vendor_count/status/context_length）→ `admin-marketplace.ts`。
- F `GET /models/:name/channels`（渠道定价）→ `public.ts`（VendorSelectorPage 真实需要；`/vendors/public` 前提有误，不实现）。
- A11 `GET/POST /api/v1/v1/mj|suno/*` 别名 → `task-relay.ts`（补齐与其他网关端点一致的别名，web-console MjSunoTasksPage 走 /api/v1/v1 前缀）。
- 测试：me-gap 12/12、recharge 10/10、models 10/10、task-relay 18/18。

## Wave 2 — 契约审计新发现 13 族（`docs/contract-gap-audit-2026-09.md`），分诊：
- **实现中**：A1 onboarding、A2 customer-tags、A3 affiliate、A6 coupons、A4 competitive monitor、A5 /admin/marketplace（复数路径）、A7 agent dashboard、A8 agent customers、A9 agent consumption。
- **A11** 已修复（见上）。
- **变更密码契约 bug（audit §B shape-only）**：**已修复** — `SecurityPage` 用 `PUT /me/change-password` + `{current_password,new_password}`，后端原为 `POST` + `{oldPassword,newPassword}` → 405 + 读不到字段。已将 handler 改为 POST/PUT 双方法 + 两种字段名兼容；新增 PUT 契约测试，me-endpoints 46/46。
- **A13 `/admin/vendors` CRUD**：**不实实现** — `AdminVendorsPage` 未在 App.tsx 路由注册（管理端用 `/admin/suppliers/*` 的 AdminSupplierListPage/DetailPage），属被取代/死 UI，非交付缺口。
- **A12 `/vendor/*` 供应商自助门户**：**很大子系统**，需新增 `vendorAuth` 中间件 + 供应商会话设计 + CRUD/结算/统计；ref-4.10/SPEC-§25 有需求但无实现，需产品/架构单独立项与确认鉴权模型；本轮记录为独立工作流，未纳入交付闸门。

## 需求文档层（release gate 相关，不阻断代码闸门）
- `release-gate.md`/`release-baseline.md`：not_ready（T-04 需"同一 commit SHA + 锁文件 + 环境快照"真实回填）。
- O-01 迁移 runner 加固：代码已落地（checksum/advisory lock/失败即停，open-issues #17）。
- 备份/恢复演练、支付回调契约、资金补账/核销独立 2FA 证据等：需独立环境/人力，无法本机编造。

## 收尾
1. 等 Wave 2 完成 → 全量回归 → 记录 release-baseline 真实数字。
2. 产出交付结论报告（含 A12 独立工作流建议）。