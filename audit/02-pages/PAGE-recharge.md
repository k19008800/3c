# 页面原子审计：用户端充值中心

## 页面元数据

- 页面编号：AUDIT-RECHARGE
- 页面名称：用户端充值中心
- 应用：console
- 路由：`/recharge`
- 源码：`web-console/src/pages/RechargePage.tsx`
- 原型：UNKNOWN
- PRD：`3cloud/docs/ref-2.2.6-recharge.md`
- SPEC：`3cloud/docs/SPEC-§29-资金与对账管理.md`
- 适用角色：用户
- 审计轮次：首批 A；本文件为全新审计，不复用旧审计结论

## 原子核对表

| ID | 维度 | 单一核对断言 | 需求出处 | 需求摘录/核对目标 | 实现证据（文件:行号） | 测试证据 | 状态 | 优先级 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| RECHARGE-0001 | route | 页面可通过指定路由进入。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面可通过指定路由进入 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0002 | route | 页面路由与 route-inventory 中的目标一致。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面路由与 route-inventory 中的目标一致 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0003 | route | 未登录访问页面时执行统一鉴权。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：未登录访问页面时执行统一鉴权 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0004 | route | 直接刷新指定路由后页面可恢复。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：直接刷新指定路由后页面可恢复 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0005 | route | 未知子路径不会误渲染本页面。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：未知子路径不会误渲染本页面 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0006 | route | 页面入口在财务导航中可定位。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面入口在财务导航中可定位 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0007 | page | 页面显示明确的功能标题。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面显示明确的功能标题 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0008 | page | 页面标题旁显示页面级 [?] 帮助入口。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面标题旁显示页面级 [?] 帮助入口 | `web-console/src/pages/RechargePage.tsx:194` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0009 | page | 页面级帮助说明适用角色。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面级帮助说明适用角色 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0010 | page | 页面级帮助说明功能定位。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面级帮助说明功能定位 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0011 | page | 页面级帮助说明核心操作。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面级帮助说明核心操作 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0012 | page | 页面级帮助说明注意事项。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面级帮助说明注意事项 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0013 | page | 页面级帮助说明常见问题。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面级帮助说明常见问题 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0014 | page | 页面级帮助内容与需求文档一致。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面级帮助内容与需求文档一致 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0015 | layout | 页面包含主要数据区域。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面包含主要数据区域 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0016 | layout | 页面包含操作区域。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面包含操作区域 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0017 | layout | 页面使用统一的页面间距。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面使用统一的页面间距 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0018 | layout | 页面使用统一的字体层级。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面使用统一的字体层级 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0019 | layout | 页面使用统一的颜色语义。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面使用统一的颜色语义 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0020 | layout | 页面在窄屏下不产生不可操作的横向溢出。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面在窄屏下不产生不可操作的横向溢出 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0021 | layout | 页面的主要操作在首屏可发现。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面的主要操作在首屏可发现 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0022 | layout | 页面的次要操作不遮挡主要数据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面的次要操作不遮挡主要数据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0023 | state | 首次进入页面显示初始状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：首次进入页面显示初始状态 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0024 | state | 数据加载中显示 loading 指示器。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：数据加载中显示 loading 指示器 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0025 | state | 数据为空时显示非空白说明。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：数据为空时显示非空白说明 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0026 | state | API 错误时显示错误提示。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：API 错误时显示错误提示 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0027 | state | 网络断开时显示可理解的错误提示。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：网络断开时显示可理解的错误提示 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0028 | state | 错误状态提供重试入口。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：错误状态提供重试入口 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0029 | state | 提交中显示进行中状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：提交中显示进行中状态 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0030 | state | 提交成功显示明确反馈。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：提交成功显示明确反馈 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0031 | state | 提交失败显示明确反馈。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：提交失败显示明确反馈 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0032 | state | 刷新后保留可恢复的页面状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：刷新后保留可恢复的页面状态 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0033 | permission | 无页面权限时不泄露业务数据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：无页面权限时不泄露业务数据 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0034 | permission | 无页面权限时显示权限说明。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：无页面权限时显示权限说明 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0035 | permission | 有页面权限的角色可读取页面数据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：有页面权限的角色可读取页面数据 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0036 | permission | 权限变化后页面不会继续执行失权操作。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：权限变化后页面不会继续执行失权操作 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0037 | permission | 越权写请求返回 403。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：越权写请求返回 403 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0038 | permission | 403 不被前端转换为成功状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：403 不被前端转换为成功状态 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0039 | permission | 权限拒绝不写业务成功审计。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：权限拒绝不写业务成功审计 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0040 | permission | 有效权限范围与需求角色矩阵一致。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：有效权限范围与需求角色矩阵一致 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0041 | data | 列表展示主业务标识。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表展示主业务标识 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0042 | data | 列表展示金额或核心数值。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表展示金额或核心数值 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0043 | data | 列表展示业务状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表展示业务状态 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0044 | data | 列表展示发生时间。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表展示发生时间 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0045 | data | 列表展示关联用户或主体。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表展示关联用户或主体 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0046 | data | 列表展示关联单据或流水标识。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表展示关联单据或流水标识 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0047 | data | 金额按人民币格式展示。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：金额按人民币格式展示 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0048 | data | 金额精度不会被无意四舍五入。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：金额精度不会被无意四舍五入 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0049 | data | 时间展示使用统一时区口径。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：时间展示使用统一时区口径 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0050 | data | 状态使用统一状态徽标。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：状态使用统一状态徽标 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0051 | data | 缺失可选字段显示占位符。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：缺失可选字段显示占位符 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0052 | data | 敏感字段不在列表中明文泄露。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：敏感字段不在列表中明文泄露 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0053 | data | 列表数据与接口响应字段映射一致。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表数据与接口响应字段映射一致 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0054 | data | 列表排序有明确默认顺序。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：列表排序有明确默认顺序 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0055 | data | 数据更新后列表可见最新状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：数据更新后列表可见最新状态 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0056 | query | 页面提供需求定义的筛选入口。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面提供需求定义的筛选入口 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0057 | query | 筛选值会传入查询请求。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：筛选值会传入查询请求 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0058 | query | 切换筛选后分页回到第一页。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：切换筛选后分页回到第一页 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0059 | query | 连续快速切换筛选不会展示过期结果。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：连续快速切换筛选不会展示过期结果 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0060 | query | 日期范围起点可被独立设置。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：日期范围起点可被独立设置 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0061 | query | 日期范围终点可被独立设置。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：日期范围终点可被独立设置 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0062 | query | 空筛选条件不会生成非法查询参数。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：空筛选条件不会生成非法查询参数 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0063 | query | 分页总数与接口分页元数据一致。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：分页总数与接口分页元数据一致 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0064 | query | 不存在的筛选值会得到友好反馈。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：不存在的筛选值会得到友好反馈 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0065 | query | 查询失败不会清空已有可用数据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：查询失败不会清空已有可用数据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0066 | api | 页面调用需求定义的读取接口。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面调用需求定义的读取接口 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0067 | api | 读取请求携带当前筛选条件。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：读取请求携带当前筛选条件 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0068 | api | 读取请求处理非 2xx 响应。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：读取请求处理非 2xx 响应 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0069 | api | 读取响应缺少列表时不会导致渲染崩溃。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：读取响应缺少列表时不会导致渲染崩溃 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0070 | api | 接口返回金额字段按字符串或安全数值处理。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：接口返回金额字段按字符串或安全数值处理 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0071 | api | 接口返回时间字段按统一格式处理。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：接口返回时间字段按统一格式处理 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0072 | api | 接口超时显示错误状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：接口超时显示错误状态 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0073 | api | 重复读取不会产生重复列表项。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：重复读取不会产生重复列表项 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0074 | api | 接口权限错误显示权限反馈。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：接口权限错误显示权限反馈 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0075 | api | 接口数据异常不会执行危险默认操作。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：接口数据异常不会执行危险默认操作 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0076 | api | 写接口仅在存在对应操作入口时调用。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：写接口仅在存在对应操作入口时调用 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0077 | api | 写请求成功后刷新相关查询。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：写请求成功后刷新相关查询 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0078 | api | 写请求失败后保留用户可修正的输入。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：写请求失败后保留用户可修正的输入 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0079 | security | 资金或财务写操作执行前进行二次确认。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：资金或财务写操作执行前进行二次确认 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0080 | security | 敏感操作记录操作者身份。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：敏感操作记录操作者身份 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0081 | security | 敏感操作记录操作时间。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：敏感操作记录操作时间 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0082 | security | 敏感操作记录操作结果。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：敏感操作记录操作结果 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0083 | security | 客户端不能单独决定资金状态。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：客户端不能单独决定资金状态 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0084 | security | 重复点击不会重复执行资金写操作。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：重复点击不会重复执行资金写操作 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0085 | security | 并发状态变更只有一个请求成功。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：并发状态变更只有一个请求成功 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0086 | security | 失败操作不会伪造成功反馈。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：失败操作不会伪造成功反馈 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0087 | security | 错误信息不暴露内部堆栈。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：错误信息不暴露内部堆栈 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0088 | security | 操作完成后可追溯关联单据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：操作完成后可追溯关联单据 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0089 | test | 页面存在对应的组件测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在对应的组件测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0090 | test | 页面存在正常数据场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在正常数据场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0091 | test | 页面存在空数据场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在空数据场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0092 | test | 页面存在 API 错误场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在 API 错误场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0093 | test | 页面存在权限场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在权限场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0094 | test | 页面存在边界数据场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在边界数据场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0095 | test | 页面存在重复操作场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在重复操作场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0096 | test | 页面存在并发场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在并发场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0097 | test | 页面存在审计场景测试证据。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面存在审计场景测试证据 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0098 | test | 页面验收结果可由独立测试复核。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：页面验收结果可由独立测试复核 | `UNKNOWN` | UNKNOWN | P2 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0099 | field | 充值金额输入框可输入金额。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额输入框可输入金额 | `web-console/src/pages/RechargePage.tsx:207` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0100 | field | 充值金额支持快捷金额 ¥50。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额支持快捷金额 ¥50 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0101 | field | 充值金额支持快捷金额 ¥100。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额支持快捷金额 ¥100 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0102 | field | 充值金额支持快捷金额 ¥200。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额支持快捷金额 ¥200 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0103 | field | 充值金额支持快捷金额 ¥500。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额支持快捷金额 ¥500 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0104 | field | 充值金额支持快捷金额 ¥1000。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额支持快捷金额 ¥1000 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0105 | field | 充值金额支持快捷金额 ¥5000。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额支持快捷金额 ¥5000 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0106 | field | 充值金额拒绝低于最小值的输入。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额拒绝低于最小值的输入 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0107 | field | 充值金额拒绝超过最大值的输入。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额拒绝超过最大值的输入 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0108 | field | 充值金额最多保留两位小数。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值金额最多保留两位小数 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0109 | field | 充值后余额预览随金额变化。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值后余额预览随金额变化 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0110 | action | 支付宝扫码入口可执行。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：支付宝扫码入口可执行 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0111 | action | 微信支付入口可执行。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：微信支付入口可执行 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0112 | action | 对公转账入口可执行。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：对公转账入口可执行 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0113 | action | 对公转账凭证上传入口可执行。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：对公转账凭证上传入口可执行 | `web-console/src/pages/RechargePage.tsx:341` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0114 | action | 已上传凭证可移除。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：已上传凭证可移除 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0115 | action | 确认充值入口可执行。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：确认充值入口可执行 | `web-console/src/pages/RechargePage.tsx:443` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0116 | action | 充值记录链接可进入完整记录页。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值记录链接可进入完整记录页 | `web-console/src/pages/RechargePage.tsx:462` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0117 | action | 支付弹窗提供关闭入口。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：支付弹窗提供关闭入口 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0118 | action | 支付结果提供成功入口。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：支付结果提供成功入口 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0119 | action | 支付结果提供失败入口。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：支付结果提供失败入口 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0120 | boundary | 支付二维码具有三十分钟有效期。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：支付二维码具有三十分钟有效期 | `UNKNOWN` | UNKNOWN | P1 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0121 | idempotency | 重复支付回调不会重复入账。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：重复支付回调不会重复入账 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |
| RECHARGE-0122 | transaction | 充值订单与余额变更具有原子性。 | `ref-2.2.6-recharge.md` §一 页面组件树 | §一 页面组件树；§三 API 接口；§五 验收标准：充值订单与余额变更具有原子性 | `UNKNOWN` | UNKNOWN | P0 | 首轮仅记录核对证据；未取得实现或测试证据不判 PASS。 |

## 页面状态矩阵

| 状态 | 单独核对断言 | 需求出处 | 实现证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|
| 首次进入 | 页面首次进入显示默认内容。 | `ref-2.2.6-recharge.md` §一 页面组件树；§三 API 接口；§五 验收标准 | UNKNOWN | UNKNOWN | UNKNOWN |
| 加载中 | 页面加载中显示 loading。 | `3cloud/docs/PRODUCT-DESIGN-PRINCIPLES.md` P4 | UNKNOWN | UNKNOWN | UNKNOWN |
| 空数据 | 页面空数据状态显示说明。 | `ref-2.2.6-recharge.md` §一 页面组件树；§三 API 接口；§五 验收标准 | UNKNOWN | UNKNOWN | UNKNOWN |
| 正常数据 | 页面正常数据状态显示业务数据。 | `ref-2.2.6-recharge.md` §一 页面组件树；§三 API 接口；§五 验收标准 | UNKNOWN | UNKNOWN | UNKNOWN |
| API 错误 | API 错误状态显示提示。 | `3cloud/docs/PRODUCT-DESIGN-PRINCIPLES.md` P4 | UNKNOWN | UNKNOWN | UNKNOWN |
| 权限不足 | 权限不足状态不泄露数据。 | `ref-2.2.6-recharge.md` §一 页面组件树；§三 API 接口；§五 验收标准 | UNKNOWN | UNKNOWN | UNKNOWN |
| 网络断开 | 网络断开状态可理解。 | `3cloud/docs/PRODUCT-DESIGN-PRINCIPLES.md` P4 | UNKNOWN | UNKNOWN | UNKNOWN |
| 重试 | 错误状态提供重试入口。 | `3cloud/docs/PRODUCT-DESIGN-PRINCIPLES.md` P4 | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交中 | 提交中阻止重复操作。 | `3cloud/docs/PRODUCT-DESIGN-PRINCIPLES.md` P4 | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交成功 | 成功状态展示明确反馈。 | `3cloud/docs/PRODUCT-DESIGN-PRINCIPLES.md` P4 | UNKNOWN | UNKNOWN | UNKNOWN |
| 提交失败 | 失败状态展示明确反馈。 | `3cloud/docs/PRODUCT-DESIGN-PRINCIPLES.md` P4 | UNKNOWN | UNKNOWN | UNKNOWN |
| 重复提交 | 重复提交不会重复产生业务结果。 | `ref-2.2.6-recharge.md` §一 页面组件树；§三 API 接口；§五 验收标准 | UNKNOWN | UNKNOWN | UNKNOWN |
| 刷新后 | 刷新后页面状态与服务端一致。 | `ref-2.2.6-recharge.md` §一 页面组件树；§三 API 接口；§五 验收标准 | UNKNOWN | UNKNOWN | UNKNOWN |

## 操作入口矩阵

本轮已从源码静态检索到的入口逐一列出；帮助、确认、权限、反馈、审计和测试证据分列，未核对项为 UNKNOWN。

| ID | 入口文本/选择器 | 操作断言 | 按钮帮助 | 二次确认 | 权限 | 成功反馈 | 失败反馈 | 审计 | 测试 |
|---|---|---|---|---|---|---|---|---|---|
| ENTRY-01 | 页面级 [?] | 页面级帮助可打开。 | 已检索 | UNKNOWN | N/A — 页面帮助入口不执行业务写操作，不涉及二次确认。 | UNKNOWN | UNKNOWN | N/A — 页面帮助打开本身不产生敏感业务变更，不生成业务审计记录。 | UNKNOWN |
| ENTRY-02 | 主要数据/筛选入口 | 入口可执行对应查询。 | UNKNOWN | N/A — 只读查询与筛选不产生不可逆业务变更，无需二次确认。 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| ENTRY-03 | 主要写操作入口 | 入口仅在授权时可执行。 | UNKNOWN | 应有 | 应有 | UNKNOWN | UNKNOWN | 应有 | UNKNOWN |
| ENTRY-04 | 状态/周期 tab | tab 切换会刷新对应数据。 | UNKNOWN | N/A — tab 切换仅改变查询视图，不提交业务操作。 | UNKNOWN | UNKNOWN | UNKNOWN | N/A — 视图切换不改变业务状态，不产生审计事件。 | UNKNOWN |
| ENTRY-05 | 重试/空态操作 | 操作可恢复页面数据。 | UNKNOWN | N/A — 重试或空态恢复仅重新读取数据，不执行业务写入。 | UNKNOWN | UNKNOWN | UNKNOWN | N/A — 数据重试/空态恢复不改变业务状态，不产生审计事件。 | UNKNOWN |

## API / 数据 / 权限矩阵

| ID | 类型 | 单一断言 | 前端证据 | 后端证据 | DB证据 | 权限证据 | 测试证据 | 状态 |
|---|---|---|---|---|---|---|---|---|
| API-01 | read | 页面读取接口路径与需求一致。 | UNKNOWN | UNKNOWN | N/A — 读取接口不直接写入充值订单或流水数据，DB写入证据不适用。 | UNKNOWN | UNKNOWN | UNKNOWN |
| API-02 | read | 读取请求错误可被页面处理。 | UNKNOWN | UNKNOWN | N/A — 读取错误处理不执行数据库变更，DB写入证据不适用。 | UNKNOWN | UNKNOWN | UNKNOWN |
| API-03 | write | 写请求参数满足字段约束。 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| API-04 | transaction | 资金状态与流水写入具备事务语义。 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| API-05 | audit | 敏感操作具备审计证据。 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |
| API-06 | permission | 写接口具备后端权限校验。 | UNKNOWN | UNKNOWN | N/A — 权限校验结论由应用层/权限证据验证，非数据库写入断言。 | UNKNOWN | UNKNOWN | UNKNOWN |

## 差距清单

| GAP ID | 原子项 ID | 差距描述 | 影响 | 优先级 | 建议 |
|---|---|---|---|---|---|
| GAP-RECHARGE-001 | 多个 UNKNOWN 项 | 本轮尚未取得对应实现或测试证据。 | 无法判定交付符合性。 | P0 | 后续补充源码、后端、数据库、运行及测试证据后复核。 |
