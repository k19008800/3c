import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import { users } from "../db/schema/users";

/**
 * §22.1 Onboarding 新用户引导
 * 对应 docs/SPEC-§22-用户端体验增强.md §22.1
 * 5 步交互式引导：创建 API Key → 了解模型 → 测试调用 → 获取接入代码
 */

export function meOnboardingRoutes(app: FastifyInstance) {
  // 获取 Onboarding 状态
  app.get("/me/onboarding/status", async (req) => {
    const userId = Number((req as any).user.sub);
    const [user] = await db
      .select({
        onboardingStatus: users.onboardingStatus,
        onboardingStep: users.onboardingStep,
        onboardingCompletedAt: users.onboardingCompletedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return { code: 404, error: "USER_NOT_FOUND", message: "用户不存在" };
    }

    return {
      code: 0,
      data: {
        status: user.onboardingStatus ?? "not_started",
        step: user.onboardingStep ?? 1,
        completedAt: user.onboardingCompletedAt ?? null,
      },
      message: "ok",
    };
  });

  // 更新当前步骤
  app.post("/me/onboarding/step", async (req, reply) => {
    const userId = Number((req as any).user.sub);
    const { step } = req.body as { step?: number };

    if (typeof step !== "number" || step < 1 || step > 5) {
      return reply.code(400).send({ code: 400, error: "INVALID_STEP", message: "步骤必须在 1-5 之间" });
    }

    await db
      .update(users)
      .set({ onboardingStatus: "in_progress", onboardingStep: step, updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { code: 0, data: { status: "in_progress", step }, message: "ok" };
  });

  // 标记完成
  app.post("/me/onboarding/complete", async (req) => {
    const userId = Number((req as any).user.sub);
    const now = new Date();

    await db
      .update(users)
      .set({
        onboardingStatus: "completed",
        onboardingStep: 5,
        onboardingCompletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    return { code: 0, data: { status: "completed", completedAt: now.toISOString() }, message: "ok" };
  });

  // 跳过引导
  app.post("/me/onboarding/skip", async (req) => {
    const userId = Number((req as any).user.sub);

    await db
      .update(users)
      .set({ onboardingStatus: "skipped", updatedAt: new Date() })
      .where(eq(users.id, userId));

    return { code: 0, data: { status: "skipped" }, message: "ok" };
  });

  // 重新开始引导
  app.post("/me/onboarding/reset", async (req) => {
    const userId = Number((req as any).user.sub);

    await db
      .update(users)
      .set({
        onboardingStatus: "not_started",
        onboardingStep: 1,
        onboardingCompletedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return { code: 0, data: { status: "not_started", step: 1 }, message: "ok" };
  });
}
