// ============================================================
//  3cloud (3C) — 财务路由入口
//
//  聚合所有财务子模块：
//    - dashboard.ts   → 财务工作台
//    - commissions.ts → 佣金管理
//    - withdraws.ts   → 提现管理
//    - recharge-orders.ts → 充值订单
//    - export.ts      → 财务报表导出
//    - codes/index.ts → 财务成本核算
//
//  对账路由 (reconciliation.ts) 保留独立注册，暂未集成到此入口
//  原 finance.ts 中的板块 3（对账报表）仍由本入口中的各路由模块覆盖
// ============================================================

import { FastifyInstance } from "fastify";
import { adminFinanceDashboardRoutes } from "./dashboard.js";
import { adminFinanceCommissionRoutes } from "./commissions.js";
import { adminFinanceWithdrawRoutes } from "./withdraws.js";
import { adminFinanceRechargeRoutes } from "./recharge-orders.js";
import { adminFinanceExportRoutes } from "./export.js";
import { adminFinanceCodeRoutes } from "./codes/index.js";
import { adminReconciliationRoutes } from "./reconciliation.js";

export async function adminFinanceRoutes(app: FastifyInstance) {
  await app.register(adminFinanceDashboardRoutes, { prefix: "" });
  await app.register(adminFinanceCommissionRoutes, { prefix: "" });
  await app.register(adminFinanceWithdrawRoutes, { prefix: "" });
  await app.register(adminFinanceRechargeRoutes, { prefix: "" });
  await app.register(adminFinanceExportRoutes, { prefix: "" });
  await app.register(adminFinanceCodeRoutes, { prefix: "" });
  await app.register(adminReconciliationRoutes, { prefix: "" });
}
