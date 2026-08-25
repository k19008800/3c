/**
 * 密码强度校验单测（R7-USER-DRILL-002）
 */
import { describe, it, expect } from 'vitest';
import { validatePasswordStrength } from './password';

describe('validatePasswordStrength', () => {
  it('合法强密码通过（含字母+数字+长度≥8）', () => {
    expect(validatePasswordStrength('Test1234!')).toBeNull();
    expect(validatePasswordStrength('Abc12468')).toBeNull();
    expect(validatePasswordStrength('Verify@2026!')).toBeNull();
  });

  it('长度不足 8 → 拒绝', () => {
    expect(validatePasswordStrength('Ab1')).toContain('至少 8 位');
  });

  it('纯数字 / 纯字母 → 拒绝', () => {
    expect(validatePasswordStrength('24681357')).toContain('字母和数字');
    expect(validatePasswordStrength('abcdefgh')).toContain('字母和数字');
  });

  it('常见弱口令黑名单 → 拒绝', () => {
    expect(validatePasswordStrength('password1')).toContain('过于常见');
    expect(validatePasswordStrength('admin123')).toContain('过于常见');
  });

  it('连续重复字符 → 拒绝', () => {
    expect(validatePasswordStrength('aaaaaaaa1')).toContain('连续重复');
  });
});
