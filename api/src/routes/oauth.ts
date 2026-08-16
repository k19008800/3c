/**
 * OAuth Routes — 第三方登录（GitHub 先行）
 *
 * 端点：
 * - GET /api/v1/auth/oauth/github/url — 生成跳转 GitHub 授权页的 URL
 * - GET /api/v1/auth/oauth/github/callback — 回调：换 token → 拉用户 → 绑定/自动注册 → 签发 JWT
 *
 * 配置缺失（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / OAUTH_REDIRECT_BASE）时
 * 两个端点均返回 503（OAUTH_NOT_CONFIGURED），不崩溃。
 *
 * @see newapi-gap-analysis.md Batch 2 任务 2.1
 * @module routes/oauth
 */

import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { createSession } from '../services/auth/jwt';
import {
  getGitHubOAuthConfig,
  getGitHubOAuthUrl,
  handleGitHubCallback,
  OAuthNotConfiguredError,
} from '../services/auth/oauth';
import { ValidationError } from '../lib/errors';

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
}
