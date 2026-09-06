# 页面原子审计：AdminActivityPage

- 页面编号：MISSING-admin-activity
- 页面名称：AdminActivityPage
- 应用：console
- 路由：`/app/admin-activity`（路由注册证据 UNKNOWN）
- 源码：`web-console/src/pages/AdminActivityPage.tsx`
- 原型：UNKNOWN
- PRD：UNKNOWN（页面专属需求原文尚未定位）
- SPEC：UNKNOWN
- 适用角色：UNKNOWN

> 本报告为只读原子审计；不判定实现通过。没有直接源码行号或测试名称的项目保持 UNKNOWN。

## 原子核对表

| ID | 维度 | 单一核对断言 | 需求出处 | 实现证据（文件:行号） | 测试证据 | 状态 | 优先级 | 备注 |
|---|---|---|---|---|---|---|---|---|
| M-001 | route | The page configured route resolves to this page. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-002 | route | The page unauthenticated navigation follows the authentication policy. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-003 | route | The page browser refresh preserves the current route. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-004 | route | The page back navigation preserves valid page context. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-005 | route | The page the page entry label matches the route meaning. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-006 | route | The page an unknown child path receives route fallback handling. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-007 | page-help | The page the page title is visible. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-008 | page-help | The page a page-level [?] entry is adjacent to the title. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-009 | page-help | The page clicking page-level [?] opens help. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-010 | page-help | The page help identifies applicable roles. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-011 | page-help | The page help states the functional purpose. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-012 | page-help | The page help lists core operations. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-013 | page-help | The page help states important cautions. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-014 | page-help | The page help answers common questions. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。” | `web-console/src/pages/AdminActivityPage.tsx:4` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-015 | layout | The page a primary content region exists. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-016 | layout | The page the layout remains usable at narrow width. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-017 | layout | The page visual hierarchy separates primary and secondary regions. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-018 | layout | The page interactive controls expose focus state. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-019 | layout | The page text remains readable against its background. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-020 | layout | The page re-entering does not duplicate interaction regions. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-021 | layout | The page spacing follows the platform pattern. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-022 | layout | The page closing a layer returns focus appropriately. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P2 §原则描述`；“所有列表页使用相同的搜索/筛选/排序/导出交互模式。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-023 | field | The page core business data fields are displayed. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-024 | field | The page each displayed field has a clear label. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-025 | field | The page sensitive data follows masking rules. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-026 | field | The page amounts use the agreed precision. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-027 | field | The page timestamps use the agreed timezone format. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-028 | field | The page enum values have readable labels. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-029 | field | The page long text does not break layout. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-030 | field | The page missing values have an explicit placeholder. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-031 | field | The page untrusted values are not executed as HTML. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-032 | field | The page list headers match their data meaning. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-033 | field | The page refreshed values match the response. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-034 | field | The page displayed records stay within the permitted data scope. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-035 | field | The page missing related objects have understandable status. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-036 | field | The page keyboard reading order follows the visual order. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-037 | field | The page units are shown with numeric values. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:12` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-038 | query | The page supported keyword search is available. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-039 | query | The page empty search does not send a meaningless query. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-040 | query | The page changed filters produce matching results. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-041 | query | The page changed sort order is explainable. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-042 | query | The page changing page requests the corresponding page. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-043 | query | The page total count comes from the service response. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-044 | query | The page no matches show a non-blank empty state. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-045 | query | The page query failure shows an error. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-046 | query | The page query failure offers retry. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-047 | query | The page refresh does not append stale rows. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-048 | query | The page query parameters are encoded. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:28` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-049 | form | The page form fields have labels or accessible names. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-050 | form | The page required fields are validated before submit. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-051 | form | The page invalid formats show field errors. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-052 | form | The page length limits prevent invalid submit. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-053 | form | The page input is normalized according to requirements. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-054 | form | The page sensitive input is not shown in plaintext by default. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-055 | form | The page an invalid form cannot be accidentally submitted. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-056 | form | The page submit-in-progress prevents duplicate submission. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-057 | form | The page cancel does not save changes. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-058 | form | The page server validation maps to field errors. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-059 | form | The page failure preserves safely recoverable input. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-060 | form | The page the submit uses the required HTTP method. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `web-console/src/pages/AdminActivityPage.tsx:51` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-061 | action | The page each operation entry has nearby [?] help. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-062 | action | The page button help explains the operation. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-063 | action | The page primary entries are keyboard operable. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-064 | action | The page dangerous operations use a clear danger treatment. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-065 | action | The page entries are shown or disabled according to permission. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-066 | action | The page link target matches its label. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-067 | action | The page success refreshes affected data. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-068 | action | The page failure does not present false success. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-069 | action | The page copy actions provide success feedback. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-070 | action | The page download failures are handled. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-071 | action | The page external links use a safe target policy. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-072 | action | The page batch action without selection gives feedback. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P1 §原则描述/验收标准`；“每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。” | `web-console/src/pages/AdminActivityPage.tsx:57` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-073 | modal | The page confirmable operations show a second confirmation. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-074 | modal | The page confirmation identifies affected objects. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-075 | modal | The page confirmation provides cancel. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-076 | modal | The page submission in a modal shows progress. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-077 | modal | The page modal errors are recognizable. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-078 | modal | The page closing a modal does not submit. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-079 | modal | The page batch operations preview affected data. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-080 | modal | The page batch completion provides an error report or explicit N/A basis. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-081 | state | The page initial entry has a recognizable state. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-082 | state | The page loading shows a loading indicator. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-083 | state | The page empty data has an explanatory empty state. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-084 | state | The page API errors show an error message. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-085 | state | The page API errors offer retry. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-086 | state | The page insufficient permission shows a permission message. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-087 | state | The page network loss has understandable feedback. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-088 | state | The page long operations show progress or in-progress feedback. | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4 §原则描述`；“数据加载中必须有 loading 指示器。” | `web-console/src/pages/AdminActivityPage.tsx:62` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-089 | feedback | The page success shows a clear toast or notification. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-090 | feedback | The page failure shows clear error feedback. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-091 | feedback | The page duplicate submission does not create duplicate success feedback. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-092 | feedback | The page refresh does not leave incorrect feedback behind. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-093 | feedback | The page errors do not expose sensitive internals. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-094 | feedback | The page recoverable errors provide a recovery path. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P2 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-095 | permission | The page page access is restricted by role. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-096 | permission | The page server validates query data scope. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-097 | permission | The page server validates write permission. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-098 | permission | The page unauthorized object IDs do not return objects. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-099 | permission | The page denied operations do not change data. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |
| M-100 | permission | The page expired sessions guide re-authentication. | `UNKNOWN §UNKNOWN`；“UNKNOWN — 页面专属需求原文尚未定位。” | `UNKNOWN` | UNKNOWN | UNKNOWN | P1 | 需补充该断言对应的测试文件/用例或动态证据 |

## 页面状态矩阵

| 状态 | 单独核对断言 | 需求出处 | 实现证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|
| 首次进入 | 页面在“首次进入”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 加载中 | 页面在“加载中”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 空数据 | 页面在“空数据”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 正常数据 | 页面在“正常数据”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| API错误 | 页面在“API错误”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 权限不足 | 页面在“权限不足”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 网络断开 | 页面在“网络断开”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 重试 | 页面在“重试”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交中 | 页面在“提交中”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交成功 | 页面在“提交成功”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交失败 | 页面在“提交失败”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 重复提交 | 页面在“重复提交”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |
| 刷新后 | 页面在“刷新后”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |

## 操作入口矩阵

| ID | 入口文本/选择器 | 操作断言 | 按钮帮助 | 二次确认 | 权限 | 成功反馈 | 失败反馈 | 审计 | 测试 |
|---|---|---|---|---|---|---|---|---|---|
| M-A01 | 源码中每个 button/link/tab/菜单/图标/提交入口 | 每个入口的动作、帮助、权限和反馈需逐项核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## API / 数据 / 权限矩阵

| ID | 类型 | 单一断言 | 前端证据 | 后端证据 | DB证据 | 权限证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|---|---|---|
| M-M01 | API请求 | AdminActivityPage 的API请求行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M02 | 错误码 | AdminActivityPage 的错误码行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M03 | 数据库字段 | AdminActivityPage 的数据库字段行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M04 | 持久化边界 | AdminActivityPage 的持久化边界行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M05 | 权限 | AdminActivityPage 的权限行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M06 | 审计 | AdminActivityPage 的审计行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M07 | 幂等 | AdminActivityPage 的幂等行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M08 | 并发 | AdminActivityPage 的并发行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M09 | 安全 | AdminActivityPage 的安全行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| M-M10 | 测试 | AdminActivityPage 的测试行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |

## 差距清单

| GAP ID | 原子项 ID | 差距描述 | 影响 | 优先级 | 建议 |
|---|---|---|---|---|---|
| GAP-admin-activity-001 | M-001..M-100 | 页面专属需求、测试、后端/DB及动态路由证据未完成对应核验 | 无法确认符合性 | P1 | 补充可追溯需求原文和测试证据后复核 |
