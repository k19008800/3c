import { createDb, getDb } from "../src/db/index.js";
createDb();
const db = getDb();

const result = await db.execute(
  "SELECT a.id as agent_id, a.user_id, u.email, u.role, a.total_commission, a.settled_commission, a.pending_withdraw, a.frozen_amount, a.status FROM agents a JOIN users u ON u.id = a.user_id"
);
console.log(JSON.stringify(result.rows, null, 2));
process.exit(0);
