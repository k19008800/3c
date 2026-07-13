// ============================================================
//  3cloud (3C) — Agent 服务层 (索引文件)
//  所有导出已拆分到以下模块:
//  - agent-core.ts       Agent CRUD, Dashboard, Clients, Income
//  - agent-commission.ts  Commission system (rules/history)
//  - agent-withdraw.ts    Withdrawal system (apply/dual-review/payout)
//  - agent-finance.ts     Finance dashboard, reconciliation
//  - agent-settlement.ts  Settlement cycles, batch settlement
//  - agent-helpers.ts     Shared utilities
// ============================================================

export * from './agent-core.js';
export * from './agent-commission.js';
export * from './agent-withdraw.js';
export * from './agent-finance.js';
export * from './agent-settlement.js';
export * from './agent-helpers.js';
