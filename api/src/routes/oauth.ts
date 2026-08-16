/**
 * OAuth Routes — 第三方登录 + 绑定管理
 *
 * 端点：
 * - GET /api/v1/auth/oauth/github/url — 生成跳转 GitHub 授权页的 URL
 * - GET /api/v1/auth/oauth/github/callback — 回调：换 token → 拉用户 → 绑定/自动注册 → 签发 JWT
 * - GET  /api/v1/auth/oauth/bindings — 绑定列表（需登录）
 * - POST /api/v1/auth/oauth/:provider/bind — 发起绑定（需登录，body { code }）
 * - POST /api/v1/auth/oauth/:provider/unbind — 解绑（需登录）
 *
 * 配置缺失（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / OAUTH_REDIRECT_BASE）时
 * 登录两个端点均返回 503（OAUTH_NOT_CONFIGURED），不崩溃。
 * 绑定管理端点需 JWT 鉴权（jwtAuth preHandler，同 me.ts / 2fa.ts 用法）。
 *
 * @see newapi-gap-analysis.md Batch 2 任务 2.1
 * @module routes/oauth
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { createSession, verifyToken } from '../services/auth/jwt';
import {
  getGitHubOAuthConfig,
  getGitHubOAuthUrl,
  handleGitHubCallback,
  getUserOAuthBindings,
  bindOAuthAccount,
  unbindOAuthAccount,
  OAuthNotConfiguredError,
} from '../services/auth/oauth';
import { UnauthorizedError, ValidationError } from '../lib/errors';

// ── JWT 鉴权 preHandler：从 Authorization: Bearer 解析用户，注入 request.userContext ──
// 与 me.ts / 2fa.ts 的 jwtAuth 同一模式（3cloud 未抽取公共鉴权插件，各域路由自行声明）
async function jwtAuth(request: any, _reply: any) {
  const authHeader = request.headers.authorization;
  const token = authHeader?.split(' ')[1];
  if (!token) throw new UnauthorizedError('Missing token');
  const payload = verifyToken(token);
  if (!payload) throw new UnauthorizedError('Invalid token');
  request.userContext = payload;
}

/** 取当前登录用户 id（须在 jwtAuth 之后调用） */
function userId(request: any): number {
  return (request as any).userContext.userId;
}

export async function oauthRoutes(app: FastifyInstance) {
  // GET /api/v1/auth/oauth/github/url
  app.get('/api/v1/auth/oauth/github/url', async (_request, reply) => {
    const config = getGitHubOAuthConfig();
    if (!config) throw new OAuthNotConfiguredError();

    // P1 无状态实现：state 不落库（防 CSRF 校验留待 P2，见 oauth.ts getGitHubOAuthUrl）
    const state = crypto.randomBytes(32).toString('hex');
    const url = getGitHubOAuthUrl(state, config);

    return reply.send({ url });
  });

  // GET /api/v1/auth/oauth/github/callback
  app.get('/api/v1/auth/oauth/github/callback', async (request, reply) => {
    const config = getGitHubOAuthConfig();
    if (!config) throw new OAuthNotConfiguredError();

    const query = request.query as Record<string, string | undefined>;
    const code = query.code;
    if (!code) throw new ValidationError('Missing OAuth code');

    const result = await handleGitHubCallback(code, { config });

    // 与 auth.ts login 一致：写入会话表，refresh 流程可复用
    await createSession(result.user.id, result.tokens.accessToken, result.tokens.refreshToken, request.ip);

    // 前端契约：token + user 摘要（前端自行存 localStorage 后跳转）
    return reply.send({
      token: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: result.tokens.expiresIn,
      user: result.user,
    });
  });

  // GET /api/v1/auth/oauth/bindings — 当前用户绑定列表（需登录）
  app.get('/api/v1/auth/oauth/bindings', { preHandler: [jwtAuth] }, async (request, reply) => {
    const list = await getUserOAuthBindings(userId(request));
    // 前端契约：{ data: [{ provider, open_id, email, bound_at }] }，无绑定返回空数组
    return reply.send({ data: list });
  });

  // POST /api/v1/auth/oauth/:provider/bind — 已登录用户发起第三方绑定（需登录）
  app.post('/api/v1/auth/oauth/:provider/bind', { preHandler: [jwtAuth] }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const body = (request.body ?? {}) as { code?: unknown };
    if (typeof body.code !== 'string' || body.code.length === 0) {
      throw new ValidationError('Missing OAuth code');
    }

    const result = await bindOAuthAccount({ userId: userId(request), provider, code: body.code });
    // 前端契约：{ data: { bound: true, provider, open_id } }
    return reply.send({ data: result });
  });

  // POST /api/v1/auth/oauth/:provider/unbind — 解绑当前用户对指定 provider 的绑定（需登录）
  app.post('/api/v1/auth/oauth/:provider/unbind', { preHandler: [jwtAuth] }, async (request, reply) => {
    const { provider } = request.params as { provider: string };

    const result = await unbindOAuthAccount({ userId: userId(request), provider });
    // 前端契约：{ data: { unbound: true, provider } }
    return reply.send({ data: result });
  });
}
