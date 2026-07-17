// ============================================================
//  3cloud (3C) — 财务成本核算路由（管理员）— 入口
//
//  A. 成本看板
//  B. 成本明细
//  C. 代理商结算对账
//  D. 代理商资金流水
//  E. Agent 成本明细
//  F. Code 成本分页列表
// ============================================================

import { FastifyInstance } from "fastify";
import { authenticateJWT } from "../../../../middleware/auth.js";

import { costOverviewRoutes } from "./handlers/cost-overview.js";
import { costDetailRoutes } from "./handlers/cost-detail.js";
import { agentSettlementRoutes } from "./handlers/agent-settlement.js";
import { agentSettlementDetailRoutes } from "./handlers/agent-settlement-detail.js";
import { finalizeSettlementRoutes } from "./handlers/finalize-settlement.js";
import { agentLedgerRoutes } from "./handlers/agent-ledger.js";
import { agentCostRoutes } from "./handlers/agent-cost.js";
import { codeCostRoutes } from "./handlers/code-cost.js";

export async function adminFinanceCodeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticateJWT);

  // A. 成本看板
  await app.register(costOverviewRoutes, { prefix: "" });

  // B. 成本明细
  await app.register(costDetailRoutes, { prefix: "" });

  // C. 代理商结算对账（列表 + 明细 + 锁定结算）
  await app.register(agentSettlementRoutes, { prefix: "" });
  await app.register(agentSettlementDetailRoutes, { prefix: "" });
  await app.register(finalizeSettlementRoutes, { prefix: "" });

  // D. 代理商资金流水
  await app.register(agentLedgerRoutes, { prefix: "" });

  // E. Agent 成本明细
  await app.register(agentCostRoutes, { prefix: "" });

  // F. Code 成本分页列表
  await app.register(codeCostRoutes, { prefix: "" });
}
