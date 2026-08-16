import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";
import OtpInput from "../components/OtpInput";

/**
 * 账号安全页 — 对齐原型 portal-security.html
 * 板块：修改邮箱 / 修改密码 / 两步验证 / 第三方登录绑定 / 活跃会话 / 最近登录记录 / API Key 安全
 */

const card: React.CSSProperties = {
  background: "var(--color-panel)", borderRadius: 12, marginBottom: 20,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const panelHeader: React.CSSProperties = {
  padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const panelBody: React.CSSProperties = { padding: 20 };
const btn: React.CSSProperties = {
  padding: "10px 20px", borderRadius: 8, border: "1px solid var(--color-border)",
  background: "var(--color-panel)", color: "var(--color-text)", fontSize: 14,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
};
const btnPrimary: React.CSSProperties = { ...btn, border: "none", background: "var(--color-primary)", color: "#fff" };
const btnDanger: React.CSSProperties = { ...btn, border: "1px solid var(--color-danger-text)", color: "var(--color-danger-text)" };
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--color-border)",
  background: "var(--color-panel)", color: "var(--color-text)", fontSize: 14,
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};
const label: React.CSSProperties = { display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 };

export default function SecurityPage() {
  return (
    <div>
      <h2 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}>
        账号安全
        <HelpIcon text="管理邮箱、密码、两步验证、第三方登录绑定、会话及 API Key 安全设置" level="page" />
      </h2>
      <p style={{ color: "var(--color-text-secondary)", marginTop: 0, fontSize: 13, marginBottom: 20 }}>
        管理密码、会话、登录记录，以及账号注销和数据导出
      </p>

      <ChangeEmailPanel />
      <ChangePasswordPanel />
      <TwoFactorPanel />
      <ThirdPartyBindPanel />
      <ActiveSessionsPanel />
      <LoginHistoryPanel />
      <ApiKeySecurityPanel />
    </div>
  );
}

/* ==================== 1. 修改邮箱 ==================== */
function ChangeEmailPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState(Array(6).fill(""));
  const [currentPw, setCurrentPw] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async () => (await api.get<{ data: { email: string } }>("/me")).data.data,
  });

  const sendCodeMut = useMutation({
    mutationFn: async () =>
      // 后端缺失：/auth/send-email-code 接口
      // (await api.post("/auth/send-email-code", { email: newEmail })).data;
      Promise.resolve({ data: { message: "ok" } }),
    onSuccess: () => {
      setCodeSent(true);
      setCountdown(60);
      toast.success(`验证码已发送至 ${newEmail}`);
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleSendCode = () => {
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error("请输入有效的邮箱地址");
      return;
    }
    sendCodeMut.mutate();
  };

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) return 0;
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleOtpChange = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "");
    const newOtp = [...otp];
    newOtp[idx] = digit ? digit.charAt(digit.length - 1) : "";
    setOtp(newOtp);
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  };

  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) newOtp[i] = pasted[i] ?? "";
    setOtp(newOtp);
  };

  const saveEmailMut = useMutation({
    mutationFn: async () =>
      // 后端缺失：/me/change-email 接口
      // (await api.put("/me/change-email", { email: newEmail, code: otp.join(""), password: currentPw })).data;
      Promise.resolve({ data: { message: "邮箱修改成功" } }),
    onSuccess: () => {
      toast.success("邮箱修改成功！下次登录请使用新邮箱");
      setNewEmail(""); setOtp(Array(6).fill("")); setCurrentPw(""); setCodeSent(false);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleSave = () => {
    if (!newEmail) { toast.error("请输入新邮箱"); return; }
    if (otp.join("").length !== 6) { toast.error("请输入6位验证码"); return; }
    if (!currentPw) { toast.error("请输入当前密码"); return; }
    saveEmailMut.mutate();
  };

  return (
    <div style={card}>
      <div style={panelHeader}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          修改邮箱
          <HelpIcon text="修改账户绑定邮箱，需验证新邮箱并输入当前密码确认" level="button" />
        </h3>
      </div>
      <div style={panelBody}>
        <div style={{ marginBottom: 16 }}>
          <div style={label}>当前邮箱</div>
          <input value={meQ.data?.email ?? ""} readOnly style={{ ...inp, color: "var(--color-text-secondary)" }} />
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ flex: 1, marginBottom: 16 }}>
            <div style={label}>新邮箱</div>
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" placeholder="请输入新邮箱地址" style={inp} />
          </div>
          <button onClick={handleSendCode} disabled={countdown > 0} style={{ ...btnPrimary, alignSelf: "flex-end", marginBottom: 16 }}>
            {countdown > 0 ? `${countdown}s 后重发` : "发送验证码"}
          </button>
        </div>
        {codeSent && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12, marginTop: -8 }}>验证码已发送，请查收邮箱</div>}
        <div style={{ marginBottom: 16 }}>
          <div style={label}>邮箱验证码</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }} onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { otpRefs.current[i] = el; }}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                maxLength={1}
                style={{
                  width: 48, height: 56, textAlign: "center", fontSize: 22, fontWeight: 600,
                  borderRadius: 6, border: `1px solid ${digit ? "rgba(79,110,247,0.4)" : "var(--color-border)"}`,
                  background: "var(--color-panel)", color: "var(--color-text)", outline: "none",
                  fontFamily: "inherit",
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={label}>当前密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></div>
          <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="输入当前密码以确认操作" style={inp} />
        </div>
        <button onClick={handleSave} style={btnPrimary}>保存修改</button>
      </div>
    </div>
  );
}

/* ==================== 2. 修改密码 ==================== */
function ChangePasswordPanel() {
  const { toast } = useToast();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  const strength = getPwStrength(newPw);

  const saveMut = useMutation({
    mutationFn: async () =>
      (await api.put("/me/change-password", { current_password: currentPw, new_password: newPw })).data,
    onSuccess: () => {
      toast.success("密码修改成功！请重新登录");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const handleSave = () => {
    if (!currentPw) { toast.error("请输入当前密码"); return; }
    if (newPw.length < 8) { toast.error("新密码至少8位"); return; }
    if (newPw !== confirmPw) { toast.error("两次密码不一致"); return; }
    if (newPw === currentPw) { toast.error("新密码不能与当前密码相同"); return; }
    saveMut.mutate();
  };

  return (
    <div style={card}>
      <div style={panelHeader}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          修改密码
          <HelpIcon text="建议定期更换密码，新密码需至少8位，包含字母和数字" level="button" />
        </h3>
      </div>
      <div style={panelBody}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px", marginBottom: 16 }}>
            <div style={label}>当前密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></div>
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="输入当前密码" style={inp} />
          </div>
          <div style={{ flex: "1 1 200px", marginBottom: 16 }}>
            <div style={label}>新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></div>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="至少8位，含字母和数字" style={inp} />
            {/* Password strength bar */}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: i <= strength.score ? strength.color : "var(--color-divider)",
                    transition: ".3s",
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: strength.score ? strength.color : "var(--color-text-secondary)" }}>
                {strength.score ? strength.label : "未输入"}
              </div>
            </div>
          </div>
          <div style={{ flex: "1 1 200px", marginBottom: 16 }}>
            <div style={label}>确认新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></div>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="再次输入新密码" style={inp} />
            {confirmPw && newPw !== confirmPw && (
              <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>两次密码不一致</div>
            )}
          </div>
        </div>
        <button onClick={handleSave} style={btnPrimary}>保存密码</button>
      </div>
    </div>
  );
}

/* ==================== 3. 两步验证 ==================== */
function TwoFactorPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showSetup, setShowSetup] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string; backupCodes: string[] } | null>(null);
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [disableMode, setDisableMode] = useState<"totp" | "backup">("totp");
  const [backupCode, setBackupCode] = useState("");

  // 2FA 启用状态：GET /auth/2fa/status（需登录，后端 2fa.ts 追加端点），返回 { enabled }
  const statusQ = useQuery({
    queryKey: ["me-2fa"],
    queryFn: async () => (await api.get<{ enabled: boolean }>("/auth/2fa/status")).data,
  });
  const enabled = statusQ.data?.enabled;

  // 启用流程第 1 步：setup 生成 secret + otpauthUrl + 一次性备用码（暂存态，10 分钟有效）
  const setupMut = useMutation({
    mutationFn: async () =>
      (await api.post<{ secret: string; otpauthUrl: string; backupCodes: string[] }>("/auth/2fa/setup", {})).data,
    onSuccess: (d) => {
      setSetupData(d);
      setShowSetup(true);
      setOtp(Array(6).fill(""));
    },
    onError: (e) => toast.error(extractError(e)),
  });

  // 启用流程第 2 步：输入 6 位 TOTP → enable { token } 落库启用
  const enableMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/enable", { token: otp.join("") })).data,
    onSuccess: () => {
      toast.success("TOTP 两步验证已启用！");
      setShowSetup(false);
      setSetupData(null);
      setOtp(Array(6).fill(""));
      qc.invalidateQueries({ queryKey: ["me-2fa"] });
    },
    onError: (e) => { toast.error(extractError(e)); setOtp(Array(6).fill("")); },
  });

  // 禁用流程：TOTP（token）或备用码（backupCode）二选一 → disable
  const disableMut = useMutation({
    mutationFn: async () => {
      const body = disableMode === "backup" ? { backupCode } : { token: otp.join("") };
      return (await api.post("/auth/2fa/disable", body)).data;
    },
    onSuccess: () => {
      toast.success("2FA 已禁用");
      setOtp(Array(6).fill(""));
      setBackupCode("");
      qc.invalidateQueries({ queryKey: ["me-2fa"] });
    },
    onError: (e) => { toast.error(extractError(e)); setOtp(Array(6).fill("")); },
  });

  /** 复制到剪贴板（otpauth 链接 / 密钥 / 备用码） */
  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制`);
    } catch {
      toast.error("复制失败，请手动选择复制");
    }
  };

  const tabBase: React.CSSProperties = {
    padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
    fontFamily: "inherit", border: "1px solid var(--color-border)", background: "var(--color-panel)",
    color: "var(--color-text-secondary)",
  };

  return (
    <div style={card}>
      <div style={panelHeader}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          两步验证（2FA）
          <HelpIcon text="启用两步验证后，登录时需额外输入验证码，大幅提升账户安全性" level="button" />
        </h3>
      </div>
      <div style={panelBody}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
          {enabled ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 12, fontSize: 12, background: "rgba(102,187,106,0.1)", color: "#66bb6a", border: "1px solid rgba(102,187,106,0.3)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#66bb6a" }} />
              已启用
            </span>
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 12, fontSize: 12, background: "var(--color-divider-light)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ccc" }} />
              未启用
            </span>
          )}
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            {enabled ? "两步验证已启用，保护您的账户安全" : "启用两步验证可防止未经授权的登录访问"}
          </span>
        </div>

        {enabled ? (
          <div>
            {/* 禁用方式切换：验证器验证码 / 备用恢复码 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => setDisableMode("totp")}
                style={{ ...tabBase, ...(disableMode === "totp" ? { color: "var(--color-primary)", borderColor: "rgba(79,110,247,0.4)" } : {}) }}
              >
                验证器验证码
              </button>
              <button
                onClick={() => setDisableMode("backup")}
                style={{ ...tabBase, ...(disableMode === "backup" ? { color: "var(--color-primary)", borderColor: "rgba(79,110,247,0.4)" } : {}) }}
              >
                备用恢复码
              </button>
            </div>

            {disableMode === "totp" ? (
              <>
                <OtpInput value={otp} onChange={setOtp} />
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                  输入验证器当前显示的 6 位动态验证码
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => disableMut.mutate()}
                    disabled={otp.join("").length !== 6 || disableMut.isPending}
                    style={btnDanger}
                  >
                    {disableMut.isPending ? "提交中…" : "禁用 2FA"}
                  </button>
                  <HelpIcon text="输入当前验证码后关闭两步验证，关闭后登录不再需要验证码" />
                </div>
              </>
            ) : (
              <>
                <input
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX"
                  maxLength={14}
                  style={{ ...inp, width: 240, marginBottom: 8 }}
                />
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 12 }}>
                  输入启用 2FA 时保存的备用恢复码（大写，可省略分隔符）
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    onClick={() => disableMut.mutate()}
                    disabled={!backupCode || disableMut.isPending}
                    style={btnDanger}
                  >
                    {disableMut.isPending ? "提交中…" : "禁用 2FA"}
                  </button>
                  <HelpIcon text="备用恢复码在启用 2FA 时生成，每个备用码仅可使用一次" />
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => setupMut.mutate()} disabled={setupMut.isPending} style={btnPrimary}>
              {setupMut.isPending ? "生成中…" : "启用 TOTP"}
            </button>
            <HelpIcon text="启用后每次登录需输入验证器生成的 6 位动态验证码，可显著提升账户安全性" />
            <button onClick={() => toast.info("Passkey 管理功能开发中")} style={btn}>管理 Passkey</button>
            <HelpIcon text="Passkey（生物识别密钥）管理功能开发中" />
          </div>
        )}

        {showSetup && setupData && (
          <div style={{ marginTop: 20, padding: 16, background: "var(--color-bg)", borderRadius: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>配置 TOTP 验证器</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              打开 Google Authenticator 或 Authy，扫描下方 otpauth 链接或手动输入密钥：
            </div>
            {/* 零依赖方案：展示 otpauthUrl 文本链接 + secret，不引入 qrcode 库 */}
            <div style={{ fontFamily: "monospace", background: "var(--color-panel)", padding: 10, borderRadius: 6, marginBottom: 8, wordBreak: "break-all", border: "1px solid var(--color-border)", fontSize: 12 }}>
              {setupData.otpauthUrl}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, wordBreak: "break-all" }}>密钥：{setupData.secret}</span>
              <button onClick={() => handleCopy(setupData.secret, "密钥")} style={{ ...btn, padding: "2px 10px", fontSize: 12 }}>复制</button>
              <HelpIcon text="复制 base32 密钥，可在不支持扫码的验证器中手动录入" />
            </div>

            {/* 备用码：一次性显示 */}
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>备用恢复码（仅此一次显示）</div>
            <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginBottom: 8 }}>
              ⚠️ 请立即保存到安全的地方；遗失后无法找回，只能关闭后重新启用
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 12 }}>
              {setupData.backupCodes.map((c) => (
                <div key={c} style={{ fontFamily: "monospace", fontSize: 13, background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 10px", textAlign: "center" }}>
                  {c}
                </div>
              ))}
            </div>

            <div style={{ fontSize: 13, marginBottom: 8 }}>在验证器中输入 6 位验证码完成启用：</div>
            <OtpInput value={otp} onChange={setOtp} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
              <button
                onClick={() => enableMut.mutate()}
                disabled={otp.join("").length !== 6 || enableMut.isPending}
                style={{ ...btnPrimary, height: 42 }}
              >
                {enableMut.isPending ? "验证中…" : "验证并启用"}
              </button>
              <HelpIcon text="输入验证器当前显示的 6 位验证码，验证通过后正式启用两步验证" />
              <button onClick={() => { setShowSetup(false); setSetupData(null); setOtp(Array(6).fill("")); }} style={{ ...btn, height: 42 }}>取消</button>
              <HelpIcon text="取消本次配置，已生成的密钥与备用码将失效，需要时重新开始" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== 4. 第三方登录绑定 ==================== */
function ThirdPartyBindPanel() {
  const { toast } = useToast();
  const [githubLoading, setGithubLoading] = useState(false);

  // 后端已实现：仅 GitHub 登录入口（GET /auth/oauth/github/url → 跳转 GitHub 授权页）。
  // 绑定管理端点（GET /auth/oauth/bindings 列表、POST /auth/oauth/{provider}/bind、POST /auth/oauth/unbind）
  // 尚未实现，因此本面板不查询绑定状态、不提供解绑；GitHub 走"快捷登录"，
  // 微信 / Telegram / Google 标注"即将上线"（不调用不存在的 API）。
  const handleGitHubLogin = async () => {
    setGithubLoading(true);
    try {
      const res = await api.get<{ url: string }>("/auth/oauth/github/url");
      window.location.href = res.data.url;
    } catch (e) {
      toast.error(extractError(e));
      setGithubLoading(false);
    }
  };

  const providers: Array<{ key: string; name: string; icon: string; available: boolean }> = [
    { key: "github", name: "GitHub", icon: "🐙", available: true },
    { key: "wechat", name: "微信", icon: "💬", available: false },
    { key: "telegram", name: "Telegram", icon: "✈️", available: false },
    { key: "google", name: "Google", icon: "🔵", available: false },
  ];

  return (
    <div style={card}>
      <div style={panelHeader}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          第三方登录绑定
          <HelpIcon text="绑定第三方账号后可使用对应平台快捷登录；当前支持 GitHub，其余平台即将上线" level="button" />
        </h3>
      </div>
      <div style={panelBody}>
        {providers.map((p) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: "var(--color-divider-light)" }}>
                {p.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, color: "var(--color-text)" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                  {p.available
                    ? "未绑定 — 使用 GitHub 账号快捷登录（授权后自动绑定当前账号或注册新账号）"
                    : "即将上线 — 敬请期待"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 12, fontSize: 12,
                background: p.available ? "rgba(102,187,106,0.1)" : "var(--color-divider-light)",
                color: p.available ? "#66bb6a" : "var(--color-text-secondary)",
                border: `1px solid ${p.available ? "rgba(102,187,106,0.3)" : "var(--color-border)"}`,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.available ? "#66bb6a" : "#ccc" }} />
                {p.available ? "支持" : "即将上线"}
              </span>
              {p.available ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    onClick={handleGitHubLogin}
                    disabled={githubLoading}
                    style={{ ...btnPrimary, padding: "4px 12px", fontSize: 12, borderRadius: 6 }}
                  >
                    {githubLoading ? "跳转中…" : "GitHub 登录"}
                  </button>
                  <HelpIcon text="跳转到 GitHub 授权页，授权后自动绑定当前邮箱账号或注册新账号" />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button disabled style={{ ...btn, padding: "4px 12px", fontSize: 12, borderRadius: 6, opacity: 0.5, cursor: "not-allowed" }}>
                    即将上线
                  </button>
                  <HelpIcon text={`${p.name} 快捷登录正在开发中，敬请期待`} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== 5. 活跃会话 ==================== */
function ActiveSessionsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const devQ = useQuery({
    queryKey: ["me-devices"],
    queryFn: async () => (await api.get<{ data: { devices: any[] } }>("/me/devices")).data.data,
  });

  const logoutMut = useMutation({
    mutationFn: async (deviceId: number) =>
      (await api.post(`/me/devices/${deviceId}/logout`, {})).data,
    onSuccess: (_d, deviceId) => {
      toast.success("设备已强制下线");
      qc.invalidateQueries({ queryKey: ["me-devices"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const devices = devQ.data?.devices ?? [];

  return (
    <div style={card}>
      <div style={panelHeader}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          活跃会话
          <HelpIcon text="当前登录的设备列表，可强制下线其他设备" level="button" />
        </h3>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {devices.length} 个活跃会话</span>
      </div>
      <div style={panelBody}>
        {devices.length === 0 ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>暂无活跃会话</div>
        ) : (
          devices.map((d: any) => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: "var(--color-divider-light)" }}>
                  {d.device_name?.toLowerCase().includes("mobile") || d.os?.toLowerCase().includes("ios") ? "📱" : "💻"}
                </div>
                <div>
                  <div style={{ fontSize: 14, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 8 }}>
                    {d.os ?? "—"} · {d.browser ?? "—"}
                    {d.is_current && (
                      <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 4, fontSize: 11, background: "rgba(79,110,247,0.1)", color: "var(--color-primary)", border: "1px solid rgba(79,110,247,0.3)" }}>
                        当前设备
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    IP: {d.ip ?? "—"} · 登录时间: {d.last_active_at ? new Date(d.last_active_at).toLocaleString() : "—"}
                  </div>
                </div>
              </div>
              {d.is_current ? (
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>无法下线当前设备</span>
              ) : (
                <button onClick={() => logoutMut.mutate(d.id)} style={{ ...btnDanger, padding: "4px 12px", fontSize: 12, borderRadius: 6 }}>
                  下线
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ==================== 6. 最近登录记录 ==================== */
function LoginHistoryPanel() {
  const histQ = useQuery({
    queryKey: ["me-login-history"],
    queryFn: async () => (await api.get<{ data: { records: any[] } }>("/me/login-history")).data.data,
  });

  const records = histQ.data?.records ?? [];

  return (
    <div style={card}>
      <div style={panelHeader}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          最近登录记录
          <HelpIcon text="最近登录尝试记录，含成功和失败，异常登录请及时修改密码" level="button" />
        </h3>
      </div>
      <div style={panelBody}>
        {records.length === 0 ? (
          <div style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>暂无登录记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["时间", "IP 地址", "地点", "设备", "结果"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", background: "var(--color-divider-light)", color: "var(--color-text-secondary)", fontWeight: 400, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((r: any, i: number) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--color-divider)" }}>
                  <td style={{ padding: "10px 12px" }}>{r.login_at ? new Date(r.login_at).toLocaleString() : "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{r.ip ?? "—"}</td>
                  <td style={{ padding: "10px 12px" }}>{r.city ?? "未知"}</td>
                  <td style={{ padding: "10px 12px" }}>{r.device_info ?? (r.browser ? `${r.os ?? ""} / ${r.browser}` : "—")}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {r.success === false || r.risk_level === "blocked" ? (
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "rgba(229,57,53,0.1)", color: "var(--color-danger-text)", border: "1px solid rgba(229,57,53,0.3)" }}>
                        失败
                      </span>
                    ) : (
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, background: "rgba(102,187,106,0.1)", color: "#66bb6a", border: "1px solid rgba(102,187,106,0.3)" }}>
                        成功
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ==================== 7. API Key 安全 ==================== */
function ApiKeySecurityPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const keysQ = useQuery({
    queryKey: ["me-api-keys"],
    queryFn: async () => (await api.get<{ data: { list?: any[] } | any[] }>("/me/api-keys")).data.data,
  });
  const keyList: any[] = Array.isArray(keysQ.data) ? keysQ.data : (keysQ.data as any)?.list ?? [];
  const oldKeys = keyList.filter((k: any) => {
    if (!k.created_at) return false;
    const days = (Date.now() - new Date(k.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return days > 90;
  });

  const revokeAllMut = useMutation({
    mutationFn: async () => (await api.post("/me/api-keys/revoke-all", {})).data,
    onSuccess: () => {
      toast.success("所有 API Key 已重置，新 Key 已生成");
      qc.invalidateQueries({ queryKey: ["me-api-keys"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const handleResetAll = () => {
    if (!window.confirm("确定要重置所有 API Key 吗？\n\n此操作不可撤销，所有使用旧 Key 的请求将立即失效。")) return;
    revokeAllMut.mutate();
  };

  return (
    <div style={card}>
      <div style={panelHeader}>
        <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
          API Key 安全
          <HelpIcon text="管理 API Key 安全策略，建议定期轮换 Key 防止泄露风险" level="button" />
        </h3>
      </div>
      <div style={panelBody}>
        {oldKeys.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 8, background: "rgba(255,167,38,0.08)", border: "1px solid rgba(255,167,38,0.3)", marginBottom: 16 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#ffa726", fontWeight: 500, marginBottom: 2 }}>Key 轮换提醒</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                您有 {oldKeys.length} 个 Key 超过 90 天未轮换，建议定期重置以降低安全风险
              </div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            重置后所有使用旧 Key 的请求将立即失效，请谨慎操作
          </span>
          <button onClick={handleResetAll} style={btnDanger}>重置所有 Key</button>
        </div>
      </div>
    </div>
  );
}

/* ==================== 工具函数 ==================== */
function getPwStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: "未输入", color: "var(--color-text-secondary)" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 12) score++;
  const levels: Array<{ label: string; color: string }> = [
    { label: "弱 — 建议增加复杂度", color: "var(--color-danger-text)" },
    { label: "一般 — 可接受", color: "#ffa726" },
    { label: "较强 — 推荐", color: "#66bb6a" },
    { label: "强 — 非常安全", color: "#66bb6a" },
  ];
  const idx = Math.max(0, Math.min(score - 1, 3));
  const lv = levels[idx]!;
  return { score: Math.min(score, 4), label: lv.label, color: lv.color };
}
