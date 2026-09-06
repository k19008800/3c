# 阶段 B 前端开发任务书：模型编码化改造（去除用户「供应商选择」）

> **产出方**：front-agent（前端研发工程师）
> **权威需求源**：
> - `docs/PRD-模型编码化改造与去除用户供应商选择.md`（v1.1 已定稿，决策 M-C-01~06）
> - `docs/SPEC-模型编码化改造与去除用户供应商选择.md`（v1.1 已定稿，M-S-01~08）
> - `docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md`（BOSS 2026-09-06 补充，M-C-01R / M-C-07）
> **评审依据**：`docs/_archive/ARCH-模型编码化改造-架构评审-2026-09.md`（评审通过，可派发 front）
> **编码规范（5 份必读）**：`kb/3cloud/tech-stack-decision.md`、`kb/3cloud/coding-standards-api-db-test.md`、`kb/3cloud/coding-standards-control-logic.md`、`kb/3cloud/newapi-migration-guide.md`、`kb/3cloud/development-plan.md`
> **基线**：后端模型编码化已实现（`model_code` 迁移 0038、路由编码锁定、`/me/models` 按编码展开、默认编码偏好接口均已在工作区，未提交）；前端 `web-console`/`web-portal` 尚未改动。本任务为前端阶段，**不得破坏既有前端测试/构建基线**。
> **本任务书只定义任务**：不写实现代码、不执行实现、不改源码。front-agent 按 §2 子任务 + §5 验证流程执行。
>
> **v1.0（2026-09-06）**：初始定稿。

---

## 0. 前端现状核实结论（已逐项核对）

| # | 核实项 | 现状结论 |
|---|--------|---------|
| 1 | 后端 `/api/v1/me/models` | **已按模型编码展开**返回：`model_code / model_name / display_name / supplier_code / supplier_name / context / status / pricing_group / health / latency_ms / recommended / maintenance / prices{input,output,cache_read_input_price,cache_write_input_price}`；DB 空回退 `DEFAULT_MODELS` |
| 2 | 默认编码偏好接口 | **已实现**：`GET/PUT/DELETE /api/v1/me/preferences/default-code`（me.ts L258-305） |
| 3 | Playground 类型契约 | `web-console/src/components/playground/types.ts` `ModelRow` 仍为**旧结构** `{id, name, provider, context, inputPrice, outputPrice, channels[]}` → 与后端新返回**不匹配（契约断裂）** |
| 4 | Playground 模型输入 | `components/playground/ModelInput.tsx`：datalist 取 `m.name`；help 文案「模型名将透传给网关按名路由」为**旧语义**；各 Tab 请求体 `model: model.trim()` 原样透传 |
| 5 | 渠道选择页 | `pages/VendorSelectorPage.tsx` 硬编码 mock 数据；仍挂路由 `/app/me/channels`、`/app/vendor-selector`（App.tsx L343-344）；`ChannelPriceMatrixModal` 仅被该页引用 |
| 6 | 调用日志 | `pages/LogsPage.tsx` 筛选含独立 `model` 与 `provider` 维度 |
| 7 | 营销站 | `web-portal/src/app/models/page.tsx`、`app/pricing/page.tsx` 存在，未按编码展示 |
| 8 | 后台模型管理 | `pages/AdminModelsPage.tsx` 存在；**无模型编码维护区**；后端 admin 编码维护/规则配置接口**未实现**（契约见 §3） |
| 9 | 用户模型中心 | 无独立 `/app/models` 页面；用户选模型场景 = Playground（`/app/playground`）+ 仪表盘。**本期不新增独立模型中心页**（避免范围蔓延），编码化展示落在 Playground 模型选择处 |
| 10 | 前端工具链 | `web-console/package.json`：`dev/build(vite build)/typecheck(tsc --noEmit)/lint(eslint src --ext .ts,.tsx)/test(vitest run)`；`web-portal` 同族 |

---

## 1. 范围声明

**✅ 范围内（P0，本期）**
- T1 前端类型与 API 客户端契约对齐（`ModelRow` 等）
- T2 Playground 模型选择编码化 + 默认编码偏好 UI（含价格明细弹窗迁移）
- T3 调用日志按「模型编码」筛选
- T4 下线渠道选择页 `VendorSelectorPage`（删路由 + 导航入口清理）
- T5 后台 `/admin/models` 模型编码维护 + 编码规则配置 UI（依赖 §3 后端契约，联调可并行）
- T6 营销站 `web-portal` `/models`、`/pricing` 按编码展示
- T7 全量前端回归与验收
- 横切：术语统一（用户侧不再出现「供应商/渠道选择」）、`[?]` 页面/按钮级帮助（AGENTS.md 硬性要求）

**⛔ 不在 P0（禁止实现）**
- 后端 admin 编码维护/规则配置接口实现（backend-agent 另派，本任务仅按 §3 契约联调）
- 用户侧独立「模型中心」新页面（如需，P1 评估）
- Playground `@` 编码联想升级（P1）
- 响应/账单中的编码透传展示（P2）
- 任何后端路由/计费/迁移改动

---

## 2. 子任务拆分（6 个 + 回归）

依赖链：

```
T1 契约对齐 ──→ T2 Playground 编码化（含默认偏好）┐
   │            T3 调用日志（依赖 T1）            ├──→ T7 全量回归验收
   │            T4 下线渠道选择页（依赖 T1，∥T3）│
   │            T5 后台编码维护+规则配置（依赖 §3 契约，可与 T2 并行）
   └────────── T6 营销站（依赖 T1，∥T2）
```

| 子任务 | 名称 | 前置依赖 |
|--------|------|---------|
| T1 | 前端类型与 API 客户端契约对齐 | 无 |
| T2 | Playground 模型选择编码化 + 默认编码偏好 UI | T1 |
| T3 | 调用日志按模型编码筛选 | T1 |
| T4 | 下线渠道选择页 VendorSelectorPage | T1（与 T3 并行） |
| T5 | 后台模型编码维护 + 编码规则配置 UI | §3 后端契约（与 T2 并行） |
| T6 | 营销站 /models、/pricing 按编码展示 | T1（与 T2 并行） |
| T7 | 全量前端回归与验收 | T1–T6 |

每个子任务完成标准：**改动文件全部落地 + 该子任务测试 case 全绿 + `typecheck` 通过 + 不破坏既有测试/构建**。

---

### T1 前端类型与 API 客户端契约对齐

**改动文件（真实路径）与改动点：**

1. `3cloud/web-console/src/components/playground/types.ts`
   - `ModelRow` 重写为与 `/me/models` 新结构一致：
     ```ts
     export interface ModelRow {
       model_code: string;              // 唯一模型编码（API model 值）
       model_name: string;              // 逻辑模型名
       display_name: string;            // 模型名（供应商名）
       supplier_code: string;
       supplier_name: string;
       context?: number | null;
       status: string;                  // available | maintenance
       pricing_group: string;
       health?: string | number | null;
       latency_ms?: number | null;
       recommended: boolean;
       maintenance: boolean;
       prices: {
         input_price: string | number;
         output_price: string | number;
         cache_read_input_price?: string | number | null;
         cache_write_input_price?: string | number | null;
       };
     }
     ```
   - 删除旧 `channels[]` 字段及 `channel_code/channel_name` 语义（或标注废弃）。
2. `3cloud/web-console/src/components/playground/` 下各 Tab（ChatTab/ResponsesTab/CompletionsTab/MessagesTab/RerankTab/EmbeddingsTab）与 `ModelInput.tsx` 引用点核对：凡引用 `m.name` / `m.provider` / `m.inputPrice` 处一并改为新字段（联动 T2）。
3. 全局检索 `web-console/src` 中引用旧 `ModelRow` 形态或 `me/models` 响应的其他页面（如 DashboardPage、StatisticsPage 若有），同步对齐，保证**无残留旧字段引用**（`pnpm --filter web-console typecheck` 0 错误兜底）。

**测试要求：**
- 类型契约：`pnpm --filter web-console typecheck` 0 错误（契约断裂即编译失败，属最直接验证）。
- 新增/更新组件测试（如有既有 ModelRow 相关测试）：按新字段结构 mock `/me/models` 响应，断言渲染取值正确。

**Gate：** `pnpm --filter web-console typecheck`、`pnpm --filter web-console test`（既有用例不破坏）

---

### T2 Playground 模型选择编码化 + 默认编码偏好 UI

**改动文件与改动点：**

1. `3cloud/web-console/src/components/playground/ModelInput.tsx`
   - datalist `<option>` 值改 `m.model_code`，显示文本 `m.display_name`（或 `model_code` + 括号标注供应商）。
   - help 文案改为：`模型编码 = 「厂商+模型」生成的唯一编码（如 va-deepseek-v4-flash），传参即锁定对应供应商；同一模型多供应商对应多条编码`。
   - placeholder 示例改为编码示例。
2. `3cloud/web-console/src/components/playground/` 各 Tab
   - 请求体 `model` 值 = 所选 `model_code`（用户输入原样透传时按编码处理；不做名称→编码映射）。
   - 模型选择来源统一 `/me/models` 编码列表。
3. **默认编码偏好 UI（本期 M-S-08）**
   - Playground 模型选择区新增「设为默认」入口（保存该逻辑模型 `model_name` → `model_code` 到 `PUT /api/v1/me/preferences/default-code`）。
   - 进入页面时按用户已选/最近模型调用 `GET /api/v1/me/preferences/default-code?model_name=xxx` 回填默认编码；提供「清除默认」。
   - 默认编码不可用（400 `MODEL_CODE_UNAVAILABLE` 或已下线）→ 提示并展示可选编码清单，不回退自动选择。
4. **价格明细弹窗迁移**：`3cloud/web-console/src/components/ChannelPriceMatrixModal.tsx` 由「渠道价目」语义改为「该逻辑模型下各编码对比清单」（字段：display_name / model_code / supplier_name / input / output / 缓存读 / 缓存写 / 健康 / 推荐 / 维护标签）；从 `VendorSelectorPage` 迁入 Playground 模型选择区（配合 T4 下线）。
5. `[?]` 帮助：
   - 页面级（Playground）：说明「同一模型多供应商 = 多条模型编码，选择条目即选择供应商；编码规则后台可配置，默认『厂商+模型』」。
   - 按钮级：设为默认 / 清除默认 / 价格明细 各配 `[?]` 文案（对照主 SPEC §九与 PRD 补充 §3）。

**测试要求（`web-console` 组件测试，`*.test.tsx`）：**
- 模型下拉渲染编码列表：值 = `model_code`，显示 = `display_name`。
- 选择编码后请求体 `model` = 该编码（chat/completions/messages 三 Tab 抽样断言）。
- 默认偏好：保存（PUT 请求体 `{model_name, model_code}`）→ 成功提示；读取回填；清除；默认编码下线 → 提示 + 可选清单展示。
- 价格明细弹窗：同模型多编码并排对比数据正确渲染。
- 回归：无 `/me/models` 数据（DB 空回退）→ 下拉可空态/占位，不崩溃。

**Gate：** `pnpm --filter web-console typecheck`、`pnpm --filter web-console test`、`pnpm --filter web-console build`

---

### T3 调用日志按模型编码筛选

**改动文件与改动点：**

1. `3cloud/web-console/src/pages/LogsPage.tsx`
   - 筛选区：`model` 与 `provider` 两个独立维度**合并为「按模型编码」**（输入/选择 `model_code`）；数据源来自 `/me/models` 编码列表（可搜索）。
   - 列表/详情展示：记录中的模型字段按 `model_code`（含显示名）呈现；移除独立「供应商」列或并入编码列（后端日志已按编码锚定）。
2. `[?]` 帮助：页面级说明「调用按模型编码追溯，编码即区分供应商」；按钮级（按编码筛选/导出）对照主 SPEC §九。

**测试要求：**
- 筛选控件渲染编码选项；输入编码 → 请求参数正确（`model_code`）。
- 旧数据无编码回溯时展示占位（不报错）。

**Gate：** `pnpm --filter web-console typecheck`、`pnpm --filter web-console test`

---

### T4 下线渠道选择页 VendorSelectorPage

**改动文件与改动点：**

1. `3cloud/web-console/src/App.tsx`
   - 删除路由：`/app/me/channels`（L343）、`/app/vendor-selector`（L344）→ 元素指向 `VendorSelectorPage` 的两处引用移除。
   - 用户导航菜单/侧边栏中「渠道选择」「供应商选择」入口删除或改指向 Playground 模型选择（若有）。
2. `3cloud/web-console/src/pages/VendorSelectorPage.tsx`
   - 文件下线：从页面目录移除（或留空壳并标注废弃，**不可再被路由引用**）；其 `ChannelPriceMatrixModal` 使用迁入 Playground（T2 已含）。
3. 术语清理：用户侧任何「渠道/供应商选择」文案替换为「模型编码」口径（grep 全量核对 `web-console/src` 用户可见文案）。

**测试要求：**
- 路由访问 `/app/me/channels`、`/app/vendor-selector` → 404/重定向到模型选择（不渲染旧页）。
- 全量 grep：`VendorSelectorPage` 无活动引用。

**Gate：** `pnpm --filter web-console typecheck`、`pnpm --filter web-console build`、grep 无残留引用

---

### T5 后台模型编码维护 + 编码规则配置 UI

**依赖 §3 后端接口契约（后端未实现时按契约联调，不阻塞其他子任务）。**

**改动文件与改动点：**

1. `3cloud/web-console/src/pages/AdminModelsPage.tsx`
   - 新增「模型编码」维护区：
     - 编码列表（按 supplier/model 分组，含 `model_code / model_name / display_name / 供应商 / 状态`）；
     - 操作：启用 / 停用编码（`PUT /admin/model-codes/:id/status`）；单条「重新生成编码」（`POST /admin/model-codes/:id/regenerate`，确认弹窗提示存量调用 404 风险）。
   - 显示名去重校验提示（同逻辑模型多编码时展示名 = 模型名（供应商名））。
2. **编码规则配置 UI**（PRD 补充 1 R-ADM-05，新增区域/子页面）：
   - 模板编辑区：变量面板（`{supplier_code}/{supplier_name}/{model_name}/{model_short}/{platform_model}/{seq}`，点击插入）+ 模板输入框 + 「恢复默认模板」（`{supplier_code}-{model_name}`）。
   - 实时预览：取 1 条真实映射渲染示例（调 `GET /admin/model-code-rules/preview?template=...` 或本地渲染）。
   - 保存校验：未知变量 / 非法字符 / 含 `@` → 400 错误提示；成功后提示「仅对未生成编码的映射生效」。
3. `[?]` 帮助（PRD 补充 §3 对照）：编码规则配置 / 恢复默认模板 / 重新生成编码 按钮级帮助；页面级说明「编码规则后台可配置，默认『厂商+模型』」。

**测试要求：**
- 编码列表渲染 + 启停交互（mock 接口）。
- 规则配置：模板输入 → 预览渲染；非法模板 → 错误提示；恢复默认 → 回填 `{supplier_code}-{model_name}`。
- 重新生成 → 确认弹窗出现（含风险文案），确认后调接口。

**Gate：** `pnpm --filter web-console typecheck`、`pnpm --filter web-console test`、`pnpm --filter web-console build`

---

### T6 营销站 /models、/pricing 按编码展示

**改动文件与改动点：**

1. `3cloud/web-portal/src/app/models/page.tsx`
   - 模型目录按「模型编码」展示：同一逻辑模型多供应商并排为多条编码条目（显示名 = 模型名（供应商名））；编码说明文案按「厂商+模型」规则。
2. `3cloud/web-portal/src/app/pricing/page.tsx`（及 `PriceCalculator.tsx`）
   - 价目表按编码行展示（含 input/output/缓存价）；去掉「渠道选择」描述。
3. 数据源：沿用公开价目接口（按编码口径核对字段；若公开接口未含 `model_code`，按 §3 契约向后端登记补充，不自行拼造）。

**测试要求：**
- 页面按编码渲染多条目；无数据时空态不崩溃；`pnpm --filter web-portal build` 通过。

**Gate：** `pnpm --filter web-portal typecheck`、`pnpm --filter web-portal build`

---

### T7 全量前端回归与验收

- 核对 T1–T6 全部改动文件与 §5 验收清单映射。
- `pnpm --filter web-console test`、`typecheck`、`lint`、`build` 全绿；`pnpm --filter web-portal build` 全绿。
- 输出《实现完成报告》：改动文件清单、测试结果、`[?]` 帮助抽查结论、术语清理 grep 结果（「供应商选择/渠道选择」在用户侧 0 残留）。

**Gate：** 见 §5 全部命令通过。

---

## 3. 后端接口契约（前端依赖，标注实现状态）

> 已实现 ✅ 的接口前端直接对接；未实现 ⏳ 的接口由 backend-agent 另派实现，前端按契约联调。

| 接口 | 方法 | 状态 | 契约要点 |
|------|------|------|---------|
| `/api/v1/me/models` | GET | ✅ 已实现 | 按编码展开的模型列表（§0-1 字段） |
| `/api/v1/me/preferences/default-code?model_name=` | GET | ✅ 已实现 | 返回 `{ model_name, model_code }` 或 `null` |
| `/api/v1/me/preferences/default-code` | PUT | ✅ 已实现 | body `{ model_name, model_code }`；校验对用户可见可用 |
| `/api/v1/me/preferences/default-code?model_name=` | DELETE | ✅ 已实现 | 清除默认编码 |
| `/api/v1/models/:modelName/codes` | GET | ⏳ 待确认 | 该逻辑模型下编码清单（SPEC §3.5）；前端 T2 价格明细优先用 `/me/models`，本接口按需接入 |
| `/api/v1/admin/model-codes` | GET | ⏳ 未实现 | 后台编码列表（含启停状态） |
| `/api/v1/admin/model-codes/:id/status` | PUT | ⏳ 未实现 | 启用/停用编码 |
| `/api/v1/admin/model-codes/:id/regenerate` | POST | ⏳ 未实现 | 按当前模板重新生成编码 |
| `/api/v1/admin/model-code-rules` | GET/PUT | ⏳ 未实现 | 编码规则模板读取/保存（body `{ template }`；`system_config` 键 `model_code.template`，空=默认 `{supplier_code}-{model_name}`） |
| `/api/v1/admin/model-code-rules/preview` | POST | ⏳ 未实现 | 模板渲染预览（body `{ template }`，返回示例编码） |
| 公开价目（`/api/v1/public/pricing` 等） | GET | ⏳ 待确认 | 按编码口径核对字段，缺 `model_code` 则向 backend 登记补充 |

---

## 4. 禁止事项（front-agent 硬约束）

1. ❌ **不引入新依赖**：`web-console`/`web-portal` package.json 依赖零新增。
2. ❌ **不改后端代码/迁移/schema**：任何 `api/` 下文件一律不碰（含 `me.ts`、`routing.ts`、`0038` 迁移、回填脚本）。
3. ❌ **不做名称→编码映射/自动路由**：用户输入旧模型名不猜测、不映射，按编码透传；无编码即按后端 404 语义展示。
4. ❌ **不新增独立「模型中心」页面**（P1 评估项，本期不做）。
5. ❌ **不实现 P1/P2**：`@` 编码联想、响应/账单编码透传一律不做。
6. ❌ **测试/构建不过不声称完成**：子任务 Gate 未全绿 → 不进入下一子任务；T7 全量未过 → 不算完成。
7. ❌ **不使用 `apps/` 路径**：真实路径为 `3cloud/web-console`、`3cloud/web-portal`。
8. ❌ **不静默替换术语**：用户侧「供应商/渠道选择」清理后须在报告中列出全部替换点；「供应商管理」仅后台保留。
9. ❌ **`[?]` 帮助不遗漏**：新增/改动页面与按钮必须按 §2 各任务要求配齐帮助，验收抽查不过 → 打回。

---

## 5. 验证流程（front-agent 完成后，dispatch-agent 验收用）

### 5.1 验收命令模板（在 `C:\Users\ZH\.openclaw\workspace\3cloud` 执行）

```bash
# 1) 文件位置核对（§2 各子任务改动文件逐项存在）
# 2) 类型与规范
pnpm --filter web-console typecheck     # tsc --noEmit 0 错误
pnpm --filter web-console lint          # eslint 0 error
pnpm --filter web-portal typecheck
# 3) 测试
pnpm --filter web-console test          # 既有 + 新增用例全绿
# 4) 构建
pnpm --filter web-console build
pnpm --filter web-portal build
# 5) 术语/残留核查
#    grep -rn "供应商选择\|渠道选择\|vendor-selector\|VendorSelector" web-console/src web-portal/src
#    用户侧应 0 残留（后台供应商管理除外）
```

### 5.2 验收核对清单（对主 SPEC G3/G4 前端部分 + PRD 补充）

| 验收要点 | 落点 | 核对方式 |
|---------|------|---------|
| 模型选择按编码条目（值=model_code、显示=display_name） | T1/T2 | Playground 手动验证 + 组件测试 |
| 默认编码偏好：设为默认/回填/清除/下线提示 | T2 | 组件测试 + 手动 |
| 调用日志按编码筛选，无独立供应商维度 | T3 | 页面验证 + grep |
| VendorSelectorPage 下线，旧路由不可达 | T4 | 路由验证 + grep |
| 后台编码维护 + 编码规则配置（默认 厂商+模型、预览、恢复默认） | T5 | 页面验证 + 组件测试 |
| 营销站按编码展示 | T6 | build + 页面验证 |
| 术语：「供应商选择/渠道选择」用户侧 0 残留 | 横切 | grep 报告 |
| `[?]` 帮助齐全（模型中心/Playground/日志/后台编码区） | 横切 | 抽查报告 |
| 旧字段契约 0 残留（name/provider/channels 旧 ModelRow 引用） | T1 | typecheck + grep |

### 5.3 输出格式（代码 / 测试 / 验证结果）

**代码模板**（每个新文件/改动文件）：
```tsx
/**
 * <文件用途概述> — <一句话职责>
 *
 * 职责：
 * - <职责 1>
 * 说明：<关键决策/引用 SPEC 章节/决议编号>
 *
 * @see docs/SPEC-模型编码化改造与去除用户供应商选择.md（§5 前端）
 * @module components/playground
 */
```

**测试模板**：
```tsx
describe('<组件/函数>', () => {
  it('<输入> → <预期输出>', () => {
    // 手算/mock 数据说明写注释，便于 review 复核
  });
});
```
命名规范：中文描述，一个 `it` 一个行为。

**验证结果模板**（报告尾部粘贴）：
```text
[pnpm --filter web-console typecheck] : ✅ 0 errors
[pnpm --filter web-console lint]      : ✅ 0 errors
[pnpm --filter web-console test]      : ✅ N passed / 0 failed（新增 X，既有 0 破坏）
[pnpm --filter web-console build]     : ✅ 成功
[pnpm --filter web-portal build]      : ✅ 成功
[术语 grep]                           : ✅ 用户侧「供应商选择/渠道选择」0 残留
[[?] 抽查]                            : ✅ 新增/改动页面按钮帮助齐全（附清单）
```

---

## 6. 涉及文件总清单（改动面）

```
3cloud/web-console/src/components/playground/types.ts            # T1 ModelRow 重写
3cloud/web-console/src/components/playground/ModelInput.tsx      # T2 编码下拉/联想 + 文案
3cloud/web-console/src/components/playground/{Chat,Responses,Completions,Messages,Rerank,Embeddings}Tab.tsx  # T2 请求体 model=编码
3cloud/web-console/src/components/ChannelPriceMatrixModal.tsx    # T2 编码价格明细（迁移语义）
3cloud/web-console/src/pages/PlaygroundPage.tsx                  # T2 默认编码偏好 UI 挂载
3cloud/web-console/src/pages/LogsPage.tsx                        # T3 按编码筛选
3cloud/web-console/src/App.tsx                                   # T4 删 2 条路由
3cloud/web-console/src/pages/VendorSelectorPage.tsx              # T4 下线（不活动引用）
3cloud/web-console/src/pages/AdminModelsPage.tsx                 # T5 编码维护 + 规则配置 UI
3cloud/web-console/src/pages/DashboardPage.tsx 等                # T1 旧 ModelRow 引用核对/对齐
3cloud/web-portal/src/app/models/page.tsx                        # T6 按编码展示
3cloud/web-portal/src/app/pricing/page.tsx                       # T6 按编码展示
3cloud/web-portal/src/app/pricing/PriceCalculator.tsx            # T6 编码口径
（新增）web-console/src/**/*.test.tsx                            # T2/T3/T5 组件测试
```

---

## 附录：派发文本（dispatch-agent 按 spawn-protocol 使用）

> 直接复制以下任务文本给 front-agent，满足 spawn-protocol 五要素（必读文档 / 测试要求 / 输出格式 / 目录范围 / Gate）。

```
你负责实现 3cloud「模型编码化改造」阶段 B 前端改造。

## 启动必读（写任何代码前，按顺序）
1. 读 docs/PRD-模型编码化改造与去除用户供应商选择.md（v1.1 定稿，决策 M-C-01~06）
2. 读 docs/SPEC-模型编码化改造与去除用户供应商选择.md（v1.1 定稿，§5 前端 + §九 [?] 帮助对照）
3. 读 docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md（BOSS 2026-09-06：编码规则后台可自定义，默认「厂商+模型」）
4. 读 docs/_archive/ARCH-模型编码化改造-架构评审-2026-09.md
5. 读 kb/3cloud/ 下 5 份编码规范（tech-stack-decision / coding-standards-api-db-test / coding-standards-control-logic / newapi-migration-guide / development-plan）

## 任务
按 docs/开发任务书-阶段B-前端模型编码化改造.md 的 T1~T6 实现：
- T1 前端类型与 API 契约对齐（ModelRow 重写，0 旧字段残留）
- T2 Playground 模型选择编码化 + 默认编码偏好 UI + 价格明细弹窗迁移
- T3 调用日志按模型编码筛选
- T4 下线 VendorSelectorPage（删 /app/me/channels、/app/vendor-selector 路由与导航入口）
- T5 后台 AdminModelsPage 编码维护 + 编码规则配置 UI（按任务书 §3 契约联调）
- T6 web-portal /models、/pricing 按编码展示
- 横切：用户侧「供应商/渠道选择」术语 0 残留；新增/改动页面与按钮 [?] 帮助齐全

## 测试要求（必须全部通过）
☐ T1: web-console typecheck 0 错误；既有 test 不破坏
☐ T2: 编码列表渲染/请求体=编码/默认偏好保存·回填·清除·下线提示/价格明细多编码对比（组件测试）
☐ T3: 按编码筛选渲染与请求参数正确
☐ T4: 旧两条路由不可达；grep 无 VendorSelectorPage 活动引用
☐ T5: 编码列表启停/规则配置预览与校验/恢复默认/重新生成确认弹窗（组件测试）
☐ T6: web-portal build 通过、页面按编码渲染
☐ T7: web-console test/typecheck/lint/build 全绿 + web-portal build 全绿

## Gate 条件
pnpm --filter web-console typecheck && lint && test && build
pnpm --filter web-portal typecheck && build
全部通过才算完成。

## 输出要求
1. 实现代码（遵循项目目录结构，文件头注释 + JSDoc + 中文注释）
2. 测试文件（.test.tsx，覆盖以上测试要求）
3. 运行验证命令并报告结果（含术语 grep、[?] 抽查清单）
4. 有未通过 case 不要完成，修复后再报告

## 禁止事项
- 不引入新依赖；不改 api/ 下任何代码；不做名称→编码映射；不新增独立模型中心页；不实现 P1/P2
- 测试/构建没全过不声称完成；[?] 帮助不齐不验收
```
