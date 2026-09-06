import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { checksum, migrationAction, redactDatabaseUrl, safeErrorMessage } = require('../lib/manual-migrations-runner.cjs');

describe('manual migration runner pure logic', () => {
  it('相同 SQL checksum 稳定，内容变更可检测', () => {
    expect(checksum('SELECT 1')).toBe(checksum('SELECT 1'));
    expect(checksum('SELECT 1')).not.toBe(checksum('SELECT 2'));
  });
  it('已成功且 checksum 一致时跳过', () => {
    expect(migrationAction({ status: 'applied', checksum: 'abc' }, 'abc')).toBe('skip');
  });
  it('已成功但 checksum 不一致时标记变更', () => {
    expect(migrationAction({ status: 'applied', checksum: 'abc' }, 'def')).toBe('changed');
  });
  it('不存在或失败记录继续执行', () => {
    expect(migrationAction(null, 'abc')).toBe('run');
    expect(migrationAction({ status: 'failed', checksum: 'abc' }, 'def')).toBe('run');
  });
  it('连接串脱敏且不泄露密码', () => {
    const url = 'postgres://user:secret-password@localhost:5432/threecloud_v3';
    expect(redactDatabaseUrl(url)).not.toContain('secret-password');
    expect(redactDatabaseUrl(url)).toContain('***');
    expect(safeErrorMessage(new Error(`connect failed: ${url}`), url)).not.toContain('secret-password');
  });
});
