// 检查 vendor_model_id=91 的详细配置（修正版）
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Client } = pkg;
import { sql } from 'drizzle-orm';

async function main() {
  const client = new Client({
    connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud'
  });
  await client.connect();
  const db = drizzle(client);

  console.log('\n=== vendor_model_id=91 详细配置 ===\n');
  
  const vm = await db.execute(sql`
    SELECT 
      vm.id,
      vm.vendor_id,
      v.name as vendor_name,
      vm.model_id,
      m.name as model_name,
      vm.sell_price_input,
      vm.sell_price_output,
      vm.cost_price_input,
      vm.cost_price_output
    FROM vendor_models vm
    LEFT JOIN vendors v ON vm.vendor_id = v.id
    LEFT JOIN models m ON vm.model_id = m.id
    WHERE vm.id = 91
  `);
  
  console.log('Vendor Model 91:');
  console.table(vm.rows);
  
  // 检查该模型的所有调用记录
  const calls = await db.execute(sql`
    SELECT 
      id,
      user_id,
      model_name,
      prompt_tokens,
      completion_tokens,
      cost,
      key_group_item_id,
      key_sell_price_input,
      key_sell_price_output,
      price_source,
      created_at
    FROM call_logs
    WHERE vendor_model_id = 91
    AND status = 'success'
    ORDER BY created_at DESC
    LIMIT 20
  `);
  
  console.log('\n该模型的调用记录:');
  console.table(calls.rows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    prompt: r.prompt_tokens,
    completion: r.completion_tokens,
    cost: r.cost,
    key_item: r.key_group_item_id,
    key_sell_in: r.key_sell_price_input,
    key_sell_out: r.key_sell_price_output,
    price_source: r.price_source,
    time: r.created_at?.toISOString?.()
  })));
  
  // 反推：根据实际 cost 计算使用的价格
  console.log('\n=== 反推实际使用的价格 ===\n');
  
  const sampleCall = calls.rows[0] as any;
  if (sampleCall) {
    const promptTokens = Number(sampleCall.prompt_tokens);
    const completionTokens = Number(sampleCall.completion_tokens);
    const actualCost = Number(sampleCall.cost);
    
    console.log(`样本调用: prompt=${promptTokens}, completion=${completionTokens}, cost=${actualCost}`);
    
    // 假设价格单位是 元/千tokens（而非 元/百万tokens）
    const impliedPricePer1K = actualCost / ((promptTokens + completionTokens) / 1000);
    console.log(`\n如果价格单位是 元/千tokens:`);
    console.log(`  平均价格: ${impliedPricePer1K.toFixed(6)} 元/千tokens`);
    
    // 假设价格单位是 元/token
    const impliedPricePerToken = actualCost / (promptTokens + completionTokens);
    console.log(`\n如果价格单位是 元/token:`);
    console.log(`  平均价格: ${impliedPricePerToken.toFixed(6)} 元/token`);
    
    // 假设价格单位是 元/百万tokens（当前实现）
    const impliedPricePer1M = actualCost / ((promptTokens + completionTokens) / 1_000_000);
    console.log(`\n如果价格单位是 元/百万tokens:`);
    console.log(`  平均价格: ${impliedPricePer1M.toFixed(6)} 元/百万tokens`);
    
    // 检查实际价格是否匹配
    const vmPriceIn = Number(vm.rows[0]?.sell_price_input);
    const vmPriceOut = Number(vm.rows[0]?.sell_price_output);
    
    console.log(`\n数据库中的价格:`);
    console.log(`  sell_price_input: ${vmPriceIn} 元/百万tokens`);
    console.log(`  sell_price_output: ${vmPriceOut} 元/百万tokens`);
    
    // 尝试解释差异
    const ratio = actualCost / ((promptTokens * vmPriceIn + completionTokens * vmPriceOut) / 1_000_000);
    console.log(`\n差异比例: ${ratio.toFixed(2)}x`);
    
    // 检查是否价格单位搞错了（元/千tokens vs 元/百万tokens）
    const costIfPerThousand = (promptTokens * vmPriceIn + completionTokens * vmPriceOut) / 1000;
    console.log(`\n如果价格单位是 元/千tokens:`);
    console.log(`  计算成本: ${costIfPerThousand.toFixed(6)} 元`);
    console.log(`  实际成本: ${actualCost.toFixed(6)} 元`);
    console.log(`  差异: ${Math.abs(actualCost - costIfPerThousand).toFixed(6)} 元`);
    
    // 检查是否是测试数据（SIMULATION 模式）
    console.log(`\n=== 检查是否为测试数据 ===`);
    const envCheck = await db.execute(sql`
      SELECT key, value FROM system_configs 
      WHERE key IN ('simulation_mode', 'test_data_multiplier', 'pricing_multiplier')
    `);
    console.log('系统配置:');
    console.table(envCheck.rows);
  }

  await client.end();
}

main().catch(console.error);
