#!/usr/bin/env node
/**
 * 备份恢复演练 driver — 按 OPS-BILLING-004 执行：
 * pg_dump custom → SHA-256 → 校验 → 隔离库 pg_restore → 结构/数据校验 → 证据落盘。
 * 用法：node ops/backup-restore-drill.cjs <archiveDir>
 * 环境变量：PGPASSWORD（本地库密码，从 api/.env 读取）
 */
const { execFileSync } = require('node:child_process');
const { readFileSync, mkdirSync, existsSync } = require('node:fs');
const path = require('node:path');
const { verifyArchive, writeChecksum, restoreArchive, assertIsolatedRestoreTarget } = require('./backup-restore.cjs');

const PG_BIN = 'C:\\Program Files\\PostgreSQL\\17\\bin';
process.env.PATH = `${PG_BIN};${process.env.PATH || ''}`;
const pgDump = path.join(PG_BIN, 'pg_dump.exe');
const pgRestore = path.join(PG_BIN, 'pg_restore.exe');
const psql = path.join(PG_BIN, 'psql.exe');

// 读取本地连接串（api/.env）
const root = path.resolve(__dirname, '..');
const envPath = path.join(root, 'api', '.env');
const envLine = readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
if (!envLine) { console.error('FATAL: DATABASE_URL missing in api/.env'); process.exit(1); }
const SOURCE_URL = envLine.slice('DATABASE_URL='.length).trim();
const src = new URL(SOURCE_URL);
if (!process.env.PGPASSWORD) process.env.PGPASSWORD = src.password;
const srcUser = src.username;
const srcHost = src.hostname;
const srcPort = src.port || '5432';
const srcDb = src.pathname.slice(1);

const archiveDir = process.argv[2] || path.join(root, 'evidence', 'finance', 'v0.1.0', 'restore');
if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 14);
const archivePath = path.join(archiveDir, `threecloud_v3-${stamp}.dump`);
const checksumPath = `${archivePath}.sha256`;
const restoreLog = path.join(archiveDir, `restore-${stamp}.log`);
const verifySqlLog = path.join(archiveDir, `verify-${stamp}.sql.out`);

const TARGET_DB = 'threecloud_restore_drill';
const targetUrl = `${src.protocol}//${srcUser}:${encodeURIComponent(src.password)}@${srcHost}:${srcPort}/${TARGET_DB}`;

function run(cmd, args) { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
function runPsql(db, sql) { return run(psql, ['-U', srcUser, '-h', srcHost, '-p', srcPort, '-d', db, '-t', '-A', '-c', sql]); }

try {
  // 1) 备份（custom archive）
  console.log(`[1] pg_dump custom → ${archivePath}`);
  run(pgDump, ['--format=custom', '-U', srcUser, '-h', srcHost, '-p', srcPort, `--file=${archivePath}`, '--no-owner', '--no-privileges', srcDb]);
  writeChecksum(archivePath, checksumPath);
  const v = verifyArchive(archivePath, checksumPath);
  console.log(`[1] 归档校验通过 size=${v.sizeBytes}B checksum=${v.checksum.slice(0, 16)}…`);

  // 2) 准备独立目标库（必须非生产名）
  assertIsolatedRestoreTarget(targetUrl, SOURCE_URL);
  console.log(`[2] 准备隔离目标库 ${TARGET_DB}`);
  runPsql('postgres', `DROP DATABASE IF EXISTS ${TARGET_DB};`);
  runPsql('postgres', `CREATE DATABASE ${TARGET_DB};`);

  // 3) 恢复
  console.log(`[3] pg_restore --exit-on-error → ${TARGET_DB}`);
  restoreArchive(archivePath, targetUrl, restoreLog);

  // 4) 结构/数据校验
  const tables = runPsql(TARGET_DB, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';").trim();
  const users = runPsql(TARGET_DB, 'SELECT count(*) FROM users;').trim();
  const balances = runPsql(TARGET_DB, 'SELECT count(*) FROM customer_balances;').trim();
  const txns = runPsql(TARGET_DB, 'SELECT count(*) FROM balance_transactions;').trim();
  const balSum = runPsql(TARGET_DB, 'SELECT coalesce(sum(available_balance::numeric),0) FROM customer_balances;').trim();
  const verifyOut = [
    `恢复时间: ${new Date().toISOString()}`,
    `public 表数量: ${tables}`,
    `users 行数: ${users}`,
    `customer_balances 行数: ${balances}`,
    `balance_transactions 行数: ${txns}`,
    `可用余额合计: ${balSum}`,
  ].join('\n');
  require('node:fs').writeFileSync(verifySqlLog, verifyOut, 'utf8');
  console.log(`[4] 校验通过:\n${verifyOut}`);

  // 5) 与源库行数一致性抽样（防止恢复缺行）
  const srcUsers = runPsql(srcDb, 'SELECT count(*) FROM users;').trim();
  const srcTxns = runPsql(srcDb, 'SELECT count(*) FROM balance_transactions;').trim();
  if (users !== srcUsers || txns !== srcTxns) {
    throw new Error(`行数不一致: users 源=${srcUsers} 恢复=${users}; txns 源=${srcTxns} 恢复=${txns}`);
  }
  console.log(`[5] 源/恢复行数一致 users=${users} txns=${txns}`);

  // 6) 清理演练库（不覆盖生产）
  runPsql('postgres', `DROP DATABASE IF EXISTS ${TARGET_DB};`);
  console.log('[6] 演练库已清理，生产库未受影响');

  console.log(`\n=== 备份恢复演练 PASS ===`);
  console.log(`证据目录: ${archiveDir}`);
  console.log(`归档: ${path.basename(archivePath)} (${v.sizeBytes} B)`);
  console.log(`日志: ${path.basename(restoreLog)}, ${path.basename(verifySqlLog)}`);
} catch (e) {
  console.error('=== 备份恢复演练 FAIL ===');
  console.error(e.stderr || e.message);
  try { runPsql('postgres', `DROP DATABASE IF EXISTS ${TARGET_DB};`); console.error('演练库已清理'); } catch (_) {}
  process.exit(1);
}
