import { createDb, getDb } from "../src/db/index.js";
import { getAgentById, listAllAgents } from "../src/services/agent-service.js";
createDb();
const db = getDb();

// Test getAgentById fix
const result = await getAgentById(1);
console.log("=== getAgentById(1) ===");
console.log("id:", result?.id);
console.log("email:", result?.email);
console.log("settledCommission:", result?.settledCommission);
console.log("pendingWithdraw:", result?.pendingWithdraw, "(应=待处理提现总额 ¥56867.60)");
console.log("availableBalance:", result?.availableBalance);

// Test listAllAgents fix
const listResult = await listAllAgents(1, 10);
console.log("\n=== listAllAgents ===");
for (const a of listResult.list) {
  console.log(`Agent #${a.id}: ${a.email} | pendingWithdraw: ${a.pendingWithdraw} | availableBalance: ${a.availableBalance}`);
}

process.exit(0);
