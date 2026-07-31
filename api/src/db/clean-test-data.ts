import { pool } from "../db/index";
import "dotenv/config";

/**
 * 清理测试残留数据（gateway.test.ts 多次运行可能遗留）
 */
async function main() {
  try {
    await pool.query("DELETE FROM vendor_models WHERE upstream_model='mock-upstream'");
    await pool.query("DELETE FROM vendor_api_keys WHERE key_prefix='mockkey'");
    await pool.query("DELETE FROM vendors WHERE name LIKE 'MockVendor%' OR code LIKE 'mock%'");
    await pool.query("DELETE FROM models WHERE name='mock-model'");
    await pool.query(
      "DELETE FROM api_keys WHERE name='test' AND user_id IN (SELECT id FROM users WHERE email LIKE 'test-gw-%')",
    );
    await pool.query("DELETE FROM users WHERE email LIKE 'test-gw-%'");

    const models = await pool.query("SELECT count(*)::int AS c FROM models");
    const vendors = await pool.query("SELECT count(*)::int AS c FROM vendors");
    const vms = await pool.query("SELECT count(*)::int AS c FROM vendor_models");
    console.log(`清理完成. 剩余: models=${models.rows[0].c}, vendors=${vendors.rows[0].c}, vendor_models=${vms.rows[0].c}`);
  } catch (e) {
    console.error("清理失败:", e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
