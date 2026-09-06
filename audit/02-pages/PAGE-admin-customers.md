# 页面原子审计：AdminCustomersPage

## 页面元数据

- 页面编号：A1-admin-customers
- 页面名称：AdminCustomersPage
- 应用：console
- 路由：待从路由配置/运行验证确认
- 源码：`web-console/src/pages/AdminCustomersPage.tsx`
- 原型：UNKNOWN
- PRD：`docs/PRD-管理后台.md`（按页面模块对应章节）
- SPEC：`docs/SPEC-§4-管理后台.md §4.1/§4.2`
- 适用角色：以 SPEC/权限实现为准，当前 UNKNOWN

## 原子核对表（141 项）

> 本批次仅登记核对断言与新鲜源码定位，不判定实现通过；无测试或后端/DB直接证据均为 UNKNOWN。

| ID | 维度 | 单一核对断言 | 需求出处 | 实现证据（文件:行号） | 测试证据 | 状态 | 优先级 | 备注 |
|---|---|---|---|---|---|---|---|---|
| ADMIN-CUSTOMERS-001 | route | 页面可通过后台菜单或配置的路由进入 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-002 | route | 未登录访问页面时应按后台鉴权策略处理 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-003 | route | 直接访问未知子路径时应显示路由错误或兜底页 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-004 | route | 页面返回上一级后应保留合理的列表上下文 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-005 | route | 浏览器刷新后页面应按当前 URL 恢复 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-006 | route | 路由参数缺失时页面应给出明确处理 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-007 | page-help | 页面标题应显示页面级 [?] 入口 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-008 | page-help | 点击页面级 [?] 应打开帮助内容 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-009 | page-help | 帮助内容应说明适用角色 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-010 | page-help | 帮助内容应说明功能定位 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-011 | page-help | 帮助内容应说明核心操作 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-012 | page-help | 帮助内容应说明注意事项 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-013 | page-help | 帮助内容应说明常见问题 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-014 | page-help | 帮助内容应与对应 SPEC 保持一致 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-015 | layout | 页面应有稳定的标题区域 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-016 | layout | 页面应有主要内容区域 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-017 | layout | 页面应在窄视口下不产生不可操作的溢出 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-018 | layout | 交互控件应具有可识别的焦点状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-019 | layout | 表格或卡片区域应保持一致的间距 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-020 | layout | 重要数据应具有清晰的视觉层级 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-021 | layout | 操作区应与展示区可区分 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-022 | layout | 页面应支持键盘到达主要入口 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-023 | display | 主要业务数据应显示明确字段名 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-024 | display | 业务标识应使用稳定格式展示 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-025 | display | 状态值应使用可理解的文本或标签 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-026 | display | 金额字段应显示约定货币格式 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-027 | display | 时间字段应显示约定时区和格式 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-028 | display | 敏感字段应按需求脱敏 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-029 | display | 列表数据应与详情数据保持一致 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-030 | display | 空字段应显示明确占位符 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-031 | display | 长文本应有不破坏布局的展示方式 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-032 | display | 数据异常值应有可识别表现 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-033 | display | 统计值应标明统计口径 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-034 | display | 相关对象应可追溯到其标识 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-035 | display | 更新时间应可被用户识别 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-036 | display | 数据单位应与数值同时明确 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-037 | display | 分页结果应显示当前范围 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-038 | query | 页面应提供需求定义的查询入口 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-039 | query | 查询条件提交应使用当前条件 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-040 | query | 空查询条件应按约定处理 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-041 | query | 文本查询应处理前后空白 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-042 | query | 非法查询参数应被拒绝或提示 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-043 | query | 筛选条件应可清除 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-044 | query | 多个筛选条件应能组合 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-045 | query | 排序方向应可识别 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-046 | query | 翻页应更新展示数据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-047 | query | 查询失败时不应伪造正常数据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-048 | form | 每个必填字段应有明确标识 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-049 | form | 字段输入应使用需求定义的控件类型 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-050 | form | 空值提交应显示字段级错误 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-051 | form | 格式非法时应显示字段级错误 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-052 | form | 数值字段应校验精度 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-053 | form | 数值字段应校验范围下界 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-054 | form | 数值字段应校验范围上界 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-055 | form | 枚举字段应拒绝未知值 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-056 | form | 文本字段应校验长度边界 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-057 | form | 敏感输入不应以明文泄露 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-058 | form | 表单重置应恢复约定初始值 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-059 | form | 表单离开前应按约定处理未保存变更 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-060 | actions | 每个业务操作入口应具有独立可识别标签 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-061 | actions | 每个业务操作入口旁应有按钮级 [?] | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-062 | actions | 按钮级帮助应描述该操作作用 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-063 | actions | 无权限角色不应看到或不能执行受限操作 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-064 | actions | 操作前应检查当前对象状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-065 | actions | 操作提交期间按钮应防止重复触发 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-066 | actions | 成功后应更新受影响区域 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-067 | actions | 失败后应保留可修正输入 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-068 | actions | 批量操作应明确受影响对象数量 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-069 | actions | 批量操作执行前应提供预览（适用时） | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-070 | actions | 批量操作执行后应支持错误报告（适用时） | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-071 | actions | 破坏性或敏感操作应要求二次确认 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-072 | modal | 弹窗应有明确标题 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-073 | modal | 弹窗应提供取消或关闭入口 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-074 | modal | 弹窗关闭不应意外提交 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-075 | modal | 敏感操作确认文案应包含对象和影响 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-076 | modal | 确认按钮应在提交期间进入不可重复状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-077 | modal | 表单错误应在弹窗内可见 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-078 | modal | 成功后弹窗应按约定关闭或保留结果 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-079 | modal | 关闭后列表状态应按约定刷新 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-080 | states | 首次进入应有明确初始状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-081 | states | 数据加载中应显示 loading 指示器 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-082 | states | 无数据时应显示非空白空态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-083 | states | 正常数据应显示完整内容 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-084 | states | API 错误应显示错误提示 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-085 | states | 权限不足应显示权限反馈 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-086 | states | 网络断开应显示网络错误反馈 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-087 | states | 失败状态应提供重试入口 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-088 | feedback | 提交成功应有明确反馈 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-089 | feedback | 提交失败应有明确反馈 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-090 | feedback | 校验失败应有字段级反馈 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-091 | feedback | 长时间操作应显示进度或处理中状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-092 | feedback | 反馈文案应避免泄露敏感信息 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-093 | feedback | 刷新后成功结果应保持一致 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-094 | permission | 页面访问应校验登录身份 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-095 | permission | 页面访问应校验角色或权限 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-096 | permission | 每个敏感操作应校验操作权限 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-097 | permission | 服务端应再次校验权限而非仅依赖前端 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-098 | permission | 数据范围应按角色约束 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-099 | permission | 越权对象 ID 不应返回未授权数据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-100 | permission | 权限变化后页面应重新评估操作能力 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-101 | permission | 权限拒绝应可审计或可追踪 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-102 | api | 页面使用的查询请求应定义明确方法 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-103 | api | 请求参数应与页面条件对应 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-104 | api | 请求应携带所需身份凭证 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-105 | api | 响应数据应经过结构校验 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-106 | api | HTTP 非成功响应应进入错误分支 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-107 | api | 业务错误码应映射为用户可理解反馈 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-108 | api | 请求超时应可恢复 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-109 | api | 取消或离开页面后不应错误覆盖新状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-110 | api | 分页参数应与接口约定一致 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-111 | api | 排序参数应与接口约定一致 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-112 | api | 写请求应使用正确 HTTP 方法 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-113 | api | 写请求响应应驱动页面状态更新 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-114 | db | 展示字段应有后端数据来源 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-115 | db | 写入字段应有持久化定义 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-116 | db | 状态变更应使用受约束枚举 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-117 | db | 金额持久化应使用安全精度 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-118 | db | 时间持久化应保留时区语义 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-119 | db | 关联对象应保持引用完整性 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-120 | db | 查询应避免未授权跨租户数据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-121 | db | 删除或关闭应符合保留策略 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-122 | safety | 敏感操作应写入审计日志 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-123 | safety | 审计记录应包含操作者身份 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-124 | safety | 审计记录应包含目标对象 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-125 | safety | 审计记录应包含操作时间 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-126 | safety | 审计记录应包含结果 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-127 | safety | 重复请求不应产生重复业务副作用 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-128 | safety | 并发更新应检测版本或状态冲突 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-129 | safety | 事务失败时应回滚业务写入 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-130 | safety | 重试不应绕过权限或确认 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-131 | safety | 导出数据应遵循敏感信息保护 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-132 | test | 应有页面初始渲染测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-133 | test | 应有 loading 状态测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-134 | test | 应有空态测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-135 | test | 应有 API 错误测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-136 | test | 应有权限拒绝测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-137 | test | 应有表单边界测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-138 | test | 应有重复提交测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-139 | test | 应有审计写入测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-140 | test | 应有接口契约测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |
| ADMIN-CUSTOMERS-141 | test | 应有端到端关键路径测试证据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:2` | UNKNOWN (未执行动态测试；禁止仅凭旧审计结论判定) | UNKNOWN | P1 | 只读批次 A1；需补充与该断言直接对应的测试证据 |

## 页面状态矩阵

| 状态 | 单独核对断言 | 需求出处 | 实现证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|
| 首次进入 | 页面首次进入应显示定义的初始内容 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 加载中 | 页面加载期间应显示 loading | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 空数据 | 无结果应显示空态说明 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 正常数据 | 正常响应应显示业务数据 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| API 错误 | API 错误应显示错误提示 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 权限不足 | 权限不足应阻止未授权访问 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 网络断开 | 网络断开应提供可理解反馈 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 重试 | 失败状态应允许重试 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 提交中 | 写操作期间应阻止重复提交 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 提交成功 | 写操作成功应反馈并刷新状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 提交失败 | 写操作失败应反馈且不伪造成功 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 重复提交 | 重复提交不应产生重复副作用 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |
| 刷新后 | 刷新后应保持服务端真实状态 | docs/SPEC-§4-管理后台.md §4.1/§4.2 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN |

## 操作入口矩阵

> 入口清单需结合源码与运行时逐一补录；本批次不以旧报告替代证据。

| ID | 入口文本/选择器 | 操作断言 | 按钮帮助 | 二次确认 | 权限 | 成功反馈 | 失败反馈 | 审计 | 测试 |
|---|---|---|---|---|---|---|---|---|---|
| ADMIN-CUSTOMERS-ENTRY-001 | 源码中可交互入口（待逐项枚举） | 每个入口应有独立行为核对 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## API / 数据 / 权限矩阵

| ID | 类型 | 单一断言 | 前端证据 | 后端证据 | DB证据 | 权限证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|---|---|---|
| ADMIN-CUSTOMERS-DATA-001 | api | 页面请求与响应契约应可独立验证 | `web-console/src/pages/AdminCustomersPage.tsx:1` | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## 差距清单

| GAP ID | 原子项 ID | 差距描述 | 影响 | 优先级 | 建议 |
|---|---|---|---|---|---|
| ADMIN-CUSTOMERS-GAP-001 | — | 当前批次未执行动态测试，所有实现结论保持 UNKNOWN | 不能据此验收 | P1 | 补充页面、API、权限、DB及安全测试证据 |
