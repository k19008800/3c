# i18n 改造方案 — 评审合成工作底稿

> 本文件用于在 product-agent / arch-agent 评审返回后合成最终结论。
> 记录 dispatch 期间的旁证发现，避免遗漏。

## 旁证发现（评审 agent 返回前收集）

### 《国际化 i18n PRD》v1（kb/3cloud/admin-i18n.md）与现状存在明显不一致
- PRD 目标语言为 **8 种**：zh-CN / en / ja / ko / vi / th / id / fil
  （非方案当前假设的 4 种；用户确认的也是 4 种）
- PRD 技术选型：**react-i18next + i18next-browser-languagedetector**（方案主张"不引入,复用轻量层"与此冲突，需 arch 评审裁决）
- PRD 数据表为 **translation_keys / translation_values 双表** + users.preferred_language，
  而实际上线落地的是 **i18n_entries 单表行式**（key×lang×value×scope×status）+ 无用户语言字段
- PRD 优先级检测：URL > localStorage > navigator.language > zh-CN（方案一致）；但 PRD 还要求切换写后端 PUT /user/language
- PRD 语言切换：顶部导航右侧，无刷新切换（react-i18next 重渲染）；方案为整页刷新（Cookie 方案）

### 需要的定夺
1. 语言集合到底是 4 还是 8 还是按 PRD？→ 已向用户确认 4 种（zh-CN/en/ja-JP/ko-KR），
   但需在方案中显式记录"偏离 PRD v1 的 8 语言，作降载决策"，避免二次返工。
2. 框架：react-i18next vs 轻量层 → 交给 arch-agent 技术裁决。
3. 表结构：已有 i18n_entries 单表已上线，不建议回退到 PRD 双表 → arch 确认。

## product-agent 结论摘要（已返回）
总体：方案方向正确，"个人+企业优先于管理后台"成立。但须补 3 大类产品决策缺口：

### 必须补齐项（[必须]）
1. **语言切换器用户旅程**：入口位置（门户顶栏+页脚、个人/企业顶栏、管理后台是否放）；**登录前后语言一致性**（登录后继承）；**会话内切换保持当前路由/表单不丢**；**企业子账号语言按账号维度独立**（非按企业共享）。
2. **动态内容与格式化本地化边界**：表单校验错误(client+server)全覆盖；金额/日期/货币**仅显示层格式化、本币结算口径不变、不做汇率换算**；时区与语言解耦；帮助文档/条款等**长文需"文档级多语言"策略**（非 key-value）；工单/UGC 不强制翻译（原文+可选提示）；邮件"对外交易/告警必翻、运维告警不翻"。
3. **权限与归属**：谁可管理哪种语言（默认 admin 全量管）；缺 key 由运营兜底 + 覆盖率横幅 + 可导出清单；`status` 映射"草稿/已发布/已废弃"。

### 验收细化
- 按 scope 分层覆盖门槛：portal/console 关键页 **100%**、全 scope **≥90%**；admin 核心操作路径 100%、低频 ≥70% 放行。
- **任一 scope 的 ja/ko 覆盖率不得为 0**（防"假支持"满屏中文回退被误判）。
- 定义"关键缺失（阻断验收）/ 一般缺失（放行+待补清单）"。

### 管理后台一期边界（补丁）
- 首期**不含**管理后台完整 4 语，放二期；但"核心审批/审核处置路径"首期**保底英文**（海外渠道处置人可能不懂中文）。

### 待定项拍板
1. 语言集合=4 种：**确认**；2. 管理后台：**首期不含、放二期，核心处置路径保底英文**；3. 门槛：**分层，>=90% 且关键页 100%、ja/ko 不得为 0**；4. 语言落库：**确认 users.language，并按账号维度独立**。

### 追加待澄清（非原方案 4 项之外）
- A. 登录前后语言一致 + 切换保持路由/不丢会话。
- B. 法务/合同文书"主版本为准 + 翻译版免责声明"。

### 文档缺失告警
- 参考文件 `kb/3cloud/admin-i18n.md` **实际上不存在**（product-agent 全盘搜索未命中）。需确认——可能是我(调度)给 agent 的错误路径，实际文件在别处或改名。

### 其他产品级风险（补充）
- 法律/合同文书语言效力、金额本地化被误判为汇率换算、MT 翻译质量抽检、`AdminI18nPage` 自身 UI 保持中文、"企业名/模型名等 UGC 不翻译"、多语言不等于国际合规(明确本期纯 UI 多语言)。

## arch-agent 结论摘要（已返回）
总体：方案核心主张与现有代码自洽，但 4 处需修正、3 处遗漏。关键：

### 需修正（[必须]）
1. **normalizeLang 放开 ja/ko 的 3 处连带**：`PORTAL_LANGS` 扩为 4（否则 TS 类型编译错）；`siteAlternates()` 的 hreflang `languages` 动态生成；**seed 无 ja/ko → 门户放开后整页退英文**，故 P3 必须先补词典/seed 再放开（Gate）。
2. **Console 需自建各 scope 的英文源语字典**（`EN_DEFAULTS` 仅在 portal i18n.ts，且仅 portal key）。建议源语由后端统一维护（en scope 录入=源语完备）。
3. **后端 lang 无白名单 = 数据面脏语言风险**（R2/高）：管理端可写任意 lang（`zh-CN`/`zh_cn`/`en`/`en_us` 并存）→ 同一语言分裂成多条唯一键 → 覆盖率失真。**必须后端集中 `normalizeI18nLang` 白名单**（public/admin/me 三处共用）。
4. **users.language 迁移低成本**：单列 `varchar(10) not null default 'zh-CN'`，≤1 条幂等 migration；不推荐 preferences jsonb（过度设计）。

### 遗漏（[必须]）
- **A. Console 是"个人+企业+管理"三合一 SPA**，登录/注册页(不在 ConsoleLayout)本身也要 i18n，且登录前无 users.language → 需在**App 壳层**提供语言 Provider，不能只挂 ConsoleLayout。
- **B. 前端语言持久化优先级有竞态/抖动**：登录前仅 localStorage；登录拉 /me/settings 是异步 → 首次会"闪现默认→切用户语言"。建议：localStorage 同步渲染（含 ?lang）→ 登录后服务端 language 异步覆盖。优先级修正为 ?lang > localStorage(同步) > 登录后 /me/settings > navigator > zh-CN。
- **C. 动态消息/邮件/通知 key 化无现成设施**（现为硬编码中文、无 message key、无 `t()` 服务端函数），方案 P5 工作量 2-3d 被低估，是大改。

### 契约设计建议
- `/public/i18n/entries` 增 scope 多值参数（缺省 portal，向后兼容）；**动/静态 scope 分开**（error/email/notification 默认不含，防 payload 膨胀）；不推荐 no-store，建议 HTTP 缓存 max-age=300 + 模块级缓存 + 可选 Redis。
- `/me/settings`：GET/PUT `{language}`，值域过白名单，非法 400。
- 语言白名单**后端集中校验**（数据面根因在管理端写与 import）。
- 格式化：157+ 处 `toLocaleString` 硬编码是独立大工程，方案漏项；建 `fmt.ts`（fmtNumber/fmtMoney/fmtDate/curLocale），模块级批量替换、不改业务文案。
- 后端 `t({key,params,lang})` 服务（lib/errors.ts + email/通知），参数占位建议单花括号 `{name}`，与前端模板引擎一致；一条 key 前后端同源。

### 实施 Gate 把关
- **Gate-1（任何 phase 前）**：后端集中白名单 normalizeI18nLang + scope 参数扩展。（杜绝脏语言污染）
- **P1 拆 Gate-0**：补 fmt.ts 骨架 + App 壳层语言 Provider + /me/settings 契约。
- P2 与 P3 可并行（分属 console/portal）；P3 的 Gate=seed 补 ja/ko 达成后再放开 normalizeLang。
- P4 复用 P2 产物、可部分并行但排后。
- P5 需重估：拆 P5a（后端 t()+auth/email 关键链路）与 P5b（全量错误/通知）。

### 待确认项（技术角度）
- 管理后台：放二期（量最大、中文母语运维；可仅把 admin 高频页并入试探）。
- 覆盖率：≥90% 且关键路径 100%，缺 key 回退英文；**门槛纳入数据面白名单**（key∈console/common scope 且 lang∈4 才计覆盖，防脏 lang 撑高）。
- 语言落库：**确认 users.language**（跨设备一致 + 后端发邮件/通知必需；不落库 P5 邮件发不定向语言）。

## 两 agent 合并：一致点 / 分歧点 / 对方案的修改项

### 两 agent 高度一致（= 已交叉验证，直接采纳）
1. **语言集合 = 4 种（zh-CN/en/ja-JP/ko-KR）确认**；后端无需改表即可承载。
2. **用户语言落库 users.language**（跨设备一致 + 后端发邮件/通知必需），且**按账号维度独立**（企业子账号各自独立）。
3. **管理后台放二期**；但管理后台"核心审批/审核处置路径"首期保底英文（产品补丁，防海外处置人卡顿）。
4. **覆盖率门槛**：≥90% 且关键页/关键路径 100%；缺 key 回退英文；**任一 scope 的 ja/ko 不得为 0**（防"假支持"）。arch 补充：**门槛只在 4 白名单 lang 内计**（防脏 lang 撑高）。
5. **后端语言白名单集中校验**是前置 Gate（数据面根因）+ `normalizeI18nLang` 归一。
6. **P3 门户补 ja/ko 必须先补字典/seed 再放开 normalizeLang**，否则整页英文事故。
7. **错误/邮件/通知动态内容 key 化是新建后端 `t()` 基础设施**，P5 工作量被低估，非 2-3d。
8. **AdminI18nPage 已发展成现状的一个事实**：arch 核实当时 account `SUPPORTED_SCOPES` 已 7 scope、LANGS 已 4 语。

### 分歧/侧重（需调度合并，无实质冲突）
| 主题 | product-agent 侧重 | arch-agent 侧重 | 合并 |
|------|-------------------|-----------------|------|
| 登录前后语言 | 继承门户语言 + 不丢会话 + 停留原路由（产品硬要求） | localStorage 同步渲染避免闪现抖动 + /me/settings 异步覆盖 | 采纳"登录后继承 + 停留当前路由 + 防抖"合体 |
| 切换器位置 | 门户顶栏+页脚双入口、四端顶栏 | App 壳层 Provider 覆盖登录前后（登录页也在壳内） | 管理/个人/企业 sso 壳层 + 各端顶栏；登录/注册页同入 i18n |
| 格式化 penemuan | 金额/日期/货币本地化 + 不做汇率换算 + 时区解耦 | fmt.ts 封装 + 157 处 toLocaleString 批量替换（独立大工程） | 产品定"仅显示层格式化、本币不变"；技术定封装与替换任务 |
| 动态内容边界 | 长文档(条款/帮助)需"文档级多语言"、工单/UGC 不强制翻译 | 后端 t() + 动/静态 scope 分开 | 产品定边界；技术定 key/scope 机制 |
| 法律文书 | 语言版本效力 + 免责声明（必须） | 未涉及 | 由 product 补（schedule 采纳为"追加待确认项 B"） |

### 对方案的落地修改项（合并后，后续修订方案时逐个落实）
1. 语言集合一章：显式记录"偏离 PRD v1 的 8 语言 → 降载为 4 种"决策，防二次返工。
2. 方案 2.1：语言标识统一、命名空间表补 scope 动/静态约定。
3. 方案 2.2 Console 接入：改为 **App 壳层语言 Provider**（覆盖登录/注册页）+ 顶栏/页脚切换器 + `3cloud_console_lang` cookie + 登录后 /me/settings 覆盖 + 防闪现抖动优先级。
4. 方案 2.2 语言分：登录后继承门户语言、按账号独立、切换停留当前路由不丢会话。
5. 方案 2.3：加 **后端集中 normalizeI18nLang 白名单** + `/public/i18n/entries` 多值 scope + `/me/settings` 契约 + fmt.ts 骨架。
6. 方案 2.4 实施顺序：加 **Gate-0/Gate-1 前置**（后端白名单+scope、seed 补 ja/ko 后再放开 normalize）；标 P2‖P3 并行。
7. 方案 三、工作量：修正 P5 低估（拆 P5a/P5b）；补充"157 处格式化封装"独立任务。
8. 方案 四、待确认项：补 A（登录前后一致性）与 B（法律文书效力）两条。
9. 加入 product 侧风险项：法律/合同效力、防误判汇率换算、MT 质量抽检、UGC 不译、合规边界声明。

### 文档缺失告警核实（调度侧）
- product-agent 报 `kb/3cloud/admin-i18n.md` 不存在 → **实为 agent 搜索目录差异**，我已确认该文件真实存在于 `kb/3cloud/admin-i18n.md`（已读取 390 行）。非缺失，是 agent 工作目录偏差。无需纠错。

---
> 结论：两 agent 评审方向一致、无实质冲突，已产出针对方案的 9 条落地修改项。下一步可据评分修订方案文本，或据此拆解施工任务。