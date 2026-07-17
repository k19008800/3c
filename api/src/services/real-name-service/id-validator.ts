// ============================================================
//  3cloud (3C) — 身份证校验
// ============================================================

const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const CHECK_CODES = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];

/**
 * 18 位身份证最后一位校验码验证
 */
export function validateIdNumber(id: string): boolean {
  if (!/^\d{17}[\dXx]$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(id[i], 10) * WEIGHTS[i];
  }
  return id[17].toUpperCase() === CHECK_CODES[sum % 11];
}
