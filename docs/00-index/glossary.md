# 统一术语表

- 文档 ID：INDEX-GLOSSARY-001
- 状态：review
- 生效版本：v0.1.0
- 建立日期：2026-08-29
- 权威决策：ADR-0024

| 术语 | 统一含义 |
|---|---|
| canonical | 推荐且正式的对外路径/契约 |
| alias | 兼容别名；不得用于新集成，并必须标注废止计划 |
| 业务 API | `/api/v1/*` 平台业务接口 |
| OpenAI 兼容 API | `/v1/*`；`/api/v1/v1/*` 仅为兼容别名 |
| Anthropic 兼容 API | `/anthropic/v1/*` |
| 当前余额事实来源 | `customer_balances` |
| 余额流水 | `balance_transactions` |
| 历史兼容余额 | `users.balance`；迁移后禁止新增业务引用 |
| 审批阶段 | 审批链当前阶段，不与业务对象 `status`、展示文案混淆 |
| 红冲 | 通过独立反向资金记录抵销原资金记录，原单金额不可修改/删除 |
| 操作级 2FA | 对资金写操作单独执行的二次认证 |
| 幂等键 | 绑定操作者、方法、canonical 路径和请求摘要的 `Idempotency-Key` |
| 24 小时滚动窗口 | `now - 24h ≤ created_at ≤ now`，不按自然日重置 |
| platform_ledger | 当前版本不启用的架构预留总账对象 |
| approved | 仅用于调账已生效或退款审核通过待执行，不作为充值/人工上账中间态 |
| 模型编码 | （新增，已定稿）以"模型编码（model_code）"为权威可路由标识：一个「逻辑模型 × 供应商」= 一条唯一编码（短 code，如 `dsv4f-vb`，不含 `@`），一对一映射到 `supplier_models` 记录，作为用户 API `model` 参数的权威值；用户侧不出现独立的"供应商/渠道"选择维度。**纯编码、无自动、无兼容窗口** |
| `model@vendor`（已废止语义） | （新增，已废止）`user-vendor-selection.md` 与"用户自选渠道"（`方案-渠道化改造…`）为本方案取代的二维设计，**不再有任何兼容窗口**，不得用于新集成。权威口径见 `SPEC-模型编码化改造与去除用户供应商选择.md` |
| canonical 角色 | `customer`、`agent`、`sales`、`admin`、`super_admin` |
| 权限优先级 | 显式 deny → 管理员强制策略 → 显式 grant → 角色权限并集 → 默认最小权限 |
| 权限覆写 API | 规划中的 `GET/PUT/DELETE /api/v1/admin/users/:id/permissions`；未核验实现前不得标记 implemented |

> 角色 canonical key 和完整权限点矩阵待权限专章完成后冻结；在此之前引用不得自行扩展角色枚举。
