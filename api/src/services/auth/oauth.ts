/**
 * GitHub OAuth 第三方登录 + 绑定管理服务
 *
 * 职责：
 * - getGitHubOAuthUrl：生成跳转 GitHub 授权页的 URL（/url 端点）
 * - exchangeGitHubCode：用授权 code 换 access_token
 * - fetchGitHubUser：拉取 GitHub 用户信息 + 邮箱列表
 * - handleGitHubCallback：回调完整编排（查绑定 → 链接/自动注册 → 签发 JWT）
 * - getUserOAuthBindings：查询当前用户绑定列表（/bindings 端点）
 * - bindOAuthAccount：已登录用户发起第三方绑定（/bind 端点，幂等 + 冲突判定）
 * - unbindOAuthAccount：解绑当前用户的第三方账号（/unbind 端点）
 *
 * 设计要点：
 * - 所有出站 HTTP 调用使用可注入的 fetchImpl（默认全局 fetch），便于纯单测；
 *   超时统一 AbortController 10s。
 * - 配置从环境变量读取（GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / OAUTH_REDIRECT_BASE），
 *   未配置时抛 OAuthNotConfiguredError(503)，不崩溃。
 * - 错误映射：GitHub 返回 error（code 无效）→ 400；网络/上游失败 → 502；
 *   DB 写入失败 → 500。
 * - 绑定管理错误映射：provider 不在白名单 → 400；绑定场景 code 无效 → 401；
 *   第三方账号已被其他用户绑定 → 409；重复绑定当前用户 → 幂等返回；
 *   wechat/telegram/google 未接入 → 501；解绑不存在的绑定 → 404。
 *
 * @see newapi-gap-analysis.md Batch 2 任务 2.1（GitHub OAuth 第三方登录）
 * @module services/auth/oauth
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { db, schema } from '../../db';
import { and, desc, eq } from 'drizzle-orm';
import { AppError, ValidationError } from '../../lib/errors';
import { generateTokenPair, type TokenPair } from './jwt';

// ============================================================
// 常量与错误类型
// ============================================================

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_BASE = 'https://api.github.com';
/** 出站请求超时：GitHub 偶发慢响应，10s 足够且不拖垮回调请求 */
const OAUTH_FETCH_TIMEOUT_MS = 10_000;

/** GitHub OAuth 服务未配置（环境变量缺失） */
export class OAuthNotConfiguredError extends AppError {
  constructor() {
    super('GitHub OAuth is not configured', 503, 'OAUTH_NOT_CONFIGURED');
  }
}

/** GitHub 返回 error（授权 code 无效 / 已过期 / 重复使用） */
export class OAuthCodeInvalidError extends AppError {
  constructor(detail: string) {
    super(`GitHub OAuth code is invalid: ${detail}`, 400, 'OAUTH_CODE_INVALID');
  }
}

/** GitHub API 调用失败（网络错误 / 5xx / 非预期响应） */
export class OAuthUpstreamError extends AppError {
  constructor(detail: string) {
    super(`GitHub OAuth upstream error: ${detail}`, 502, 'OAUTH_UPSTREAM_ERROR');
  }
}

// ============================================================
// 类型定义
// ============================================================

export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** 回调地址前缀，如 http://localhost:3000；最终 redirect_uri = {base}/api/v1/auth/oauth/github/callback */
  redirectBase: string;
}

export interface GitHubUserInfo {
  /** 第三方唯一 ID（GitHub numeric user id 的字符串形式） */
  openId: string;
  /** 第三方邮箱，可能为空（用户未授权或未设置公开邮箱） */
  email: string | null;
  /** 展示名（GitHub display name，缺省时回落 login） */
  name: string;
  /** 头像地址，可能为空 */
  avatarUrl: string | null;
}

export interface OAuthCallbackResult {
  user: {
    id: number;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
  tokens: TokenPair;
}

/** 可注入依赖：fetchImpl 便于单测；config 显式传入时跳过环境变量读取 */
export interface OAuthServiceDeps {
  fetchImpl?: typeof fetch;
  config?: GitHubOAuthConfig;
}

type UserRow = typeof schema.users.$inferSelect;

// ============================================================
// 配置
// ============================================================

/**
 * 从环境变量读取 GitHub OAuth 配置。
 *
 * @param env - 环境变量对象，默认 process.env（便于测试注入）
 * @returns 配置对象；三个变量任一缺失返回 null（路由据此返回 503）
 */
export function getGitHubOAuthConfig(env: NodeJS.ProcessEnv = process.env): GitHubOAuthConfig | null {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  const redirectBase = env.OAUTH_REDIRECT_BASE;
  if (!clientId || !clientSecret || !redirectBase) return null;
  return { clientId, clientSecret, redirectBase };
}

// ============================================================
// 1. 生成授权 URL
// ============================================================

/**
 * 生成跳转 GitHub 授权页的 URL。
 *
 * scope=read:user user:email：read:user 拿公开资料，user:email 拿邮箱
 * （自动注册需邮箱；用户拒绝时 email 为空，走合成邮箱兜底）。
 *
 * @param state - 随机 state 串（CSRF 防护，P1 无状态实现未校验，见 @see）
 * @param config - OAuth 配置
 * @returns 完整授权 URL
 *
 * @see TODO(oauth): P2 将 state 存入 Redis 并在回调校验，防 CSRF
 */
export function getGitHubOAuthUrl(state: string, config: GitHubOAuthConfig): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.redirectBase}/api/v1/auth/oauth/github/callback`,
    scope: 'read:user user:email',
    state,
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

// ============================================================
// 2. code 换 access_token
// ============================================================

/**
 * 用授权 code 向 GitHub 换取 access_token。
 *
 * @param code - GitHub 回调返回的授权 code（一次性）
 * @param deps - 可注入 fetchImpl / config
 * @returns access_token 字符串
 * @throws {OAuthCodeInvalidError} GitHub 返回 error 字段或缺失 access_token（400）
 * @throws {OAuthUpstreamError} 网络错误 / 非 2xx（502）
 * @throws {OAuthNotConfiguredError} 配置缺失（503）
 */
export async function exchangeGitHubCode(
  code: string,
  deps: OAuthServiceDeps = {},
): Promise<string> {
  const config = deps.config ?? getGitHubOAuthConfig();
  if (!config) throw new OAuthNotConfiguredError();
  const fetchImpl = deps.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OAUTH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
      }),
      signal: controller.signal,
    });

    // GitHub 对无效 code 返回 200 + { error: 'bad_verification_code' }
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }

    if (data.error) {
      throw new OAuthCodeInvalidError(String(data.error_description ?? data.error));
    }
    if (!res.ok) {
      throw new OAuthUpstreamError(`token endpoint returned ${res.status}`);
    }
    if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
      throw new OAuthCodeInvalidError('no access_token in response');
    }
    return data.access_token;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new OAuthUpstreamError((err as Error).message);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// 3. 拉取 GitHub 用户信息
// ============================================================

/**
 * 拉取 GitHub 用户资料 + 邮箱列表，归一化为 GitHubUserInfo。
 *
 * GitHub 的 /user 接口 email 常为 null（隐私设置），因此必须额外请求
 * /user/emails；邮箱优先级：primary+verified → verified → 任意 → user.email。
 *
 * @param accessToken - exchangeGitHubCode 换取的 token
 * @param deps - 可注入 fetchImpl
 * @returns 归一化的用户信息（openId/email/name/avatarUrl）
 * @throws {OAuthUpstreamError} GitHub 返回非 2xx 或网络错误（502）
 */
export async function fetchGitHubUser(
  accessToken: string,
  deps: Pick<OAuthServiceDeps, 'fetchImpl'> = {},
): Promise<GitHubUserInfo> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OAUTH_FETCH_TIMEOUT_MS);
  try {
    const [userRes, emailsRes] = await Promise.all([
      fetchImpl(`${GITHUB_API_BASE}/user`, { headers, signal: controller.signal }),
      fetchImpl(`${GITHUB_API_BASE}/user/emails`, { headers, signal: controller.signal }),
    ]);

    const userData = (await userRes.json().catch(() => ({}))) as Record<string, unknown>;
    const emailsData = (await emailsRes.json().catch(() => [])) as Array<Record<string, unknown>>;

    if (!userRes.ok || userData.id === undefined || userData.id === null) {
      throw new OAuthUpstreamError(`user API returned ${userRes.status}`);
    }

    const openId = String(userData.id);
    const login = typeof userData.login === 'string' ? userData.login : openId;
    const name = typeof userData.name === 'string' && userData.name.length > 0 ? userData.name : login;
    const avatarUrl = typeof userData.avatar_url === 'string' && userData.avatar_url.length > 0
      ? userData.avatar_url
      : null;

    return { openId, email: pickGitHubEmail(emailsData, userData), name, avatarUrl };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new OAuthUpstreamError((err as Error).message);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 从 /user/emails 数组 + /user 响应中挑出可用邮箱。
 *
 * @param emails - GitHub /user/emails 返回的邮箱数组
 * @param userData - GitHub /user 返回的用户对象
 * @returns 邮箱或 null
 */
function pickGitHubEmail(
  emails: Array<Record<string, unknown>>,
  userData: Record<string, unknown>,
): string | null {
  const primaryVerified = emails.find((e) => e.primary === true && e.verified === true);
  const verified = emails.find((e) => e.verified === true);
  const anyEmail = emails.find((e) => typeof e.email === 'string' && (e.email as string).length > 0);
  const picked = (primaryVerified ?? verified ?? anyEmail)?.email;
  if (typeof picked === 'string' && picked.length > 0) return picked;
  if (typeof userData.email === 'string' && userData.email.length > 0) return userData.email;
  return null;
}

// ============================================================
// 4. 回调编排：绑定 / 链接 / 自动注册 + 签发 JWT
// ============================================================

/**
 * GitHub 回调完整链路：换 token → 拉用户 → 查绑定 → 链接或自动注册 → 签发 JWT。
 *
 * 决策树：
 *   1. (provider='github', openId) 已有绑定 → 直接用绑定用户签发 JWT
 *   2. 无绑定但同 email 用户存在 → 创建绑定 + 签发 JWT
 *   3. 无绑定无用户 → 自动注册（随机不可登录密码）+ 创建绑定（同事务）+ 签发 JWT
 *
 * @param code - GitHub 回调的授权 code
 * @param deps - 可注入 fetchImpl / config
 * @returns 签发的 token 对 + 用户摘要（id/email/name/avatarUrl）
 * @throws {OAuthCodeInvalidError} code 无效（400）
 * @throws {OAuthUpstreamError} GitHub API 失败（502）
 * @throws {AppError} DB 操作失败（500，OAUTH_DB_ERROR）
 */
export async function handleGitHubCallback(
  code: string,
  deps: OAuthServiceDeps = {},
): Promise<OAuthCallbackResult> {
  // 1. 换 token + 拉用户（GitHub 侧失败在 exchange/fetch 内抛出 400/502）
  const accessToken = await exchangeGitHubCode(code, deps);
  const ghUser = await fetchGitHubUser(accessToken, deps);

  try {
    // 2. 查绑定
    const bindings = await db.select()
      .from(schema.userOauthBindings)
      .where(and(
        eq(schema.userOauthBindings.provider, 'github'),
        eq(schema.userOauthBindings.openId, ghUser.openId),
      ))
      .limit(1);

    // 3. 命中绑定 → 直接登录；否则链接/自动注册
    const user = bindings.length > 0
      ? await loadUserById(bindings[0]!.userId)
      : await linkOrCreateUser(ghUser);

    // 4. 签发 JWT（与 auth.ts login 同源：jwt.ts generateTokenPair）
    const tokens = generateTokenPair({ userId: user.id, email: user.email, role: user.role });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl ?? null,
      },
      tokens,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`OAuth login failed due to database error: ${(err as Error).message}`, 500, 'OAUTH_DB_ERROR');
  }
}

/**
 * 按 id 加载用户；绑定存在但用户被删时视为数据异常。
 *
 * @param userId - users.id
 * @returns 用户行
 * @throws {AppError} 绑定指向的用户不存在（500）
 */
async function loadUserById(userId: number): Promise<UserRow> {
  const users = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (users.length === 0) {
    throw new AppError(`OAuth binding references missing user ${userId}`, 500, 'OAUTH_BINDING_ORPHAN');
  }
  return users[0]!;
}

/**
 * 链接或自动注册：同 email 用户存在 → 只建绑定；否则事务内注册用户 + 建绑定。
 *
 * @param ghUser - GitHub 用户信息
 * @returns 命中的本地用户行
 */
async function linkOrCreateUser(ghUser: GitHubUserInfo): Promise<UserRow> {
  // 2a. 同 email 用户存在 → 创建绑定即可（不新建用户、不覆盖原密码）
  if (ghUser.email) {
    const users = await db.select()
      .from(schema.users)
      .where(eq(schema.users.email, ghUser.email))
      .limit(1);
    if (users.length > 0) {
      await db.insert(schema.userOauthBindings).values({
        userId: users[0]!.id,
        provider: 'github',
        openId: ghUser.openId,
        email: ghUser.email,
      });
      return users[0]!;
    }
  }

  // 2b. 无匹配用户 → 自动注册 + 创建绑定（多表写入，同一事务保证原子性）
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.users).values({
      // GitHub 未授权邮箱时用合成邮箱兜底（openId 唯一 ⇒ 邮箱唯一）
      email: ghUser.email ?? syntheticEmail(ghUser.openId),
      passwordHash: generateRandomPasswordHash(),
      name: ghUser.name,
      avatarUrl: ghUser.avatarUrl,
      role: 'customer',
    }).returning();

    if (!created) {
      throw new AppError('Failed to create OAuth user', 500, 'OAUTH_USER_CREATE_FAILED');
    }

    await tx.insert(schema.userOauthBindings).values({
      userId: created.id,
      provider: 'github',
      openId: ghUser.openId,
      email: ghUser.email,
    });

    return created;
  });
}

/**
 * 生成随机不可登录密码的 bcrypt 哈希（OAuth 用户无法用密码登录，只能走第三方）。
 *
 * @returns bcrypt 哈希字符串
 */
function generateRandomPasswordHash(): string {
  const random = crypto.randomBytes(24).toString('hex');
  return bcrypt.hashSync(random, 12);
}

/**
 * GitHub 未提供邮箱时的合成邮箱（不可收信，仅满足 users.email 唯一约束）。
 *
 * @param openId - GitHub 用户唯一 ID
 * @returns 合成邮箱
 */
function syntheticEmail(openId: string): string {
  return `github-${openId}@oauth.local`;
}

// ============================================================
// 5. 绑定管理：列表 / 发起绑定 / 解绑
// ============================================================

/** 支持的 OAuth provider 白名单（与前端 OAuthPage / SecurityPage 的 PROVIDERS 对齐） */
export const OAUTH_PROVIDERS = ['github', 'wechat', 'telegram', 'google'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/**
 * 绑定场景下第三方授权 code 无效（401）。
 *
 * 与快捷登录回调（OAuthCodeInvalidError，400）区分：已登录用户主动发起绑定时，
 * 携带的 code 属于"第三方身份凭证"，无效即认证失败，语义上更接近 401。
 */
export class OAuthBindCodeInvalidError extends AppError {
  constructor() {
    super('OAuth code is invalid or expired', 401, 'OAUTH_BIND_CODE_INVALID');
  }
}

/** 发起绑定：该第三方账号已被其他用户绑定（409） */
export class OAuthBindingConflictError extends AppError {
  constructor(provider: string, openId: string) {
    super(
      `OAuth account ${provider}:${openId} is already bound to another user`,
      409,
      'OAUTH_BINDING_CONFLICT',
      { provider, openId },
    );
  }
}

/** 发起绑定：provider 的第三方 API 尚未接入（501） */
export class OAuthNotImplementedError extends AppError {
  constructor(provider: string) {
    super(`OAuth provider ${provider} is not implemented yet`, 501, 'NOT_IMPLEMENTED', { provider });
  }
}

/** 解绑：当前用户对该 provider 无绑定记录（404） */
export class OAuthNotBoundError extends AppError {
  constructor(provider: string) {
    super(`No OAuth binding for provider ${provider}`, 404, 'NOT_BOUND', { provider });
  }
}

/** 绑定列表 DTO（对外契约：open_id / bound_at 蛇形命名，对齐前端调用） */
export interface OAuthBindingDTO {
  provider: string;
  open_id: string;
  email: string | null;
  bound_at: string;
}

/** 发起绑定的结果 */
export interface OAuthBindResult {
  bound: boolean;
  provider: OAuthProvider;
  open_id: string;
}

/** 解绑的结果 */
export interface OAuthUnbindResult {
  unbound: boolean;
  provider: OAuthProvider;
}

/**
 * 查询当前用户的全部第三方绑定（按绑定时间倒序）。
 *
 * @param userId - 当前登录用户（users.id）
 * @returns 绑定列表 DTO 数组（无绑定返回空数组）
 */
export async function getUserOAuthBindings(userId: number): Promise<OAuthBindingDTO[]> {
  const rows = await db.select({
    provider: schema.userOauthBindings.provider,
    openId: schema.userOauthBindings.openId,
    email: schema.userOauthBindings.email,
    createdAt: schema.userOauthBindings.createdAt,
  })
    .from(schema.userOauthBindings)
    .where(eq(schema.userOauthBindings.userId, userId))
    .orderBy(desc(schema.userOauthBindings.createdAt));

  return rows.map((r) => ({
    provider: r.provider,
    open_id: r.openId,
    email: r.email,
    bound_at: new Date(r.createdAt).toISOString(),
  }));
}

/**
 * 已登录用户把当前账号与第三方账号绑定（OAuth 授权码流程）。
 *
 * 含义区别于未登录时的快捷登录：本函数要求调用方已通过 JWT 鉴权，
 * 用第三方授权 code 换取第三方身份后，把该身份挂到当前用户下。
 *
 * 流程：
 *   1. provider 白名单校验（不在白名单 → 400）
 *   2. 非 GitHub provider 未接入第三方 API → 501
 *   3. code 换第三方用户信息（GitHub 复用 exchangeGitHubCode + fetchGitHubUser）
 *   4. (provider, openId) 已绑定其他用户 → 409；已绑定当前用户 → 幂等返回
 *   5. 未绑定 → INSERT，返回 { bound: true, provider, open_id }
 *
 * 幂等语义：同一 provider 已绑定当前用户时直接返回现有绑定，不重复 INSERT
 * （前端重复点击 / 回调重放时行为安全）。
 *
 * @param params.userId - 当前登录用户（users.id）
 * @param params.provider - 第三方平台（github/wechat/telegram/google）
 * @param params.code - 第三方授权 code（一次性）
 * @param params.deps - 可注入 fetchImpl / config（测试用）
 * @returns 绑定结果
 * @throws {ValidationError} provider 不在白名单（400）
 * @throws {OAuthNotImplementedError} wechat/telegram/google 未接入（501）
 * @throws {OAuthBindCodeInvalidError} code 无效（401，绑定场景）
 * @throws {OAuthUpstreamError} GitHub API 网络/上游失败（502）
 * @throws {OAuthBindingConflictError} 第三方账号已被其他用户绑定（409）
 */
export async function bindOAuthAccount(params: {
  userId: number;
  provider: string;
  code: string;
  deps?: OAuthServiceDeps;
}): Promise<OAuthBindResult> {
  const { userId, provider, code, deps } = params;

  if (!(OAUTH_PROVIDERS as readonly string[]).includes(provider)) {
    throw new ValidationError(`Unsupported OAuth provider: ${provider}`);
  }

  // wechat / telegram / google 的第三方 API 尚未接入 → 501
  // TODO(oauth): P2 按 provider 分发到各自的 exchange/fetch 实现（微信 / Telegram / Google）
  if (provider !== 'github') {
    throw new OAuthNotImplementedError(provider);
  }

  // 1. code 换第三方用户信息（复用登录链路的 GitHub 实现，不重复实现）
  let ghUser: GitHubUserInfo;
  try {
    const accessToken = await exchangeGitHubCode(code, deps);
    ghUser = await fetchGitHubUser(accessToken, deps);
  } catch (err) {
    // 绑定场景下 code 无效视为认证失败（401）；上游/配置错误保持原样（502/503）
    if (err instanceof OAuthCodeInvalidError) throw new OAuthBindCodeInvalidError();
    throw err;
  }

  // 2. 查 (provider, openId) 现有绑定：归属当前用户 → 幂等；归属他人 → 409
  const existing = await db.select()
    .from(schema.userOauthBindings)
    .where(and(
      eq(schema.userOauthBindings.provider, provider),
      eq(schema.userOauthBindings.openId, ghUser.openId),
    ))
    .limit(1);

  if (existing.length > 0) {
    if (existing[0]!.userId === userId) {
      // 幂等：同一第三方账号重复绑定当前用户，直接返回现有绑定，不重复 INSERT
      return { bound: true, provider: provider as OAuthProvider, open_id: ghUser.openId };
    }
    throw new OAuthBindingConflictError(provider, ghUser.openId);
  }

  // 3. 插入绑定（唯一索引 uq_user_oauth_bindings_provider_open_id 兜底并发）
  try {
    await db.insert(schema.userOauthBindings).values({
      userId,
      provider,
      openId: ghUser.openId,
      email: ghUser.email,
    });
  } catch (err) {
    // 并发下两个请求同时通过第 2 步检查 → 唯一索引冲突 → 重新查询判定归属
    if (isUniqueViolation(err)) {
      const re = await db.select()
        .from(schema.userOauthBindings)
        .where(and(
          eq(schema.userOauthBindings.provider, provider),
          eq(schema.userOauthBindings.openId, ghUser.openId),
        ))
        .limit(1);
      if (re.length > 0 && re[0]!.userId === userId) {
        return { bound: true, provider: provider as OAuthProvider, open_id: ghUser.openId };
      }
      throw new OAuthBindingConflictError(provider, ghUser.openId);
    }
    throw err;
  }

  return { bound: true, provider: provider as OAuthProvider, open_id: ghUser.openId };
}

/**
 * 解绑当前用户对指定 provider 的绑定。
 *
 * NOTE: 本期解绑不强制验证密码 / 2FA（从简）；后续迭代可要求二次确认
 * （如验证当前密码或 TOTP）防止账号被他人恶意解绑。
 *
 * @param params.userId - 当前登录用户（users.id）
 * @param params.provider - 第三方平台（github/wechat/telegram/google）
 * @returns 解绑结果
 * @throws {ValidationError} provider 不在白名单（400）
 * @throws {OAuthNotBoundError} 当前用户无该 provider 绑定（404）
 */
export async function unbindOAuthAccount(params: {
  userId: number;
  provider: string;
}): Promise<OAuthUnbindResult> {
  const { userId, provider } = params;

  if (!(OAUTH_PROVIDERS as readonly string[]).includes(provider)) {
    throw new ValidationError(`Unsupported OAuth provider: ${provider}`);
  }

  const result = await db.delete(schema.userOauthBindings)
    .where(and(
      eq(schema.userOauthBindings.userId, userId),
      eq(schema.userOauthBindings.provider, provider),
    ))
    .returning({ id: schema.userOauthBindings.id });

  if (result.length === 0) {
    throw new OAuthNotBoundError(provider);
  }

  return { unbound: true, provider: provider as OAuthProvider };
}

/**
 * 判断是否为 PostgreSQL 唯一约束冲突（SQLSTATE 23505 unique_violation）。
 *
 * 用于并发绑定场景下依赖唯一索引兜底时的错误识别。
 *
 * @param err - 捕获的异常
 * @returns true = 唯一约束冲突
 */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}
