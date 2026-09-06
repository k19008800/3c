# 页面原子审计：AdminAuditLogPage

## 页面元数据

- 页面编号：A1-admin-audit-log
- 页面名称：AdminAuditLogPage
- 应用：console
- 路由：待从路由配置/运行验证确认
- 源码：`web-console/src/pages/admin/AdminAuditLogPage.tsx`
- 原型：UNKNOWN
- PRD：`docs/PRD-管理后台.md`（按页面模块对应章节）
- SPEC：`docs/ref-12.1-audit-console.md §功能描述`
- 适用角色：以 SPEC/权限实现为准，当前 UNKNOWN

## 原子核对表（141 项）

> 本批次仅登记核对断言与新鲜源码定位，不判定实现通过；无测试或后端/DB直接证据均为 UNKNOWN。

| ID | 维度 | 单一核对断言 | 需求出处 | 实现证据（文件:行号） | 测试证据 | 状态 | 优先级 | 备注 |
|---|---|---|---|---|---|---|---|---|
| ADMIN-AUDIT-LOG-001 | route | 页面可通过后台菜单或配置的路由进入 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-002 | route | 未登录访问页面时应按后台鉴权策略处理 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-003 | route | 直接访问未知子路径时应显示路由错误或兜底页 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-004 | route | 页面返回上一级后应保留合理的列表上下文 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-005 | route | 浏览器刷新后页面应按当前 URL 恢复 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-006 | route | 路由参数缺失时页面应给出明确处理 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-007 | page-help | 页面标题应显示页面级 [?] 入口 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-008 | page-help | 点击页面级 [?] 应打开帮助内容 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-009 | page-help | 帮助内容应说明适用角色 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-010 | page-help | 帮助内容应说明功能定位 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-011 | page-help | 帮助内容应说明核心操作 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-012 | page-help | 帮助内容应说明注意事项 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-013 | page-help | 帮助内容应说明常见问题 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-014 | page-help | 帮助内容应与对应 SPEC 保持一致 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-015 | layout | 页面应有稳定的标题区域 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-016 | layout | 页面应有主要内容区域 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-017 | layout | 页面应在窄视口下不产生不可操作的溢出 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-018 | layout | 交互控件应具有可识别的焦点状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-019 | layout | 表格或卡片区域应保持一致的间距 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-020 | layout | 重要数据应具有清晰的视觉层级 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-021 | layout | 操作区应与展示区可区分 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-022 | layout | 页面应支持键盘到达主要入口 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-023 | display | 主要业务数据应显示明确字段名 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-024 | display | 业务标识应使用稳定格式展示 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-025 | display | 状态值应使用可理解的文本或标签 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-026 | display | 金额字段应显示约定货币格式 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-027 | display | 时间字段应显示约定时区和格式 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-028 | display | 敏感字段应按需求脱敏 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-029 | display | 列表数据应与详情数据保持一致 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-030 | display | 空字段应显示明确占位符 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-031 | display | 长文本应有不破坏布局的展示方式 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-032 | display | 数据异常值应有可识别表现 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-033 | display | 统计值应标明统计口径 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-034 | display | 相关对象应可追溯到其标识 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-035 | display | 更新时间应可被用户识别 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-036 | display | 数据单位应与数值同时明确 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-037 | display | 分页结果应显示当前范围 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-038 | query | 页面应提供需求定义的查询入口 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-039 | query | 查询条件提交应使用当前条件 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-040 | query | 空查询条件应按约定处理 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-041 | query | 文本查询应处理前后空白 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-042 | query | 非法查询参数应被拒绝或提示 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-043 | query | 筛选条件应可清除 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-044 | query | 多个筛选条件应能组合 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-045 | query | 排序方向应可识别 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-046 | query | 翻页应更新展示数据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-047 | query | 查询失败时不应伪造正常数据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-048 | form | 每个必填字段应有明确标识 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-049 | form | 字段输入应使用需求定义的控件类型 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-050 | form | 空值提交应显示字段级错误 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-051 | form | 格式非法时应显示字段级错误 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-052 | form | 数值字段应校验精度 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-053 | form | 数值字段应校验范围下界 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-054 | form | 数值字段应校验范围上界 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-055 | form | 枚举字段应拒绝未知值 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-056 | form | 文本字段应校验长度边界 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-057 | form | 敏感输入不应以明文泄露 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-058 | form | 表单重置应恢复约定初始值 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-059 | form | 表单离开前应按约定处理未保存变更 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-060 | actions | 每个业务操作入口应具有独立可识别标签 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-061 | actions | 每个业务操作入口旁应有按钮级 [?] | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-062 | actions | 按钮级帮助应描述该操作作用 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-063 | actions | 无权限角色不应看到或不能执行受限操作 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-064 | actions | 操作前应检查当前对象状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-065 | actions | 操作提交期间按钮应防止重复触发 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-066 | actions | 成功后应更新受影响区域 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-067 | actions | 失败后应保留可修正输入 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-068 | actions | 批量操作应明确受影响对象数量 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-069 | actions | 批量操作执行前应提供预览（适用时） | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-070 | actions | 批量操作执行后应支持错误报告（适用时） | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-071 | actions | 破坏性或敏感操作应要求二次确认 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-072 | modal | 弹窗应有明确标题 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-073 | modal | 弹窗应提供取消或关闭入口 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-074 | modal | 弹窗关闭不应意外提交 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-075 | modal | 敏感操作确认文案应包含对象和影响 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-076 | modal | 确认按钮应在提交期间进入不可重复状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-077 | modal | 表单错误应在弹窗内可见 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-078 | modal | 成功后弹窗应按约定关闭或保留结果 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-079 | modal | 关闭后列表状态应按约定刷新 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-080 | states | 首次进入应有明确初始状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-081 | states | 数据加载中应显示 loading 指示器 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-082 | states | 无数据时应显示非空白空态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-083 | states | 正常数据应显示完整内容 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-084 | states | API 错误应显示错误提示 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-085 | states | 权限不足应显示权限反馈 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-086 | states | 网络断开应显示网络错误反馈 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-087 | states | 失败状态应提供重试入口 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-088 | feedback | 提交成功应有明确反馈 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-089 | feedback | 提交失败应有明确反馈 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-090 | feedback | 校验失败应有字段级反馈 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-091 | feedback | 长时间操作应显示进度或处理中状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-092 | feedback | 反馈文案应避免泄露敏感信息 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-093 | feedback | 刷新后成功结果应保持一致 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-094 | permission | 页面访问应校验登录身份 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-095 | permission | 页面访问应校验角色或权限 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-096 | permission | 每个敏感操作应校验操作权限 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-097 | permission | 服务端应再次校验权限而非仅依赖前端 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-098 | permission | 数据范围应按角色约束 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-099 | permission | 越权对象 ID 不应返回未授权数据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-100 | permission | 权限变化后页面应重新评估操作能力 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-101 | permission | 权限拒绝应可审计或可追踪 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-102 | api | 页面使用的查询请求应定义明确方法 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-103 | api | 请求参数应与页面条件对应 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-104 | api | 请求应携带所需身份凭证 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-105 | api | 响应数据应经过结构校验 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-106 | api | HTTP 非成功响应应进入错误分支 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-107 | api | 业务错误码应映射为用户可理解反馈 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-108 | api | 请求超时应可恢复 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-109 | api | 取消或离开页面后不应错误覆盖新状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-110 | api | 分页参数应与接口约定一致 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-111 | api | 排序参数应与接口约定一致 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-112 | api | 写请求应使用正确 HTTP 方法 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-113 | api | 写请求响应应驱动页面状态更新 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-114 | db | 展示字段应有后端数据来源 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-115 | db | 写入字段应有持久化定义 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-116 | db | 状态变更应使用受约束枚举 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-117 | db | 金额持久化应使用安全精度 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-118 | db | 时间持久化应保留时区语义 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-119 | db | 关联对象应保持引用完整性 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-120 | db | 查询应避免未授权跨租户数据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-121 | db | 删除或关闭应符合保留策略 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-122 | safety | 敏感操作应写入审计日志 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-123 | safety | 审计记录应包含操作者身份 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-124 | safety | 审计记录应包含目标对象 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-125 | safety | 审计记录应包含操作时间 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-126 | safety | 审计记录应包含结果 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-127 | safety | 重复请求不应产生重复业务副作用 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-128 | safety | 并发更新应检测版本或状态冲突 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-129 | safety | 事务失败时应回滚业务写入 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-130 | safety | 重试不应绕过权限或确认 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-131 | safety | 导出数据应遵循敏感信息保护 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-132 | test | 应有页面初始渲染测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-133 | test | 应有 loading 状态测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-134 | test | 应有空态测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-135 | test | 应有 API 错误测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-136 | test | 应有权限拒绝测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-137 | test | 应有表单边界测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-138 | test | 应有重复提交测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-139 | test | 应有审计写入测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-140 | test | 应有接口契约测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-AUDIT-LOG-141 | test | 应有端到端关键路径测试证据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |

## 页面状态矩阵

| 状态 | 单独核对断言 | 需求出处 | 实现证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|
| 首次进入 | 页面首次进入应显示定义的初始内容 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 加载中 | 页面加载期间应显示 loading | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 空数据 | 无结果应显示空态说明 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 正常数据 | 正常响应应显示业务数据 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| API 错误 | API 错误应显示错误提示 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 权限不足 | 权限不足应阻止未授权访问 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 网络断开 | 网络断开应提供可理解反馈 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 重试 | 失败状态应允许重试 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 提交中 | 写操作期间应阻止重复提交 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 提交成功 | 写操作成功应反馈并刷新状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 提交失败 | 写操作失败应反馈且不伪造成功 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 重复提交 | 重复提交不应产生重复副作用 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |
| 刷新后 | 刷新后应保持服务端真实状态 | docs/ref-12.1-audit-console.md §功能描述 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN |

## 操作入口矩阵

> 入口清单需结合源码与运行时逐一补录；本批次不以旧报告替代证据。

| ID | 入口文本/选择器 | 操作断言 | 按钮帮助 | 二次确认 | 权限 | 成功反馈 | 失败反馈 | 审计 | 测试 |
|---|---|---|---|---|---|---|---|---|---|
| ADMIN-AUDIT-LOG-ENTRY-001 | 源码中可交互入口（待逐项枚举） | 每个入口应有独立行为核对 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## API / 数据 / 权限矩阵

| ID | 类型 | 单一断言 | 前端证据 | 后端证据 | DB证据 | 权限证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|---|---|---|
| ADMIN-AUDIT-LOG-DATA-001 | api | 页面请求与响应契约应可独立验证 | `web-console/src/pages/admin/AdminAuditLogPage.tsx:1` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## 差距清单

| GAP ID | 原子项 ID | 差距描述 | 影响 | 优先级 | 建议 |
|---|---|---|---|---|---|
| ADMIN-AUDIT-LOG-GAP-001 | — | 当前批次未执行动态测试，所有实现结论保持 UNKNOWN | 不能据此验收 | P1 | 补充页面、API、权限、DB及安全测试证据 |
