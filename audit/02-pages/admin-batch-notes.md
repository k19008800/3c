# Admin 页面原子审计批次 A1 说明

- 范围：30 个指定 console 管理后台页面。
- 依据：`audit/00-baseline/page-inventory.csv`、`audit/01-requirements/ATOMIC-SCHEMA.md`、`audit/02-pages/PAGE-AUDIT-TEMPLATE.md`、`docs/PRODUCT-DESIGN-PRINCIPLES.md`，以及 `docs/PRD-管理后台.md`、对应 SPEC/ref 文档。
- 产出：每页独立 `PAGE-<slug>.md`，每页 141 条单一断言，覆盖路由、帮助、布局、字段、查询、表单、按钮、弹窗、状态、反馈、权限、API、DB、安全/审计/幂等/并发/事务和测试证据。
- 证据政策：源码定位仅作为待核对入口；未执行动态测试，且缺乏后端/DB直接证据的项目均标记 `UNKNOWN`。未复用旧页面审计结论，不生成 PASS。
- 只读边界：本批次脚本只写入 `audit/02-pages/` 审计文档；未修改业务源码。
- 重点产品原则：P1 页面标题 `[?]` 与每个操作入口按钮级 `[?]` 均作为独立断言；P3 敏感/资金/权限操作须二次确认、审计及批量错误报告；P4 loading/空态/错误/重试/处理中/反馈分别核对。
