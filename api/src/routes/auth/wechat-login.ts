// ============================================================
//  3cloud (3C) — 微信扫码登录（OAuth 2.0）
//  微信开放平台网站应用扫码登录
//  - GET  /api/v1/auth/wechat/qrcode-url — 获取微信二维码URL
//  - GET  /api/v1/auth/wechat/callback   — OAuth回调处理
//  - POST /api/v1/auth/wechat/bind       — 绑定已有账号
// ============================================================

import { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { systemConfigs, users, userOauthBindings } from "../../db/schema.js";
import { authenticateJWT } from "../../middleware/auth.js";
import { generateTokens } from "../../services/auth-service/tokens.js";
import { AppError } from "../../services/auth-service/types.js";

const WECHAT_CONFIG_KEY = "scm_wechat_login_config";

// ── 微信 API 地址 ──
const WECHAT_QRCODE_URL = "https://open.weixin.qq.com/connect/qrconnect";
const WECHAT_TOKEN_URL = "https://api.weixin.qq.com/sns/oauth2/access_token";
const WECHAT_USERINFO_URL = "https://api.weixin.qq.com/sns/userinfo";

interface WechatConfig {
  enabled: boolean
  appId: string
  appSecret: string
  redirectUri: string
  description: string
}

interface WechatTokenResponse {
  access_token: string
  expires_in: number
  refresh_token: string
  openid: string
  scope: string
  unionid?: string
}

interface WechatUserInfoResponse {
  openid: string
  nickname: string
  sex: number
  province: string
  city: string
  country: string
  headimgurl: string
  privilege: string[]
  unionid?: string
}

// ── 读取微信配置 ──
async function getWechatConfig(): Promise<WechatConfig | null> {
  const db = getDb();
  const row = await db
    .select()
    .from(systemConfigs)
    .where(eq(systemConfigs.key, WECHAT_CONFIG_KEY))
    .limit(1);
  if (row.length === 0) return null;
  return JSON.parse(row[0].value) as WechatConfig;
}

export async function authWechatLoginRoutes(app: FastifyInstance) {
  const db = getDb();

  // ──────────────────────────────────────────────
  //  GET /api/v1/auth/wechat/qrcode-url — 获取二维码跳转 URL
  //  前端可据此生成二维码或直接跳转
  // ──────────────────────────────────────────────

  app.get("/api/v1/auth/wechat/qrcode-url", async (_request, reply) => {
    const cfg = await getWechatConfig();
    if (!cfg || !cfg.enabled) {
      return reply.status(400).send({ code: 400, message: "微信登录未启用" });
    }

    // 生成 state 防 CSRF（用随机字符串）
    const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

    const url = `${WECHAT_QRCODE_URL}?appid=${cfg.appId}&redirect_uri=${encodeURIComponent(cfg.redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;

    reply.status(200).send({
      code: 0,
      data: { url, state },
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/auth/wechat/callback — OAuth 回调
  //  微信服务器回调，code → access_token → userinfo
  //  → 已有绑定则直接登录，无绑定则返回 openid 让前端选择注册/绑定
  // ──────────────────────────────────────────────

  app.get("/api/v1/auth/wechat/callback", async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    if (!code) {
      return reply.status(400).send({ code: 400, message: "缺少授权 code" });
    }

    const cfg = await getWechatConfig();
    if (!cfg || !cfg.enabled) {
      return reply.status(400).send({ code: 400, message: "微信登录未启用" });
    }

    // 1. 用 code 换取 access_token
    let tokenRes: WechatTokenResponse;
    try {
      const res = await fetch(
        `${WECHAT_TOKEN_URL}?appid=${cfg.appId}&secret=${cfg.appSecret}&code=${code}&grant_type=authorization_code`,
        { signal: AbortSignal.timeout(10000) }
      );
      tokenRes = await res.json() as WechatTokenResponse;

      if (!tokenRes.openid) {
        return reply.status(400).send({
          code: 400,
          message: `获取微信 access_token 失败: ${JSON.stringify(tokenRes)}`,
        });
      }
    } catch (e: any) {
      return reply.status(502).send({ code: 502, message: `微信 API 请求失败: ${e.message}` });
    }

    // 2. 获取微信用户信息
    let userInfo: WechatUserInfoResponse;
    try {
      const res = await fetch(
        `${WECHAT_USERINFO_URL}?access_token=${tokenRes.access_token}&openid=${tokenRes.openid}`,
        { signal: AbortSignal.timeout(10000) }
      );
      userInfo = await res.json() as WechatUserInfoResponse;

      if (!userInfo.openid) {
        return reply.status(400).send({
          code: 400,
          message: `获取微信用户信息失败: ${JSON.stringify(userInfo)}`,
        });
      }
    } catch (e: any) {
      return reply.status(502).send({ code: 502, message: `微信用户信息请求失败: ${e.message}` });
    }

    // 3. 查是否已有绑定记录
    const providerUserId = userInfo.unionid || userInfo.openid;
    const existingBinding = await db
      .select()
      .from(userOauthBindings)
      .where(
        and(
          eq(userOauthBindings.provider, "wechat"),
          eq(userOauthBindings.providerUserId, providerUserId)
        )
      )
      .limit(1);

    if (existingBinding.length > 0) {
      // 已有绑定 → 直接登录
      const binding = existingBinding[0];

      // 获取用户信息
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, binding.userId))
        .limit(1);

      if (userRows.length === 0) {
        return reply.status(500).send({ code: 500, message: "绑定的用户不存在" });
      }

      const user = userRows[0];
      if (user.status === "disabled" || user.status === "deleted") {
        return reply.status(403).send({ code: 403, message: "账号已被禁用或注销" });
      }

      // 生成 JWT
      const tokens = generateTokens(user.id, user.role);
      const redirectUrl = getRedirectUrl(cfg.redirectUri, tokens);

      // 更新昵称/头像
      await db
        .update(userOauthBindings)
        .set({
          nickname: userInfo.nickname,
          avatarUrl: userInfo.headimgurl,
          rawProfile: JSON.stringify(userInfo),
          updatedAt: new Date(),
        })
        .where(eq(userOauthBindings.id, binding.id));

      return reply.redirect(301, redirectUrl);
    }

    // 4. 无绑定 → 返回 openid 信息，前端引导注册/绑定
    reply.status(200).send({
      code: 0,
      data: {
        provider: "wechat",
        openid: userInfo.openid,
        unionid: userInfo.unionid,
        nickname: userInfo.nickname,
        avatarUrl: userInfo.headimgurl,
        hasBinding: false,
      },
      message: "微信用户信息获取成功，请绑定已有账号或注册新账号",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/auth/wechat/bind — 绑定微信到已有账号
  //  前端在微信回调后，让用户输入已有账号密码完成绑定
  // ──────────────────────────────────────────────

  app.post("/api/v1/auth/wechat/bind", async (request, reply) => {
    const { openid, unionid, nickname, avatarUrl, email, password } = request.body as {
      openid: string
      unionid?: string
      nickname?: string
      avatarUrl?: string
      email: string
      password: string
    };

    if (!openid || !email || !password) {
      return reply.status(400).send({ code: 400, message: "缺少必填参数" });
    }

    // 验证账号密码
    const { loginUser } = await import("../../services/auth-service/login.js");
    let loginResult;
    try {
      loginResult = await loginUser(email, password);
    } catch (e: any) {
      if (e instanceof AppError) {
        return reply.status(401).send({ code: 401, message: e.message });
      }
      throw e;
    }

    if (!loginResult || !loginResult.user) {
      return reply.status(401).send({ code: 401, message: "邮箱或密码错误" });
    }

    const userId = loginResult.user.id;
    const providerUserId = unionid || openid;

    // 查是否已被其他账号绑定
    const existing = await db
      .select()
      .from(userOauthBindings)
      .where(
        and(
          eq(userOauthBindings.provider, "wechat"),
          eq(userOauthBindings.providerUserId, providerUserId)
        )
      )
      .limit(1);

    if (existing.length > 0 && existing[0].userId !== userId) {
      return reply.status(409).send({ code: 409, message: "该微信账号已被其他用户绑定" });
    }

    // 查当前账号是否已经绑定了微信
    const myBinding = await db
      .select()
      .from(userOauthBindings)
      .where(
        and(
          eq(userOauthBindings.userId, userId),
          eq(userOauthBindings.provider, "wechat")
        )
      )
      .limit(1);

    if (myBinding.length > 0) {
      // 更新已有绑定
      await db
        .update(userOauthBindings)
        .set({
          providerUserId,
          nickname: nickname || null,
          avatarUrl: avatarUrl || null,
          rawProfile: JSON.stringify({ openid, unionid }),
          updatedAt: new Date(),
        })
        .where(eq(userOauthBindings.id, myBinding[0].id));
    } else {
      // 新增绑定
      await db.insert(userOauthBindings).values({
        userId,
        provider: "wechat",
        providerUserId,
        nickname: nickname || null,
        avatarUrl: avatarUrl || null,
        rawProfile: JSON.stringify({ openid, unionid }),
      });
    }

    // 生成 Token 并返回
    const tokens = generateTokens(userId, loginResult.user.role);
    reply.status(200).send({
      code: 0,
      data: { ...tokens, user: loginResult.user },
      message: "微信绑定成功",
    });
  });

  // ──────────────────────────────────────────────
  //  POST /api/v1/auth/wechat/register — 用微信信息注册新账号
  // ──────────────────────────────────────────────

  app.post("/api/v1/auth/wechat/register", async (request, reply) => {
    const { openid, unionid, nickname, avatarUrl, email, password } = request.body as {
      openid: string
      unionid?: string
      nickname?: string
      avatarUrl?: string
      email: string
      password: string
    };

    if (!openid || !email || !password) {
      return reply.status(400).send({ code: 400, message: "缺少必填参数" });
    }

    // 验证邮箱是否已注册
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return reply.status(409).send({ code: 409, message: "该邮箱已被注册" });
    }

    // 查微信 openid 是否已被绑定
    const providerUserId = unionid || openid;
    const existingBind = await db
      .select()
      .from(userOauthBindings)
      .where(
        and(
          eq(userOauthBindings.provider, "wechat"),
          eq(userOauthBindings.providerUserId, providerUserId)
        )
      )
      .limit(1);

    if (existingBind.length > 0) {
      return reply.status(409).send({ code: 409, message: "该微信账号已被绑定" });
    }

    // 注册用户
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        nickname: nickname || email.split("@")[0],
        userType: "personal",
        role: "user",
        status: "active",
      })
      .returning();

    // 创建 OAuth 绑定
    await db.insert(userOauthBindings).values({
      userId: newUser.id,
      provider: "wechat",
      providerUserId,
      nickname: nickname || null,
      avatarUrl: avatarUrl || null,
      rawProfile: JSON.stringify({ openid, unionid }),
    });

    // 生成 Token
    const tokens = generateTokens(newUser.id, newUser.role);
    reply.status(200).send({
      code: 0,
      data: { ...tokens, user: newUser },
      message: "注册并绑定微信成功",
    });
  });

  // ──────────────────────────────────────────────
  //  GET /api/v1/auth/wechat/bindings — 获取当前用户的微信绑定（需登录）
  // ──────────────────────────────────────────────

  app.get("/api/v1/auth/wechat/bindings", {
    preHandler: [authenticateJWT],
  }, async (request, reply) => {
    const userId = (request as any).user.userId;

    const bindings = await db
      .select()
      .from(userOauthBindings)
      .where(
        and(
          eq(userOauthBindings.userId, userId),
          eq(userOauthBindings.provider, "wechat")
        )
      )
      .limit(1);

    reply.status(200).send({
      code: 0,
      data: bindings.length > 0 ? bindings[0] : null,
      message: "ok",
    });
  });

  // ──────────────────────────────────────────────
  //  DELETE /api/v1/auth/wechat/bindings — 解绑微信（需登录）
  // ──────────────────────────────────────────────

  app.delete("/api/v1/auth/wechat/bindings", {
    preHandler: [authenticateJWT],
  }, async (request, reply) => {
    const userId = (request as any).user.userId;

    await db
      .delete(userOauthBindings)
      .where(
        and(
          eq(userOauthBindings.userId, userId),
          eq(userOauthBindings.provider, "wechat")
        )
      );

    reply.status(200).send({ code: 0, message: "微信解绑成功" });
  });
}

// ── 辅助：生成带 token 的重定向 URL ──
function getRedirectUrl(baseUrl: string, tokens: { accessToken: string; refreshToken: string; expiresIn: number }): string {
  try {
    const url = new URL(baseUrl);
    // 替换 callback 路径为登录成功页
    const frontendUrl = url.origin + "/login-success";
    const redirectUrl = new URL(frontendUrl);
    redirectUrl.searchParams.set("access_token", tokens.accessToken);
    redirectUrl.searchParams.set("refresh_token", tokens.refreshToken);
    redirectUrl.searchParams.set("expires_in", String(tokens.expiresIn));
    return redirectUrl.toString();
  } catch {
    // fallback
    return baseUrl;
  }
}
