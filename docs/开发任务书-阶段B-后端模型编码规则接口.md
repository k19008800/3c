# 阶段 B 后端任务书：模型编码规则接口（模板可配置 + admin 维护）

> **产出方**：backend-agent（后端研发工程师）
> **权威需求源**：
> - `docs/PRD-模型编码化改造与去除用户供应商选择.md`（**v1.2 已定稿**，M-C-01R / M-C-07）
> - `docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md`（BOSS 2026-09-06，§2 编码规则规格）
> - `docs/SPEC-模型编码化改造与去除用户供应商选择.md`（v1.1 定稿，§2.3 编码生成规则 S-C-1~3、§四 迁移）
> **评审依据**：`docs/_archive/ARCH-模型编码化改造-架构评审-2026-09.md`
> **编码规范（5 份必读）**：`kb/3cloud/tech-stack-decision.md`、`kb/3cloud/coding-standards-api-db-test.md`、`kb/3cloud/coding-standards-control-logic.md`、`kb/3cloud/newapi-migration-guide.md`、`kb/3cloud/development-plan.md`
> **基线**：模型编码化后端主链已实现（迁移 `0038_model_code.sql`、路由编码锁定、`/me/models` 按编码展开、默认编码偏好接口，工作区未提交）；回填脚本 `api/scripts/backfill-model-codes.ts` 为**旧规则**（`{模型名简化}-{供应商code}`），本次需改造。本任务**不得破坏既有测试基线**。
> **本任务书只定义任务**：不写实现代码、不执行实现、不改源码。
>
> **v1.0（2026-09-06）**：初始定稿。

---

## 0. 现状核实结论（已逐项核对）

| # | 核实项 | 现状结论 |
|---|--------|---------|
| 1 | 编码载体 | `supplier_models.model_code` 列 + 部分唯一索引已建（迁移 0038） |
| 2 | 回填脚本 | `api/scripts/backfill-model-codes.ts`：**旧规则** `{slug(model_name)}-{sanitize(supplier.code)}`（如 `dsv4f-vendor_b`），`slugModelName` 取前 12 字符、仅 `[a-z0-9]`；幂等（只填 NULL）；唯一冲突追加 `-2/-3`。**与 v1.2 默认模板「厂商+模型」不符，须改造为读配置模板** |
| 3 | 模板配置载体 | `system_config` **无** `model_code.template` 键；需新增（空=默认 `{supplier_code}-{model_name}`） |
| 4 | admin 路由模式 | `api/src/routes/` 下 `admin-*.ts` 单文件路由（如 `admin-adjust.ts` 用 `requirePerm('finance.adjust')` / `adminAuth`）；**无** model-codes / model-code-rules 路由 |
| 5 | 编码生成/校验函数 | `routing.ts` 已有 `assertModelCodeAvailable` / `listAvailableCodesForUser`（校验侧）；**缺**「模板渲染 + 清洗 + 唯一性」生成侧函数（本次新建） |
| 6 | 显示名 | `/me/models` 已返回 `display_name = 模型名（供应商名）`（前端展示用，不依赖本任务） |

---

## 1. 范围声明

**✅ 范围内（P0，本期）**
- B1 编码生成核心：模板渲染 + 清洗 + 唯一性校验 + 序号兜底（纯函数，可单测）
- B2 模板配置：`system_config` 键 `model_code.template` 读写 + 默认值兜底 + 校验（变量白名单 / 字符集 / 含 `@` 拒绝）
- B3 admin 接口 6 个：编码列表 / 启停 / 重新生成 / 模板读写 / 模板预览（契约见 §3）
- B4 回填脚本改造：按当前模板（默认 厂商+模型）生成，幂等保留，序号兜底保留
- B5 测试 + 全量回归 + tsc

**⛔ 不在 P0（禁止实现）**
- 前端 UI（front-agent 另派，按 §3 契约联调）
- 迁移 0038 本身（已建列，不动）；消费记录/日志回填（置空策略不变）
- 编码「改码/复用」审批流（本期仅"重新生成=删除旧值后按模板重生成"语义，见 §3 契约）
- P1/P2（`@` 联想、响应透传等）

---

## 2. 子任务拆分（5 个）

依赖链：

```
B1 生成核心（纯函数）──→ B3 admin 接口（依赖 B1+B2）
B2 模板配置服务（∥B1）──→ B3
B1/B2 ──→ B4 回填脚本改造
所有 ──→ B5 测试与全量回归
```

| 子任务 | 名称 | 前置依赖 |
|--------|------|---------|
| B1 | 编码生成核心函数（渲染/清洗/校验/序号） | 无 |
| B2 | 模板配置服务（system_config 读写 + 默认兜底） | 无（与 B1 并行） |
| B3 | admin 接口 6 个（admin-model-codes.ts） | B1、B2 |
| B4 | 回填脚本改造（按模板生成） | B1、B2 |
| B5 | 测试 + 全量回归 + tsc | B1–B4 |

每个子任务完成标准：**改动文件落地 + 该子任务测试 case 全绿 + `tsc --noEmit` 通过 + 不破坏既有测试**。

---

### B1 编码生成核心函数

**改动文件与改动点：**

1. 新建 `3cloud/api/src/services/upstream/model-code.ts`（或并入 `routing.ts`，推荐独立文件）：
   - `export interface ModelCodeTemplateVars { supplierCode: string; supplierName: string; modelName: string; platformModel: string; }`
   - `export const MODEL_CODE_DEFAULT_TEMPLATE = '{supplier_code}-{model_name}'`（v1.2 默认「厂商+模型」）
   - `export const MODEL_CODE_ALLOWED_VARS = ['supplier_code','supplier_name','model_name','model_short','platform_model','seq'] as const`（白名单）
   - `export function renderModelCode(template: string, vars: ModelCodeTemplateVars, occupied?: Set<string>): string`
     1. 未知变量 / 模板含 `@` / 字面量含非法字符 → 抛 `ValidationError`（400 语义）；
     2. 渲染 `{supplier_code}/{supplier_name}/{model_name}/{platform_model}`；`{model_short}` = 模型名清洗缩写（复用/改造 `slugModelName` 语义，保留连字符）；
     3. 清洗：仅保留 `[a-zA-Z0-9_-]`，其余替换 `-`；连续 `-` 合并、首尾去除、截断 200（PRD 补充1 §2.3）；
     4. 渲染结果为空/全被清洗 → 抛校验错误（提示"变量值不可编码，请使用厂商 code 或模型名"）；
     5. `occupied` 传入时：冲突自动追加 `-{seq}`（2,3,…），仍冲突则抛错。
   - `export async function generateModelCodeForSupplierModel(id: number): Promise<string>`：查 `supplier_models` + `suppliers`，读模板（B2），渲染 + 查重（`model_code` 唯一索引兜底），写库；生成后不可复用（依赖唯一索引）。
   - 文件头注释引用 PRD 补充1 §2 / M-C-01R / M-C-07。

**测试要求（新建 `test/model-code.test.ts`）：**
- 默认模板渲染：`{supplier_code}-{model_name}` → `vb-deepseek-v4-flash`（手算对照）；
- 自定义模板：`{model_name}-{supplier_code}` 顺序正确；
- 清洗：含空格/中文/`.`/`@` 的变量值 → 替换为 `-`、连续合并、首尾去除、截断 200；
- 全清洗 → 抛校验错误；
- 未知变量 / 字面量含 `@` / 非法字面量 → 抛校验错误；
- 冲突序号：占用集合含 base → 追加 `-2`；`-2` 也占用 → `-3`；
- `renderModelCode` 纯函数无副作用（同输入同输出）。

**Gate：** `pnpm test -- -t "model-code"`、`pnpm --filter @3cloud/api typecheck`

---

### B2 模板配置服务

**改动文件与改动点：**

1. `3cloud/api/src/services/upstream/model-code.ts`（续 B1）：
   - `export const MODEL_CODE_TEMPLATE_CONFIG_KEY = 'model_code.template'`
   - `export async function getModelCodeTemplate(): Promise<string>`：读 `system_config`，空/缺失 → 返回 `MODEL_CODE_DEFAULT_TEMPLATE`（`{supplier_code}-{model_name}`）；Redis 缓存 60s（模式参考 `getCachePricingMode`，见 `services/billing/cache-discount.ts`），后台修改后失效。
   - `export async function setModelCodeTemplate(template: string): Promise<void>`：校验（白名单变量 + 字符集 + 含 `@` 拒绝 + 非空）→ upsert `system_config` → 失效缓存。
2. `3cloud/api/src/routes/admin-settings.ts`（可选）或独立路由：如并入 settings，`SETTING_DEFAULTS` 追加 `'model_code.template': { value: '', type: 'string' }`（空=默认）。推荐独立 admin 路由（B3 统一承载，避免 settings 膨胀）。

**测试要求（并入 `test/model-code.test.ts` 或独立）：**
- 无配置 → 返回默认模板；配置自定义 → 返回该模板；非法值（未知变量/@）→ 读取侧回退默认、写入侧 400；
- setModelCodeTemplate 校验：合法保存 / 未知变量 400 / 含 `@` 400 / 空模板 400；
- 缓存失效：set 后 get 返回新值。

**Gate：** `pnpm test -- -t "model-code"`、`pnpm --filter @3cloud/api typecheck`

---

### B3 admin 接口 6 个

**改动文件与改动点：**

1. 新建 `3cloud/api/src/routes/admin-model-codes.ts`（参照 `admin-*.ts` 单文件模式；权限沿用既有模型管理端点口径，如 `adminAuth` / `requirePerm`，实现时与 AdminModelsPage 既有接口权限一致）：

| 方法/路径 | 说明 | 请求/响应要点 |
|-----------|------|--------------|
| `GET /api/v1/admin/model-codes?model_name=&supplier_id=&page=&page_size=` | 编码列表 | 返回 `[{id, supplier_model_id, model_code, model_name, display_name, supplier_code, supplier_name, status, platform_model, pricing_group, prices}]`，支持按模型名/供应商筛选、分页；按 model_name+id 排序 |
| `PUT /api/v1/admin/model-codes/:id/status` | 启用/停用编码 | body `{ status: 'active' | 'disabled' }`；停用后该编码不可调用（路由校验已按 status 拦截，复用 `assertModelCodeAvailable` 活性校验）；**不物理删除**（防复用） |
| `POST /api/v1/admin/model-codes/:id/regenerate` | 按当前模板重新生成 | 校验供应商/模型 active；生成新编码（B1）→ 更新 `model_code`（旧值弃用，唯一索引防冲突）；响应含 `{ old_code, new_code }`；**调用方已用旧编码将 404，由前端确认弹窗提示** |
| `GET /api/v1/admin/model-code-rules` | 读取模板 | 返回 `{ template: string, default_template: string, allowed_vars: string[] }`（空 template = 用默认） |
| `PUT /api/v1/admin/model-code-rules` | 保存模板 | body `{ template }`；校验见 B2；返回保存后模板 |
| `POST /api/v1/admin/model-code-rules/preview` | 模板预览 | body `{ template }`；取 1 条真实映射渲染示例，返回 `{ preview: [{supplier_code, model_name, rendered_code}] }`（≥1 条；无数据时返回示例占位并标注"示意"） |

2. 路由注册：`api/src/routes/index.ts`（或等价注册处）挂载 `admin-model-codes.ts`；响应结构遵循项目 API 约定（`{data}` 包裹、错误码基类）。

**测试要求（新建 `test/admin-model-codes.test.ts`，mock db 或集成）：**
- 列表：筛选/分页/字段完整（含 display_name、prices）；
- 启停：active→disabled 后调用侧不可用（配合路由校验 mock）；disabled→active 恢复；
- regenerate：旧值更新为新值、唯一冲突时序号兜底、供应商非 active 拒绝；
- 模板读写：GET 返回三字段；PUT 合法/非法（未知变量/@/空）→ 200/400；PUT 后 GET 一致；
- preview：有数据返回真实渲染；无数据返回占位并标注。

**Gate：** `pnpm test -- -t "admin-model"`、`pnpm --filter @3cloud/api typecheck`

---

### B4 回填脚本改造

**改动文件与改动点：**

1. `3cloud/api/scripts/backfill-model-codes.ts`
   - 生成规则改为**读当前模板**（`getModelCodeTemplate`，无配置=默认 `{supplier_code}-{model_name}`），不再硬编码 `{slug}-{supCode}` 顺序；
   - 渲染/清洗/序号兜底复用 B1 纯函数（脚本可轻量内联等价逻辑，避免依赖 DI，但规则必须一致：默认 厂商+模型）；
   - 幂等保留：只更新 `model_code IS NULL` 的行；
   - 支持 `--template` 参数临时指定模板（默认读配置）；`--dry-run` 预览不改库（可选增强）。
   - 文件头注释更新：规则来源 = PRD v1.2 M-C-01R / 补充1 §2。

**测试要求：**
- 脚本级：dry-run 输出符合默认模板格式（`{supplier_code}-{model_name}`）；重复执行幂等（无 NULL 行时跳过）；
- 与 B1 规则一致性：脚本渲染结果与 `renderModelCode` 对同一输入一致。

**Gate：** 手动运行 `npx tsx scripts/backfill-model-codes.ts --dry-run`（本地库）核对格式 + `pnpm test -- -t "model-code"` 回归

---

### B5 测试与全量回归

- B1–B4 全部测试落位并全绿；`pnpm --filter @3cloud/api typecheck` 0 错误；`pnpm test` 全量通过且**既有测试 0 破坏**。
- 输出《实现完成报告》：改动文件、测试结果、模板读写/预览/regenerate 的手动核对记录（本地库）。

**Gate：** `pnpm test`（全量）、`pnpm --filter @3cloud/api typecheck`、`pnpm --filter @3cloud/api lint`

---

## 3. 前端依赖契约（front-agent 已按此联调，接口命名不可漂移）

| 接口 | 方法 | 契约要点 |
|------|------|---------|
| `/api/v1/admin/model-codes` | GET | 编码列表（筛选/分页/display_name/prices/status） |
| `/api/v1/admin/model-codes/:id/status` | PUT | body `{ status: 'active'|'disabled' }` |
| `/api/v1/admin/model-codes/:id/regenerate` | POST | 返回 `{ old_code, new_code }` |
| `/api/v1/admin/model-code-rules` | GET/PUT | GET 返回 `{ template, default_template, allowed_vars }`；PUT body `{ template }` |
| `/api/v1/admin/model-code-rules/preview` | POST | body `{ template }` → `{ preview: [...] }` |

---

## 4. 禁止事项（backend-agent 硬约束）

1. ❌ **不引入新依赖**：`api/package.json` 依赖零新增。
2. ❌ **不改已提交迁移**：0038 及之前一律不动；如需新迁移另行评估（本期预计无需）。
3. ❌ **不触碰路由编码锁定主链语义**：`routing.ts` 的 404/400/403 行为、无自动兜底语义不得回退；本任务只加生成侧与 admin 侧。
4. ❌ **不做"物理删除编码/改码"**：启停只改 status，regenerate 覆盖旧值但保留行（防复用）；改码审批流不在本期。
5. ❌ **不实现前端/不实现 P1/P2**。
6. ❌ **测试不过不声称完成**：子任务 Gate 未全绿 → 不进入下一子任务；全量 `pnpm test` 未过 → B5 不算完成。
7. ❌ **不使用 `apps/` 路径**：真实路径 `3cloud/api`。
8. ❌ **回填脚本不得改变既有已生成编码**：只填 NULL（幂等）；存量非空编码不重写（M-C-07）。

---

## 5. 验证流程（backend-agent 完成后，dispatch-agent 验收用）

### 5.1 验收命令模板（在 `C:\Users\ZH\.openclaw\workspace\3cloud` 执行）

```bash
# 1) 文件位置核对（§2 各子任务改动文件逐项存在）
# 2) 定向测试
pnpm test -- -t "model-code"      # B1/B2 生成核心 + 模板配置
pnpm test -- -t "admin-model"     # B3 admin 接口
# 3) 类型与规范
pnpm --filter @3cloud/api typecheck
pnpm --filter @3cloud/api lint
# 4) 全量回归
pnpm test
# 5) 回填脚本核对（本地库，先 dry-run）
npx tsx scripts/backfill-model-codes.ts --dry-run   # 输出须为默认模板格式 {supplier_code}-{model_name}
# 6) 接口手动核对（可选 curl，带 admin token）
#    GET /api/v1/admin/model-code-rules → { template:'', default_template:'{supplier_code}-{model_name}', allowed_vars:[...] }
#    PUT /api/v1/admin/model-code-rules {template:'{model_name}-{supplier_code}'} → 200；再 GET 一致
#    POST /api/v1/admin/model-code-rules/preview {template:'{supplier_code}-{model_name}'} → preview 数组
```

### 5.2 验收核对清单（对 PRD v1.2 / 补充1 §2 映射）

| 验收要点 | 落点 | 核对方式 |
|---------|------|---------|
| 默认模板「厂商+模型」=`{supplier_code}-{model_name}` | B1/B2 | model-code 测试 + dry-run 输出 |
| 模板自定义：保存/读取/校验（未知变量/@/空→400）、恢复默认（空=默认） | B2/B3 | admin-model 测试 + 手动 |
| 清洗规则：字符集/连续 `-`/首尾/截断/全清洗报错 | B1 | model-code 测试 |
| 唯一冲突序号兜底；编码不可复用（唯一索引） | B1/B3 | model-code + admin-model 测试 |
| 启停编码生效；regenerate 返回新旧编码 | B3 | admin-model 测试 + 路由校验 |
| 回填脚本幂等、只填 NULL、存量不重写（M-C-07） | B4 | dry-run + 脚本核对 |
| 前端契约接口命名一致 | §3 | grep admin-model-codes 路由 + 前端联调 |

### 5.3 输出格式（代码 / 测试 / 验证结果）

**代码模板**（每个新文件/改动文件）：
```ts
/**
 * <文件用途概述> — <一句话职责>
 *
 * 职责：
 * - <职责 1>
 * 说明：<关键决策/引用 PRD v1.2 章节/补充1 规格>
 *
 * @see docs/PRD-模型编码化改造与去除用户供应商选择.md（M-C-01R/M-C-07）
 * @see docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md（§2）
 * @module services/upstream
 */
// 导出的每个函数必须有 JSDoc（@param/@returns/@throws）；复杂逻辑分块注释 1./2./3.
```

**测试模板**：
```ts
describe('<被测函数/模块>', () => {
  it('<输入> → <预期输出>', () => {
    // 手算对照值写注释，便于 review 复核
  });
});
```

**验证结果模板**（报告尾部粘贴）：
```text
[pnpm test -- -t "model-code"]    : ✅ N passed / 0 failed
[pnpm test -- -t "admin-model"]   : ✅ N passed / 0 failed
[pnpm --filter @3cloud/api typecheck] : ✅ 0 errors
[pnpm --filter @3cloud/api lint]  : ✅ 0 errors
[pnpm test 全量]                  : ✅ 全部 passed（既有 0 破坏）
[backfill dry-run]                : ✅ 输出为 {supplier_code}-{model_name} 格式，幂等
[接口手动核对]                    : ✅ 模板读写/preview 一致
```

---

## 6. 涉及文件总清单（改动面）

```
3cloud/api/src/services/upstream/model-code.ts       # B1/B2 新建：渲染/清洗/校验/序号 + 模板配置服务
3cloud/api/src/routes/admin-model-codes.ts           # B3 新建：6 个 admin 接口
3cloud/api/src/routes/index.ts（或等价注册处）        # B3 路由挂载
3cloud/api/scripts/backfill-model-codes.ts           # B4 改造：按模板生成（默认 厂商+模型）
3cloud/api/test/model-code.test.ts                   # B1/B2 测试（新建）
3cloud/api/test/admin-model-codes.test.ts            # B3 测试（新建）
```

---

## 附录：派发文本（dispatch-agent 按 spawn-protocol 使用）

```
你负责实现 3cloud「模型编码规则接口」后端改造（admin 维护 + 模板可配置）。

## 启动必读（写任何代码前，按顺序）
1. 读 docs/PRD-模型编码化改造与去除用户供应商选择.md（v1.2 定稿，M-C-01R/M-C-07）
2. 读 docs/PRD-模型编码化改造与去除用户供应商选择-补充1-编码规则自定义.md（§2 编码规则规格）
3. 读 docs/SPEC-模型编码化改造与去除用户供应商选择.md（v1.1，§2.3/§四）
4. 读 docs/开发任务书-阶段B-后端模型编码规则接口.md（本任务书）
5. 读 kb/3cloud/ 下 5 份编码规范（tech-stack-decision / coding-standards-api-db-test / coding-standards-control-logic / newapi-migration-guide / development-plan）

## 任务
按开发任务书的 B1~B4 实现：
- B1 新建 services/upstream/model-code.ts：renderModelCode（模板渲染/清洗/校验/序号兜底）+ generateModelCodeForSupplierModel
- B2 模板配置：system_config 键 model_code.template（空=默认 {supplier_code}-{model_name}），读取缓存 60s、写入校验（未知变量/@/空→400）
- B3 新建 routes/admin-model-codes.ts：GET 列表 / PUT 启停 / POST regenerate / GET-PUT 模板规则 / POST preview（契约见任务书 §3，接口命名不可漂移）
- B4 改造 scripts/backfill-model-codes.ts：按当前模板生成（默认 厂商+模型），只填 NULL、幂等、支持 --dry-run
- 不实现前端；不改既有 0038 迁移；不物理删除编码

## 测试要求（必须全部通过）
☐ B1: renderModelCode 默认/自定义模板、清洗（空格/中文/./@）、全清洗报错、未知变量/@ 报错、序号兜底（model-code.test.ts）
☐ B2: 模板读写、默认兜底、缓存失效、非法值 400
☐ B3: 列表筛选分页、启停生效、regenerate 新旧编码+冲突序号、模板 GET/PUT/preview（admin-model-codes.test.ts）
☐ B4: dry-run 输出 {supplier_code}-{model_name} 格式、幂等
☐ B5: pnpm test 全量通过、既有测试 0 破坏、typecheck/lint 0 错误

## Gate 条件
pnpm test -- -t "model-code" && pnpm test -- -t "admin-model"
pnpm --filter @3cloud/api typecheck && lint
pnpm test（全量）
全部通过才算完成。

## 输出要求
1. 实现代码（文件头注释 + JSDoc + 中文注释 + PRD/补充1 引用）
2. 测试文件（.test.ts，覆盖以上测试要求）
3. 运行验证命令并报告结果（含 dry-run 输出样例）
4. 有未通过 case 不要完成，修复后再报告

## 禁止事项
- 不引入新依赖；不改 0038 及之前迁移；不改 routing.ts 路由锁定主链语义（404/400/403 不回退）
- 不物理删除编码/不做改码审批流；不实现前端/P1/P2；存量非空编码不重写
- 测试/构建没全过不声称完成
```
