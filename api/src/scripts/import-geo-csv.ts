// ============================================================
//  3cloud (3C) — GeoIP CSV 块数据导入脚本
//  读取 GeoLite2-City-Blocks-IPv4.csv / IPv6.csv
//  分批 INSERT 导入 PostgreSQL
//  使用：npx tsx src/scripts/import-geo-csv.ts
// ============================================================

import "dotenv/config";
import { createDb, pool } from "../db/index.js";
import * as fs from "node:fs";
import * as readline from "node:readline";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

createDb();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "..", "..", "..", "api", "data");

const IPV4_PATH = resolve(DATA_DIR, "GeoLite2-City-Blocks-IPv4.csv");
const IPV6_PATH = resolve(DATA_DIR, "GeoLite2-City-Blocks-IPv6.csv");

const BATCH_SIZE = 2000;

// ── CSV 行解析 ──

interface CsvRow {
  network: string;
  geonameId: number | null;
  registeredCountryGeonameId: number | null;
  representedCountryGeonameId: number | null;
  isAnonymousProxy: boolean;
  isSatelliteProvider: boolean;
  isAnycast: boolean;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyRadius: number | null;
}

function parseLine(line: string): CsvRow {
  const f = line.split(",");
  return {
    network: f[0] || "",
    geonameId: f[1] ? (parseInt(f[1], 10) || null) : null,
    registeredCountryGeonameId: f[2] ? (parseInt(f[2], 10) || null) : null,
    representedCountryGeonameId: f[3] ? (parseInt(f[3], 10) || null) : null,
    isAnonymousProxy: f[4] === "1",
    isSatelliteProvider: f[5] === "1",
    isAnycast: f[10] === "1",
    postalCode: f[6] || null,
    latitude: f[7] ? (parseFloat(f[7]) || null) : null,
    longitude: f[8] ? (parseFloat(f[8]) || null) : null,
    accuracyRadius: f[9] ? (parseInt(f[9], 10) || null) : null,
  };
}

// ── 批量 INSERT ──

async function insertBatch(
  client: any,
  batch: CsvRow[],
): Promise<void> {
  const placeholders: string[] = [];
  const params: any[] = [];
  let idx = 1;

  for (const row of batch) {
    placeholders.push(
      `($${idx}::cidr, $${idx + 1}::int, $${idx + 2}::int, $${idx + 3}::int, $${idx + 4}::bool, $${idx + 5}::bool, $${idx + 6}::bool, $${idx + 7}::varchar, $${idx + 8}::float8, $${idx + 9}::float8, $${idx + 10}::int)`,
    );
    params.push(
      row.network,
      row.geonameId,
      row.registeredCountryGeonameId,
      row.representedCountryGeonameId,
      row.isAnonymousProxy,
      row.isSatelliteProvider,
      row.isAnycast,
      row.postalCode,
      row.latitude,
      row.longitude,
      row.accuracyRadius,
    );
    idx += 11;
  }

  await client.query(
    `INSERT INTO ip_geo_blocks
      (network, geoname_id, registered_country_geoname_id, represented_country_geoname_id,
       is_anonymous_proxy, is_satellite_provider, is_anycast,
       postal_code, latitude, longitude, accuracy_radius)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (network) DO NOTHING`,
    params,
  );
}

// ── 流式读取并分批导入 CSV ──

async function importCsv(
  client: any,
  filePath: string,
  label: string,
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.log(`  ⏭️  ${label} 文件不存在: ${filePath}`);
    return;
  }

  const startTime = Date.now();
  let rowCount = 0;
  let batch: CsvRow[] = [];
  let isFirstLine = true;
  let skipped = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf-8", highWaterMark: 128 * 1024 }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const row = parseLine(line);
    if (!row.network) {
      skipped++;
      continue;
    }

    batch.push(row);
    rowCount++;

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(client, batch);
      batch = [];

      if (rowCount % 100_000 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = (rowCount / Math.max(1, parseFloat(elapsed))).toFixed(0);
        process.stdout.write(
          `\r  ${label}: ${rowCount.toLocaleString()} rows  (${elapsed}s, ${rate} rows/s)`,
        );
      }
    }
  }

  // 剩余行
  if (batch.length > 0) {
    await insertBatch(client, batch);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rate = (rowCount / Math.max(1, parseFloat(elapsed))).toFixed(0);
  console.log(
    `\r  ✅ ${label}: ${rowCount.toLocaleString()} rows  (${elapsed}s, ${rate} rows/s)${skipped > 0 ? `, ${skipped} skipped` : ""}`,
  );
}

// ── 主流程 ──

async function main() {
  console.log("🌍 GeoIP 块数据导入\n");

  console.log(`  CSV 目录: ${DATA_DIR}`);
  console.log(`  批大小: ${BATCH_SIZE.toLocaleString()} rows/batch\n`);

  const client = await pool.connect();
  try {
    // 1. 检查表
    const tbl = await client.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'ip_geo_blocks')",
    );
    if (!tbl.rows[0].exists) {
      console.error("❌ ip_geo_blocks 表不存在！请先运行迁移:");
      console.error("   npx tsx src/db/migrations/2026-06-29-ip-geo-blocks.ts");
      process.exit(1);
    }

    // 2. 清空旧数据
    const existing = await client.query("SELECT COUNT(*) FROM ip_geo_blocks");
    const existingCount = parseInt(existing.rows[0].count, 10);
    console.log(`  当前数据: ${existingCount.toLocaleString()} 行`);
    if (existingCount > 0) {
      console.log("  🔄 清空旧数据...");
      await client.query("TRUNCATE ip_geo_blocks");
      console.log("  ✅ 已清空");
    }
    console.log("");

    // 3. 逐个导入
    await importCsv(client, IPV4_PATH, "IPv4");
    await importCsv(client, IPV6_PATH, "IPv6");

    // 4. 分析表
    console.log("\n  🔄 ANALYZE...");
    await client.query("ANALYZE ip_geo_blocks");

    // 5. 汇总
    const final = await client.query("SELECT COUNT(*) FROM ip_geo_blocks");
    const finalCount = parseInt(final.rows[0].count, 10);

    const v4cnt = await client.query(
      "SELECT COUNT(*) FROM ip_geo_blocks WHERE family(network) = 4",
    );
    const v6cnt = await client.query(
      "SELECT COUNT(*) FROM ip_geo_blocks WHERE family(network) = 6",
    );

    const proxyCnt = await client.query(
      "SELECT COUNT(*) FROM ip_geo_blocks WHERE is_anonymous_proxy = true",
    );
    const anycastCnt = await client.query(
      "SELECT COUNT(*) FROM ip_geo_blocks WHERE is_anycast = true",
    );

    console.log(`\n✅ 导入完成`);
    console.log(`  总计: ${finalCount.toLocaleString()} 行`);
    console.log(`  IPv4: ${parseInt(v4cnt.rows[0].count, 10).toLocaleString()} 行`);
    console.log(`  IPv6: ${parseInt(v6cnt.rows[0].count, 10).toLocaleString()} 行`);
    console.log(`  ── 风控信号 ──`);
    console.log(`  匿名代理: ${parseInt(proxyCnt.rows[0].count, 10).toLocaleString()} 个网段`);
    console.log(`  Anycast:  ${parseInt(anycastCnt.rows[0].count, 10).toLocaleString()} 个网段`);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error("\n❌ 导入失败:", err);
  process.exit(1);
});
