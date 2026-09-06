# U1 用户页面原子审计批次记录

> 只读批次；未修改业务源码；不复用旧审计结论。每页原子核对表固定 100 项，所有未具备测试/后端/数据库或动态验证证据的项目标记 UNKNOWN。

| 页面 | 原子项数量 | 源码 | 主要问题 |
|---|---:|---|---|
| LoginPage | 100 | `web-console/src/pages/LoginPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| RegisterPage | 100 | `web-console/src/pages/RegisterPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| ForgotPasswordPage | 100 | `web-console/src/pages/ForgotPasswordPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| DashboardPage | 100 | `web-console/src/pages/DashboardPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| ApiKeysPage | 100 | `web-console/src/pages/ApiKeysPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| LogsPage | 100 | `web-console/src/pages/LogsPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| BillingPage | 100 | `web-console/src/pages/BillingPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| InvoicesPage | 100 | `web-console/src/pages/InvoicesPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| RedemptionPage | 100 | `web-console/src/pages/RedemptionPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| SecurityPage | 100 | `web-console/src/pages/SecurityPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| StatisticsPage | 100 | `web-console/src/pages/StatisticsPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| PlaygroundPage | 100 | `web-console/src/pages/PlaygroundPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| RealNamePage | 100 | `web-console/src/pages/RealNamePage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| AnnouncementsPage | 100 | `web-console/src/pages/AnnouncementsPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| NotificationPage | 100 | `web-console/src/pages/NotificationPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| NotificationSettingsPage | 100 | `web-console/src/pages/NotificationSettingsPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| HelpCenterPage | 100 | `web-console/src/pages/HelpCenterPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| UserWebhooksPage | 100 | `web-console/src/pages/UserWebhooksPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| DeletionPage | 100 | `web-console/src/pages/DeletionPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| UserGroupsPage | 100 | `web-console/src/pages/UserGroupsPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| VendorSelectorPage | 100 | `web-console/src/pages/VendorSelectorPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| TopupRecordsPage | 100 | `web-console/src/pages/TopupRecordsPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| TicketsPage | 100 | `web-console/src/pages/TicketsPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| UserChatPage | 100 | `web-console/src/pages/UserChatPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |
| OAuthPage | 100 | `web-console/src/pages/OAuthPage.tsx` | 页面级/按钮级帮助、状态、权限、API、数据、审计和测试均需逐项提供证据；本批次不判 PASS |

## 批次问题汇总

- DataExport：未发现 `web-console/src/pages/DataExport.tsx`，因此未生成页面报告；需先确认是否存在其他路由/文件名。
- 路由注册、后端接口、数据库字段和测试文件未在本只读批次中替代源码证据推断，缺失处保持 UNKNOWN。
- 需求出处按页面相关 PRD/SPEC 文件及 PRODUCT-DESIGN-PRINCIPLES.md 的精确章节标注；如章节在后续需求整理中变更，应在复核时更新。
