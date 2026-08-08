import { useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import PageHeader from "../../components/PageHeader";
import api from "../../services/api";

/* ==================== Types ==================== */

interface BudgetSettings {
  monthly_budget: number;
  daily_budget: number;
  budgetType?: string;
  autoBlock?: boolean;
  blocked?: boolean;
  blockedAt?: string | null;
  currentMonthSpent?: number;
  currentDaySpent?: number;
}

interface BudgetStatus {
  monthly_budget: number;
  current_month_spent: number;
  spent_percent: number;
  daily_budget: number;
  current_day_spent: number;
  daily_percent: number;
  blocked: boolean;
  blocked_at: string | null;
  remaining_days: number;
}

/* ==================== Nav ==================== */

const NAV = [
  { to: "/dashboard", icon: "📊", label: "概览" },
  { to: "/team", icon: "👥", label: "团队" },
  { to: "/webhooks", icon: "🔔", label: "Webhooks" },
  { to: "/logs", icon: "📋", label: "日志" },
  { to: "/settings", icon: "⚙️", label: "设置" },
  { to: "/account-deletion", icon: "🗑️", label: "账号注销" },
];

/* ==================== Component ==================== */

export default function Settings() {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Budget
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings | null>(null);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [editingBudget, setEditingBudget] = useState(false);
  const [draftMonthly, setDraftMonthly] = useState(0);
  const [draftDaily, setDraftDaily] = useState(0);

  // Notification preferences (mock — no backend)
  const [prefs, setPrefs] = useState({ email: true, sms: false, webhook: true });
  const [savingNotif, setSavingNotif] = useState(false);

  // Password (mock — no backend)
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", newPass: "", confirm: "" });
  const [passwordError, setPasswordError] = useState("");

  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [settingsRes, statusRes] = await Promise.all([
        api.get<BudgetSettings>("/me/budget/settings"),
        api.get<BudgetStatus>("/me/budget/status"),
      ]);
      if (settingsRes.error) setError(settingsRes.error);
      else {
        setBudgetSettings(settingsRes.data);
        setDraftMonthly(settingsRes.data?.monthly_budget ?? 0);
        setDraftDaily(settingsRes.data?.daily_budget ?? 0);
      }
      if (statusRes.data) setBudgetStatus(statusRes.data);
      setLoading(false);
    }
    load();
  }, []);

  /* Budget */
  const startEditBudget = useCallback(() => {
    if (budgetSettings) {
      setDraftMonthly(budgetSettings.monthly_budget);
      setDraftDaily(budgetSettings.daily_budget);
    }
    setEditingBudget(true);
  }, [budgetSettings]);

  const saveBudget = useCallback(async () => {
    const res = await api.put("/me/budget/settings", {
      monthlyBudget: draftMonthly,
      dailyBudget: draftDaily,
    });
    if (res.error) {
      showToast(res.error);
      return;
    }
    if (res.data) {
      setBudgetSettings({
        ...budgetSettings,
        monthly_budget: (res.data as any).monthly_budget ?? draftMonthly,
        daily_budget: (res.data as any).daily_budget ?? draftDaily,
      });
    }
    setEditingBudget(false);
    showToast("预算设置已更新");
  }, [draftMonthly, draftDaily, budgetSettings, showToast]);

  /* Notification preferences */
  const togglePref = useCallback((key: "email" | "sms" | "webhook") => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const savePrefs = useCallback(() => {
    setSavingNotif(true);
    setTimeout(() => {
      setSavingNotif(false);
      showToast("通知偏好已保存");
    }, 600);
  }, [showToast]);

  /* Password change */
  const handlePasswordSave = useCallback(() => {
    if (!passwordForm.current) { setPasswordError("请输入当前密码"); return; }
    if (passwordForm.newPass.length < 8) { setPasswordError("新密码至少 8 位"); return; }
    if (passwordForm.newPass !== passwordForm.confirm) { setPasswordError("两次密码不一致"); return; }
    setPasswordError("");
    setPasswordOpen(false);
    setPasswordForm({ current: "", newPass: "", confirm: "" });
    showToast("密码修改功能暂未接入后端 API");
  }, [passwordForm, showToast]);

  if (loading) {
    return (
      <div className="portal-layout">
        <aside className="sidebar">
          <div className="sidebar-logo">3Cloud</div>
          <nav className="sidebar-nav">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className={`nav-item${location.pathname === item.to ? " active" : ""}`}>
                {item.icon} {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="portal-main">
          <div className="loading-container">
            <div className="spinner" />
            <p>加载中...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="portal-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">3Cloud</div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <Link key={item.to} to={item.to} className={`nav-item${location.pathname === item.to ? " active" : ""}`}>
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="portal-main">
        <PageHeader
          title="账户设置"
          helpText="管理预算上限、通知偏好和安全设置。"
        />

        {error && <div className="error-banner">⚠️ {error}</div>}

        {/* Budget */}
        <div className="card">
          <div className="flex-between mb-4">
            <h3 className="card-title" style={{ margin: 0 }}>预算上限 <span className="help-icon" title="设置每日/每月消费上限">[?]</span></h3>
            {!editingBudget ? (
              <button className="btn btn-outline btn-sm" onClick={startEditBudget}>编辑</button>
            ) : (
              <div className="flex-row gap-2">
                <button className="btn btn-outline btn-sm" onClick={() => setEditingBudget(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={saveBudget}>保存</button>
              </div>
            )}
          </div>

          {editingBudget ? (
            <>
              <div className="form-group">
                <label className="form-label">每日上限 (¥)</label>
                <input className="form-input sm" type="number" value={draftDaily} onChange={(e) => setDraftDaily(Number(e.target.value))} min={1} />
              </div>
              <div className="form-group">
                <label className="form-label">每月上限 (¥)</label>
                <input className="form-input sm" type="number" value={draftMonthly} onChange={(e) => setDraftMonthly(Number(e.target.value))} min={1} />
              </div>
            </>
          ) : budgetSettings ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 32px" }}>
              <div>
                <div className="form-label">每日上限</div>
                <div style={{ fontWeight: 600 }}>¥{budgetSettings.daily_budget.toLocaleString()}</div>
              </div>
              <div>
                <div className="form-label">每月上限</div>
                <div style={{ fontWeight: 600 }}>¥{budgetSettings.monthly_budget.toLocaleString()}</div>
              </div>
              {budgetStatus && (
                <>
                  <div>
                    <div className="form-label">本月已用</div>
                    <div>
                      <span style={{ fontWeight: 600 }}>¥{budgetStatus.current_month_spent.toFixed(2)}</span>
                      <span style={{ color: "var(--color-text-secondary)", marginLeft: 8 }}>
                        ({budgetStatus.spent_percent}%)
                      </span>
                    </div>
                    <div style={{ marginTop: 6, height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden", width: 200 }}>
                      <div style={{ width: `${Math.min(budgetStatus.spent_percent, 100)}%`, height: "100%", background: budgetStatus.spent_percent > 80 ? "#ef4444" : "var(--color-primary)", borderRadius: 3 }} />
                    </div>
                  </div>
                  <div>
                    <div className="form-label">今日已用</div>
                    <div style={{ fontWeight: 600 }}>¥{budgetStatus.current_day_spent.toFixed(2)} ({budgetStatus.daily_percent}%)</div>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Notification Preferences (mock) */}
        <div className="card">
          <h3 className="card-title">通知偏好 <span className="help-icon" title="选择您希望接收通知的渠道">[?]</span></h3>
          {/* TODO: backend endpoint not yet available for notification prefs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {([
              { key: "email" as const, label: "邮件通知", desc: "通过注册邮箱接收重要通知和消费提醒" },
              { key: "sms" as const, label: "短信通知", desc: "通过手机短信接收紧急告警" },
              { key: "webhook" as const, label: "Webhook 通知", desc: "通过您配置的 Webhook 端点推送事件" },
            ]).map((item) => (
              <div key={item.key} className="flex-between" style={{ padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{item.desc}</div>
                </div>
                <button className={`toggle${prefs[item.key] ? " on" : ""}`} onClick={() => togglePref(item.key)} />
              </div>
            ))}
          </div>
          <div className="mt-4">
            <button className="btn btn-primary" onClick={savePrefs} disabled={savingNotif}>
              {savingNotif ? "保存中…" : "保存偏好设置"}
            </button>
          </div>
        </div>

        {/* Password (mock) */}
        <div className="card">
          <h3 className="card-title">账户安全 <span className="help-icon" title="修改登录密码">[?]</span></h3>
          {/* TODO: backend endpoint not yet available for password change */}
          {!passwordOpen ? (
            <button className="btn btn-outline" onClick={() => setPasswordOpen(true)}>🔒 修改密码</button>
          ) : (
            <div style={{ maxWidth: 400 }}>
              {passwordError && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>{passwordError}</div>}
              <div className="form-group"><label className="form-label">当前密码</label><input className="form-input" type="password" value={passwordForm.current} onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">新密码</label><input className="form-input" type="password" value={passwordForm.newPass} onChange={(e) => setPasswordForm((p) => ({ ...p, newPass: e.target.value }))} placeholder="至少 8 位" /></div>
              <div className="form-group"><label className="form-label">确认新密码</label><input className="form-input" type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))} /></div>
              <div className="flex-row gap-2">
                <button className="btn btn-primary" onClick={handlePasswordSave}>确认修改</button>
                <button className="btn btn-outline" onClick={() => { setPasswordOpen(false); setPasswordError(""); setPasswordForm({ current: "", newPass: "", confirm: "" }); }}>取消</button>
              </div>
            </div>
          )}
        </div>

        {toast && <div className="toast">{toast}</div>}
      </main>
    </div>
  );
}
