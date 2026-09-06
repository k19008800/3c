/**
 * 手写迁移 runner 的纯逻辑 — checksum、日志脱敏与迁移状态判定。
 *
 * 这些函数不连接数据库，供 runner 与单元测试共享，避免测试触碰真实数据库。
 * @module manual-migrations-runner
 */
const crypto = require('node:crypto');

/**
 * 计算迁移文件内容的 SHA-256 checksum。
 * @param {string|Buffer} content - SQL 文件内容。
 * @returns {string} 小写十六进制 SHA-256。
 */
function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * 判断已有成功记录是否仍与当前 SQL 文件一致。
 * @param {{status?: string, checksum?: string}|null|undefined} record - 迁移元数据。
 * @param {string} currentChecksum - 当前文件 checksum。
 * @returns {'skip'|'changed'|'run'} 执行动作。
 */
function migrationAction(record, currentChecksum) {
  if (!record) return 'run';
  if (record.status === 'applied' && record.checksum === currentChecksum) return 'skip';
  if (record.status === 'applied') return 'changed';
  return 'run';
}

/**
 * 把连接串转换为不含密码的日志文本。
 * @param {string} value - 连接串或普通文本。
 * @returns {string} 已脱敏文本。
 */
function redactDatabaseUrl(value) {
  return String(value).replace(/(postgres(?:ql)?:\/\/[^/:@]+:)[^@]+(@)/gi, '$1***$2');
}

/**
 * 将任意错误安全转换为日志消息，避免输出连接串密码。
 * @param {unknown} error - 捕获的异常。
 * @param {string} databaseUrl - 数据库连接串。
 * @returns {string} 脱敏后的错误信息。
 */
function safeErrorMessage(error, databaseUrl) {
  return redactDatabaseUrl(String(error instanceof Error ? error.message : error)).replace(
    databaseUrl,
    '***DATABASE_URL***',
  );
}

module.exports = { checksum, migrationAction, redactDatabaseUrl, safeErrorMessage };
