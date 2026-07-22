// 检查 vendor_model_id=91 的详细配置
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
      vm.cost_price_output,
      vm.vendor_key_group_id,
      vkg.name as key_group_name
    FROM vendor_models vm
    LEFT JOIN vendors v ON vm.vendor_id = v.id
    LEFT JOIN models m ON vm.model_id = m.id
    LEFT JOIN vendor_key_groups vkg ON vm.vendor_key_group_id = vkg.id
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
  
  // 检查是否有 key 级价格覆盖
  const keyPrices = await db.execute(sql`
    SELECT 
      vkgi.id as item_id,
      vkgi.vendor_key_group_id,
      vkg.name as group_name,
      vkgi.vendor_key_id,
      vk.name as key_name,
      vkmp.sell_price_input,
      vkmp.sell_price_output
    FROM vendor_key_group_items vkgi
    LEFT JOIN vendor_key_groups vkg ON vkgi.vendor_key_group_id = vkg.id
    LEFT JOIN vendor_keys vk ON vkgi.vendor_key_id = vk.id
    LEFT JOIN vendor_key_group_model_prices vkmp ON vkmp.vendor_key_group_item_id = vkgi.id AND vkmp.model_id = (SELECT model_id FROM vendor_models WHERE id = 91)
    WHERE vkgi.vendor_key_group_id = (SELECT vendor_key_group_id FROM vendor_models WHERE id = 91)
  `);
  
  console.log('\nKey 级价格配置:');
  console.table(keyPrices.rows);
  
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
  }

  await client.end();
}

main().catch(console.error);
