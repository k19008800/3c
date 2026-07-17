import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { users, adminRoles, userRoleAssignments } from "../../db/schema.js";
import { AppError } from "./types.js";

const ADMIN_ROLES = ['super_admin', 'admin', 'finance_ops', 'ops', 'support', 'auditor'] as const;
type AdminRole = typeof ADMIN_ROLES[number];
const ADMIN_ROLE_SET = new Set<string>(ADMIN_ROLES);

export async function getUserProfile(userId: number) {
  const db = getDb();
  const [user] = await db.select({
    id: users.id, email: users.email, nickname: users.nickname, userType: users.userType, role: users.role,
    status: users.status, realNameStatus: users.realNameStatus, realName: users.realName, idNumber: users.idNumber,
    idFrontImage: users.idFrontImage, idBackImage: users.idBackImage, companyName: users.companyName,
    companyRegNumber: users.companyRegNumber, businessLicense: users.businessLicense, bankName: users.bankName,
    bankAccount: users.bankAccount, rejectReason: users.rejectReason, balance: users.balance,
    discountRate: users.discountRate, rpmOverride: users.rpmOverride, tpmOverride: users.tpmOverride,
    emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);

  let effectiveRole = user.role;
  if (!ADMIN_ROLE_SET.has(user.role)) {
    const assignments = await db.select({ roleName: adminRoles.name }).from(userRoleAssignments)
      .innerJoin(adminRoles, eq(userRoleAssignments.adminRoleId, adminRoles.id))
      .where(eq(userRoleAssignments.userId, userId));
    if (assignments.length > 0) {
      const PRIORITY = ADMIN_ROLES;
      let best: AdminRole | null = null;
      let bestRank = Infinity;
      for (const a of assignments) {
        const rank = PRIORITY.indexOf(a.roleName as AdminRole);
        if (rank !== -1 && rank < bestRank) { bestRank = rank; best = a.roleName as AdminRole; }
      }
      if (best) effectiveRole = best;
    }
  }

  const { getUserPermissions } = await import("../permission-engine.js");
  const perms = await getUserPermissions(userId);

  return { ...user, role: effectiveRole as typeof user.role, emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null, createdAt: user.createdAt?.toISOString() ?? null, permissions: perms.toString() };
}
