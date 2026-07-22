// 深入诊断计费差异
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

  console.log('\n=== 深入诊断计费差异 ===\n');

  // 查找有代表性的成功调用记录
  const sampleCalls = await db.execute(sql`
    SELECT 
      cl.id, 
      cl.user_id, 
      cl.vendor_model_id, 
      cl.model_name,
      cl.vendor_name,
      cl.prompt_tokens, 
      cl.completion_tokens, 
      cl.cost,
      cl.key_group_item_id,
      cl.key_sell_price_input,
      cl.key_sell_price_output,
      cl.price_source,
      cl.price_source_id,
      cl.created_at,
      vm.sell_price_input as vm_sell_in,
      vm.sell_price_output as vm_sell_out,
      u.discount_rate as user_discount,
      u.user_type
    FROM call_logs cl
    LEFT JOIN vendor_models vm ON cl.vendor_model_id = vm.id
    LEFT JOIN users u ON cl.user_id = u.id
    WHERE cl.status = 'success' 
    AND cl.prompt_tokens > 0
    AND cl.vendor_model_id IS NOT NULL
    ORDER BY cl.created_at DESC
    LIMIT 10
  `);

  console.log('成功调用记录详情:\n');
  
  for (const call of sampleCalls.rows as any[]) {
    console.log('─'.repeat(80));
    console.log(`Call ID: ${call.id} | User: ${call.user_id} | Time: ${call.created_at}`);
    console.log(`Model: ${call.model_name} | Vendor: ${call.vendor_name}`);
    console.log(`Tokens: prompt=${call.prompt_tokens}, completion=${call.completion_tokens}`);
    console.log(`实际 cost: ${call.cost} 元`);
    
    // 确定使用的价格
    let sellPriceInput: number;
    let sellPriceOutput: number;
    let priceSource: string;
    
    if (call.key_sell_price_input !== null && call.key_sell_price_output !== null) {
      sellPriceInput = Number(call.key_sell_price_input);
      sellPriceOutput = Number(call.key_sell_price_output);
      priceSource = `Key 级价格 (item_id=${call.key_group_item_id})`;
    } else if (call.vm_sell_in !== null) {
      sellPriceInput = Number(call.vm_sell_in);
      sellPriceOutput = Number(call.vm_sell_out);
      priceSource = `厂商模型基价 (vendor_model_id=${call.vendor_model_id})`;
    } else {
      console.log('  ⚠️ 无法确定价格来源');
      continue;
    }
    
    console.log(`价格来源: ${priceSource}`);
    console.log(`  sell_price_input: ${sellPriceInput} 元/百万tokens`);
    console.log(`  sell_price_output: ${sellPriceOutput} 元/百万tokens`);
    
    // 计算原始成本
    const rawCost = (Number(call.prompt_tokens) * sellPriceInput + 
                     Number(call.completion_tokens) * sellPriceOutput) / 1_000_000;
    console.log(`\n原始成本: ${rawCost.toFixed(6)} 元`);
    
    // 获取系统乘数
    const pm = await db.execute(sql`SELECT value FROM system_configs WHERE key = 'pricing_multiplier'`);
    const multiplier = pm.rows[0] ? Number(pm.rows[0].value) : 1.0;
    
    // 获取用户折扣
    let discountRate = 1.0;
    
    // 1. 检查 user_discounts 表
    const userDisc = await db.execute(sql`
      SELECT discount_rate FROM user_discounts 
      WHERE user_id = ${call.user_id} 
      AND effective_from <= NOW() 
      AND (effective_until IS NULL OR effective_until > NOW())
      ORDER BY effective_from DESC
      LIMIT 1
    `);
    
    if (userDisc.rows.length > 0) {
      discountRate = Number(userDisc.rows[0].discount_rate);
      console.log(`用户折扣 (user_discounts): ${discountRate}`);
    } else if (call.user_discount) {
      discountRate = Number(call.user_discount);
      console.log(`用户折扣 (users.discount_rate): ${discountRate}`);
    } else if (call.user_type === 'enterprise') {
      const entDisc = await db.execute(sql`SELECT value FROM system_configs WHERE key = 'enterprise_discount_rate'`);
      discountRate = entDisc.rows[0] ? Number(entDisc.rows[0].value) : 0.95;
      console.log(`企业用户折扣 (enterprise_discount_rate): ${discountRate}`);
    } else {
      console.log(`用户折扣: 无 (使用 1.0)`);
    }
    
    // 计算预期成本
    const expectedCost = rawCost * multiplier * discountRate;
    console.log(`\n计费公式:`);
    console.log(`  rawCost = (prompt_tokens × sellPriceInput + completion_tokens × sellPriceOutput) / 1,000,000`);
    console.log(`         = (${call.prompt_tokens} × ${sellPriceInput} + ${call.completion_tokens} × ${sellPriceOutput}) / 1,000,000`);
    console.log(`         = ${rawCost.toFixed(6)}`);
    console.log(`  cost = rawCost × pricingMultiplier × discountRate`);
    console.log(`       = ${rawCost.toFixed(6)} × ${multiplier} × ${discountRate}`);
    console.log(`       = ${expectedCost.toFixed(6)}`);
    
    const diff = Number(call.cost) - expectedCost;
    const diffPercent = expectedCost > 0 ? (diff / expectedCost * 100).toFixed(2) : 'N/A';
    
    console.log(`\n比较:`);
    console.log(`  预期 cost: ${expectedCost.toFixed(6)} 元`);
    console.log(`  实际 cost: ${call.cost} 元`);
    console.log(`  差异: ${diff.toFixed(6)} 元 (${diffPercent}%)`);
    
    if (Math.abs(diff) > 0.001) {
      console.log(`  ⚠️ 差异超过 0.001 元，需要调查！`);
    } else {
      console.log(`  ✓ 差异在可接受范围内`);
    }
    console.log('');
  }

  // 检查佣金计算
  console.log('\n=== 佣金计算验证 ===\n');
  
  const commissionSamples = await db.execute(sql`
    SELECT 
      cl.id as call_log_id,
      cl.user_id,
      cl.cost as call_cost,
      cml.id as commission_log_id,
      cml.agent_id,
      cml.commission_amount,
      cml.commission_type,
      cml.calc_detail,
      cr.rate as rule_rate,
      cr.max_cap as rule_max_cap,
      ac.agent_id as client_agent_id
    FROM call_logs cl
    INNER JOIN commission_logs cml ON cml.client_call_log_id = cl.id
    LEFT JOIN commission_rules cr ON cr.agent_id = cml.agent_id AND cr.rule_type = cml.commission_type
    LEFT JOIN agent_clients ac ON ac.client_user_id = cl.user_id
    WHERE cl.status = 'success'
    ORDER BY cl.created_at DESC
    LIMIT 5
  `);
  
  for (const row of commissionSamples.rows as any[]) {
    console.log('─'.repeat(80));
    console.log(`Call ID: ${row.call_log_id} | User: ${row.user_id}`);
    console.log(`Call Cost: ${row.call_cost} 元`);
    console.log(`Agent ID: ${row.agent_id} (client_agent_id: ${row.client_agent_id})`);
    console.log(`Commission Type: ${row.commission_type}`);
    console.log(`Rule Rate: ${row.rule_rate}, Max Cap: ${row.rule_max_cap}`);
    console.log(`Commission Amount: ${row.commission_amount} 元`);
    
    // 验证佣金计算
    const callCost = Number(row.call_cost);
    const rate = Number(row.rule_rate);
    const maxCap = row.rule_max_cap ? Number(row.rule_max_cap) : null;
    
    let expectedCommission = callCost * rate;
    if (maxCap !== null) {
      expectedCommission = Math.min(expectedCommission, maxCap);
    }
    
    console.log(`\n佣金计算:`);
    console.log(`  expected = callCost × rate = ${callCost} × ${rate} = ${expectedCommission.toFixed(6)}`);
    if (maxCap !== null) {
      console.log(`  capped = min(${expectedCommission.toFixed(6)}, ${maxCap}) = ${Math.min(expectedCommission, maxCap).toFixed(6)}`);
    }
    
    const commDiff = Number(row.commission_amount) - expectedCommission;
    console.log(`\n比较:`);
    console.log(`  预期: ${expectedCommission.toFixed(6)} 元`);
    console.log(`  实际: ${row.commission_amount} 元`);
    console.log(`  差异: ${commDiff.toFixed(6)} 元`);
    
    if (row.calc_detail) {
      console.log(`\n计算详情 (calc_detail):`);
      console.log(JSON.stringify(row.calc_detail, null, 2));
    }
    console.log('');
  }

  await client.end();
  console.log('=== 深入诊断完成 ===\n');
}

main().catch(console.error);
