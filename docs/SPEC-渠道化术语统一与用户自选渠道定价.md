# SPEC — 渠道化术语统一 + 用户自选渠道与渠道价目公布

> **⚠️ 部分废弃（2026-09）**："用户自选渠道 / `model@vendor` / 渠道选择器"部分已被 [`SPEC-模型编码化改造与去除用户供应商选择.md`](SPEC-模型编码化改造与去除用户供应商选择.md) 取代 —— 权威口径改为全局唯一**模型编码**，**纯编码、无自动、无兼容窗口**，用户侧不再出现独立的"供应商/渠道"选择维度。本文档中"渠道化**术语统一**"部分仍有效；自选渠道相关章节仅作历史留档。

> **文档类型**：实现规格（产品定稿后由架构/后端据此实现）
> **版本**：v0.9（评审稿）
> **上游**：`docs/PRD-渠道化术语统一与用户自选渠道定价.md`
> **状态**：~~待评审~~ → **术语统一部分有效 / 自选渠道部分已废止** → 评审通过后按 `kb/3cloud/spawn-protocol.md` 派发 backend / front / product / test
> **基础约束**：遵循 `AGENTS.md` —— 每个功能页面标题旁与每个操作按钮旁必须有 `[?]` 帮助说明。

---

## 〇、评审已确认决策

| 编号 | 决策 |
|------|------|
| D1 | 渠道 = 渠道（有结算体系的业务实体）|
| D2 | 只改中文文案 / UI / 文档；不改 DB 表名/字段名/代码标识符 |
| D3 | 未选渠道 → 自动智能路由（默认）|
| D4 | (模型 × 渠道) 唯一标识 = `model@channelCode`（channelCode = `suppliers.code`）|
| D5 | 用户侧透出**按用户分组的生效价**（避免展示价≠扣费价）|
| D6 | 前端形态：**独立"渠道选择"页面** + **模型中心"价格矩阵"** |

---

## 一、实现前置事实（已核对）

- 分组生效价核心逻辑已存在：`getPricingForModel(model, ctx)` 六层解析（L5→L1），其中 **L4 分组价**（`user_group_memberships → user_groups.pricingGroup → vendor_pricing.pricing_group`），价格组允许多个（`pricing_group` varchar 非唯一）。
- `supplier_models` 天然支持"一个模型名 × 多个渠道"多条记录（无唯一约束），数据层无需改造即可表达多渠道。
- 路由层 `selectChannel(model, {userId})` 已支持多渠道候选 + 分组供给（`allowedGroups`）+ 多 Key + 熔断，**仅缺"按指定渠道锁定"入口**。
- `/me/models` 现返回硬编码 `DEFAULT_MODELS`（单价格）；`VendorSelectorPage.tsx` 为硬编码 mock 且未挂路由。
- 关键改造点：现有 `getPricingForModel` 把多方价格**合并解析到模型级**，分不清"每个渠道各自的价格"；用户侧渠道价目需要**按 (渠道 × 模型) × 用户分组** 逐渠道取价。

---

## 二、术语统一实现

生效范围：后台管理端、用户端、渠道自助端、营销站、`kb/3cloud/*` 与 `docs/*` 中文文案。

| 层 | 改 | 不改（D2） |
|----|----|-----------|
| 展示文案 | "渠道/渠道" → "渠道"；"渠道密钥/定价/门户/结算/上传Key/分组" → 渠道对应词 | — |
| 接口路径 | — | `/admin/suppliers`、`/me/*` 等 |
| 前端组件名/路由 | 新建"渠道选择主页"（见 §4）| `AdminSupplier*`、`Vendor*`、`VendorSelectorPage.tsx` 文件名保留（内部文案改）|
| 后端表/字段/类型 | — | `suppliers`、`supplier_id`、`supplier_models`、`vendor_pricing`、`Supplier` 等 |
| 文档 | 全库中文称谓替换 + 落地 `docs/术语对照表.md` | — |

> 术语对照表以 PRD §2 为准，Spec 不再重复（引用即用）。
> 实现时在 `docs/` 生成独立 `术语对照表.md`，供所有 Agent 引用。

---

## 三、渠道价目 API（P0）

### 3.0 分渠道取价（新增核心函数 —— 本次关键改造）
现有 `getPricingForModel` 合并到模型级，**不满足**"每渠道各自售价"。新增：

- 内部函数 `getChannelPricing(model: string, channelCode: string, ctx?: PricingContext)`：
  - 按 `suppliers.code = channelCode` 定位渠道 → 该渠道 `supplier_models` 中匹配 `model_name` 的记录 → 该记录的 `router_pricing`（`vendor_pricing`，按 `ctx.pricingGroup` = 用户分组生效的 `pricing_group` 取价；取不到再回退 `pricing_group='default'`）。
  - 返回 `{ input, output, cacheRead, cacheWrite, pricingGroup }`（**用户侧可见售价**，绝不含 `cost_*`）。
- `getModelChannels(model, { userId })`：列出提供该模型且服务调用方分组的渠道，逐渠道调 `getChannelPricing`，输出渠道价目数组（含健康/延迟，来自 `suppliers.health_status` 与统计）。

> L4 分组价逻辑复用 `pricing.ts` 现有的分组解析（`user_group_memberships → user_groups.pricingGroup`），仅把"模型级合并"改为"渠道级"。

### 3.1 `GET /api/v1/me/models`（升级：按渠道展开）
> 默认返回当前用户可见模型列表，每模型含 `channels[]` 渠道价格数组。Response：

```json
{
  "id": 1,
  "model": "deepseek-chat",
  "context": 128000,
  "channels": [
    {
      "channel_code": "vendor_a",
      "channel_name": "渠道A",
      "status": "available",
      "prices": { "input_price": "0.002000", "output_price": "0.008000", "cache_read_input_price": "0.000500", "cache_write_input_price": null },
      "pricing_group": "default",
      "health": 99,
      "latency_ms": 180,
      "recommended": true,
      "credit": "AAA"
    }
  ]
}
```
- 数据源：`supplier_models` × `vendor_pricing`（当前用户分组生效价）+ `suppliers`（状态/健康）。
- **兼容策略**：DB 返回渠道数据为空时兜底 `DEFAULT_MODELS`（保留现场行为，防回归）。DEFAULT_MODELS 中价格仍为单值，前端按"该模型仅一个渠道等价价"渲染。
- 现状 `/me/models` 的平铺字段（inputPrice/outputPrice）保留为"最低价"兼容（供 Playground 下拉不变）；新增 `channels[]`。

### 3.2 `GET /api/v1/models/:modelName/channels`（渠道价目矩阵）
> 返回指定模型下所有可用渠道及各自售价。Response：

```json
{
  "model": "glm-5.2",
  "channels": [
    {
      "channel_code": "vendor_a",
      "channel_name": "渠道A",
      "input_price": "0.000600",
      "output_price": "0.002000",
      "cache_read_input_price": null,
      "cache_write_input_price": null,
      "pricing_group": "default",
      "status": "available",
      "health": 99,
      "latency_ms": 150,
      "recommended": true,
      "credit": "AAA",
      "maintenance": false
    },
    {
      "channel_code": "vendor_b",
      "channel_name": "渠道B",
      "input_price": "0.000500",
      "output_price": "0.001800",
      "cache_read_input_price": null,
      "cache_write_input_price": null,
      "pricing_group": "default",
      "status": "available",
      "health": 97,
      "latency_ms": 210,
      "recommended": false,
      "credit": "AA",
      "maintenance": false
    }
  ]
}
```
- 需鉴权（jwtAuth），按当前用户分组解析生效价与可见渠道。
- `supplier_models` 无该模型 → 返回 `{ model, channels: [] }`。

### 3.3 路由层渠道锁定（内部解析，供 chat / completions / responses / messages / embeddings 接入）
新增 `parseModelVendor(model: string): { model: string; channelCode: string | null }`：
```
无 '@'            → channelCode = null（自动路由）
含 '@' 且其后非空 → 拆出 channelCode
```
在 `selectChannel`（及任务型 `selectTaskChannel`）增加入参 `channelCode?`：
- 传了 channelCode：先按 code 精确定位该渠道，校验 `status='active'`、`allowedGroups` 服务调用方分组、该渠道 `supplier_models` 提供该 model → 锁定该渠道选 Key；任一不成立抛下游错误码。
- 未传：保持现有自动路由逻辑不变。

错误码（沿用 infra 错误基类）：
| code | HTTP | 含义 | payload |
|------|------|------|---------|
| `CHANNEL_NOT_FOUND` | 404 | 渠道 code 不存在 | — |
| `MODEL_NOT_ON_CHANNEL` | 400 | 该渠道不提供该模型 | 可选渠道列表 |
| `CHANNEL_UNAVAILABLE` | 400 | 渠道维护/下线/不服务当前分组 | 可选渠道列表 |
| `GROUP_FORBIDDEN` | 403 | 渠道被分组供给排除 | — |

> 后端接入列表：`chat.ts`、`openai-compat.ts`、`responses.ts`、`messages.ts`、`rerank.ts`、`anthropic.ts`、`task-relay.ts`。P0 至少接入 `chat.ts` + `openai-compat.ts`（chat/completions 主链）；其余同批扩展。

---

## 四、前端实现（P0）

### 4.1 独立"渠道选择"页面
- **路由**：用户端新增 `/me/channels`（全站 demo 也保留 `/vendor-selector` 别名并接真实数据）。
- **页面结构**（对齐 `portal-vendor-selector.md` 既有原型）：
  - 页头：`🔑 渠道选择 [?]`
  - 模型下拉 → 选中后加载该模型渠道列表（`GET /models/:name/channels`）
  - 渠道卡片（选一）：渠道名+信用评级/⭐推荐/🔧维护、输入/输出/缓存价、健康分、延迟、状态
  - "自动路由"单选（默认选中）；点选某渠道切手动
  - 调用预览：`model@auto` / `model@channelCode` + 价格展示
  - `发起调用 [?]`（本次试用）；`保存为默认 [?]`（P1 本期禁用或隐藏）
- **数据绑定**：淘汰硬编码 `MODEL_VENDORS` mock，改接 `GET /me/models`（模型列表）+ `GET /models/:name/channels`（渠道价目）。

### 4.2 模型中心"价格矩阵"
- **承载**：用户端模型中心页（现 `ref-2.2.2-model-center.md` 定义）价格区。
- **形态**：模型卡片价格区点击 → 弹出"渠道价目矩阵"（`GET /models/:name/channels`），列为渠道，行为输入/输出/缓存/健康/延迟/状态，供用户比价；矩阵内渠道行可点击选择。
- **数据绑定**：`/me/models`（模型列表）+ `/models/:name/channels`（矩阵）。

### 4.3 术语切换
- 渠道选择主页、模型中心、后台渠道管理/价目/成本/结算页、渠道自助端、营销站：中文"渠道/渠道"全部改"渠道"。
- 所有新增/改动操作按钮与页面标题补 `[?]` 帮助（文案用"渠道"语义）。

### 4.4 Playground 兼容
- 模型输入框（`ModelInput.tsx`）在 `@` 触发时提供渠道联想（数据来自 `/models/:name/channels`），支持直接输入 `model@channelCode`。
- `/me/models` 平铺字段改动不破坏现有 Playground 下拉。

---

## 五、后台与数据（P0）

- 渠道管理页文案切换为"渠道"；保留 CRUD/连通性/余额/同步/批量状态。
- 渠道价目页可配置"每渠道每模型"售价（沿用 `suppliers.ts` 现有 `vendor_pricing` 写入），用户侧透出逻辑见 §3.0。
- 数据唯一性：确认 `supplier_models` 以 `(supplier_id, model_name)` 可唯一定位渠道-模型映射；同模型多 `pricing_group` 时按用户分组取一条（§3.0 已定义回退）。

---

## 六、P1 增强（本期不做）
1. 保存默认渠道偏好（`user_vendor_selections`）。
2. 渠道价格变更通知强化。
3. 渠道选择器高级筛选。

---

## 七、验收标准（Gate）

| Gate | 条件 |
|------|------|
| G1 | 后端：`getChannelPricing` + `/me/models` 按渠道 + `/models/:name/channels` + `parseModelVendor` 路由锁定（chat/completions）；单测全绿；`tsc --noEmit` 0 错误 |
| G2 | 前端：`/me/channels` 独立页 + 模型中心价格矩阵接入真实 API；`/me/models` 平铺兼容；术语切换完成；`[?]` 抽查通过 |
| G3 | 文档：全库中文称谓改"渠道" + `docs/术语对照表.md` 落地 |
| G4 | 端到端：不选自动路由 / 选渠道锁定 / 渠道下架回退 / 多渠道比价 / 分组生效价 / DB 空时回退 DEFAULT_MODELS 全部通过 |

---

## 八、测试要点（交付 test-agent）
- 分组生效价：VIP/默认组对同一模型同渠道返回不同生效价。
- 渠道锁定：`model@code` 命中；code 不存在 404；渠道不下发该模型 400+渠道列表；渠道被分组排除 403。
- 自动路由：不带 `@` 行为与现状一致。
- 下架回退：已选渠道下线 → 自动路由并提示。
- `/me/models` 兼容：DB 空回退 DEFAULT_MODELS。
- `[?]` 帮助：新增页面/按钮帮助齐全。

---

## 九、交叉引用
- `docs/PRD-渠道化术语统一与用户自选渠道定价.md`（PRD）
- `docs/user-vendor-selection.md`、`docs/portal-vendor-selector.md`
- `api/src/services/billing/pricing.ts`（L4 分组价复用）
- `api/src/services/upstream/routing.ts`（渠道锁定切口）
- `api/src/routes/me.ts`（/me/models 升级）
- `web-console/src/pages/VendorSelectorPage.tsx`（改为真实数据）
- `docs/PRODUCT-DESIGN-PRINCIPLES.md`（`[?]` 帮助要求）

---

> 下一步：提交架构评审（数据层/API/路由锁定）→ 依 `spawn-protocol.md` 派发 backend / front / product / test。