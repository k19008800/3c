# PRD：用户自选厂商功能

> **文档编号**：PRD-USER-VENDOR-SELECTION  
> **版本**：v1.0  
> **日期**：2026-08-06  
> **状态**：待评审  
> **关联模块**：供应商管理 `ref-4.3` · 智能路由 `ref-5.1` · 计费引擎 `ref-5.2` · 用户仪表盘 `ref-2.2`

---

## 0. 概述

### 0.1 背景

3Cloud 平台当前的路由策略由系统自动选择供应商（weighted_random / lowest_price 等）。部分用户对成本、延迟、品牌有偏好，希望**自行选择**同一模型背后的不同供应商，以获得更优性价比或更符合业务需求的服务。

### 0.2 核心场景

```
用户调用 GLM-5.2
  → 系统检测到该模型有多个可用供应商（厂商A / 厂商B / 厂商C）
  → 返回可选供应商列表（含价格、品牌、推荐标签、健康状态）
  → 用户选择厂商B（价格最低）
  → 系统拼接 model@vendor 发起调用：glm-5.2@vendor_b
  → 后端解析 @ 拆分，路由到厂商B
  → 计费按厂商B的售价结算
```

### 0.3 设计目标

| 目标 | 说明 |
|------|------|
| 用户自主选择 | 用户能看到所有可用供应商及其价格，自行决策 |
| 价格透明 | 输入/输出单价清晰展示，支持对比 |
| 无感兼容 | 不选择时走现有自动路由，零迁移成本 |
| API 简洁 | `model@vendor` 格式，兼容 OpenAI SDK |

---

## 1. 厂商管理

### 1.1 厂商资料

厂商基础信息，面向用户展示。

| 字段 | 类型 | 说明 | 对外展示 |
|------|------|------|---------|
| id | serial PK | 内部 ID | 否 |
| name | varchar(100) | 厂商名称，如"智谱AI" | 是 |
| code | varchar(50) | 厂商编码，如 `vendor_a`，用于 `model@vendor` 拼接 | 否 |
| logoUrl | varchar(500) | 厂商 Logo URL | 是 |
| brandIntro | text | 品牌简介（一句话） | 是 |
| officialUrl | varchar(500) | 官网地址 | 是 |
| creditRating | varchar(10) | 信用评级：AAA / AA / A / BBB / BB / B | 是 |
| status | varchar(20) | 状态：`active` / `maintenance` / `offline` | 是（映射为可用/维护中/不可用） |
| displayOrder | integer | 展示排序权重，越大越靠前 | 是 |
| isRecommended | boolean | 推荐标记（平台背书） | 是 |

### 1.2 厂商状态

| 状态 | 值 | 用户可见性 | 说明 |
|------|---|-----------|------|
| 正常 | `active` | ✅ 可选 | 正常提供服务 |
| 维护中 | `maintenance` | ⚠️ 不可选 | 计划内维护，展示但置灰 |
| 下线 | `offline` | ❌ 不展示 | 已下线，不返回给用户 |

**状态变更传播**：厂商状态变更时，同步影响该厂商下所有 `vendor_models` 的可选性。若用户已选中某厂商后该厂商进入维护/下线，系统自动回退到自动路由并通知用户。

### 1.3 厂商资源实例（内部维护）

即现有 `vendor_api_keys` + `vendor_key_groups` 体系，**不对外展示**。内部维护每个厂商的 API Key 池、节点地址、轮换策略等。

| 资源 | 对应表 | 说明 |
|------|--------|------|
| API Key 池 | `vendor_api_keys` | 加密存储，轮换使用 |
| Key 分组 | `vendor_key_groups` | 按策略分组（round_robin / weight_random） |
| 分组内 Key | `vendor_key_group_items` | 具体 Key 实例，含独立定价 |
| 节点地址 | `vendors.baseUrl` | 厂商 API 端点 |

> 资源实例管理复用现有 `ref-4.3` 供应商管理模块，本 PRD 不重复定义。

---

## 2. 厂商定价管理

### 2.1 定价模型

**一条记录 = 一个模型 × 一个厂商**，对应现有 `vendor_models` 表的售价字段，新增用户可见的定价元数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | 记录 ID |
| vendorId | integer FK→vendors | 厂商 |
| modelId | integer FK→models | 模型 |
| sellPriceInput | numeric(18,6) | 输入售价（元/1M tokens） |
| sellPriceOutput | numeric(18,6) | 输出售价（元/1M tokens） |
| priceUnit | varchar(20) | 计价单位：`per_1m_tokens` / `per_1k_tokens` |
| effectiveAt | timestamp | 生效时间（支持定时调价） |
| expiredAt | timestamp | 失效时间（NULL=长期有效） |
| isRecommended | boolean | 推荐标记（性价比推荐） |
| displayOrder | integer | 展示排序 |
| priceVersion | integer | 价格版本号，每次调价递增 |

### 2.2 批量调价

| 操作 | 说明 |
|------|------|
| 按比例调整 | 选中多条记录，按百分比上调/下调 |
| 设固定价 | 选中多条记录，统一设置输入/输出价格 |
| 按厂商调价 | 选中某厂商下所有模型，统一调整 |
| 按模型调价 | 选中某模型下所有厂商，统一调整 |

**调价审批流程**（复用 `ref-4.3` §8.2）：

| 变更类型 | 审批 | 生效 |
|---------|------|------|
| 降价 | 运营审核自动通过 | 即时 |
| 涨价 ≤10% | 运营+财务 | T+7 |
| 涨价 10%-30% | 运营+财务+super_admin | T+14 |
| 涨价 >30% | super_admin+产品负责人 | T+30 |

### 2.3 排序与推荐标记

用户端厂商列表排序规则：

```
1. isRecommended = true 的厂商优先
2. 按 sellPriceInput 升序（价格低优先）
3. 按 displayOrder 降序
4. 同价时按 creditRating 降序
```

推荐标记来源：
- **平台推荐**：运营手动标记 `isRecommended = true`
- **性价比推荐**：系统计算（售价最低且健康分 ≥95）
- **稳定推荐**：系统计算（健康分 ≥99 且平均延迟 ≤200ms）

---

## 3. 供应商成本管理（内部）

### 3.1 成本价定义

平台向供应商采购的**实际支付价格**，仅管理后台可见，**绝不对外展示**。

| 字段 | 类型 | 说明 |
|------|------|------|
| vendorModelId | integer FK→vendor_models | 供应商-模型映射 ID |
| costInputPrice | numeric(18,6) | 输入成本价（元/1M tokens） |
| costOutputPrice | numeric(18,6) | 输出成本价（元/1M tokens） |
| costCurrency | varchar(10) | 结算货币：CNY / USD |
| settlementCycle | varchar(20) | 结算周期：daily / weekly / monthly |
| effectiveAt | timestamp | 成本价生效时间 |

### 3.2 毛利率计算

```
毛利率 = (sellPrice - costPrice) / sellPrice × 100%
```

管理后台展示毛利率，低于阈值（默认 15%）时标红预警。

### 3.3 数据隔离

| 字段 | 管理后台 | 用户端 | API 响应 |
|------|---------|--------|---------|
| costInputPrice / costOutputPrice | ✅ 可见 | ❌ 不可见 | ❌ 不返回 |
| sellPriceInput / sellPriceOutput | ✅ 可见 | ✅ 可见 | ✅ 返回 |
| 毛利率 | ✅ 可见 | ❌ 不可见 | ❌ 不返回 |

**API 序列化层**强制过滤 `cost*` 字段，防止泄露。

---

## 4. 用户选购统计

### 4.1 统计数据采集

基于 `call_logs` 表现有字段（`vendorId`、`modelId`、`userId`）聚合分析，无需新增采集逻辑。

### 4.2 统计指标

#### 4.2.1 厂商选择分布

```sql
-- 某模型下各厂商的被选次数占比
SELECT
  vendor_id,
  COUNT(*) AS selection_count,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS percentage
FROM call_logs
WHERE model_id = :modelId
  AND created_at >= :startDate
  AND status = 'success'
GROUP BY vendor_id
ORDER BY selection_count DESC;
```

#### 4.2.2 厂商切换率

```
切换率 = 切换厂商的请求数 / 总请求数 × 100%

切换定义：同一用户连续两次调用同一模型，vendor_id 不同。
```

#### 4.2.3 价格敏感度分析

| 指标 | 计算方式 | 说明 |
|------|---------|------|
| 价格选择偏好 | 统计用户选择最低价厂商的占比 | 高=价格敏感 |
| 品牌选择偏好 | 统计用户选择推荐/高信用厂商的占比 | 高=品牌敏感 |
| 延迟选择偏好 | 统计用户选择低延迟厂商的占比 | 高=性能敏感 |
| 切换后价格变动 | 用户切换厂商后的平均价格变动幅度 | 衡量切换动机 |

### 4.3 统计看板（管理后台）

| 看板 | 维度 | 图表 |
|------|------|------|
| 厂商选择分布 | 模型 × 厂商 | 饼图 + 表格 |
| 厂商切换趋势 | 时间 × 切换率 | 折线图 |
| 价格敏感度 | 用户分群 × 选择偏好 | 柱状图 |
| 厂商收入贡献 | 厂商 × 收入金额 | 排行榜 |

---

## 5. API 设计规范

### 5.1 `model@vendor` 格式定义

```
格式：{model_name}@{vendor_code}
示例：glm-5.2@vendor_a
      deepseek-chat@zhipu
      gpt-4o@openai_proxy
```

| 组成 | 来源 | 说明 |
|------|------|------|
| model_name | `models.name` | 平台统一模型名 |
| vendor_code | `vendors.code` | 厂商编码（非 ID，非 name） |
| @ | 分隔符 | 唯一分隔符，model_name 中不允许出现 @ |

### 5.2 后端解析规则

```typescript
/**
 * 解析 model@vendor 格式
 * @returns { model: string, vendorCode: string | null }
 */
function parseModelVendor(input: string): { model: string; vendorCode: string | null } {
  const atIndex = input.lastIndexOf("@");
  if (atIndex === -1) {
    // 无 @ → 走自动路由
    return { model: input, vendorCode: null };
  }
  const model = input.substring(0, atIndex);
  const vendorCode = input.substring(atIndex + 1);
  // 校验 model 和 vendorCode 非空
  if (!model || !vendorCode) {
    throw new Error("INVALID_MODEL_VENDOR_FORMAT");
  }
  return { model, vendorCode };
}
```

**解析优先级**：

```
1. 请求体 model 字段含 @ → 解析为 model + vendor，走指定厂商路由
2. 请求体 model 字段不含 @ → 走现有自动路由（零影响兼容）
3. 解析出的 vendor 不存在/不可用 → 返回 404 + 错误提示可选厂商列表
```

### 5.3 兼容 OpenAI 格式

OpenAI SDK 的 `model` 参数直接传入 `model@vendor` 即可，无需任何 SDK 改造：

```python
# Python OpenAI SDK
response = client.chat.completions.create(
    model="glm-5.2@vendor_a",  # ← 直接传 model@vendor
    messages=[{"role": "user", "content": "Hello"}]
)
```

```javascript
// JavaScript OpenAI SDK
const response = await openai.chat.completions.create({
  model: "glm-5.2@vendor_a",  // ← 直接传 model@vendor
  messages: [{ role: "user", content: "Hello" }],
});
```

### 5.4 API 端点

#### `GET /api/v1/models/:modelName/vendors` — 获取模型可选厂商列表

**鉴权**：用户 Token

**响应 200**

```json
{
  "status": "ok",
  "data": {
    "model": "glm-5.2",
    "displayName": "GLM-5.2",
    "vendors": [
      {
        "vendorCode": "vendor_a",
        "name": "智谱AI",
        "logoUrl": "https://cdn.3cloud.ai/logos/zhipu.png",
        "brandIntro": "GLM 系列原厂，稳定性最佳",
        "creditRating": "AAA",
        "sellPriceInput": "1.000000",
        "sellPriceOutput": "2.000000",
        "priceUnit": "per_1m_tokens",
        "isRecommended": true,
        "recommendReason": "原厂直供，稳定性最高",
        "healthScore": 99,
        "avgLatencyMs": 180,
        "status": "active",
        "displayOrder": 100
      },
      {
        "vendorCode": "vendor_b",
        "name": "云厂商B",
        "logoUrl": "https://cdn.3cloud.ai/logos/vendor_b.png",
        "brandIntro": "聚合代理，价格更低",
        "creditRating": "AA",
        "sellPriceInput": "0.800000",
        "sellPriceOutput": "1.600000",
        "priceUnit": "per_1m_tokens",
        "isRecommended": false,
        "recommendReason": null,
        "healthScore": 97,
        "avgLatencyMs": 210,
        "status": "active",
        "displayOrder": 90
      },
      {
        "vendorCode": "vendor_c",
        "name": "云厂商C",
        "logoUrl": "https://cdn.3cloud.ai/logos/vendor_c.png",
        "brandIntro": "新接入厂商，限时优惠",
        "creditRating": "A",
        "sellPriceInput": "0.700000",
        "sellPriceOutput": "1.400000",
        "priceUnit": "per_1m_tokens",
        "isRecommended": false,
        "recommendReason": null,
        "healthScore": 95,
        "avgLatencyMs": 250,
        "status": "active",
        "displayOrder": 80
      }
    ]
  }
}
```

**过滤规则**：
- 仅返回 `status = active` 的厂商
- 仅返回 `vendor_models.isEnabled = true` 的映射
- 熔断器 `circuitState = dead` 的厂商不返回
- `cost*` 字段不返回

#### `POST /api/v1/chat/completions` — 调用（现有端点，扩展 model 字段）

请求体不变，`model` 字段支持 `model@vendor` 格式：

```json
{
  "model": "glm-5.2@vendor_b",
  "messages": [{"role": "user", "content": "你好"}]
}
```

**错误响应**（厂商不可用）：

```json
{
  "error": {
    "type": "vendor_unavailable",
    "message": "厂商 vendor_c 当前不可用",
    "code": "VENDOR_UNAVAILABLE",
    "availableVendors": [
      { "vendorCode": "vendor_a", "name": "智谱AI", "sellPriceInput": "1.000000" },
      { "vendorCode": "vendor_b", "name": "云厂商B", "sellPriceInput": "0.800000" }
    ]
  }
}
```

---

## 6. 用户端选择器 UI

### 6.1 交互流程

```
用户选择模型（如 GLM-5.2）
  → 展示"可选厂商"按钮（带角标显示厂商数量）
  → 点击展开厂商选择器面板
  → 展示厂商卡片列表（价格、品牌、推荐标签、健康状态）
  → 用户选中某厂商
  → 模型输入框自动拼接为 glm-5.2@vendor_b
  → 用户发起调用
```

### 6.2 厂商选择器组件

```typescript
interface VendorSelectorProps {
  modelName: string;              // 当前模型名
  vendors: VendorOption[];        // 可选厂商列表
  selectedVendorCode: string | null; // 已选厂商（null=自动路由）
  onSelect: (vendorCode: string | null) => void;
}

interface VendorOption {
  vendorCode: string;
  name: string;
  logoUrl: string;
  brandIntro: string;
  creditRating: string;           // AAA / AA / A ...
  sellPriceInput: string;
  sellPriceOutput: string;
  priceUnit: string;
  isRecommended: boolean;
  recommendReason: string | null;
  healthScore: number;            // 0-100
  avgLatencyMs: number;
  status: "active" | "maintenance" | "offline";
  displayOrder: number;
}
```

### 6.3 UI 布局

```
┌─ 模型选择 ─────────────────────────────────────────┐
│                                                     │
│  模型：[GLM-5.2 ▼]  [?]                             │
│                                                     │
│  ┌─ 供应厂商 ──────────────────────────────────┐   │
│  │  ○ 自动选择（系统智能路由）            [?]   │   │
│  │  ○ 智谱AI     ¥1.00/¥2.00  ⭐推荐  AAA  [?] │   │
│  │  ○ 云厂商B    ¥0.80/¥1.60          AA   [?] │   │
│  │  ○ 云厂商C    ¥0.70/¥1.40          A    [?] │   │
│  └──────────────────────────────────────────────┘   │
│                                                     │
│  实际调用：glm-5.2@vendor_b                        │
│  预估单价：输入 ¥0.80/1M · 输出 ¥1.60/1M          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 6.4 厂商卡片展示规则

| 元素 | 展示规则 |
|------|---------|
| Logo | 48×48 圆角，加载失败显示厂商名首字 |
| 厂商名 | 14px 加粗 |
| 品牌简介 | 12px 灰色，单行截断 |
| 价格 | 输入/输出分开展示，¥符号 + 6位小数 |
| 推荐标签 | 金色 ⭐ 图标 + 推荐理由 Tooltip |
| 信用评级 | Badge 样式，AAA 绿色 / AA 蓝色 / A 灰色 |
| 健康状态 | 健康分 ≥95 绿点 · 80-94 黄点 · <80 红点 |
| 维护中 | 置灰 + "维护中" 标签，不可选 |

### 6.5 "自动选择"选项

始终展示在列表顶部，默认选中。选择后 `model` 字段不带 `@vendor`，走现有自动路由。

---

## 7. 数据库表结构设计

### 7.1 新增表

#### `vendor_profiles` — 厂商展示资料（扩展 vendors 表）

```sql
CREATE TABLE vendor_profiles (
  id          SERIAL PRIMARY KEY,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  logo_url    VARCHAR(500),
  brand_intro TEXT,
  official_url VARCHAR(500),
  credit_rating VARCHAR(10) DEFAULT 'A',
  display_order INTEGER DEFAULT 0,
  is_recommended BOOLEAN DEFAULT false,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id)
);
```

#### `vendor_model_prices` — 厂商定价记录（用户可见售价）

```sql
CREATE TABLE vendor_model_prices (
  id               SERIAL PRIMARY KEY,
  vendor_model_id  INTEGER NOT NULL REFERENCES vendor_models(id) ON DELETE CASCADE,
  sell_price_input  NUMERIC(18,6) NOT NULL,
  sell_price_output NUMERIC(18,6) NOT NULL,
  price_unit       VARCHAR(20) NOT NULL DEFAULT 'per_1m_tokens',
  effective_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expired_at       TIMESTAMP WITH TIME ZONE,
  is_recommended   BOOLEAN DEFAULT false,
  display_order    INTEGER DEFAULT 0,
  price_version    INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vmp_vendor_model ON vendor_model_prices(vendor_model_id);
CREATE INDEX idx_vmp_effective ON vendor_model_prices(effective_at, expired_at);
```

#### `vendor_cost_prices` — 供应商成本价（内部）

```sql
CREATE TABLE vendor_cost_prices (
  id               SERIAL PRIMARY KEY,
  vendor_model_id  INTEGER NOT NULL REFERENCES vendor_models(id) ON DELETE CASCADE,
  cost_input_price  NUMERIC(18,6) NOT NULL,
  cost_output_price NUMERIC(18,6) NOT NULL,
  cost_currency    VARCHAR(10) DEFAULT 'CNY',
  settlement_cycle VARCHAR(20) DEFAULT 'monthly',
  effective_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  expired_at       TIMESTAMP WITH TIME ZONE,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vcp_vendor_model ON vendor_cost_prices(vendor_model_id);
```

#### `price_change_history` — 价格变更历史

```sql
CREATE TABLE price_change_history (
  id               SERIAL PRIMARY KEY,
  vendor_model_id  INTEGER NOT NULL REFERENCES vendor_models(id) ON DELETE CASCADE,
  change_type      VARCHAR(20) NOT NULL,  -- sell / cost
  field_name       VARCHAR(50) NOT NULL,  -- sell_price_input / sell_price_output / cost_input_price ...
  old_value        NUMERIC(18,6),
  new_value        NUMERIC(18,6),
  change_reason    TEXT,
  changed_by       INTEGER NOT NULL REFERENCES users(id),
  effective_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pch_vendor_model ON price_change_history(vendor_model_id);
```

#### `user_vendor_selections` — 用户厂商选择记录

```sql
CREATE TABLE user_vendor_selections (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  model_id    INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  vendor_id   INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  selected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_uvs_user_model ON user_vendor_selections(user_id, model_id);
CREATE INDEX idx_uvs_selected_at ON user_vendor_selections(selected_at);
```

### 7.2 现有表扩展

#### `vendors` 表新增字段

```sql
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS code VARCHAR(50) NOT NULL UNIQUE;
-- code 字段已存在于现有 schema，用于 model@vendor 拼接
```

#### `vendor_models` 表新增字段

```sql
ALTER TABLE vendor_models ADD COLUMN IF NOT EXISTS user_selectable BOOLEAN DEFAULT true;
-- 是否对该模型开放用户自选厂商功能
```

#### `models` 表新增字段

```sql
ALTER TABLE models ADD COLUMN IF NOT EXISTS vendor_selection_enabled BOOLEAN DEFAULT false;
-- 该模型是否启用厂商自选功能（全局开关）
```

### 7.3 ER 关系简图

```
users ──┐
        │
        ├── user_vendor_selections ──┬── models
        │                            │
        │                            └── vendors
        │
        └── call_logs ──┬── models
                        └── vendors

vendors ─── vendor_profiles（1:1）
        │
        ├── vendor_api_keys（1:N）
        ├── vendor_key_groups（1:N）── vendor_key_group_items（1:N）
        │                                      └── vendor_key_group_model_prices（N:1 → vendor_models）
        │
        └── vendor_models（1:N）──┬── vendor_model_prices（1:N，用户可见售价）
                                 ├── vendor_cost_prices（1:N，内部成本价）
                                 ├── price_change_history（1:N）
                                 └── circuit_breaker_configs（1:1）

models ─── vendor_models（1:N）── vendors
```

### 7.4 字段速查表

| 表 | 用途 | 对外 | 关键字段 |
|------|------|------|---------|
| `vendors` | 厂商主表 | 部分 | id, name, code, status, base_url |
| `vendor_profiles` | 厂商展示资料 | 是 | logo_url, brand_intro, credit_rating, is_recommended |
| `vendor_api_keys` | API Key 池 | 否 | encrypted_key, is_enabled |
| `vendor_key_groups` | Key 分组 | 否 | strategy, status |
| `vendor_key_group_items` | 分组内 Key | 否 | api_key_encrypted, weight, priority |
| `models` | 模型定义 | 是 | name, display_name, vendor_selection_enabled |
| `vendor_models` | 厂商-模型映射 | 部分 | vendor_id, model_id, upstream_model, user_selectable |
| `vendor_model_prices` | 用户可见售价 | 是 | sell_price_input, sell_price_output, effective_at |
| `vendor_cost_prices` | 内部成本价 | **否** | cost_input_price, cost_output_price |
| `price_change_history` | 价格变更记录 | 否 | old_value, new_value, changed_by |
| `user_vendor_selections` | 用户选择记录 | 否 | user_id, model_id, vendor_id |
| `call_logs` | 调用日志 | 否 | user_id, model_id, vendor_id, cost_cents |

---

## 8. [?] 帮助体系说明

### 8.1 页面级帮助

| 页面 | pageKey | 帮助内容 |
|------|---------|---------|
| 厂商管理列表 | `vendor-management` | 适用角色：运营/管理员。功能：管理平台供应商资料、状态、资源实例。核心操作：新增厂商、编辑资料、切换状态、测试连通性。注意事项：厂商下线前确认有备用厂商。常见问题：厂商维护中是否影响现有用户？——是，自动切换到备用厂商。 |
| 厂商定价管理 | `vendor-pricing` | 适用角色：运营/财务。功能：设置各厂商对模型的售价。核心操作：单条改价、批量调价、定时生效。注意事项：涨价需审批，提前通知用户。常见问题：改价后多久生效？——降价即时，涨价按审批流程 T+7/14/30。 |
| 供应商成本管理 | `vendor-cost` | 适用角色：财务/管理员。功能：管理平台采购成本价。核心操作：设置成本价、查看毛利率。注意事项：成本价仅内部可见，不对外展示。 |
| 用户选购统计 | `vendor-selection-stats` | 适用角色：运营/产品。功能：分析用户厂商选择行为。核心指标：选择分布、切换率、价格敏感度。 |
| 用户端厂商选择器 | `user-vendor-selector` | 适用角色：所有用户。功能：调用模型时选择供应商。核心操作：查看可选厂商、对比价格、选择厂商。注意事项：不选时系统自动路由。常见问题：选错厂商怎么办？——下次调用重新选择即可。 |

### 8.2 按钮级帮助对照表

| 按钮/操作 | 帮助文案 |
|-----------|---------|
| 新增厂商 | 创建一个新的供应商，需填写名称、编码、API 地址 |
| 编辑厂商资料 | 修改供应商的基础信息和展示资料 |
| 切换厂商状态 | 将供应商设为正常/维护/下线，维护和下线将影响用户选择 |
| 测试连通性 | 向供应商 API 发送测试请求，验证连接是否正常 |
| 批量调价 | 选中多条定价记录，按比例或固定值统一调整价格 |
| 设为推荐 | 将该厂商标记为推荐，用户端展示推荐标签 |
| 查看价格历史 | 查看该厂商-模型的历史调价记录 |
| 自动选择 | 系统根据价格、健康度、延迟自动选择最优厂商 |
| 厂商卡片 [?] | 显示该厂商的品牌简介、信用评级、健康状态、价格信息 |

---

## 9. 非功能需求

| 指标 | 要求 |
|------|------|
| 厂商列表响应 | P99 < 200ms（Redis 缓存，TTL 60s） |
| model@vendor 解析 | P99 < 1ms（纯字符串操作） |
| 厂商选择记录写入 | 异步写入，不阻塞主请求 |
| 价格缓存更新 | 调价后 60s 内全节点生效 |
| 可选厂商数量上限 | 单模型最多 10 个厂商展示 |
| 统计看板数据延迟 | T+1 小时（每小时聚合一次） |

---

## 10. 实施计划

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P0 | `model@vendor` 解析 + 路由适配 | 现有路由引擎 |
| P0 | `GET /models/:name/vendors` API | `vendor_profiles` 表 |
| P1 | 用户端厂商选择器 UI | P0 API |
| P1 | 厂商定价管理（管理后台） | `vendor_model_prices` 表 |
| P2 | 供应商成本管理（内部） | `vendor_cost_prices` 表 |
| P2 | 用户选购统计看板 | `call_logs` 聚合 |
| P3 | 批量调价 + 定时生效 | 价格变更审批流程 |

---

## 附录 A：数据流

```
用户请求 model="glm-5.2@vendor_b"
  │
  ├─ 1. 解析 model@vendor → model="glm-5.2", vendorCode="vendor_b"
  ├─ 2. 查询 vendor_models 确认映射存在且可用
  ├─ 3. 查询 vendor_model_prices 获取当前售价
  ├─ 4. 路由到 vendor_b 的 API Key（key 池轮换）
  ├─ 5. 转发请求到 vendor_b.baseUrl
  ├─ 6. 接收响应，计算 token 用量
  ├─ 7. 按售价计费，扣减用户余额
  ├─ 8. 写入 call_logs（含 vendor_id）
  └─ 9. 异步写入 user_vendor_selections
```

## 附录 B：与现有系统的兼容性

| 现有功能 | 影响 | 兼容方式 |
|---------|------|---------|
| 自动路由 | 无影响 | model 不含 @ 时走自动路由 |
| OpenAI SDK | 无影响 | model 字段直接传 model@vendor |
| 计费引擎 | 无影响 | 按 vendor_models 售价计费，逻辑不变 |
| 熔断器 | 无影响 | 指定厂商熔断时返回错误 + 可选列表 |
| 健康检查 | 无影响 | 厂商健康状态影响可选性 |
| Key 池轮换 | 无影响 | 选定厂商后走该厂商的 Key 池 |
| 供应商管理 | 扩展 | 新增 vendor_profiles 展示资料 |
| 路由覆盖 | 无影响 | 覆盖优先级高于用户选择（运维应急） |

## 附录 C：路由覆盖与用户选择的关系

```
优先级（高 → 低）：
  1. routing_overrides（运维手动覆盖）—— 应急场景，覆盖一切
  2. model@vendor（用户显式选择）—— 本次请求生效
  3. 自动路由策略（weighted_random / lowest_price）—— 默认
```

运维通过路由覆盖可以将某模型强制路由到指定厂商，即使用户在请求中指定了 `model@vendor`，也会被覆盖到运维指定的厂商。此场景仅在应急故障时使用，用户会收到通知说明厂商已切换。
