import { useState, useEffect } from "react";
import PortalLayout from "../../components/PortalLayout";
import HelpIcon from "../../components/HelpIcon";
import api from "../../services/api";

interface TwoFAStatus {
  enabled: boolean;
  verified: boolean;
  enabled_at: string | null;
  has_recovery_codes: boolean;
  remaining_recovery_codes: number;
}

interface Device {
  id: number;
  name: string;
  last_active_at: string;
  is_current: boolean;
  fingerprint: string;
}

interface LoginRecord {
  id: number;
  login_at: string;
  ip: string;
  city: string;
  risk_rule: string;
  is_blocked: boolean;
  confirmed_by_user: boolean;
}

interface SecuritySummary {
  anomaly_count: number;
  blocked_count: number;
  two_factor_enabled: boolean;
  recent_events: Array<{
    id: number;
    login_at: string;
    city: string;
    risk_rule: string;
    is_blocked: boolean;
    confirmed_by_user: boolean;
  }>;
}

export default function Security() {
  const [twoFAStatus, setTwoFAStatus] = useState<TwoFAStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loginHistory, setLoginHistory] = useState<LoginRecord[]>([]);
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 2FA state
  const [showSetup, setShowSetup] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; otpauth: string; manual_key: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [showDisable, setShowDisable] = useState(false);

  const [revokingId, setRevokingId] = useState<number | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [faRes, devRes, loginRes, sumRes] = await Promise.all([
      api.get<TwoFAStatus>("/auth/2fa/status"),
      api.get<{ devices: Device[] }>("/me/devices"),
      api.get<{ records: LoginRecord[] }>("/me/login-history?page=1&limit=5"),
      api.get<SecuritySummary>("/me/security/summary"),
    ]);
    if (faRes.data) setTwoFAStatus(faRes.data);
    if (devRes.data) setDevices(devRes.data.devices || []);
    if (loginRes.data) setLoginHistory(loginRes.data.records || []);
    if (sumRes.data) setSummary(sumRes.data);

    const firstErr = faRes.error || devRes.error || loginRes.error || sumRes.error;
    if (firstErr) setError(firstErr);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSetup2FA = async () => {
    setShowSetup(true);
    const res = await api.post<{ secret: string; otpauth: string; manual_key: string }>("/auth/2fa/setup");
    if (res.error) {
      setError(res.error);
      setShowSetup(false);
      return;
    }
    if (res.data) setSetupData(res.data);
  };

  const handleVerify2FA = async () => {
    if (verificationCode.length !== 6) return;
    const res = await api.post<{ success: boolean; recovery_codes: string[] }>("/auth/2fa/verify", { code: verificationCode });
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.data) {
      setRecoveryCodes(res.data.recovery_codes || []);
      setShowSetup(false);
      await loadAll();
    }
  };

  const handleDisable2FA = async () => {
    if (disableCode.length !== 6) return;
    const res = await api.post("/auth/2fa/disable", { code: disableCode });
    if (res.error) {
      setError(res.error);
      return;
    }
    setShowDisable(false);
    setDisableCode("");
    await loadAll();
  };

  const handleRevokeDevice = async (id: number) => {
    setRevokingId(id);
    await api.post(`/me/devices/${id}/logout`);
    setRevokingId(null);
    await loadAll();
  };

  if (loading) {
    return (
      <PortalLayout>
        <div className="loading-container">
          <div className="spinner" />
          <p>加载中...</p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <h1 className="page-title">
        安全设置 <HelpIcon title="管理两步验证、查看登录历史和设备" />
      </h1>
      <p className="page-subtitle">保护您的账户安全，管理登录设备</p>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* 2FA Section */}
      <div className="section mt-4">
        <div className="card">
          <div className="card-title">两步验证 (2FA) <HelpIcon title="启用 TOTP 两步验证，每次登录需要输入验证器生成的动态码" /></div>
          <div className="flex-between">
            <div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                状态：{twoFAStatus?.enabled ? <span style={{ color: "#10b981" }}>已启用 🟢</span> : <span style={{ color: "#ef4444" }}>未启用 🔴</span>}
              </div>
              <div className="form-hint">
                {twoFAStatus?.enabled
                  ? "两步验证已开启，登录时需要输入验证器生成的6位动态码"
                  : "建议开启两步验证增强账户安全性"}
              </div>
            </div>
            {twoFAStatus?.enabled ? (
              <button className="btn btn-outline" onClick={() => setShowDisable(true)}>
                关闭 2FA
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleSetup2FA}>
                开启 2FA
              </button>
            )}
          </div>

          {/* Recovery Codes Display */}
          {recoveryCodes && recoveryCodes.length > 0 && (
            <div className="mt-3">
              <span style={{ color: "#10b981", fontWeight: 500 }}>✅ 验证成功！请保存以下备用恢复码：</span>
              <div style={{ fontFamily: "monospace", fontSize: 14, background: "#f3f4f6", padding: "8px 12px", borderRadius: 6, marginTop: 8, wordBreak: "break-all" }}>
                {recoveryCodes.join(" - ")}
              </div>
              <button className="btn btn-sm btn-secondary mt-2" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard.writeText(recoveryCodes.join("\n")).catch(() => {}); }}>
                📋 复制恢复码
              </button>
            </div>
          )}

          {showSetup && setupData && (
            <div className="mt-4" style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>设置两步验证</div>
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 16 }}>
                请使用 Google Authenticator 或其它 TOTP 验证器扫描以下二维码，或手动输入密钥：
              </p>
              <div className="qr-placeholder">
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 40 }}>📱</div>
                  <div style={{ fontFamily: "monospace", fontSize: 13, marginTop: 8 }}>密钥: {setupData.manual_key}</div>
                  <div className="form-hint" style={{ marginTop: 4 }}>请用验证器扫描或手动输入此密钥</div>
                </div>
              </div>
              <div className="form-group mt-4">
                <label className="form-label">输入验证码</label>
                <div className="flex-row">
                  <input
                    className="form-input sm"
                    type="text"
                    maxLength={6}
                    placeholder="6位验证码"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  />
                  <button
                    className="btn btn-primary"
                    disabled={verificationCode.length !== 6}
                    onClick={handleVerify2FA}
                  >
                    验证并启用
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Disable 2FA Dialog */}
          {showDisable && (
            <div className="mt-4" style={{ borderTop: "1px solid #f3f4f6", paddingTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>关闭两步验证</div>
              <p style={{ fontSize: 14, color: "var(--color-text-secondary)", marginBottom: 16 }}>
                请输入验证器中的6位动态码以确认关闭
              </p>
              <div className="form-group">
                <div className="flex-row">
                  <input
                    className="form-input sm"
                    type="text"
                    maxLength={6}
                    placeholder="6位验证码"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                  />
                  <button className="btn btn-primary" disabled={disableCode.length !== 6} onClick={handleDisable2FA}>
                    确认关闭
                  </button>
                  <button className="btn btn-secondary" onClick={() => { setShowDisable(false); setDisableCode(""); }}>
                    取消
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Summary */}
      {summary && (
        <div className="section">
          <div className="card">
            <div className="card-title">安全概览 <HelpIcon title="查看近期安全事件和异常登录" /></div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-card-label">近期异常</div>
                <div className="stat-card-value" style={{ color: summary.anomaly_count > 0 ? "#ef4444" : "#10b981" }}>
                  {summary.anomaly_count}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">已拦截登录</div>
                <div className="stat-card-value">{summary.blocked_count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-card-label">2FA 状态</div>
                <div className="stat-card-value" style={{ fontSize: 16 }}>
                  {summary.two_factor_enabled ? "🟢 已启用" : "🔴 未启用"}
                </div>
              </div>
            </div>
            {summary.recent_events.length > 0 && (
              <div className="mt-4">
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>近期安全事件</div>
                {summary.recent_events.map((evt) => (
                  <div key={evt.id} style={{ padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 }}>
                    <span style={{ color: "var(--color-text-secondary)" }}>
                      {evt.login_at ? new Date(evt.login_at).toLocaleString("zh-CN") : "—"}
                    </span>
                    {" — "}
                    {evt.city || "未知"} — {evt.risk_rule || "正常"}
                    {evt.is_blocked && <span className="badge badge-danger" style={{ marginLeft: 8 }}>已拦截</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Login History */}
      <div className="section">
        <div className="card">
          <div className="card-title">登录历史 <HelpIcon title="查看最近的登录记录，如发现异常请立即修改密码" /></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>位置</th>
                  <th>风险</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {loginHistory.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 20, color: "var(--color-text-secondary)" }}>
                      暂无登录记录
                    </td>
                  </tr>
                ) : (
                  loginHistory.map((record) => (
                    <tr key={record.id}>
                      <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        {record.login_at ? new Date(record.login_at).toLocaleString("zh-CN") : "—"}
                      </td>
                      <td>{record.city || "未知"}</td>
                      <td>{record.risk_rule || "正常"}</td>
                      <td>
                        {record.is_blocked ? (
                          <span className="badge badge-danger">已拦截</span>
                        ) : (
                          <span className="badge badge-success">正常</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Device Management */}
      <div className="section">
        <div className="card">
          <div className="card-title">设备管理 <HelpIcon title="查看和管理已登录的设备，可远程下线不可信设备" /></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>设备名称</th>
                  <th>最近使用</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: 20, color: "var(--color-text-secondary)" }}>
                      暂无设备
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.name || `设备 ${device.id}`}</td>
                      <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        {device.last_active_at ? new Date(device.last_active_at).toLocaleString("zh-CN") : "—"}
                      </td>
                      <td>
                        {device.is_current ? (
                          <span className="badge badge-success">当前设备</span>
                        ) : (
                          <span className="badge badge-default">其他设备</span>
                        )}
                      </td>
                      <td>
                        {!device.is_current && (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleRevokeDevice(device.id)}
                            disabled={revokingId === device.id}
                          >
                            {revokingId === device.id ? "下线中..." : "下线"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
