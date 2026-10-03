# §33 合规法务与成本分析

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`api/src/routes/{data-requests,data-export-grants,deletion,me-gap,admin-marketing-missing}.ts`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 33.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 33.1 | 隐私政策版本管理（版本表/草稿/发布工作流） | `admin-marketing-missing.ts`：`GET/PUT /admin/consent/policies[/:id]`、`GET /admin/consent/logs` | 🟡 | 用通用 consent_policies(key) 简化实现，PUT 即版本+1；无独立版本表、无草稿/审批发布流 |
| 33.2 | 服务条款版本管理 | `me-gap.ts`：`POST /me/consent/terms` | 🟡 | 同 33.1 复用同一套机制 |
| 33.3a | 用户数据导出权（GDPR） | `data-requests.ts`：`/me/data-export/{request,requests,:id,:id/cancel,:id/download}` + 管理端 approve/reject/export | ✅ | 申请→审批→执行→下载全闭环 |
| 33.3b | 被遗忘权（账号注销） | `deletion.ts`：`/me/deletion/{checks,request,status,cancel}` + 管理端 approve/reject/execute | ✅ | 前置检查（余额/工单/合同/代理身份）→ 7 天冷静期 → 物理删除 |
| 33.3c | 数据导出授权审批 | `data-export-grants.ts`：grant-status + admin 列表/新建/更新/删除 | ✅ | |
| 33.3d | 同意留痕 | `me-gap.ts`：`GET /me/consent/status`、`POST /me/consent/{privacy,terms}` | ✅ | |
| 33.4 | 渠道成本分析 | 前端 AdminCostDashboardPage/AdminVendorCostPage + 后端 `/admin/vendor-costs` | 🟡 | 管理端成本视图已有（见 §25）；独立成本分析报表另核 |
| 33.5 | 活动 ROI | `admin-marketing-missing.ts` campaigns | 🟡 | 归营销分片 |
| 33.6 | 对话留痕保留策略 | `services/audit/retention.ts`（定时清理）+ `admin-conversation-records.ts` retention 读/写/手动 run | ✅ | 数据合规脱敏/留痕按策略清理 |

## 33.2 关键架构

- 用户权利三闭环（导出/注销/同意）均已代码落地且有测试覆盖（me-consent.test、deletion.test、data-requests 相关测试），是合规基线最扎实的部分。
- 政策版本管理当前为 KV 简化实现；升级为独立版本表时需保留历史版本快照与用户同意版本关联，不影响既有同意留痕。

## 33.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | 隐私政策/服务条款独立版本表 + 草稿发布流 |
| P2 | 渠道成本分析独立报表页、活动 ROI 看板完善 |
