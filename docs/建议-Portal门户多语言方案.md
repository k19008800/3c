# 门户（Portal）多语言支持方案建议

> 性质：**方案建议**（聚焦门户，承接已定稿的全局 i18n 终稿）
> 上级方案：`docs/多语言i18n改造方案.md`（8 语言终稿，已评审定稿）
> 评估对象现状：`web-portal/src/lib/i18n.ts` / `i18n-server.ts` / `middleware.ts`（现仅 zh-CN / en 两语）
> 调研依据：`docs/SPEC-§23` §23.4（SYS-002/SYS-007）、`docs/SPEC-§21` §21.1（多语言 SEO / hreflang）、`docs/iteration-plan-v2.md` P2-3、`kb/3cloud/admin-i18n.md`（PRD v1：8 语）

---

## 一、结论先行（TL;DR）

门户多语言**不建议推翻现有轻量层重做**，而是在其基础上做一次**「对齐 8 语的平滑升级」**。门户是全局 i18n 里**唯一已有落地基础**的一端，改造量最小、风险最低，应作为 P3 排在统一 Gate 之后。

一句话方案：

> **沿用现有 `cookie + ?lang=` 轻量层与 `i18n_entries` 行式契约，把语言集合从 2 调为 8、补齐 7 门源语词典/seed，动态生成 hreflang，并纳入统一后端 `normalizeI18nLang` 白名单。不引入 react-i18next，不改为 `/zh` `/en` 子路径。**

| 维度 | 建议 | 理由 |
|------|------|------|
| 语言集合 | 8 种（zh-CN/en/ja-JP/ko-KR/vi/th/id/fil） | 与全局终稿一致，避免门户孤岛 |
| 技术栈 | 沿用轻量层，零新增依赖 | 现有实现已 key 化、有 EN fallback |
| URL 策略 | 保留 cookie + `?lang=`，不做 `/zh` 子路径 | 门户能自控；控制台 redirects 不受牵累 |
| 数据源 | `i18n_entries`（scope=portal，active） | 与后端/后台管理端同源 |
| 前置 Gate | 统一后端语言白名单 `normalizeI18nLang` | 杜绝脏语言分裂唯一键 |

---

## 二、现状核对（门户为什么是"升级"而非"新建"）

| 项 | 现状 | 评估 |
|----|------|------|
| 语言数 | `PORTAL_LANGS = ["zh-CN","en"]` | ❌ 缺 6 语 |
| `normalizeLang` | 仅接受 `en`，其余回落 `zh-CN` | ❌ 需放白名单放开 |
| 词典拉取 | `GET /public/i18n/entries?lang=xx`（no-store） | ✅ 契约可用，需加 scope 参数 |
| EN fallback | 内嵌 `EN_DEFAULTS`（英文源语） | ✅ 无障碍 |
| 页面覆盖 | 首页/定价/导航/页脚/博客 key 化 | ✅ 已就绪 |
| `[?]` 帮助 | `help.*` key 已入字典 | ✅ 满足产品设计原则 |
| hreflang | `siteAlternates()` 仅 2 语 | ✅ 结构在，需动态化 |

**核心判断**：门户的"骨架（key 化 + EN fallback + 切换器）已完成，欠的只是"语料与放行"。因此门户这一端不需要 react-i18next、不需要 App 壳层 Provider（那是 Console 的事），工作量远小于 Console。

---

## 三、推荐实施方案（门户 P3 细化）

### 3.1 前置 Gate（不可跳过，全局统一）

> 门户扩容前必须完成全局**后端语言白名单** `api/src/lib/i18n-langs.ts`：
> `normalizeI18nLang()` 集中到 public 读、admin 写/import、/me/settings 写三处。
> **否则 `ja_JP`/`ja-JP` 等分裂唯一键，覆盖率失真、翻译对不上。**（终稿 Gate-1）

配套：`/public/i18n/entries` 增加 `scope` 多值参数（缺省 portal，向后兼容）。门户传 `scope=portal` 即可，不拉 error/email/notification 等动态 scope，防 payload 膨胀。

### 3.2 门户 8 语扩容（仅 3 处改动）

```ts
// 1) src/lib/i18n.ts —— 语言集合与放行
export const PORTAL_LANGS = ["zh-CN","en","ja-JP","ko-KR","vi","th","id","fil"] as const;
export function normalizeLang(v) {
  // 白名单化：PORTAL_LANGS 内返回原值，否则回落 zh-CN
  return (PORTAL_LANGS as readonly string[]).includes(v) ? v : "zh-CN";
}

// 2) siteAlternates() —— hreflang 动态生成 8 语
//    languages: Object.fromEntries(PORTAL_LANGS.map(l => [l, path === "/" ? `/?lang=${l}` : `${path}?lang=${l}`]))

// 3) 词典拉取 —— 带 scope
GET /api/v1/public/i18n/entries?lang=ja-JP&scope=portal
```

**连带硬要求（Gate）**：`normalizeLang` 放开前，必须先补齐 8 语 seed/词典入库，
否则整页落到英文 fallback（体验门面）。**seed 补充 → 放行 → 平滑升级**，顺序不能反。

### 3.3 语料（最大工作量，门户真正的成本）

- 现有 114 key × zh/en（scope=portal）补 6 语 → 约 114×6 ≈ 684 条新 seed。
- 源语做法：**en 为源语（已内嵌 EN_DEFAULTS），zh/en 之外由种子入库**。
- 优先级策略：受众与国家。建议首期保证 zh-CN/en/ja-JP/ko-KR 高质量，vi/th/id/fil 走翻译后验收 `≥90%` 门槛（阈值语言按场景由项目方定，可先按业务出海目标定）。
- MT 质量底线：不做逐字完美，做到**术语一致 + 关键路径 100%**，低频 key 缺则回退英文（符合终稿决策 4 与 SYS-002/SYS-007）。

### 3.4 帮助体系 `[?]` 对等翻译

门户的页面级/按钮级 `[?]`（`help.*`）已 key 化，**随 8 语同库翻译**；缺语种时回退英文。不另起 help 词典。

---

## 四、取舍（回应历史分歧，明确立场）

### 4.1 为什么不换 react-i18next？

现有轻量层已满足门户场景（服务端首屏翻译 + EN fallback + 切换器），足够。react-i18next 的价值（客户端重渲染、插件生态）门户用不上，引入反而增加体积与学习成本。**Console（三合一 SPA 大规模）若未来需要，再评估；门户维持轻量。**

### 4.2 为什么不做 `/zh` `/en` 子路径？

终稿与门户现状均选择 `cookie + ?lang=`：
- 优点：改动小、不破坏既有 URL、不影响控制台 redirects（门户/控制台共用域或同站时尤其重要）。
- 代价：多语言 SEO（hreflang、独立 URL 收录）弱于子路径。
- **建议路径**：SEO 不是本期硬需求（SPEC-§21 明确"初期仅中文 / 子路径预留"）。做 `?lang=` hreflang 即可；若未来出海 SEO 优先，再升级为 `/zh` `/en` 前缀（终稿已明确未来只要改中间件即可，前瞻不堵死）。

### 4.3 动态内容 / 长文档

- 错误/表单提示：后端已规划 `t()` + message key（终稿 P5），门户缺 key 回退英文即可。
- 帮助中心/条款/隐私政策：属**文档级多语言**（markdown 分语言文件），不在 `i18n_entries` key-value 里塞长文——沿用文档多语言策略（终稿 §5）。
- 门户动态数据（模型名/供应商名）：UGC/专名不翻译，保持原文。

---

## 五、建议实施顺序与工作量

| 顺序 | 事项 | 前置产出 | 量级 |
|------|------|---------|------|
| 0 | 后端白名单 `normalizeI18nLang`（全局） | — | 0.5–1d |
| 1 | `/public/i18n/entries` 加 `scope` 参数 | 白名单 | 0.5–1d |
| 2 | seed 补 6 语（scope=portal） | 语料/翻译 | 1–2d（录入） |
| 3 | 门户 `PORTAL_LANGS`→8 + `normalizeLang` 放行 + hreflang 动态化 | 以上就绪 | 1d |
| 4 | 门户 QA + 覆盖率检查 + 8 语抽查 | 以上就绪 | 1d |
| **合计（门户段）** | | | **约 4–6d**（不含翻译外包时间） |

> 门户段无需 App 壳层 Provider（那是 Console 需求）、无需 fmt.ts 本地化（门户无 157 处 `toLocaleString` 问题——那是 Console 专属）。

---

## 六、验收建议（承接终稿决策 4）

- [ ] 8 语切换器生效，缺 key 回退英文不报错（SYS-002）
- [ ] 关键页（首页/定价/模型/开发者文档/导航/页脚）8 语覆盖率 100%
- [ ] 全 portal scope 覆盖率 ≥90%（8 语白名单内计）
- [ ] 关键语种 ja-JP/ko-KR 任一非 0，vi/th/id/fil 按门槛抽查
- [ ] hreflang 正确输出 8 语 alternate，SEO 不倒退
- [ ] 切换语言保持当前路由、不丢会话、无整页闪退（cursor 记忆占位）
- [ ] `[?]` 帮助在 8 语下可用（英文兜底）
- [ ] 无脏语言（无 `ja_JP`/`en_us` 等分裂键，白名单强制）

---

## 七、风险与兜底

| 风险 | 级别 | 兜底 |
|------|------|------|
| 语料不足致门面整页英文 | 高 | Gate：seed 补齐再放行 normalize |
| 多语言 SEO 弱于子路径 | 中 | 本期 hreflang 即可；未来改中间件升 `/zh` |
| ja/ko/vi/th/id/fil 翻译质量 | 中 | 关键路径 100% + 术语库 + 覆盖率面板 |
| 动态错误/邮件定向语言 | 中 | 归终稿 P5，门户缺 key 回退英文 |

---

## 八、一句话给决策者

门户多语言是**归位补齐**而非**另起炉灶**：骨架已好，只需「先补后端语言白名单 → 再补 6 语语料 → 最后放开 8 语」，约 4–6 人日；唯一真正的成本与质量点在于翻译语料录入与校验。