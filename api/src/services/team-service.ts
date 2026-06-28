// ============================================================
//  3cloud (3C) — Team 服务层
//  团队创建 / 邀请 / 移除 / 更新 / 查询 / 退出
// ============================================================

import { eq, and, sql, desc, asc, ne } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users, teamMembers, auditLogs } from "../db/schema.js";
import { AppError } from "./auth-service.js";

// ── 类型 ──

interface TeamMemberInfo {
  id: number;
  userId: number;
  email: string;
  nickname: string | null;
  role: string;
  quotaBalance: string | null;
  invitedAt: string | null;
  joinedAt: string;
}

interface TeamInfo {
  teamId: number;
  members: TeamMemberInfo[];
  memberCount: number;
}

// ── 获取下一个可用 teamId ──

async function getNextTeamId(): Promise<number> {
  const db = getDb();
  const [result] = await db
    .select({ maxId: sql<number>`coalesce(max(${teamMembers.teamId}), 0)` })
    .from(teamMembers);
  return (result?.maxId ?? 0) + 1;
}

// ── 创建团队 ──

export async function createTeam(userId: number, name: string): Promise<TeamInfo> {
  const db = getDb();

  // 检查用户是否已有团队
  const [user] = await db
    .select({ id: users.id, teamId: users.teamId, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  }

  if (user.teamId) {
    throw new AppError("ALREADY_IN_TEAM", "您已在团队中，无法创建新团队", 400);
  }

  const teamId = await getNextTeamId();

  await db.transaction(async (tx) => {
    // 创建 team_members 记录（创建者自动成为 owner）
    await tx.insert(teamMembers).values({
      userId,
      teamId,
      role: "team_owner",
      invitedAt: new Date(),
    });

    // 更新用户的 teamId 和 teamRole
    await tx
      .update(users)
      .set({ teamId, teamRole: "team_owner" })
      .where(eq(users.id, userId));

    // 审计日志
    await tx.insert(auditLogs).values({
      operatorId: userId,
      action: "role_change",
      targetType: "user",
      targetId: userId,
      before: { teamId: null, teamRole: null },
      after: { teamId, teamRole: "team_owner" },
      ip: null,
      description: `用户创建团队 #${teamId}`,
    });
  });

  return await getTeamInfo(userId);
}

// ── 获取我的团队信息 ──

export async function getTeamInfo(userId: number): Promise<TeamInfo> {
  const db = getDb();

  const [user] = await db
    .select({ teamId: users.teamId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || !user.teamId) {
    throw new AppError("NOT_IN_TEAM", "您不在任何团队中", 400);
  }

  const members = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      email: users.email,
      nickname: users.nickname,
      role: teamMembers.role,
      quotaBalance: teamMembers.quotaBalance,
      invitedAt: teamMembers.invitedAt,
      joinedAt: teamMembers.joinedAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, user.teamId))
    .orderBy(asc(teamMembers.id));

  const teamInfo: TeamInfo = {
    teamId: user.teamId,
    memberCount: members.length,
    members: members.map((m) => ({
      ...m,
      quotaBalance: m.quotaBalance ?? null,
      invitedAt: m.invitedAt?.toISOString() ?? null,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };

  return teamInfo;
}

// ── 获取用户在当前团队的角色 ──

async function getMemberRoleInTeam(db: ReturnType<typeof getDb>, userId: number): Promise<{ teamId: number; role: string } | null> {
  const [member] = await db
    .select({
      teamId: teamMembers.teamId,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  return member ?? null;
}

// ── 检查操作者是否有管理权限 ──

async function requireManagePermission(db: ReturnType<typeof getDb>, operatorId: number): Promise<number> {
  const memberInfo = await getMemberRoleInTeam(db, operatorId);
  if (!memberInfo) {
    throw new AppError("NOT_IN_TEAM", "您不在任何团队中", 400);
  }
  if (memberInfo.role !== "team_owner" && memberInfo.role !== "team_admin") {
    throw new AppError("PERMISSION_DENIED", "需要团队管理员或所有者权限", 403);
  }
  return memberInfo.teamId;
}

// ── 邀请成员 ──

export async function inviteMember(
  operatorId: number,
  email: string,
  role: "team_admin" | "team_member" = "team_member",
  quotaBalance?: string | null,
): Promise<{ userId: number; email: string }> {
  const db = getDb();

  const teamId = await requireManagePermission(db, operatorId);

  // 查找被邀请用户
  const [targetUser] = await db
    .select({ id: users.id, email: users.email, teamId: users.teamId })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!targetUser) {
    throw new AppError("USER_NOT_FOUND", `用户 ${email} 不存在`, 404);
  }

  if (targetUser.teamId) {
    throw new AppError("ALREADY_IN_TEAM", `用户 ${email} 已在其他团队中`, 400);
  }

  // 检查是否已是团队成员
  const [existingMember] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(eq(teamMembers.userId, targetUser.id))
    .limit(1);

  if (existingMember) {
    throw new AppError("ALREADY_MEMBER", `用户 ${email} 已是团队成员`, 400);
  }

  await db.transaction(async (tx) => {
    await tx.insert(teamMembers).values({
      userId: targetUser.id,
      teamId,
      role,
      quotaBalance: quotaBalance ?? null,
      invitedAt: new Date(),
    });

    // 更新用户的 teamId 和 teamRole
    await tx
      .update(users)
      .set({ teamId, teamRole: role })
      .where(eq(users.id, targetUser.id));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "role_change",
      targetType: "user",
      targetId: targetUser.id,
      before: { teamId: null, teamRole: null },
      after: { teamId, teamRole: role },
      ip: null,
      description: `邀请成员 ${email} 加入团队 #${teamId}`,
    });
  });

  return { userId: targetUser.id, email: targetUser.email };
}

// ── 移除成员 ──

export async function removeMember(operatorId: number, targetUserId: number): Promise<void> {
  const db = getDb();

  const teamId = await requireManagePermission(db, operatorId);

  // 不能操作自己（要离职用 leave）
  if (operatorId === targetUserId) {
    throw new AppError("CANNOT_REMOVE_SELF", "不能移除自己，请使用退出团队功能", 400);
  }

  // 获取目标成员信息
  const [targetMember] = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, targetUserId), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!targetMember) {
    throw new AppError("MEMBER_NOT_FOUND", "该用户不是团队成员", 404);
  }

  // 不能移除 owner
  if (targetMember.role === "team_owner") {
    throw new AppError("CANNOT_REMOVE_OWNER", "不能移除团队所有者", 400);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(teamMembers)
      .where(eq(teamMembers.id, targetMember.id));

    await tx
      .update(users)
      .set({ teamId: null, teamRole: null })
      .where(eq(users.id, targetUserId));

    await tx.insert(auditLogs).values({
      operatorId,
      action: "role_change",
      targetType: "user",
      targetId: targetUserId,
      before: { teamId, teamRole: targetMember.role },
      after: { teamId: null, teamRole: null },
      ip: null,
      description: `将成员 #${targetUserId} 移出团队 #${teamId}`,
    });
  });
}

// ── 更新成员（角色 / 额度） ──

export async function updateMember(
  operatorId: number,
  targetUserId: number,
  data: { role?: string; quotaBalance?: string | null },
): Promise<void> {
  const db = getDb();

  const teamId = await requireManagePermission(db, operatorId);

  const [targetMember] = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      quotaBalance: teamMembers.quotaBalance,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.userId, targetUserId), eq(teamMembers.teamId, teamId)))
    .limit(1);

  if (!targetMember) {
    throw new AppError("MEMBER_NOT_FOUND", "该用户不是团队成员", 404);
  }

  // 不能修改 owner
  if (targetMember.role === "team_owner" && data.role) {
    throw new AppError("CANNOT_MODIFY_OWNER", "不能修改团队所有者的角色", 400);
  }

  // 不能将他人设为 owner
  if (data.role === "team_owner") {
    throw new AppError("CANNOT_SET_OWNER", "不能将他人设为团队所有者", 400);
  }

  const updateData: Record<string, any> = {};
  const beforeSnapshot: Record<string, any> = {};

  if (data.role !== undefined) {
    updateData.role = data.role;
    beforeSnapshot.role = targetMember.role;
  }
  if (data.quotaBalance !== undefined) {
    updateData.quotaBalance = data.quotaBalance;
    beforeSnapshot.quotaBalance = targetMember.quotaBalance;
  }

  if (Object.keys(updateData).length === 0) {
    throw new AppError("NO_CHANGES", "没有需要更新的字段", 400);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(teamMembers)
      .set(updateData)
      .where(eq(teamMembers.id, targetMember.id));

    // 同步更新用户表的 teamRole
    if (data.role) {
      await tx
        .update(users)
        .set({ teamRole: data.role as any })
        .where(eq(users.id, targetUserId));
    }

    await tx.insert(auditLogs).values({
      operatorId,
      action: "role_change",
      targetType: "user",
      targetId: targetUserId,
      before: beforeSnapshot,
      after: updateData,
      ip: null,
      description: `更新成员 #${targetUserId} 的团队信息: ${Object.keys(updateData).join(", ")}`,
    });
  });
}

// ── 退出团队 ──

export async function leaveTeam(userId: number): Promise<void> {
  const db = getDb();

  const [member] = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      teamId: teamMembers.teamId,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  if (!member) {
    throw new AppError("NOT_IN_TEAM", "您不在任何团队中", 400);
  }

  // Owner 不能直接退出
  if (member.role === "team_owner") {
    throw new AppError("OWNER_CANNOT_LEAVE", "团队所有者不能退出，请先转让所有权或联系管理员", 400);
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(teamMembers)
      .where(eq(teamMembers.id, member.id));

    await tx
      .update(users)
      .set({ teamId: null, teamRole: null })
      .where(eq(users.id, userId));

    await tx.insert(auditLogs).values({
      operatorId: userId,
      action: "role_change",
      targetType: "user",
      targetId: userId,
      before: { teamId: member.teamId, teamRole: member.role },
      after: { teamId: null, teamRole: null },
      ip: null,
      description: `用户退出团队 #${member.teamId}`,
    });
  });
}
