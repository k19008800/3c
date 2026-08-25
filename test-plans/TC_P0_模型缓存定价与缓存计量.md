# TC-P0：模型缓存定价与缓存计量 — P0 阶段验收用例集

> **文档编号**：TC-P0-3C-CACHE-001
> **版本**：v1.1（定稿）
> **日期**：2026-08-21（v1.0 评审稿）→ 2026-08-21（v1.1 定稿，按 product-agent Q1~Q3 最终裁定修订）
> **作者**：test-agent（专职测试工程师）
> **权威需求源**：`docs/PRD-模型缓存定价与缓存计量.md` v1.1（§4 业务规则、§5 字段定义、§8 验收标准 AC-01~AC-39）
> **工程口径**：`docs/P0-缓存定价与缓存计量-开发任务书.md` v2.0（§2 子任务 T1~T7、§3 迁移清单、§5 归一化、§8 验证流程）
> **决议口径**：`docs/ARCH-模型缓存定价与缓存计量-联合评审.md`（D-1~D-14 共 14 项决议，本用例集一律按最终决议编写，与任务书锁定清单一致）
> **格式参考**：`test-plans/TC_29_NewAdminPages.md`、`test-reports/deep-regression-prices.md`
> **范围**：仅 **P0**（数据模型 + 计费引擎 + usage 归一化 + 落库审计 + 管理端 CRUD API 侧）。P1/P2/P3 功能不列入本次用例集（见 §6 覆盖矩阵标注"后续阶段"项）。
> **执行边界声明**：本文件为验收用例文档，**不执行任何测试命令、不运行 pnpm test、不改任何代码文件**（backend-agent 实施中，禁止触碰仓库运行态）。执行时机仅作标注，供后续按批次执行。

### 修订记录

| 版本 | 日期 | 变更点 | 依据 |
|------|------|--------|------|
| v1.0 | 2026-08-21 | 初稿（评审稿）：88 条用例，含 3 项业务疑问待确认 | — |
| v1.1 | 2026-08-21 | **Q1 定稿**：TC-P0-107 权限口径按 PRD v1.1 §6.2（finance_ops 开放缓存售价配置；任务书该行属过期标注） | product-agent 最终裁定 Q1 |
| v1.1 | 2026-08-21 | **Q2 定稿**：TC-P0-118 仅核对存储口径契约 ¥/1K（录入/存储/API 均不得按 /1M 值入库）；÷1000 自动换算属 P3 同步引擎，不在断言范围；PRD AC-06 已改口径 | product-agent 最终裁定 Q2 |
| v1.1 | 2026-08-21 | **Q3 定稿**：TC-P0-119 允许写入价 > 输入价、不设上限校验、按实际值计费；`cache_discount` 可为负（负 = 缓存写入溢价，前端"节省"按正负语义展示）；删除"写入价≤输入价"校验断言；PRD 已补修订（§5.4/§7.3/§7.5/§8 AC-19/§9.2） | product-agent 最终裁定 Q3 |

---

## 0. 关键口径速查（用例编写基准）

### 0.1 表名映射（PRD §5 顶部 + ARCH §3.1 裁定：双轨）

| 方案/PRD 术语 | 代码实际载体 | 说明 |
|--------------|-------------|------|
| `vendor_models`（L0 成本价） | **`supplier_models`** | 新增 2 列：cost_cache_read_input_price / cost_cache_write_input_price，numeric(18,6) |
| `models`（L2 覆盖价） | **无此表**；L2 语义 = `vendor_pricing(pricing_group='default')` | P0 不落地 models 列（D-10） |
| `call_logs`（调用计量审计） | **`consumption_records`**（RANGE 分区表） | 3 审计列 + 2 快照列并入同表（D-8），billing_logs 不建表 |
| `billing_logs`（定价快照） | **不存在** | 快照 2 列并入 consumption_records（D-8） |
| `vendor_pricing`（L1 标准价） | `vendor_pricing` | 新增 2 列：cache_read_input_price / cache_write_input_price，numeric(18,6) |

### 0.2 决议速查（ARCH D-1~D-14 → 用例断言基准）

| 决议 | 内容 | 用例断言要点 |
|------|------|-------------|
| D-1 | 存储/计算 numeric(18,8) + 输出 toFixed(8) + 展示 toFixed(2) | 金额断言一律 `.toFixed(8)`；无 6/4 位舍入层 |
| D-3 | 「生效 input_price」= 请求最终生效输入单价；显式缓存价独立于折扣类优惠；L3 代理折扣只乘总费用 | 折扣率回退 = 生效 input × rate；L5/L3 分支缓存价恒 null |
| D-4 | 未配置写入价透出标识 `cache_write_price_source: 'full_price'/'explicit'`（P0 落库侧，P2 透出） | metadata / 快照列旁路携带来源标识 |
| D-5 | finance_ops 开放缓存售价配置（Q1 裁定：以 PRD v1.1 §6.2 为准，任务书该行属过期标注） | 权限用例按 PRD §6.2 执行：finance_ops 开放、admin/super_admin 不变（见 §4-1） |
| D-7 | 展示判定 = 解析后有效缓存单价 && 上游支持矩阵常量（本期定义常量，P1 前端落地） | P0 归一化层以 `hasCacheInfo` 运行时判定为准 |
| D-8 | 全部缓存审计/快照列并入 consumption_records（5 新列）；billing_logs 不建表 | 0031 DDL 9 列 + 1 config key；落库 5 新列 |
| D-9 | 流式沿用「预扣 → 流结束按最终 usage 结算」；include_usage 注入 chat/messages/openai-compat；渠道级开关预留 | 计费时点 = 末帧 usage；fallback 分支缓存字段恒 undefined |
| D-10 | P0 价格解析生效 4 级（级 1 models 缺省）；级 2 default 组承载 L2 覆盖语义 | 显式价 > 折扣率 > 全局 > 兜底 |
| D-11 | read+write > prompt → 优先保留 read，`write = max(prompt − read, 0)`；归一化/计费双保险 | 收敛断言两端各一 |
| D-12 | 新价格列 numeric(18,6)，schema/迁移/DTO 三处一致；既有 varchar 列不迁移 | 读取 Number()、写入 String() 统一入口 |
| D-13 | `cache_pricing_mode` 默认 **explicit** | GET 默认 explicit；非法值回退 explicit |
| D-14 | 既有 2 个 Anthropic 断言更新获准（creation→cacheWriteTokens、存在即 hasCacheInfo=true）= 刻意行为变更非回归；须补 discount_rate 对照断言 | 归一化/对照断言按新口径 |

### 0.3 验证方式取值

| 取值 | 含义 |
|------|------|
| 单测 | vitest 函数级/模块级测试（mock DB 或纯函数），对应各子任务 Gate grep |
| 接口测试 | 路由级测试（复用既有 6 路由测试夹具与 mock 模式）或真实链路调用 |
| 手工核算 | 按 PRD §4.1 公式手算对照，断言精确金额 |
| 数据抽样 | psql / DB 查询核对（\d 表结构、SELECT 落库值、分区表行为） |
| 静态核查 | grep 结构验证 / 代码审查（消重、单点引用、注释闭环）——归入单测类执行 |

### 0.4 执行时机取值

| 取值 | 含义 |
|------|------|
| 单测阶段（T1~T6 各自 grep） | 在对应子任务 Gate 内执行（`pnpm test -- --grep "<关键词>"`） |
| 集成验收阶段（T7 后） | T7 全量回归 + §8.1 迁移核对（psql）+ 端到端/数据抽样验收时执行 |

---

## 1. 用例总览表

> 映射列：AC-xx = PRD §8 验收标准编号；T x = 任务书 §2 子任务编号；R-Bx / 评审§x = 决议/评审落点。

| 编号 | 用例标题 | 优先级 | 验证方式 | 执行时机 | 映射 AC/T |
|------|---------|:------:|---------|---------|-----------|
| TC-P0-001 | supplier_models 缓存成本价 2 列三处一致（schema/迁移/库） | P0 | 数据抽样 | 集成验收阶段（T7 后） | T1 / D-12 |
| TC-P0-002 | vendor_pricing 缓存售价 2 列 + cache_discount_rate 语义降级注释 | P0 | 数据抽样 | 集成验收阶段（T7 后） | T1 / D-12 |
| TC-P0-003 | consumption_records 5 新列类型正确（3 审计 + 2 快照） | P0 | 数据抽样 | 集成验收阶段（T7 后） | T1 / D-8 / AC-13 |
| TC-P0-004 | 分区父表 ALTER 级联子表（父表 5 列 + 抽查子表） | P0 | 数据抽样 | 集成验收阶段（T7 后） | T1 / R-B6 / 评审§6.1 |
| TC-P0-005 | 0031 不登记 _journal.json；drizzle migrate() 不执行 0031（前提核实） | P1 | 数据抽样 | 集成验收阶段（T7 后） | T1 / §3.3 / R-B6 |
| TC-P0-006 | run-migration-0031.cjs 幂等（重复执行不报错、不重复加列） | P0 | 数据抽样 | 集成验收阶段（T7 后） | T1 / R-B6 |
| TC-P0-007 | run-migration-0031.cjs 覆盖测试库初始化路径 + DATABASE_URL 覆盖 | P0 | 数据抽样 | 集成验收阶段（T7 后） | T1 / R-B6 |
| TC-P0-008 | seed billing.cache_pricing_mode upsert 幂等（默认 explicit） | P0 | 接口测试 | 单测阶段（T1 grep） | T1 / D-13 |
| TC-P0-009 | admin-settings PUT cache_pricing_mode 合法值 → 200 + 落库 | P0 | 接口测试 | 单测阶段（T1 grep） | T1 / D-13 |
| TC-P0-010 | admin-settings PUT 非法值 → 400；GET 无记录默认 explicit | P0 | 接口测试 | 单测阶段（T1 grep） | T1 / D-13 / AC-15 |
| TC-P0-011 | getCachePricingMode 无配置/配置/DB 异常/非法值 → explicit | P0 | 单测 | 单测阶段（T1 grep） | T1 / D-13 |
| TC-P0-012 | 模式缓存失效 + 60s TTL（invalidateCachePricingCache） | P1 | 单测 | 单测阶段（T1 grep） | T1 / AC-15 |
| TC-P0-013 | 既有 getGlobalCacheDiscount / resolveCacheDiscountRate 行为不变（回归） | P0 | 单测 | 单测阶段（T1 grep） | T1 / 回归 |
| TC-P0-014 | 范围红线：全库无 billing_logs/models 表、无 override_cache_* 列 | P0 | 单测（静态核查） | 单测阶段（T1 grep） | T1 / D-8 / D-10 |
| TC-P0-020 | DeepSeek hit+miss 归一化（回归） | P0 | 单测 | 单测阶段（T2 grep） | T2 / AC-01 |
| TC-P0-021 | Anthropic read+creation 混合 → read/write 分别归一化 | P0 | 单测 | 单测阶段（T2 grep） | T2 / AC-02 / D-14 |
| TC-P0-022 | 仅 Anthropic creation → hasCacheInfo=true、write=900、hit=0（断言更新） | P0 | 单测 | 单测阶段（T2 grep） | T2 / AC-02 / D-14 |
| TC-P0-023 | OpenAI cached_tokens 归一化（回归） | P0 | 单测 | 单测阶段（T2 grep） | T2 / AC-03 |
| TC-P0-024 | 无缓存字段 → 0/0/false，公式退化全价（回归） | P0 | 单测 | 单测阶段（T2 grep） | T2 / AC-04 |
| TC-P0-025 | 收敛 D-11：read+write > prompt → 优先保留 read | P0 | 单测 | 单测阶段（T2 grep） | T2 / AC-05 / D-11 |
| TC-P0-026 | null/undefined/负值防御（toNonNegativeInt） | P1 | 单测 | 单测阶段（T2 grep） | T2 / 边界 |
| TC-P0-027 | proxy.ts 流式/非流式提取缓存字段（两提取点） | P0 | 单测 | 单测阶段（T2 grep） | T2 / 评审§6.4 |
| TC-P0-028 | translate.ts extractOpenAIChunk 缓存字段 + toResponsesUsage 透传保留 | P0 | 单测 | 单测阶段（T2 grep） | T2 / 评审§6.4 |
| TC-P0-029 | responses-stream.ts lastValidUsage 缓存字段 | P0 | 单测 | 单测阶段（T2 grep） | T2 / 评审§6.4 |
| TC-P0-030 | settle-stream 透传 + fallback 分支缓存字段恒 undefined（A9） | P0 | 单测 | 单测阶段（T2 grep） | T2 / A9 |
| TC-P0-031 | discount_rate 对照断言：creation 全价与旧版金额一致（R-B5/D-14） | P0 | 单测 | 单测阶段（T2 grep） | T2 / AC-10 / D-14 |
| TC-P0-040 | 4 级价格解析优先级逐级验证（D-10） | P0 | 单测 | 单测阶段（T3 grep） | T3 / AC-08 / D-10 |
| TC-P0-041 | 级 2 default 组承载 L2 覆盖语义（D-10） | P0 | 单测 | 单测阶段（T3 grep） | T3 / D-10 |
| TC-P0-042 | 显式写入价缺失 → 生效 input 全价 + full_price 来源标识 | P0 | 单测 | 单测阶段（T3 grep） | T3 / AC-09 / D-3 / D-4 |
| TC-P0-043 | 显式写入价存在 → 用之 + source='explicit' | P0 | 单测 | 单测阶段（T3 grep） | T3 / D-4 |
| TC-P0-044 | discount_rate 模式读取/写入与旧版一致（对照断言） | P0 | 单测 | 单测阶段（T3 grep） | T3 / AC-10 / R-B5 |
| TC-P0-045 | explicit 无任何缓存配置 → 兜底 0.1，行为与旧版一致（回归安全） | P0 | 单测 | 单测阶段（T3 grep） | T3 / AC-11 |
| TC-P0-046 | D-3 生效 input 语义：L3 代理折扣后 input；L5/L3 分支缓存价恒 null | P0 | 单测 | 单测阶段（T3 grep） | T3 / D-3 |
| TC-P0-047 | pricing 为 null → 读取价走全局/兜底、写入价 = 默认 input 全价 | P1 | 单测 | 单测阶段（T3 grep） | T3 / 边界 |
| TC-P0-048 | ModelPricing 新字段贯通（L2 显式价 / L1 null / L5 / L3） | P0 | 单测 | 单测阶段（T3 grep） | T3 / D-3 |
| TC-P0-049 | D-12 类型一致：Number()/String() 统一入口（跨 varchar/numeric） | P0 | 单测 | 单测阶段（T3 grep） | T3 / D-12 |
| TC-P0-050 | D-7 上游支持矩阵常量定义（非强制，供 P1） | P2 | 单测（静态核查） | 单测阶段（T3 grep） | T3 / D-7 |
| TC-P0-060 | 显式价公式手算对照（含用户折扣链路） | P0 | 单测 + 手工核算 | 单测阶段（T4 grep） | T4 / AC-07 |
| TC-P0-061 | read > prompt 收敛（计费层 min） | P0 | 单测 | 单测阶段（T4 grep） | T4 / AC-05 / D-11 |
| TC-P0-062 | write 收敛 min(write, prompt−read)（D-11 双保险） | P0 | 单测 | 单测阶段（T4 grep） | T4 / D-11 |
| TC-P0-063 | 写入价缺失按生效 input 全价计（D-3） | P0 | 单测 + 手工核算 | 单测阶段（T4 grep） | T4 / AC-09 / D-3 |
| TC-P0-064 | cacheHitCost / cacheWriteCost / discountAmount 拆分明细正确 | P0 | 单测 + 手工核算 | 单测阶段（T4 grep） | T4 / 公式 |
| TC-P0-065 | 精度 D-1：cost/cacheHitCost/cacheWriteCost 输出 toFixed(8) | P0 | 单测 | 单测阶段（T4 grep） | T4 / AC-12 / D-1 / R-B5 |
| TC-P0-066 | 批量消费按每笔计算后汇总（精度汇总语义） | P1 | 单测 + 手工核算 | 单测阶段（T4 grep） | T4 / AC-12 / D-1 |
| TC-P0-067 | discount_rate 模式与旧版逐 case 一致（computeUsageCost 输出口径） | P0 | 单测 | 单测阶段（T4 grep） | T4 / AC-10 / R-B5 |
| TC-P0-068 | 无缓存字段 → 全价、discount=0、cache 字段 0/null（回归） | P0 | 单测 | 单测阶段（T4 grep） | T4 / AC-04 |
| TC-P0-069 | computeUsageCost(usage=null) → null 不抛错 | P1 | 单测 | 单测阶段（T4 grep） | T4 / 边界 |
| TC-P0-070 | A9 已累计有效 usage → 按累计结算（含缓存字段）多退少补 | P0 | 单测 | 单测阶段（T4 grep） | T4 / A9 / R-B2 |
| TC-P0-071 | A9 无 usage 有文本 → fallback 全价（缓存字段 undefined） | P0 | 单测 | 单测阶段（T4 grep） | T4 / A9 / R-B2 |
| TC-P0-072 | A9 无响应 → 回滚预扣全额（缓存字段不参与） | P0 | 单测 | 单测阶段（T4 grep） | T4 / A9 / R-B2 |
| TC-P0-073 | 预扣估算不含缓存价（computeEstimatedCost 全价口径不变） | P1 | 单测 | 单测阶段（T4 grep） | T4 / A9 / 评审§6.5 |
| TC-P0-074 | cacheWritePriceSource 显式价/全价两种取值正确（D-4） | P0 | 单测 | 单测阶段（T4 grep） | T4 / D-4 |
| TC-P0-080 | 6 路由共享 ModelPricing 消重（grep 无内联重复） | P1 | 单测（静态核查） | 单测阶段（T5 grep） | T5 / R-B3 |
| TC-P0-081 | 6 路由统一 computeUsageCost（grep 无 parseAndDiscount 直调） | P0 | 单测（静态核查） | 单测阶段（T5 grep） | T5 / R-B3 |
| TC-P0-082 | chat 非流式 + DeepSeek usage → 缓存计费正确 + settle opts 新字段 | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / AC-07 |
| TC-P0-083 | messages 非流式 + Anthropic usage → read/write 计费正确 | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / AC-02 |
| TC-P0-084 | openai-compat 非流式 + OpenAI cached_tokens → 计费正确 + 原 usage 结构兼容 | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / AC-03 / AC-29 兼容 |
| TC-P0-085 | openai-compat 双调用点（流式/非流式）金额一致（R-B3 重点） | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / R-B3 |
| TC-P0-086 | rerank 归一化补全（缺 prompt_tokens）+ 透传响应体不变（R-B3 重点） | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / R-B3 |
| TC-P0-087 | anthropic 路由非流式/流式计费一致 | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / AC-02 |
| TC-P0-088 | responses 路由计费（既有 include_usage 注入保留） | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / D-9 |
| TC-P0-089 | D-9 注入范围全景：三端点注入 / responses 保留 / anthropic 不注入 | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / D-9 / AC-14 |
| TC-P0-090 | STREAM_INCLUDE_USAGE_ENABLED=false 开关回归 + 单点引用（R-B4） | P0 | 接口测试 + 静态核查 | 单测阶段（T5 grep） | T5 / R-B4 |
| TC-P0-091 | recordConsumption 写入 5 新列 + metadata 来源标识（mock DB） | P0 | 单测 | 单测阶段（T5 grep） | T5 / AC-09 / AC-13 / D-8 |
| TC-P0-092 | SettleOptions 新字段透传到 recordConsumption（mock） | P0 | 单测 | 单测阶段（T5 grep） | T5 / D-8 |
| TC-P0-093 | 6 路由无缓存字段 → 全价、opts cache 字段空，与 P0 前一致（回归） | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / AC-04 |
| TC-P0-094 | 流式 + include_usage 缓存计费生效 / 无 usage fallback 全价（A9） | P0 | 接口测试 | 单测阶段（T5 grep） | T5 / AC-14 / A9 |
| TC-P0-095 | consumption-log.ts HAS_CACHE_COLUMNS 过时注释修正（R-B7） | P2 | 单测（静态核查） | 单测阶段（T5 grep） | T5 / R-B7 |
| TC-P0-096 | 幂等摘要不含缓存字段、幂等回放不重复计费（评审§6.5） | P1 | 单测 | 单测阶段（T5 grep） | T5 / 评审§6.5 |
| TC-P0-100 | POST/PUT 缓存读取价 ≥0 → 200 + 落库 | P0 | 接口测试 | 单测阶段（T6 grep） | T6 / AC-19 |
| TC-P0-101 | 负值/NaN → 400（校验拒绝） | P0 | 接口测试 | 单测阶段（T6 grep） | T6 / AC-19 |
| TC-P0-102 | 写入价留空 → null；空字符串 → 清空为 null（回退全价） | P0 | 接口测试 | 单测阶段（T6 grep） | T6 / AC-19 |
| TC-P0-103 | 缓存读取价 = 0 合法（免费读缓存） | P1 | 接口测试 | 单测阶段（T6 grep） | T6 / AC-19 |
| TC-P0-104 | GET /admin/pricing 返回新字段（number\|null） | P0 | 接口测试 | 单测阶段（T6 grep） | T6 / AC-19 |
| TC-P0-105 | GET /public/pricing 返回新字段（公开价目数据就绪） | P1 | 接口测试 | 单测阶段（T6 grep） | T6 / AC-18 数据侧 |
| TC-P0-106 | 缓存价变更不触发 price_change_logs（仅 input/output 触发，回归） | P0 | 接口测试 | 单测阶段（T6 grep） | T6 / D-6 / AC-39 前置 |
| TC-P0-107 | D-5 权限：finance_ops 开放缓存售价配置（Q1 裁定定稿） | P1 | 接口测试 | 单测阶段（T6 grep） | T6 / D-5 / Q1 |
| TC-P0-108 | suppliers.ts 价格变更衔接注释预留（R-B7） | P2 | 单测（静态核查） | 单测阶段（T6 grep） | T6 / R-B7 |
| TC-P0-110 | 全量回归：808 基线只增不减（唯一例外 T2 2 断言 D-14 已声明） | P0 | 单测（全量） | 集成验收阶段（T7 后） | T7 / R-B8 |
| TC-P0-111 | 存量无显式价模型计费结果与现状一致（0.1 回退，无行为变更） | P0 | 接口测试 + 数据抽样 | 集成验收阶段（T7 后） | T7 / AC-11 / AC-38 |
| TC-P0-112 | cache_pricing_mode 切换即时生效 + 存量已发生调用不受影响 | P0 | 接口测试 | 集成验收阶段（T7 后） | T7 / AC-15 |
| TC-P0-113 | discount_rate 一键回退旧行为（灰度开关演练） | P0 | 接口测试 | 集成验收阶段（T7 后） | T7 / AC-38 / AC-10 |
| TC-P0-114 | 存量数据无迁移、无回填、新列全可空 | P0 | 数据抽样 | 集成验收阶段（T7 后） | T7 / AC-38 |
| TC-P0-115 | tsc --noEmit 0 error / lint 0 error（Gate） | P0 | 单测（typecheck/lint） | 集成验收阶段（T7 后） | T7 / Gate |
| TC-P0-116 | 分区表唯一约束 (request_id, created_at) 不受新列影响 | P0 | 数据抽样 | 集成验收阶段（T7 后） | T7 / 评审§6.1 / 风险 |
| TC-P0-117 | 既有 varchar 价格列不迁移（D-12 债务记录） | P1 | 单测（静态核查） | 集成验收阶段（T7 后） | T7 / D-12 / 风险 |
| TC-P0-118 | 计价单位存储口径契约核对（¥/1K 入库；÷1000 自动换算属 P3，Q2 裁定） | P1 | 手工核算 | 集成验收阶段（T7 后） | T7 / AC-06 / Q2 |
| TC-P0-119 | 写入价 > 输入价边界（允许、按实际值计费，cache_discount 可为负，Q3 裁定） | P1 | 接口测试 + 手工核算 | 集成验收阶段（T7 后） | T7 / Q3 |

---

## 2. 分组明细

### A. 数据模型与迁移 + 全局配置面（T1）

> 迁移执行顺序前置：备份 → `node api/run-migration-0031.cjs` → seed → 发布。集成验收阶段执行 TC-P0-001~007/014 前须先跑 §8.1 步骤 0 的 runner。

| 编号 | 前置条件 | 测试步骤 | 预期结果 | 优先级 | 验证方式 | 执行时机 |
|------|---------|---------|---------|:------:|---------|---------|
| TC-P0-001 | T1 完成；`run-migration-0031.cjs` 已对本地库执行 | ① 检查 `db/schema/supplier-models.ts` ② `psql -d threecloud_v3 -c "\d supplier_models"` ③ 检查 0031 SQL | schema / 0031 迁移 / 实际库三处一致：`cost_cache_read_input_price`、`cost_cache_write_input_price` 均为 numeric(18,6)、可空、无默认值；文件头注释含"P3 同步引擎抓取、P0 仅建列"说明 | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-002 | 同上 | ① `\d vendor_pricing` ② 检查 schema 中 cacheDiscountRate 注释 | `cache_read_input_price`、`cache_write_input_price` numeric(18,6) 可空；`cache_discount_rate` 列未改（varchar(10)），注释语义降级为"兼容/快捷配置 + 展示反推" | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-003 | 同上 | ① `\d consumption_records`（分区父表）② 对照 §3.2 列汇总表 | 5 新列类型正确：`cache_write_tokens` integer；`cache_hit_cost`/`cache_write_cost` numeric(18,8)；`cache_read_input_price`/`cache_write_input_price` numeric(18,6)；均可空无默认值 | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-004 | 同上 | ① `\d consumption_records` 父表确认 5 新列 ② 抽查任一月份子表（如 `\d consumption_records_*` 最新分区） | 父表 ALTER 自动级联全部子表（PG 原生）：抽查子表同样含 5 新列；无锁表/报错 | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-005 | 同上 | ① 检查 `meta/_journal.json` ② 检查 0031 文件命名 | 0031 未登记 `_journal.json`（0017+ 惯例）；drizzle `migrate()`（journal 驱动）不会执行 0031 → 印证必须由 runner 执行（R-B6 前提） | P1 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-006 | 0031 已执行一次 | ① 再次执行 `node api/run-migration-0031.cjs` | 幂等容错：重复执行不报错、不重复加列（ADD COLUMN IF NOT EXISTS 语义或 runner 幂等守卫，参照 run-migrations-0017-0022.cjs"重复执行报错不阻断"模式）；0025 幂等守卫不受影响 | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-007 | T1 完成 | ① 本地库执行 runner 后跑全量/集成测试 ② 用 `DATABASE_URL` 指向独立库执行 runner | runner 覆盖本地 `threecloud_v3`（= 测试库初始化路径，R-B6）；`DATABASE_URL` 环境变量可覆盖目标库；集成测试前置无缺列报错 | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-008 | T1 完成 | ① 执行 seed ② 再次执行 seed ③ 查询 system_config | `billing.cache_pricing_mode` upsert 幂等：重复执行不报错、值正确为 `explicit`；描述文案含"显式价优先/discount_rate 兼容旧折扣率" | P0 | 接口测试 | 单测阶段（T1 grep） |
| TC-P0-009 | T1 完成 | ① PUT /api/v1/admin/settings/billing body: `{cache_pricing_mode: "explicit"}` ② 同上 `"discount_rate"` ③ 查询落库 | 两合法值均 200；system_config 落库值正确；写入后调用 invalidateCachePricingCache 即时失效（无 60s 陈旧窗口） | P0 | 接口测试 | 单测阶段（T1 grep） |
| TC-P0-010 | T1 完成 | ① PUT body: `{cache_pricing_mode: "xxx"}` ② 无 DB 记录时 GET /settings/billing | 非法值 400；GET 无记录时返回默认 `explicit`（D-13） | P0 | 接口测试 | 单测阶段（T1 grep） |
| TC-P0-011 | T1 完成 | ① 无配置调用 getCachePricingMode ② 配置 discount_rate 后调用 ③ mock DB 抛异常 ④ mock 非法值 | ① explicit ② discount_rate ③④ 默认 explicit（D-13），不抛错 | P0 | 单测 | 单测阶段（T1 grep） |
| TC-P0-012 | T1 完成 | ① 首次调用 getCachePricingMode ② 60s 内再次调用 ③ PUT 修改后立即调用 | Redis 缓存键 `billing:cache_pricing_mode` 60s TTL；PUT 后 invalidateCachePricingCache 删除键，立即读到新值 | P1 | 单测 | 单测阶段（T1 grep） |
| TC-P0-013 | T1 完成 | ① 运行既有 cache-billing.test.ts 全部断言 | `getGlobalCacheDiscount` / `resolveCacheDiscountRate` 既有行为不变（模型级 → 全局 → 兜底链），0 破坏 | P0 | 单测 | 单测阶段（T1 grep） |
| TC-P0-014 | T1 完成 | ① grep 全库 `pgTable('(models|call_logs|billing_logs)'` ② grep `override_cache_` | 无 billing_logs/models 表定义（D-8/D-10 红线）；无 override_cache_read/write_input_price 列落地；0031 DDL 仅 9 列 + 1 config key | P0 | 单测（静态核查） | 单测阶段（T1 grep） |

### B. usage 归一化（T2）

| 编号 | 前置条件 | 测试步骤 | 预期结果 | 优先级 | 验证方式 | 执行时机 |
|------|---------|---------|---------|:------:|---------|---------|
| TC-P0-020 | T2 完成 | 构造 DeepSeek usage：`{prompt_tokens: 1000, prompt_cache_hit_tokens: 600, prompt_cache_miss_tokens: 400}` → parseCacheTokens | `cacheReadTokens=600`、`cacheMissTokens=400`、`hasCacheInfo=true`；miss 不单独计（落入未命中全价段）（回归） | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-021 | T2 完成 | 构造 Anthropic usage：`{prompt_tokens: 1000, cache_read_input_tokens: 600, cache_creation_input_tokens: 100}` → parseCacheTokens | `cacheReadTokens=600`、`cacheWriteTokens=100`（creation→write 为本次新增行为）、`hasCacheInfo=true` | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-022 | T2 完成 | 构造仅 creation：`{prompt_tokens: 1000, cache_creation_input_tokens: 900}` → parseCacheTokens | `cacheWriteTokens=900`、`cacheHitTokens=0`、`hasCacheInfo=true`（D-14：原断言 hasCacheInfo=false 更新为 true，方案刻意行为变更非回归，须在测试注释声明原因） | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-023 | T2 完成 | 构造 OpenAI usage：`{prompt_tokens: 1000, prompt_tokens_details: {cached_tokens: 700}}` → parseCacheTokens | `cacheReadTokens=700`、`hasCacheInfo=true`（平台落显式价，不套官方 50%）（回归） | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-024 | T2 完成 | 构造无缓存字段 usage：`{prompt_tokens: 1000, completion_tokens: 500}` → parseCacheTokens | `cacheReadTokens=0`、`cacheWriteTokens=0`、`hasCacheInfo=false`（回归） | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-025 | T2 完成 | ① read+write 超限：prompt=1000, read=900, write=900 ② read 单独超限：prompt=1000, read=1100 | ① write 收敛 = max(1000−900, 0) = 100，保留 read=900 ② read 收敛 = 1000，write = 0（D-11 read 优先） | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-026 | T2 完成 | ① usage 为 null ② 缓存字段缺失（undefined）③ 缓存字段为负值 | ① 返回无缓存信息不抛错 ② 按缺失处理（0/false）③ toNonNegativeInt 钳制为 0（回归防御） | P1 | 单测 | 单测阶段（T2 grep） |
| TC-P0-027 | T2 完成 | ① proxy.ts 流式提取（L140-143）构造流式 chunk usage ② 非流式提取（L202-204） | 两提取点构建 TokenUsage 时均经 parseCacheTokens 归一化填充缓存字段（评审§6.4 三提取点统一口径） | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-028 | T2 完成 | 构造 Anthropic chunk → translate.ts extractOpenAIChunk | 返回 usage 填充缓存字段（read/write）；`toResponsesUsage` 的 cached_tokens 透传字段保留（P2 客户透传用），与计费归一化字段分离不混淆 | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-029 | T2 完成 | 构造 responses 流式末帧 usage → responses-stream.ts lastValidUsage | lastValidUsage 构建处填充缓存字段；与 proxy.ts 对齐 | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-030 | T2 完成 | ① 采信上游 usage 的 determineStreamBilling 分支 ② fallback 分支（有文本/无文本） | ① StreamBillingResult 透传 lastValidUsage 缓存字段 ② fallback 分支缓存字段恒 undefined（全价，A9/R-B2） | P0 | 单测 | 单测阶段（T2 grep） |
| TC-P0-031 | T2 完成 | ① `parseCacheTokens({prompt_tokens: 1000, cache_creation_input_tokens: 900})` ② discount_rate 模式 `computeCacheDiscountedCost(1000, 0, pricing, 归一化结果, 0.1)` | ① cacheWriteTokens=900、hasCacheInfo=true ② 金额与旧版完全一致：cost = (1000/1000) × input（creation 部分按 input 全价含在未命中段，金额不变；归属/审计口径不同）——R-B5/D-14 对照断言防误回归 | P0 | 单测 | 单测阶段（T2 grep） |

### C. 价格解析（T3）

| 编号 | 前置条件 | 测试步骤 | 预期结果 | 优先级 | 验证方式 | 执行时机 |
|------|---------|---------|---------|:------:|---------|---------|
| TC-P0-040 | T3 完成 | 4 种配置组合调用 resolveCachePricing（生效 input=0.002）：① 显式 read=0.0005 ② 无显式 + cache_discount_rate=0.5 ③ 无显式无模型折扣 + 全局 cache_hit_discount=0.2 ④ 全空 | ① 0.0005（级 2 显式）② 0.002×0.5=0.001（级 3）③ 0.002×0.2=0.0004（级 4 全局）④ 0.002×0.1=0.0002（级 5 兜底 CACHE_HIT_DISCOUNT）；逐级命中即停（D-10 4 级生效） | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-041 | T3 完成 | 配置 `vendor_pricing(pricing_group='default')` 显式缓存读取价 → getPricingForModel 后 resolveCachePricing | default 组显式价（级 2）直接命中，天然承载 L2 覆盖语义；无需 models 表（D-10，双载体歧义消除） | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-042 | T3 完成 | 显式读取价有、显式写入价 null → resolveCachePricing | `cacheWritePrice === pricing.input`（生效 input 全价）且 `cacheWritePriceSource === 'full_price'`（D-3/D-4 保守口径） | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-043 | T3 完成 | 显式写入价存在（如 0.001）→ resolveCachePricing | 写入价取 0.001 且 `cacheWritePriceSource === 'explicit'` | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-044 | T3 完成 | `mode='discount_rate'`：① 有模型折扣率 ② 无模型折扣率有全局 ③ 全空 | 读取价 = 生效 input × rate（模型级→全局→兜底三档），写入价 = 生效 input 全价；结果与旧 computeCacheDiscountedCost 一致（R-B5 对照断言） | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-045 | T3 完成 | `mode='explicit'` 且模型无任何缓存配置 → resolveCachePricing | 读取价 = 生效 input × 0.1（兜底），行为与旧版一致（回归安全，D-13 默认即安全） | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-046 | T3 完成 | L3 代理折扣链路：代理后最终 input=0.0015 → resolveCachePricing（无显式价、cache_discount_rate=0.5）；L5/L3 分支 pricing 检查 | 折扣率回退 = 0.0015 × 0.5 = 0.00075（非 L1 原始价，D-3 生效 input 语义）；L5 活动价分支与 L3 代理价分支 `cacheReadInputPrice` 恒 null（显式价独立于折扣类优惠） | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-047 | T3 完成 | resolveCachePricing(pricing=null) | 读取价走全局/兜底；写入价 = 默认 input 全价；不抛错 | P1 | 单测 | 单测阶段（T3 grep） |
| TC-P0-048 | T3 完成 | getPricingForModel 各分支断言新字段 | L2 显式价贯通（default 组）；L1 兜底 null；L5/L3 分支 cacheReadInputPrice/cacheWriteInputPrice 恒 null；DEFAULT_PRICING 含两新字段 null | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-049 | T3 完成 | 构造 numeric 列值与 varchar 列值混合场景 → toPricing / queryPricingByGroup | 入口统一 Number()（非法 → null）；写入 numeric 由 Drizzle 返回 string 需 String()；cache_discount_rate varchar(10) 与 numeric 新列跨类型回退链 Number() 统一（D-12 三处一致） | P0 | 单测 | 单测阶段（T3 grep） |
| TC-P0-050 | T3 完成 | 检查常量定义 | （非强制，D-7）`SUPPORTED_CACHE_USAGE_VENDORS` 常量存在或注明未定义（P0 归一化层以 hasCacheInfo 运行时判定为准，不依赖静态矩阵） | P2 | 单测（静态核查） | 单测阶段（T3 grep） |

### D. 计费引擎（T4）

> 手算基准示例（TC-P0-060/064 共用）：prompt=10000、completion=5000、read=6000、write=1000；input=0.002、output=0.012、readPrice=0.0005、writePrice=0.001、user_discount_rate=1.0。
> 输入费用 = 6×0.0005 + 1×0.001 + 3×0.002 = 0.010；输出费用 = 5×0.012 = 0.060；总费用 = 0.07000000；全价 = 0.020 + 0.060 = 0.080；cacheHitCost=0.00300000、cacheWriteCost=0.00100000、cacheDiscount=0.01000000。

| 编号 | 前置条件 | 测试步骤 | 预期结果 | 优先级 | 验证方式 | 执行时机 |
|------|---------|---------|---------|:------:|---------|---------|
| TC-P0-060 | T4 完成 | computeCacheCost 按上述基准示例调用（mode=explicit，显式价） | cost === "0.07000000"（toFixed(8)），且手工核算逐项一致：read 段 0.003、write 段 0.001、miss 段 0.006、输出 0.060；× user_discount_rate 仅作用于总费用（D-3） | P0 | 单测 + 手工核算 | 单测阶段（T4 grep） |
| TC-P0-061 | T4 完成 | 命中超输入：input=1000, read=1100 → computeCacheCost | read = min(1100, 1000) = 1000，费用 = (1000/1000) × readPrice（计费层收敛，与归一化层 D-11 双保险） | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-062 | T4 完成 | read+write 超限：input=1000, read=600, write=600 → computeCacheCost | read=600，write = min(600, 400) = 400（保留 read，write 收敛到 input−read） | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-063 | T4 完成 | 写入价缺失：input=1000, write=200, cacheWritePrice = input 全价 → computeCacheCost | write 段费用 = (200/1000) × input 全价（D-3 保守口径）；cacheWritePriceSource='full_price' | P0 | 单测 + 手工核算 | 单测阶段（T4 grep） |
| TC-P0-064 | T4 完成 | 按基准示例断言拆分字段 | cacheHitCost === "0.00300000"；cacheWriteCost === "0.00100000"；discountAmount = 全价 − 实际费用 = 0.01000000 ≥ 0 | P0 | 单测 + 手工核算 | 单测阶段（T4 grep） |
| TC-P0-065 | T4 完成 | ① 基准示例金额断言 ② 极小值：1 token × 0.0001/1K | ① `result.cost === (0.07).toFixed(8)` 等 8 位断言，与现有 cost/cache_discount 列精度一致（D-1/R-B5）② "0.00000010"（(1/1000)×0.0001 = 0.0000001 保留 8 位）；全程无 6/4 位舍入层 | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-066 | T4 完成 | 批量 3 笔（含不同缓存构成）→ 汇总金额 | 每笔单独计算后汇总（不先汇总 token 再计费）；汇总值 = 各笔 toFixed(8) 值之和，与逐笔断言一致（D-1 批量语义） | P1 | 单测 + 手工核算 | 单测阶段（T4 grep） |
| TC-P0-067 | T4 完成 | computeUsageCost(mode='discount_rate') 与旧 computeCacheDiscountedCost 同输入同输出逐 case 对照 | 金额完全一致；返回 cacheWriteTokens=0、cacheHitCost/cacheWriteCost=0、cacheWritePriceSource='full_price'（与旧版一致优先，T4 任务书口径） | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-068 | T4 完成 | 无缓存字段 usage → computeUsageCost(mode='explicit') | 全价：cost = 全价、discount=0、cache 字段 0/null；计费结果与现状一致（回归，AC-04） | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-069 | T4 完成 | computeUsageCost(usage=null, pricing) / computeUsageCost(usage=null, pricing=null) | 返回 null 不抛错；调用方走 computeCost 全价/预估路径（现状保持） | P1 | 单测 | 单测阶段（T4 grep） |
| TC-P0-070 | T4 完成 | 流式中断但 lastValidUsage 非空（含缓存字段）→ determineStreamBilling | 按已累计 usage 结算（采信，缓存字段参与实际费用）；settlePreConsume 多退少补（A9/R-B2） | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-071 | T4 完成 | 失败且无有效 usage、有生成文本 → determineStreamBilling | fallback 本地 tiktoken 计数，缓存字段恒 undefined → 全价（A9/R-B2） | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-072 | T4 完成 | 失败且无任何有效响应 → 回滚路径 | 回滚预扣全额（现有 refund 路径），缓存字段不参与（A9/R-B2） | P0 | 单测 | 单测阶段（T4 grep） |
| TC-P0-073 | T4 完成 | 构造含缓存 usage 的请求 → 预扣估算 | 预扣 = computeEstimatedCost 全价口径（不含缓存价）；缓存价只影响 settle 多退少补，方向安全不会少扣（评审§6.5） | P1 | 单测 | 单测阶段（T4 grep） |
| TC-P0-074 | T4 完成 | ① 显式写入价场景 ② 写入价缺失场景 → computeUsageCost | ① cacheWritePriceSource='explicit' ② 'full_price'（D-4 两取值正确） | P0 | 单测 | 单测阶段（T4 grep） |

### E. 路由与落库（T5）

| 编号 | 前置条件 | 测试步骤 | 预期结果 | 优先级 | 验证方式 | 执行时机 |
|------|---------|---------|---------|:------:|---------|---------|
| TC-P0-080 | T5 完成 | grep 6 路由文件内联 `type ModelPricing` | 6 路由（chat/messages/openai-compat/rerank/responses/anthropic）无内联重复类型，统一 `import { type ModelPricing }`（R-B3 消重） | P1 | 单测（静态核查） | 单测阶段（T5 grep） |
| TC-P0-081 | T5 完成 | grep 6 路由 `parseAndDiscount(` 直接调用 | 仅剩 T4 cache-billing.ts 内部使用；6 路由统一走 computeUsageCost（R-B3 统一入口） | P0 | 单测（静态核查） | 单测阶段（T5 grep） |
| TC-P0-082 | T5 完成 | chat 非流式 + DeepSeek usage（hit 600/miss 400, prompt 1000, completion 500）→ 断言 settleBilling opts | 计费金额按显式价/回退价正确；opts 含 cacheWriteTokens/cacheHitCost/cacheWriteCost/cacheReadInputPrice/cacheWriteInputPrice/cacheWritePriceSource | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-083 | T5 完成 | messages 非流式 + Anthropic usage（read 600/creation 100）→ 断言 opts | read→读取段、creation→写入段分别计费；opts 字段齐全（AC-02 端到端） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-084 | T5 完成 | openai-compat 非流式 + OpenAI usage（cached_tokens 700）→ 断言 opts + 响应体 | 计费正确；响应 usage 保持原 OpenAI 结构 + 扩展字段，不破坏既有解析（AC-29 兼容性回归） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-085 | T5 完成 | openai-compat 同一输入同一缓存信息分别走 /v1/completions 流式与非流式分支 | 两分支均走统一入口，计费金额一致（R-B3 双调用点，漏改一个即口径不一致） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-086 | T5 完成 | rerank 上游 usage 缺 prompt_tokens → 路由调用链 | billingUsage 归一化补全（仅计费用，不改透传响应体）后缓存计费正确；透传响应体与原上游返回一致（R-B3 重点） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-087 | T5 完成 | anthropic 路由非流式 / 流式各一次（同 usage） | 计费金额一致（流式采信末帧 usage，A9） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-088 | T5 完成 | responses 路由非流式 / 流式（含 usage 缓存字段） | 计费正确；既有 stream_options.include_usage 注入保留（responses 已有，不重复注入） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-089 | T5 完成 | ① chat/messages/openai-compat stream=true → buildUpstreamBody ② responses stream=true ③ anthropic stream=true | ① body 含 `stream_options: { include_usage: true }`（注入集中 buildUpstreamBody 单点）② responses 保留既有注入 ③ anthropic 不注入（上游 message_delta 天然携带 usage，D-9 范围） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-090 | T5 完成 | ① 将 STREAM_INCLUDE_USAGE_ENABLED=false ② 三端点 stream=true 请求 ③ grep 常量引用 | ① 流式请求体不含 stream_options（开关回归，R-B4 快速关闭能力）② 恢复 true 后正常注入 ③ 常量单点引用（仅 buildUpstreamBody 处判定） | P0 | 接口测试 + 静态核查 | 单测阶段（T5 grep） |
| TC-P0-091 | T5 完成 | mock db 调 recordConsumption（含缓存字段 + 来源标识场景） | 5 新列写入：cacheWriteTokens（integer）、cacheHitCost/cacheWriteCost（String 转换）、cacheReadInputPrice/cacheWriteInputPrice（String 转换）；metadata 合并 `cache_write_price_source`；无缓存字段时新列 null；既有 cacheHitTokens/cacheDiscount 正常写入（AC-09/AC-13） | P0 | 单测 | 单测阶段（T5 grep） |
| TC-P0-092 | T5 完成 | mock 调 settleBilling（SettleOptions 含 6 新字段） | 新字段逐一透传到 recordConsumption（cacheWriteTokens/cacheHitCost/cacheWriteCost/cacheReadInputPrice/cacheWriteInputPrice/cacheWritePriceSource；cacheHitTokens/cacheDiscount 保留） | P0 | 单测 | 单测阶段（T5 grep） |
| TC-P0-093 | T5 完成 | 6 路由各一次无缓存字段 usage 请求 → 断言 opts + 金额 | 全价、opts cache 字段空；金额与 P0 前一致（回归，AC-04） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-094 | T5 完成 | ① 流式 + include_usage 返回缓存字段 ② 流式无 usage | ① 缓存计费生效（AC-14）② fallback 全价（A9 回归） | P0 | 接口测试 | 单测阶段（T5 grep） |
| TC-P0-095 | T5 完成 | 检查 consumption-log.ts 注释（L25-28/L32-37/L62-63 附近） | HAS_CACHE_COLUMNS 相关过时注释已修正为"列已由 0005/0031 迁移落地，无条件写入"；运行时兜底可保留但注释不再声称"当前表结构没有"（R-B7 闭环） | P2 | 单测（静态核查） | 单测阶段（T5 grep） |
| TC-P0-096 | T5 完成 | ① 检查 buildIdempotencySummary 摘要内容 ② 幂等回放同一请求 | 摘要不含缓存字段（缓存字段仅审计用途）；幂等回放只重放响应/摘要、不重复计费（评审§6.5 最小改动正确） | P1 | 单测 | 单测阶段（T5 grep） |

### F. 管理端定价 CRUD（T6）

| 编号 | 前置条件 | 测试步骤 | 预期结果 | 优先级 | 验证方式 | 执行时机 |
|------|---------|---------|---------|:------:|---------|---------|
| TC-P0-100 | T6 完成 | ① POST /api/v1/admin/pricing 带 cache_read_input_price=0.0005 ② PUT /api/v1/admin/pricing/:id 更新为 0.0008 | 均 200 + 落库；读取返回 number 类型（null 保留） | P0 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-101 | T6 完成 | ① cache_read_input_price = -0.001 ② = NaN/非数字 ③ cache_write_input_price = -0.1 | 全部 400（校验：≥0；负数/NaN 拒绝，对齐 ref-5.2 §八） | P0 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-102 | T6 完成 | ① 写入价不传（缺省）② 写入价传空字符串 "" | ① 落库 null（回退全价口径）② 清空为 null（与 cache_discount_rate 清空逻辑一致） | P0 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-103 | T6 完成 | cache_read_input_price = 0 → PUT | 200 合法（0 = 免费读缓存），不拒绝 | P1 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-104 | T6 完成 | GET /api/v1/admin/pricing | 每条返回 cache_read_input_price / cache_write_input_price（number|null）；list map 转换正确 | P0 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-105 | T6 完成 | GET /api/v1/public/pricing | 返回两新字段（公开价目数据就绪，页面展示属 P1；AC-18 数据侧就绪） | P1 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-106 | T6 完成 | ① 仅改缓存读取价 → 查 price_change_logs ② 仅改 input_price → 查 price_change_logs | ① 不新增记录（P0 行为：缓存价变更不触发通知，D-6；priceChanged 判定暂不扩缓存价）② 正常记录（既有行为回归） | P0 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-107 | T6 完成 | 按 PRD v1.1 §6.2 权限矩阵（**Q1 裁定定稿**）：① 以 finance_ops 角色 PUT 缓存价字段 ② 以 admin / super_admin 角色 PUT ③ 以 ops 角色 PUT | ① finance_ops 开放：200（缓存售价配置 finance_ops 以上开放；admin/super_admin 权限不变）② 200 ③ 403（ops 无售价配置权限，权限矩阵不变）；权限判定沿用既有端点 adminAuth，无新增分支；任务书 v2.0 §9"待 product-agent 最终确认"标注属过期，无需确认流程 | P1 | 接口测试 | 单测阶段（T6 grep） |
| TC-P0-108 | T6 完成 | 检查 suppliers.ts 价格变更衔接处注释 | 预留注释存在且正确："缓存价变更的字段级通知由 P1 按方案 §7.3/评审 D-6 接入"（R-B7 闭环） | P2 | 单测（静态核查） | 单测阶段（T6 grep） |

### G. 兼容回归与边界（T7）

| 编号 | 前置条件 | 测试步骤 | 预期结果 | 优先级 | 验证方式 | 执行时机 |
|------|---------|---------|---------|:------:|---------|---------|
| TC-P0-110 | T1~T6 全绿 | ① 全量 `pnpm test` ② 对照基线统计 | 808 基线只增不减（0 破坏）；**唯一例外 = T2 更新既有 2 个 Anthropic 断言（D-14 获准，须在实现完成报告声明原因），不得静默改测试掩盖回归**（R-B8） | P0 | 单测（全量） | 集成验收阶段（T7 后） |
| TC-P0-111 | T7 阶段 | 存量未配置显式缓存价模型（含既有 cache_discount_rate/cache_hit_discount 配置）重放调用 → 新旧计费结果比对 | 计费结果与现状一致（折扣率 0.1 回退链不变，无行为变更）（AC-11/AC-38） | P0 | 接口测试 + 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-112 | T7 阶段 | ① explicit 下调用 ② PUT 切 discount_rate ③ 立即调用 ④ 查询已落库历史记录 | ② ③ 切换即时生效（TTL 5 分钟内，缓存失效机制沿用 ref-5.2 §3.3）④ 存量已发生调用不受影响（价格变更不追溯历史，AC-15） | P0 | 接口测试 | 集成验收阶段（T7 后） |
| TC-P0-113 | T7 阶段 | 后台切换 discount_rate → 重放既有调用 | 计费结果一键回到旧版（写入全价 + 读取折扣率），无需发版（AC-38 灰度开关演练） | P0 | 接口测试 | 集成验收阶段（T7 后） |
| TC-P0-114 | T7 阶段 | ① 升级前数据抽查 ② 升级后全表扫描新列 | 存量数据无迁移、无回填；新列全部为 NULL（可空无默认值，AC-38） | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-115 | T7 阶段 | ① `pnpm --filter @3cloud/api typecheck` ② `pnpm --filter @3cloud/api lint` | ① tsc --noEmit 0 错误 ② eslint 0 error（Gate） | P0 | 单测（typecheck/lint） | 集成验收阶段（T7 后） |
| TC-P0-116 | 0031 已执行 | ① 插入分区表记录（request_id 唯一）② 插入同 (request_id, created_at) 重复记录 ③ `\d` 父表与子表 | ① 插入成功、5 新列可写 ② 唯一约束 (request_id, created_at) 仍生效（23505 拒绝）③ 复合主键 (id, created_at) 未破坏；ALTER 加列未影响分区结构（评审§6.1 风险） | P0 | 数据抽样 | 集成验收阶段（T7 后） |
| TC-P0-117 | T7 阶段 | grep 迁移/ schema 中 input_price/output_price/cache_discount_rate 类型 | 既有 varchar(30)/varchar(10) 列未迁移（D-12 债务记录，本期不修）；无新增 varchar 缓存价列 | P1 | 单测（静态核查） | 集成验收阶段（T7 后） |
| TC-P0-118 | T7 阶段 | ① 手工核算单位换算（仅作契约理解，不构成断言）② 录入/存储/API 三处核对单位口径（**Q2 裁定**） | ① DeepSeek 命中 ¥0.5/1M ↔ 0.0005/1K；未命中 ¥2/1M ↔ 0.002/1K（÷1000 换算示例，PRD §4.5）② P0 断言仅限**存储口径契约 ¥/1K**：管理端录入、DB 存储值、API 返回值均不得按 /1M 值入库（如录入 0.5 即存 0.5，而非 500）；÷1000 自动换算属 P3 价格同步引擎，**不在本用例断言范围**（PRD AC-06 已改口径） | P1 | 手工核算 | 集成验收阶段（T7 后） |
| TC-P0-119 | T7 阶段 | 配置 cache_write_input_price > input_price（如 input=0.002、write=0.005）→ 构造含 write token 请求计费 | **允许写入价 > 输入价、不设上限校验、按实际值计费（Q3 裁定选 b）**：write 段费用 = write × 0.005 按实际价计算；`cache_discount` 可为负（负 = 缓存写入溢价，前端"节省"按正负语义展示，不钳制为 0）；PUT 校验对"写入价 > 输入价"不拒绝（仅 ≥0 校验，**无"写入价≤输入价"断言**）；快照列 cache_write_input_price 如实记录 0.005 | P1 | 接口测试 + 手工核算 | 集成验收阶段（T7 后） |

---

## 3. 缺陷分级模板

### 3.1 分级定义

| 级别 | 名称 | 定义 | 处置要求 |
|:----:|------|------|---------|
| **P0** | 阻塞 | 计费金额错误 / 缓存计量落库缺失或错位 / 核心功能不可用 / 破坏 808 回归基线 | 阻断验收，必须修复并回归验证通过后方可放行 |
| **P1** | 严重 | 边界场景计费错误（收敛/精度/回退链）、校验缺失（负值/非法值被接受）、权限越权、流式回滚异常、开关失效 | 影响发布质量，建议修复后验收；可携修复计划评审放行 |
| **P2** | 一般 | 注释失真（HAS_CACHE_COLUMNS 等）、非核心静态问题、帮助口径与实现不一致 | 记录并纳入当批次或近期版本修复 |
| **P3** | 建议 | 债务记录（varchar 价格列未迁移）、优化建议（常量命名/文档同步） | 纳入 backlog，不阻塞验收 |

### 3.2 缺陷记录模板（每条缺陷按此填写，交付 backend-agent 修复）

| 字段 | 填写说明 |
|------|---------|
| 缺陷编号 | DEF-P0-XXX（按发现顺序自增） |
| 关联用例 | 触发该缺陷的 TC-P0-XXX 编号 |
| 缺陷标题 | 一句话描述（模块 + 现象） |
| 严重度 | P0 / P1 / P2 / P3 |
| 复现步骤 | 1. 前置数据/配置 … 2. 操作 … 3. 观察点 |
| 期望结果 | 按 §2 对应用例"预期结果"列 |
| 实际结果 | 实际观察到的输出/落库值/行为 |
| 影响面 | 计费金额 / 落库审计 / 回归基线 / 权限安全 / 兼容性 等 |
| 发现阶段 | 单测阶段（T? grep）/ 集成验收阶段（T7 后） |
| 证据 | 断言输出 / 日志 / psql 结果 / 复现脚本路径 |

示例：

| 字段 | 内容 |
|------|------|
| 缺陷编号 | DEF-P0-001 |
| 关联用例 | TC-P0-065 |
| 缺陷标题 | computeCacheCost 输出 6 位小数（应 toFixed(8)） |
| 严重度 | P0 |
| 复现步骤 | 1. 配置显式 read=0.0005/write=0.001，input=0.002 2. 构造 prompt=10000/read=6000/write=1000 3. 调用 computeCacheCost |
| 期望结果 | cost === "0.07000000"（8 位） |
| 实际结果 | cost === "0.070000"（6 位，引入额外舍入层） |
| 影响面 | 计费金额精度与现有 cost 列不一致，违反 D-1 |
| 发现阶段 | 单测阶段（T4 grep） |
| 证据 | test/cache-pricing-explicit.test.ts 断言失败输出 |

---

## 4. 业务疑问裁定记录（product-agent 最终裁定）

> Q1~Q3 已由 product-agent 最终裁定（2026-08-21），用例集按裁定定稿（v1.1），本表保留裁定记录供追溯；Q4/Q5 为技术实现细节或任务书已裁决项，仅记录、无需业务确认。业务疑问不自行定规则——本表为唯一裁定来源。

| # | 业务疑问 | 最终裁定（用例按此编写） | 影响用例 | 状态 |
|---|---------|--------------------------|---------|------|
| 1 | **Q1 · D-5 权限**：finance_ops 是否开放 `PUT /admin/pricing` 缓存价字段 | **已裁定**：以 PRD v1.1 §6.2 为准——finance_ops 开放缓存售价配置（缓存价字段 finance_ops 以上；admin/super_admin 不变）；任务书 v2.0 §9 该行属过期标注，无需确认流程 | TC-P0-107 | ✅ 已定稿（v1.1 修订） |
| 2 | **Q2 · AC-06 /1M→/1K 归一化范围**：价格同步引擎（÷1000）本期是否要求 | **已裁定**：P0 仅核对存储口径契约 ¥/1K（录入/存储/API 均不得按 /1M 值入库）；÷1000 自动换算属 P3 价格同步引擎，不在本用例断言范围；PRD AC-06 已改口径 | TC-P0-118 | ✅ 已定稿（v1.1 修订） |
| 3 | **`cache_write_price_source` 落库形态**：metadata 还是快照列旁路 | PRD §5.5 / D-4：引擎内部字段，P0 落库侧写入即可（metadata 或旁路），P2 前端透出 | TC-P0-091/092/074 | 仅记录：属实现细节，arch/backend 决定即可，无需业务确认 |
| 4 | **Q3 · 写入价 > 输入价边界**：cache_write_input_price > input_price 时 discountAmount 可能为负 | **已裁定（选 b）**：允许写入价 > 输入价、不设上限校验、按实际值计费；cache_discount 可为负（负 = 缓存写入溢价，前端"节省"按正负语义展示）；PRD 已补修订（§5.4/§7.3/§7.5/§8 AC-19/§9.2） | TC-P0-119 | ✅ 已定稿（v1.1 修订） |
| 5 | **discount_rate 模式下审计列归零口径**：computeUsageCost 返回 cacheWriteTokens=0/cacheHitCost=0（与旧版一致优先） | 任务书 T4 已锁定该口径；实际落库 audit 列在 discount_rate 模式下不体现上游 creation tokens | TC-P0-067 | 仅记录：无需确认（任务书已裁决）；如审计侧要求完整留痕，建议 P2 评估 |

---

## 5. 风险与边界用例说明

| # | 风险/边界点 | 关联决议/评审 | 关联用例 | 说明 |
|---|------------|--------------|---------|------|
| 1 | 价格列 varchar vs numeric 混合（D-12 不迁移） | D-12 / 评审§6.2 | TC-P0-049 / TC-P0-117 | 既有 input_price/output_price varchar(30)、cache_discount_rate varchar(10) 不迁移；回退链跨类型，Number() 入口统一 |
| 2 | 分区表唯一约束含 created_at | 评审§6.1 | TC-P0-004 / TC-P0-116 | RANGE 分区 + 复合主键/唯一约束含 created_at；ALTER 加列不得破坏分区结构与约束 |
| 3 | 写入价缺失标注透出（D-4） | D-4 | TC-P0-042/043/074/091 | full_price/explicit 来源标识 P0 落库侧写入，P2 前端透出 |
| 4 | read 优先收敛（D-11） | D-11 | TC-P0-025/061/062 | 归一化层与计费层双保险同规则；write = max(prompt−read, 0) |
| 5 | 精度 8 位（D-1） | D-1 | TC-P0-065/066 | toFixed(8) 与现有 cost/cache_discount 列一致；无 6/4 位舍入层；批量每笔计算后汇总 |
| 6 | 流式 usage 三提取点 | 评审§6.4 | TC-P0-027~030 | proxy（流式/非流式）、translate.extractOpenAIChunk、responses-stream.lastValidUsage 统一经 parseCacheTokens；toResponsesUsage cached_tokens 为 P2 透传勿混淆 |
| 7 | R-B3 双调用点 / rerank 补全 | R-B3 / 评审§6.3 | TC-P0-085/086 | openai-compat 流式/非流式两分支、rerank 缺 prompt_tokens 补全——漏改一个即计费口径不一致 |
| 8 | include_usage 渠道级开关（R-B4） | D-9 / R-B4 | TC-P0-089/090 | 注入集中 buildUpstreamBody 单点 + STREAM_INCLUDE_USAGE_ENABLED 常量快速关闭 |
| 9 | A9 流式计费时序与回滚 | D-9 / R-B2 | TC-P0-070~073/094 | 末帧 usage 结算；fallback 全价；无响应回滚全额；预扣不含缓存价（方向安全） |
| 10 | 幂等摘要不扩缓存字段 | 评审§6.5 | TC-P0-096 | 回放不重复计费；缓存字段仅审计用途，最小改动正确 |
| 11 | 写入价 > 输入价（discount 为负） | Q3 已裁定 | TC-P0-119 | 允许、不设上限校验、按实际值计费；cache_discount 可为负（负 = 缓存写入溢价，前端按正负语义展示）；PRD 已补修订（§5.4/§7.3/§7.5/§8 AC-19/§9.2） |
| 12 | /1M 旧单位文档债务 | 评审§6.2 | TC-P0-118 | ref-5.2 L527 时序图 /1,000,000 旧单位（代码为 /1000 ¥/1K），本期不改代码 |
| 13 | 预扣方向安全 | 评审§6.5 | TC-P0-073 | 预扣仍按全价估算，缓存价只影响多退少补，不会少扣 |
| 14 | OpenAI 兼容端点 usage 扩展不破坏 | PRD §7.7 / AC-29 | TC-P0-084 | 原结构 + 扩展字段，只增不破坏 |

---

## 6. 覆盖率统计与映射矩阵

### 6.1 AC-01~39 覆盖矩阵（PRD §8）

| AC | 主题 | P0 覆盖 | 关联用例 | 状态 |
|----|------|:-------:|---------|------|
| AC-01 | DeepSeek 归一化 | ✅ | TC-P0-020 | P0 覆盖 |
| AC-02 | Anthropic 归一化（含 creation→write） | ✅ | TC-P0-021/022/083/087 | P0 覆盖 |
| AC-03 | OpenAI cached_tokens | ✅ | TC-P0-023/084 | P0 覆盖 |
| AC-04 | 无缓存字段退化全价 | ✅ | TC-P0-024/068/093 | P0 覆盖 |
| AC-05 | read 优先收敛（D-11） | ✅ | TC-P0-025/061/062 | P0 覆盖 |
| AC-06 | /1M→/1K 归一化 | ◑ | TC-P0-118 | 部分覆盖（P0 仅存储口径契约 ¥/1K 核对；÷1000 自动换算属 P3 同步引擎，Q2 已裁定） |
| AC-07 | 显式价公式 | ✅ | TC-P0-060/082 | P0 覆盖 |
| AC-08 | 价格解析逐级回退 | ✅ | TC-P0-040 | P0 覆盖 |
| AC-09 | 写入价缺失全价 + 可辨识 | ✅ | TC-P0-042/063/091 | P0 覆盖 |
| AC-10 | discount_rate 与旧版一致 | ✅ | TC-P0-031/044/067/113 | P0 覆盖 |
| AC-11 | 存量无显式价行为不变 | ✅ | TC-P0-045/111 | P0 覆盖 |
| AC-12 | 精度规则 | ✅ | TC-P0-065/066 | P0 覆盖 |
| AC-13 | 定价快照列落库 | ✅ | TC-P0-003/091 | P0 覆盖 |
| AC-14 | 流式 include_usage 缓存计费 | ✅ | TC-P0-089/094 | P0 覆盖 |
| AC-15 | 模式切换即时生效 | ✅ | TC-P0-010/011/012/112 | P0 覆盖 |
| AC-16 | /me/models/:id/price 缓存价字段 | — | — | P1 后续阶段 |
| AC-17 | /me/models 列表缓存价 | — | — | P1 后续阶段 |
| AC-18 | /public/models 公开价目 | ◑ | TC-P0-105 | 数据侧就绪（P0）；匿名访问/页面展示 P1 |
| AC-19 | 管理端缓存价 CRUD 校验 | ✅ | TC-P0-100~104 | API 侧 P0 覆盖；页面侧 P1 |
| AC-20 | 供应商成本页录入 | ◑ | TC-P0-001（schema） | API 侧数据就绪（P0）；UI P1 |
| AC-21 | ModelCard 缓存价展示 | — | — | P1 后续阶段 |
| AC-22 | PriceDetailModal 缓存计费区块 | — | — | P1 后续阶段 |
| AC-23~24 | 调用日志缓存列/详情 | — | — | P2 后续阶段 |
| AC-25~26 | 用量统计构成/节省 | — | — | P2 后续阶段 |
| AC-27~28 | 账单 by_model/CSV 缓存列 | — | — | P2 后续阶段 |
| AC-29 | 响应 usage 透传 + 兼容 | ◑ | TC-P0-084 | P0 兼容性回归覆盖；透传扩展字段 P2 |
| AC-30 | Playground/详情节省提示 | — | — | P2 后续阶段 |
| AC-31~34 | 结算拆分/对账/争议 | — | — | P3 后续阶段（D-2 符号语义 P3 评审） |
| AC-35~37 | 帮助中心/[?] 合规 | — | — | P1 后续阶段（P0 无前端页面改动） |
| AC-38 | 存量兼容 + discount_rate 回退 | ✅ | TC-P0-111/113/114 | P0 覆盖 |
| AC-39 | 缓存价变更通知 | ◑ | TC-P0-106 | P0 回归保障"不误触发"；通知面 P1 |

### 6.2 T1~T7 覆盖矩阵（任务书 v2.0）

| 子任务 | 任务书测试要求（约 53 case） | 本用例集 | 覆盖率 |
|--------|------------------------------|---------|:------:|
| T1 数据模型迁移+全局配置面（~6） | cache_pricing_mode PUT 校验/GET 默认、seed 幂等、getCachePricingMode 回退、既有折扣率回归 | TC-P0-001~014（14 条） | 100%（含迁移核对与红线扩展） |
| T2 usage 归一化（~12） | 三家归一化（含 creation→write）、收敛、流式透传、2 断言更新 + discount_rate 对照 | TC-P0-020~031（12 条） | 100% |
| T3 价格解析（~10） | 4 级优先级、写入价缺失全价+来源标识、discount_rate 一致、生效 input、pricing 贯通 | TC-P0-040~050（11 条） | 100% |
| T4 计费引擎（~10） | 显式价公式、命中>输入收敛、写入缺失全价、回退、discount_rate 一致、无缓存退化、8 位精度、A9 回滚、来源标识 | TC-P0-060~074（15 条） | 100% |
| T5 路由+落库（~10） | recordConsumption 5 新列+metadata、SettleOptions 透传、6 路由非流式/流式+回归、rerank 补全、双调用点、开关回归 | TC-P0-080~096（17 条） | 100% |
| T6 管理端 CRUD（~5） | CRUD 校验 ≥0/清空、列表/公开接口新字段、price_change 不误触发 | TC-P0-100~108（9 条） | 100% |
| T7 全量回归 | 808 基线 0 破坏（唯一例外 T2 2 断言）+ 新增全绿 + typecheck/lint | TC-P0-110~119（10 条） | 100%（含边界扩展） |

### 6.3 统计汇总

| 分组 | 覆盖内容 | 用例数 | 占比 |
|------|---------|:------:|:----:|
| A | 数据模型与迁移 + 全局配置面（T1） | 14 | 15.9% |
| B | usage 归一化（T2） | 12 | 13.6% |
| C | 价格解析（T3） | 11 | 12.5% |
| D | 计费引擎（T4） | 15 | 17.0% |
| E | 路由与落库（T5） | 17 | 19.3% |
| F | 管理端 CRUD（T6） | 9 | 10.2% |
| G | 兼容回归与边界（T7） | 10 | 11.4% |
| **合计** | **TC-P0-001 ~ TC-P0-119** | **88** | **100%** |

优先级分布：P0 = 70 条、P1 = 15 条、P2 = 3 条。
执行时机分布：单测阶段（T1~T6 各自 grep）= 71 条；集成验收阶段（T7 后）= 17 条。

> 注：P0 范围内 AC（AC-01~15、AC-19 API 侧、AC-18/20 数据侧、AC-38、AC-06/29 部分）全部有对应用例；其余 AC 为 P1/P2/P3 后续阶段功能，本次不列入，执行口径与覆盖时间由调度-agent 排期。
