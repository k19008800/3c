# 浩寅云 设计规范与品质审查指南（2026-10）

> 本文档是全站（web-portal + web-console + shared-ui）设计的**唯一冻结模式**。所有页面整改
> 必须按本文档的令牌、审查清单与证据规范执行；任何片区不得自行发明新风格。
>
> 品质基准：Awwwards / Webby / FWA 获奖网站水准 —— 提炼其**比例、层级、节奏、留白哲学、
> 动效克制感**，形成浩寅云自有设计语言「精密云基础设施」，**不得照搬任何获奖站模板**。

---

## 1. 品牌定位与设计语言

- **品牌**：浩寅云（对外品牌，禁止回退为 3Cloud）。AI API 聚合平台 / IDC 算力基建，企业级客户。
- **设计语言关键词**：精密（precision）、可信（trust）、前沿（frontier）。信息密度高但呼吸感强；
  数据感（tabular 数字、等宽字体）贯穿始终；克制的一主色 + 中性色阶；细线（hairline）与轻阴影
  而非厚重卡片投影。
- **配色禁令**：**不得使用重型靛蓝/紫色系**（如 #4f6ef7、#7c3aed 紫渐变必须移除）。
  品牌主色为信号蓝（见令牌），仅允许蓝色系 + 中性色 + 语义色。
- **原创性**：portal 营销站走「编辑排版式」气质（大字号展示字体、充足留白、精确栅格、定制
  图形语言——如机柜/网格/星座线描 SVG 母题）；console 走「精密数据工坊」气质（克制的卡片、
  统一表头/筛选/分页节奏、状态徽章、等宽数字）。禁止 emoji 作为图标（portal 必须替换为内联 SVG）。

## 2. 设计令牌（唯一事实来源）

两份实现必须与下表**数值一致**：`packages/shared-ui/src/tokens.css`（console 侧，主实现）
与 `web-portal/src/app/globals.css` 中的 `:root` 令牌块（portal 侧，标注"与 shared-ui tokens.css 同步"）。

> 兼容性铁律：shared-ui tokens.css 中**已有的变量名不得删除、不得改名**（页面与组件大量引用），
> 只改其数值并新增令牌。portal 侧令牌新增时，portal 页面以 `var(--xx)` 引用。

### 2.1 色板

| 令牌 | 值 | 用途 |
|---|---|---|
| --color-bg | #F2F4F8 | console 页面底色（浅灰蓝） |
| --color-panel | #FFFFFF | 面板/卡片 |
| --color-primary | #1896FF | **品牌主色（信号蓝）** |
| --color-primary-hover | #0E84E6 | 主色 hover |
| --color-primary-active | #0B6FD6 | 主色 pressed |
| --color-primary-light | rgba(24,150,255,0.10) | 主色浅底（选中行/标签底） |
| --color-primary-lighter | rgba(24,150,255,0.06) | 主色更浅底（hover 行） |
| --color-primary-border | rgba(24,150,255,0.35) | 主色描边 |
| --color-ink-900 | #0B1220 | 最深墨蓝（portal 暗区 / console 侧栏） |
| --color-ink-800 | #111B2E | 暗面 elevation-1 |
| --color-ink-700 | #1A2740 | 暗面 elevation-2 |
| --color-text | #16233A | 主文字（浅底） |
| --color-text-secondary | #5C6B82 | 次级文字 |
| --color-text-muted | #8B99AC | 弱化文字/占位 |
| --color-text-disabled | #B4BFCE | 禁用 |
| --color-text-inverse | #F4F7FB | 暗底主文字 |
| --color-text-inverse-secondary | #9AA8BB | 暗底次级文字 |
| --color-text-inverse-muted | #6B7A90 | 暗底弱化文字 |
| --color-border | #D9E0EA | 常规描边 |
| --color-divider | #EDF0F5 | 分隔线 |
| --color-divider-light | #F4F6F9 | 更浅分隔 |
| --color-border-inverse | rgba(255,255,255,0.10) | 暗底描边 |
| --color-divider-inverse | rgba(255,255,255,0.07) | 暗底分隔 |
| --color-sidebar-bg | #0B1220 | 侧栏底（同 ink-900） |
| --color-sidebar-text | #8B99AC | 侧栏默认文字 |
| --color-sidebar-hover | #C9D4E2 | 侧栏 hover 文字 |
| --color-sidebar-active | #FFFFFF | 侧栏激活文字 |
| --color-sidebar-active-border | #1896FF | 侧栏激活指示条 |
| --color-sidebar-logo | #E8EEF7 | 侧栏 logo 文字 |
| --color-sidebar-divider | rgba(255,255,255,0.06) | 侧栏分隔 |
| --color-sidebar-hover-bg | rgba(255,255,255,0.04) | 侧栏 hover 底 |
| --color-sidebar-active-bg | rgba(24,150,255,0.12) | 侧栏激活底 |
| --color-success-bg | #E8F8F1 | 成功浅底 |
| --color-success-text | #0B7A4B | 成功文字 |
| --color-success-border | #A7E8CE | 成功描边 |
| --color-warning-bg | #FEF4E2 | 警告浅底 |
| --color-warning-text | #B45D09 | 警告文字 |
| --color-warning-border | #FBDCB0 | 警告描边 |
| --color-danger-bg | #FEEFEE | 危险浅底 |
| --color-danger-text | #B42318 | 危险文字 |
| --color-danger-border | #FACDC9 | 危险描边 |
| --color-info-bg | rgba(24,150,255,0.08) | 信息浅底 |
| --color-info-text | #0B6FD6 | 信息文字 |
| --color-info-border | rgba(24,150,255,0.30) | 信息描边 |
| --color-disabled-bg | #F0F2F6 | 禁用底 |
| --color-bell-badge | #EF4444 | 通知红点 |
| --color-table-header-bg | #F7F9FC | 表头底 |
| --color-row-hover | #F3F8FF | 行 hover |
| --color-row-selected | rgba(24,150,255,0.08) | 行选中 |
| --color-modal-overlay | rgba(11,18,32,0.45) | 弹窗遮罩 |
| --color-code-bg | #0B1220 | 代码块底（portal 暗区） |

### 2.2 文字与字体

- --font-family: -apple-system, BlinkMacSystemFont, "SF Pro SC", "Segoe UI", "PingFang SC",
  "HarmonyOS Sans SC", "Microsoft YaHei", "Noto Sans SC", sans-serif
- --font-family-mono: "SF Mono", "JetBrains Mono", "Cascadia Code", "Roboto Mono", Consolas, monospace
- 数字一律 `font-variant-numeric: tabular-nums`（价格、Token 数、表格数据）。
- **中文排版**：标题字距 0 ~ -0.01em（不得负得过多），行高 ≥1.4；正文行高 1.7；
  Latin 展示字可以 -0.02em ~ -0.03em。

Portal 字号阶（--font-size-display 60 / h1 44 / h2 34 / h3 24 / h4 18 / body-lg 17 / body 16 /
small 14 / caption 12 / overline 11 + letter-spacing .08em uppercase）。
Console 保持现有 11~28 阶 + 新增 --font-size-page-title 22 / --font-size-section 16 / --font-size-table 13。

### 2.3 间距 / 圆角 / 阴影 / 描边

- 间距（保留旧名并扩展）：--space-xs 4 / sm 8 / md 12 / lg 16 / xl 20 / 2xl 24 / 3xl 32 / 4xl 40 /
  5xl 48 / 6xl 64 / 7xl 80 / 8xl 96 / 9xl 120 / 10xl 160
- portal 区块节奏：桌面段距 96~128px，平板 64px，移动 48px；内容最大宽 1120~1200px，
  栅格 12 列、gutter 24（移动 16）。
- 圆角：--radius-xs 4 / sm 6 / md 8 / lg 12 / xl 16 / 2xl 20 / pill 999。
  portal 卡片 16、按钮 10~12、输入 10；console 卡片 12、按钮 8、输入 8。
- 阴影（升级旧值）：--shadow-panel 0 1px 2px rgba(11,18,32,0.06)；
  --shadow-card 0 2px 8px -2px rgba(11,18,32,0.08)；
  --shadow-modal 0 24px 64px -16px rgba(11,18,32,0.28)；
  --shadow-toast 0 12px 32px -8px rgba(11,18,32,0.18)；
  --shadow-tooltip 0 4px 16px -4px rgba(11,18,32,0.16)；
  新增 --shadow-hover 0 12px 32px -8px rgba(11,18,32,0.14)（卡片 hover，配合 translateY(-2px)）。

### 2.4 动效（新增令牌）

- --duration-fast 150ms / --duration 200ms / --duration-slow 300ms / --duration-xslow 600ms
- --ease-out: cubic-bezier(0.22, 1, 0.36, 1)（出场/进入，主曲线）
- --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1)
- 微交互 150~200ms；区块入场（portal）600ms + 100ms 错峰；数字滚动 600ms。
- **必须尊重 prefers-reduced-motion**：动画降级为仅 opacity（或直接无动画）。
- portal 现有 .anim-fade-in-up 系列保留并统一到 --ease-out / --duration-xslow。

### 2.5 焦点与可访问性

- 所有可交互元素必须有 `:focus-visible` 环：`outline: 2px solid var(--color-primary); outline-offset: 2px`。
- 触控目标 ≥ 40px（console 紧凑场景 ≥ 36px）；正文对比度 ≥ 4.5:1。
- 保留产品铁律：`[?]` 帮助入口（P1）、加载/空/错状态可见（P4）、二次确认（P3）——**不得因视觉整改移除**。

---

## 3. 八维审查清单（每页逐一过检）

> 审查**必须基于真实浏览器渲染**（桌面 1440×900 与移动 390×844 双视口截图），不得只看代码。
> 每页按以下维度找问题，直接改代码落地，修复后重新截图对比，直到该页"无明显可提升之处"。

1. **排版 Typography**：字号阶是否清晰（无随意 14/15/16 混用）；行高/字距是否得体；中文是否
   挤压或溢出；数字是否 tabular；标题层级是否一致；正文行长（45~90 字符）。
2. **留白 Whitespace**：区块呼吸是否均匀；卡片内边距是否统一；是否出现贴边/拥挤/空洞；
   列表行高是否舒适；portal 段距是否达到 96px 级。
3. **视觉层次 Hierarchy**：每屏是否有明确主焦点；标题/正文/辅助信息三级是否可辨；
   z 轴（阴影/深浅）是否正确表达层级；操作按钮是否比次要链接醒目且不喧宾夺主。
4. **色彩 Color**：是否只用令牌色；是否出现彩虹/杂乱强调色；主色用量是否克制（portal 主色
   用于焦点元素而非大面积铺底）；语义色是否用对场景；暗区是否统一墨蓝而非纯黑。
5. **动效 Motion**：是否存在突兀/抖动/双动画；时长是否落在 150~600ms 区间；缓动是否统一；
   入场动画是否影响阅读（应克制）；prefers-reduced-motion 是否处理。
6. **微交互 Micro-interactions**：所有可点元素是否有 hover/pressed/focus 三态；卡片 hover 是否
   有轻微抬升；导航激活态是否清晰；表单控件聚焦态是否明显；按钮是否随内容两端对齐；
   toaster/空态/骨架屏是否到位。
7. **响应式 Responsive**：390px 下无横向滚动；栅格正确塌缩；导航收敛为抽屉/汉堡（portal 必须）；
   表格横向滚动或卡片化处理；触控目标达标；断点无跳变。
8. **原创性 Originality**：是否仍残留模板痕迹（emoji 图标、紫渐变、antd 即视感、千篇一律的
   圆角卡片+投影）；品牌母题是否出现；是否有区别于竞品的记忆点（机柜/网格线描、等宽数字、
   编辑排版式 Hero 等）。

---

## 4. 证据与交付规范（每页必须留痕）

- 每片产出 `SHARD-<片名>.md` 报告：逐页表格（页面 / 视口 / 维度得分前后 1~5 分 / 主要问题 /
  修复要点 / 涉及文件），末尾附"未解决项"清单。
- 截图规范：每页 **before/after 各一张桌面（1440×900）+ 一张移动（390×844）**；命名
  `<页面路由名>-<desktop|mobile>-<before|after>.png`，存到片区证据目录
  `before/` 与 `after/` 子目录。
- 截图用浏览器技能（见技能路径），视口用 `bu` 页面控制设定；无法用 ref 控制的纯展示页用
  截图 API 即可。
- 修复前后对比 = 截图对比 + 关键代码 diff 摘要（报告内列出）。

## 5. 工程护栏（所有片区强制）

- 禁止改动：shared-ui 中**已有令牌名**、现有测试文件、api 代码、docs 内容、e2e 断言文案。
- 片区边界：只改本片文件清单内的页面与组件；**不得**修改 layouts / App.tsx / shared-ui /
  globals.css 令牌块（这些由基础层片区负责）；如页面确需共享层改动，写入报告"需共享层配合"，
  由集成阶段统一处理。
- 每个片区收尾必须跑通：本片相关 `typecheck` + `lint` + 相关单测（console 用
  `pnpm --filter web-console test -- <受影响测试文件>`，至少全量 `vitest run` 不新增失败；
  portal 跑 `pnpm --filter web-portal typecheck` + `pnpm --filter web-portal lint`）。
- 品牌名：任何新增文案/标题一律用「浩寅云」，禁止出现 3Cloud（代码标识符/包名除外）。
- 不主动 commit；只改文件不提交。
- 本地服务器：API 3000 由协调方统一维护（勿自行起第二个 API）；portal dev 5177；
  console 各片使用独立端口 5181~5186（`pnpm --filter web-console dev --port 518X`），
  base=/app/，代理 /api→3000 已内置；截图走 `http://127.0.0.1:<port>/app/<路由>`。

## 6. 参考实现

- **portal 首页**（wave1 基础层产出）与 **console 布局/侧栏**（wave1 基础层产出）是全站
  品质锚点；各片区开工前先读这两个产出文件与本文档，风格以锚点为准。
- 种子账号（api/src/db/seed.ts）：admin@3cloud.dev / Admin@2024!（super_admin）；
  演示用户密码 Demo@1234（具体邮箱读 seed 确认）。console 页面需登录后截图。

---

## 7. 集成阶段变更记录（2026-10-01 · 全部片区交付后统一追加）

### 7.1 新增设计令牌（只增不改，与 §2.1 冻结表兼容）
- `--cat-1..6` 克制分类色板（`packages/shared-ui/src/tokens.css` 与
  `web-portal/src/app/globals.css` 同步块已同时追加）：
  `--cat-1 #1896FF（信号蓝）`、`--cat-2 #0B7A4B（成功绿）`、`--cat-3 #B45D09（警告橙）`、
  `--cat-4 #8B99AC（中性灰）`、`--cat-5 #0F766E（青）`、`--cat-6 #4B5563（石板灰）`。
  图表分类色一律用 `var(--cat-N)`，禁止紫/粉/亮黄等糖果色。
- `PIcon`（web-console 页面级 24×24 描边 SVG 图标组件，几何对齐 ConsoleLayout 的 ICON_PATHS）
  为页面图标统一实现；装饰性 emoji 已全量替换（约 99 文件 / 330 处）。

### 7.2 工程修复（根因级）
- **console dev 白屏根治**：`web-console/vite.config.ts` 新增
  `define: { "process.env.API_BASE_URL": "''" }`，i18n.ts 顶层 `process.env` 引用不再抛错；
  验证冷启动（不注入 window.process）登录页与 Dashboard 正常渲染。此前的 CDP 注入 workaround
  不再需要，但仍建议保留对 `i18n.ts` 引用的可见性注释。
- **博客种子品牌修复**：api seed 的 site_contents 对博客行改为幂等刷新 title/content
  （legal/page/faq 仍保留运营编辑），重跑 `db:seed` 后 /blog 标题为「欢迎使用 浩寅云」
  「5 分钟快速接入 浩寅云 API」；全仓用户可见 "3Cloud" 文案已清扫（包名/协议头/邮箱/URL 除外）。

### 7.3 最终护栏状态（集成验证，2026-10-01）
- `pnpm --filter web-portal typecheck` ✅ · `lint` ✅ · `build` ✅（8 路由全部编译）
- `pnpm --filter web-console typecheck` ✅ · `lint` ✅ · `vitest run` 11 文件 / 68 测试 ✅ · `build` ✅
- `pnpm --filter api typecheck` ✅（api 改动仅种子文案与回退文案，无测试断言受影响）
- 全量证据与报告索引见 `3cloud-design-audit/SUMMARY-2026-10.md`。