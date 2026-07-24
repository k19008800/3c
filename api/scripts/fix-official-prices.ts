// ============================================================
//  修正所有模型为官方价格（元/百万 token）
//  汇率：$1 = ¥7
// ============================================================

import { createDb, getDb } from '../src/db/index.js';
import { vendorModels } from '../src/db/schema.js';
import { eq, inArray } from 'drizzle-orm';

createDb();
const db = getDb();

// 官方价格表（元/百万 token）
// 汇率按 $1 = ¥7 计算
const OFFICIAL_PRICES: Record<string, { input: number; output: number }> = {
  // DeepSeek V4 系列（2026-07 最新价格）
  'deepseek-v4-flash': { input: 1, output: 2 },        // 缓存未命中
  'deepseek-v4-pro': { input: 3, output: 6 },          // 缓存未命中
  'deepseek-chat': { input: 1, output: 2 },            // 别名，指向 v4-flash

  // Claude 系列（2026-06 官方价格，$1=¥7）
  'claude-opus-4-8': { input: 35, output: 175 },       // $5/$25
  'claude-opus-4-7': { input: 35, output: 175 },       // $5/$25
  'claude-opus-4.6': { input: 35, output: 175 },       // $5/$25
  'claude-opus-4.7-fast': { input: 35, output: 175 },  // $5/$25
  'claude-sonnet-4-6': { input: 21, output: 105 },     // $3/$15
  'claude-sonnet-4.6': { input: 21, output: 105 },     // $3/$15
  'claude-sonnet-4-5': { input: 21, output: 105 },     // $3/$15
  'claude-sonnet-4.5': { input: 21, output: 105 },     // $3/$15
  'claude-sonnet-5': { input: 14, output: 70 },        // $2/$10 (促销价至8月31日)
  'claude-haiku-4-5': { input: 7, output: 35 },        // $1/$5
  'claude-haiku-4.5': { input: 7, output: 35 },        // $1/$5
  'claude-fable-5': { input: 35, output: 175 },        // $5/$25 (估算)

  // GPT 系列（2026-07 官方价格）
  'gpt-4o': { input: 18, output: 72 },                 // $2.5/$10
  'gpt-4o-mini': { input: 1, output: 4 },              // $0.15/$0.60
  'gpt-5.4': { input: 18, output: 72 },                // $2.5/$10
  'gpt-5.5': { input: 36, output: 216 },               // $5/$30
  'gpt-5.4-pro': { input: 36, output: 216 },           // $5/$30
  'gpt-5.5-pro': { input: 72, output: 432 },           // $10/$60

  // GLM 系列
  'glm-5.1': { input: 14, output: 56 },                // $2/$8
  'glm-5.2': { input: 14, output: 56 },                // $2/$8
  'glm-4.6v-flash': { input: 7, output: 28 },          // $1/$4

  // Gemini 系列
  'gemini-3.5-flash': { input: 7, output: 21 },        // $1/$3
  'gemini-3-pro-preview': { input: 14, output: 42 },   // $2/$6
  'gemini-3.1-pro-preview': { input: 14, output: 42 }, // $2/$6

  // Qwen 系列
  'qwen3.6-plus': { input: 14, output: 42 },           // $2/$6
  'qwen3.5-plus': { input: 7, output: 21 },            // $1/$3
  'Qwen3.5-9B': { input: 1, output: 4 },               // $0.15/$0.60

  // Kimi 系列
  'kimi-k2.6': { input: 21, output: 84 },              // $3/$12
  'kimi-k2.7-code': { input: 21, output: 84 },         // $3/$12

  // MiniMax 系列
  'minimax-m2.5': { input: 14, output: 42 },           // $2/$6
  'minimax-latest': { input: 14, output: 42 },         // $2/$6

  // Embedding 模型
  'text-embedding-3-small': { input: 0.7, output: 0 }, // $0.1/M, 无输出
  'bge_m3': { input: 0.7, output: 0 },                 // $0.1/M
  'bge_reranker_v3': { input: 0.7, output: 0 },        // $0.1/M
};

async function fixPrices() {
  console.log('=== 开始修正价格 ===\n');

  // 获取所有映射
  const allModels = await db.select().from(vendorModels);
  console.log(`共 ${allModels.length} 条映射记录\n`);

  const updates: Array<{ id: number; model: string; oldIn: string; oldOut: string; newIn: number; newOut: number }> = [];

  for (const vm of allModels) {
    const price = OFFICIAL_PRICES[vm.upstreamModelName];
    if (price && (Number(vm.costPriceInput) !== price.input || Number(vm.costPriceOutput) !== price.output)) {
      updates.push({
        id: vm.id,
        model: vm.upstreamModelName,
        oldIn: vm.costPriceInput,
        oldOut: vm.costPriceOutput,
        newIn: price.input,
        newOut: price.output,
      });
    }
  }

  console.log(`需要修正 ${updates.length} 条记录：\n`);

  for (const u of updates) {
    console.log(`ID ${u.id}: ${u.model}`);
    console.log(`  旧价格: 入 ${u.oldIn} / 出 ${u.oldOut}`);
    console.log(`  新价格: 入 ${u.newIn} / 出 ${u.newOut}\n`);
  }

  // 执行更新
  if (updates.length > 0) {
    console.log('\n开始更新数据库...');
    for (const u of updates) {
      await db
        .update(vendorModels)
        .set({
          costPriceInput: u.newIn.toString(),
          costPriceOutput: u.newOut.toString(),
          sellPriceInput: u.newIn.toString(),
          sellPriceOutput: u.newOut.toString(),
          updatedAt: new Date(),
        })
        .where(eq(vendorModels.id, u.id));
    }
    console.log(`✅ 已更新 ${updates.length} 条记录`);
  } else {
    console.log('✅ 所有价格已是官方价格，无需更新');
  }

  process.exit(0);
}

fixPrices().catch((err) => {
  console.error('❌ 错误:', err);
  process.exit(1);
});