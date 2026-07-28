# 3cloud 查漏补缺 — 深度排查报告

> 生成时间: 2026-06-28 21:30 CST
> 排查人: 泥鳅 🐍

---

## 1. 密码重置全链路缺失 ❌【🔴 上线前必须】

### 现状
- **Schema**: `schemas.ts` 已有 `resetPasswordSchema`（请求重置）和 `resetPasswordConfirmSchema`（确认重置）
- **后端路由**: 无 `forgot-password` 和 `reset-password` 路由
- **后端服务**: `auth-service.ts` 无相关方法
- **Redis 结构**: 无重置 token 相关的 key
- **前端页面**: 无 `ForgotPassword.tsx`、`ResetPassword.tsx`
- **前端路由**: `App.tsx` 无相关路由

### 需要实现
- `POST /api/v1/auth/forgot-password` — 根据 email 发送重置链接（含 token）
- `POST /api/v1/auth/reset-password` — 验证 token + 重置密码
- Redis key: `reset:token:{token}` → userId, TTL 30min
- 前端 `ForgotPassword.tsx` (输入 email → 发重置邮件)
- 前端 `ResetPassword.tsx` (输入新密码 + confirm → 提交 token)
- 补充 `emailTemplate` 中 `password_reset` 模板渲染

---

## 2. JWT Secret / 安全配置硬编码 ❌【🔴 上线前必须】

### 现状
- `config.ts:22-23`: `"dev-access-secret"` 和 `"dev-refresh-secret"` 硬编码
- `encryption.ts:19`: `VENDOR_KEY_ENCRYPTION_KEY` 为空时不报错（启动即崩）

### 需要修复
- 启动时校验 `JWT_ACCESS_SECRET`、`JWT_REFRESH_SECRET`、`VENDOR_KEY_ENCRYPTION_KEY` 非空
- 非 dev 环境禁止使用默认值
- 添加 `app.addHook("onReady")` 安全配置完整性检查

---

## 3. 支付回调无签名校验 ❌【🔴 上线前必须】

### 现状
- `routes/recharge.ts:209` 标注了 `// TODO: 生产环境加入签名校验`
- 当前接受任何 `POST` 到 `/api/v1/recharge/notify` 的参数，无任何校验

### 需要修复
- 实现 `verifyPaySign()` 函数（通道约定的签名算法）
- 支持多通道不同签名规则（wechat_xxx / alipay_xxx）
- 验证 `orderNo` + `amount` + `channelOrderNo` + `sign` 的有效性

---

## 4. `authenticateJWT` 不校验用户状态 ❌【🟡 上线前推荐】

### 现状
- `middleware/auth.ts:22-58` — `authenticateJWT` 只校验 JWT 有效，不查 DB 用户状态
- 已禁用/已注销的用户持有未过期 JWT 仍可访问接口
- 对比: `authenticateApiKey` 已正确检查 `users.status`

### 需要修复
- JWT 鉴权后查询用户状态（可用 Redis 缓存减少 DB 压力）
- 对 `disabled` / `deleted` 状态返回 403

---

## 5. 限流配置 where 条件代码错误 ❌【🟡 上线前推荐】

### 现状
```typescript
// rate-limit.ts:41-50 — 这段 SQL where 条件完全无效
.where(
  eq(systemConfigs.key, "rate_limit_personal_rpm") ||
  eq(systemConfigs.key, "rate_limit_personal_tpm") || ...
)
// JS 的 || 在这里是 boolean 运算而不是 SQL OR，导致多条件查询失效
```
- 设计意图：一次查询获取所有限流配置
- 实际效果：`eq(...) || eq(...)` 被 JS 当作 boolean 处理，只有最后一个非 falsy 值有效
- 所幸下方 `for` 循环兜底发了多条独立查询，功能正常但性能差（6 次查询）

### 需要修复
- 清理死代码
- 保留 `for` 循环方案并优化为单次查询（使用 `inArray` 或手动 `sql` 拼接）

---

## 6. `geo-check.ts` 使用 CJS `require` ❌【🟡 上线前推荐】

### 现状
- `geo-check.ts:111`: `const { createHash } = require("node:crypto")`
- ESM 项目中使用 `require`，某些运行时（如打包后的 TSC 产物）可能报错

### 需要修复
- 改为 `import { createHash } from "node:crypto"`

---

## 7. 熔断服务 SQL 注入风险 ❌【🟡 上线前推荐】

### 现状
```typescript
// circuit-breaker.ts:130
sql`${vendorModels.id} IN (${vmIds.join(",")})`
```
- `sql` 标签模板被拼接调用，`vmIds.join(",")` 不是参数化写法
- 虽然 `vmIds` 是数字数组（来自 Redis keys），但写法不安全

### 需要修复
- 使用 `inArray(vendorModels.id, vmIds)` 或参数化写法
- 如果 `vmIds` 为空时跳过查询

---

## 8. 文件上传无 MIME 类型校验 ❌【🟢 上线后迭代】

### 现状
- `real-name-service.ts` 只校验了文件扩展名（`real_name_allowed_exts`）和大小
- 未对上传内容的实际 MIME 类型做检测
- 用户可上传伪装扩展名的恶意文件

### 需要修复
- 使用 `file-type` 包或手动 magic bytes 检测
- 在 `saveUploadedFile` 中增加 MIME 内容检测

---

## 9. 前端缺失页面检查分析

### team 页面缺失
- 后端 `team-service.ts` 完整 + `routes/team.ts` 已注册
- `App.tsx` 无 `/team` 路由，`pages/team/` 目录不存在
- 企业用户无法使用团队管理功能

### Settings 页面缺失
- 用户应有设置页面修改昵称、密码、第三方绑定等
- 后端相关 API 存在：`change-password`、`GET /auth/me`

### Docs 页面缺失
- PRD 和 `frontend-routes.md` 中规划了 `/docs` 页面
- 后端 `pageContents` 表存了 API 文档 Markdown
- 前端无文档展示页面

### ForgotPassword/ResetPassword 缺失
- 见第 1 项

---

## 10. `real-name-file.ts` 重复路由 ❌【🟢 上线后迭代】

### 现状
- `routes/auth.ts` 末尾有 `GET /api/v1/auth/real-name/file/:filename`（用户查看自己的）
- `routes/real-name-file.ts` 有 `GET /api/v1/admin/real-name/file/:userId/:filename`（管理员查看）
- 功能不同，路径不冲突，但 `real-name-file.ts` 注册为独立路由文件，保持现状即可

---

## 11. `call_logs` 分区就绪状态 ❌【🔴 上线前必须】

### 现状
- 迁移脚本 `setup-call-logs-partitions.ts` 已编写，但需手动执行
- 文档提示：`npm run db:push` 之后、首次 seed 之前执行
- 生产环境部署需要确认此脚本已执行

### 需要处理
- 在部署文档中清晰标注此步骤
- 建议在 `index.ts` 启动时自动检测是否为分区表，非分区则自动执行

---

## 12. SALT_ROUNDS 不一致 ❌【🟢 上线后迭代】

### 现状
- `auth-service.ts`: 使用 `10`
- `admin/users.ts`: 使用 `12`
- 无统一的地方管理此常量

### 需要修复
- 提取为公共常量（如 `SALT_ROUNDS` 在 config 或常量文件中）
- 统一为 12（更高的安全性）

---

## 13. Mock 支付通道 ❌【🟡 上线前推荐】

### 现状
- `recharge-service.ts` 中所有 `PayChannelConfig` 都是 mock 数据
- mock 微信/支付宝扫码链接、JSAPI 参数
- 生产环境需对接真实 SDK

### 需要处理
- 实现通道适配器模式（`PaymentProvider` 接口）
- 按 `pay_channel` 动态选择真实或 mock 实现
- 通过系统配置控制启用 mock 还是真实通道

---

## 14. 前端国际化缺失 ❌【🟢 上线后迭代】

### 现状
- `frontend-routes.md` 规划了 `i18n/` 和 `useI18n` hook
- 实际目录不存在，依赖未安装
- 所有 UI 文本硬编码为中文

---

## 15. User 端通知 UI 缺失 ❌【🟢 上线后迭代】

### 现状
- 后端 `notification-service.ts` + `routes/notifications.ts` 完整
- `user_notifications` 表有数据（实名审核通知等）
- 前端无通知图标/通知列表/未读数展示

---

## 16. 手册文档过期 ❌【🟢 上线后迭代】

### 现状
- `frontend-routes.md` 描述 `Ant Design 5 + ProTable` 组件栈
- 实际使用 `Tailwind CSS v4 + lucide-react`
- 文档需要更新以反映实际技术栈

---

## 17. `agent-service.ts` `voucher-service.ts` 调用情况

### 已确认
- `agent-service.ts`: `settleCommissions()` 在 `app.ts` 中被定时任务调用（每日 3AM 自动结算）
- `voucher-service.ts`: 已实现统一的凭证号生成，但当前未被任何业务代码调用（待集成到提现/结算流程）

### 需要处理
- 在提现审核通过时生成凭证号
- 在佣金结算时生成凭证号

---

## 18. 系统配置分组管理

### 现状
- `admin/system.ts` 支持 `group` 参数按前缀过滤配置
- 配置覆盖范围：限流、定价倍率、折扣、告警阈值、支付、SMTP、代理商、试用额度、安全等
- `admin/Configs.tsx` 前端实现完整（列表/编辑/分组）

### 建议
- `emailTemplates` 的编辑面板前端未实现（当前只在数据库层面管理）
- `pageContents` 的内容编辑面板前端未实现

---

## 总结优先级矩阵

| 优先级 | 项目 | 工作量 | 依赖 |
|--------|------|--------|------|
| 🔴 P0 | 密码重置 | M | 无 |
| 🔴 P0 | 安全配置启动检查 | S | 无 |
| 🔴 P0 | 支付回调签名 | M | 无 |
| 🔴 P0 | call_logs 分区 | S | 数据库 |
| 🟡 P1 | JWT 鉴权校验用户状态 | M | 无 |
| 🟡 P1 | 限流配置代码清理 | XS | 无 |
| 🟡 P1 | GeoIP require → import | XS | 无 |
| 🟡 P1 | 熔断 SQL 注入 | XS | 无 |
| 🟡 P1 | Mock 支付通道适配器 | L | 业务决策 |
| 🟡 P1 | 前端 Team / Settings / Docs | L | 无 |
| 🟢 P2 | 文件 MIME 校验 | XS | 无 |
| 🟢 P2 | SALT_ROUNDS 一致性 | XS | 无 |
| 🟢 P2 | 通知 UI | M | 无 |
| 🟢 P2 | i18n | XL | 无 |
| 🟢 P2 | 文档更新 | XS | 无 |
| 🟢 P2 | 凭证号集成 | S | 无 |

---

## 遗留项处理记录

> 处理时间: 2026-06-28 22:05 CST
> 处理人: 自动任务

### ✅ 已处理

| 项目 | 状态 | 说明 |
|------|------|------|
| 前端 Docs 页面（#9） | ✅ 完成 | 新建 `web/src/pages/Docs.tsx`，左侧目录 + 右侧内容区，展示模型列表/接入方式/定价表/使用指南/代码示例 |
| 前端 EmailTemplates 页面（#18） | ✅ 完成 | 新建 `web/src/pages/admin/EmailTemplates.tsx`，通过 system_configs 接口管理 `email_template_*` 配置，支持中英文主题/HTML 正文编辑/预览 |
| 前端路由注册 | ✅ 完成 | `App.tsx` 添加 `/docs` 和 `/admin/email-templates` 路由 |
| 侧边栏导航 | ✅ 完成 | `Sidebar.tsx` 添加「API 文档」和「邮件模板」导航项 |
| 文档手册过期（#16） | ✅ 完成 | 重写 `docs/frontend-routes.md`，删除 Ant Design/ProTable 引用，更新为 React 19 + Tailwind CSS v4 + lucide-react 技术栈，添加所有新页面和功能说明 |
