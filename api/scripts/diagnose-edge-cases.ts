// 异常场景验证
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

  console.log('\n=== 异常场景验证 ===\n');

  // 1. 余额不足时的处理
  console.log('1. 余额不足检查');
  console.log('─'.repeat(60));
  
  const lowBalanceUsers = await db.execute(sql`
    SELECT id, email, balance, status 
    FROM users 
    WHERE balance <= 0 OR status = 'disabled'
    ORDER BY balance ASC
    LIMIT 10
  `);
  
  console.log('余额 ≤ 0 或状态为 disabled 的用户:');
  console.table(lowBalanceUsers.rows);
  
  // 检查 alert_stop_balance 配置
  const alertConfig = await db.execute(sql`
    SELECT key, value FROM system_configs 
    WHERE key IN ('alert_stop_balance', 'alert_low_balance')
  `);
  console.log('\n余额告警配置:');
  console.table(alertConfig.rows);
  
  // 检查余额耗尽时的错误日志
  const exhaustedLogs = await db.execute(sql`
    SELECT id, user_id, model_name, status, error_message, created_at
    FROM call_logs
    WHERE status = 'failed' 
    AND error_message LIKE '%余额%'
    ORDER BY created_at DESC
    LIMIT 5
  `);
  console.log('\n余额耗尽错误日志:');
  console.table(exhaustedLogs.rows.map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    model: r.model_name,
    status: r.status,
    error: r.error_message?.slice(0, 50),
    time: r.created_at?.toISOString?.()
  })));

  // 2. 佣金比例修改后，新请求是否按新比例计算
  console.log('\n\n2. 佣金比例变更检查');
  console.log('─'.repeat(60));
  
  // 检查佣金规则历史（是否有修改）
  const ruleHistory = await db.execute(sql`
    SELECT 
      cr.id,
      cr.agent_id,
      cr.rule_type,
      cr.rate,
      cr.is_enabled,
      cr.valid_from,
      cr.valid_until,
      cr.updated_at
    FROM commission_rules cr
    WHERE cr.agent_id IN (1, 2, 3)
    ORDER BY cr.agent_id, cr.rule_type
  `);
  
  console.log('佣金规则配置:');
  console.table(ruleHistory.rows);
  
  // 检查同一代理商不同时间的佣金是否按不同比例计算
  const commissionByTime = await db.execute(sql`
    SELECT 
      cl.id,
      cl.agent_id,
      cl.commission_type,
      cl.call_cost,
      cl.commission_amount,
      cl.calc_detail,
      cl.created_at
    FROM commission_logs cl
    WHERE cl.agent_id = 1
    AND cl.commission_type = 'sale'
    ORDER BY cl.created_at DESC
    LIMIT 10
  `);
  
  console.log('\n代理商 1 的佣金记录（检查比例变化）:');
  for (const row of commissionByTime.rows as any[]) {
    const calcDetail = row.calc_detail ? JSON.parse(row.calc_detail as string) : {};
    console.log(`ID ${row.id}: cost=${row.call_cost}, commission=${row.commission_amount}, rate=${calcDetail.rate ?? 'N/A'}`);
  }

  // 3. 结算单锁定后，是否还能修改
  console.log('\n\n3. 结算单锁定检查');
  console.log('─'.repeat(60));
  
  // 检查 settled 状态的佣金是否被保护
  const settledCommissions = await db.execute(sql`
    SELECT 
      cl.id,
      cl.agent_id,
      cl.commission_amount,
      cl.status,
      cl.settled_at,
      cl.voucher_no,
      a.settled_commission,
      a.pending_withdraw
    FROM commission_logs cl
    LEFT JOIN agents a ON cl.agent_id = a.id
    WHERE cl.status = 'settled'
    ORDER BY cl.settled_at DESC
    LIMIT 10
  `);
  
  console.log('已结算佣金:');
  console.table(settledCommissions.rows.map((r: any) => ({
    id: r.id,
    agent_id: r.agent_id,
    amount: r.commission_amount,
    status: r.status,
    settled_at: r.settled_at?.toISOString?.(),
    voucher_no: r.voucher_no
  })));
  
  // 检查代理商余额一致性
  console.log('\n代理商余额一致性检查:');
  for (const row of settledCommissions.rows.slice(0, 5) as any[]) {
    const agent = await db.execute(sql`
      SELECT 
        id,
        total_commission,
        settled_commission,
        pending_withdraw,
        frozen_amount
      FROM agents
      WHERE id = ${row.agent_id}
    `);
    
    const a = agent.rows[0] as any;
    console.log(`\nAgent ${a.id}:`);
    console.log(`  total_commission: ${a.total_commission}`);
    console.log(`  settled_commission: ${a.settled_commission}`);
    console.log(`  pending_withdraw: ${a.pending_withdraw}`);
    console.log(`  frozen_amount: ${a.frozen_amount}`);
    
    // 验证: pending_withdraw 应该等于已结算但未提现的金额
    // 这个需要结合 withdraw_orders 表来验证
  }

  // 4. Race Condition 检查：并发请求时的余额扣减
  console.log('\n\n4. Race Condition 检查');
  console.log('─'.repeat(60));
  
  // 检查是否有同一用户的并发调用记录
  const concurrentCalls = await db.execute(sql`
    SELECT 
      user_id,
      COUNT(*) as call_count,
      MIN(created_at) as first_call,
      MAX(created_at) as last_call,
      EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) as duration_seconds
    FROM call_logs
    WHERE created_at > NOW() - INTERVAL '1 hour'
    GROUP BY user_id
    HAVING COUNT(*) > 5
    ORDER BY call_count DESC
    LIMIT 10
  `);
  
  console.log('近期高频调用用户（可能的并发场景）:');
  console.table(concurrentCalls.rows);
  
  // 检查余额流水与 call_logs 的一致性
  console.log('\n余额流水与 call_logs 一致性检查:');
  const consistencyCheck = await db.execute(sql`
    SELECT 
      bl.id as balance_log_id,
      bl.user_id,
      bl.amount,
      bl.balance_after,
      bl.ref_type,
      bl.ref_id,
      cl.id as call_log_id,
      cl.cost as call_cost
    FROM balance_logs bl
    LEFT JOIN call_logs cl ON bl.ref_id = cl.id AND bl.ref_type = 'call'
    WHERE bl.type = 'consumption'
    AND bl.created_at > NOW() - INTERVAL '1 hour'
    ORDER BY bl.created_at DESC
    LIMIT 10
  `);
  
  console.table(consistencyCheck.rows.map((r: any) => ({
    balance_log_id: r.balance_log_id,
    user_id: r.user_id,
    amount: r.amount,
    call_cost: r.call_cost,
    match: Math.abs(Number(r.amount) - Number(r.call_cost ?? 0)) < 0.001 ? '✓' : '✗'
  })));

  // 5. DECIMAL(18,6) 截断逻辑验证
  console.log('\n\n5. DECIMAL(18,6) 截断逻辑验证');
  console.log('─'.repeat(60));
  
  // 检查是否有超过 6 位小数的记录
  const precisionCheck = await db.execute(sql`
    SELECT 
      id,
      cost,
      LENGTH(cost) - POSITION('.' IN cost) as decimal_places
    FROM call_logs
    WHERE cost LIKE '%.%'
    AND LENGTH(cost) - POSITION('.' IN cost) > 6
    LIMIT 10
  `);
  
  if (precisionCheck.rows.length > 0) {
    console.log('⚠️ 发现超过 6 位小数的记录:');
    console.table(precisionCheck.rows);
  } else {
    console.log('✓ 所有 cost 字段均符合 DECIMAL(18,6) 精度要求');
  }
  
  // 检查 commission_amount 精度
  const commissionPrecision = await db.execute(sql`
    SELECT 
      id,
      commission_amount,
      LENGTH(commission_amount) - POSITION('.' IN commission_amount) as decimal_places
    FROM commission_logs
    WHERE commission_amount LIKE '%.%'
    AND LENGTH(commission_amount) - POSITION('.' IN commission_amount) > 6
    LIMIT 10
  `);
  
  if (commissionPrecision.rows.length > 0) {
    console.log('\n⚠️ 发现超过 6 位小数的佣金记录:');
    console.table(commissionPrecision.rows);
  } else {
    console.log('✓ 所有 commission_amount 字段均符合 DECIMAL(18,6) 精度要求');
  }

  await client.end();
  console.log('\n=== 异常场景验证完成 ===\n');
}

main().catch(console.error);
