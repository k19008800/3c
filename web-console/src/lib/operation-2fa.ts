/**
 * 操作级 2FA（R7）— 前端包装层（ARCH v1.1 §4.7：同一弹窗两步，先身份后意图）
 *
 * 职责：
 * - requestOperation2fa()：调 POST /auth/2fa/operation-verify（TOTP/备用码）换取 5 分钟操作令牌
 * - withOperation2fa(action, summary)：资金写操作包装——
 *     · 第一次尝试只带（缓存）令牌、不带确认标记（confirmed=false）→ 后端 403 驱动
 *     · 403 OPERATION_2FA_REQUIRED / EXPIRED / INVALID / OPERATION_CONFIRM_REQUIRED
 *       → 弹两步 Operation2faModal（① 2FA 验证 → ② 摘要确认执行）
 *     · 确认执行后自动重放原请求（附 X-Operation-Token + X-Operation-Confirm: confirmed）
 *     · 重放仍 EXPIRED/INVALID → 清缓存重开弹窗一次（有界）
 * - 操作令牌内存缓存（5 分钟 TTL，过期由后端 JWT 强制；不落 localStorage）
 *
 * 二次确认（E30 AND 语义）：确认标记 = 用户在本轮弹窗第二步点击 [确认执行] 后产生，
 * 由 action 闭包在重放时附带 `X-Operation-Confirm: confirmed`；缓存令牌只豁免"身份验证"
 * （第一步可跳过），不豁免"意图确认"。
 *
 * ⚠️ 401 规避红线（ARCH §4.2 / §10.2）：资金端点中间件与 operation-verify 的错误码
 * 全部避开 401（403/429/400），避免触发 web-console/src/lib/api.ts 的 401 全局拦截器
 * （清 token 跳登录）。仅登录 JWT 失效时后端才返回 401，此时登出为正确行为，不由本模块处理。
 *
 * @see 3cloud/docs/ARCH-整改R5-R7-资金风控.md §4.2 / §4.4 / §4.7 / §10.2
 * @module lib/operation-2fa
 */

import { api, extractError } from "./api";
import {
  openOperation2faModal,
  Operation2faCanceledError,
  isOperation2faCanceled,
} from "../components/Operation2faModal";
import type { Operation2faVerifyFn, OperationSummaryItem } from "../components/Operation2faModal";

/** 2FA 相关业务错误码集合（中间件 403 + verify 400/429；全部避开 401） */
const OP_2FA_ERROR_CODES: ReadonlySet<string> = new Set([
  "OPERATION_2FA_REQUIRED",       // 缺 X-Operation-Token（403）
  "OPERATION_2FA_EXPIRED",        // 令牌过期（403）
  "OPERATION_2FA_INVALID",        // 令牌无效/他人令牌（403）
  "OPERATION_2FA_NOT_ENABLED",    // 未启用 2FA（403 中间件 / verify）
  "OPERATION_2FA_LOCKED",         // 错误次数达上限锁定（429）
  "OPERATION_CONFIRM_REQUIRED",   // 缺 X-Operation-Confirm 二次确认标记（403，E30 AND）
  "TWO_FACTOR_NOT_ENABLED",       // verify 端点未启用（400 兼容码）
  "INVALID_OPERATION_2FA",        // TOTP/备用码错误（400，verify 端点）
]);

/** 二次确认标记头与取值（E30；重放时由 action 闭包附带） */
export const OPERATION_CONFIRM_HEADER = "X-Operation-Confirm";
export const OPERATION_CONFIRM_VALUE = "confirmed";

/**
 * 构造 2FA 请求头（withOperation2fa action 内使用）。
 *
 * 规则：有令牌 → 附 X-Operation-Token；confirmed=true → 附 X-Operation-Confirm: confirmed。
 * 探测轮（confirmed=false）永不附确认标记，由后端 403 OPERATION_CONFIRM_REQUIRED 驱动两步弹窗。
 *
 * @param ctx - withOperation2fa 传入的操作上下文
 * @param extra - 额外头（如 Idempotency-Key）
 */
export function operation2faHeaders(ctx: { token: string | null; confirmed: boolean }, extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  if (ctx.token) h["X-Operation-Token"] = ctx.token;
  if (ctx.confirmed) h[OPERATION_CONFIRM_HEADER] = OPERATION_CONFIRM_VALUE;
  return h;
}

/** 操作令牌默认 TTL（秒）：ARCH v1.1 §4.2 expires_in=300，5 分钟窗口复用 */
const OP_TOKEN_TTL_MS = 5 * 60 * 1000;

/** 内存操作令牌缓存（不落 localStorage；5 分钟过期由后端 JWT 强制） */
let opTokenCache: { token: string; expiresAt: number } | null = null;

/** 读取未过期的缓存操作令牌（过期自动清除） */
export function getCachedOperationToken(): string | null {
  if (!opTokenCache) return null;
  if (Date.now() >= opTokenCache.expiresAt) {
    opTokenCache = null;
    return null;
  }
  return opTokenCache.token;
}

/** 清空操作令牌缓存（令牌过期/失效时调用，下次资金操作需重新验证） */
export function clearOperationTokenCache(): void {
  opTokenCache = null;
}

/**
 * 调 POST /auth/2fa/operation-verify（TOTP 或备用码，至少一个；都传时 token 优先）。
 *
 * 成功 200：{ data: { op_token, expires_in }, message }
 *
 * @param payload - { token?: 6 位 TOTP；backup_code?: 备用码 }
 * @returns 操作令牌与有效期（秒）
 * @throws 403 OPERATION_2FA_NOT_ENABLED / 400 INVALID_OPERATION_2FA / 429 OPERATION_2FA_LOCKED / 401（登录态失效）
 */
export async function requestOperation2fa(payload: { token?: string; backup_code?: string }): Promise<{ op_token: string; expires_in: number }> {
  const res = await api.post<{ data: { op_token: string; expires_in: number }; message?: string }>(
    "/auth/2fa/operation-verify",
    payload,
  );
  const data = res.data?.data;
  if (!data?.op_token) throw new Error(extractError(res) ?? "2FA 验证响应异常");
  return data;
}

/** 提取后端业务错误码（导出复用；AppError 序列化 code 字段） */
export function getOperation2faErrorCode(err: any): string | undefined {
  const code = err?.response?.data?.code;
  if (typeof code === "string" && code) return code;
  const error = err?.response?.data?.error;
  if (typeof error === "string" && error) return error;
  return undefined;
}

/**
 * 2FA 相关错误的用户友好文案（页面 onError 优先使用，避免被通用 403/429 分支误读）。
 * 非 2FA 错误返回 null，调用方回退 extractError。
 */
export function operation2faErrorText(err: any): string | null {
  const code = getOperation2faErrorCode(err);
  if (code === "OPERATION_2FA_NOT_ENABLED" || code === "TWO_FACTOR_NOT_ENABLED") {
    return "执行资金操作需先启用双因素认证（2FA），请前往「账号安全」启用后再试";
  }
  if (code === "OPERATION_2FA_LOCKED") {
    return "操作级 2FA 已锁定，请 15 分钟后再试（可关闭本提示等待倒计时）";
  }
  return null;
}

/** 从 429 锁定响应解析剩余秒数（retry-after 头/字段；无则缺省，弹窗回退 15 分钟） */
function lockSecondsFromError(err: any): number | undefined {
  const raw = err?.response?.headers?.["retry-after"]
    ?? err?.response?.data?.retry_after
    ?? err?.response?.data?.lock_remaining;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n), 3600) : undefined;
}

/** 弹两步弹窗并缓存新令牌（verifyOnce）；skipVerify=缓存令牌有效时跳过第一步验证 */
async function verifyOnce(summary: OperationSummaryItem[] | undefined, skipVerify: boolean, cachedToken: string | null): Promise<string> {
  clearOperationTokenCache();
  const verifyFn: Operation2faVerifyFn = (payload) => requestOperation2fa(payload);
  const token = await openOperation2faModal({
    mode: "verify",
    onVerify: verifyFn,
    summary,
    skipVerify,
    initialToken: skipVerify ? (cachedToken ?? undefined) : undefined,
  });
  opTokenCache = { token, expiresAt: Date.now() + OP_TOKEN_TTL_MS };
  return token;
}

/**
 * 资金写操作 2FA 包装（R7 前端落点，ARCH v1.1 §4.7：同一弹窗两步，两步全过才发请求）。
 *
 * 流程：
 *   1. 第一次尝试 action({ token: 缓存或 null, confirmed: false })——永不附带确认标记，
 *      由后端中间件 403 驱动（缺令牌 → OPERATION_2FA_REQUIRED；有令牌缺确认 →
 *      OPERATION_CONFIRM_REQUIRED；令牌过期/无效 → EXPIRED/INVALID）
 *   2. 上述 403 → 弹两步 Operation2faModal：
 *      ① TOTP/备用码验证（缓存令牌有效时跳过，仅确认摘要）→ ② 操作摘要 + [确认执行]
 *   3. 确认执行 → 自动重放 action({ token, confirmed: true })（闭包附
 *      X-Operation-Token + X-Operation-Confirm: confirmed）
 *   4. 重放仍 EXPIRED/INVALID → 清缓存、重开弹窗一次（有界重试，保留操作上下文）
 *   5. NOT_ENABLED → 引导弹窗 [前往启用]（跳安全中心）+ 抛原错误；
 *      LOCKED → 锁定倒计时弹窗 + 抛原错误
 *   6. 其余错误原样抛出
 *
 * 顺序裁决：按钮点击 → withOperation2fa（403 驱动弹窗）→ 两步全过 → 提交。
 * 401 由 axios 拦截器自然登出（登录态已失效，行为正确），本模块不处理。
 *
 * @param action - 资金写请求函数：接收 { token: 操作令牌或 null；confirmed: 是否用户已确认 }；
 *                 confirmed=true 时必须附 X-Operation-Token 与 X-Operation-Confirm: confirmed 头
 * @param summary - 第二步操作摘要（PRD §3.3.4：单据类型/用户/金额/到账后余额/审批级别/限额升级提示）
 * @returns 原请求成功响应；用户取消验证时 reject(Operation2faCanceledError)
 */
export async function withOperation2fa<T>(
  action: (ctx: { token: string | null; confirmed: boolean }) => Promise<T>,
  summary?: OperationSummaryItem[],
): Promise<T> {
  // 第一次尝试：只带缓存令牌、不带确认标记（探测，永不直接放行）
  try {
    return await action({ token: getCachedOperationToken(), confirmed: false });
  } catch (err: any) {
    const code = getOperation2faErrorCode(err);
    if (!code || !OP_2FA_ERROR_CODES.has(code)) throw err;

    // 未启用 2FA：弹引导弹窗（前往安全中心启用）+ 抛原错误（页面 toast 提示原因）
    if (code === "OPERATION_2FA_NOT_ENABLED" || code === "TWO_FACTOR_NOT_ENABLED") {
      // 引导弹窗为"告知 + 跳转"，不等用户操作结果；吞掉取消拒绝避免 unhandled rejection
      openOperation2faModal({ mode: "not_enabled", message: extractError(err) }).catch(() => {});
      throw err;
    }
    // 锁定：弹锁定倒计时弹窗 + 抛原错误（页面 toast 提示）
    if (code === "OPERATION_2FA_LOCKED") {
      openOperation2faModal({ mode: "locked", message: extractError(err), lockRemainingSeconds: lockSecondsFromError(err) }).catch(() => {});
      throw err;
    }

    // REQUIRED / EXPIRED / INVALID / CONFIRM_REQUIRED：两步弹窗 → 验证 + 摘要确认 → 重放
    const cached = getCachedOperationToken();
    const token = await verifyOnce(summary, !!cached, cached);
    try {
      return await action({ token, confirmed: true });
    } catch (err2: any) {
      const code2 = getOperation2faErrorCode(err2);
      // 过期/失效重试（ARCH v1.1 §4.7）：清缓存、重开弹窗一次，保留操作上下文
      if (code2 === "OPERATION_2FA_EXPIRED" || code2 === "OPERATION_2FA_INVALID" || code2 === "OPERATION_2FA_REQUIRED") {
        const token2 = await verifyOnce(summary, false, null);
        return await action({ token: token2, confirmed: true });
      }
      throw err2;
    }
  }
}

/** 判断错误是否为"用户取消 2FA 验证"（页面 onError 静默处理，不弹 toast） */
export { isOperation2faCanceled, Operation2faCanceledError };
