import { createDb, closeDb } from "./src/db/index.js";
import { sql } from "drizzle-orm";

async function main() {
  const db = createDb();
  
  // Check vendor details
  const v = await db.execute(sql.raw("SELECT id, name, api_key_encrypted IS NOT NULL as has_key, api_endpoint FROM vendors"));
  console.log("Vendors:", JSON.stringify((v as any).rows));
  
  // Check deepseek vendor_models
  const vm = await db.execute(sql.raw("SELECT vm.id, vm.model_id, vm.vendor_id, vm.upstream_model_name, vm.api_endpoint, vm.api_key_encrypted IS NOT NULL as has_key FROM vendor_models vm WHERE vm.vendor_id = 3"));
  console.log("DeepSeek vms:", JSON.stringify((vm as any).rows));
  
  closeDb();
}
main();
