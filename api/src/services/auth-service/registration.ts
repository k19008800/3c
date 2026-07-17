import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "../../db/index.js";
import { getRedis } from "../../redis.js";
import { config } from "../../config.js";
import { users, agentClients, balanceLogs, systemConfigs } from "../../db/schema.js";
import { AppError, type AuthResult } from "./types.js";
import { generateTokens } from "./tokens.js";

export async function registerUser(email: string, password: string, refCode?: string): Promise<AuthResult> {
  const db = getDb();
  const redis = getRedis();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length > 0) throw new AppError("EMAIL_EXISTS", "该邮箱已注册", 409);

  const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds);

  const [newUser] = await db.insert(users).values({ email: email.toLowerCase(), passwordHash, status: "pending" })
    .returning({ id: users.id, email: users.email, nickname: users.nickname, userType: users.userType, role: users.role, status: users.status, balance: users.balance, emailVerifiedAt: users.emailVerifiedAt });

  const [trialCfg] = await db.select({ value: systemConfigs.value }).from(systemConfigs).where(eq(systemConfigs.key, "trial_token_quota")).limit(1);
  const trialRmb = trialCfg?.value ?? "10";
  const trialQuota = (parseFloat(trialRmb) || 0).toFixed(6);

  await db.update(users).set({ balance: trialQuota }).where(eq(users.id, newUser.id));
  await db.insert(balanceLogs).values({ userId: newUser.id, amount: trialQuota, balanceAfter: trialQuota, type: "trial_grant", description: `新用户免费体验额度（${trialRmb}元）` });
  newUser.balance = trialQuota;

  if (refCode) {
    const agentIdStr = await redis.get(`ref:link:${refCode}`);
    if (agentIdStr) {
      const agentId = parseInt(agentIdStr, 10);
      const [existingBinding] = await db.select({ id: agentClients.id }).from(agentClients).where(eq(agentClients.clientUserId, newUser.id)).limit(1);
      if (!existingBinding) await db.insert(agentClients).values({ agentId, clientUserId: newUser.id });
      try {
        const { processActivityCommission } = await import("../billing/index.js");
        await processActivityCommission(db, agentId, newUser.id, "register_bonus", undefined, undefined);
      } catch {}
    }
  }

  const verifyCode = Math.random().toString().slice(2, 8);
  await redis.setex(`verify:email:${newUser.id}`, 300, verifyCode);
  const tokens = generateTokens(newUser.id, newUser.role);

  return {
    user: { id: newUser.id, email: newUser.email, nickname: newUser.nickname, userType: newUser.userType as "personal" | "enterprise", role: newUser.role, status: newUser.status, balance: newUser.balance, emailVerifiedAt: newUser.emailVerifiedAt?.toISOString() ?? null },
    tokens,
  };
}

export async function verifyUserEmail(userId: number, code: string): Promise<void> {
  const redis = getRedis();
  const db = getDb();
  const storedCode = await redis.get(`verify:email:${userId}`);
  if (!storedCode || storedCode !== code) throw new AppError("INVALID_VERIFY_CODE", "验证码错误或已过期", 400);
  await redis.del(`verify:email:${userId}`);
  await db.update(users).set({ status: "active", emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}

export async function resendVerifyCode(userId: number): Promise<void> {
  const redis = getRedis();
  const db = getDb();
  const [user] = await db.select({ id: users.id, status: users.status }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppError("USER_NOT_FOUND", "用户不存在", 404);
  if (user.status !== "pending") throw new AppError("ALREADY_VERIFIED", "邮箱已验证，无需重复验证", 400);
  const ttl = await redis.ttl(`verify:email:${userId}`);
  if (ttl > 240) throw new AppError("TOO_FREQUENT", "验证码已发送，请 60 秒后再试", 429);
  const verifyCode = Math.random().toString().slice(2, 8);
  await redis.setex(`verify:email:${userId}`, 300, verifyCode);
}
