# 3Cloud 前端全量梳理报告

**生成时间**: 2026/7/24 18:41:25

## 1. 概览统计

| 类别 | 数量 | 说明 |
|------|------|------|
| 页面文件 | 488 | src/pages/ 下的所有.tsx/.ts文件 |
| 组件文件 | 62 | src/components/ 下的所有.tsx/.ts文件 |
| Hook文件 | 20 | src/hooks/ 下的所有.ts文件 |
| 大型组件(>300行) | 4 | 需要关注的重构候选 |
| 缺少memo的组件 | 36 | 存在props但未使用React.memo包装 |
| 有内联对象的组件 | 57 | 可能存在重渲染问题 |

## 2. 页面清单

### ./

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| Announcements.tsx | 187 | ✅ 1 | ❌ | ✅ | ⚠️ |
| ApiKeys.tsx | 497 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Dashboard.tsx | 503 | ❌ | ❌ | ❌ | ⚠️ |
| Docs.tsx | 351 | ❌ | ❌ | ❌ | ⚠️ |
| ForgotPassword.tsx | 95 | ❌ | ❌ | ❌ | ⚠️ |
| Login.tsx | 135 | ❌ | ❌ | ❌ | ⚠️ |
| LoginHistorySettings.tsx | 90 | ❌ | ❌ | ❌ | ⚠️ |
| Logs-virtual.tsx | 789 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Logs.tsx | 423 | ❌ | ❌ | ✅ | ⚠️ |
| Models.tsx | 646 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Notifications.tsx | 524 | ✅ 1 | ❌ | ✅ | ⚠️ |
| OperationLogs.tsx | 274 | ✅ 1 | ❌ | ✅ | ⚠️ |
| PreferenceSettings.tsx | 183 | ❌ | ❌ | ❌ | ⚠️ |
| ProfileSettings.tsx | 213 | ✅ 1 | ❌ | ❌ | ⚠️ |
| RealName.tsx | 313 | ❌ | ❌ | ❌ | ⚠️ |
| Recharge.tsx | 673 | ❌ | ❌ | ✅ | ⚠️ |
| Redemption.tsx | 269 | ❌ | ❌ | ✅ | ⚠️ |
| Register.tsx | 131 | ❌ | ❌ | ❌ | ⚠️ |
| ResetPassword.tsx | 143 | ❌ | ❌ | ❌ | ⚠️ |
| Security.tsx | 246 | ❌ | ❌ | ✅ | ⚠️ |
| SecuritySettings.tsx | 145 | ❌ | ❌ | ❌ | ⚠️ |
| SessionSettings.tsx | 139 | ❌ | ❌ | ✅ | ⚠️ |
| Settings.tsx | 75 | ❌ | ❌ | ❌ | ⚠️ |
| Stats.tsx | 801 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Transactions.tsx | 280 | ✅ 1 | ❌ | ✅ | ⚠️ |

### admin/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AdminApiKeys.tsx | 308 | ❌ | ❌ | ✅ | ⚠️ |
| AdminLogs.tsx | 177 | ❌ | ❌ | ✅ | ⚠️ |
| AdminModels.tsx | 124 | ❌ | ❌ | ✅ | ⚠️ |
| AgentClients.tsx | 46 | ❌ | ❌ | ❌ | ⚠️ |
| AgentDetail.tsx | 157 | ❌ | ❌ | ✅ | ⚠️ |
| agents-types.ts | 11 | ❌ | ❌ | ❌ | ✅ |
| Agents.tsx | 223 | ❌ | ❌ | ✅ | ⚠️ |
| AgentsList.tsx | 184 | ✅ 1 | ❌ | ❌ | ⚠️ |
| Announcements.tsx | 185 | ❌ | ❌ | ✅ | ⚠️ |
| AuditLogs.tsx | 202 | ❌ | ❌ | ✅ | ⚠️ |
| CampaignDetail.tsx | 6 | ❌ | ❌ | ❌ | ✅ |
| Campaigns.tsx | 256 | ❌ | ❌ | ✅ | ⚠️ |
| CircuitBreakers.tsx | 279 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Configs.tsx | 160 | ❌ | ❌ | ✅ | ⚠️ |
| Dashboard.tsx | 273 | ❌ | ❌ | ✅ | ⚠️ |
| EmailTemplates.tsx | 281 | ❌ | ❌ | ✅ | ⚠️ |
| EnterpriseAnalysis.tsx | 294 | ❌ | ❌ | ✅ | ⚠️ |
| feature-descriptions.ts | 918 | ❌ | ❌ | ❌ | ⚠️ |
| FinanceCommissions.tsx | 143 | ❌ | ❌ | ❌ | ⚠️ |
| FinanceDashboard.tsx | 541 | ✅ 2 | ❌ | ✅ | ⚠️ |
| FinanceReconciliation.tsx | 79 | ❌ | ❌ | ❌ | ⚠️ |
| KeyModelPricesModal.tsx | 269 | ✅ 6 | ❌ | ✅ | ⚠️ |
| OperationLogs.tsx | 350 | ✅ 1 | ❌ | ✅ | ⚠️ |
| PageContents.tsx | 124 | ❌ | ❌ | ✅ | ⚠️ |
| Playground.tsx | 132 | ❌ | ❌ | ✅ | ⚠️ |
| ProfitAnalysis.tsx | 92 | ❌ | ❌ | ❌ | ⚠️ |
| PromptAudit.tsx | 195 | ❌ | ❌ | ❌ | ⚠️ |
| Quotas.tsx | 258 | ❌ | ❌ | ✅ | ⚠️ |
| RateLimits.tsx | 313 | ✅ 4 | ❌ | ✅ | ⚠️ |
| RealNameReview.tsx | 340 | ❌ | ❌ | ✅ | ⚠️ |
| RechargeOrders.tsx | 212 | ❌ | ❌ | ✅ | ⚠️ |
| RedemptionCodes.tsx | 381 | ❌ | ❌ | ❌ | ⚠️ |
| RoleFormModal.tsx | 237 | ✅ 2 | ❌ | ❌ | ⚠️ |
| Roles.tsx | 178 | ❌ | ❌ | ❌ | ⚠️ |
| SecurityAlerts.tsx | 278 | ❌ | ❌ | ✅ | ⚠️ |
| SecurityAutoRules.tsx | 170 | ❌ | ❌ | ✅ | ⚠️ |
| SecurityBans.tsx | 160 | ❌ | ❌ | ✅ | ⚠️ |
| SecurityConfig.tsx | 291 | ❌ | ❌ | ✅ | ⚠️ |
| SecurityDashboard.tsx | 286 | ❌ | ❌ | ✅ | ⚠️ |
| SecurityEvents.tsx | 188 | ❌ | ❌ | ✅ | ⚠️ |
| SensitiveWords.tsx | 252 | ❌ | ❌ | ✅ | ⚠️ |
| SiteSettings.tsx | 87 | ❌ | ❌ | ✅ | ⚠️ |
| Stats.tsx | 132 | ❌ | ❌ | ✅ | ⚠️ |
| SystemHealthPanel.tsx | 86 | ❌ | ❌ | ✅ | ⚠️ |
| TrendsCharts.tsx | 287 | ❌ | ❌ | ✅ | ⚠️ |
| Users.tsx | 3 | ❌ | ❌ | ❌ | ✅ |
| VendorKeyGroups.backup.tsx | 321 | ❌ | ❌ | ❌ | ⚠️ |
| VendorKeyGroups.tsx | 616 | ❌ | ✅ | ✅ | ⚠️ |
| VendorModels.tsx | 143 | ❌ | ❌ | ❌ | ⚠️ |
| Vendors.tsx | 215 | ❌ | ❌ | ❌ | ⚠️ |
| VendorSelfMgmt.tsx | 305 | ❌ | ❌ | ✅ | ⚠️ |
| WithdrawOrders.tsx | 382 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Withdraws.tsx | 209 | ❌ | ❌ | ✅ | ⚠️ |

### admin\admin-logs/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| LogAnalyticsPanel.tsx | 299 | ✅ 1 | ❌ | ✅ | ⚠️ |
| LogDetail.tsx | 8 | ❌ | ❌ | ❌ | ✅ |
| LogFilters.tsx | 40 | ✅ 6 | ❌ | ❌ | ⚠️ |
| LogList.tsx | 139 | ✅ 10 | ❌ | ❌ | ⚠️ |
| LogStatsCards.tsx | 144 | ✅ 6 | ✅ | ❌ | ⚠️ |
| StatusBadge.tsx | 26 | ✅ 1 | ❌ | ❌ | ⚠️ |
| types.ts | 92 | ✅ 1 | ❌ | ❌ | ✅ |

### admin\admin-models/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ModelForm.tsx | 199 | ✅ 5 | ❌ | ❌ | ⚠️ |
| ModelList.tsx | 275 | ✅ 17 | ❌ | ✅ | ⚠️ |
| ModelStatsCards.tsx | 102 | ✅ 3 | ❌ | ✅ | ⚠️ |
| types.ts | 52 | ❌ | ❌ | ❌ | ✅ |

### admin\agent-detail/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AgentClientsTab.tsx | 386 | ✅ 3 | ❌ | ✅ | ⚠️ |
| AgentInfoTab.tsx | 254 | ✅ 1 | ❌ | ✅ | ⚠️ |
| CommissionModal.tsx | 341 | ✅ 5 | ❌ | ✅ | ⚠️ |
| CommissionTab.tsx | 292 | ✅ 2 | ❌ | ✅ | ⚠️ |
| config.tsx | 65 | ❌ | ❌ | ❌ | ⚠️ |
| DetailHeader.tsx | 212 | ✅ 6 | ❌ | ✅ | ⚠️ |
| types.ts | 6 | ❌ | ❌ | ❌ | ✅ |

### admin\agents-list/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 29 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\agents-list\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AgentTable.tsx | 95 | ✅ 3 | ❌ | ❌ | ⚠️ |
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |

### admin\agents-list\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useAgentsList.ts | 77 | ✅ 1 | ❌ | ✅ | ✅ |

### admin\announcements/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AnnounceEditor.tsx | 162 | ✅ 3 | ❌ | ✅ | ⚠️ |
| AnnounceList.tsx | 193 | ✅ 1 | ✅ | ✅ | ⚠️ |
| AnnounceStats.tsx | 106 | ✅ 2 | ❌ | ✅ | ⚠️ |
| types.ts | 30 | ❌ | ❌ | ❌ | ⚠️ |

### admin\api-keys/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| KeyCreateForm.tsx | 254 | ✅ 3 | ❌ | ✅ | ⚠️ |
| KeyList.tsx | 193 | ✅ 15 | ❌ | ✅ | ⚠️ |
| KeyStatsCards.tsx | 96 | ✅ 6 | ❌ | ✅ | ⚠️ |
| KeyUsageLogs.tsx | 218 | ✅ 2 | ❌ | ✅ | ⚠️ |
| UsageExampleRow.tsx | 117 | ✅ 2 | ❌ | ✅ | ⚠️ |

### admin\audit-logs/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AuditDetail.tsx | 232 | ✅ 1 | ❌ | ❌ | ⚠️ |
| AuditFilters.tsx | 71 | ✅ 3 | ❌ | ❌ | ⚠️ |
| AuditList.tsx | 141 | ✅ 1 | ❌ | ❌ | ⚠️ |
| AuditStatsCards.tsx | 126 | ✅ 2 | ❌ | ❌ | ⚠️ |
| types.ts | 143 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\campaigns/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AllocationFormModal.tsx | 181 | ✅ 4 | ❌ | ❌ | ⚠️ |
| CampaignDetail.tsx | 195 | ❌ | ❌ | ✅ | ⚠️ |
| CampaignForm.tsx | 189 | ✅ 3 | ❌ | ❌ | ⚠️ |
| CampaignInfo.tsx | 260 | ✅ 4 | ❌ | ❌ | ⚠️ |
| CampaignList.tsx | 176 | ✅ 5 | ❌ | ✅ | ⚠️ |
| CampaignMetrics.tsx | 136 | ✅ 4 | ❌ | ✅ | ⚠️ |
| CampaignRedemptions.tsx | 282 | ✅ 4 | ❌ | ✅ | ⚠️ |
| CampaignStatsCards.tsx | 112 | ✅ 8 | ❌ | ✅ | ⚠️ |
| types.ts | 85 | ❌ | ❌ | ❌ | ⚠️ |

### admin\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| CommissionStatsPanel.tsx | 102 | ✅ 2 | ✅ | ❌ | ⚠️ |
| CommissionTable.tsx | 145 | ✅ 4 | ✅ | ✅ | ⚠️ |
| KeyGroupPanel.tsx | 240 | ✅ 7 | ❌ | ❌ | ⚠️ |
| KeyItemTable.tsx | 414 | ✅ 1 | ✅ | ✅ | ⚠️ |

### admin\dashboard/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AlertBar.tsx | 28 | ✅ 2 | ❌ | ❌ | ✅ |
| KpiCards.tsx | 148 | ✅ 2 | ✅ | ❌ | ⚠️ |
| ModelRankBar.tsx | 68 | ✅ 1 | ❌ | ❌ | ⚠️ |
| ModelSchedulingRealtime.tsx | 111 | ❌ | ❌ | ❌ | ⚠️ |
| OverviewTrends.tsx | 120 | ✅ 6 | ❌ | ❌ | ⚠️ |
| QuickActions.tsx | 79 | ✅ 1 | ❌ | ❌ | ⚠️ |
| RecentActivity.tsx | 247 | ✅ 1 | ❌ | ✅ | ⚠️ |
| RevenueBreakdown.tsx | 104 | ✅ 1 | ❌ | ❌ | ⚠️ |
| RevenueChart.tsx | 84 | ✅ 2 | ❌ | ❌ | ⚠️ |
| StatsCards.tsx | 191 | ✅ 3 | ✅ | ❌ | ⚠️ |
| SummaryBar.tsx | 98 | ✅ 7 | ❌ | ❌ | ⚠️ |
| TimeRangeSelector.tsx | 49 | ✅ 4 | ❌ | ❌ | ⚠️ |
| TodoQueue.tsx | 108 | ✅ 1 | ❌ | ❌ | ⚠️ |
| TopModels.tsx | 120 | ✅ 1 | ❌ | ✅ | ⚠️ |
| TopUsersTable.tsx | 68 | ✅ 1 | ❌ | ❌ | ⚠️ |
| types.ts | 26 | ✅ 2 | ❌ | ❌ | ✅ |
| UsageChart.tsx | 87 | ✅ 2 | ❌ | ❌ | ⚠️ |
| VendorHealthPanel.tsx | 94 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\email-templates/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| TemplateEditor.tsx | 159 | ✅ 6 | ❌ | ✅ | ⚠️ |
| TemplateList.tsx | 97 | ✅ 4 | ❌ | ✅ | ⚠️ |
| TemplatePreview.tsx | 22 | ✅ 2 | ❌ | ❌ | ⚠️ |
| TemplateStats.tsx | 111 | ✅ 2 | ❌ | ✅ | ⚠️ |
| types.ts | 35 | ❌ | ❌ | ❌ | ⚠️ |

### admin\enterprise/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ActivityRecord.tsx | 235 | ✅ 5 | ❌ | ✅ | ⚠️ |
| AnalysisOverview.tsx | 308 | ✅ 1 | ❌ | ✅ | ⚠️ |
| BillingDashboard.tsx | 198 | ✅ 3 | ❌ | ✅ | ⚠️ |
| EnterpriseList.tsx | 299 | ✅ 3 | ❌ | ❌ | ⚠️ |
| ModelDistribution.tsx | 225 | ✅ 2 | ❌ | ✅ | ⚠️ |
| types.ts | 205 | ✅ 1 | ❌ | ❌ | ⚠️ |
| UsageTrend.tsx | 264 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\enterprise-analysis/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ActivityTab.tsx | 169 | ✅ 4 | ❌ | ❌ | ⚠️ |
| ConsumptionTrend.tsx | 125 | ✅ 4 | ❌ | ❌ | ⚠️ |
| EnterpriseOverview.tsx | 155 | ✅ 5 | ❌ | ❌ | ⚠️ |
| FinanceTab.tsx | 163 | ✅ 3 | ❌ | ❌ | ⚠️ |
| GeographicDistribution.tsx | 52 | ✅ 1 | ❌ | ❌ | ⚠️ |
| index.tsx | 530 | ❌ | ❌ | ✅ | ⚠️ |
| LowBalanceAlert.tsx | 50 | ✅ 2 | ❌ | ❌ | ⚠️ |
| ModelUsage.tsx | 43 | ✅ 2 | ❌ | ❌ | ⚠️ |
| shared.tsx | 27 | ✅ 1 | ❌ | ❌ | ⚠️ |
| TokenDistribution.tsx | 205 | ✅ 2 | ❌ | ❌ | ⚠️ |
| types.ts | 180 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\finance/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AdminCostDetail.tsx | 276 | ✅ 2 | ❌ | ✅ | ⚠️ |
| AgentCostDetail.tsx | 378 | ✅ 2 | ❌ | ✅ | ⚠️ |
| AgentSettlement.tsx | 273 | ✅ 1 | ❌ | ✅ | ⚠️ |
| CodeCostDashboard.tsx | 235 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Invoices.tsx | 285 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Prices.tsx | 194 | ❌ | ❌ | ❌ | ⚠️ |
| Refunds.tsx | 242 | ✅ 1 | ❌ | ✅ | ⚠️ |

### admin\finance-commissions/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 42 | ✅ 1 | ❌ | ❌ | ⚠️ |
| utils.ts | 54 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\finance-commissions\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| CommissionTable.tsx | 68 | ✅ 2 | ❌ | ❌ | ⚠️ |
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |

### admin\finance-commissions\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useFinanceCommissions.ts | 54 | ❌ | ❌ | ✅ | ✅ |

### admin\finance-reconciliation/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 23 | ✅ 2 | ❌ | ❌ | ✅ |

### admin\finance-reconciliation\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| BalanceChecks.tsx | 45 | ✅ 1 | ❌ | ❌ | ⚠️ |
| index.ts | 2 | ❌ | ❌ | ❌ | ✅ |
| SummaryCards.tsx | 53 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\finance-reconciliation\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useReconciliation.ts | 43 | ❌ | ❌ | ✅ | ✅ |

### admin\finance\prices/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 47 | ✅ 1 | ❌ | ❌ | ✅ |

### admin\finance\prices\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| PriceTable.tsx | 70 | ✅ 2 | ❌ | ❌ | ⚠️ |

### admin\finance\prices\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| usePrices.ts | 68 | ❌ | ❌ | ✅ | ✅ |

### admin\model-scheduling/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 40 | ✅ 2 | ❌ | ❌ | ⚠️ |

### admin\model-scheduling\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| SchedulingChart.tsx | 72 | ✅ 3 | ❌ | ❌ | ⚠️ |

### admin\model-scheduling\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useScheduling.ts | 53 | ❌ | ❌ | ✅ | ✅ |

### admin\overview-trends/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 56 | ❌ | ❌ | ❌ | ✅ |

### admin\overview-trends\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 2 | ❌ | ❌ | ❌ | ✅ |
| MetricSelector.tsx | 73 | ✅ 5 | ❌ | ❌ | ⚠️ |
| TrendChart.tsx | 71 | ✅ 4 | ❌ | ❌ | ⚠️ |

### admin\overview-trends\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useOverviewTrends.ts | 30 | ✅ 1 | ❌ | ✅ | ✅ |

### admin\page-contents/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ContentEditor.tsx | 55 | ✅ 4 | ❌ | ❌ | ⚠️ |
| ContentList.tsx | 101 | ✅ 9 | ❌ | ❌ | ⚠️ |
| ContentPreview.tsx | 30 | ✅ 1 | ❌ | ❌ | ⚠️ |
| ContentStatsCards.tsx | 59 | ✅ 2 | ❌ | ✅ | ⚠️ |
| CreateContentModal.tsx | 105 | ✅ 2 | ❌ | ❌ | ⚠️ |
| types.ts | 33 | ❌ | ❌ | ❌ | ✅ |

### admin\playground/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| EndpointSelector.tsx | 46 | ✅ 5 | ✅ | ❌ | ⚠️ |
| RequestPanel.tsx | 85 | ✅ 9 | ❌ | ✅ | ⚠️ |
| ResponsePanel.tsx | 233 | ✅ 2 | ❌ | ❌ | ⚠️ |
| types.ts | 38 | ❌ | ❌ | ❌ | ✅ |
| UsageStats.tsx | 83 | ✅ 1 | ❌ | ✅ | ⚠️ |

### admin\profit-analysis/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 88 | ✅ 2 | ❌ | ❌ | ✅ |
| utils.ts | 80 | ✅ 1 | ❌ | ❌ | ✅ |

### admin\profit-analysis\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 4 | ❌ | ❌ | ❌ | ✅ |
| LowMarginAlert.tsx | 38 | ✅ 1 | ❌ | ❌ | ⚠️ |
| ModelTable.tsx | 69 | ✅ 2 | ❌ | ❌ | ⚠️ |
| SummaryCards.tsx | 68 | ✅ 1 | ❌ | ❌ | ⚠️ |
| TrendChart.tsx | 61 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\profit-analysis\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useProfitAnalysis.ts | 56 | ❌ | ❌ | ✅ | ⚠️ |

### admin\prompt-audit/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 38 | ❌ | ❌ | ❌ | ✅ |

### admin\prompt-audit\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AuditDetail.tsx | 113 | ✅ 4 | ❌ | ❌ | ⚠️ |
| AuditTable.tsx | 112 | ✅ 3 | ❌ | ❌ | ⚠️ |
| index.ts | 2 | ❌ | ❌ | ❌ | ✅ |

### admin\prompt-audit\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| usePromptAudit.ts | 93 | ❌ | ❌ | ✅ | ✅ |

### admin\quotas/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| QuotaForm.tsx | 320 | ✅ 9 | ❌ | ❌ | ⚠️ |
| QuotaList.tsx | 218 | ✅ 15 | ❌ | ✅ | ⚠️ |
| QuotaStatsCards.tsx | 96 | ✅ 6 | ❌ | ✅ | ⚠️ |
| QuotaUsageChart.tsx | 47 | ✅ 3 | ❌ | ✅ | ⚠️ |
| types.ts | 44 | ❌ | ❌ | ❌ | ✅ |

### admin\rate-limits/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| LimitAnalytics.tsx | 222 | ✅ 1 | ❌ | ✅ | ⚠️ |
| LimitForm.tsx | 225 | ✅ 4 | ❌ | ❌ | ⚠️ |
| LimitList.tsx | 246 | ✅ 3 | ❌ | ✅ | ⚠️ |
| LimitLogs.tsx | 193 | ✅ 2 | ❌ | ✅ | ⚠️ |
| LimitStatsCards.tsx | 159 | ✅ 4 | ✅ | ✅ | ⚠️ |
| types.ts | 64 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\real-name/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ReviewDetail.tsx | 307 | ✅ 6 | ❌ | ✅ | ⚠️ |
| ReviewList.tsx | 183 | ✅ 21 | ❌ | ❌ | ⚠️ |
| ReviewStatsCards.tsx | 113 | ✅ 1 | ❌ | ✅ | ⚠️ |
| types.ts | 91 | ✅ 2 | ❌ | ❌ | ⚠️ |

### admin\recharge/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| BatchReviewDialog.tsx | 185 | ✅ 6 | ❌ | ✅ | ⚠️ |
| OrderFilterBar.tsx | 97 | ✅ 9 | ❌ | ✅ | ⚠️ |
| OrderList.tsx | 157 | ✅ 3 | ❌ | ✅ | ⚠️ |
| OrderListUtils.tsx | 108 | ✅ 1 | ❌ | ✅ | ⚠️ |
| OrderStatsCards.tsx | 120 | ✅ 2 | ❌ | ✅ | ⚠️ |
| ReviewDialog.tsx | 251 | ✅ 6 | ❌ | ✅ | ⚠️ |

### admin\redemption/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AgentCodeDetail.tsx | 141 | ✅ 14 | ❌ | ✅ | ⚠️ |
| AgentOverview.tsx | 121 | ✅ 4 | ❌ | ❌ | ⚠️ |
| BatchCreateForm.tsx | 158 | ✅ 2 | ❌ | ✅ | ⚠️ |
| CodeDetail.tsx | 239 | ✅ 4 | ❌ | ✅ | ⚠️ |
| CodeList.tsx | 222 | ✅ 21 | ❌ | ✅ | ⚠️ |
| StatsCards.tsx | 167 | ✅ 6 | ✅ | ✅ | ⚠️ |
| types.ts | 163 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\redemption-codes/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 102 | ❌ | ❌ | ❌ | ✅ |

### admin\redemption-codes\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 6 | ❌ | ❌ | ❌ | ✅ |
| useRedemptionBatches.ts | 83 | ✅ 1 | ❌ | ✅ | ⚠️ |
| useRedemptionCodes.ts | 74 | ✅ 1 | ❌ | ✅ | ⚠️ |
| useRedemptionStats.ts | 31 | ❌ | ❌ | ❌ | ✅ |

### admin\redemption\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AuditLogsTab.tsx | 121 | ✅ 13 | ❌ | ❌ | ⚠️ |
| BatchesTab.tsx | 120 | ✅ 14 | ❌ | ❌ | ⚠️ |
| FraudTab.tsx | 434 | ✅ 5 | ❌ | ❌ | ⚠️ |
| index.ts | 5 | ❌ | ❌ | ❌ | ✅ |
| LogsTab.tsx | 144 | ✅ 13 | ❌ | ❌ | ⚠️ |
| ReportsTab.tsx | 59 | ✅ 5 | ❌ | ❌ | ⚠️ |

### admin\redemption\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 8 | ❌ | ❌ | ❌ | ✅ |
| useRedemptionAgent.ts | 131 | ❌ | ❌ | ✅ | ✅ |
| useRedemptionAudit.ts | 52 | ❌ | ❌ | ✅ | ⚠️ |
| useRedemptionBatches.ts | 82 | ❌ | ❌ | ✅ | ✅ |
| useRedemptionCodes.ts | 119 | ❌ | ❌ | ✅ | ⚠️ |
| useRedemptionFraud.ts | 176 | ❌ | ❌ | ✅ | ⚠️ |
| useRedemptionLogs.ts | 78 | ❌ | ❌ | ✅ | ⚠️ |
| useRedemptionStats.ts | 26 | ❌ | ❌ | ✅ | ✅ |

### admin\roles/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 70 | ✅ 1 | ❌ | ❌ | ✅ |

### admin\roles\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 3 | ❌ | ❌ | ❌ | ✅ |
| PermissionMatrix.tsx | 56 | ✅ 2 | ❌ | ❌ | ⚠️ |
| RoleList.tsx | 60 | ✅ 5 | ❌ | ❌ | ⚠️ |
| UserAssignment.tsx | 110 | ✅ 8 | ❌ | ❌ | ⚠️ |

### admin\roles\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 2 | ❌ | ❌ | ❌ | ✅ |
| useRoles.ts | 71 | ❌ | ❌ | ✅ | ✅ |
| useRoleUsers.ts | 62 | ✅ 1 | ❌ | ✅ | ✅ |

### admin\security-bans/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| BanForm.tsx | 162 | ✅ 3 | ❌ | ✅ | ⚠️ |
| BanList.tsx | 163 | ✅ 1 | ❌ | ✅ | ⚠️ |
| BanStatsCards.tsx | 70 | ✅ 3 | ❌ | ✅ | ⚠️ |
| types.ts | 13 | ❌ | ❌ | ❌ | ✅ |

### admin\security-events/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| EventDetail.tsx | 190 | ✅ 3 | ❌ | ✅ | ⚠️ |
| EventFilters.tsx | 72 | ✅ 7 | ❌ | ✅ | ⚠️ |
| EventList.tsx | 240 | ✅ 15 | ❌ | ✅ | ⚠️ |
| EventStatsCards.tsx | 130 | ❌ | ❌ | ❌ | ⚠️ |
| types.ts | 21 | ❌ | ❌ | ❌ | ⚠️ |

### admin\security-rules/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| RuleForm.tsx | 151 | ✅ 6 | ❌ | ✅ | ⚠️ |
| RuleList.tsx | 108 | ✅ 4 | ❌ | ❌ | ⚠️ |
| RuleStatsCards.tsx | 105 | ✅ 3 | ❌ | ✅ | ⚠️ |
| types.ts | 71 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\sensitive-words/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 39 | ❌ | ❌ | ❌ | ✅ |

### admin\sensitive-words\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 2 | ❌ | ❌ | ❌ | ✅ |
| WordForm.tsx | 133 | ✅ 3 | ❌ | ❌ | ⚠️ |
| WordTable.tsx | 94 | ✅ 4 | ❌ | ❌ | ⚠️ |

### admin\sensitive-words\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useSensitiveWords.ts | 90 | ❌ | ❌ | ✅ | ✅ |

### admin\site-settings/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ApiSettings.tsx | 182 | ❌ | ❌ | ✅ | ⚠️ |
| BillingSettings.tsx | 184 | ❌ | ❌ | ✅ | ⚠️ |
| EmailSettings.tsx | 152 | ❌ | ❌ | ✅ | ⚠️ |
| FieldRenderer.tsx | 211 | ✅ 6 | ❌ | ❌ | ⚠️ |
| GeneralSettings.tsx | 271 | ❌ | ❌ | ✅ | ⚠️ |
| SecuritySettings.tsx | 182 | ❌ | ❌ | ✅ | ⚠️ |
| types.ts | 228 | ✅ 2 | ❌ | ❌ | ⚠️ |

### admin\stats/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AggregatedQueryCard.tsx | 220 | ✅ 1 | ❌ | ✅ | ⚠️ |
| HourlyDistribution.tsx | 103 | ✅ 1 | ❌ | ✅ | ⚠️ |
| ModelDistribution.tsx | 103 | ✅ 1 | ❌ | ✅ | ⚠️ |
| OverviewCards.tsx | 152 | ✅ 2 | ✅ | ✅ | ⚠️ |
| PeriodSelector.tsx | 32 | ✅ 2 | ❌ | ✅ | ⚠️ |
| TabNavigation.tsx | 44 | ✅ 4 | ❌ | ❌ | ⚠️ |
| Tooltips.tsx | 30 | ✅ 3 | ❌ | ❌ | ⚠️ |
| TopUsers.tsx | 103 | ✅ 1 | ❌ | ✅ | ⚠️ |
| TrendChart.tsx | 55 | ✅ 1 | ❌ | ✅ | ⚠️ |
| types.ts | 145 | ✅ 1 | ❌ | ❌ | ✅ |
| VendorBreakdownCard.tsx | 44 | ✅ 2 | ❌ | ❌ | ⚠️ |

### admin\system-health/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| HealthStatsCards.tsx | 225 | ✅ 1 | ✅ | ✅ | ⚠️ |
| ServiceList.tsx | 245 | ✅ 1 | ❌ | ✅ | ⚠️ |
| SystemMetrics.tsx | 61 | ✅ 1 | ❌ | ❌ | ⚠️ |
| types.ts | 31 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\trends/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ComparisonChart.tsx | 102 | ✅ 1 | ❌ | ✅ | ⚠️ |
| ExportControls.tsx | 80 | ✅ 5 | ❌ | ❌ | ⚠️ |
| TimeSeriesChart.tsx | 218 | ✅ 9 | ❌ | ✅ | ⚠️ |
| TrendsCards.tsx | 181 | ✅ 2 | ✅ | ✅ | ⚠️ |
| types.ts | 98 | ✅ 2 | ❌ | ❌ | ✅ |

### admin\users/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ActionButtons.tsx | 325 | ✅ 2 | ❌ | ❌ | ⚠️ |
| CreateUserModal.tsx | 184 | ✅ 1 | ❌ | ❌ | ⚠️ |
| UserBalancePanel.tsx | 176 | ✅ 2 | ❌ | ✅ | ⚠️ |
| UserCallStatsTab.tsx | 219 | ✅ 1 | ❌ | ✅ | ⚠️ |
| UserDetailPanel.tsx | 110 | ✅ 2 | ❌ | ❌ | ⚠️ |
| UserDetailTabs.tsx | 257 | ✅ 2 | ❌ | ✅ | ⚠️ |
| UserInfoTab.tsx | 323 | ✅ 2 | ❌ | ❌ | ⚠️ |
| UserKeyPanel.tsx | 162 | ✅ 2 | ❌ | ✅ | ⚠️ |
| UserList.tsx | 202 | ✅ 1 | ❌ | ❌ | ⚠️ |
| UserLogPanel.tsx | 99 | ✅ 1 | ❌ | ❌ | ⚠️ |
| UsersPage.tsx | 201 | ✅ 1 | ❌ | ❌ | ⚠️ |
| UserStatsCard.tsx | 130 | ✅ 2 | ❌ | ✅ | ⚠️ |
| utils.ts | 111 | ✅ 1 | ❌ | ❌ | ⚠️ |
| _shared.ts | 84 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\users\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| UserActions.tsx | 76 | ❌ | ✅ | ❌ | ⚠️ |
| UserFilters.tsx | 105 | ❌ | ✅ | ❌ | ⚠️ |
| UsersList.tsx | 198 | ❌ | ✅ | ❌ | ⚠️ |

### admin\users\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| useUserActions.ts | 205 | ❌ | ❌ | ✅ | ✅ |
| useUsers.ts | 152 | ✅ 2 | ❌ | ✅ | ⚠️ |

### admin\vendor-key-groups/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 74 | ❌ | ❌ | ❌ | ✅ |
| utils.ts | 102 | ✅ 1 | ❌ | ❌ | ✅ |
| VendorKeyGroupsPage.tsx | 381 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\vendor-key-groups\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| BatchOperations.tsx | 133 | ❌ | ✅ | ❌ | ⚠️ |
| FiltersPanel.tsx | 164 | ❌ | ✅ | ❌ | ⚠️ |
| GroupList.tsx | 126 | ✅ 8 | ❌ | ❌ | ⚠️ |
| index.ts | 8 | ❌ | ❌ | ❌ | ✅ |
| KeyFilters.tsx | 113 | ✅ 6 | ❌ | ❌ | ⚠️ |
| KeyHealthIndicator.tsx | 63 | ❌ | ✅ | ❌ | ⚠️ |
| KeyItemsTable.tsx | 298 | ❌ | ✅ | ❌ | ⚠️ |
| KeyTable.tsx | 308 | ✅ 1 | ❌ | ❌ | ⚠️ |
| VendorSelector.tsx | 39 | ✅ 6 | ❌ | ❌ | ⚠️ |

### admin\vendor-key-groups\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 3 | ❌ | ❌ | ❌ | ✅ |
| useKeyGroups.ts | 53 | ✅ 1 | ❌ | ✅ | ✅ |
| useKeyItems.ts | 81 | ✅ 1 | ❌ | ✅ | ⚠️ |
| useVendorKeyGroups.ts | 548 | ✅ 2 | ❌ | ✅ | ⚠️ |
| useVendors.ts | 26 | ❌ | ❌ | ❌ | ✅ |

### admin\vendor-models/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ConnectivityTest.tsx | 79 | ✅ 2 | ❌ | ✅ | ⚠️ |
| ModelEditForm.tsx | 278 | ✅ 3 | ❌ | ✅ | ⚠️ |
| ModelStatsCards.tsx | 110 | ✅ 6 | ❌ | ✅ | ⚠️ |
| ModelTable.tsx | 368 | ✅ 1 | ❌ | ✅ | ⚠️ |
| PriceConfigForm.tsx | 92 | ✅ 7 | ❌ | ✅ | ⚠️ |
| types.ts | 148 | ❌ | ❌ | ❌ | ⚠️ |

### admin\vendor-models\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| CreateModal.tsx | 279 | ✅ 2 | ❌ | ❌ | ⚠️ |
| DeleteModal.tsx | 68 | ✅ 3 | ❌ | ❌ | ⚠️ |
| EditModal.tsx | 283 | ✅ 3 | ❌ | ❌ | ⚠️ |
| index.ts | 4 | ❌ | ❌ | ❌ | ✅ |
| ModelTable.tsx | 126 | ✅ 4 | ❌ | ❌ | ⚠️ |

### admin\vendor-models\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useVendorModels.ts | 110 | ✅ 1 | ❌ | ✅ | ⚠️ |

### admin\vendor-self/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ApiKeyPanel.tsx | 110 | ✅ 4 | ❌ | ✅ | ⚠️ |
| ModelList.tsx | 307 | ✅ 5 | ❌ | ✅ | ⚠️ |
| OverviewCards.tsx | 135 | ✅ 5 | ✅ | ✅ | ⚠️ |
| ProfilePanel.tsx | 227 | ✅ 4 | ❌ | ✅ | ⚠️ |
| types.tsx | 78 | ✅ 1 | ❌ | ❌ | ⚠️ |
| UsageStats.tsx | 118 | ✅ 4 | ❌ | ✅ | ⚠️ |

### admin\vendors/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 20 | ✅ 1 | ❌ | ❌ | ⚠️ |

### admin\vendors\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| VendorTable.tsx | 73 | ✅ 4 | ❌ | ❌ | ⚠️ |

### admin\vendors\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useVendors.ts | 75 | ❌ | ❌ | ✅ | ✅ |

### admin\withdraws/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| types.ts | 22 | ❌ | ❌ | ❌ | ✅ |
| WithdrawList.tsx | 222 | ✅ 1 | ❌ | ❌ | ⚠️ |
| WithdrawReview.tsx | 220 | ✅ 6 | ❌ | ✅ | ⚠️ |
| WithdrawStatsCards.tsx | 106 | ✅ 1 | ❌ | ✅ | ⚠️ |

### agent/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| Clients.tsx | 165 | ❌ | ❌ | ✅ | ⚠️ |
| Commissions.tsx | 179 | ❌ | ❌ | ✅ | ⚠️ |
| Dashboard.tsx | 129 | ❌ | ❌ | ✅ | ⚠️ |
| Finance.tsx | 140 | ❌ | ❌ | ✅ | ⚠️ |
| Notifications.tsx | 256 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Reconciliation.tsx | 60 | ❌ | ❌ | ✅ | ⚠️ |
| Redemption.tsx | 284 | ❌ | ❌ | ✅ | ⚠️ |
| Team.tsx | 336 | ✅ 1 | ❌ | ✅ | ⚠️ |
| Withdraw.tsx | 250 | ❌ | ❌ | ✅ | ⚠️ |

### agent\agent-dashboard/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| KpiCards.tsx | 78 | ✅ 1 | ❌ | ✅ | ⚠️ |
| QuickActions.tsx | 24 | ✅ 1 | ❌ | ❌ | ⚠️ |
| RecentOrders.tsx | 204 | ✅ 2 | ❌ | ✅ | ⚠️ |
| TrendChart.tsx | 152 | ✅ 4 | ❌ | ✅ | ⚠️ |
| types.tsx | 110 | ✅ 1 | ❌ | ❌ | ⚠️ |

### agent\clients/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ClientDetail.tsx | 164 | ✅ 1 | ❌ | ✅ | ⚠️ |
| ClientList.tsx | 177 | ✅ 14 | ❌ | ❌ | ⚠️ |
| ClientStatsCards.tsx | 52 | ✅ 6 | ❌ | ❌ | ⚠️ |
| types.tsx | 48 | ❌ | ❌ | ❌ | ✅ |

### agent\commissions/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| CommissionList.tsx | 229 | ✅ 25 | ✅ | ✅ | ⚠️ |
| CommissionSettings.tsx | 192 | ✅ 3 | ✅ | ❌ | ⚠️ |
| CommissionStatsCards.tsx | 93 | ✅ 2 | ✅ | ✅ | ⚠️ |
| types.ts | 62 | ✅ 1 | ❌ | ❌ | ⚠️ |

### agent\finance/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| BalanceHistory.tsx | 76 | ✅ 2 | ❌ | ✅ | ⚠️ |
| FinanceStatsCards.tsx | 98 | ✅ 2 | ❌ | ✅ | ⚠️ |
| TransactionList.tsx | 176 | ✅ 14 | ❌ | ✅ | ⚠️ |
| types.ts | 68 | ✅ 1 | ❌ | ❌ | ⚠️ |

### agent\reconciliation/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ReconDetail.tsx | 136 | ❌ | ✅ | ✅ | ⚠️ |
| ReconList.tsx | 162 | ❌ | ✅ | ✅ | ⚠️ |
| ReconStatsCards.tsx | 70 | ✅ 2 | ✅ | ✅ | ⚠️ |
| types.ts | 77 | ✅ 1 | ❌ | ❌ | ⚠️ |

### agent\redemption/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| BatchCreateForm.tsx | 170 | ✅ 5 | ❌ | ❌ | ⚠️ |
| CodeList.tsx | 199 | ✅ 22 | ❌ | ❌ | ⚠️ |
| DistributionPanel.tsx | 107 | ✅ 4 | ❌ | ❌ | ⚠️ |
| RedemptionStatsCards.tsx | 78 | ✅ 5 | ❌ | ❌ | ⚠️ |
| types.ts | 83 | ✅ 2 | ❌ | ❌ | ⚠️ |

### dashboard/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| constants.ts | 28 | ✅ 1 | ❌ | ❌ | ⚠️ |
| index.ts | 7 | ❌ | ❌ | ❌ | ✅ |
| types.ts | 58 | ❌ | ❌ | ❌ | ✅ |
| utils.ts | 22 | ✅ 1 | ❌ | ❌ | ✅ |

### dashboard\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| StatCard.tsx | 26 | ✅ 5 | ❌ | ❌ | ⚠️ |

### dashboard\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| useDashboard.ts | 192 | ✅ 1 | ❌ | ✅ | ⚠️ |

### finance/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| Invoices.tsx | 98 | ❌ | ❌ | ✅ | ⚠️ |
| Refunds.tsx | 97 | ❌ | ❌ | ✅ | ⚠️ |

### finance\invoices/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| InvoiceForm.tsx | 148 | ✅ 3 | ❌ | ✅ | ⚠️ |
| InvoiceList.tsx | 108 | ✅ 10 | ❌ | ❌ | ⚠️ |
| InvoiceStatsCards.tsx | 41 | ✅ 1 | ❌ | ❌ | ⚠️ |
| types.ts | 45 | ❌ | ❌ | ❌ | ⚠️ |

### finance\refunds/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| RefundList.tsx | 112 | ✅ 10 | ❌ | ❌ | ⚠️ |
| RefundReview.tsx | 125 | ✅ 2 | ❌ | ✅ | ⚠️ |
| RefundStatsCards.tsx | 39 | ✅ 1 | ❌ | ✅ | ⚠️ |
| types.ts | 52 | ❌ | ❌ | ❌ | ⚠️ |

### logs/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| constants.ts | 25 | ❌ | ❌ | ❌ | ✅ |
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| Logs.tsx | 465 | ❌ | ❌ | ❌ | ⚠️ |
| types.ts | 17 | ❌ | ❌ | ❌ | ✅ |

### logs\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 2 | ❌ | ❌ | ❌ | ✅ |
| LatencyBadge.tsx | 25 | ✅ 1 | ❌ | ❌ | ⚠️ |
| StatusBadge.tsx | 21 | ✅ 1 | ❌ | ❌ | ⚠️ |

### logs\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 2 | ❌ | ❌ | ❌ | ✅ |
| useKeyComparison.tsx | 79 | ❌ | ❌ | ❌ | ⚠️ |
| useLogs.ts | 285 | ❌ | ❌ | ✅ | ⚠️ |

### portal/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| Docs.tsx | 103 | ❌ | ❌ | ✅ | ⚠️ |
| Home.tsx | 18 | ❌ | ❌ | ❌ | ✅ |
| Models.tsx | 20 | ❌ | ❌ | ❌ | ✅ |
| Pricing.tsx | 39 | ❌ | ❌ | ❌ | ✅ |

### portal\docs/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| ContentRenderer.tsx | 349 | ✅ 3 | ✅ | ❌ | ⚠️ |
| SearchBar.tsx | 65 | ✅ 2 | ❌ | ✅ | ⚠️ |
| Sidebar.tsx | 101 | ✅ 3 | ❌ | ✅ | ⚠️ |
| types.ts | 19 | ❌ | ❌ | ❌ | ✅ |

### redemption/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| constants.ts | 32 | ❌ | ❌ | ❌ | ⚠️ |
| types.ts | 79 | ❌ | ❌ | ❌ | ✅ |

### redemption\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| DetailModal.tsx | 181 | ✅ 3 | ❌ | ❌ | ⚠️ |
| GiftModal.tsx | 116 | ✅ 4 | ❌ | ❌ | ⚠️ |
| index.ts | 4 | ❌ | ❌ | ❌ | ✅ |

### redemption\hooks/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| index.ts | 1 | ❌ | ❌ | ❌ | ✅ |
| useRedemption.ts | 121 | ❌ | ❌ | ✅ | ✅ |

### vendor/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| VendorDashboard.tsx | 314 | ❌ | ❌ | ✅ | ⚠️ |
| VendorLogin.tsx | 134 | ❌ | ❌ | ❌ | ⚠️ |
| VendorRegister.tsx | 74 | ❌ | ❌ | ✅ | ⚠️ |
| VendorRegisterSuccess.tsx | 74 | ❌ | ❌ | ❌ | ⚠️ |

### vendor\components/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| VendorOnboardingGuide.tsx | 179 | ✅ 1 | ❌ | ❌ | ⚠️ |

### vendor\vendor-dashboard/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| KeyRotateModal.tsx | 65 | ✅ 3 | ❌ | ❌ | ⚠️ |
| ModelFormModal.tsx | 132 | ✅ 4 | ❌ | ❌ | ⚠️ |
| ModelPerformance.tsx | 45 | ✅ 1 | ❌ | ✅ | ⚠️ |
| RecentAlerts.tsx | 25 | ✅ 2 | ❌ | ❌ | ⚠️ |
| RevenuePanel.tsx | 27 | ✅ 1 | ❌ | ❌ | ⚠️ |
| StatusBadge.tsx | 14 | ✅ 1 | ❌ | ❌ | ⚠️ |
| SystemStatus.tsx | 66 | ✅ 1 | ❌ | ✅ | ⚠️ |
| types.ts | 46 | ✅ 1 | ❌ | ❌ | ✅ |
| VendorStatsCards.tsx | 47 | ✅ 5 | ❌ | ✅ | ⚠️ |

### vendor\vendor-register/

| 文件 | 行数 | props | memo | useMemo | 内联对象 |
|------|------|-------|------|---------|----------|
| AgreementSection.tsx | 40 | ✅ 2 | ❌ | ❌ | ⚠️ |
| RegistrationForm.tsx | 348 | ✅ 1 | ❌ | ✅ | ⚠️ |
| types.ts | 32 | ❌ | ❌ | ❌ | ⚠️ |

## 3. 组件清单

| 组件路径 | 行数 | props数量 | 是否使用memo | 是否使用useMemo/useCallback | 内联对象 |
|----------|------|-----------|--------------|----------------------------|----------|
| admin\FeatureDescription.tsx | 116 | 2 | ❌ | ❌ | ⚠️ |
| ErrorBoundary.tsx | 110 | 0 | ❌ | ❌ | ⚠️ |
| layout\AdminRoute.tsx | 33 | 0 | ❌ | ❌ | ✅ |
| layout\AppLayout.tsx | 109 | 0 | ❌ | ❌ | ⚠️ |
| layout\SearchModal.tsx | 256 | 2 | ❌ | ✅ | ⚠️ |
| layout\Sidebar.tsx | 572 | 1 | ❌ | ✅ | ⚠️ |
| layout\VendorLayout.tsx | 58 | 0 | ❌ | ❌ | ⚠️ |
| layout\VendorRoute.tsx | 29 | 0 | ❌ | ❌ | ✅ |
| layout\VendorSidebar.tsx | 153 | 3 | ❌ | ❌ | ⚠️ |
| logs\ErrorAnalysisPanel.tsx | 63 | 4 | ❌ | ❌ | ⚠️ |
| logs\KeyComparison.tsx | 170 | 3 | ❌ | ❌ | ⚠️ |
| logs\LogAnomaliesPanel.tsx | 159 | 1 | ❌ | ❌ | ⚠️ |
| logs\LogDetailDrawer.tsx | 246 | 2 | ❌ | ❌ | ⚠️ |
| logs\LogExportButton.tsx | 82 | 1 | ❌ | ❌ | ⚠️ |
| logs\LogModelChart.tsx | 149 | 2 | ❌ | ❌ | ⚠️ |
| logs\LogsFilter.tsx | 210 | 20 | ❌ | ❌ | ⚠️ |
| logs\LogsTable.tsx | 166 | 1 | ❌ | ❌ | ⚠️ |
| logs\LogStatsCards.tsx | 74 | 5 | ✅ | ❌ | ⚠️ |
| logs\LogTrendChart.tsx | 162 | 0 | ❌ | ❌ | ⚠️ |
| memo-index.ts | 25 | 0 | ✅ | ❌ | ✅ |
| portal\CodeBlock.tsx | 74 | 4 | ❌ | ✅ | ⚠️ |
| portal\CTASection.tsx | 27 | 0 | ❌ | ❌ | ⚠️ |
| portal\FeatureGrid.tsx | 67 | 0 | ❌ | ❌ | ⚠️ |
| portal\HeroSection.tsx | 66 | 0 | ❌ | ❌ | ⚠️ |
| portal\HowItWorks.tsx | 61 | 0 | ❌ | ❌ | ⚠️ |
| portal\ModelCatalog.tsx | 183 | 0 | ❌ | ✅ | ⚠️ |
| portal\PortalFooter.tsx | 217 | 2 | ❌ | ❌ | ⚠️ |
| portal\PortalHeader.tsx | 165 | 0 | ❌ | ❌ | ⚠️ |
| portal\PricingFaq.tsx | 63 | 0 | ❌ | ❌ | ⚠️ |
| portal\PricingTable.tsx | 115 | 0 | ❌ | ❌ | ⚠️ |
| portal\PublicLayout.tsx | 16 | 0 | ❌ | ❌ | ✅ |
| portal\QuickConnectPanel.tsx | 249 | 3 | ❌ | ✅ | ⚠️ |
| portal\StatsBanner.tsx | 54 | 0 | ❌ | ❌ | ⚠️ |
| realname\RealNameForm.tsx | 359 | 21 | ❌ | ❌ | ⚠️ |
| realname\RealNameHistory.tsx | 130 | 1 | ❌ | ❌ | ⚠️ |
| realname\RealNameUpload.tsx | 102 | 7 | ❌ | ❌ | ⚠️ |
| security\CircuitStatusBadge.tsx | 17 | 1 | ❌ | ❌ | ⚠️ |
| security\RiskBadge.tsx | 18 | 1 | ❌ | ❌ | ⚠️ |
| ui\badge.tsx | 27 | 3 | ✅ | ❌ | ⚠️ |
| ui\BatchActionBar.tsx | 118 | 5 | ❌ | ✅ | ⚠️ |
| ui\button.tsx | 40 | 0 | ❌ | ❌ | ⚠️ |
| ui\CaptchaDialog.tsx | 72 | 4 | ❌ | ❌ | ⚠️ |
| ui\card.tsx | 51 | 0 | ❌ | ❌ | ⚠️ |
| ui\ConfirmDialog.tsx | 100 | 10 | ❌ | ❌ | ⚠️ |
| ui\EmptyState.tsx | 40 | 5 | ✅ | ❌ | ⚠️ |
| ui\ExportMenu.tsx | 184 | 7 | ❌ | ✅ | ⚠️ |
| ui\FilterBar.tsx | 167 | 9 | ❌ | ❌ | ⚠️ |
| ui\FilterPresets.tsx | 324 | 2 | ❌ | ✅ | ⚠️ |
| ui\FormField.tsx | 96 | 8 | ❌ | ❌ | ⚠️ |
| ui\index.ts | 14 | 0 | ❌ | ❌ | ✅ |
| ui\InlineEdit.tsx | 217 | 9 | ❌ | ✅ | ⚠️ |
| ui\InlineToggle.tsx | 105 | 9 | ❌ | ✅ | ⚠️ |
| ui\input.tsx | 22 | 0 | ❌ | ❌ | ⚠️ |
| ui\MiniChart.tsx | 226 | 1 | ❌ | ✅ | ⚠️ |
| ui\Modal.tsx | 55 | 5 | ❌ | ❌ | ⚠️ |
| ui\PaginationBar.tsx | 116 | 4 | ❌ | ❌ | ⚠️ |
| ui\QuotaProgress.tsx | 95 | 1 | ❌ | ❌ | ⚠️ |
| ui\skeleton.tsx | 129 | 4 | ❌ | ❌ | ⚠️ |
| ui\SlideDrawer.tsx | 125 | 9 | ❌ | ❌ | ⚠️ |
| ui\VirtualList.tsx | 197 | 0 | ❌ | ✅ | ⚠️ |
| ui\VirtualScrollDemo.tsx | 310 | 1 | ✅ | ✅ | ⚠️ |
| ui\VirtualTable.tsx | 247 | 1 | ❌ | ✅ | ⚠️ |

## 4. Hook清单

| Hook路径 | 行数 | 是否使用useMemo | 内联对象 |
|----------|------|----------------|----------|
| use-abort.ts | 114 | ✅ | ✅ |
| use-async-data.ts | 54 | ✅ | ✅ |
| use-auth-split.tsx | 201 | ✅ | ⚠️ |
| use-auth.tsx | 128 | ✅ | ⚠️ |
| use-column-prefs.ts | 47 | ✅ | ⚠️ |
| use-form-error.ts | 215 | ✅ | ⚠️ |
| use-impersonate.tsx | 85 | ✅ | ⚠️ |
| use-page-preferences.ts | 56 | ✅ | ⚠️ |
| use-pagination.ts | 53 | ✅ | ⚠️ |
| use-perm.ts | 83 | ✅ | ⚠️ |
| use-persisted-filters.ts | 184 | ✅ | ⚠️ |
| use-query.ts | 179 | ✅ | ⚠️ |
| use-rate-limit-ws.ts | 93 | ✅ | ⚠️ |
| use-safe-timer.ts | 53 | ✅ | ✅ |
| use-search-history.ts | 46 | ✅ | ✅ |
| use-search.ts | 56 | ✅ | ✅ |
| use-site-config.ts | 70 | ❌ | ⚠️ |
| use-submit.ts | 35 | ✅ | ⚠️ |
| use-timeout.ts | 71 | ✅ | ✅ |
| use-virtual-scroll.ts | 173 | ✅ | ⚠️ |

## 5. 性能问题分析

### 5.1 大型组件（>300行）

这些组件可能过于复杂，建议考虑拆分：

- **layout\Sidebar.tsx** (572行)
  - Props: { collapsed }: { collapsed: boolean }
- **realname\RealNameForm.tsx** (359行)
  - Props: {
  tab, onTabChange, pForm, onPFormChange, pIdFront, pIdBack, onPFileSelect, onPRemoveFile, eForm, onEFormChange, eIdFront, eIdBack, eBizLicense, onEFileSelect, onERemoveFile, currentStatus, submitting, isImpersonating, onSubmitPersonal, onSubmitEnterprise, ocrStates = {}
}: RealNameFormProps
- **ui\FilterPresets.tsx** (324行)
  - Props: a: any, b: any
- **ui\VirtualScrollDemo.tsx** (310行)
  - Props: count: number

### 5.2 缺少memo的组件

这些组件有props但未使用React.memo，可能存在不必要的重渲染：

- **admin\FeatureDescription.tsx** (2个props)
  - Props: map: Record<string, FeatureDesc>
- **layout\SearchModal.tsx** (2个props)
  - Props: { open, onClose }: { open: boolean; onClose: (
- **layout\Sidebar.tsx** (1个props)
  - Props: { collapsed }: { collapsed: boolean }
- **layout\VendorSidebar.tsx** (3个props)
  - Props: {
  collapsed, onToggle, }: {
  collapsed: boolean
  onToggle: (
- **logs\ErrorAnalysisPanel.tsx** (4个props)
  - Props: {
  statusFilter, errorPatterns, errorInsightLoading...
- **logs\KeyComparison.tsx** (3个props)
  - Props: { data, label }: { data: KeyComparisonData | null, label: string }
- **logs\LogAnomaliesPanel.tsx** (1个props)
  - Props: { days = 7 }: Props
- **logs\LogDetailDrawer.tsx** (2个props)
  - Props: { logId, onClose }: LogDetailDrawerProps
- **logs\LogExportButton.tsx** (1个props)
  - Props: { filters }: ExportButtonProps
- **logs\LogModelChart.tsx** (2个props)
  - Props: { startDate, endDate }: Props
- **logs\LogsFilter.tsx** (20个props)
  - Props: {
  modelName, setModelName, statusFilter...
- **logs\LogsTable.tsx** (1个props)
  - Props: { status }: { status: string }
- **portal\CodeBlock.tsx** (4个props)
  - Props: { code, language, maskApiKey...
- **portal\PortalFooter.tsx** (2个props)
  - Props: config: Record<string, string> | null
- **portal\QuickConnectPanel.tsx** (3个props)
  - Props: baseUrl: string, apiKey: string, model: string
- **realname\RealNameForm.tsx** (21个props)
  - Props: {
  tab, onTabChange, pForm...
- **realname\RealNameHistory.tsx** (1个props)
  - Props: { history }: RealNameHistoryProps
- **realname\RealNameUpload.tsx** (7个props)
  - Props: {
  label, hint, accept...
- **security\CircuitStatusBadge.tsx** (1个props)
  - Props: { state }: { state: string }
- **security\RiskBadge.tsx** (1个props)
  - Props: { level }: { level: string }
- **ui\BatchActionBar.tsx** (5个props)
  - Props: {
  selectedIds, onSelectionChange, actions...
- **ui\CaptchaDialog.tsx** (4个props)
  - Props: { email, captchaSession, onSubmit...
- **ui\ConfirmDialog.tsx** (10个props)
  - Props: {
  open, title, message...
- **ui\ExportMenu.tsx** (7个props)
  - Props: {
  formats = DEFAULT_FORMATS, onExport, filename = 'export'...
- **ui\FilterBar.tsx** (9个props)
  - Props: {
  filters, setFilter, resetFilters...
- **ui\FilterPresets.tsx** (2个props)
  - Props: a: any, b: any
- **ui\FormField.tsx** (8个props)
  - Props: {
  label, hint, error...
- **ui\InlineEdit.tsx** (9个props)
  - Props: {
  value, onSave, type = 'text'...
- **ui\InlineToggle.tsx** (9个props)
  - Props: {
  value, onChange, disabled...
- **ui\MiniChart.tsx** (1个props)
  - Props: points: MiniChartDataPoint[]
- **ui\Modal.tsx** (5个props)
  - Props: { isOpen, onClose, title...
- **ui\PaginationBar.tsx** (4个props)
  - Props: {
  page, onPageChange, pageSize = 20...
- **ui\QuotaProgress.tsx** (1个props)
  - Props: n: number
- **ui\skeleton.tsx** (4个props)
  - Props: { className, variant, count = 1...
- **ui\SlideDrawer.tsx** (9个props)
  - Props: {
  open, onClose, title...
- **ui\VirtualTable.tsx** (1个props)
  - Props: e.currentTarget as HTMLElement

### 5.3 存在内联对象的组件

这些组件中可能存在内联对象/函数定义，可能导致不必要的重渲染：

- **admin\FeatureDescription.tsx** (116行)
- **ErrorBoundary.tsx** (110行)
- **layout\AppLayout.tsx** (109行)
- **layout\SearchModal.tsx** (256行)
- **layout\Sidebar.tsx** (572行)
- **layout\VendorLayout.tsx** (58行)
- **layout\VendorSidebar.tsx** (153行)
- **logs\ErrorAnalysisPanel.tsx** (63行)
- **logs\KeyComparison.tsx** (170行)
- **logs\LogAnomaliesPanel.tsx** (159行)
- **logs\LogDetailDrawer.tsx** (246行)
- **logs\LogExportButton.tsx** (82行)
- **logs\LogModelChart.tsx** (149行)
- **logs\LogsFilter.tsx** (210行)
- **logs\LogsTable.tsx** (166行)
- **logs\LogStatsCards.tsx** (74行)
- **logs\LogTrendChart.tsx** (162行)
- **portal\CodeBlock.tsx** (74行)
- **portal\CTASection.tsx** (27行)
- **portal\FeatureGrid.tsx** (67行)
- ... 还有 37 个组件

## 6. 常用依赖统计

### 6.1 最常用的导入（前20）

| 依赖 | 使用次数 |
|------|----------|
| lucide-react | 365 |
| react | 349 |
| ./types | 181 |
| @/lib/api | 178 |
| @/types | 142 |
| ../types | 60 |
| @/components/ui/PaginationBar | 59 |
| @/components/admin/FeatureDescription | 43 |
| @/components/ui/MiniChart | 37 |
| react-router-dom | 35 |
| recharts | 32 |
| @/lib/utils | 14 |
| @/hooks/use-auth | 12 |
| @/components/ui/FilterBar | 11 |
| @/hooks/use-persisted-filters | 11 |
| ./_shared | 8 |
| @/components/ui/skeleton | 7 |
| @/components/ui/badge | 6 |
| @/hooks/use-page-preferences | 6 |
| @/hooks/use-impersonate | 6 |

## 7. 改进建议

### 7.1 性能优化

1. **添加memo包装**: 对以下组件考虑添加 `React.memo()` 包装：
   - `admin\FeatureDescription.tsx` (2个props)
   - `layout\SearchModal.tsx` (2个props)
   - `layout\Sidebar.tsx` (1个props)
   - `layout\VendorSidebar.tsx` (3个props)
   - `logs\ErrorAnalysisPanel.tsx` (4个props)
   - `logs\KeyComparison.tsx` (3个props)
   - `logs\LogAnomaliesPanel.tsx` (1个props)
   - `logs\LogDetailDrawer.tsx` (2个props)
   - `logs\LogExportButton.tsx` (1个props)
   - `logs\LogModelChart.tsx` (2个props)

2. **拆分大型组件**: 以下组件超过300行，建议考虑功能拆分：
   - `layout\Sidebar.tsx` (572行)
   - `realname\RealNameForm.tsx` (359行)
   - `ui\FilterPresets.tsx` (324行)
   - `ui\VirtualScrollDemo.tsx` (310行)

3. **减少内联对象**: 检查以下组件中的内联对象/函数定义：
   - `admin\FeatureDescription.tsx`
   - `ErrorBoundary.tsx`
   - `layout\AppLayout.tsx`
   - `layout\SearchModal.tsx`
   - `layout\Sidebar.tsx`
   - `layout\VendorLayout.tsx`
   - `layout\VendorSidebar.tsx`
   - `logs\ErrorAnalysisPanel.tsx`
   - `logs\KeyComparison.tsx`
   - `logs\LogAnomaliesPanel.tsx`

### 7.2 代码质量

1. **TypeScript类型检查**: 确保所有组件都有完整的Props类型定义
2. **组件复用性**: 检查是否存在重复的UI组件，考虑提取公共组件
3. **Hook规范化**: 确保Hook都有正确的错误处理和加载状态

## 8. 总结

本次分析共扫描了 **570** 个文件，发现了以下主要问题：

1. **性能问题**: 36 个组件缺少memo包装，57 个组件存在内联对象
2. **代码复杂度**: 4 个组件超过300行，需要关注
3. **状态管理**: 大部分组件使用React Hooks进行状态管理，需要关注Hook的使用规范性

建议按照上述改进建议逐步优化，重点关注性能敏感组件和大型复杂组件。