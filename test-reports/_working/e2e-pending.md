# e2e 收口待办处置记录（2026-10-03）

范围：3cloud e2e 两项待办收口。仅改动 `e2e/tests/fullflow.spec.ts`、`e2e/tests/user-features.spec.ts`、本地测试库（本次未改数据，仅只读探测）、本证据文件。未动生产源码、未动 playwright.config/global-setup、无 git、无密钥落盘。

---

## ① 模型编码核验结论

- **需求正确写法**（原文依据）：
  - `docs/SPEC-模型编码化改造与去除用户供应商选择.md` **M-S-03R**：模型编码唯一默认模板 `{supplier_code}-{model_name}`（例 `vb-deepseek-v4-flash`）。
  - 同文件 **M-S-04**：「纯编码，无自动兜底」——非编码输入一律非法；**M-S-05**：「立即切换无兼容窗口，旧裸模型名一律 `MODEL_CODE_NOT_FOUND(404)`」。
  - 渲染变量白名单（`api/src/services/upstream/model-code.ts` renderModelCode）仅：`supplier_code / supplier_name / model_name / model_short / platform_model / seq`。
- **测试原所用值**：`fullflow.spec.ts` 原 `model:"DeepSeek-V4-Flash-0731"`。**不是合法 model_code**——它是上游 `platform_model` 裸名（含日期后缀 `-0731`、无 `supplier_code-` 前缀、大小写写法），按 M-S-05 必然 404，与此前 :109 失败（404 model_code_not_found）完全吻合。
- **品牌改名 3Cloud→浩寅云 是否影响编码/文案**：**不影响编码**。编码变量白名单中无平台品牌项；平台品牌只是门户展示文案（i18n/页面标题），与 `suppliers.code`、`supplier_models.model_code` 无绑定关系。`suppliers.code=wanwu-youdao` 为稳定列，不随品牌改名变化。

## ② 本地测试库渠道现状（目标库 threecloud_v3；不含密钥/连接串）

只读探测（用 api 包 `postgres` 依赖，输出已脱敏）：

| 表 | 关键行 |
|---|---|
| `suppliers` | 万物有道：`id=2633`，`code=wanwu-youdao`，`base_url=http://47.110.226.233:8072`，`status=active`，`allowed_groups=[]`（不限组，对全组可用） |
| `supplier_keys` | `supplier_id=2633`：共 1 把、active 1 把（真实密钥已在库，本次复用，未伪造、未展示） |
| `supplier_models` | `id=2317`，`supplier_id=2633`，`model_name=DeepSeek-V4-Flash-0731`，`platform_model=DeepSeek-V4-Flash-0731`，**`model_code=deepseekv4fl-wanwu-youdao`**，`status=active` |

- 同名另有 `tianyicloud-coding` 绑定（`id=2503`，`model_code=deepseekv4fl-tianyicloud-coding`）——**未选用**，测试锚定 wanwu-youdao 验收渠道。
- 聚合：`supplier_models` 总行 4199，`model_code IS NULL=558`（均为后续测试注入行；本验收行 `id=2317` 有编码且 active，与阶段B B4 回填一致）。
- 无独立 `models` 表，模型维度由 `supplier_models.model_name` 承载。

## ③ 采取的处理（命中结论 a）

- 判定为 **(a) 渠道与编码绑定已存在**：wanwu-youdao（active，base_url 与测试注释一致，已有 active 密钥）+ `supplier_models(id=2317)` 编码绑定已就位。
- **未改 DB、未新增绑定、未触碰密钥**。
- 仅将测试 `model` 参数改为正确 model_code = `deepseekv4fl-wanwu-youdao`（行内注释引用 M-S-03R/04/05），并连带修正日志断言（记账按编码锚点）。

## ④ 测试文件改动点（行级）

**`e2e/tests/fullflow.spec.ts`**
- L146–153：原注释 + `model:"DeepSeek-V4-Flash-0731"` → 改为引用 SPEC 的多行依据注释，`model:"deepseekv4fl-wanwu-youdao"`（**L152**）。
- L167–169：原 `getByText("DeepSeek-V4-Flash-0731")`（记账断言）→ `getByText("deepseekv4fl-wanwu-youdao")`（**L169**）。依据：`chat.ts` 中 `c.model=req.model`，`settle.ts` 以 `ctx.model` 写入 `consumption_records.model`，`/me/logs` 返回 `upstream_model=该编码`（M-S-07 记账锚点）。

**`e2e/tests/user-features.spec.ts`**
- 删除 PAGES 数组中 `{ name:"渠道选择", route:"/vendor-selector", markers:["渠道","供应商","价格"] }` 条目（原 :41）。
- 原位插入下线留痕注释块（**L41–48**），引用 `PRD:44`（「供应商选择」从用户侧移除）、`PRD:54`（取代用户自选渠道二维设计）、`SPEC M-S-01`（用户侧删除渠道选择菜单）、`阶段B 三.T4`（下线渠道页）。
- PAGES 由 24 项减为 23 项。

## ⑤ 两条 spec 重跑统计与退出码

dev 栈：仓库根 `pnpm dev`（predev 后 parallel api+portal）；轮询至 `:3000` 与 `:5177` 均 listen，`GET http://localhost:3000/health = 200`。

| spec | 命令 | 退出码 | 统计 |
|---|---|---|---|
| `fullflow.spec.ts` | `pnpm exec playwright test fullflow.spec.ts` | **1** | ① 充值审核 passed；② 2FA passed；③ 真实调度 failed |
| `fullflow.spec.ts` ③ 复跑 | `... test fullflow.spec.ts -g "③"` | **1** | 仍 failed（确认非抖动） |
| `user-features.spec.ts` | `pnpm exec playwright test user-features.spec.ts` | **0** | **23 passed / 0 failed**（1.7m），原 :74 渠道选择失败消失 |

- **③ 失败点前移**：由原来的 `404 model_code_not_found` → 现在 `chat.status()` 期望 200、实得 **502**。
- API 日志佐证（两次一致）：
  ```
  gateway request  model="deepseekv4fl-wanwu-youdao"  supplier=万物有道  keyId=192
  latencyMs≈5.1–7.8s  statusCode=502  error="UPSTREAM_ERROR:502"
  ```
  即编码/路由已正确锁定该渠道与密钥；失败发生在**上游返回层**。

## ⑥ 服务启停与端口复核

- 启动：根目录 `pnpm dev`，双端口就绪。
- 停止：`taskkill /PID <listener> /T /F` 整树清理。
- 复核：`PORT_3000=free`、`PORT_5177=free`。
- 临时探测脚本 `api/tmp-probe-db.ts` 已删除（Test-Path=False）。

## ⑦ E2E-1 / E2E-2 新分类与处置结论

**E2E-1（fullflow :109 渠道配置）**
- 根因（错误 model_code）**已修复并验证**：路由不再 404，正确锁定 `wanwu-youdao` + `keyId 192`。
- ③ 残留失败归类 = **environment_block**：真实上游 `47.110.226.233:8072` 对该模型返回 HTTP 502（两次复现；裸 `GET /` 亦超时）。**非**测试 bug、**非**编码 bug、**非**我方密钥问题（密钥解密成功并被网关调用）。
- 处置：测试参数已修正为正确 model_code，**保留原断言（200 / total_tokens>0 / mock!=true）不放宽**——上游恢复后应自动转绿。
- 待运维核实：上游 wanwu 渠道（keyId 192 / base_url=http://47.110.226.233:8072）及其子通道对 `DeepSeek-V4-Flash-0731` 的可用性、额度与余额。

**E2E-2（/vendor-selector 过期测试）**
- 归类 = **test_failure（过期断言）已修复**：依 `PRD:44/:54` + `SPEC M-S-01` + `阶段B 三.T4`，该路由属刻意下线入口；删除过期条目后 `user-features` 23/23 全绿。**关闭**。
