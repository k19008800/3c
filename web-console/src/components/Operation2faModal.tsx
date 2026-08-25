/**
 * 操作级 2FA 弹窗（R7）— 资金写操作身份验证 + 二次确认（同一弹窗两步，ARCH v1.1 §4.7）
 *
 * 两步流程（PRD §3.3.4 顺序：先身份后意图）：
 *   第一步：TOTP 6 位（复用 OtpInput）/ 备用码 → operation-verify → 签发 5 分钟操作令牌
 *   第二步（验证通过后同弹窗切换）：操作摘要（单据类型/用户/金额/到账后余额/审批级别/限额升级提示）
 *           + [确认执行] / [返回修改]；确认执行才触发外层重放（附 X-Operation-Token + X-Operation-Confirm: confirmed）
 *
 * 其他模式：
 *   not_enabled — 未启用 2FA → 引导 [前往启用]（跳管理端安全设置）
 *   locked       — 连续失败锁定 → 倒计时（15:00），输入禁用
 *
 * 命令式单例挂载（createRoot 到 document.body，独立于 React 树 / Router / ToastProvider），
 * 错误以内联文本展示；成功 resolve(op_token) 的时机 = 用户点击[确认执行]。
 *
 * 错误码契约（ARCH v1.1 §4.2/§4.4/§10.2，全部避开 401 防 axios 拦截器误登出）：
 *   verify 端点：403 OPERATION_2FA_NOT_ENABLED / 400 INVALID_OPERATION_2FA / 429 OPERATION_2FA_LOCKED
 *   资金端点中间件：403 OPERATION_2FA_REQUIRED / OPERATION_2FA_EXPIRED / OPERATION_2FA_INVALID /
 *                   OPERATION_2FA_NOT_ENABLED / OPERATION_CONFIRM_REQUIRED（缺 X-Operation-Confirm，E30）
 *
 * @see 3cloud/docs/ARCH-整改R5-R7-资金风控.md §4.2 / §4.4 / §4.7 / §10.2
 * @see 3cloud/docs/PRD-整改R5-R7-资金风控.md §3.3.4 / §8（[?] 帮助数据源）
 * @module components/Operation2faModal
 */

import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HelpIcon, Modal } from "@3cloud/shared-ui";
import { extractError } from "../lib/api";
import OtpInput from "./OtpInput";

/** 弹窗模式：verify=两步验证 / not_enabled=引导启用 2FA / locked=锁定倒计时 */
export type Operation2faModalMode = "verify" | "not_enabled" | "locked";

/** 验证回调：POST /auth/2fa/operation-verify（由 operation-2fa.ts 注入，避免循环依赖） */
export interface Operation2faVerifyFn {
  (payload: { token?: string; backup_code?: string }): Promise<{ op_token: string; expires_in: number }>;
}

/** 第二步操作摘要行（PRD §3.3.4：单据类型/用户/金额/到账后余额/审批级别/限额升级提示） */
export interface OperationSummaryItem {
  label: string;
  value: string;
  /** 高亮（如金额、限额升级提示） */
  highlight?: boolean;
}

export interface Operation2faModalOptions {
  /** 初始模式，默认 verify */
  mode?: Operation2faModalMode;
  /** 外部传入的提示信息（锁定原因 / 未启用原因） */
  message?: string;
  /** 验证回调（verify 模式必填） */
  onVerify?: Operation2faVerifyFn;
  /** 锁定剩余秒数（默认 15 分钟 = 900s，ARCH v1.1 §4.5） */
  lockRemainingSeconds?: number;
  /** 第二步操作摘要（确认执行前展示） */
  summary?: OperationSummaryItem[];
  /** 缓存令牌有效 → 跳过第一步验证，直接进入第二步摘要确认（B11 窗口复用） */
  skipVerify?: boolean;
  /** skipVerify=true 时带入的缓存令牌（第二步确认执行时回传） */
  initialToken?: string;
}

/** 用户取消 2FA 验证时抛出的错误（页面 onError 需静默忽略，不弹 toast） */
export class Operation2faCanceledError extends Error {
  constructor() {
    super("操作级 2FA 验证已取消");
    this.name = "Operation2faCanceledError";
  }
}

/**
 * 提取后端错误码。
 *
 * AppError 经 Fastify 默认错误处理序列化为 `{ statusCode, code, error, message }`，
 * code 即业务码（如 OPERATION_2FA_REQUIRED）；兼容 `{ code: 'XXX' }` 直发风格。
 */
export function getOperation2faErrorCode(err: any): string | undefined {
  const code = err?.response?.data?.code;
  if (typeof code === "string" && code) return code;
  const error = err?.response?.data?.error;
  if (typeof error === "string" && error) return error;
  return undefined;
}

/** 判断错误是否为"用户取消 2FA 验证"（页面 onError 静默处理用） */
export function isOperation2faCanceled(err: unknown): boolean {
  return err instanceof Operation2faCanceledError
    || (err as { name?: string } | null)?.name === "Operation2faCanceledError";
}

// ============================================================================
// 命令式挂载（单例：同一时刻至多一个 2FA 弹窗）
// ============================================================================

let mountRoot: Root | null = null;
let mountEl: HTMLDivElement | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;
let activeOptions: Operation2faModalOptions = {};

function unmountModal(): void {
  if (mountRoot) {
    mountRoot.unmount();
    mountRoot = null;
  }
  if (mountEl) {
    mountEl.remove();
    mountEl = null;
  }
  pendingResolve = null;
  pendingReject = null;
}

/**
 * 打开操作级 2FA 两步弹窗。
 *
 * @param options - 模式 / 提示 / 验证回调 / 操作摘要 / 是否跳过验证步
 * @returns Promise<string>：用户在第二步点击 [确认执行] 后 resolve(op_token)；
 *                          取消则 reject(Operation2faCanceledError)
 */
export function openOperation2faModal(options: Operation2faModalOptions = {}): Promise<string> {
  activeOptions = options;
  return new Promise<string>((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    if (!mountEl) {
      mountEl = document.createElement("div");
      mountEl.id = "operation-2fa-modal-root";
      document.body.appendChild(mountEl);
    }
    mountRoot ??= createRoot(mountEl);
    mountRoot.render(
      <Operation2faModalInner
        options={activeOptions}
        onConfirm={(token) => {
          pendingResolve?.(token);
          unmountModal();
        }}
        onCancel={() => {
          pendingReject?.(new Operation2faCanceledError());
          unmountModal();
        }}
      />,
    );
  });
}

/** 关闭弹窗（未确认即关闭时按取消处理） */
export function closeOperation2faModal(): void {
  if (pendingReject) pendingReject(new Operation2faCanceledError());
  unmountModal();
}

// ============================================================================
// 弹窗内容
// ============================================================================

const LOCK_SECONDS_DEFAULT = 15 * 60; // 15 分钟（ARCH v1.1 §4.5）

/** 从 429 响应解析锁定剩余秒数（retry_after 头/字段 > 提示文案正则 > 默认 15 分钟） */
function parseLockRemaining(err: any, fallback: number): number {
  const raw = err?.response?.headers?.["retry-after"]
    ?? err?.response?.data?.retry_after
    ?? err?.response?.data?.lock_remaining;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.min(Math.round(n), 3600);
  const msg: string = extractError(err) ?? "";
  const m = msg.match(/(\d+)\s*(分钟|分|秒)/);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v > 0) return m[2]?.includes("秒") ? v : v * 60;
  }
  return fallback;
}

function formatLock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** 跳转安全中心启用 2FA（弹窗独立于 Router 渲染，直接用绝对路径，basename=/app） */
function goEnable2fa(): void {
  const base = window.location.pathname.startsWith("/app") ? "/app" : "";
  window.location.href = `${base}/security`;
}

/* PRD §8 按钮级帮助对照表（P1 不可降级） */
const HELP_VERIFY_INPUT = "资金写操作前的身份验证：输入认证器 6 位动态码或备用码，验证结果 5 分钟内有效；连续 5 次错误将锁定 15 分钟";
const HELP_BACKUP = "无法使用认证器时切换为备用码输入（格式 XXXX-XXXX-XXXX），备用码一次性，用后作废";
const HELP_ENABLE_2FA = "未启用双因素认证时跳转安全设置页完成启用；启用前无法执行资金写操作";
const HELP_CONFIRM_EXECUTE = "确认执行：二次确认，核对操作摘要（用户/金额/到账后余额/审批级别）后确认提交，与 2FA 验证共同构成资金操作放行的两个必要条件";

const styleBtn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit" };
const styleInp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--color-border)",
  boxSizing: "border-box", fontSize: 14, background: "var(--color-panel)", color: "var(--color-text)",
  outline: "none", fontFamily: "monospace", letterSpacing: 1.5,
};
const styleTab: React.CSSProperties = {
  padding: "5px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
  border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text-secondary)",
};
const styleDanger: React.CSSProperties = { fontSize: 13, color: "var(--color-danger-text)", background: "var(--color-danger-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 10 };

interface InnerProps {
  options: Operation2faModalOptions;
  onConfirm: (token: string) => void;
  onCancel: () => void;
}

function Operation2faModalInner({ options, onConfirm, onCancel }: InnerProps) {
  const [mode, setMode] = useState<Operation2faModalMode>(options.mode ?? "verify");
  /** 两步弹窗内部步骤：verify=第一步身份验证 / confirm=第二步摘要确认 */
  const [step, setStep] = useState<"verify" | "confirm">(options.skipVerify ? "confirm" : "verify");
  const [tab, setTab] = useState<"totp" | "backup">("totp");
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [backupCode, setBackupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  /** skipVerify（缓存令牌复用）时直接以缓存令牌进入第二步 */
  const [verifiedToken, setVerifiedToken] = useState<string | null>(
    options.skipVerify ? (options.initialToken ?? null) : null,
  );
  const [lockRemaining, setLockRemaining] = useState<number>(
    options.lockRemainingSeconds ?? LOCK_SECONDS_DEFAULT,
  );

  // 锁定倒计时：归零后回到验证步骤（后端锁定已过期）
  useEffect(() => {
    if (mode !== "locked" || lockRemaining <= 0) {
      if (mode === "locked" && lockRemaining <= 0) setMode("verify");
      return;
    }
    const timer = setTimeout(() => setLockRemaining((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [mode, lockRemaining]);

  /** 第一步：验证 TOTP/备用码 → 签发令牌 → 同弹窗切换第二步摘要确认 */
  const handleVerify = async () => {
    if (!options.onVerify) {
      setError("验证服务不可用，请稍后再试或联系管理员");
      return;
    }
    const totp = otp.join("");
    if (tab === "totp" && totp.length !== 6) {
      setError("请输入 6 位动态验证码");
      return;
    }
    if (tab === "backup" && !backupCode.trim()) {
      setError("请输入备用码（格式 XXXX-XXXX-XXXX）");
      return;
    }
    setError(null);
    setVerifying(true);
    try {
      const payload = tab === "totp" ? { token: totp } : { backup_code: backupCode.trim() };
      const res = await options.onVerify(payload);
      setVerifiedToken(res.op_token);
      setStep("confirm");
    } catch (e: any) {
      const code = getOperation2faErrorCode(e);
      if (code === "OPERATION_2FA_LOCKED") {
        // 锁定：切换倒计时模式，输入框禁用（已签发令牌不受影响）
        setMode("locked");
        setLockRemaining(parseLockRemaining(e, LOCK_SECONDS_DEFAULT));
        setOtp(Array(6).fill(""));
        setBackupCode("");
      } else if (code === "TWO_FACTOR_NOT_ENABLED" || code === "OPERATION_2FA_NOT_ENABLED") {
        setMode("not_enabled");
      } else {
        setError(extractError(e) || "验证失败，请重试");
        setOtp(Array(6).fill(""));
        setBackupCode("");
      }
    } finally {
      setVerifying(false);
    }
  };

  const summary = options.summary ?? [];

  return (
    <Modal open onClose={onCancel} title={step === "confirm" ? "二次确认：资金操作" : "身份验证：操作级 2FA"} width={440} closable={!verifying}>
      {/* ── 未启用 2FA：引导启用 ── */}
      {mode === "not_enabled" && (
        <div>
          <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 14, color: "var(--color-text)" }}>
            <strong>执行资金操作需先启用双因素认证（2FA）。</strong>
            <div style={{ color: "var(--color-text-secondary)", marginTop: 6 }}>
              {options.message ?? "为保障资金安全，资金写操作（发起上账 / 审核 / 调账 / 红冲等）强制要求操作级 2FA；启用后即可继续操作。"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button onClick={goEnable2fa} style={{ ...styleBtn, background: "var(--color-primary)", color: "#fff" }}>前往启用 2FA</button>
              <HelpIcon text={HELP_ENABLE_2FA} />
            </span>
            <button onClick={onCancel} style={{ ...styleBtn, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>稍后再说</button>
          </div>
        </div>
      )}

      {/* ── 锁定：倒计时 ── */}
      {mode === "locked" && (
        <div>
          <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 14 }}>
            <strong style={{ color: "var(--color-danger-text)" }}>操作级 2FA 已锁定</strong>
            <div style={{ color: "var(--color-text-secondary)", marginTop: 6 }}>
              连续验证失败次数过多，请 {formatLock(lockRemaining)} 后再试（锁定期间输入框不可用；已签发的操作令牌不受影响）。
            </div>
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 28, fontWeight: 700, textAlign: "center", marginBottom: 14, color: "var(--color-danger-text)" }}>
            {formatLock(lockRemaining)}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={onCancel} style={{ ...styleBtn, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>关闭</button>
          </div>
        </div>
      )}

      {/* ── 第一步：TOTP / 备用码 身份验证 ── */}
      {mode === "verify" && step === "verify" && (
        <div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 12, lineHeight: 1.7 }}>
            资金写操作需验证本人身份：输入认证器 6 位动态码或备用码。验证结果 5 分钟内有效，窗口内多次资金操作免重复验证。
            <HelpIcon text={HELP_VERIFY_INPUT} />
          </div>

          {/* 输入方式切换 */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => { setTab("totp"); setError(null); }} style={{ ...styleTab, ...(tab === "totp" ? { color: "var(--color-primary)", borderColor: "rgba(79,110,247,0.4)" } : {}) }}>认证器验证码</button>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              <button onClick={() => { setTab("backup"); setError(null); }} style={{ ...styleTab, ...(tab === "backup" ? { color: "var(--color-primary)", borderColor: "rgba(79,110,247,0.4)" } : {}) }}>使用备用码</button>
              <HelpIcon text={HELP_BACKUP} />
            </span>
          </div>

          {tab === "totp" ? (
            <>
              <OtpInput value={otp} onChange={setOtp} disabled={verifying} />
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                输入认证器当前显示的 6 位动态验证码
              </div>
            </>
          ) : (
            <>
              <input
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                maxLength={20}
                disabled={verifying}
                style={styleInp}
              />
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                输入启用 2FA 时保存的备用码（大写，可省略分隔符）；备用码一次性，用后作废
              </div>
            </>
          )}

          {error && <div style={styleDanger}>⚠️ {error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 6 }}>
            <button onClick={onCancel} disabled={verifying} style={{ ...styleBtn, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>取消</button>
            <button onClick={handleVerify} disabled={verifying} style={{ ...styleBtn, background: "var(--color-primary)", color: "#fff" }}>
              {verifying ? "验证中..." : "验证并继续"}
            </button>
          </div>
        </div>
      )}

      {/* ── 第二步：操作摘要 + 确认执行（PRD §3.3.4 / ARCH v1.1 §4.7） ── */}
      {mode === "verify" && step === "confirm" && (
        <div>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10, lineHeight: 1.7 }}>
            {options.skipVerify
              ? "✅ 身份已验证（操作令牌 5 分钟内有效），请核对以下操作摘要后确认执行。"
              : "✅ 身份验证通过，请核对以下操作摘要后确认执行。"}
          </div>

          <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, background: "var(--color-bg)", padding: "10px 12px", marginBottom: 12 }}>
            {summary.length === 0 ? (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>确认执行该资金操作？</div>
            ) : (
              summary.map((row, i) => (
                <div key={i} style={{ fontSize: 13, lineHeight: 1.9, display: "flex", gap: 8 }}>
                  <span style={{ color: "var(--color-text-secondary)", minWidth: 96, flexShrink: 0 }}>{row.label}</span>
                  <strong style={{ color: row.highlight ? "#fa8c16" : "var(--color-text)" }}>{row.value}</strong>
                </div>
              ))
            )}
          </div>

          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "var(--color-bg)", padding: "8px 10px", borderRadius: 8, marginBottom: 12 }}>
            二次确认 = 确认执行本次资金操作；确认后将提交请求（携带操作令牌 + 确认标记），后端强制校验令牌有效 AND 确认标记。
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {options.skipVerify ? (
              <button onClick={onCancel} style={{ ...styleBtn, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>取消</button>
            ) : (
              <button onClick={() => { setError(null); setStep("verify"); }} style={{ ...styleBtn, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>返回修改</button>
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <button
                onClick={() => { if (verifiedToken) onConfirm(verifiedToken); }}
                disabled={!verifiedToken}
                style={{ ...styleBtn, background: "var(--color-primary)", color: "#fff", opacity: verifiedToken ? 1 : 0.5, cursor: verifiedToken ? "pointer" : "not-allowed" }}
              >确认执行</button>
              <HelpIcon text={HELP_CONFIRM_EXECUTE} />
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
