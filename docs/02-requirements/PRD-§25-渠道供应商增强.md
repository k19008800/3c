# §25 渠道（供应商）增强

- 品牌：浩寅云
- 代码基线：git HEAD `91f62d3`（2026-10-03，含 Step 4 vendor 门户）
- 权威源：`api/src/routes/{suppliers,admin-vendor-alias,admin-vendor-settlements,vendor}.ts`、migration 0046
- 状态图例：✅ 已实现 / 🟡 部分实现 / ❌ 未实现（规划中）

## 25.1 功能清单

| 编号 | 能力 | 代码落点 | 状态 | 差距说明 |
|---|---|---|---|---|
| 25.1.1 | 供应商主数据 CRUD | `suppliers.ts`：`/admin/suppliers[/:id]` 增改删 + 详情 | ✅ | |
| 25.1.2 | 渠道 Key 管理 | `/admin/suppliers/:id/keys`、`PUT/DELETE /admin/keys/:id`、`admin-vendor-alias.ts` `/admin/vendor-keys/:id/{toggle,delete}` | ✅ | 新增/启停/删除 |
| 25.1.3 | 渠道模型映射与上下架 | `/admin/suppliers/:id/models`、`PATCH /admin/models/:id/status`、`batch-status` | ✅ | |
| 25.1.4 | 销售定价/渠道成本/渠道画像/批量调价 | `suppliers.ts` `/admin/pricing*`；`admin-vendor-alias.ts` `/admin/vendor-profiles|pricing|costs|batch-adjust` | ✅ | 权限点 `supplier.pricing` |
| 25.1.5 | 渠道连通性测试 / 余额查询 | `POST /admin/suppliers/:id/test`、`GET /:id/balance` | ✅ | |
| 25.1.6 | 渠道性能排行榜（管理端） | `admin-vendor-alias.ts`：`GET /admin/vendor-performance` | ✅ | |
| 25.1.7 | 管理侧渠道结算单 | `admin-vendor-settlements.ts`：generate/list/get/download/confirm/paid/dispute | ✅ | 六端点全带 2FA |
| 25.1.8 | 供应商账单匹配 | `GET /admin/supplier-bill-match` | ✅ | |
| 25.2.1 | **vendor 自助门户（登录/看板）** | `vendor.ts`：`POST /api/v1/vendor/auth/login`、`GET /api/v1/vendor/dashboard` | ✅ | Step 4 已上线，vendorAuth 独立鉴权 |
| 25.2.2 | vendor 自助查结算周期/明细 | `GET /api/v1/vendor/settlements` | ✅ | Step 4 已上线 |
| 25.2.3 | vendor 自助发起结算申请 | `POST /api/v1/vendor/settlements/request`；表 `vendor_settlement_requests`（migration 0046） | ✅ | Step 4 已上线：渠道发起→平台审核→打款 |
| 25.2.4 | vendor 公告/通知收件箱 | `GET /api/v1/vendor/notifications` | ✅ | Step 4 已上线 |
| 25.2.5 | vendor 自助看名下模型 | `GET /api/v1/vendor/models` | ✅ | Step 4 已上线 |
| 25.2.6 | vendor 结算单 CSV/明细导出 | — | ❌ | 自助门户暂未提供导出（管理端有 download） |
| 25.2.7 | 管理端向渠道群发通知 | — | ❌ | 收件箱已具备，主动群发端点未建 |

## 25.2 关键架构

- 供应商自助门户是独立鉴权域（`vendorAuth`，非用户 JWT），路径前缀 `/api/v1/vendor/*`，与用户端 `/api/v1/me/*`、管理端 `/api/v1/admin/*` 三域隔离。
- 结算双触发：平台主动 `generate`（管理侧）与渠道自助 `request`（vendor 侧）共用同一结算单语义，审核与打款动作仍在管理侧完成并强制 2FA。

## 25.3 未实现项

| 优先级 | 事项 |
|---|---|
| P1 | vendor 结算明细导出（CSV/PDF） |
| P1 | 管理端向渠道群发通知 |
| P2 | 渠道在线对账差异确认（dispute 闭环已在管理侧，vendor 侧发起 dispute 未开放） |
