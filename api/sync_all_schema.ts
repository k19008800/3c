/**
 * 生产 DB 全量同步脚本
 * 对比 Drizzle schema 和生产 DB，补全所有缺失的表和列
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { pool } from "./src/db/index";

// ===== 手动提取所有 Drizzle schema 表结构（文件名 -> 表名 -> 列定义） =====
// 从 pgTable 定义中提取列名和类型，仅用于 CREATE TABLE/ALTER TABLE
// 注意：列类型字符串需映射到 PostgreSQL 类型

interface ColDef { name: string; type: string; nullable: boolean; defaultVal?: string; }
interface TableDef { tableName: string; columns: ColDef[]; fileName: string; }

function parseDrizzleFile(filePath: string, fileName: string): TableDef | null {
  const content = readFileSync(filePath, "utf8");
  const tableMatch = content.match(/pgTable\(\s*"(\w+)"\s*,/);
  if (!tableMatch) return null;
  const tableName = tableMatch[1];

  const columns: ColDef[] = [];

  // 匹配 Drizzle 列定义: colName: typeFunction("db_column_name", { ... })
  // 模式: identifier: pgType("db_col"...) | identifier: type("db_col"...)
  const colRegex = /(\w+):\s*(\w+)\(\s*"(\w+)"/g;
  let m;
  while ((m = colRegex.exec(content)) !== null) {
    const [_, jsName, typeFunc, dbCol] = m;
    // 跳过 self-referencing columns
    if (dbCol === "agent_id" && typeFunc === "integer") {
      columns.push({ name: dbCol, type: "INTEGER", nullable: true });
      continue;
    }
    columns.push({ name: dbCol, type: typeFuncToPG(typeFunc), nullable: !isRequired(content, jsName, dbCol), defaultVal: getDefault(content, jsName, dbCol) });
  }

  return { tableName, columns, fileName };
}

function typeFuncToPG(fn: string): string {
  const map: Record<string, string> = {
    serial: "SERIAL",
    integer: "INTEGER",
    varchar: "VARCHAR(255)",
    text: "TEXT",
    boolean: "BOOLEAN",
    timestamp: "TIMESTAMP",
    numeric: "NUMERIC",
    jsonb: "JSONB",
    json: "JSON",
    bigint: "BIGINT",
  };
  return map[fn] || fn.toUpperCase();
}

function isRequired(content: string, jsName: string, dbCol: string): boolean {
  // 检查列定义附近是否有 .notNull()
  const idx = content.indexOf(`"${dbCol}"`);
  if (idx < 0) return false;
  const after = content.slice(idx, idx + 500);
  return /notNull\(\)/.test(after);
}

function getDefault(content: string, jsName: string, dbCol: string): string | undefined {
  const idx = content.indexOf(`"${dbCol}"`);
  if (idx < 0) return undefined;
  const after = content.slice(idx, idx + 500);
  const defMatch = after.match(/\.default\(([^)]+)\)/);
  if (!defMatch) return undefined;
  const val = defMatch[1].trim();
  if (val === "now()") return "NOW()";
  if (val === "true") return "true";
  if (val === "false") return "false";
  if (/^\d+$/.test(val)) return val;
  return `'${val.replace(/'/g, "''")}'`;
}

async function main() {
  const schemaDir = join(import.meta.dirname || __dirname, "src/db/schema");
  const files = readdirSync(schemaDir).filter(f => f.endsWith(".ts") && f !== "index.ts");

  // 解析所有 Drizzle 表
  const tables: TableDef[] = [];
  for (const file of files) {
    const def = parseDrizzleFile(join(schemaDir, file), file);
    if (def) tables.push(def);
  }

  console.log(`Parsed ${tables.length} tables from Drizzle schema\n`);

  // 获取生产库现有表和列
  const dbTables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  const dbTableSet = new Set(dbTables.rows.map((r: any) => r.table_name));

  let createCount = 0;
  let alterCount = 0;

  for (const t of tables) {
    if (t.tableName === "users" && t.columns.some(c => c.name === "agent_id")) {
      // Fix: agent_id is a self-reference, need to add WITHOUT FK first
      // Already done via fix_prod_db.ts
    }

    if (!dbTableSet.has(t.tableName)) {
      // 创建缺失表
      const colDefs = t.columns.map(c => {
        let def = `"${c.name}" ${c.type}`;
        if (c.defaultVal) def += ` DEFAULT ${c.defaultVal}`;
        if (!c.nullable && c.defaultVal === undefined && c.type !== "SERIAL") def += " NOT NULL";
        return def;
      }).join(", ");

      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS "${t.tableName}" (${colDefs})`);
        console.log(`✅ CREATED: ${t.tableName} (${t.columns.length} cols)`);
        createCount++;
      } catch (e: any) {
        console.log(`⏭️  ${t.tableName}: ${e.message?.slice(0, 80)}`);
      }
    } else {
      // 为已存在的表添加缺失列
      const dbCols = await pool.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
        [t.tableName]
      );
      const dbColSet = new Set(dbCols.rows.map((r: any) => r.column_name));

      for (const c of t.columns) {
        if (!dbColSet.has(c.name)) {
          let def = `"${c.name}" ${c.type}`;
          if (c.defaultVal) def += ` DEFAULT ${c.defaultVal}`;
          try {
            await pool.query(`ALTER TABLE "${t.tableName}" ADD COLUMN ${def}`);
            alterCount++;
          } catch (e: any) {
            // 某些列（如 FK 自引用）可能失败，记录但继续
            console.log(`⏭️  ${t.tableName}.${c.name}: ${e.message?.slice(0, 80)}`);
          }
        }
      }
    }
  }

  console.log(`\n=== Done ===`);
  console.log(`Tables created: ${createCount}`);
  console.log(`Columns added:  ${alterCount}`);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
