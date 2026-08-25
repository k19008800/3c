/**
 * 密码强度校验（R7-USER-DRILL-002）
 *
 * 覆盖注册 / 修改密码 / 重置密码三处入口，拒绝弱口令：
 *   - 长度 < 8
 *   - 未同时包含字母与数字（纯数字、纯字母）
 *   - 常见弱口令黑名单（12345678、password 等）
 *   - 连续重复字符（aaaaaaaa、11111111 等）
 *
 * @returns 错误文案；合法返回 null
 * @module lib
 */
const COMMON_WEAK = new Set([
  '12345678', '123456789', '1234567890',
  'password', 'password1', 'qwerty', 'qwerty123',
  'admin123', 'abc12345', 'admin888', '11111111', '88888888',
]);

export function validatePasswordStrength(pwd: string): string | null {
  if (pwd.length < 8) return '密码至少 8 位';
  const lower = pwd.toLowerCase();
  if (COMMON_WEAK.has(lower)) return '密码过于常见，请更换';
  if (!/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) return '密码需同时包含字母和数字';
  if (/(.)\1{7}/.test(pwd)) return '密码不能为连续重复字符';
  return null;
}
