# §21 Portal 门户增强

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03）
- 权威源：`web-portal/src/app/**`（Next.js 15 App Router）、`api/src/routes/public.ts`、`next.config.mjs`
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 21.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 21.1.1 | 页面 SEO 元数据 | `generateMetadata`（/、/pricing、/blog：title/description/OpenGraph/hreflang） | ✅ | SSR 已优于旧文档设想的 vike 方案 |
| 21.1.2 | sitemap.xml / robots.txt / JSON-LD | —（public/ 无此三件套） | ❌ | |
| 21.1.3 | 动态数据 5min 缓存 | 全部 `cache:"no-store"` | ❌ | 每次请求实时打 DB，与旧文档"5min 缓存"要求相反 |
| 21.2.1 | Blog 列表/详情 | `app/blog/page.tsx`、`app/blog/[slug]/page.tsx`；`GET /api/v1/public/blog[/:slug]` | ✅ | 卡片流+详情齐 |
| 21.2.2 | Blog 分类筛选/搜索/RSS | — | ❌ | 列表无 tab/搜索；无 RSS 端点 |
| 21.2.3 | Blog 后台编辑器 | —（site_content 表存在但无 admin CRUD） | ❌ | 文章靠 DB 直插；无定时发布/封面/标签/SEO 字段 |
| 21.3 | 开发者文档页 `/docs` | — | ❌ | **整页缺失**：无快速开始/API 参考/错误码表/多语言代码示例；首页 CTA"查看文档"无落点 |
| 21.4 | 公开帮助中心 | `/help` 308 跳 `/app/help`（控制台） | ❌ | Portal 无公开帮助中心；无 help_articles 公开 API/全文搜索/反馈 |
| 21.5 | 联系我们 `/contact` | — | ❌ | 无 contact_inquiries 表/表单/验证码/限流；/about 仅静态联系方式 |
| 21.6.1 | 价格计算器 | `pricing/PriceCalculator.tsx` | ✅ | 选模型+输入/输出 token 实时费用 |
| 21.6.2 | 多模型对比 / 分享链接回填 | — | ❌ | 仅单模型计算；无 ?model=&input=&output= URL 回填 |
| 21.7.1 | 登录用户公告中心 | `me-gap.ts`：`/me/announcements[/unread-count/:id/read/read-all]` | ✅ | 列表/未读数/单读/全读齐 |
| 21.7.2 | 公告管理后台 | `admin-announcements.ts` CRUD + 已读统计 | ✅ | |
| 21.7.3 | 访客公告可见 | 后端 `/public/status` 内嵌公告 top10 | 🟡 | 数据已返回，/status 前端未渲染；无独立公开公告页 |
| 21.8 | 状态页 | `app/status/page.tsx`（CSR） | 🟡 | 仅 API 网关+供应商健康；无 system_incidents 事件历史、无邮件订阅 |
| 21.9 | 合规页 `/privacy` `/terms` `/sla` | Footer 硬编码 `/privacy`、`/terms` 但无 page.tsx | ❌ | **线上 404 死链**，合规必备，P0 修复 |
| 21.10 | 在线 Demo `/demo` / 对比页 `/compare` / 案例页 `/cases` / 免费 Key 引导条 | — | ❌ | 均无页面/组件 |
| 21.11 | 定价/模型页搜索与分类筛选 | — | ❌ | category 映射层硬编码"对话"，嵌入/图像/音频分类无效；无搜索框 |

## 21.2 关键架构

- Portal 仅 7 页：`/`、`/about`、`/blog`、`/blog/[slug]`、`/models`、`/pricing`、`/status`；登录/注册/帮助/公告全部经 `next.config.mjs` redirect 收敛到 `/app/*`（web-console 产物）。
- 品牌配置走 `GET /api/v1/public/site-config`（12 个 site_* key 白名单），文案走 i18n 词典（`/public/i18n/entries`）。
- `[?]` 帮助落地现状：首页/模型/定价/博客已有 PageHelp；**`/about`、`/status` 缺页面级 [?]**，违反产品设计原则红线，须补。

## 21.3 未实现项（按优先级）

| 优先级 | 事项 |
|---|---|
| P0 | `/privacy`、`/terms` 页面（修 Footer 死链）；`/about`、`/status` 补 [?] |
| P0 | `/docs` 开发者文档页（端点清单/认证方式/快速开始/错误码） |
| P1 | sitemap.xml、robots.txt、JSON-LD；动态接口 5min 缓存 |
| P1 | 公开公告渲染（/status 消费 announcements 或独立页）；Blog 后台编辑器 |
| P1 | `/contact` 联系表单 |
| P2 | 价格计算器对比/分享；Blog RSS/分类；状态页事件时间线；定价/模型搜索与真分类 |
