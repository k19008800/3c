# SPEC — 模型编码化改造：去除用户侧"供应商选择"，以"模型编码"为唯一路由键

> **文档类型**：实现规格（产品定稿后由架构/后端据此实现）
> **版本**：v1.2（**已定稿**，并入补充1）
> **上游**：`docs/PRD-模型编码化改造与去除用户供应商选择.md`（v1.2）
> **状态**：**已评审定稿** ✅（决策 M-S-01~07 已拍板，见 §〇）→ 按 `kb/3cloud/spawn-protocol.md` 派发 backend / front / product / test
> **v1.2 变更（2026-09-06）**：并入《PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md》：编码规则**后台可自定义、默认「厂商+模型」**（M-S-03 → M-S-03R、S-C-1 → S-C-1R），编码示例随规则更新。
> **基础约束**：遵循 `AGENTS.md` —— 每个功能页面标题旁与每个操作按钮旁必须有 `[?]` 帮助说明。

---

## 〇、评审确认决策（已定稿）

| 编号 | 决策（定稿） |
|------|------------------------------|
| M-S-01 | 用户侧删除"供应商/渠道选择"菜单；用户只选"模型" |
| M-S-02 | 全局唯一 **模型编码（model_code）** 作为 API `model` 参数的权威路由键，一对一路由到 `supplier_models` 记录 |
| M-S-03R | 编码命名（v1.2 修订）：**默认模板「厂商+模型」** = `{supplier_code}-{model_name}`（如 `vb-deepseek-v4-flash`）；**后台可自定义编码规则模板**（变量白名单/清洗/校验见 PRD 补充1 §2）；仅 `[a-zA-Z0-9_-]`，**不含 `@`**；显示层用"模型名（供应商名）" |
| M-S-04 | **纯编码，无自动兜底**：`model` 字段必须是有效 `model_code`，非编码一律无效；`selectChannel` 移除"按模型名自动选供应商"语义 |
| M-S-05 | **立即切换，无兼容窗口**：旧裸模型名 / `model@vendor` 一律按编码解析，不匹配即 `MODEL_CODE_NOT_FOUND`(404) |
| M-S-06 | `/me/models` 列表 DB 空时回退 `DEFAULT_MODELS`（仅列表展示；不影响调用侧严格校验） |
| M-S-07 | 计费/日志/对账以 `model_code` 为锚点；供应商结算聚合到编码 |
| M-S-08 | **本期实现"默认编码偏好"**：用户可为逻辑模型保存默认编码（复用/改造 `user_vendor_selections`）|

---

## 一、实现前置事实（已核对）

- `supplier_models`：一行 = 一个供应商提供一个模型（`model_name` + `platform_model`）。**无全局唯一"可调用编码"**；`model_name` 可在多供应商间重复（这正是本方案要固化的点）。
- 路由 `selectChannel(model, opts)`：按 `model_name` 在所有提供该模型的供应商里**自动选第一个可用**（priority/分组/熔断）。缺少"按编码精确锁定"入口。
- `/me/models`：返回硬编码 `DEFAULT_MODELS`（单模型单价格单 `provider` 品牌），未按 (模型×供应商) 展开。
- 旧规划 `model@vendor`（`user-vendor-selection.md`）仅部分原型；后端 `parseModelVendor` **未实现**。本方案以其为语义超集，重定义"编码"。
- 用户端 `VendorSelectorPage.tsx` 为硬编码 mock 且未挂路由；`/app/vendor-selector` 路由存在。
- 计费：`vendor_pricing` 关联 `supplier_models`（`supplier_model_id`），含 L4 分组价；成本价列 `cost_*` 绝不对用户返回。

---

## 二、数据层

### 2.1 `supplier_models` 新增 `model_code`

```sql
-- 新增可调用编码列（全局唯一、权威可路由标识）
ALTER TABLE supplier_models
  ADD COLUMN IF NOT EXISTS model_code VARCHAR(200);

-- 唯一索引：防复用 / 改码
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_models_model_code
  ON supplier_models (model_code)
  WHERE model_code IS NOT NULL;
```

| 字段 | 说明 |
|------|------|
| `model_code` | 全局唯一、对用户可调用的模型编码；一对一绑定该行（供应商 + model_name + platform_model）|
| 来源 | 后台"模型管理"生成或同步引擎生成；规则见 §2.3 |

> 旧字段不动：`model_name`（逻辑模型名）、`platform_model`（上游真实模型名）保留。

### 2.2 `consumption_records` / `call_logs`

- 确认/增加 `model_code` 字段，作为调用、日志、计费、对账的唯一业务锚点（可回溯到供应商）。
- 兼容：存量调用无 `model_code` 时回填规则见 §四（数据迁移）。

### 2.3 编码生成规则

- **规则 S-C-1R**（v1.2 修订）：编码 = 与供应商绑定的稳定唯一编码。**默认模板「厂商+模型」**：`{supplier_code}-{model_name}`（例 `vb-deepseek-v4-flash`）；**后台可自定义模板**（变量白名单 `supplier_code/supplier_name/model_name/model_short/platform_model/seq`）；仅限 `[a-zA-Z0-9_-]`（渲染后清洗，不含 `@`，避免与旧语法混淆）；唯一冲突追加 `-{seq}`；模板变更只对未生成编码的映射生效（M-C-07）。完整规格见 PRD 补充1 §2。
- **规则 S-C-2**：编码一经生成，**不可复用、不可改码**；改码必须走迁移流程（§四）。
- **规则 S-C-3**：同一逻辑模型同一供应商只允许一个 `active` 编码（显示层不重复）。

---

## 三、后端实现

### 3.0 关键函数 `parseModelCode(model: string): { code: string; }`（严格模式）

```
规则（已定稿 M-S-04/05）：
  model 为空/空串        → 视为非法 → MODEL_CODE_NOT_FOUND(404)
  model 命中既有 model_code → { code }                          // 精确路由
  model 其它（含旧裸名/含 @）→ 一律按编码查，不命中 → MODEL_CODE_NOT_FOUND(404)
```

- 解析**只做精确匹配**：先查 `model_code` 唯一索引，命中即为权威锁定；`model_name` / `@vendor` 写法**不作为合法输入**。
- 清除旧的 `auto` / 兼容分支；`parseModelVendor` 语义被本函数取代，并标记为废弃。

### 3.1 路由层：`selectChannel` 改为按编码精确锁定

调用方必须传 `modelCode`；**移除"按模型名自动选供应商/auto"语义**：

```
1) 按 model_code 精确查 supplier_models（唯一索引）
2) 校验 supplier.status='active'、allowedGroups 服务调用方分组
3) 校验映射有效（status 非 deprecated/offline）
4) 命中 → 锁定该供应商 + platform_model，选该供应商 Key 池
5) 任一不成立 → 抛对应错误码（见 §3.3）
（无 modelCode 或为空 → MODEL_CODE_NOT_FOUND(404)，不降级自动路由）
```

### 3.2 主链接入点（P0）

`chat.ts`、`openai-compat.ts`（completions）、`messages.ts`、`responses.ts`、`anthropic.ts`、`rerank.ts`、`task-relay.ts`；P0 至少接入 chat + completions 主链，其余同批扩展。

### 3.3 错误码（沿用 infra 错误基类，加 `availableModelCodes` 可选载荷）

| code | HTTP | 含义 | payload |
|------|------|------|---------|
| `MODEL_CODE_NOT_FOUND` | 404 | 编码不存在 | — |
| `MODEL_CODE_UNAVAILABLE` | 400 | 编码维护/下线/不服务当前分组/熔断 | 可选编码清单 |
| `GROUP_FORBIDDEN` | 403 | 该编码/供应商被分组供给排除 | — |

### 3.4 `/me/models` 升级（按编码展开）

- 返回当前用户可见的所有 **模型编码**，用户会话里即"模型列表"。
- 每编码字段：`model_code`、`model_name`（逻辑名）、`display_name`（模型名（供应商名））、`supplier_code`、`supplier_name`、`context`、`status`、`prices`（input/output/缓存读/写，**按用户分组生效价**）、`health`、`latency_ms`、`recommended`、`maintenance`。
- **列表兜底**：DB 空 → 回退 `DEFAULT_MODELS`（仅列表展示，前端按"仅一个编码等价"渲染；不影响调用侧严格校验）。

```json
{
  "model_code": "vb-deepseek-v4-flash",
  "model_name": "deepseek-v4-flash",
  "display_name": "deepseek-v4-flash（云供应商B）",
  "supplier_code": "vendor_b",
  "supplier_name": "云供应商B",
  "context": 256000,
  "status": "available",
  "prices": {
    "input_price": "0.900000",
    "output_price": "2.600000",
    "cache_read_input_price": null,
    "cache_write_input_price": null
  },
  "pricing_group": "default",
  "health": 97,
  "latency_ms": 210,
  "recommended": false,
  "maintenance": false
}
```

### 3.5 `GET /api/v1/models/:modelName/codes`（该逻辑模型下的编码清单）

- 鉴权 `jwtAuth`，按用户分组透出该模型全部可用模型编码及各编码生效价/健康/延迟/状态。
- `supplier_models` 无该 `model_name` → 返回 `{ model_name, codes: [] }`。

### 3.6 默认编码偏好（本期实现 M-S-08）

| 方法/路径 | 说明 |
|-----------|------|
| `GET /api/v1/me/preferences/default-code?model_name=xxx` | 读取用户对某逻辑模型的默认编码；无则 `null` |
| `PUT /api/v1/me/preferences/default-code` | 保存/更新默认编码：`{ model_name, model_code }`；校验该编码对用户可见可用 |
| `DELETE /api/v1/me/preferences/default-code?model_name=xxx` | 清除默认编码 |

- 表数据：复用/改造 `user_vendor_selections`（`user_id + model_id + vendor_id`），语义收敛为"用户偏好默认编码"；字段 `vendor_id` 由 `supplier_models.id` 承载，另存 `model_code` 快照以稳查询。
- 应用：发起调用时若 `model` 缺省 / 为空，按逻辑模型查用户默认编码回填；回填的编码不可用时返回可选项让用户重选，不回退自动路由。

---

## 四、数据迁移

| 项 | 规则 |
|----|------|
| 存量 `supplier_models` 回填 `model_code` | 按当前模板（默认「厂商+模型」= `{supplier_code}-{model_name}`，S-C-1R）批量生成，唯一冲突时追加序号；一次性脚本 + 校验 |
| 存量 `consumption_records`/`call_logs` | 能由 `supplier_model_id` 回溯的则回填 `model_code`；否则置空（不影响资金准确性，仅影响按编码筛选历史） |
| 旧调用 `model`（裸模型名 / `name@vendorCode`） | **不映射、无兼容窗口**：一律作为编码解析，不命中即 404（定稿 M-S-05）。已有客户端需在切换前更新 `model` 为有效编码 |
| `/me/models` 列表 | DB 空回退 `DEFAULT_MODELS`（仅列表）|

---

## 五、前端实现（P0）

### 5.1 模型中心 `/app/models`

- 移除"供应商/渠道"筛选项；列表按模型编码展开为条目。
- 模型卡片/价格明细改为"编码条目"（显示名、编码、供应商、价格、健康、推荐/维护标签）。
- 价格明细弹窗 = 该逻辑模型下各编码对比清单。

### 5.2 渠道选择页 `/app/vendor-selector`

- **下线该独立"渠道选择"页面**（或并入模型中心，仅保留别名跳转），不再作为用户选供应商入口。

### 5.3 Playground

- 模型下拉直接用 `/me/models` 的编码列表（值 = `model_code`）。
- **默认编码偏好**：下拉按用户默认编码回填；提供"保存为默认"入口（本期 M-S-08）；`@` 联想按编码收敛（P1）。

### 5.4 调用日志 `/app/logs`

- 筛选合并为"按模型编码"；`provider` 维度并入编码，不单独展示供应商选择。

### 5.5 营销站 `/models`、`/pricing`

- 模型目录/定价按"编码"展示多供应商，去用户侧"渠道选择"描述。

### 5.6 管理后台

- `/admin/models`：模型管理增加"模型编码"维护（生成、命名、启停某编码、显示名去重）。
- `/admin/suppliers`：保留为内部设施（Key/连通/结算），不改菜单呈现给用户。
- `/admin/routing`：以编码为口径；**无 auto 自动选择语义**，编码必须精确命中。
- 统计看板/财务对账：口径统一到 `model_code`（可聚合到供应商）。

---

## 六、P1 增强（本期不做）

1. 编码列表高级筛选（健康/延迟/价格）。
2. Playground 编码联想升级（`@` 输入联想）。

> 注：默认编码偏好已由 M-S-08 纳入本期（§3.6），不再列入 P1。

---

## 七、验收标准（Gate）

| Gate | 条件 |
|------|------|
| G1 | 数据层：`model_code` 列 + 唯一索引 + 回填脚本执行且校验通过；`parseModelCode`（严格）+ `selectChannel` 编码锁定单测全绿；`tsc --noEmit` 0 错误 |
| G2 | `/me/models` 按编码展开（含分组生效价）+ `/models/:name/codes` + 默认编码偏好接口 + 主链（chat/completions）接入编码路由；单测全绿 |
| G3 | 前端：模型中心/Playground/调用日志按编码落地；默认编码偏好 UI；`/app/vendor-selector` 下线或并入；术语"供应商选择"从用户侧移除；`[?]` 抽查通过 |
| G4 | 端到端：同模型多供应商各编码独立路由与计费、编码 404/403、非编码/旧写法一律 404（无自动、无兼容）、编码下线回退、默认编码偏好生效、DB 空回退 `DEFAULT_MODELS` 全部通过 |
| G5 | 文档：废弃 `model@vendor` 二维口径，术语表/PRD-README/决策登记同步 |

---

## 八、测试要点（交付 test-agent）

1. 同逻辑模型多供应商：各编码独立路由、独立计费、日志正确记录 `model_code`。
2. 编码精确：`vb-deepseek-v4-flash` 命中；不存在/空/裸名/含 `@` 一律 `MODEL_CODE_NOT_FOUND`(404)；编码下架/维护中 400+可选清单；分组排除 403。
3. **无自动、无兼容**：不带有效编码不降级，直接 404；旧 `name@vendorCode` 与裸名同规则。
4. 默认编码偏好：保存/读取/清除；发起时按偏好回填；默认编码下线时返回可选项让用户重选。
5. `/me/models` DB 空 → 列表回退 `DEFAULT_MODELS`。
6. `[?]` 帮助：新增/改动页面按钮帮助齐全（§九）。

---

## 九、[?] 页面帮助与按钮级帮助对照表

### [?] 页面帮助

| pageKey | 适用角色 | 功能定位 | 核心操作 | 注意事项 | 常见问题 |
|---------|---------|---------|---------|---------|---------|
| `model-center` | 所有用户 | 模型中心：按模型编码选择可调用模型，同一逻辑模型来自不同供应商时显示多个条目 | 查看模型、对比价格/健康、发起 Playground 调用 | 多个同名模型来自不同供应商，选择不同条目即选择不同供应商 | 为什么有多个同名模型？——来自不同供应商，价格/稳定性不同，可逐条对比 |
| `call-logs` | 所有用户 | 调用日志：按模型编码追溯调用 | 按编码/时间/状态筛选、导出 | 旧数据可能无编码回溯 | 怎么按供应商查？——编码即区分供应商 |
| `admin-model-code` | 管理员 | 模型编码维护：生成/命名/启停编码 | 生成编码、停用编码、显示名去重 | 编码不可复用，改码需迁移 | 编码没了会怎样？——该条模型不可调用，需重新启用/生成 |
| `admin-suppliers` | 管理员/财务 | 供应商内部管理（不进用户菜单） | 新增/编辑供应商、连通性测试、结算 | 供应商是内部设施，不对用户暴露选择 | 用户还能看到供应商吗？——只看到"模型编码"，不出现供应商选择菜单 |
| `admin-routing` | 管理员/运维 | 路由配置：按模型编码精确路由（无 auto/自动选择） | 策略配置、路由覆盖、推荐应用 | 覆盖优先级仍最高 | 为什么 model 必须是编码？——已定稿纯编码，无自动/无兼容，非编码调用返回 404 |

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助文案 |
|-----------|---------|
| 模型中心 → 价格明细 | 展示该逻辑模型下各供应商编码的输入/输出/缓存价、健康度、延迟 |
| 模型中心 → 发起调用 | 以当前所选模型编码发起一次测试调用 |
| 模型中心 → 编码筛选 | 按模型编码过滤可调用模型；无单独"供应商"维度 |
| 调用日志 → 按编码筛选 | 输入模型编码，仅显示该编码的调用记录 |
| 管理后台 → 生成模型编码 | 为"供应商-模型"映射生成全局唯一编码，作为用户可调用标识 |
| 管理后台 → 停用模型编码 | 停用后该编码不可调用；编码不删除（防复用） |
| 管理后台 → 连通性测试 | 向该供应商发送测试请求，验证连接与 Key 有效性 |
| 管理后台 → 路由覆盖 | 应急强制将某编码/模型路由到指定供应商/Key，覆盖自动策略 |

---

## 十、交叉引用

| 文件 | 关联 |
|------|------|
| `docs/PRD-模型编码化改造与去除用户供应商选择.md` | 本 SPEC 上游 PRD |
| `docs/user-vendor-selection.md` | 旧 `model@vendor` 设计（本方案取代，需标注废止） |
| `docs/方案-渠道化改造与用户自选渠道定价.md` | 旧"用户自选渠道"方案（本方案取代） |
| `docs/ref-2.2.2-model-center.md` | 模型中心深化（需按编码口径修订） |
| `docs/ref-5.1-routing.md` | 智能路由（增加编码锁定） |
| `docs/ref-4.3-vendor-model.md` | 后台模型管理（编码来源） |
| `api/src/services/upstream/routing.ts` | 路由锁定切口（selectChannel） |
| `api/src/routes/me.ts` | `/me/models` 升级 |
| `api/src/db/schema/supplier-models.ts` | `model_code` 新增列 |
| `web-console/src/pages/VendorSelectorPage.tsx` | 下线/并入 |
| `docs/PRODUCT-DESIGN-PRINCIPLES.md` | `[?]` 帮助要求 |