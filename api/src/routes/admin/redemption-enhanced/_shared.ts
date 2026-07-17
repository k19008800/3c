// ============================================================
//  3cloud (3C) — Admin 兑换码增强 共享工具函数
// ============================================================

export function isAdminRole(role: string): boolean {
  return ["super_admin", "admin", "finance_ops", "ops"].includes(role);
}
