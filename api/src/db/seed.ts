import { pool } from "../db/index";
import { createHash } from "node:crypto";
import "dotenv/config";

/**
 * 数据库 seed 脚本
 * 插入演示最小数据集：
 * - DeepSeek 供应商 + 真实 API key（加密存储）
 * - deepseek-chat / deepseek-reasoner 模型
 * - 供应商-模型映射（成本价/权重）
 * - admin 用户（带余额）
 * - 测试 API key
 *
 * 用法: pnpm --filter api db:seed
 * ⚠️ 幂等：重复执行会跳过已存在项
 */

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "sk-e1288fb4c4874d2bb07149817f6fa1cd";

function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. 供应商（DeepSeek，成本价按 ¥/1K tokens）
    const vendor = await client.query("SELECT id FROM vendors WHERE code='deepseek'");
    let vendorId: number;
    if (vendor.rows[0]) {
      vendorId = Number(vendor.rows[0].id);
      console.log("供应商 DeepSeek 已存在, id=", vendorId);
    } else {
      const v = await client.query(
        "INSERT INTO vendors (name, code, status, base_url, api_format, currency) VALUES ('DeepSeek','deepseek','active','https://api.deepseek.com','openai','CNY') RETURNING id",
      );
      vendorId = Number(v.rows[0].id);
      console.log("供应商 DeepSeek 已创建, id=", vendorId);
    }

    // 2. 供应商 API key（加密存储；演示直接存明文，生产需加密）
    const existingKey = await client.query("SELECT id FROM vendor_api_keys WHERE vendor_id=$1", [vendorId]);
    if (existingKey.rows.length === 0) {
      await client.query(
        "INSERT INTO vendor_api_keys (vendor_id, encrypted_key, key_prefix, is_enabled) VALUES ($1,$2,$3,'true')",
        [vendorId, DEEPSEEK_API_KEY, "sk-e1288fb4"],
      );
      console.log("供应商 API key 已配置");
    } else {
      console.log("供应商 API key 已存在");
    }

    // 3. 模型 + 映射
    const models: Array<{ name: string; displayName: string; costInput: string; costOutput: string }> = [
      // ¥/1K tokens（成本价）：deepseek-chat 输入 ¥0.8/M,输出 ¥2/M; reasoner 输入 ¥1/M,输出 ¥4/M（约，演示用）
      { name: "deepseek-chat", displayName: "DeepSeek Chat", costInput: "0.0008", costOutput: "0.002" },
      { name: "deepseek-reasoner", displayName: "DeepSeek Reasoner", costInput: "0.001", costOutput: "0.004" },
    ];

    for (const m of models) {
      const model = await client.query("SELECT id FROM models WHERE name=$1", [m.name]);
      let modelId: number;
      if (model.rows[0]) {
        modelId = Number(model.rows[0].id);
        console.log(`模型 ${m.name} 已存在, id=${modelId}`);
      } else {
        const mi = await client.query(
          "INSERT INTO models (name, display_name, category, status) VALUES ($1,$2,'chat','active') RETURNING id",
          [m.name, m.displayName],
        );
        modelId = Number(mi.rows[0].id);
        console.log(`模型 ${m.name} 已创建, id=${modelId}`);
      }

      // 映射（不存在才建）
      const vmExist = await client.query("SELECT id FROM vendor_models WHERE vendor_id=$1 AND model_id=$2", [vendorId, modelId]);
      if (vmExist.rows.length === 0) {
        await client.query(
          "INSERT INTO vendor_models (vendor_id, model_id, upstream_model, cost_input_price, cost_output_price, weight, priority, is_enabled) VALUES ($1,$2,$3,$4,$5,100,10,'true')",
          [vendorId, modelId, m.name, m.costInput, m.costOutput],
        );
        console.log(`映射 ${m.name} 已创建`);
      } else {
        console.log(`映射 ${m.name} 已存在`);
      }
    }

    // 4. admin 用户（带余额 10 万元=1e7 分）
    const admin = await client.query("SELECT id FROM users WHERE email='admin@3cloud.io'");
    let adminId: number;
    if (admin.rows[0]) {
      adminId = Number(admin.rows[0].id);
      console.log("admin 用户已存在, id=", adminId);
    } else {
      const a = await client.query(
        "INSERT INTO users (email, password_hash, username, balance, status, role) VALUES ('admin@3cloud.io','seed-admin','admin',10000000,'active','admin') RETURNING id",
      );
      adminId = Number(a.rows[0].id);
      console.log("admin 用户已创建, id=", adminId);
    }

    // 5. 测试 API key（演示用）
    const testSecret = "sk-3cloud-demo-" + Date.now();
    const existingApiKey = await client.query("SELECT id FROM api_keys WHERE user_id=$1 AND name='demo'", [adminId]);
    if (existingApiKey.rows.length === 0) {
      await client.query(
        "INSERT INTO api_keys (user_id, name, key_prefix, key_hash, status) VALUES ($1,'demo',$2,$3,'active')",
        [adminId, testSecret.slice(0, 12), hashApiKey(testSecret)],
      );
      console.log("\n✅ 测试 API Key 已生成:");
      console.log(`   ${testSecret}`);
      console.log("   使用: curl http://localhost:3000/v1/chat/completions -H \"Authorization: Bearer " + testSecret + "\" -H \"Content-Type: application/json\" -d '{\"model\":\"deepseek-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}'");
    } else {
      console.log("demo API key 已存在");
    }

    await client.query("COMMIT");
    console.log("\n✅ seed 完成");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("seed 失败:", e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
