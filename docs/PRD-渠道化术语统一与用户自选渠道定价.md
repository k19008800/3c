# PRD — 渠道化术语统一 + 用户自选渠道与渠道价目公布

> **文档类型**：PRD（初审稿）
> **版本**：v0.9（评审稿）
> **日期**：2026-08
> **状态**：待评审 → 评审通过后交付 arch-agent 评审 + backend/front/product 分派
> **需求来源**：用户需求（渠道/渠道术语统一 + 用户自选渠道 + 渠道价目公布）
> **基础约束**：遵循 `AGENTS.md` —— 每个功能页面标题旁与每个操作按钮旁必须有 `[?]` 帮助说明。

---

## 0. 需求来源与既定决策

| 编号 | 决策 | 结论 |
|------|------|------|
| D1 | 渠道与渠道关系 | **渠道 = 渠道**（有结算体系的业务实体）；后台见"渠道"即理解为上游渠道 |
| D2 | 术语表口径 | **只改中文文案 / UI / 文档**；**不改** DB 表名/字段名/代码标识符 |
| D3 | 用户自选默认策略 | 未选渠道 → **自动智能路由**（按健康度/价格/延迟选最优）|
| D4 | 模型×渠道唯一标识 | `model@channelCode`（channelCode = `suppliers.code`）|

### 0.1 现状核对（评审前已确认的事实）
- `model@channel` 语法**尚未在后端实现**（api 无解析逻辑）。
- `VendorSelectorPage.tsx` 为**硬编码 mock + 未挂路由**，后端 `/vendors/by-model` 缺失。
- `/me/models` 返回硬编码 `DEFAULT_MODELS`（单一价格、单一 provider 品牌），**无按渠道多价格**。
- 路由层 `selectChannel(model, {userId})` 已具备分组供给（`allowedGroups`）、多 Key 选择、熔断跳过，**仅差"按指定渠道锁定"入口**。

---

## 一、目标与非目标

### 1.1 目标
1. 全平台（后台 UI、用户端、渠道自助端、营销站、文档）中文口径统一为"**渠道**"。
2. 用户可自主选择"同一模型的多个渠道"，并可对比各渠道价目。
3. 平台**公布每个渠道对每个模型的售价**（输入/输出、缓存读/写），同一模型不同渠道可不同价。

### 1.2 非目标（明确不做）
- **不改** `suppliers` / `supplier_keys` / `supplier_models` / `vendor_pricing` 等表名、字段名、接口路径、组件名、类型名（D2）。
- 本期**不做**"保存默认渠道偏好"（放入 P1 增强，见 §7）。
- 不做渠道价格变更通知流程再造（沿用现有 `price-change-logs` 通知机制）。

---

## 二、术语对照表（全局统一口径）

> 用途：所有 PRD/Spec/UI/文档/运营手册引用此表，杜绝"供应商/厂商/Vendor/渠道"混用。

| 新统一中文 | 旧称谓（不再使用） | 底层标识（**不改**） | 说明 |
|-----------|------------------|--------------------|------|
| **渠道** | 供应商 / 厂商 / Supplier / Vendor | `suppliers`（表名）| 上游提供 token/模型的业务实体，含登录、Key 管理、结算体系 |
| 渠道密钥 / 渠道 Key | 供应商密钥 / 供应商 Key | `supplier_keys` | 渠道凭据，支持单 Key/轮询/随机 |
| 渠道模型 / 渠道-模型映射 | 供应商模型 | `supplier_models` | 某渠道提供的某模型 |
| 渠道售价 / 渠道价目 | 供应商定价 / 供应商价目 | `vendor_pricing` | 渠道对模型的售价（input/output、缓存读/写）|
| 渠道成本价 | 供应商成本 | `supplier_models.cost_*` | 内部采购成本，**绝不对用户展示** |
| 渠道中心 / 渠道门户 | 供应商门户 | Vendor* 页面 | 渠道侧登录、Key 管理、数据统计 |
| 渠道结算 | 供应商结算 | `vendor-settlements` | 渠道侧的结算对账 |
| 渠道自助上传 Key | 供应商上传 Key | `/admin/suppliers/:id/keys` | 批量导入/审核连通性 |
| 渠道分组供给 | 供应商分组 / 渠道分组 | `suppliers.allowed_groups` | 渠道可服务哪些用户分组 |

### 2.1 术语替换生效范围
- **后台管理端**：菜单、面包屑、表格表头、空态文案、`[?]`帮助文案中的"供应商/厂商" → "渠道"。
- **用户端**：模型中心筛选、价格明细弹窗、"供应商"品牌字段展示 → "渠道"。
- **渠道自助端**：`Vendor*` 页面标题/文案 → "渠道中心 / 渠道结算"。
- **营销站**（web-portal）：`/models`、`/pricing` 中品牌/供应商描述 → 统一为"渠道"。
- **文档**：`kb/3cloud/*`、`docs/*` 中文称谓统一替换，并在 `docs/` 维护本术语表。

### 2.2 明确不改的标识符清单（D2 红线）
`suppliers`、`supplier_keys`、`supplier_models`、`vendor_pricing`、`supplier_id`、`model_name`、接口路径 `/admin/suppliers`、组件 `AdminSupplier*`、类型 `Supplier`、变量 `supplierId` 等**一律保留**。仅对外展示层与文档做中文化。

---

## 三、功能范围总览

| 模块 | P0（本期） | P1（增强） |
|------|-----------|-----------|
| 术语统一 | 后台+用户端+渠道端+营销站+文档中文替换 | — |
| 渠道价目数据 | `supplier_models`×`vendor_pricing` 按渠道展开，用户侧透出生效价 | 价格变更通知强化 |
| 用户自选 | `model@channelCode` 解析 + 渠道锁定 + 自动路由兜底 | 保存默认渠道偏好 |
| 前端 | 模型中心价格矩阵 + 渠道选择器接入真实 API | 渠道选择器高级筛选 |

---

## 四、用户自选渠道交互（P0）

### 4.1 交互状态机
```
[初始] 选模型 ──→ [自动路由态（默认）]
                        │
                        ├─ 用户点选某渠道 ──→ [手动渠道态] model@channelCode
                        │                          │
                        │                          └─ 点击"自动路由" ──→ 回自动路由态
                        └─（无操作）→ 调用 model 不带 @ → 自动路由
```
状态说明：
| 状态 | 调用 model 值 | 价格展示 |
|------|--------------|---------|
| 自动路由态 | `model`（不带 `@` ）| 各渠道价格区间（最低~最高）|
| 手动渠道态 | `model@channelCode` | 该渠道精确售价 |

### 4.2 渠道选择器（模型中心 / 调用入口）
每张渠道卡片展示（数据来自渠道价目端点）：
- 渠道名 + 信用评级 Badge（AAA/AA/A）
- ⭐推荐标签（悬停显示理由）
- 🔧维护中标签（维护中渠道禁用）
- 输入价格 / 输出价格（¥/1K 或 ¥/1M tokens，按用户分组生效价）
- 缓存读/写价（如有）
- 健康分（绿/黄/红） + 平均延迟

排序规则：推荐置顶 → 输入价升序 → 信用降序。

### 4.3 调用预览
- 自动路由态：`model@auto` + "系统智能路由"。
- 手动渠道态：`model@channelCode`（等宽字体标签）+ 该渠道名 + 精确价格。
- 按钮：`▶ 发起调用 [?]`（本次试用）；`⭐ 保存为默认 [?]`（P1；本期展示但不启用，或在管理端关闭）。

### 4.4 交互细节与边界
| 场景 | 行为 |
|------|------|
| 模型无可用渠道 | 面板显示"该模型暂无可用渠道"，隐藏渠道卡片 |
| 渠道数据加载失败 | 面板内错误提示 + 重试按钮 |
| 全部渠道维护中 | 自动路由不可用提示，仅展示维护中渠道（灰态）|
| 已选渠道下架/维护 | 该渠道禁用；已选则回退自动路由并提示 |
| 渠道不提供所选模型 | 返回错误 + 可选渠道列表（含价格）|

---

## 五、渠道价目公布与 API（P0）

### 5.1 数据口径
- **售价来源**：`vendor_pricing`（input_price / output_price / cache_read_input_price / cache_write_input_price）。
- **生效维度**：对当前用户按其**用户分组**解析生效价与可见渠道（`allowedGroups` ∩ 用户分组 + `pricing_group`），返回的是**用户实际会扣费的价格**，避免"展示价≠扣费价"资费争议。
- **成本价隔离**：`supplier_models.cost_*` 等内部成本字段**不进入任何用户侧响应**。

### 5.2 接口设计

#### A. `GET /api/v1/me/models`（升级：按渠道展开）
> 现状返回扁平单价格，升级后每个模型项含 `channels: [...]` 渠道价格数组。

```json
{
  "model": "deepseek-chat",
  "context": 128000,
  "channels": [
    {
      "channel_code": "vendor_a",
      "channel_name": "渠道A",
      "status": "available",
      "closed_group_visible": false,
      "prices": {
        "input_price": "0.002000",
        "output_price": "0.008000",
        "cache_read_input_price": "0.000500"
      },
      "health": 99,
      "latency_ms": 180,
      "recommended": true,
      "credit": "AAA"
    }
  ]
}
```

#### B. `GET /api/v1/models/:modelName/channels`
> 返回指定模型下所有可用渠道及各自售价（渠道价目矩阵），供模型中心/渠道选择器渲染。

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
> 兼容：本端点 P0 交付；`/me/models` 升级为按渠道展开后，`DEFAULT_MODELS` 保留为**兜底**（DB 为空时回退），避免回归。

#### C. 路由层锁定解析（内部，供 chat/completions/responses 等接入）
`parseModelVendor(model)`：
```
无 '@'      → 自动路由（selectChannel 现有逻辑）
有 '@' 拆出 code
  ├─ code 存在且 active ∧ 提供该 model（supplier_models 匹配）∧ 服务调用方分组
  │     → 锁定渠道，选该渠道 Key，返回可路由组合
  └─ 任一不成立 → 4xx + 错误码 ERR_CHANNEL_UNAVAILABLE + 可选渠道列表（含价格）
```

### 5.3 错误码
| 错误码 | HTTP | 含义 | 附加 payload |
|--------|------|------|-------------|
| `CHANNEL_NOT_FOUND` | 404 | 渠道 code 不存在 | — |
| `MODEL_NOT_ON_CHANNEL` | 400 | 该渠道不提供该模型 | 可选渠道列表 |
| `CHANNEL_UNAVAILABLE` | 400 | 渠道维护/下线/不服务当前分组 | 可选渠道列表 |
| `GROUP_FORBIDDEN` | 403 | 渠道被分组供给排除 | — |

---

## 六、后台管理（P0 术语 + 数据校验）

- **渠道管理页**：菜单/文案改为"渠道"；保留现有 CRUD、连通性测试、余额查询、模型同步、批量状态。
- **渠道价目页**：设置各渠道对模型的售价 + 缓存价（语义保留）；文案统一"渠道售价"。
- **渠道成本管理页**：内部成本价（语义保留，仅渠道侧/财务可见）。
- **数据唯一性校验（P0 数据支撑）**：确认 `supplier_models` 支持 `(supplier_id, model_name)` 唯一解析到一条渠道-模型映射；若存在一渠道同模型多 pricing_group，取当前用户分组生效的一条。
- **[?] 帮助**：渠道相关页面/按钮帮助文案同步改为"渠道"语义。

---

## 七、P1 增强（本期不做，进入 backlog）
1. **保存默认渠道偏好**：`user_vendor_selections` 落库；用户在渠道选择器可保存某模型默认渠道，后续调用自动带 `@channelCode`。
2. **渠道价格变更通知强化**：基于现有 `price-change-logs` 推送用户侧价格变化提醒。
3. **渠道选择器高级筛选**：按价格范围/健康/延迟/品牌筛选。

---

## 八、验收标准（Gate）

| Gate | 条件 |
|------|------|
| G1 | 后端：`/me/models` 按渠道展开 + `/models/:name/channels` + `parseModelVendor` 路由锁定，单测全绿；`tsc --noEmit` 0 错误 |
| G2 | 前端：模型中心价格矩阵 + 渠道选择器接入真实 API 并挂路由；后台/用户端关键页术语切换完成；`[?]`帮助抽查通过 |
| G3 | 文档：全库中文称谓改"渠道" + 术语对照表落地 |
| G4 | 端到端：不选自动路由 / 选渠道锁定 / 渠道下架回退 / 多渠道比价 / 分组生效价 全部通过 |

---

## 九、涉众
- **终端用户**：自主比价、选渠道、或依赖自动路由。
- **平台运营/管理员**：管理渠道、配价、查看用户渠道选择分布（P1）。
- **渠道（渠道）**：首次体验为称谓统一；新能力是"被用户自选 + 价目公布"（不改变其 Key 管理与结算）。

---

## 十、交叉引用
- `docs/user-vendor-selection.md`（model@vendor 既有设计）
- `docs/portal-vendor-selector.md`（渠道选择器 PRD 原型）
- `kb/3cloud/newapi-gap-analysis.md`（渠道语义对齐）
- `kb/3cloud/newapi-migration-guide.md`（路由/channel_select 搬迁）
- `docs/PRODUCT-DESIGN-PRINCIPLES.md`（`[?]` 帮助要求）

---

> 下一评审步骤：本 PRD 提交评审 → 通过后由 product-agent 固化为 Spec、arch-agent 评审数据层与 API、再按 spawn-protocol 派发 backend/front/测试。