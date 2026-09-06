/**
 * model_code 回填脚本（「模型编码化改造」阶段 B / B4）
 *
 * 为存量 supplier_models 中 model_code 为空的行生成编码。
 *
 * 规则（PRD v1.2 M-C-01R / M-C-07 + PRD 补充1 §2）：
 * - 编码规则后台可自定义：读取 system_config 键 `model_code.template`；
 *   无配置 / 配置为空 → 默认模板「厂商+模型」= {supplier_code}-{model_name}。
 * - 渲染/清洗/序号兜底逻辑与 services/upstream/model-code.ts（B1 renderModelCode）保持完全一致：
 *   仅保留 [a-zA-Z0-9_-]（其余替换为 -）、连续 - 合并、首尾 - 去除、截断 200、
 *   全清洗为空报错、唯一冲突追加 -{seq}（2,3,…，上限 1000）。
 * - 幂等：只更新 model_code IS NULL 的行；存量非空编码不重写（M-C-07：模板变更不影响已生成编码）。
 *
 * 参数：
 *   --dry-run   预览不改库（打印每行将生成的编码）
 *   --template <tpl>  临时指定模板（不落库，优先于 system_config）
 *
 * 依赖：0038_model_code.sql 迁移已执行（列/表已存在）。
 *
 * 用法: npx tsx scripts/backfill-model-codes.ts [--dry-run] [--template '{supplier_code}-{model_name}']（前置 DATABASE_URL）
 */
import postgres from 'postgres';

// ============================================================
// 编码生成规则（与 services/upstream/model-code.ts B1 完全一致）
// ============================================================

const DEFAULT_TEMPLATE = '{supplier_code}-{model_name}';
const ALLOWED_VARS = ['supplier_code', 'supplier_name', 'model_name', 'model_short', 'platform_model', 'seq'];
const MODEL_CODE_MAX_LENGTH = 200;
const MODEL_CODE_SEQ_MAX = 1000;
const MODEL_SHORT_MAX_LENGTH = 12;

/** 校验模板：空 / 含 @ / 未知变量 → 报错（规则与 validateModelCodeTemplate 一致） */
function validateTemplate(template: string): void {
  if (!template || !template.trim()) throw new Error('模板不能为空');
  if (template.includes('@')) throw new Error('模板不得包含 @');
  const re = /\{([a-z_]+)\}/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const v = m[1]!;
    if (seen.has(v)) continue;
    seen.add(v);
    if (!ALLOWED_VARS.includes(v)) throw new Error(`未知变量: {${v}}`);
  }
}

/** 清洗编码片段：仅保留 [a-zA-Z0-9_-]，其余替换为 -；连续 - 合并；首尾去除；截断 maxLen 后再去首尾（与 B1 sanitizeModelCodePart 一致） */
function sanitize(s: string, maxLen: number = MODEL_CODE_MAX_LENGTH): string {
  return String(s ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/^-+|-+$/g, '');
}

/** {model_short} 模型名缩写（保留连字符版，与 B1 shortModelName 一致） */
function shortModelName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MODEL_SHORT_MAX_LENGTH)
    .replace(/^-+|-+$/g, '');
}

interface TemplateVars {
  supplierCode: string;
  supplierName: string;
  modelName: string;
  platformModel: string;
}

/** 用给定 seq 渲染一次并清洗（与 B1 renderOnce 一致） */
function renderOnce(template: string, vars: TemplateVars, seqVal: string): string {
  let out = template;
  out = out.replaceAll('{supplier_code}', String(vars.supplierCode ?? ''));
  out = out.replaceAll('{supplier_name}', String(vars.supplierName ?? ''));
  out = out.replaceAll('{model_name}', String(vars.modelName ?? ''));
  out = out.replaceAll('{platform_model}', String(vars.platformModel ?? ''));
  out = out.replaceAll('{model_short}', shortModelName(String(vars.modelName ?? '')));
  out = out.replaceAll('{seq}', seqVal);
  return sanitize(out);
}

/** 渲染唯一编码：校验 → 渲染 → 清洗 → 全空报错 → 冲突序号兜底（与 B1 renderModelCode 一致） */
function renderModelCode(template: string, vars: TemplateVars, occupied: Set<string>): string {
  validateTemplate(template);
  const hasSeq = template.includes('{seq}');

  if (occupied.size === 0) {
    const code = renderOnce(template, vars, '1');
    if (!code) throw new Error('变量值不可编码，请使用厂商 code 或模型名');
    return code;
  }

  if (hasSeq) {
    for (let seq = 1; seq <= MODEL_CODE_SEQ_MAX; seq++) {
      const candidate = renderOnce(template, vars, String(seq));
      if (!candidate) continue;
      if (!occupied.has(candidate)) return candidate;
    }
    throw new Error('模型编码冲突，无法生成唯一编码');
  }

  const base = renderOnce(template, vars, '1');
  if (!base) throw new Error('变量值不可编码，请使用厂商 code 或模型名');
  if (!occupied.has(base)) return base;
  for (let n = 2; n <= MODEL_CODE_SEQ_MAX; n++) {
    const candidate = `${base}-${n}`;
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error('模型编码冲突，无法生成唯一编码');
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');

  // 参数解析：--dry-run / --template <tpl>
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  let cliTemplate = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template') cliTemplate = args[i + 1] ?? '';
  }

  const sql = postgres(connectionString, { max: 1 });

  try {
    // 1. 读取当前模板：--template 优先 → system_config → 默认「厂商+模型」
    let template = DEFAULT_TEMPLATE;
    if (cliTemplate) {
      template = cliTemplate;
    } else {
      const cfg = await sql`SELECT value FROM system_config WHERE key = 'model_code.template' LIMIT 1`;
      if (cfg.length > 0 && String(cfg[0].value).length > 0) {
        template = String(cfg[0].value);
      }
    }
    validateTemplate(template);
    console.log(`模板：${template}${cliTemplate ? '（--template 临时指定）' : template === DEFAULT_TEMPLATE ? '（默认 厂商+模型）' : '（system_config）'}`);

    // 2. 待回填行（幂等：只处理 model_code IS NULL）
    const rows = await sql`
      SELECT sm.id, sm.model_name, sm.platform_model, sm.supplier_id
      FROM supplier_models sm
      WHERE sm.model_code IS NULL`;

    if (rows.length === 0) {
      console.log('无待回填 supplier_models（model_code 均已填充或表为空）。');
      return;
    }

    // 3. 已占用编码（含当前行旧值；重新生成时旧值视为占用 → 强制新编码，防复用）
    const occupied = new Set<string>();
    const existing = await sql`SELECT model_code FROM supplier_models WHERE model_code IS NOT NULL`;
    for (const r of existing) {
      if (r.model_code) occupied.add(String(r.model_code));
    }

    // 4. 供应商信息（code/name）
    const suppliers = await sql`SELECT id, code, name FROM suppliers`;
    const supBySupplier = new Map<number, { code: string; name: string }>();
    for (const s of suppliers) {
      supBySupplier.set(Number(s.id), { code: String(s.code ?? s.id), name: String(s.name ?? '') });
    }

    // 5. 逐行渲染
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
      const sup = supBySupplier.get(Number(row.supplier_id)) ?? { code: String(row.supplier_id), name: '' };
      const vars: TemplateVars = {
        supplierCode: sup.code,
        supplierName: sup.name,
        modelName: String(row.model_name ?? ''),
        platformModel: String(row.platform_model ?? row.model_name ?? ''),
      };
      let candidate: string;
      try {
        candidate = renderModelCode(template, vars, occupied);
      } catch (e) {
        console.warn(`[跳过] id=${row.id} model=${vars.modelName} supplier=${sup.code}：${(e as Error).message}`);
        skipped += 1;
        continue;
      }
      occupied.add(candidate);
      if (dryRun) {
        console.log(`[dry-run] id=${row.id} model=${vars.modelName} supplier=${sup.code} → ${candidate}`);
      } else {
        await sql`UPDATE supplier_models SET model_code = ${candidate} WHERE id = ${row.id}`;
        updated += 1;
      }
    }

    if (dryRun) {
      console.log(`dry-run 完成：共 ${rows.length} 行，可生成 ${updated + skipped === rows.length ? rows.length - skipped : updated} 行，跳过 ${skipped} 行（未写库）。`);
    } else {
      console.log(`model_code 回填完成：${updated} 行（增量），跳过 ${skipped} 行。`);
    }
  } finally {
    await sql.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('回填失败:', e);
    process.exit(1);
  });
