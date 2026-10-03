# §6 Portal 门户 — 浩寅云

> 代码基线：91f62d3 + Step4 | 重写日期：2026-10-03
> 技术栈：Next.js 15 App Router（SSR / Server Components），非旧 SPEC 设想的 vike。

## 页面清单（实际路由）

| URL | 文件 | 功能 | SSR | [?]帮助 |
|---|---|---|---|---|
| `/` | `app/page.tsx` | 首页（Hero+Stats+特性+模型网格+步骤+代码示例+价格表+FAQ+CTA） | force-dynamic | ✅ |
| `/about` | `app/about/page.tsx` | 关于我们（公司介绍+里程碑+技术栈+联系方式） | async | 🟡 |
| `/blog` | `app/blog/page.tsx` | 博客列表 | force-dynamic | ✅ |
| `/blog/[slug]` | `app/blog/[slug]/page.tsx` | 博客详情 | ✅ | ✅ |
| `/models` | `app/models/page.tsx` | 模型目录（卡片网格+健康度徽标） | async | ✅ |
| `/pricing` | `app/pricing/page.tsx` | 定价表 + 价格计算器 + FAQ | async | ✅ |
| `/status` | `app/status/page.tsx` | 系统状态（API 网关+供应商健康） | use client | 🟡 |
| **`/docs`** | `app/docs/page.tsx` | **开发者文档（Step4 新增）** | ✅ | ✅ |
| **`/privacy`** | `app/privacy/page.tsx` | **隐私政策（Step4 新增，修 Footer 死链）** | ✅ | ✅ |
| **`/terms`** | `app/terms/page.tsx` | **服务条款（Step4 新增，修 Footer 死链）** | ✅ | ✅ |
| **`/vendor/login`、`/vendor/dashboard`、`/vendor/settlements`** | `app/vendor/*` | **供应商自助门户（Step4 新增，migration 0046）** | — | 见说明 |

> 导航栏：首页 / 模型目录 / 定价 / 博客 / 关于 / 状态（+ /docs）。登录/注册/帮助/公告经 next.config redirect 收敛到 `/app/*`（web-console 产物）。

## 功能清单

### 6.1 公开数据出口（免鉴权 API）

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 6.1.1 | 站点品牌配置 | `public.ts` GET `/public/site-config` | ✅已实现 | 12 个 site_* 白名单 |
| 6.1.2 | API 接入配置（OpenAI/Anthropic 双地址） | `public.ts` GET `/public/api-config` | ✅已实现 | buildApiConfig |
| 6.1.3 | 公开模型目录 / 模型健康度 | `public.ts` GET `/public/models`、`/models/health` | ✅已实现 | active 销售定价 join；p50/p99/最低价 |
| 6.1.4 | 系统状态（基础设施+供应商+内嵌公告 top10+统计） | `public.ts` GET `/public/status` | ✅已实现 | |
| 6.1.5 | 公开定价表 / 平台统计 | `suppliers.ts` GET `/public/pricing`、`/public/stats` | ✅已实现 | |
| 6.1.6 | 博客列表/详情 | `public.ts` GET `/public/blog[/:slug]` | ✅已实现 | site_content type=blog |
| 6.1.7 | i18n 词典 | `public.ts` GET `/public/i18n/entries` | ✅已实现 | lang+scope，5min 缓存 |
| 6.1.8 | 单模型渠道/编码清单 | `public.ts` `/models/:name/channels`、`/codes` | ✅已实现 | |

### 6.2 核心页面

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 6.2.1 | 首页 Hero / CTA / 特性卡 / FAQ | `app/page.tsx` | ✅已实现 | 6 张特性卡；CTA 含「查看文档」现已有 /docs 落点 |
| 6.2.2 | 定价表（input/output/cacheRead/cacheWrite/context） | `app/pricing/page.tsx` | ✅已实现 | |
| 6.2.3 | 价格计算器 | `pricing/PriceCalculator.tsx` | ✅已实现 | 选模型+输入/输出 token→实时费用 |
| 6.2.4 | 模型卡片网格 + 健康度徽标 | `app/models/page.tsx` | ✅已实现 | |
| 6.2.5 | **开发者文档页 /docs（Step4）** | `app/docs/page.tsx` | ✅已实现 | 快速开始/认证方式/兼容协议/常用端点/错误码；base_url 读后台配置回退默认；带 PageHelp [?] |
| 6.2.6 | **隐私政策 / 服务条款（Step4）** | `app/privacy/page.tsx`、`app/terms/page.tsx` | ✅已实现 | 原 Footer 硬编码死链已补页 |
| 6.2.7 | **供应商自助门户（Step4）** | `app/vendor/{login,dashboard,settlements}/page.tsx` | ✅已实现 | migration 0046；供应商登录→看板/结算单 |

### 6.3 SEO 与增长

| 编号 | 功能点 | 代码位置 | 状态 | 说明 |
|---|---|---|---|---|
| 6.3.1 | SEO 元数据（title/description/OG/hreflang） | `generateMetadata` on /,/pricing,/blog | ✅已实现 | Next App Router SSR |
| 6.3.2 | 定价分类筛选 pill | `pricing/page.tsx` | 🟡部分实现 | pill 渲染在，但 category 后端返回 null，分类链路断 |
| 6.3.3 | 动态数据缓存 | `cache:"no-store"` | ❌未实现（规划中） | 每次请求打 DB，无 5min/CDN 缓存 |

## 关键架构说明

- **SSR + Server Components**：营销页服务端渲染，利于 SEO；`/status` 为 CSR 客户端组件。
- **内容数据源**：博客/公告/素材统一存 `site_content` 表，由后台或 DB 写入，Portal 只读。
- **品牌文案 i18n**：首页文案走 `/public/i18n/entries` 词典，非硬编码。

## 未实现 / 规划中

| 功能点 | 状态 | 说明 |
|---|---|---|
| sitemap.xml / robots.txt / JSON-LD | ❌未实现（规划中） | public/ 无 |
| 博客后台编辑器 / RSS / 分类筛选 / 定时发布 | ❌未实现（规划中） | site_content 无 admin CRUD；文章靠 DB 直插 |
| 公开帮助中心 /help（Portal 侧） | ❌未实现（规划中） | 当前 /help 308 跳控制台 |
| 联系表单 /contact | ❌未实现（规划中） | /about 仅静态展示邮箱电话 |
| 在线 Demo / 平台对比 / 客户案例 / SLA 页 | ❌未实现（规划中） | 无 /demo /compare /cases /sla |
| 状态页事件历史时间线 / 渲染公告 / 邮件订阅 | ❌未实现（规划中） | 后端 /public/status 已返回 announcements，前端未消费 |
| 价格计算器对比模式 / 分享链接 | ❌未实现（规划中） | 仅单模型 |
| 定价/模型搜索框、模型详情抽屉 | ❌未实现（规划中） | |
| `/about`、`/status` 页面级 [?] 帮助 | ❌未实现（规划中） | 违反产品设计原则红线，待补 PageHelp |
