# ARCH 联合评审：模型缓存定价与缓存计量（产品 × 架构）

> **产出方**：arch-agent（系统架构总设计师，技术顶层裁决）
> **评审对象**：`docs/PRD-模型缓存定价与缓存计量.md` v1.0（product-agent，含 A1–A9 待评审项）+ `docs/P0-缓存定价与缓存计量-开发任务书.md`（backend-agent，含 §0 源码核实结论 12 项、C1–C8 待澄清项）
> **需求权威源**：`docs/方案-模型缓存定价与缓存计量.md`（计费决策不可偏离）
> **日期**：2026-08-19
> **Gate 结论**：⚠️ **有条件通过**（条件见 §8，阻塞项为 0，修订项为 5 类）

---

## 1. 评审范围与方法

### 1.1 输入文档

| # | 文档 | 用途 |
|---|------|------|
| 1 | `kb/3cloud/tech-stack-decision.md` | 技术选型基线（Fastify/Drizzle/PG17/Redis/Vitest） |
| 2 | `kb/3cloud/coding-standards-api-db-test.md` | API/DB/测试规范（迁移工作流、金额 `_cents`、分区表） |
| 3 | `kb/3cloud/coding-standards-control-logic.md` | 计费会话状态机、幂等、回滚基线 |
| 4 | `kb/3cloud/development-plan.md` | 部署闸门、808/808 单测基线、不可破坏原则 |
| 5 | `docs/方案-模型缓存定价与缓存计量.md` | 需求权威源（§4 数据模型 / §5 归一化 / §6 计费公式 / §12 验收） |
| 6 | `docs/PRD-模型缓存定价与缓存计量.md` | 产品规格（§5 字段定义、§6 权限、§10 变更影响、§11 A1–A9） |
| 7 | `docs/P0-缓存定价与缓存计量-开发任务书.md` | 工程方案（§0 核实结论、§3 DDL、§4 计费引擎、§5 归一化、§9 C1–C8） |
| 8 | `docs/ref-5.2-billing.md`（抽查 §3.2.1 / §8.2 / 时序图） | 计费现状口径核实 |

### 1.2 源码独立复核（13 项抽查，backend §0 结论逐项验证）

> 方法：arch-agent 独立抽查关键文件，**不盲信** backend 结论；下列抽查均与任务书 §0 结论**一致**，个别项补充了新事实。

| # | 抽查文件 | 独立结论 | 与 §0 一致 |
|---|---------|---------|:---:|
| S1 | `db/schema/supplier-models.ts` | 表 `supplier_models`；`input_price/output_price` 为 varchar(30)；**无 cost_input_price/cost_output_price 及任何缓存成本列** | ✅（核实项 2） |
| S2 | `db/schema/vendor-pricing.ts` | 表 `vendor_pricing`；`cache_discount_rate` varchar(10)；`pricing_group` 默认 'default' | ✅（核实项 3） |
| S3 | `grep pgTable('(models\|call_logs\|billing_logs)'` | 全库**无** models / call_logs / billing_logs 三表定义 | ✅（核实项 3/4/5） |
| S4 | `db/schema/consumption-records.ts` | 表 `consumption_records`；RANGE 分区（复合主键 (id, created_at)、唯一 (request_id, created_at)）；已含 `cache_hit_tokens` integer、`cache_discount` numeric(18,8) | ✅（核实项 4/6） |
| S5 | `db/migrations/0025_partition_big_tables.sql` | 手工分区 DDL（非 drizzle-kit），列清单含 cache 2 列，幂等守卫 | ✅（核实项 10） |
| S6 | `db/migrations/meta/_journal.json` | 仅登记到 idx 16（0016）；0017–0030 SQL 文件存在但未登记 | ✅（核实项 10） |
| S7 | `services/billing/usage-parser.ts` | `CacheTokenInfo` 仅 cacheHitTokens/cacheMissTokens/hasCacheInfo；Anthropic 分支只认 `cache_read_input_tokens`，**`cache_creation_input_tokens` 未提取**（注释明示"不计入命中"）；`extractUsageFromNonStream` 丢弃缓存字段 | ✅（核实项 1/7） |
| S8 | `services/billing/cache-billing.ts` | `computeCacheDiscountedCost`/`parseAndDiscount` 为纯折扣率公式；`CACHE_HIT_DISCOUNT=0.1` | ✅（核实项 1） |
| S9 | `services/billing/cache-discount.ts` | `resolveCacheDiscountRate` 模型级→全局→兜底；`getGlobalCacheDiscount` Redis 缓存 60s + 失效函数 | ✅（核实项 1） |
| S10 | `services/billing/pricing.ts` | `ModelPricing = { input, output, cacheDiscountRate }`；L2 覆盖价 = `vendor_pricing(pricing_group='default')`（`queryDefaultPricing`）；L5/L3 分支 cacheDiscountRate 恒 null；`toPricing` 已 Number() 转换 | ✅（核实项 3） |
| S11 | `routes/chat.ts` L89/L495、`routes/anthropic.ts` L446/L561 等 6 路由 | 6 路由各自内联 `type ModelPricing`；7 处 `parseAndDiscount(usage, pricing, await resolveCacheDiscountRate(pricing))` 调用（openai-compat 2 处）；注释 5 处重复 | ✅（核实项 8） |
| S12 | `routes/responses.ts` L412-414 vs 其余路由 | `stream_options.include_usage` 仅 responses.ts 注入；chat/messages/openai-compat 均未注入 | ✅（核实项 7） |
| S13 | `services/billing/settle.ts` L32-39、`consumption-log.ts` L38-67、`admin-settings.ts` L82/L241、`seed.ts` L103-112、`test/cache-billing.test.ts` L57/L244 | `SettleOptions` 仅 cacheHitTokens/cacheDiscount；`HAS_CACHE_COLUMNS` 运行时检查 + 过时注释；SETTING_DEFAULTS/allowed 无 `cache_pricing_mode`；seed 无该 key；测试含 2 个与方案 §5 冲突的 Anthropic 断言 | ✅（核实项 6/8/9/11） |

**补充事实**（超出 backend §0、评审新增）：`ref-5.2-billing.md` 精度口径确实三处不一致（L133"费用计算保留 6 位小数"、L481"Token 级别金额保留 4 位小数"、方案 §十二-6"6~8 位"）；`ref-5.2` L169 确认"流式场景沿用全价计费"为现状（PRD §10.2 C1 行为变更的现状依据属实）；`ref-5.2` L527 时序图引用 billing_logs 属**概念性引用**（表未实现），印证 C1 裁定。

### 1.3 评审维度

1. 需求一致性：PRD/任务书是否偏离方案既定计费决策（§2 逐条核对，未发现偏离）；
2. 数据模型与代码事实对齐：表名/列/迁移机制（§3 表名映射裁定）；
3. 计费正确性：公式、5 级→4 级解析、收敛、精度（§4/§5）；
4. 兼容与回退：存量行为不变、discount_rate 灰度、808 基线（§5/§6）；
5. 权限与边界：角色矩阵、P0/P1/P2/P3 边界（§2 决议 A6/A7/A8）；
6. 上线准入：迁移顺序、灰度、回滚、对账口径（§7）。

---

## 2. 合并决议清单

### 2.1 合并去重映射（A1–A9 × C1–C8）

| PRD 项 | 任务书项 | 合并关系 | 合并决议编号 |
|--------|---------|---------|-------------|
| A5 缓存字段落库归属（call_logs vs consumption_records） | **C1** billing_logs 快照列载体、**C4** call_logs 表名差异 | **合并组①「落库归属」**：三方同源，决议为一个 | **D-8** |
| A9 流式 include_usage 计费实现时序 | **C7** include_usage 注入范围 | **合并组②「流式生效」**：时序与注入范围是同一变更的两面 | **D-9** |
| A1 精度口径统一 | C5 新价格列类型 | 相关不合并：A1 是金额精度口径，C5 是价格列 DDL 类型，各自独立决议、互相引用 | D-1 / D-12 |
| A3 显式价与 L3/L4/L5 交互 | C2 models 表/L2 覆盖价缺省 | 相关不合并：A3 定义"生效 input_price"语义（影响回退计算），C2 定 L2 载体 | D-3 / D-10 |
| A4 未配置写入价透出 | C1（快照载体） | 相关不合并：A4 定义透出标识，C1 定载体 | D-4 / D-8 |
| A2 / A6 / A7 / A8 | —（无对应 C 项） | PRD 独立决议 | D-2 / D-5 / D-6 / D-7 |

### 2.2 决议总表（合并去重后 14 项独立决议）

| # | 决议项 | 决议 | 落点 |
|---|--------|------|------|
| D-1 | A1 精度口径统一 | **调整后通过**：存储 numeric(18,8) + 计算输出 toFixed(8)（与现有 cost/cache_discount 列及全链路一致）+ 展示 toFixed(2)；**删除 PRD 默认建议中"扣费 6 位"**（与代码事实不符，引入双舍入口径） | 改 PRD（§4.7）+ ref-5.2 同步修订 |
| D-2 | A2 结算 costTotal 符号语义 | **调整后通过**：本期不动结算公式结构（P0 仅加成本列）；`costCache` 抵扣符号语义（减号=缓存成本抵扣）**留 P3 结算任务书评审**，本期在结算衔接处标注 | 后续阶段（P3） |
| D-3 | A3 显式价与 L3/L4/L5 交互 | **通过**：「生效 input_price」= 请求最终生效输入单价；折扣率回退 = 生效 input_price × rate；显式缓存价（级 1/级 2）独立于折扣类优惠；L3 代理折扣只乘总费用 | 改 PRD（§4.2 语义定稿）+ 实现时落地（T3 resolveCachePricing） |
| D-4 | A4 未配置写入价透出 | **通过**：快照列 + 调用响应 usage 扩展字段带来源标识（`cache_write_price_source: 'full_price'/'explicit'`） | 改 PRD（§7.7/§5.5）+ 实现时落地（T5/T2） |
| D-5 | A6 缓存售价配置权限 | **调整后通过（技术侧）**：技术无阻塞；finance_ops 是否开放 `PUT /admin/pricing` 缓存价字段属**业务权限决策** → **待 product-agent 确认**（调度转达）；arch 建议与既有 `PUT /admin/billing/model-price` finance_ops 权限一致、**建议开放** | 待 product 确认（PRD §6.2 定稿） |
| D-6 | A7 price_change_logs 扩展形态 | **调整后通过**：本期仅预留衔接（suppliers.ts 注释），**P1 通知面落地**；形态建议"变更字段 JSON"（比独立列扩展性好，P1 评审定稿） | 后续阶段（P1） |
| D-7 | A8 缓存价展示判定规则 | **调整后通过**：判定 = 5 级解析后存在有效缓存读取单价 **且** 上游支持缓存字段；上游支持矩阵 = 常量（DeepSeek/Anthropic/OpenAI 的 chat/completions 类支持，embedding/rerank 类不支持）——**本期定义常量，P1 前端落地** | 改 PRD（§7.1 定稿）+ 实现时落地（常量定义）+ P1 展示 |
| D-8 | 合并组① 落库归属（A5+C4+C1） | **通过**：计费事实源与全部缓存审计/快照列（3 审计列 + 2 定价快照列）**并入 `consumption_records`**；billing_logs 不建表；对话留痕表镜像标记为 P2 可选非必选 | 改 PRD（§5.4/§5.5 表名与归属）+ 任务书确认（T1/T5） |
| D-9 | 合并组② 流式生效（A9+C7） | **通过**：沿用现有"预扣 → 流结束按最终 usage 结算"时序，无状态机改动；`stream_options.include_usage` 注入范围 = **chat / messages / openai-compat** 三端点（responses 已有、anthropic 天然携带）；建议渠道级开关预留 | 任务书确认（T5）+ 实现时落地 |
| D-10 | C2 models 表 / L2 覆盖价 | **通过**：P0 不落地 models 表 2 列，价格解析生效 **4 级**；L2 覆盖价语义由 `vendor_pricing(pricing_group='default')` 显式缓存价列（级 2）**天然承载**，无需额外载体；models 独立 override 列**暂缓** | 任务书确认（T1/T3）+ 后续阶段 |
| D-11 | C3 收敛策略（read+write > prompt） | **通过**：**优先保留 read**（`write = max(prompt − read, 0)`）。理由：写入是读取的前置（token 先写入缓存才可能命中读取）；read 价通常更低，保留 read 对用户有利、对平台口径保守；与现有 min(hit, input) 单字段收敛演进一致 | 任务书确认（T2/T4） |
| D-12 | C5 新价格列类型 | **通过**：**numeric(18,6)**（方案 §4.2 为准），schema/迁移/DTO 三处一致，读取统一 Number()；既有 varchar(30) 列不迁移（债务记录见 §6） | 任务书确认（T1/T3） |
| D-13 | C6 `cache_pricing_mode` 默认值 | **通过**：默认 **explicit**（存量无显式价模型自动回退折扣率链，行为不变，默认安全；discount_rate 仅作灰度/回退开关） | 任务书确认（T1） |
| D-14 | C8 既有测试断言变更许可 | **通过**：`test/cache-billing.test.ts` 2 个 Anthropic 断言更新 = **方案刻意行为变更**（creation → cacheWriteTokens、hasCacheInfo=true），**非回归**；须在任务书声明原因（已声明），不得静默改测试 | 任务书确认（T2）+ 实现时落地 |

**统计**：原始 17 项（A1–A9 + C1–C8）→ 合并去重后 **14 项独立决议**：**通过 9 项**（D-3/D-4/D-8/D-9/D-10/D-11/D-12/D-13/D-14）、**调整后通过 5 项**（D-1/D-2/D-5/D-6/D-7）、**驳回 0 项**；3 项从属条目（A5、C4、A9）并入 2 个合并组。无打回项。

### 2.3 逐条决议详情

#### D-1｜A1 精度口径统一 → 调整后通过

- **疑义**：`ref-5.2 §8.2`"金额保留 4 位小数"、`§3.1`"费用计算保留 6 位小数"、方案验收"6~8 位"，三处不一致；PRD 默认建议含"扣费与流水 6 位小数"。
- **独立核实**：代码全链路金额为 numeric(18,8) 列 + `toFixed(8)` 输出（`chat.ts` trace.cost、`consumption_records.cost/cache_discount`）；`ref-5.2` L133/L481 确实分写 6 位/4 位。
- **裁决**：存储/计算统一 **numeric(18,8) + toFixed(8)**（与现有列及 settle 链路完全一致，不引入新的 6 位舍入层）；展示 toFixed(2)（前端职责，不丢原始精度）；批量按每笔计算后汇总。**PRD §4.7 修订**：删除"扣费 6 位"，改为"扣费/流水 8 位（对齐现有 cost 列）"；同时将 `ref-5.2 §8.2` 的 4 位、§3.1 的 6 位统一修订为 8 位（文档同步清单 §10.6 已含 ref-5.2，纳入本条）。
- **落点**：改 PRD（§4.7 精度行）+ ref-5.2 同步修订 + 实现时落地（T4 精度 case 按 8 位断言）。

#### D-2｜A2 结算 costTotal 符号语义 → 调整后通过（P3 落地）

- **裁决**：P0 只加 `supplier_models` 缓存成本列，**不实现结算公式**（P3 范围，任务书已排除）。"costTotal = costInput + costOutput − costCache"的抵扣符号语义属**业务口径**：costCache 为缓存命中带来的成本抵扣（命中部分成本低于全价），减号语义在逻辑上自洽，但**留 P3 结算任务书评审**，本期在 `suppliers.ts`/结算衔接处标注即可。
- **落点**：后续阶段（P3）；本期不改任务书范围。

#### D-3｜A3 显式价与 L3/L4/L5 交互 → 通过

- **裁决**：确认 PRD §4.2 补充语义定稿——「生效 input_price」= 请求最终生效输入单价（经 L5/L4/L3/L2/L1 定价流程后的 input，含覆盖/折扣推导）；折扣率回退（级 3/级 4/级 5）= 生效 input_price × rate；**显式缓存价（级 2）独立于折扣类优惠**，不随活动/分组/代理折扣联动（L5/L3 分支的缓存价字段恒 null，与 pricing.ts 现状一致）；L3 代理折扣与用户折扣一样只乘总费用。
- **技术说明**：`resolveCachePricing`（任务书 T3）必须消费 `getPricingForModel` 返回的**最终 input**（而非 L1 原始价），实现时以 `pricing.input` 为基准即可（该值已是生效价）。
- **落点**：改 PRD（§4.2 语义已含，定稿确认）+ 实现时落地（T3）。

#### D-4｜A4 未配置写入价透出 → 通过

- **裁决**：确认 PRD 默认建议——`billing_logs` 快照（实为 consumption_records 快照列）与调用响应 usage 扩展字段携带来源标识 `cache_write_price_source: 'full_price' / 'explicit'`；日志详情页展示（P2）。P0 落库侧写入快照列即可（来源标识为引擎内部字段，可进 metadata 或快照列旁路，P2 前端再透出）。
- **落点**：改 PRD（§7.7 契约 + §5.5 已含）+ 实现时落地（T5 settle 透传 / T2 归一化）。

#### D-5｜A6 缓存售价配置权限 → 调整后通过（业务侧待 product 确认）

- **裁决**：技术无阻塞（`PUT /admin/pricing/:id` 扩展两个可空字段即可，权限判定沿用既有端点）。finance_ops 是否开放属**业务权限决策**：arch 技术建议 = 与既有 `PUT /admin/billing/model-price`（finance_ops 以上）一致，**建议开放**，避免同一业务（售价配置）两个端点权限不一致的既有问题扩大化；最终由 product-agent 定稿。
- **落点**：**待 product-agent 确认**（调度-agent 转达）；PRD §6.2 权限矩阵按确认结果定稿。

#### D-6｜A7 price_change_logs 扩展形态 → 调整后通过（P1 落地）

- **裁决**：P0 不实现缓存价变更通知（任务书已排除，`priceChanged` 判定暂不扩缓存价）；`suppliers.ts` 预留注释正确。P1 通知面落地时，形态建议**变更字段 JSON**（old/new 按字段记录，缓存读取/写入价 × 成本侧/售价侧 4 个字段 + 未来扩展不需再加列），与既有四独立列结构以 P1 评审定稿为准。
- **落点**：后续阶段（P1）；本期仅预留衔接（已含）。

#### D-7｜A8 缓存价展示判定规则 → 调整后通过（P1 落地）

- **裁决**：确认判定 = **5 级解析后存在有效缓存读取单价 且 上游支持缓存字段**。arch 提供上游支持矩阵基线：DeepSeek / Anthropic / OpenAI 的 chat / completions 类端点支持缓存 usage 字段；embedding / rerank 类不支持（上游无缓存语义）。实现建议：定义能力常量（如 `SUPPORTED_CACHE_FIELDS_VENDORS`）或复用 `supplier_models.capabilities` 标记，P0 归一化层已有 `hasCacheInfo` 运行时判定（不依赖静态矩阵），**静态矩阵供 P1 展示层使用，本期定义常量即可**。
- **落点**：改 PRD（§7.1 判定定稿）+ 实现时落地（常量定义，非强制）+ P1 前端。

#### D-8｜合并组① 落库归属（A5 + C1 + C4）→ 通过

- **裁决**（技术裁定，见 §3 表名映射裁定）：
  1. `call_logs` 不存在 → 计费事实源与全部缓存审计列落 **`consumption_records`**（唯一消费/审计表，按月 RANGE 分区）；
  2. `billing_logs` 不存在 → **不建表**，定价快照 2 列（`cache_read_input_price` / `cache_write_input_price`）**并入 `consumption_records`**，与 3 审计列（`cache_write_tokens` / `cache_hit_cost` / `cache_write_cost`）同表，一条消费记录全量审计（3 + 2 = 5 新列）；
  3. 对话留痕表镜像缓存字段：**P2 可选，本期非必选**（任务书已排除，确认）。
- **理由**：独立建 billing_logs 引入多表事务/审计割裂/分区一致性问题；同表快照满足 P3 对账"按消费记录核查"语义；分区表 ALTER 父表自动级联子表（PG 原生），无额外成本。
- **落点**：改 PRD（§5.4/§5.5 标题与归属）+ 任务书确认（T1 DDL 9 列、T5 落库）。

#### D-9｜合并组② 流式生效（A9 + C7）→ 通过

- **裁决**：
  1. **时序**（A9）：沿用现有"预扣 → 流结束按最终 usage 结算（determineStreamBilling）"机制，仅将缓存字段纳入实际费用计算；超时/中断回滚口径不变（`settle-stream.ts` fallback 分支缓存字段恒 undefined）。**无新增状态机/回滚改动**。
  2. **注入范围**（C7）：`stream_options.include_usage = true` 注入 **chat / messages / openai-compat** 三端点（stream=true 时）；responses.ts 已有；anthropic 上游天然携带 usage（message_delta），**无需注入**。
  3. **风险缓释**：注入 include_usage 会改变上游返回（流式末帧多 usage），标准 OpenAI 兼容上游应支持或忽略该参数；为防个别渠道不兼容，建议注入逻辑集中在 `buildUpstreamBody` **单点**，并预留**渠道级开关**（P0 可先硬编码注入 + 出问题快速关闭，实现成本极低）。
- **技术结论**：这是方案 §6"生效范围"的刻意扩展（PRD §10.2 C1 行为变更），用户受益方向（金额可能降低），确认。
- **落点**：任务书确认（T5 注入单点 + 开关预留）+ 实现时落地。

#### D-10｜C2 models 表 / L2 覆盖价 → 通过

- **裁决**：见 §4 价格解析优先级裁定全文。P0 生效 **4 级**；L2 覆盖价由 `vendor_pricing(pricing_group='default')` 显式缓存价列（解析级 2）承载；models 表 2 列**暂缓**（方案原文即"可选增强"）。
- **落点**：任务书确认（T1 不建 models 列、T3 4 级解析）。

#### D-11｜C3 收敛策略 → 通过

- **裁决**：read+write 合计 > prompt_tokens 时**优先保留 read**（`write = max(prompt − read, 0)`），与现有 `min(hit, input)` 单字段收敛一致演进。理由：① 写入是读取的前置（token 先写入缓存才可能被读取命中），物理序上 read 更可信；② read 价通常低于 write 全价，保留 read 对用户有利、对平台保守（不虚增收入）；③ 归一化层与计费层双保险同规则（T2/T4）。
- **落点**：任务书确认（T2/T4 收敛实现）。

#### D-12｜C5 新价格列类型 → 通过

- **裁决**：新列 **numeric(18,6)**（方案 §4.2 为准），schema / 迁移 / DTO 三处一致；读取统一 `Number()`（`toPricing` 已是）、写入 numeric 由 Drizzle 返回 string 需 `String()` 转换。**既有 input_price/output_price/cache_discount_rate varchar(30) 不迁移**（债务记录 §6-2）。
- **落点**：任务书确认（T1/T3，默认 numeric 分支锁定，不退化为 varchar）。

#### D-13｜C6 默认模式 → 通过

- **裁决**：`cache_pricing_mode` 默认 **explicit**。理由：explicit 模式下存量无显式价模型自动回退 折扣率→全局→兜底，计费结果与现状一致（无行为变更），默认即安全；discount_rate 仅作灰度/回退开关，一键回旧。
- **落点**：任务书确认（T1 seed/SETTING_DEFAULTS 默认 explicit）。

#### D-14｜C8 断言更新许可 → 通过

- **裁决**：`test/cache-billing.test.ts` 2 个 Anthropic 断言更新**获准**，属方案 §5 刻意行为变更（`cache_creation_input_tokens` → `cacheWriteTokens` 且存在即 `hasCacheInfo=true`），**非回归**：当前 `parseCacheTokens` Anthropic 分支只认 `cache_read_input_tokens`（S7 已核实），变更后"仅 creation"用例由 `hasCacheInfo=false` 变为 `true`。任务书 T2 已在声明中说明原因（合规，规范 §2.3"禁止静默改测试掩盖回归"）。**补充要求**：新增 `discount_rate` 模式下"creation 按 input 全价 → 金额与旧版一致"的对照断言（旧版 creation 也按全价计，金额一致但归属不同，需显式断言防误回归）。
- **落点**：任务书确认（T2 更新 2 断言 + 补充对照断言）。

---

## 3. 表名映射裁定（重点：文档与代码分叉）

### 3.1 映射表（方案/PRD 术语 ↔ 代码实际载体）

| 方案 doc / PRD 术语 | 代码实际载体 | 差异事实（独立核实） | 处置 |
|---------------------|-------------|---------------------|------|
| `vendor_models`（L0 成本价） | **`supplier_models`**（Drizzle `supplierModels`） | 表名不同；且现**无** `cost_input_price/cost_output_price`（L0 成本列整体未落地），仅 varchar 的 input/output_price | 表名映射 + 现状依据修正 |
| `models`（L2 覆盖价，可选增强） | **无此表**；L2 语义 = `vendor_pricing(pricing_group='default')` 记录 | `queryDefaultPricing` 即 L2 载体（S10） | 级 1 缺省，级 2 承载 L2 语义（§4） |
| `call_logs`（调用计量审计） | **`consumption_records`**（按月 RANGE 分区，复合主键） | 唯一消费/审计表；已含 cache_hit_tokens/cache_discount 2 列 | 表名映射 + 落库归属（D-8） |
| `billing_logs`（定价快照） | **不存在**（ref-5.2 DDL 未实现） | 快照 2 列并入 `consumption_records`（D-8） | 并入裁定（D-8） |
| `vendor_pricing`（L1 标准价） | `vendor_pricing` | 表名一致 | 无差异 |

### 3.2 裁定：PRD 修订方式（二选一 → 双轨）

**裁定：加"表名映射附录"+ §5 章节标题标注实际表名（双轨），不做全文改名。**

- **理由**：
  1. 方案 doc 是需求权威源，其术语（vendor_models/call_logs/billing_logs/models）必须保留以便评审/追溯；PRD 若全文改名会与方案 doc 脱节，验收映射（附录章节映射表）断裂；
  2. 但 PRD §2.1 现状依据（G1/G2/G4）与 §5 标题写的表名与代码不符，会造成实现/验收引用错误——**必须修正**；
  3. 双轨 = 最小改动且可追溯：正文保留方案术语，标题与现状依据标注实际表名，文档头加映射附录。
- **PRD 修订要求（派发 R-P1）**：
  1. 文档头或 §5 顶部新增「表名映射表」（即 §3.1 上表）；
  2. §5.1 标题改「`supplier_models`（方案术语 vendor_models，L0 缓存成本价）」；§5.4 标题改「`consumption_records`（方案术语 call_logs，调用计量审计）」；§5.5 标题改「定价快照——并入 `consumption_records`（方案术语 billing_logs 不建表）」；§5.3 标题标注「models 表不存在，P0 不落地，L2 语义 = vendor_pricing default 组（见 §4）」；
  3. §2.1 G1/G4 现状依据中的 vendor_models/call_logs 表述改为实际表名（或加注引用映射附录）；
  4. §8 验收 AC-13/AC-24 等引用 call_logs/billing_logs 的表述同步对齐。
- **任务书确认**：任务书已全程使用实际表名（supplier_models/consumption_records），§3 DDL 与代码事实一致，**无需改动**；仅要求 PRD 映射附录发布后，任务书 §0 核实结论与 PRD 交叉引用保持同步（§0 已声明"实现以本节结论为准"，正确）。

---

## 4. 价格解析优先级裁定

### 4.1 P0 范围确认（5 级 → 4 级）

| 级 | 方案 §6 来源 | P0 状态 | 裁定 |
|----|-------------|:-------:|------|
| 1 | `models.override_cache_read_input_price`（L2 覆盖） | **缺省** | models 表不存在，P0 不建（D-10）；级 2 default 组显式价**天然承载 L2 覆盖语义**（pricing.ts 中 default 组即 L2 载体） |
| 2 | `vendor_pricing.cache_read_input_price`（L1 标准价显式） | ✅ 实现 | 权威计费依据 |
| 3 | `vendor_pricing.cache_discount_rate` → input × rate | ✅ 实现 | 兼容/快捷（resolveCacheDiscountRate 既有） |
| 4 | `system_config.billing.cache_hit_discount` → input × rate | ✅ 实现 | 全局（默认 0.1） |
| 5 | `CACHE_HIT_DISCOUNT = 0.1` 兜底 | ✅ 实现 | 前 4 级不可用 |

**结论：确认 P0 按 4 级生效**；写入价 = 显式 `cache_write_input_price` → 缺失按生效 input 全价（保守口径，D-3「生效 input_price」语义）。

### 4.2 L2 覆盖价后续承载建议（本期是否加列 / vendor_pricing 覆盖行 / 暂缓）

**裁定：本期由 `vendor_pricing` default 组显式缓存价列（级 2）承载，不加列；models 表独立 override 2 列暂缓。**

- **理由**：级 2 的 `vendor_pricing(pricing_group='default').cache_read_input_price` 与方案 §4.3 models 覆盖价的业务目标（逐模型覆盖缓存价）**重合**——default 组本身就是"模型级覆盖价"的代码载体（pricing.ts L2 语义）；为其再建 models 表/列会造成**双载体并存**（default 组 + models 表），引入优先级歧义与数据不一致风险；方案原文对 models 列为"可选增强"，P0 控制风险面不引入新表。
- **语义说明**：5 级解析中的"级 2 = L1 标准价显式"与"L2 覆盖价"在代码事实下是**同一载体**（default 组），因此 P0 4 级解析不存在"L2 覆盖价丢失"问题——凡是需要逐模型配置显式缓存价的，配置在 default 组即可，级 2 直接命中。
- **后续承载路径**（如需独立于 default 组的覆盖，如按用户组/渠道差异化缓存价）：在 vendor_pricing 增 `pricing_group` 行（组价，已有机制）或后续阶段再评估 models 表——**本期不决策、不落地**。
- **落点**：任务书确认（T1/T3，4 级解析）+ PRD §4.2 级 1 行标注"本期缺省，L2 语义由级 2 default 组承载"（派发 R-P1-2 已含）。

---

## 5. 行为变更确认（四项技术结论）

### 5.1 C8：既有 2 个 Anthropic 断言更新 = 方案刻意行为变更，非回归

- **现状**：`parseCacheTokens` Anthropic 分支只认 `cache_read_input_tokens`（S7）；`cache_creation_input_tokens` 即使存在也不影响 hasCacheInfo。
- **变更后**：creation → `cacheWriteTokens`，且 creation 存在即 `hasCacheInfo=true`。
- **计费影响**：未配置写入价时 creation 部分按 input 全价（与旧版**金额一致**，仅归属/审计口径不同）；配置写入价后金额不同（写入价通常更低）。`discount_rate` 模式强制写入全价 → **与旧版金额完全一致**（任务书 T3/T4 的对照断言必须覆盖）。
- **结论**：断言更新必要且正确，**非回归**；补充对照断言要求见 D-14。

### 5.2 C7：include_usage 注入范围（chat / messages / openai-compat）

- **范围**：三端点 stream=true 注入 `stream_options.include_usage=true`；responses 已有；anthropic 无需（message_delta 天然带 usage）。
- **技术结论**：确认。风险缓释 = 注入逻辑集中 `buildUpstreamBody` 单点 + 渠道级开关预留（D-9-3）；上游未返回缓存字段时公式退化为全价（T4 保证，回归安全）。
- **注意**：注入后流式响应多一个 usage 帧，透传方（用户侧）解析兼容性由 OpenAI 兼容协议保证，无破坏。

### 5.3 C1：快照列并入 consumption_records

- **技术结论**：可行且推荐（D-8）。分区表 `ALTER TABLE consumption_records ADD COLUMN` 由 PG 原生级联全部子表，0031 一次 ALTER 完成 5 列；新列全可空无 default → PG 17 即时执行，不阻塞读写。
- **审计语义**：一条消费记录 = 计量 + 计费金额 + 定价快照全量可审计，P3 对账直接读同表，无需 join 第二张表。

### 5.4 C3：read + write 收敛优先保留 read

- **技术结论**：合理（D-11）。写入是读取前置；read 价通常更低，保留 read 对用户有利、平台口径保守；归一化层（T2）与计费层（T4）双保险同规则。

---

## 6. 技术风险与债务

### 6.1 分区表迁移约束（高关注，已有对策）

- `consumption_records` 为 RANGE 分区表（0025 手工 DDL，复合主键/唯一约束含 created_at），drizzle-kit 无法生成分区 DDL，**新列必须手工分区 DDL（0031）**；
- `_journal.json` 仅登记 0000–0016，0031 遵循 0017+ 手工模式**不登记 journal**——**风险点：测试库/CI 初始化路径**。若集成测试用 drizzle `migrate()`（journal 驱动），0031 不会自动执行 → 测试库缺列。**要求**：0031 执行器（`run-migration-0031.cjs` 或并入现有 runner 列表）必须**同时覆盖测试库初始化路径**（任务书 §8.1 迁移核对在本地库执行，需确认测试 setup 同样生效）；
- PG `ALTER TABLE` 父表加可空列即时、级联子表，无锁表风险；0025 幂等守卫（已分区跳过）不受影响。
- **落点**：任务书确认（T1）+ 实现时落地（测试库路径）。

### 6.2 价格列 varchar vs numeric 混合（债务，本期不修）

- 现状：`input_price/output_price` varchar(30)、`cache_discount_rate` varchar(10)；新列 numeric(18,6)。
- 影响：读取侧必须统一 `Number()`（`toPricing` 已是）、写入侧 numeric 返回 string 需 `String()`；schema/迁移/DTO 三处一致（D-12 已锁）。**注意**：`cache_discount_rate` 是 varchar(10) 而新缓存价为 numeric——`resolveCachePricing` 回退链跨两种类型，`Number()` 转换必须在入口统一做。
- 债务记录：既有价格列 varchar 违反规范 2.6（金额应 numeric），且 ref-5.2 L527 时序图仍写 `/1,000,000` 旧单位（代码为 /1000 ¥/1K）——**建议后续阶段统一数值化 + 文档修订**，本期不扩大范围。

### 6.3 6 路由内联 ModelPricing 重复（消重建议，不扩大 P0）

- 事实：chat / messages / openai-compat（2 调用点）/ rerank / responses / anthropic 共 6 处内联 `type ModelPricing`、7 处 `parseAndDiscount` 调用、5 处重复注释（S11）。
- **建议（已纳入任务书 T5，属消重非扩范围）**：① 内联 type 改为 `import { type ModelPricing } from '../services/billing/pricing'`；② 调用统一走 `computeUsageCost`（T4 统一入口）。**重点测试位**：rerank.ts 的 billingUsage 归一化补全（L390，parseAndDiscount 依赖 prompt_tokens）、openai-compat 双调用点（流式/非流式两分支）——漏改一个即计费口径不一致。
- 债务：P0 后 6 路由共享类型/入口，后续新增路由（ws-relay/task-relay）直接复用，重复面收敛。

### 6.4 流式 usage 三处提取点

- 位置：`proxy.ts`（流式 L140-143 / 非流式 L204-206）、`anthropic/translate.ts extractOpenAIChunk`、`responses-stream.ts lastValidUsage`；下游 `settle-stream.ts determineStreamBilling` 透传。
- 风险：三处格式不同（OpenAI chunk / Anthropic 转换后格式 / Responses 格式），扩展缓存字段必须统一经 `parseCacheTokens` 归一化（任务书 T2 已规划）；`toResponsesUsage` 现有 cached_tokens 提取保留（P2 客户透传用），**勿与归一化字段混淆**（一个透传、一个计费）。
- 落点：任务书确认（T2）+ 实现时落地（统一口径）。

### 6.5 其余风险（已受控）

| 风险 | 评估 | 对策 |
|------|------|------|
| 预扣（preConsume）估算不含缓存价 | 预扣仍按全价估算，缓存价只影响 settle 多退少补——**方向安全**（不会少扣） | 不需改动；验收 AC-15 覆盖 |
| 幂等摘要不扩缓存字段 | 幂等回放只重放响应/摘要不重复计费，缓存字段仅审计用途 | 最小改动，正确（任务书 T5-5） |
| `HAS_CACHE_COLUMNS` 过时注释 | 0005 已加列，运行时检查为 true，代码确实写入；注释声称"当前表结构没有"已失真 | T5 修正注释（任务书已含） |
| `getCachePricingMode` 缓存一致性 | Redis 60s 缓存 + 后台写入即时失效 | 与 `getGlobalCacheDiscount` 同模式（T1 已含） |
| OpenAI 兼容端点 usage 结构扩展 | 只增扩展字段，不破坏既有解析 | PRD §7.7 兼容性要求 + AC-29 回归 |

---

## 7. 上线准入技术要点

### 7.1 迁移执行顺序（0031）

```
1) 备份数据库（development-plan 闸门：生产部署前备份）
2) 执行 0031_cache_pricing_explicit.sql（9 列：supplier_models 2 + vendor_pricing 2 + consumption_records 5）
   ├─ ALTER 分区父表 5 列自动级联子表（PG 原生，即时执行）
   ├─ 校验：\d consumption_records / \d vendor_pricing / \d supplier_models 列齐全
   └─ 不登记 _journal.json（0017+ 惯例）；执行器同时覆盖测试库初始化路径（§6-1）
3) seed.ts 幂等 upsert billing.cache_pricing_mode='explicit'（+ 既有 billing.cache_hit_discount）
4) 发布代码（schema/服务/路由同步，schema 与迁移先于或同批）
5) 灰度验证 → 全量回归（pnpm test 全量，808 基线 0 破坏 + 新增全绿）
```

### 7.2 灰度（cache_pricing_mode 开关）

- 默认 **explicit**（C6/D-13：存量无显式价模型自动回退，行为不变，默认即安全）；
- 灰度窗口观测点：① 计费金额漂移（应无，存量模型回退链不变）；② 显式价配置后毛利变化（P1 配置面启用后）；③ 流式 include_usage 注入后上游异常率（D-9 风险缓释：渠道开关预留）；
- 异常回退：后台一键切 `discount_rate`（写入全价 + 读取折扣率，与旧版完全一致），无需发版。

### 7.3 回滚路径（三层独立）

| 层 | 操作 | 说明 |
|----|------|------|
| 配置层 | `cache_pricing_mode=discount_rate` | 秒级，恢复旧计费行为（旧公式函数保留） |
| 代码层 | git revert（T1–T7 提交） | 6 路由回到 parseAndDiscount 直接调用 |
| 数据层 | `DROP COLUMN` 9 新列（全可空，无损） | 无数据迁移/回填，回滚零数据风险 |

### 7.4 对账 / 审计口径

- **审计源**：`consumption_records` 快照列（`cache_read_input_price` / `cache_write_input_price`）+ 3 审计列（`cache_write_tokens` / `cache_hit_cost` / `cache_write_cost`）+ 既有（`cache_hit_tokens` / `cache_discount`）——P0 落库即具备逐笔审计能力；
- **口径**：缓存计费金额 = 显式价（或回退链）逐笔计算，8 位精度，批量按每笔汇总（D-1）；
- **P3 衔接**：结算快照按 `cost_cache_read_input_price` / `cost_cache_write_input_price` 拆分 cachedTokens/costCache；对账争议"缓存计费"核查口径 = 显式价 + 回退链（D-2 符号语义 P3 评审）；
- **参考点**：`cache_discount`（节省金额）= 全价口径 − 实际计费口径，作为"本月缓存节省"指标卡/账单口径的唯一数据源（PRD §7.5/§7.6 已对齐）。

---

## 8. Gate 结论

# ⚠️ 有条件通过（Conditional Pass）

**无阻塞项、无打回项**；以下条件全部满足后进入开发（T1 启动）。

| # | 条件 | 责任方 | 对应章节 |
|---|------|--------|---------|
| G-1 | PRD 按 §3 表名映射裁定修订（映射附录 + §5 标题/§2.1 现状依据标注实际表名） | product-agent | §3.2 |
| G-2 | PRD 精度口径按 D-1 修订（§4.7 删除"扣费 6 位"，统一 8 位 + 展示 2 位；ref-5.2 同步修订） | product-agent | D-1 |
| G-3 | A5/A9 定稿（落库 consumption_records、流式注入范围）反映到 PRD §5.4/§5.5/§10.2 | product-agent | D-8/D-9 |
| G-4 | A6 finance_ops 开放为**最终业务决策**（arch 建议开放）——调度-agent 转达 product-agent 确认 | product-agent（调度转达） | D-5 |
| G-5 | 任务书确认 C1–C8 锁定（并入 consumption_records、4 级解析、read 优先收敛、numeric(18,6)、explicit 默认、注入范围+渠道开关预留、2 断言更新+补充对照断言）、A9 时序确认、T5 消重 | backend-agent | §2.3 / §9 |
| G-6 | 实现硬约束：0031 手工分区 DDL 不登记 journal、执行器覆盖测试库初始化、不改 0000–0030、不破坏 808 基线（仅 T2 2 断言按方案更新且声明） | backend-agent（实现子代理） | §6-1 / §7-1 |
| G-7 | P3 结算/对账按 D-2 在 P3 阶段评审（本期不实现，不阻塞 P0） | 调度-agent 排期 | D-2 |

---

## 9. 修订派发单

### 9.1 给 product-agent（PRD 修订项）

| # | 修订项 | 内容 |
|---|--------|------|
| R-P1 | 表名映射（§3.2） | 文档头/§5 顶部加「表名映射表」；§5.1/§5.3/§5.4/§5.5 标题标注实际表名；§2.1 G1/G4 现状依据改实际表名；§8 AC-13/AC-24 等引用对齐 |
| R-P2 | 精度口径（D-1） | §4.7 删除"扣费 6 位"，统一「存储/计算 numeric(18,8)（对齐现有 cost 列）、展示 toFixed(2)、批量每笔汇总」；§10.6 文档同步清单纳入 ref-5.2 §8.2/§3.1 修订 |
| R-P3 | 落库归属（D-8） | §5.4 标题/说明定稿 consumption_records；§5.5 定稿"快照列并入 consumption_records，billing_logs 不建表"；对话留痕表镜像标记 P2 可选 |
| R-P4 | 流式生效（D-9） | §4.1-3/§10.2 C1 描述与注入范围对齐（chat/messages/openai-compat 三端点；anthropic 天然带） |
| R-P5 | 权限定稿（D-5） | §6.2 权限矩阵按 finance_ops 最终确认结果定稿（arch 建议开放） |
| R-P6 | 展示判定（D-7） | §7.1 判定规则定稿（解析后有效缓存单价 && 上游支持矩阵；embedding/rerank 类不支持） |
| R-P7 | 文档同步清单 | §10.6 补充：ref-5.2 L527 时序图 /1,000,000 旧单位与 billing_logs 概念引用修正（文档债务，与本期一并修订） |

### 9.2 给 backend-agent（任务书确认 / 调整项）

| # | 确认/调整项 | 内容 |
|---|-------------|------|
| R-B1 | C1–C8 全部锁定 | 并入 consumption_records（0031 5 列+2+2=9 列 + 1 config key）；4 级解析；read 优先收敛；numeric(18,6) 三处一致；explicit 默认；注入范围 chat/messages/openai-compat；2 断言按方案更新 |
| R-B2 | A9 时序确认 | 沿用预扣→流结束结算，无状态机改动；fallback 分支缓存字段 undefined |
| R-B3 | T5 消重执行 | 共享 `ModelPricing` import + `computeUsageCost` 统一入口；**rerank 归一化补全、openai-compat 双调用点列为重点测试** |
| R-B4 | include_usage 开关预留 | 注入逻辑集中 `buildUpstreamBody` 单点；预留渠道级开关（P0 可硬编码 + 快速关闭） |
| R-B5 | 测试补充 | D-14 补充：discount_rate 模式 creation 全价与旧版金额一致的对照断言；D-1 精度 case 按 8 位断言 |
| R-B6 | 测试库路径 | 0031 执行器同时覆盖测试库初始化（§6-1）；验收核对命令补 \d 分区父表列 |
| R-B7 | 注释修正 | consumption-log.ts HAS_CACHE_COLUMNS 过时注释（T5 已含）；suppliers.ts 价格变更衔接注释（T6 已含） |
| R-B8 | 范围红线确认 | 不建 billing_logs/models 表、不迁移既有 varchar 列、不实现 P1/P2/P3、不破坏 808 基线 |

### 9.3 移交调度-agent 事项

1. **待 product-agent 确认**：A6 finance_ops 是否开放缓存售价配置（arch 建议开放，业务最终决策）；
2. **P3 排期**：A2 结算 costTotal 符号语义评审（D-2），随 P3 结算任务书；
3. **P1 排期**：A7 price_change_logs 形态（变更字段 JSON 建议）、A8 上游支持矩阵前端落地。

---

## 附录：与方案 doc 的决策一致性声明

本评审**未修改**方案 §三/§五/§六 任何计费决策：显式价双轨制、三家归一化（含 Anthropic creation → cacheWriteTokens）、5 级解析（P0 按代码事实生效 4 级，级 1 缺省有据）、写入价缺失全价、`cache_pricing_mode` 开关、精度 6~8 位（按代码事实取 8 位）——均为**代码事实对齐 + 实现口径收敛**，非决策变更。所有技术裁定附理由与落点；所有业务规则疑问（A6）移交 product-agent 定稿。

> 关联文档：`PRD-模型缓存定价与缓存计量.md`、`P0-缓存定价与缓存计量-开发任务书.md`、`方案-模型缓存定价与缓存计量.md`、`kb/3cloud/development-plan.md`
