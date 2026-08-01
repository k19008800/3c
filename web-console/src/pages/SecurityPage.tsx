import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 安全中心 对齐 SPEC-§20
 * Tab1 消费预算 / Tab2 双因素认证 / Tab3 设备管理 / Tab4 Key权限 / Tab5 登录安全
 */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;

const BUDGET_HELP = "设置月度/日度消费预算，防止超支。hard=超限熔断；soft=仅预警。可设置预警阈值与豁免Key。";
const TWOFA_HELP = "双因素认证：使用 Authenticator 应用扫描二维码，每次登录需输入 6 位动态码，提升账户安全。";
const DEVICE_HELP = "查看所有已登录设备，可远程登出可疑设备。可疑设备带风险标记。";
const KEY_HELP = "对单个 API Key 设置模型范围、IP白名单、域名限制、每日额度等访问控制。";
const LOGIN_HELP = "查看登录记录与安全异常汇总，可确认本人登录或报告异常（触发保护措施）。";

export default function SecurityPage() {
  const [tab, setTab] = useState<"budget" | "2fa" | "devices" | "key" | "login">("budget");
  const [help, setHelp] = useState("");

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>安全中心 <span onClick={() => setHelp(({ budget: BUDGET_HELP, "2fa": TWOFA_HELP, devices: DEVICE_HELP, key: KEY_HELP, login: LOGIN_HELP } as any)[tab])} style={icon} title="帮助">[?]</span></h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>账户安全与消费控制 · SPEC-§20</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {([["budget", "消费预算"], ["2fa", "双因素认证"], ["devices", "设备管理"], ["key", "Key权限"], ["login", "登录安全"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...btnBase, background: tab === k ? "#2563eb" : "#fff", color: tab === k ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>{label}</button>
        ))}
      </div>

      {tab === "budget" && <BudgetTab />}
      {tab === "2fa" && <TwoFaTab />}
      {tab === "devices" && <DevicesTab />}
      {tab === "key" && <KeyPermTab />}
      {tab === "login" && <LoginTab />}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp("")}>
          <div style={{ ...card, width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>帮助</h3>
            <p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{help}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setHelp("")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== Tab1 消费预算 ==================== */
function BudgetTab() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [form, setForm] = useState<any>(null);
  const [confirmFn, setConfirmFn] = useState<(() => void) | null>(null);
  const [confirmMsg, setConfirmMsg] = useState("");

  const settingsQ = useQuery({
    queryKey: ["me-budget"],
    queryFn: async () => (await api.get<{ data: any }>("/me/budget/settings")).data.data,
  });
  const statusQ = useQuery({
    queryKey: ["me-budget-status"],
    queryFn: async () => (await api.get<{ data: any }>("/me/budget/status")).data.data,
  });
  const keysQ = useQuery({
    queryKey: ["me-api-keys"],
    queryFn: async () => (await api.get<{ data: { list?: any[] } | any[] }>("/me/api-keys")).data.data,
  });
  const keyList = Array.isArray(keysQ.data) ? keysQ.data : (keysQ.data?.list ?? []);

  const saveMut = useMutation({
    mutationFn: async () => (await api.put("/me/budget/settings", {
      monthlyBudget: Number(form.monthly_budget), dailyBudget: Number(form.daily_budget),
      budgetType: form.budget_type, autoBlock: form.auto_block, alertThresholds: form.alert_thresholds,
      exemptKeys: form.exempt_keys,
    })).data,
    onSuccess: (d: any) => {
      setNotice({ type: "success", msg: d?.data?.message ?? "已保存" });
      // 若熔断了需提示
      qc.invalidateQueries({ queryKey: ["me-budget"] });
      qc.invalidateQueries({ queryKey: ["me-budget-status"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const unblockMut = useMutation({
    mutationFn: async (action: string) => (await api.post("/me/budget/unblock", { action, reason: "用户操作" })).data,
    onSuccess: () => { setNotice({ type: "success", msg: "已解除熔断" }); qc.invalidateQueries({ queryKey: ["me-budget-status"] }); qc.invalidateQueries({ queryKey: ["me-budget"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  if (!form && settingsQ.data) {
    try {
      setForm({
        monthly_budget: Number(settingsQ.data.monthly_budget ?? 0),
        daily_budget: Number(settingsQ.data.daily_budget ?? 0),
        budget_type: settingsQ.data.budget_type ?? "hard",
        auto_block: !!settingsQ.data.auto_block,
        alert_thresholds: (settingsQ.data.alert_thresholds ?? "80").split(",").map(Number),
        exempt_keys: (() => { try { return JSON.parse(settingsQ.data.exempt_keys || "[]"); } catch { return []; } })(),
      });
    } catch { /* noop */ }
  }

  const st = statusQ.data;
  const spentPercent = st?.spent_percent ?? 0;
  const barColor = spentPercent > 80 ? "#dc2626" : spentPercent > 50 ? "#d97706" : "#16a34a";

  return (
    <div>
      {/* 状态卡 */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong>本月消费 / 预算</strong>
          <span style={{ fontSize: 13, color: "#64748b" }}>日预算: ¥{st?.daily_budget ?? 0} · 剩余 {st?.remaining_days ?? 0} 天</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
          <span style={{ color: barColor }}>¥{st?.current_month_spent ?? 0}</span>
          <span>/ ¥{st?.monthly_budget ?? 0} ({spentPercent}%)</span>
        </div>
        <div style={{ height: 10, background: "#e2e8f0", borderRadius: 6, marginTop: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(spentPercent, 100)}%`, background: barColor, borderRadius: 6 }} />
        </div>
        {st?.blocked ? (
          <div style={{ marginTop: 12, padding: 10, background: "#fee2e2", borderRadius: 8, color: "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>● 已熔断（预算已用尽）</strong>
            <button onClick={() => { setConfirmMsg("解除熔断后您的 API Key 将恢复调用。确认解除？"); setConfirmFn(() => () => unblockMut.mutate("disable_block")); }} style={{ ...btnBase, background: "#dc2626", color: "#fff", padding: "6px 12px" }}>解除熔断</button>
          </div>
        ) : spentPercent >= 100 ? (
          <div style={{ marginTop: 12, padding: 10, background: "#fef3c7", borderRadius: 8, color: "#92400e" }}>⚠ 软上限超限</div>
        ) : (
          <div style={{ marginTop: 12, color: "#16a34a", fontSize: 13 }}>● 运行中{spentPercent >= 50 ? " · 已使用 " + spentPercent + "%" : ""}</div>
        )}
        {!st?.blocked && st?.estimated_month_spent ? (
          <div style={{ marginTop: 8, color: "#94a3b8", fontSize: 13 }}>预估本月消费 ¥{st.estimated_month_spent}</div>
        ) : null}
        {st?.blocked && (
          <div style={{ marginTop: 8, color: "#991b1b", fontSize: 12 }}>熔断时间: {st.blocked_at ? new Date(st.blocked_at).toLocaleString() : "—"}</div>
        )}
      </div>

      <div style={card}>
        <h4 style={{ margin: 0, marginBottom: 16 }}>预算设置</h4>
        {!form ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (
          <>
            <label style={{ fontSize: 13, color: "#64748b" }}>月预算（元，0=不限制）</label>
            <input type="number" min={0} value={form.monthly_budget} onChange={(e) => setForm({ ...form, monthly_budget: Number(e.target.value) })} style={inp} />
            <label style={{ fontSize: 13, color: "#64748b" }}>日预算（元，0=关闭）</label>
            <input type="number" min={0} value={form.daily_budget} onChange={(e) => setForm({ ...form, daily_budget: Number(e.target.value) })} style={inp} />
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13, color: "#64748b", marginRight: 16 }}>
                <input type="radio" checked={form.budget_type === "hard"} onChange={() => setForm({ ...form, budget_type: "hard" })} /> 硬上限（熔断）
              </label>
              <label style={{ fontSize: 13, color: "#64748b" }}>
                <input type="radio" checked={form.budget_type === "soft"} onChange={() => setForm({ ...form, budget_type: "soft" })} /> 软上限（仅预警）
              </label>
            </div>
            <label style={{ fontSize: 13, color: "#64748b" }}>预警阈值（%）</label>
            <input value={form.alert_thresholds.join(",")} onChange={(e) => setForm({ ...form, alert_thresholds: e.target.value.split(",").map(Number).filter(Boolean) })} placeholder="50,80,90" style={inp} />
            <label style={{ fontSize: 13, color: "#64748b", display: "block", marginBottom: 10 }}>
              <input type="checkbox" checked={form.auto_block} onChange={(e) => setForm({ ...form, auto_block: e.target.checked })} /> 超限自动熔断
            </label>
            <label style={{ fontSize: 13, color: "#64748b" }}>熔断豁免 Key（不受熔断限制）</label>
            <select multiple value={form.exempt_keys.map(String)} onChange={(e) => setForm({ ...form, exempt_keys: Array.from(e.target.selectedOptions).map(o => Number(o.value)) })} style={{ ...inp, height: 80 }}>
              {keyList.map((k: any) => <option key={k.id} value={k.id}>{k.name} ({k.key_prefix ?? "sk-"}...)</option>)}
            </select>
            <button onClick={() => {
              const msg = `确认保存预算？月预算 ¥${form.monthly_budget}，当前已消费 ¥${st?.current_month_spent ?? 0}。`;
              setConfirmMsg(msg);
              setConfirmFn(() => () => saveMut.mutate());
            }} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{saveMut.isPending ? "保存中..." : "保存预算"}</button>
          </>
        )}
      </div>

      {/* 确认弹窗 */}
      {confirmFn && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setConfirmFn(null)}>
          <div style={{ ...card, width: 440 }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ margin: 0, marginBottom: 12 }}>确认操作</h4>
            <p style={{ color: "#475569" }}>{confirmMsg}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmFn(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
              <button onClick={() => { confirmFn(); setConfirmFn(null); }} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>确认</button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ==================== Tab2 2FA ==================== */
function TwoFaTab() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [step, setStep] = useState<"idle" | "setup" | "verify">("idle");
  const [setupData, setSetupData] = useState<any>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showCodes, setShowCodes] = useState(false);
  const [confirmedSave, setConfirmedSave] = useState(false);

  const statusQ = useQuery({
    queryKey: ["me-2fa"],
    queryFn: async () => (await api.get<{ data: any }>("/auth/2fa/status")).data.data,
  });

  const setupMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/setup", {})).data,
    onSuccess: (d: any) => { setSetupData(d.data); setStep("setup"); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });
  const verifyMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/verify", { code })).data,
    onSuccess: (d: any) => { setRecoveryCodes(d?.data?.recovery_codes ?? []); setShowCodes(true); setStep("idle"); qc.invalidateQueries({ queryKey: ["me-2fa"] }); },
    onError: (e) => { setNotice({ type: "error", msg: extractError(e) }); setCode(""); },
  });
  const disableMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/disable", { code })).data,
    onSuccess: () => { setCode(""); setNotice({ type: "success", msg: "2FA 已禁用" }); qc.invalidateQueries({ queryKey: ["me-2fa"] }); },
    onError: (e) => { setNotice({ type: "error", msg: extractError(e) }); setCode(""); },
  });
  const regenMut = useMutation({
    mutationFn: async () => (await api.post("/auth/2fa/recovery-codes", { code })).data,
    onSuccess: (d: any) => { setRecoveryCodes(d?.data?.recovery_codes ?? []); setShowCodes(true); setCode(""); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const st = statusQ.data;

  return (
    <div style={card}>
      {showCodes && (
        <div style={{ marginBottom: 16 }}>
          <h4>请立即保存恢复码！</h4>
          <p style={{ color: "#991b1b", fontSize: 13 }}>此页面关闭后无法再次查看。恢复码用于丢失手机时登录。</p>
          <div style={{ background: "#1e293b", color: "#e2e8f0", padding: 16, borderRadius: 8, fontFamily: "monospace", marginBottom: 12 }}>
            {recoveryCodes.map((c) => <div key={c} style={{ padding: "4px 0" }}>{c}</div>)}
          </div>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={confirmedSave} onChange={(e) => setConfirmedSave(e.target.checked)} /> 我已安全保存恢复码
          </label>
          <div style={{ marginTop: 12 }}>
            <button disabled={!confirmedSave} onClick={() => setShowCodes(false)} style={{ ...btnBase, background: confirmedSave ? "#2563eb" : "#cbd5e1", color: "#fff" }}>完成</button>
          </div>
        </div>
      )}

      {showCodes ? null : st?.enabled ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>🛡️</span>
            <div><strong style={{ color: "#166534" }}>双因素认证已启用</strong>{st?.enabled_at ? <div style={{ fontSize: 13, color: "#64748b" }}>启用时间: {new Date(st.enabled_at).toLocaleString()}</div> : null}</div>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>剩余恢复码: <strong>{st?.remaining_recovery_codes ?? 0}</strong> 个</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="输入当前 6 位验证码" maxLength={6} style={{ ...inp, width: 200, marginBottom: 0 }} />
            <button onClick={() => regenMut.mutate()} style={{ ...btnBase, background: "#f59e0b", color: "#fff" }}>重新生成恢复码</button>
          </div>
          <button onClick={() => { setConfirmDelete(code); }} style={{ ...btnBase, background: "#e2e8f0", color: "#dc2626" }}>禁用 2FA</button>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 32 }}>🛡️</span>
            <div><strong>双因素认证未启用</strong><div style={{ fontSize: 13, color: "#64748b" }}>使用 Authenticator 应用提升账户安全</div></div>
          </div>
          <button onClick={() => setupMut.mutate()} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>启用 2FA</button>
        </>
      )}

      {step === "setup" && setupData && (
        <div style={{ marginTop: 20, padding: 16, background: "#f8fafc", borderRadius: 8 }}>
          <h4>步骤 1: 扫码或输入密钥</h4>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>打开 Authenticator 应用，扫描二维码或手动输入密钥：</div>
          <div style={{ fontFamily: "monospace", background: "#fff", border: "1px solid #e2e8f0", padding: 10, borderRadius: 6, marginBottom: 12, wordBreak: "break-all" }}>{setupData.manual_key}</div>
          <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 12, wordBreak: "break-all" }}>otpauth: {setupData.otpauth}</div>
          <h4>步骤 2: 输入验证码验证</h4>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位验证码" maxLength={6} style={{ ...inp, width: 200 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => verifyMut.mutate()} disabled={code.length !== 6} style={{ ...btnBase, background: code.length === 6 ? "#2563eb" : "#cbd5e1", color: "#fff" }}>{verifyMut.isPending ? "验证中..." : "验证并启用"}</button>
            <button onClick={() => setStep("idle")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>取消</button>
          </div>
        </div>
      )}

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );

  function setConfirmDelete(_code: string) {
    if (window.confirm("禁用后账户安全性降低，确认禁用？")) disableMut.mutate();
  }
}

/* ==================== Tab3 设备管理 ==================== */
function DevicesTab() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const devQ = useQuery({
    queryKey: ["me-devices"],
    queryFn: async () => (await api.get<{ data: { devices: any[] } }>("/me/devices")).data.data,
  });
  const opt = useMutation({
    mutationFn: async ({ url }: { url: string }) => (await api.post(url, {})).data,
    onSuccess: (d: any) => { setNotice({ type: "success", msg: d?.data?.message ?? "操作成功" }); qc.invalidateQueries({ queryKey: ["me-devices"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const devices = devQ.data?.devices ?? [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={() => opt.mutate({ url: "/me/devices/logout-all" })} style={{ ...btnBase, background: "#dc2626", color: "#fff" }}>登出所有其他设备</button>
      </div>
      <div style={card}>
        <h4 style={{ margin: 0, marginBottom: 12 }}>我的设备 ({devices.length})</h4>
        {devices.length === 0 ? <div style={{ color: "#94a3b8" }}>暂无设备记录</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>设备</th><th style={{ padding: "8px" }}>IP/位置</th><th style={{ padding: "8px" }}>风险</th><th style={{ padding: "8px" }}>最近活跃</th><th style={{ padding: "8px" }}>操作</th>
            </tr></thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px" }}>
                    <strong>{d.device_name ?? "未知设备"}</strong>{d.is_current ? <span style={{ color: "#2563eb", fontSize: 12 }}> 🏷当前</span> : null}
                    <div style={{ color: "#94a3b8", fontSize: 12 }}>{d.browser ?? "—"} {d.os ?? ""}</div>
                  </td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{d.ip ?? "—"}<div style={{ color: "#94a3b8", fontSize: 12 }}>{d.city ?? "未知"} {d.country ?? ""}</div></td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ color: d.risk_level === "suspicious" ? "#d97706" : d.risk_level === "unknown" ? "#dc2626" : "#16a34a", padding: "2px 8px", background: d.risk_level === "suspicious" ? "#fef3c7" : d.risk_level === "unknown" ? "#fee2e2" : "#dcfce7", borderRadius: 6, fontSize: 11 }}>
                      {d.risk_level === "suspicious" ? "可疑" : d.risk_level === "unknown" ? "未知" : "正常"}
                    </span>
                  </td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{d.last_active_at ? new Date(d.last_active_at).toLocaleString() : "—"}</td>
                  <td style={{ padding: "8px" }}>
                    {!d.is_current && <button onClick={() => opt.mutate({ url: `/me/devices/${d.id}/logout` })} style={{ ...btnBase, background: "#fee2e2", color: "#dc2626", padding: "4px 10px" }}>登出</button>}
                    {d.risk_level !== "normal" && !d.is_current && <button onClick={() => opt.mutate({ url: `/me/devices/${d.id}/trust` })} style={{ ...btnBase, background: "#dcfce7", color: "#166534", padding: "4px 10px", marginLeft: 6 }}>标记可信</button>}
                    {d.is_current && <span style={{ color: "#94a3b8", fontSize: 12 }}>当前设备</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ==================== Tab4 Key 权限 ==================== */
function KeyPermTab() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [selKey, setSelKey] = useState<number | null>(null);
  const [form, setForm] = useState<any>(null);

  const keysQ = useQuery({
    queryKey: ["me-api-keys"],
    queryFn: async () => (await api.get<{ data: { list?: any[] } | any[] }>("/me/api-keys")).data.data,
  });
  const keyList = Array.isArray(keysQ.data) ? keysQ.data : (keysQ.data?.list ?? []);

  const permQ = useQuery({
    queryKey: ["me-key-perm", selKey],
    queryFn: async () => (await api.get<{ data: any }>(`/me/api-keys/${selKey}/permissions`)).data.data,
    enabled: !!selKey,
  });
  const saveMut = useMutation({
    mutationFn: async () => (await api.put(`/me/api-keys/${selKey}/permissions`, {
      modelPermissions: form.model_permissions, ipWhitelist: form.ip_whitelist,
      domainWhitelist: form.domain_whitelist, dailyTokenLimit: Number(form.daily_token_limit),
      dailyCallLimit: Number(form.daily_call_limit),
    })).data,
    onSuccess: () => { setNotice({ type: "success", msg: "权限已更新" }); qc.invalidateQueries({ queryKey: ["me-key-perm"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  useEffect(() => {
    if (permQ.data && !form) {
      setForm({
        model_permissions: permQ.data.model_permissions ?? [],
        ip_whitelist: permQ.data.ip_whitelist ?? [],
        domain_whitelist: permQ.data.domain_whitelist ?? [],
        daily_token_limit: permQ.data.daily_token_limit ?? 0,
        daily_call_limit: permQ.data.daily_call_limit ?? 0,
      });
    }
  }, [permQ.data]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {keyList.map((k: any) => (
          <button key={k.id} onClick={() => { setSelKey(k.id); setForm(null); }} style={{ ...btnBase, background: selKey === k.id ? "#2563eb" : "#fff", color: selKey === k.id ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}>
            {k.name}
          </button>
        ))}
      </div>
      {!selKey && <div style={{ ...card, color: "#94a3b8" }}>请选择左侧 API Key 查看/编辑权限</div>}
      {selKey && (
        <div style={card}>
          <h4 style={{ margin: 0, marginBottom: 12 }}>Key 权限配置 #{selKey}</h4>
          {!form ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (
            <>
              <label style={{ fontSize: 13, color: "#64748b" }}>可访问模型（逗号分隔，空=全部）</label>
              <input value={form.model_permissions.join(",")} onChange={(e) => setForm({ ...form, model_permissions: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="deepseek-chat,gpt-4o" style={inp} />
              <label style={{ fontSize: 13, color: "#64748b" }}>IP 白名单（逗号分隔，空=不限制）</label>
              <input value={form.ip_whitelist.join(",")} onChange={(e) => setForm({ ...form, ip_whitelist: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="192.168.1.0/24" style={inp} />
              <label style={{ fontSize: 13, color: "#64748b" }}>域名白名单（逗号分隔，空=不限制）</label>
              <input value={form.domain_whitelist.join(",")} onChange={(e) => setForm({ ...form, domain_whitelist: e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean) })} placeholder="example.com" style={inp} />
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, color: "#64748b" }}>每日 Token 额度（0=不限）</label>
                  <input type="number" min={0} value={form.daily_token_limit} onChange={(e) => setForm({ ...form, daily_token_limit: Number(e.target.value) })} style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 13, color: "#64748b" }}>每日调用次数（0=不限）</label>
                  <input type="number" min={0} value={form.daily_call_limit} onChange={(e) => setForm({ ...form, daily_call_limit: Number(e.target.value) })} style={inp} />
                </div>
              </div>
              <button onClick={() => saveMut.mutate()} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>{saveMut.isPending ? "保存中..." : "保存权限"}</button>
            </>
          )}
        </div>
      )}
      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ==================== Tab5 登录安全 ==================== */
function LoginTab() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const sumQ = useQuery({
    queryKey: ["me-security-summary"],
    queryFn: async () => (await api.get<{ data: any }>("/me/security/summary")).data.data,
    refetchInterval: 60000,
  });
  const histQ = useQuery({
    queryKey: ["me-login-history"],
    queryFn: async () => (await api.get<{ data: { records: any[] } }>("/me/login-history")).data.data,
  });
  const opt = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: string }) => (await api.post(`/me/login-history/${id}/${action}`, {})).data,
    onSuccess: () => { setNotice({ type: "success", msg: "操作成功" }); qc.invalidateQueries({ queryKey: ["me-login-history"] }); qc.invalidateQueries({ queryKey: ["me-security-summary"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  const s = sumQ.data;

  return (
    <div>
      {s && (
        <div style={{ ...card, marginBottom: 16 }}>
          <h4 style={{ margin: 0, marginBottom: 12 }}>🔒 安全概览</h4>
          <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
            {[["近7天异常登录", s.anomaly_count, "#d97706"], ["近期拦截", s.blocked_count, "#dc2626"], ["双因素认证", s.two_factor_enabled ? "已启用" : "未启用", s.two_factor_enabled ? "#16a34a" : "#94a3b8"]].map(([label, v, color]) => (
              <div key={label as string} style={{ flex: 1, background: "#f8fafc", padding: 14, borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: color as string }}>{v as any}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{label}</div>
              </div>
            ))}
          </div>
          {s.recent_events?.length > 0 && (
            <div style={{ fontSize: 13 }}>
              <strong style={{ color: "#475569" }}>最近风险事件：</strong>
              {s.recent_events.map((e: any) => (
                <div key={e.id} style={{ color: "#64748b", marginTop: 4 }}>
                  {new Date(e.login_at).toLocaleString()} — {e.city ?? "未知位置"}{e.risk_rule ? ` (${e.risk_rule})` : ""}{e.confirmed_by_user ? " ✅已确认" : e.is_blocked ? " ✋已拦截" : ""}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={card}>
        <h4 style={{ margin: 0, marginBottom: 12 }}>登录记录</h4>
        {histQ.data?.records?.length === 0 ? <div style={{ color: "#94a3b8" }}>暂无登录记录</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ color: "#64748b", textAlign: "left" }}>
              <th style={{ padding: "8px" }}>时间</th><th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>IP/位置</th><th style={{ padding: "8px" }}>设备</th><th style={{ padding: "8px" }}>操作</th>
            </tr></thead>
            <tbody>
              {histQ.data?.records.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px" }}>{r.login_at ? new Date(r.login_at).toLocaleString() : "—"}</td>
                  <td style={{ padding: "8px" }}>
                    <span style={{ color: r.risk_level === "blocked" ? "#dc2626" : r.risk_level === "suspicious" ? "#d97706" : "#16a34a" }}>
                      {r.risk_level === "blocked" ? "✗ 异常拦截" : r.risk_level === "suspicious" ? "⚠ 异地登录" : "🟢 正常"}
                    </span>
                    {r.confirmed_by_user ? <span style={{ color: "#16a34a", fontSize: 12, marginLeft: 6 }}>✓已确认</span> : null}
                  </td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{r.ip ?? "—"}<div style={{ fontSize: 12, color: "#94a3b8" }}>{r.city ?? ""}{r.country ? ` · ${r.country}` : ""}</div></td>
                  <td style={{ padding: "8px", color: "#64748b" }}>{r.browser ?? (r.device_info ?? "—")}</td>
                  <td style={{ padding: "8px" }}>
                    {r.risk_level !== "normal" && !r.confirmed_by_user ? (
                      <>
                        <button onClick={() => opt.mutate({ id: r.id, action: "confirm" })} style={{ ...btnBase, background: "#dcfce7", color: "#166534", padding: "4px 8px", marginRight: 6 }}>确认是本人</button>
                        <button onClick={() => { if (window.confirm("确认这不是您本人的登录？系统将登出所有设备并保护账户。")) opt.mutate({ id: r.id, action: "report" }); }} style={{ ...btnBase, background: "#fee2e2", color: "#dc2626", padding: "4px 8px" }}>这不是我</button>
                      </>
                    ) : <span style={{ color: "#94a3b8", fontSize: 12 }}>{r.confirmed_by_user ? "已确认为本人" : "—"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 3000, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
