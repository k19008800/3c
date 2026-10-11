# 项目长期记忆 — 3cloud

## 项目定位
AI Token 聚合中转平台。`C:\Users\ZH\.openclaw\workspace\3cloud`，知识库/需求文档在 `kb/`。

## 技术栈与端口
- api@3000（Fastify 5 + Drizzle + PG17 `threecloud_v3` + Redis）
- web-console@5175（React + Vite，**挂在 `/app` 前缀下**，如 `/app/admin/finance/supplier-bill-match`）
- web-portal@5177
- `pnpm dev` 只起 api + portal，console 需单独起

## 关键约定（踩过的坑，勿重犯）

### 1. camelCase / snake_case 读写不对称
后端 `db.select()` 直返 Drizzle 行 → 响应是 **camelCase**（`windowSec`/`ruleId`/`firedAt`）；
但 `parseRuleBody()` 类写入口校验读的是 **snake_case**（`window_sec`/`channel_ids`）。
手写对象字面量端点（如 `supplier-bill-match`）则恰好是 snake_case。
**判断方法：看路由是 `db.select()` 直返还是手写对象。**

### 2. 时区陷阱（FIX-14，最高危）
金额表 `created_at` 是 `timestamp without time zone`（墙钟时间），
但 Drizzle 把 JS `Date` 序列化成 **UTC 字面量**比较。
用 `new Date(y, m-1, 1)` 构造月初 → Asia/Shanghai 下变成前一日 `16:00Z`，
窗口前移 8 小时 → 财务错账且**不报错**（实测 2026-08 少算 ¥1301.63，占 15%）。
**统一用 `api/src/lib/month-range.ts` 的 `Date.UTC` 版本，禁止再写本地时区构造。**

### 3. period 只查格式不够
`2026-13`/`2026-00` 能过 `/^\d{4}-\d{2}$/`，且 `new Date(2026,12,1)` 会滚到 2027-01，
结果是「查不到数据」被误读成「该月无消费」。用 `assertPeriod()`。

### 4. shared-ui 组件真实 prop
`Tag type=`（非 color）、`PageHeader help=`（非 description）、`Pagination current=`（非 page）、
Tab 用 `c3-sub-tabs`/`c3-sub-tab`（**没有** `c3-tabs`/`c3-tab`）。

### 5. CSS 陷阱
`table-layout:fixed` + `white-space:nowrap` → 长文本省略号截断（内容列需 `whiteSpace:normal`）；
`c3-stat-grid` 默认 4 列，放 3 卡要显式 `gridTemplateColumns`；
操作列多按钮需固定 px 宽 + `flexWrap`。

### 6. 测试纪律
- **api 单测与 dev 栈不可并行**（共用 Redis/PG 会假红）
- 真实浏览器测试用 `chrome --headless=new --remote-debugging-port=9222` + `playwright-core`的 `connectOverCDP`
- e2e 脚本写路由要带 `/app` 前缀，否则 404 到 SPA 兜底页，**看起来像"前端没渲染"实为路径错**
- npx 拿不到本地 tsc，要用 `./node_modules/.bin/tsc`
- e2e/*.cjs 已在 `eslint.config.js` 单独段声明 Node globals

## 数据现状（2026-10-11 核查）
`consumption_records` 9979 行，`supplier_id` 仅 404 行有值、`supplier_model_id` 仅 116 行。
根因：`settle.ts` 中 `supplierId: channel?.supplier.id`，mock 回退时 `channel` 为 null。
→ 各月成本归属覆盖率仅 **0.06%~0.5%**，99%+ 成本无法归因到供应商。
供应商账单核对页已就此加橙色覆盖率告警横幅（FIX-15）。
**这是待处理的结构性数据问题，不是本轮引入。**