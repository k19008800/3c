# 邮件模板页面审计备注

- 审计对象：`PAGE-0061` / `AdminEmailTemplatesPage`
- 审计时间：2026-08-30
- 范围：只读补做页面审计；未修改业务源码。
- 页面源码：`web-console/src/pages/AdminEmailTemplatesPage.tsx`（181 行）
- 路由证据：`web-console/src/App.tsx:289` 注册 `admin/config/email-templates`；菜单入口在 `web-console/src/layouts/ConsoleLayout.tsx:115`。
- 后端路由：`api/src/routes/admin-email.ts`，覆盖 GET/POST/PUT/DELETE 模板、POST 测试预览/发送、GET 日志。
- 数据表：`api/src/db/schema/email-templates.ts`、`api/src/db/schema/email-logs.ts`。
- 发送链路：`api/src/services/mailer.ts` 写入 pending 并更新 sent/failed/skipped；`api/src/services/notify.ts` 按策略查询模板、插值并调用 mailer。

## 需求文档定位

1. `docs/PRODUCT-DESIGN-PRINCIPLES.md` §P1–P4：页面级/按钮级帮助、二次确认、loading/empty/error/retry、成功失败反馈。
2. `docs/SPEC-ref-notification-templates.md` §1：统一模板引擎流程、变量替换、失败重试；§2：统一 `{{变量名}}`；§3：管理后台模板列表和编辑器；§5：模板覆盖规则；§6：发送日志字段与 180 天留痕；§7：管理 API 和 admin 权限；§8：未知变量、测试发送、失败重试、注入防护验收。
3. `docs/ref-4.17-template-library.md` §5：版本管理/回滚；§6：导入导出及同名检测；§7.3：邮件模板字段（主题、HTML、纯文本、页脚等）；§9/§12/§13：API、边界和验收。
4. `docs/ref-4.14.5-notification-rules.md` §4.2：异步批量邮件、每分钟 100 封、退订、统一 Header/Footer、效果追踪。

## 真实源码观察

- 页面有两个 tab、模板列表、变量列表、编辑 modal、预览 modal、保存/删除/测试/真实发送 mutation。
- 页面级 `HelpIcon` 只出现在两个 h2 标题旁；源码未见每个 button/tab/输入操作旁的 `HelpIcon` 或 Tooltip。
- 模板列表查询有 loading 和空态；未渲染 `isError`/重试分支。日志查询同样只有 loading/空态。
- 编辑既有模板时从列表行构造 editor，但把 `body_html_zh` 与 `body_html_en` 设为空字符串；当前列表 GET 的 `toRow` 虽然返回正文，`ET` 接口类型却未声明正文。
- 删除 mutation 直接调用，无二次确认。
- 新建保存按钮 disabled 条件只检查中文主题和中文正文，不检查新建模板名；长度、邮箱格式、字段级错误未在前端呈现。
- 日志查询前端发送 `page_size=100`，后端读取 `pageSize`，存在分页参数不一致风险。
- 预览用 `dangerouslySetInnerHTML`；后端 `notify.ts` 注释明确模板插值“不做转义引擎”，与注入防护需求冲突。
- 后端 `adminAuth` 只接受 `admin`/`super_admin`，CRUD 和 test/log 路由均挂载该 preHandler。
- 后端模板名唯一；创建/更新/删除/测试分别有必填、空更新、找不到和收件地址基本校验，但没有专用 Zod schema 证据。
- `mailer.ts` 记录邮件内容和状态，但 schema 未见变量快照、操作者、重试次数、送达时间；未见 outbox/队列、限速、指数退避或版本冲突条件。
- 本次报告将需求存在与实现存在分开记录；所有没有专门测试名称/动态验证的条目均保持 `UNKNOWN`，没有伪造 PASS。

## 测试证据检索结果

- `web-console` 仅定位到 `src/lib/i18n.test.ts`，未定位邮件模板页面测试。
- `api/src` 未定位 `admin-email.test.ts`、mailer 专项测试或 email-template 专项测试；已有其他模块测试中出现通知/邮件相关断言，但不能作为本页面 CRUD/预览/发送完整证据。
- 因此页面表 ET-178–ET-188 以及矩阵测试列保持 `UNKNOWN`，建议补充页面组件、路由权限、mailer 安全/重试/幂等和并发测试。

## 报告覆盖

`PAGE-admin-email-templates.md` 共 188 条编号原子项，另含：

- 13 个页面状态矩阵状态；
- 12 个真实操作入口矩阵入口（含两个 tab、创建、编辑、测试、删除、取消、保存、真实发送、modal 关闭、收件邮箱）；
- 16 个 API/数据/权限矩阵项；
- 12 个差距项。

报告重点覆盖标题级帮助、每个真实操作入口及按钮帮助、字段校验、加载/空态/错误态、权限、API、持久化、并发、幂等、审计、通知和测试。
