# 差距矩阵 C：Portal 门户与运营增长（§1 / §6 / §8 / §17 / §21）

> 生成时间：2026-10-02
> 代码基线：git HEAD `91f62d3`，品牌「浩寅云」
> 梳理范围：`api/src/routes/{public,suppliers,admin-announcements,me-gap}.ts` + `web-portal/src/app/**` + `next.config.mjs`
> 状态图例：✅已实现 / 🟡部分实现 / ❌未实现 / 📄文档超前

---

## A. 后端公开端点清单（无需认证）

| # | 方法 | 路径 | 代码位置 | 用途 |
|---|------|------|----------|------|
| A1 | GET | `/api/v1/public/site-config` | `public.ts:58` | 站点品牌配置（12 个 site_* key 白名单） |
| A2 | GET | `/api/v1/public/api-config` | `public.ts:78` | 对外 API base_url（OpenAI/Anthropic 双地址） |
| A3 | GET | `/api/v1/public/models` | `public.ts:93` | 公开模型目录（active 销售定价 join） |
| A4 | GET | `/api/v1/public/models/health` | `public.ts:133` | 公开模型健康度（成功率/P50/最低价） |
| A5 | GET | `/api/v1/public/status` | `public.ts:169` | 系统状态（基础设施+供应商+内嵌公告 top10+统计） |
| A6 | GET | `/api/v1/public/i18n/entries` | `public.ts:267` | 门户 i18n 词典（lang+scope，5min 缓存） |
| A7 | GET | `/api/v1/public/blog` | `public.ts:298` | 博客列表（site_content type=blog，分页） |
| A8 | GET | `/api/v1/public/blog/:slug` | `public.ts:344` | 博客详情 |
| A9 | GET | `/api/v1/public/pricing` | `suppliers.ts:835` | 公开定价表（vendor_pricing join，含缓存价） |
| A10 | GET | `/api/v1/public/stats` | `suppliers.ts:865` | 公开统计（models/vendors/users/totalTokens） |
| A11 | GET | `/api/v1/models/:name/channels` | `public.ts:399` | 单模型渠道定价（无鉴权，渠道化） |
| A12 | GET | `/api/v1/models/:name/codes` | `public.ts:486` | 单逻辑模型下的模型编码清单 |

**用户端公告（需登录，非公开域）：**

| 方法 | 路径 | 代码位置 |
|------|------|----------|
| GET | `/api/v1/me/announcements` | `me-gap.ts:213` |
| GET | `/api/v1/me/announcements/unread-count` | `me-gap.ts:252` |
| POST | `/api/v1/me/announcements/:id/read` | `me-gap.ts:272` |
| POST | `/api/v1/me/announcements/read-all` | `me-gap.ts:288` |

**管理端公告（adminAuth）：**

| 方法 | 路径 | 代码位置 |
|------|------|----------|
| GET/POST | `/api/v1/admin/announcements` | `admin-announcements.ts:91/145` |
| PUT/DELETE | `/api/v1/admin/announcements/:id` | `admin-announcements.ts:190/257` |
| GET | `/api/v1/admin/announcements/:id/readers` | `admin-announcements.ts:275` |

**注意：不存在独立的「公开公告列表」端点。** 公告对未登录访客仅以 top10 形式内嵌在 `/public/status` 响应里（A5），无独立公开公告 API，Portal 前端也未渲染它。

---

## B. web-portal 前端页面路由清单

根 layout：`src/app/layout.tsx`（Header 导航 6 项 + Footer 3 列）。技术栈 Next.js 15 App Router（SSR/Server Components，非 SPEC §21.1 所述 vike）。

| 文件 | URL 路径 | 功能 | SSR | [?]帮助 |
|------|----------|------|-----|---------|
| `app/page.tsx` | `/` | 首页（Hero+Stats+特性+模型网格+步骤+代码示例+价格表+FAQ+CTA） | ✅ force-dynamic | ✅ PageHelp |
| `app/about/page.tsx` | `/about` | 关于我们（公司介绍+里程碑时间线+技术栈+联系方式） | ✅ async | ❌ 无 PageHelp |
| `app/blog/page.tsx` | `/blog` | 博客列表（卡片流） | ✅ force-dynamic | ✅ PageHelp |
| `app/blog/[slug]/page.tsx` | `/blog/[slug]` | 博客详情 | ✅（继承 lib/blog.ts） | ✅（沿用列表页文案） |
| `app/models/page.tsx` | `/models` | 模型目录（卡片网格+健康度徽标） | ✅ async | ✅ PageHelp |
| `app/pricing/page.tsx` | `/pricing` | 定价表+PriceCalculator+FAQ | ✅ async | ✅ PageHelp |
| `app/status/page.tsx` | `/status` | 系统状态（API 网关+供应商健康） | ❌ "use client" | ❌ 无 PageHelp |

**导航栏实际项**（layout.tsx:84-91）：首页 / 模型目录 / 定价 / 博客 / 关于 / 状态。
**Footer 链接**（layout.tsx:155-183）：/models、/pricing、/status、/blog、/about、`/app/help`（跳控制台）、`/privacy`（**404 死链**）、`/terms`（**404 死链**）。

**next.config.mjs redirects 关键条目**：`/login→/app/login`、`/register→/app/register`、`/help→/app/help`、`/announcements→/app/announcements`、`/dashboard→/app/` 等——即 Portal 不承载登录/注册/帮助/公告页，全部收敛到 `/app/*`（web-console 构建产物）。

**public/ 静态资源**：仅 `.next/`、构建产物 `app/index.html`+`assets/`。**无 sitemap.xml、无 robots.txt、无 favicon 独立文件**（favicon 走 site_config）。

---

## C. 功能点差距矩阵

### C.1 §6 Portal 门户核心页

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 6.1-a | Hero 标题/副标题 | `app/page.tsx:253-257` | SPEC§6.1 | ✅ | i18n 化，文案走词典 |
| 6.1-b | 3 个 CTA [立即注册][查看文档][查看模型] | `app/page.tsx:259-262` | SPEC§6.1 | 🟡 | 实际为 [查看模型][查看定价][注册]，**缺「查看文档」入口**（/docs 不存在） |
| 6.1-c | StatsBanner 实时统计 | `app/page.tsx:287-296` + A10 | SPEC§6.1 | 🟡 | SPEC 要求 3 项（模型/用户/Token，5min 缓存）；实际 4 项（多 vendors）且 `cache:"no-store"` **无缓存** |
| 6.1-d | 3 张 Feature Card | `app/page.tsx:213-220` | SPEC§6.1 | ✅ | 实际 6 张卡片（unified/routing/billing/vendors/security/multidevice），超出文档 |
| 6.2-a | 定价表格 | `app/pricing/page.tsx:159-201` | SPEC§6.2 | ✅ | 列含 code/model/input/output/cacheRead/cacheWrite/context |
| 6.2-b | 分类筛选标签 | `app/pricing/page.tsx:148-157` | SPEC§6.2 | 🟡 | pill 渲染存在，但 category 全硬编码 `"对话"`（`fetchPricing` 映射写死），**嵌入/图像/音频分类无效** |
| 6.2-c | 搜索框 | — | SPEC§6.2 | ❌ | 定价页无搜索 |
| 6.2-d | 底部 FAQ | `app/pricing/page.tsx:208-221` | SPEC§6.2 | ✅ | 5 条 FAQ（i18n） |
| 6.2-e | 5min 缓存 | `cache:"no-store"` | SPEC§6.2 | ❌ | 每次请求实时打 DB，无 CDN/HTTP 缓存 |
| 6.3-a | 模型卡片网格 | `app/models/page.tsx:100-141` | SPEC§6.3 | ✅ | 含健康度徽标/P50/最低价 |
| 6.3-b | 搜索框 | — | SPEC§6.3 | ❌ | 无搜索 |
| 6.3-c | 分类筛选（对话/嵌入/图像/音频/重排序/视频） | — | SPEC§6.3 | ❌ | 无筛选 UI |
| 6.3-d | 点击弹窗详情 | — | SPEC§6.3 | ❌ | 卡片即详情，无 modal/抽屉 |
| 6.3-e | [立即使用]→注册 | — | SPEC§6.3 | ❌ | 卡片无跳转注册按钮 |
| 6.4-a | **开发者文档页 /docs** | — | SPEC§6.4 / §21.1 | ❌ | **整页缺失**：无快速开始/API参考/错误码表/多语言代码示例。导航栏无入口。首页 CTA「查看文档」亦无目标 |

### C.2 §21 Portal 门户增强

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 21.1-a | 页面 SEO 元数据 | `generateMetadata` on /,/pricing,/blog | SPEC§21.1 | ✅ | title/description/OpenGraph/hreflang 已做（Next App Router SSR） |
| 21.1-b | sitemap.xml | — | SPEC§21.1 | ❌ | public/ 无 sitemap.xml，无动态路由生成 |
| 21.1-c | robots.txt | — | SPEC§21.1 | ❌ | public/ 无 robots.txt |
| 21.1-d | JSON-LD 结构化数据 | — | SPEC§21.1 | ❌ | 无 Organization/Product/Article/Breadcrumb Schema |
| 21.1-e | SSR 缓存 5min | `cache:"no-store"` | SPEC§21.1 | 🟡 | Next SSR 已实现，但动态数据全部 no-store，无 max-age=300 |
| 21.2-a | Blog 列表页 /blog | `app/blog/page.tsx` | SPEC§21.2 | ✅ | 卡片流+日期 |
| 21.2-b | Blog 详情页 /blog/:slug | `app/blog/[slug]/page.tsx` | SPEC§21.2 | ✅ | |
| 21.2-c | 分类筛选/搜索 | — | SPEC§21.2 | ❌ | 列表无 tab、无搜索框 |
| 21.2-d | RSS Feed `/public/blog/rss` | — | SPEC§21.2 | ❌ | 无 RSS 端点 |
| 21.2-e | 后台文章编辑器 | — | SPEC§21.2 | ❌ | 无 admin-blog 路由（site_content 表存在但无管理 UI；文章靠 DB 直插） |
| 21.2-f | 定时发布/封面图/标签/SEO字段 | — | SPEC§21.2 | ❌ | 数据源 site_content 仅 id/slug/title/content/type/status，无 scheduledAt/coverImage/tags/seoTitle |
| 21.3 | **帮助中心 /help** | redirect→/app/help | SPEC§21.3 | ❌ | Portal 无公开帮助中心；/help 308 跳控制台。无 help_categories/help_articles 表、无公开 help API、无全文搜索、无文章反馈 |
| 21.4 | **联系我们 /contact** | — | SPEC§21.4 | ❌ | 无 /contact 页、无 contact_inquiries 表、无 POST /public/contact、无验证码/限流。/about 页仅静态展示邮箱电话 |
| 21.5-a | 价格计算器 | `pricing/PriceCalculator.tsx` | SPEC§21.5 | ✅ | 选模型+输入/输出 token→实时费用，已挂载 /pricing |
| 21.5-b | 多模型对比模式 | — | SPEC§21.5 | ❌ | 计算器仅单模型，无对比并排 |
| 21.5-c | 分享计算链接 | — | SPEC§21.5 | ❌ | 无 URL 参数回填（?model=&input=&output=） |
| 21.6-a | 公告已读/未读 | `me-gap.ts:213-305` | SPEC§21.6 | ✅ | 登录用户公告中心完整（列表/未读数/单读/全读） |
| 21.6-b | 公告 CRUD 后台 | `admin-announcements.ts` | SPEC§21.6 | ✅ | 增删改查+已读统计+审计日志 |
| 21.6-c | Blog 发布触发站内/邮件广播 | — | SPEC§21.6 | ❌ | 文章发布不触发通知广播，无 email 模板联动 |
| 21.7 | 在线 Demo 体验 /demo | — | SPEC§21.0 总览 | ❌ | 无 /demo 页、无 demo_access_logs 表 |
| 21.8-a | 状态页 /status | `app/status/page.tsx` | SPEC§21.0 | 🟡 | 仅展示 API 网关+供应商健康，客户端 CSR（非 SSR） |
| 21.8-b | 事件历史/时间线 | — | SPEC§21.8 | ❌ | 无 system_incidents 表、无历史事故展示 |
| 21.8-c | 状态页渲染公告 | `app/status/page.tsx` 未消费 announcements 字段 | SPEC§21.8 | ❌ | 后端 A5 已返回 announcements top10，前端未渲染 |
| 21.8-d | 邮件订阅/WebSocket 实时推送 | — | SPEC§21.8 | ❌ | 无 status_page_subscribers 表 |
| 21.9 | 平台对比页 /compare | — | SPEC§21.0 | ❌ | 无页面 |
| 21.10 | 免费 Key 引导条 | — | SPEC§21.0 | ❌ | 无全站 FreeApiKeyBanner 组件 |
| 21.11-a | SLA/合规页 /sla | — | SPEC§21.0 | ❌ | 无页面 |
| 21.11-b | Privacy/Terms 页 | footer 链 `/privacy` `/terms` | SPEC§21.0 | ❌ | **死链 404**，layout.tsx:179-180 硬编码但无对应 page.tsx |
| 21.12 | 客户案例 /cases | — | SPEC§21.0 | ❌ | 无 case_study 内容类型/页面 |

### C.3 §8 运营增长（Admin/Console 侧，非 Portal）

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 8.1 | 代理兑换码配额 | `admin-affiliate-coupons.ts`(+test) | SPEC§8.1 | ✅ | 路由存在，归属规则文档已对齐报备划拨制 |
| 8.2 | 充值活动自动赠送 | `recharge.ts` | SPEC§8.2 | 🟡 | 充值路由存在；campaigns 表/满赠规则匹配逻辑需在财务分片复核 |
| 8.3 | 用户分组推送 | `admin-marketing-missing.ts` | SPEC§8.3 | 🟡 | 路由文件存在（_missing 后缀暗示补缺口产物），分组筛选/站内+邮件推送需在客服分片复核 |
| 8.4 | 自动化流失召回 | — | SPEC§8.4 | ❓ | 未发现独立召回路由/定时任务；疑似未实现，待运营分片确认 |
| 8.5 | 推荐码营销 | — | SPEC§8.5 | ❓ | 未发现 referral/推荐码路由；待用户体系分片确认 |

> 说明：§8 主要是 admin/console 能力，本分片仅登记路由存在性，深度验证归运营/财务分片。

### C.4 §1 平台定位 / §17 路线图

| 编号 | 功能点 | 代码位置 | 文档位置 | 状态 | 差距说明 |
|---|---|---|---|---|---|
| 1.1 | 商业模型对外表达 | `app/about/page.tsx:111-128` | SPEC§1.1 | ✅ | 关于页完整描述采购→转售→代理佣金模型 |
| 1.2/1.3 | 运营 KPI 看板（12 指标） | `admin-analytics.ts`/`admin-dashboard.ts` | SPEC§1.2/1.3 | ✅ | admin 路由存在，深度归管理后台分片 |
| 1.3 | 用户分层（5 层） | `admin-customers.ts` | SPEC§1.3 | 🟡 | 待管理后台分片验证分层逻辑是否落地 |
| 17 | 产品路线图公开页 | — | SPEC§17 | ❓ | §17 是内部排期文档，未要求公开页面；当前无 /roadmap 页（合理）。文档本身已过时（v1.0 当前 vs 实际已 Phase 2+） |

---

## D. 关键发现

1. **Portal 实际只有 7 个页面**：`/`、`/about`、`/blog`、`/blog/[slug]`、`/models`、`/pricing`、`/status`。相比 SPEC §21.0 路由规划要求的 18 条 URL，**缺 11 条**：/docs、/help、/contact、/demo、/compare、/sla、/cases、/privacy、/terms、sitemap.xml、robots.txt。

2. **最高优先级缺口 = 开发者文档页 /docs（§6.4）**：这是 SPEC 明确要求的四大核心页之一，首页 CTA 「查看文档」也无落点。当前零代码。

3. **Footer 死链**：`layout.tsx:179-180` 硬编码 `/privacy`、`/terms`，但无对应 page.tsx，线上直接 404——这是已发布页面的可见缺陷，应优先修。

4. **公开公告无访客入口**：后端 `/public/status` 已返回 announcements top10，登录用户有完整 me/announcements 中心，但 **未登录访客在 Portal 上看不到任何公告**，且 /status 页前端未消费 announcements 字段。

5. **SEO 半成品**：Next.js SSR + generateMetadata 已到位（优于 SPEC 设想的 vike 方案），但缺 sitemap.xml / robots.txt / JSON-LD 三件套；所有动态数据 `cache:"no-store"`，与 SPEC「5 分钟缓存」要求相反。

6. **Blog 模块前后端不对称**：公开 API + 前端列表/详情已通，但**无后台文章编辑器**（site_content 表无 admin CRUD 路由），内容只能靠 DB 直插；无 RSS、无分类筛选、无定时发布。

7. **价格计算器（§21.5）是少数已超额落地的增强项**，但仅单模型计算，缺 SPEC 要求的对比模式与分享链接。

8. **分类筛选名存实亡**：定价页与首页的模型 category 在 API 映射层硬编码为 `"对话"`（`page.tsx:79`、`pricing/page.tsx:40`），嵌入/图像/音频/视频分类标签虽然渲染但永远不会出现——公开 `/public/models` 接口返回 `category: sql\`null\``（public.ts:98），分类数据链路断在后端。

9. **[?] 帮助落地不均**：首页/模型/定价/博客已带 PageHelp；`/about`、`/status` 两个页面缺页面级 `[?]`（违反 PRODUCT-DESIGN-PRINCIPLES.md 红线）。

10. **§8 运营增长中 8.4 流失召回、8.5 推荐码疑似未实现**，需运营分片在 admin 路由中进一步确认。

---

### 建议补全优先级（供下一步执行参考）

| 优先级 | 动作 |
|--------|------|
| P0 止血 | 修 Footer 死链（/privacy、/terms）；给 /about、/status 补 [?] 帮助 |
| P0 核心 | 新建 /docs 开发者文档页（快速开始+API参考+错误码+代码示例） |
| P1 SEO | 补 sitemap.xml、robots.txt、JSON-LD；动态接口加 5min 缓存 |
| P1 内容 | 补公开公告展示（/status 渲染 announcements 或独立 /announcements 页）；admin 文章编辑器 |
| P1 转化 | /contact 联系表单 + /help 公开帮助中心 |
| P2 增强 | 价格计算器对比/分享；Blog RSS/分类筛选；状态页事件时间线 |
