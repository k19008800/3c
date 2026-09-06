import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { sha256, verifyArchive, assertIsolatedRestoreTarget, writeChecksum } = require('../../ops/backup-restore.cjs');

describe('backup/restore drill guards', () => {
  it('生成并校验 SHA-256 sidecar', () => {
    const dir = mkdtempSync(join(tmpdir(), '3cloud-backup-'));
    const archive = join(dir, 'backup.dump');
    const sidecar = join(dir, 'backup.dump.sha256');
    writeFileSync(archive, 'custom archive fixture');
    writeChecksum(archive, sidecar);
    expect(verifyArchive(archive, sidecar)).toEqual({ sizeBytes: Buffer.byteLength('custom archive fixture'), checksum: sha256('custom archive fixture') });
  });

  it('checksum 不一致时拒绝恢复', () => {
    const dir = mkdtempSync(join(tmpdir(), '3cloud-backup-'));
    const archive = join(dir, 'backup.dump');
    const sidecar = join(dir, 'backup.dump.sha256');
    writeFileSync(archive, 'archive');
    writeFileSync(sidecar, `${'0'.repeat(64)}  ${archive}\n`);
    expect(() => verifyArchive(archive, sidecar)).toThrow(/checksum mismatch/);
  });

  it('恢复目标必须是不同的隔离库', () => {
    expect(() => assertIsolatedRestoreTarget('postgres://u:p@117.78.2.66/cloud3')).toThrow(/production/);
    expect(() => assertIsolatedRestoreTarget('postgres://u:p@localhost/cloud3')).toThrow(/production database/);
    expect(() => assertIsolatedRestoreTarget('postgres://u:p@localhost/drill_restore')).not.toThrow();
  });
});
