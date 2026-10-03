# gap-tests-e2e.md — G9/G10 供应商门户与合规/文档页 E2E 可达性补测证据

- 日期：2026-10-03（Asia/Shanghai）
- 仓库根：`C:\Users\ZH\.openclaw\workspace\3cloud`
- 被测栈：`pnpm dev`（api@3000 + web-portal@5177，web-console 静态托管于 `/app/`）
- 浏览器工程：project=`msedge`（本地系统 Edge，未下载浏览器），headless
- 范围纪律：仅新建两个 spec；现有 4 个 spec、playwright.config.ts、global-setup.cjs、生产代码均未做永久改动（RED 变异均已临时备份→恢复→哈希校验）

---

## 1. 新 spec 清单（绝对路径）

| 编号 | 文件（绝对路径） | 用例数 | 契约来源 |
|---|---|---|---|
| G9 | `C:\Users\ZH\.openclaw\workspace\3cloud\e2e\tests\vendor-portal.spec.ts` | 2 | PRD-§25.2.1 vendor 自助门户 |
| G10 | `C:\Users\ZH\.openclaw\workspace\3cloud\e2e\tests\compliance-pages.spec.ts` | 3 | PRD-§21.9（/privacy /terms Footer 死链 P0）、§21.3（/docs P0） |

合计 5 个用例。

---

## 2. 运行时路由实测事实（写断言前先确认）

对 5177 实测（`curl -s -o NUL -w "%{http_code}|%{redirect_url}"`，不跟随重定向）：

| URL | 原始状态 | 说明 |
|---|---|---|
| `/vendor/login` | **308 → `/app/vendor/login`** | next.config.mjs redirects 命中，**遮蔽** `web-portal/src/app/vendor/login/page.tsx` |
| `/vendor/dashboard` | **200**（无重定向） | 直接 SSR Next 页；前端守卫读 `localStorage.vendor_token` |
| `/privacy` | **200** | Next SSR，h1「隐私政策」 |
| `/terms` | **200** | Next SSR，h1「服务条款」 |
| `/docs` | **200** | Next SSR（async，public api-config 失败有回退），h1「开发者文档」 |

- `/app/vendor/login` 返回 web-console SPA shell（426 字节，`<div id="root">`），由 `App.tsx` 路由 `/vendor/login → VendorLoginPage` 渲染登录表单（`input[type=email]`、`input[type=password]`、`button[type=submit]`）。
- web-console `vendor-auth` store 与 web-portal `vendor/dashboard` 守卫**共用** localStorage key `vendor_token`，故未登录时 dashboard 守卫收敛链路成立。
- 结论：G9 按「实际实现」断言——`/vendor/login` 经 308 收敛到登录路由并渲染表单；`/vendor/dashboard` 未登录收敛到登录页（不强制要求最终落在 Next 登录页，跨实现结构断言稳定）。

---

## 3. 唯一反例表（契约 → 反例 → 证据）

| 测试 | 输入轨迹 | 唯一错误实现（会使其变红） |
|---|---|---|
| G9-1 `/vendor/login` 登录表单 | goto `/vendor/login` → 308 → `/app/vendor/login` → SPA 挂载 | 登录表单被删/破坏（email/password/submit 任一缺失），或路由不再收敛到登录路由 |
| G9-2 未登录 `/vendor/dashboard` 收敛登录 | 全新上下文 goto `/vendor/dashboard`（无 token）→ 守卫 → 登录页 | 删除 dashboard 的 `if(!token) router.replace("/vendor/login")` 守卫 → 停在仪表盘，密码框永不出现 |
| G10-a `/privacy` 200+正文 | goto `/privacy` SSR | 删页/改 404/308 跳 `/app/*` → h1「隐私政策」不可见或 URL 偏移 |
| G10-b `/terms` 200+正文 | goto `/terms` SSR | 同上 → h1「服务条款」 |
| G10-c `/docs` 200+正文 | goto `/docs` SSR | 同上 → h1「开发者文档」 |

每个用例对应不同错误实现；同一轨迹上的结果（URL、表单元素）合并断言，未按文案逐项拆分。

---

## 4. 运行命令与统计

命令（在 `e2e/` 目录下执行）：

```
pnpm exec playwright test vendor-portal.spec.ts compliance-pages.spec.ts
```

### 4.1 GREEN（基线）

```
Running 5 tests using 2 workers
  ok  G9 › /vendor/login → 收敛到供应商登录页并渲染登录表单
  ok  G10 › /privacy 返回 200 且渲染正文标题（不 308 跳 /app/*）
  ok  G9 › 未登录直接访问 /vendor/dashboard → 收敛/跳转到登录页
  ok  G10 › /terms 返回 200 且渲染正文标题（不 308 跳 /app/*）
  ok  G10 › /docs 返回 200 且渲染正文标题（不 308 跳 /app/*）
  5 passed (6.4s)
```

- **退出码：0；通过：5；失败：0。**

---

## 5. RED 证明（变异 → 变红 → 恢复 → 哈希一致 → 回绿）

### 5.1 按 hint 指定目标变异 `web-portal/src/app/vendor/login/page.tsx` —— 预期外的「无效变异」（已如实记录原因）

- 基线 SHA256：`03D7589C9D91597FADF0C8400FBCC7BAA437E30F540D09F5F8667BC293A96F2F`
- 变异：h1 文案 `渠道登录` → `VARIANT-LOGIN-ABC`（最小变异）。
- 跑 `vendor-portal.spec.ts`：**仍 2 passed，退出码 0（未变红）**。
- 原因：该 Next 页被 next.config.mjs 的 `redirects()`（`/vendor/login → /app/vendor/login`，308）在路由层拦截，浏览器实际渲染的是 web-console SPA 登录页，从不请求该 Next 模块。故对其做任何变异都无可观察效应。这本身是一个架构发现：**该 Next 登录页在 `/vendor/login` 入口当前不可达（死代码阴影）**。
- 已恢复：`Copy-Item .bak → page.tsx`，恢复后 SHA256 = `03D7589C…96F2F`，**HASH_MATCH=YES**，`.bak` 已删除。

### 5.2 真正生效的 RED：变异 `web-portal/src/app/vendor/dashboard/page.tsx` 守卫

- 基线 SHA256：`8F22EA59751F4AB75C931DB5584D7A986C4D3BF7E24016C658E37496C9AF5E2E`
- 变异：将守卫 `if (!token) { router.replace("/vendor/login"); return; }` 改为 `if (!token) { setLoading(false); return; }`（删除收敛跳转）。
- 跑 `vendor-portal.spec.ts`：
  - G9-1（登录表单）：ok（仍通过）
  - G9-2（dashboard 收敛登录）：**FAILED** —— `expect(locator('input[type="password"]')).toBeVisible()` 20000ms 超时，element not found。
  - 统计：**1 failed, 1 passed；退出码 1。**
- 这证明 G9-2 真实保护了「未登录 dashboard 收敛到登录页」这一契约。
- 已恢复：`Copy-Item .bak → page.tsx`，恢复后 SHA256 = `8F22EA59…5E2E`，**HASH_MATCH=YES**，`.bak` 已删除。

### 5.3 恢复后回绿

重跑 `pnpm exec playwright test vendor-portal.spec.ts compliance-pages.spec.ts`：

```
  5 passed (6.3s)
```

- **退出码 0；通过 5；失败 0。** 变异复原，行为回绿。

---

## 6. 服务启停记录与端口释放复核

- 启动前：`Get-NetTCPConnection` 复核 :3000 / :5177 均 FREE。
- 启动：仓库根 `cmd /c pnpm dev > dev-server.log 2>&1`（detached），根 **PID=2504**；predev 自动执行 prepare-app.cjs。轮询双端口约就绪。
- 停止：`taskkill /PID 2504 /T /F` 整树停止。
- 释放复核（`netstat -ano | Select-String LISTENING`）：
  - `PORT_3000_LISTENING=False`
  - `PORT_5177_LISTENING=False`
  - `BOTH_PORTS_FREE_CONFIRMED`
- 残留进程复核：无 `3cloud|next|pnpm` 相关 node.exe 残留。

---

## 7. 结论与剩余缺口

- 状态：**通过**。
- 交付：两个新 spec（G9×2、G10×3），均被 Playwright 发现并跑过；GREEN=5/5，RED 证据链完整（含指定目标无效变异的原因说明 + dashboard 守卫有效 RED），两处生产源码哈希复原一致。
- 未触碰：现有 4 个 spec、playwright.config.ts、global-setup.cjs、其他生产代码；无 git 操作。
- 已知缺口（非本任务范围，仅记录）：
  1. `web-portal/src/app/vendor/login/page.tsx`（及可能的 register）被 next.config 308 遮蔽，在 `/vendor/login` 入口不可达；真正渲染的是 web-console SPA `VendorLoginPage`。如需让该 Next 页生效，应评审 next.config.mjs 的 vendor redirect（本任务被禁止改配置）。
  2. 与本轮无关的既有失败：`fullflow.spec.ts:109`（缺 DeepSeek-V4-Flash-0731 上游渠道，environment_block）、`user-features.spec.ts:74 /vendor-selector`（test_failure）—— 两个新 spec 均不依赖 chat 调用与 /vendor-selector。
