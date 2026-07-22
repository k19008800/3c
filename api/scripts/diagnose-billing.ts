// 计费引擎 + 代理商体系深度诊断脚本
import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Client } = pkg;
import { eq, sql, desc } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';

async function main() {
  const client = new Client({
    connectionString: 'postgres://postgres:postgres@localhost:5432/threecloud'
  });
  await client.connect();
  const db = drizzle(client, { schema });

  console.log('\n=== 1. call_logs 表结构检查 ===');
  const callLogsColumns = await db.execute(sql`
    SELECT column_name, data_type, numeric_precision, numeric_scale 
    FROM information_schema.columns 
    WHERE table_name = 'call_logs' 
    AND column_name IN ('cost', 'prompt_tokens', 'completion_tokens', 'total_tokens')
    ORDER BY ordinal_position
  `);
  console.log('call_logs 字段精度:');
  console.table(callLogsColumns.rows);

  console.log('\n=== 2. 最近 5 条 call_logs 记录 ===');
  const recentCalls = await db.execute(sql`
    SELECT id, user_id, model_name, prompt_tokens, completion_tokens, 
           cost, status, created_at
    FROM call_logs
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log('最近调用记录:');
  console.table(recentCalls.rows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    model: r.model_name?.slice(0, 30),
    prompt: r.prompt_tokens,
    completion: r.completion_tokens,
    cost: r.cost,
    status: r.status,
    time: r.created_at?.toISOString?.() ?? r.created_at
  })));

  console.log('\n=== 3. vendor_models 售价检查 ===');
  const vendorModels = await db.execute(sql`
    SELECT vm.id, vm.vendor_id, v.name as vendor_name, vm.model_id, m.name as model_name,
           vm.sell_price_input, vm.sell_price_output, vm.cost_price_input, vm.cost_price_output
    FROM vendor_models vm
    LEFT JOIN vendors v ON vm.vendor_id = v.id
    LEFT JOIN models m ON vm.model_id = m.id
    ORDER BY vm.id
    LIMIT 10
  `);
  console.log('厂商模型售价:');
  console.table(vendorModels.rows.map((r: any) => ({
    id: r.id,
    vendor: r.vendor_name,
    model: r.model_name?.slice(0, 25),
    sell_in: r.sell_price_input,
    sell_out: r.sell_price_output,
    cost_in: r.cost_price_input,
    cost_out: r.cost_price_output
  })));

  console.log('\n=== 4. 系统配置：pricing_multiplier ===');
  const pricingMultiplier = await db.execute(sql`
    SELECT key, value FROM system_configs WHERE key = 'pricing_multiplier'
  `);
  console.log('pricing_multiplier:', pricingMultiplier.rows[0]?.value ?? '未设置（默认 1.0）');

  console.log('\n=== 5. 用户折扣检查 ===');
  const userDiscounts = await db.execute(sql`
    SELECT ud.id, ud.user_id, u.email, ud.discount_rate, ud.effective_from, ud.effective_until
    FROM user_discounts ud
    LEFT JOIN users u ON ud.user_id = u.id
    ORDER BY ud.id DESC
    LIMIT 5
  `);
  console.log('用户折扣:');
  console.table(userDiscounts.rows);

  console.log('\n=== 6. 代理商检查 ===');
  const agents = await db.execute(sql`
    SELECT a.id, a.user_id, u.email, a.total_commission, a.settled_commission, 
           a.pending_withdraw, a.frozen_amount, a.status
    FROM agents a
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.id
    LIMIT 10
  `);
  console.log('代理商列表:');
  console.table(agents.rows);

  console.log('\n=== 7. 佣金规则检查 ===');
  const commissionRules = await db.execute(sql`
    SELECT cr.id, cr.agent_id, cr.rule_type, cr.rate, cr.is_enabled, 
           cr.max_cap, cr.valid_from, cr.valid_until
    FROM commission_rules cr
    ORDER BY cr.agent_id, cr.rule_type
    LIMIT 15
  `);
  console.log('佣金规则:');
  console.table(commissionRules.rows);

  console.log('\n=== 8. 佣金日志检查 ===');
  const commissionLogs = await db.execute(sql`
    SELECT cl.id, cl.agent_id, cl.commission_type, cl.call_cost, 
           cl.commission_amount, cl.status, cl.created_at
    FROM commission_logs cl
    ORDER BY cl.created_at DESC
    LIMIT 10
  `);
  console.log('佣金日志:');
  console.table(commissionLogs.rows.map((r: any) => ({
    id: r.id,
    agent_id: r.agent_id,
    type: r.commission_type,
    call_cost: r.call_cost,
    commission: r.commission_amount,
    status: r.status,
    time: r.created_at?.toISOString?.() ?? r.created_at
  })));

  console.log('\n=== 9. 代理商客户关系检查 ===');
  const agentClients = await db.execute(sql`
    SELECT ac.id, ac.agent_id, ac.client_user_id, u.email as client_email
    FROM agent_clients ac
    LEFT JOIN users u ON ac.client_user_id = u.id
    ORDER BY ac.agent_id
    LIMIT 10
  `);
  console.log('代理商客户:');
  console.table(agentClients.rows);

  console.log('\n=== 10. 验证计费公式 ===');
  // 取一条有代表性的 call_log
  const sampleCall = await db.execute(sql`
    SELECT cl.id, cl.user_id, cl.vendor_model_id, cl.model_name,
           cl.prompt_tokens, cl.completion_tokens, cl.cost,
           vm.sell_price_input, vm.sell_price_output
    FROM call_logs cl
    LEFT JOIN vendor_models vm ON cl.vendor_model_id = vm.id
    WHERE cl.vendor_model_id IS NOT NULL
    ORDER BY cl.created_at DESC
    LIMIT 1
  `);
  
  if (sampleCall.rows.length > 0) {
    const call = sampleCall.rows[0] as any;
    console.log('\n样本调用记录:');
    console.log('  ID:', call.id);
    console.log('  模型:', call.model_name);
    console.log('  输入 tokens:', call.prompt_tokens);
    console.log('  输出 tokens:', call.completion_tokens);
    console.log('  实际 cost:', call.cost);
    console.log('  售价输入:', call.sell_price_input, '元/百万tokens');
    console.log('  售价输出:', call.sell_price_output, '元/百万tokens');
    
    // 计算原始成本
    const rawCost = (Number(call.prompt_tokens) * Number(call.sell_price_input) + 
                     Number(call.completion_tokens) * Number(call.sell_price_output)) / 1_000_000;
    console.log('\n  计算原始成本 (无折扣):', rawCost.toFixed(6), '元');
    
    // 获取系统乘数
    const pm = await db.execute(sql`SELECT value FROM system_configs WHERE key = 'pricing_multiplier'`);
    const multiplier = pm.rows[0] ? Number(pm.rows[0].value) : 1.0;
    
    // 获取用户折扣
    const userDisc = await db.execute(sql`
      SELECT discount_rate FROM user_discounts 
      WHERE user_id = ${call.user_id} 
      AND effective_from <= NOW() 
      AND (effective_until IS NULL OR effective_until > NOW())
    `);
    const discountRate = userDisc.rows[0] ? Number(userDisc.rows[0].discount_rate) : 1.0;
    
    // 用户类型折扣
    if (discountRate === 1.0) {
      const userType = await db.execute(sql`
        SELECT u.discount_rate, u.user_type FROM users u WHERE u.id = ${call.user_id}
      `);
      const ut = userType.rows[0] as any;
      if (ut?.discount_rate) {
        console.log('  用户折扣率:', ut.discount_rate);
      } else if (ut?.user_type === 'enterprise') {
        const entDisc = await db.execute(sql`SELECT value FROM system_configs WHERE key = 'enterprise_discount_rate'`);
        console.log('  企业用户折扣率:', entDisc.rows[0]?.value ?? '0.95');
      }
    } else {
      console.log('  用户折扣率:', discountRate);
    }
    
    const expectedCost = rawCost * multiplier * discountRate;
    console.log('\n  pricing_multiplier:', multiplier);
    console.log('  discount_rate:', discountRate);
    console.log('  预期 cost:', expectedCost.toFixed(6), '元');
    console.log('  实际 cost:', call.cost, '元');
    console.log('  差异:', (Number(call.cost) - expectedCost).toFixed(6), '元');
  }

  console.log('\n=== 11. 余额扣减事务检查 ===');
  const balanceLogs = await db.execute(sql`
    SELECT bl.id, bl.user_id, bl.amount, bl.balance_after, bl.type, 
           bl.ref_type, bl.ref_id, bl.created_at
    FROM balance_logs bl
    ORDER BY bl.created_at DESC
    LIMIT 10
  `);
  console.log('余额流水:');
  console.table(balanceLogs.rows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    amount: r.amount,
    balance_after: r.balance_after,
    type: r.type,
    ref_type: r.ref_type,
    ref_id: r.ref_id,
    time: r.created_at?.toISOString?.() ?? r.created_at
  })));

  console.log('\n=== 12. 结算单锁定检查 ===');
  // 检查 pending 状态的佣金是否被正确处理
  const pendingCommissions = await db.execute(sql`
    SELECT COUNT(*) as count, SUM(commission_amount) as total_amount
    FROM commission_logs 
    WHERE status = 'pending'
  `);
  console.log('待结算佣金:');
  console.table(pendingCommissions.rows);

  await client.end();
  console.log('\n=== 诊断完成 ===\n');
}

main().catch(console.error);
