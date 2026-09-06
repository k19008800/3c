#!/usr/bin/env node
/**
 * PostgreSQL 备份与独立库恢复演练工具 — 只生成/校验 custom archive 证据。
 *
 * 设计约束：恢复必须使用 pg_restore；禁止覆盖生产库；未指定独立目标库时拒绝执行。
 * @module ops/backup-restore
 */
const { createHash } = require('node:crypto');
const { readFileSync, statSync, writeFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');

/** @param {string|Buffer} input @returns {string} SHA-256 */
function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * 校验 archive 与 sha256 sidecar。
 * @param {string} archivePath - custom archive 路径
 * @param {string} checksumPath - checksum 文件路径
 * @returns {{sizeBytes:number, checksum:string}} 校验结果
 * @throws {Error} 文件不存在、为空或 checksum 不一致
 */
function verifyArchive(archivePath, checksumPath) {
  const stat = statSync(archivePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error('backup archive is missing or empty');
  const actual = sha256(readFileSync(archivePath));
  const expected = readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/i.test(expected) || expected.toLowerCase() !== actual) {
    throw new Error(`backup checksum mismatch: expected=${expected} actual=${actual}`);
  }
  return { sizeBytes: stat.size, checksum: actual };
}

/**
 * 判断恢复目标是否为明确的独立库，防止误覆盖生产。
 * @param {string} targetUrl - 恢复目标连接串
 * @param {string} sourceUrl - 源备份所属连接串
 * @returns {void}
 * @throws {Error} 目标为空、与源相同、指向生产主机或生产库名
 */
function assertIsolatedRestoreTarget(targetUrl, sourceUrl = '') {
  if (!targetUrl) throw new Error('restore target DATABASE_URL is required');
  const target = new URL(targetUrl);
  const source = sourceUrl ? new URL(sourceUrl) : null;
  const productionHosts = new Set(['117.78.2.66', '123.60.55.62', '8.149.140.186']);
  if (productionHosts.has(target.hostname)) throw new Error('refusing to restore into production host');
  if (/^(cloud3|threecloud)$/.test(target.pathname.slice(1))) throw new Error('refusing to restore into production database name');
  if (source && target.href === source.href) throw new Error('restore target must differ from source database');
}

/** @param {string} archivePath @param {string} checksumPath @returns {void} */
function writeChecksum(archivePath, checksumPath) {
  const digest = sha256(readFileSync(archivePath));
  writeFileSync(checksumPath, `${digest}  ${archivePath}\n`, 'utf8');
}

/**
 * 执行 pg_restore 到独立目标库。调用者必须先通过 assertIsolatedRestoreTarget。
 * @param {string} archivePath - custom archive
 * @param {string} targetUrl - 隔离目标库连接串
 * @param {string} logPath - 输出日志路径
 * @returns {void}
 */
function restoreArchive(archivePath, targetUrl, logPath) {
  assertIsolatedRestoreTarget(targetUrl);
  const output = execFileSync('pg_restore', ['--dbname', targetUrl, '--exit-on-error', '--verbose', archivePath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  writeFileSync(logPath, output, 'utf8');
}

module.exports = { sha256, verifyArchive, assertIsolatedRestoreTarget, writeChecksum, restoreArchive };

if (require.main === module) {
  console.error('This module is library-only. Use the approved backup/restore runbook with explicit archive and isolated target.');
  process.exitCode = 2;
}
