"use client";

import React, { useState, useRef } from "react";
import { HelpIcon, StatusBadge, ConfirmPopover, useToast } from "@3cloud/shared-ui";

type Tab = "password" | "sessions" | "login" | "keys" | "2fa";
const TABS: { k: Tab; l: string }[] = [
  { k: "password", l: "修改密码" },{ k: "sessions", l: "会话管理" },{ k: "login", l: "登录记录" },{ k: "keys", l: "Key 安全" },{ k: "2fa", l: "2FA 绑定" },
];

const INIT_SESSIONS = [
  { id: "1", device: "Windows · Chrome 128", icon: "💻", ip: "192.168.1.100", time: "2026-08-05 15:30", current: true },
  { id: "2", device: "iOS · Safari Mobile", icon: "📱", ip: "117.78.2.66", time: "2026-08-04 09:12", current: false },
];

const LOGINS = [
  { time: "2026-08-05 15:30", ip: "192.168.1.100", loc: "上海", dev: "Windows / Chrome 128", ok: true },
  { time: "2026-08-04 09:12", ip: "117.78.2.66", loc: "上海", dev: "iOS / Safari Mobile", ok: true },
  { time: "2026-08-03 22:45", ip: "45.77.23.10", loc: "未知", dev: "Linux / Firefox 129", ok: false },
  { time: "2026-08-03 10:08", ip: "192.168.1.100", loc: "上海", dev: "Windows / Chrome 128", ok: true },
  { time: "2026-08-02 14:20", ip: "103.45.6.88", loc: "深圳", dev: "Android / Chrome 127", ok: true },
];

const INIT_BINDS = [
  { k: "github", n: "GitHub", icon: "🐙", bound: false, desc: "未绑定 — 使用 GitHub 账号快捷登录" },
  { k: "wechat", n: "微信", icon: "💬", bound: true, desc: "已绑定 — 微信用户 wx_zh_8866" },
  { k: "telegram", n: "Telegram", icon: "✈️", bound: false, desc: "未绑定 — 使用 Telegram 账号快捷登录" },
  { k: "google", n: "Google", icon: "🔵", bound: false, desc: "未绑定 — 使用 Google 账号快捷登录" },
];

const panel = { background: "var(--color-panel)", borderRadius: 12, marginBottom: 20, boxShadow: "var(--shadow-panel)" };

export default function SecurityPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("password");
  const [sessions, setSessions] = useState(INIT_SESSIONS);
  const [binds, setBinds] = useState(INIT_BINDS);
  const [tfa, setTfa] = useState(false);
  const [rotated, setRotated] = useState(false);

  const [curPw, setCurPw] = useState(""); const [newPw, setNewPw] = useState(""); const [confPw, setConfPw] = useState("");
  const [pwScore, setPwScore] = useState(0); const [pwLabel, setPwLabel] = useState("未输入");
  const otpRefs = useRef<(HTMLInputElement | null)[]>(Array(6).fill(null));
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [newEmail, setNewEmail] = useState(""); const [emailPw, setEmailPw] = useState(""); const [codeHint, setCodeHint] = useState(false); const [cd, setCd] = useState(0);

  const inp = (v: string, set: (s: string) => void, ph: string, type = "text", ro = false) => (
    <input type={type} value={v} onChange={e => set(e.target.value)} placeholder={ph} readOnly={ro}
      style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: ro ? "var(--color-panel)" : "var(--color-panel)", color: ro ? "var(--color-text-secondary)" : "var(--color-text)", fontSize: 14, outline: "none" }} />
  );

  const checkPw = (pw: string) => {
    if (!pw) { setPwScore(0); setPwLabel("未输入"); return; }
    let s = 0;
    if (pw.length >= 8) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^a-zA-Z0-9]/.test(pw) || pw.length >= 12) s++;
    const lvls = [{ l: "弱 — 建议增加复杂度", c: "weak" },{ l: "一般 — 可接受", c: "medium" },{ l: "较强 — 推荐", c: "medium" },{ l: "强 — 非常安全", c: "strong" }];
    const lvl = lvls[Math.min(s, 3) - 1] || lvls[0];
    setPwScore(s); setPwLabel(lvl.l);
  };

  const savePw = () => {
    if (!curPw) { toast.error("请输入当前密码"); return; }
    if (!newPw || newPw.length < 8) { toast.error("新密码至少8位"); return; }
    if (newPw !== confPw) { toast.error("两次密码不一致"); return; }
    if (newPw === curPw) { toast.error("新密码不能与当前密码相同"); return; }
    toast.success("密码修改成功！请重新登录"); setCurPw(""); setNewPw(""); setConfPw(""); setPwScore(0); setPwLabel("未输入");
  };

  const saveEmail = () => {
    if (!newEmail) { toast.error("请输入新邮箱"); return; }
    if (otp.join("").length !== 6) { toast.error("请输入6位验证码"); return; }
    if (!emailPw) { toast.error("请输入当前密码"); return; }
    toast.success("邮箱修改成功！"); setNewEmail(""); setEmailPw(""); setOtp(Array(6).fill("")); setCodeHint(false);
  };

  const sendCode = () => {
    if (!newEmail) { toast.error("请先输入新邮箱"); return; }
    setCd(60); setCodeHint(true); toast.success("验证码已发送至 " + newEmail);
    const t = setInterval(() => setCd(prev => { if (prev <= 1) { clearInterval(t); return 0; } return prev - 1; }), 1000);
  };

  const kickSession = (id: string) => { setSessions(prev => prev.filter(s => s.id !== id)); toast.success("设备已强制下线"); };

  const toggleBind = (key: string) => {
    setBinds(prev => prev.map(b => b.k !== key ? b : { ...b, bound: !b.bound, desc: !b.bound ? `已绑定 — ${b.n} 用户 ${key}_user_${Math.floor(Math.random() * 9000 + 1000)}` : `未绑定 — 使用 ${b.n} 账号快捷登录` }));
    toast.success(`${binds.find(x => x.k === key)!.n} ${binds.find(x => x.k === key)!.bound ? "已解绑" : "绑定成功"}`);
  };

  const th: React.CSSProperties = { textAlign: "left", padding: "10px 12px", background: "var(--color-table-header-bg)", fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--color-divider)" };
  const td: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--color-divider-light)", fontSize: 13, color: "var(--color-text)" };
  const tagStyle = (enabled: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 12, fontSize: 12, background: enabled ? "rgba(102,187,106,0.1)" : "var(--color-disabled-bg)", color: enabled ? "#66bb6a" : "var(--color-text-secondary)", border: `1px solid ${enabled ? "rgba(102,187,106,0.3)" : "var(--color-border)"}` });

  return (
    <div style={{ padding: "var(--main-padding)" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--color-divider)", paddingBottom: 12 }}>
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            style={{ padding: "8px 16px", border: "none", background: "none", fontSize: 13, color: tab === t.k ? "var(--color-primary)" : "var(--color-text-secondary)", cursor: "pointer", borderBottom: tab === t.k ? "2px solid var(--color-primary)" : "2px solid transparent" }}>{t.l}</button>
        ))}
      </div>

      {/* Password Tab */}
      {tab === "password" && (<>
        <div style={panel}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>修改邮箱 <HelpIcon text="修改账户绑定邮箱" /></h3></div>
          <div style={{ padding: 20 }}>
            <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>当前邮箱</label>{inp("admin@example.com", () => {}, "", "text", true)}</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1, marginBottom: 16 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>新邮箱</label>{inp(newEmail, setNewEmail, "请输入新邮箱地址")}</div>
              <button onClick={sendCode} disabled={cd > 0} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 14, cursor: cd > 0 ? "not-allowed" : "pointer", opacity: cd > 0 ? 0.6 : 1, whiteSpace: "nowrap", alignSelf: "flex-end" }}>{cd > 0 ? `${cd}s 后重发` : "发送验证码"}</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>邮箱验证码</label>
              <div style={{ display: "flex", gap: 8 }}>
                {otp.map((v, i) => (
                  <input key={i} ref={el => { otpRefs.current[i] = el; }} maxLength={1} value={v}
                    onChange={e => { const d = e.target.value.replace(/\D/g, ""); const next = [...otp]; next[i] = d; setOtp(next); if (d && i < 5) otpRefs.current[i + 1]?.focus(); }}
                    onKeyDown={e => { if (e.key === "Backspace" && !otp[i] && i > 0) { otpRefs.current[i - 1]?.focus(); const next = [...otp]; next[i - 1] = ""; setOtp(next); }}}
                    style={{ width: 48, height: 56, textAlign: "center", fontSize: 22, borderRadius: 6, border: `1px solid ${v ? "rgba(79,110,247,0.4)" : "var(--color-border)"}`, background: "var(--color-panel)", color: "var(--color-text)", fontWeight: 600, outline: "none" }} />
                ))}
              </div>
              {codeHint && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>验证码已发送，请查收邮箱</div>}
            </div>
            <div style={{ marginBottom: 16 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>当前密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></label>{inp(emailPw, setEmailPw, "输入当前密码以确认操作", "password")}</div>
            <button onClick={saveEmail} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 14, cursor: "pointer" }}>保存修改</button>
          </div>
        </div>

        <div style={panel}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>修改密码 <HelpIcon text="建议定期更换密码" /></h3></div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, marginBottom: 16 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>当前密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></label>{inp(curPw, setCurPw, "输入当前密码", "password")}</div>
              <div style={{ flex: 1, marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></label>
                {inp(newPw, v => { setNewPw(v); checkPw(v); }, "至少8位，含字母和数字", "password")}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>{[1,2,3,4].map(i => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= pwScore ? (i <= 2 ? "var(--color-danger-text)" : i === 3 ? "#ffa726" : "#66bb6a") : "#eee" }} />)}</div>
                  <div style={{ fontSize: 12, color: pwScore <= 1 ? "var(--color-danger-text)" : pwScore <= 2 ? "#ffa726" : "#66bb6a" }}>{pwLabel}</div>
                </div>
              </div>
              <div style={{ flex: 1, marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>确认新密码 <span style={{ color: "var(--color-danger-text)" }}>*</span></label>
                {inp(confPw, setConfPw, "再次输入新密码", "password")}
                {confPw && newPw !== confPw && <div style={{ fontSize: 12, color: "var(--color-danger-text)", marginTop: 4 }}>两次密码不一致</div>}
              </div>
            </div>
            <button onClick={savePw} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 14, cursor: "pointer" }}>保存密码</button>
          </div>
        </div>
      </>)}

      {/* Sessions Tab */}
      {tab === "sessions" && (
        <div style={panel}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>活跃会话</h3><span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {sessions.length} 个活跃会话</span></div>
          <div style={{ padding: 20 }}>
            {sessions.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--color-disabled-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{s.icon}</div>
                  <div><div style={{ fontSize: 14, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 8 }}>{s.device}{s.current && <span style={{ padding: "1px 8px", borderRadius: 4, fontSize: 11, background: "rgba(79,110,247,0.1)", color: "var(--color-primary)", border: "1px solid rgba(79,110,247,0.3)", marginLeft: 6 }}>当前设备</span>}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>IP: {s.ip} · 登录时间: {s.time}</div></div>
                </div>
                {s.current ? <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>无法下线当前设备</span> :
                  <ConfirmPopover title="确认下线" description="确定要强制下线该设备吗？" onConfirm={() => kickSession(s.id)}>
                    <button style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-danger-text)", background: "var(--color-panel)", color: "var(--color-danger-text)", fontSize: 12, cursor: "pointer" }}>下线</button>
                  </ConfirmPopover>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Login Records Tab */}
      {tab === "login" && (
        <div style={panel}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>最近登录记录 <HelpIcon text="最近登录尝试记录" /></h3></div>
          <div style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["时间","IP 地址","地点","设备","结果"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{LOGINS.map((r, i) => <tr key={i}><td style={td}>{r.time}</td><td style={td}>{r.ip}</td><td style={td}>{r.loc}</td><td style={td}>{r.dev}</td><td style={td}><StatusBadge status={r.ok ? "success" : "danger"}>{r.ok ? "成功" : "密码错误"}</StatusBadge></td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Key Safety Tab */}
      {tab === "keys" && (
        <div style={panel}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>API Key 安全</h3></div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 8, background: rotated ? "rgba(102,187,106,0.08)" : "rgba(255,167,38,0.08)", border: `1px solid ${rotated ? "rgba(102,187,106,0.3)" : "rgba(255,167,38,0.3)"}`, marginBottom: 16 }}>
              <span style={{ fontSize: 20 }}>{rotated ? "✅" : "⚠️"}</span>
              <div><div style={{ fontSize: 13, color: rotated ? "#66bb6a" : "#ffa726", fontWeight: 500, marginBottom: 2 }}>{rotated ? "Key 已重置" : "Key 轮换提醒"}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{rotated ? "所有 Key 已于 2026-08-05 完成轮换" : "您有 2 个 Key 超过 90 天未轮换"}</div></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>重置后所有使用旧 Key 的请求将立即失效</span>
              <button onClick={() => { if (confirm("确定要重置所有 API Key 吗？")) { setRotated(true); toast.success("所有 Key 已重置"); } }}
                style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--color-danger-text)", background: "var(--color-panel)", color: "var(--color-danger-text)", fontSize: 14, cursor: "pointer" }}>重置所有 Key</button>
            </div>
          </div>
        </div>
      )}

      {/* 2FA Tab */}
      {tab === "2fa" && (<>
        <div style={panel}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>两步验证（2FA）</h3></div>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
              <span style={tagStyle(tfa)}><span style={{ width: 8, height: 8, borderRadius: "50%", background: tfa ? "#66bb6a" : "#ccc" }} />{tfa ? "已启用" : "未启用"}</span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>启用两步验证可防止未经授权的登录访问</span>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setTfa(true); toast.success("TOTP 已启用！"); }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 14, cursor: "pointer" }}>启用 TOTP</button>
              <button onClick={() => toast.info("Passkey 功能开发中")} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", fontSize: 14, cursor: "pointer" }}>管理 Passkey</button>
            </div>
          </div>
        </div>

        <div style={panel}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-divider)" }}><h3 style={{ fontSize: 14, fontWeight: 600 }}>第三方登录绑定</h3></div>
          <div style={{ padding: 20 }}>
            {binds.map(b => (
              <div key={b.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--color-divider)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--color-disabled-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{b.icon}</div>
                  <div><div style={{ fontSize: 14, color: "var(--color-text)" }}>{b.n}</div><div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{b.desc}</div></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={tagStyle(b.bound)}><span style={{ width: 8, height: 8, borderRadius: "50%", background: b.bound ? "#66bb6a" : "#ccc" }} />{b.bound ? "已绑定" : "未绑定"}</span>
                  <button onClick={() => toggleBind(b.k)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${b.bound ? "var(--color-danger-text)" : "var(--color-primary)"}`, background: b.bound ? "var(--color-panel)" : "var(--color-primary)", color: b.bound ? "var(--color-danger-text)" : "#fff", fontSize: 12, cursor: "pointer" }}>{b.bound ? "解绑" : "绑定"}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>)}
    </div>
  );
}
