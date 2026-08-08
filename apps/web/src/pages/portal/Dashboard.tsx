import { useState, useEffect, useCallback } from "react";
import PortalLayout from "../../components/PortalLayout";
import HelpIcon from "../../components/HelpIcon";
import api from "../../services/api";

interface UserStats {
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  todayCalls: number;
  balance: number;
}

interface Forecast {
  currentMonthSpent: number;
  forecastTotal: number;
  dailyAvgCost: number;
  balanceRunoutDays: number;
  monthOverMonthChange: number;
}

interface Alert {
  type: string;
  severity: string;
  message: string;
  value: number;
}

function getToken() {
  return localStorage.getItem("3cloud_token");
}
function setToken(t: string) {
  localStorage.setItem("3cloud_token", t);
}
function clearToken() {
  localStorage.removeItem("3cloud_token");
}

export default function Dashboard() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(!!getToken());

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [statsRes, forecastRes, alertsRes] = await Promise.all([
      api.get<UserStats>("/me/stats"),
      api.get<Forecast>("/me/stats/forecast"),
      api.get<Alert[]>("/me/alerts/summary"),
    ]);

    if (statsRes.error) {
      if (statsRes.error.includes("认证") || statsRes.error.includes("401") || statsRes.error.includes("invalid")) {
        clearToken();
        setAuthenticated(false);
        setError("请先登录");
      } else {
        setError(statsRes.error);
      }
    } else {
      setStats(statsRes.data);
    }
    if (forecastRes.data) setForecast(forecastRes.data);
    if (alertsRes.data) setAlerts(alertsRes.data);

    setLoading(false);
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [authenticated, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLoginError("请输入邮箱和密码");
      return;
    }
    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      
      if (!res.ok) {
        setLoginError(json.message || `登录失败 (${res.status})`);
      } else if (json.token) {
        setToken(json.token);
        setAuthenticated(true);
      } else {
        setLoginError("登录响应异常");
      }
    } catch (err: any) {
      setLoginError(err.message || "网络错误");
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    clearToken();
    setAuthenticated(false);
    setStats(null);
    setForecast(null);
    setAlerts([]);
  };

  // ── Unauthenticated: show login form ──
  if (!authenticated) {
    return (
      <PortalLayout>
        <h1 className="page-title">
          Portal Dashboard
          <HelpIcon title="3Cloud AI Token 聚合平台控制台概览" />
        </h1>
        <p className="page-subtitle">3Cloud AI Token 聚合平台</p>

        <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
          <div className="card-title">🔐 用户登录</div>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 14 }}>邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 14 }}>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {loginError && (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", fontSize: 13, border: "1px solid #fecaca" }}>
                ⚠️ {loginError}
              </div>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                background: "var(--color-primary)",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                border: "none",
                cursor: loginLoading ? "not-allowed" : "pointer",
                opacity: loginLoading ? 0.7 : 1,
              }}
            >
              {loginLoading ? "登录中..." : "登录"}
            </button>
          </form>
        </div>
      </PortalLayout>
    );
  }

  // ── Authenticated: show dashboard ──
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          Portal Dashboard
          <HelpIcon title="3Cloud AI Token 聚合平台控制台概览" />
        </h1>
        <button
          onClick={handleLogout}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          退出登录
        </button>
      </div>
      <p className="page-subtitle">3Cloud AI Token 聚合平台</p>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-label">总调用次数</div>
            <div className="stat-card-value">{stats.totalCalls.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">今日调用</div>
            <div className="stat-card-value">{stats.todayCalls.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">总 Token 消耗</div>
            <div className="stat-card-value">{stats.totalTokens.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">总消费金额</div>
            <div className="stat-card-value">¥{stats.totalCost.toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">账户余额</div>
            <div className="stat-card-value">¥{stats.balance.toFixed(2)}</div>
          </div>
        </div>
      )}

      {/* Forecast */}
      {forecast && (
        <div className="card mt-4">
          <div className="card-title">📈 成本预测</div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-card-label">本月已消费</div>
              <div className="stat-card-value">¥{forecast.currentMonthSpent.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">预计月消费</div>
              <div className="stat-card-value">¥{forecast.forecastTotal.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">日均消费</div>
              <div className="stat-card-value">¥{forecast.dailyAvgCost.toFixed(4)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">余额可用天数</div>
              <div className="stat-card-value">{forecast.balanceRunoutDays} 天</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">环比变化</div>
              <div className="stat-card-value" style={{ color: forecast.monthOverMonthChange > 0 ? "#ef4444" : "#10b981" }}>
                {forecast.monthOverMonthChange > 0 ? "↑" : "↓"} {Math.abs(forecast.monthOverMonthChange)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="card mt-4">
          <div className="card-title">⚠️ 系统告警</div>
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`alert-item alert-${a.severity}`}
              style={{
                padding: "12px 16px",
                borderRadius: 8,
                marginBottom: 8,
                background: a.severity === "critical" ? "#fef2f2" : a.severity === "warning" ? "#fffbeb" : "#f0fdf4",
                border: `1px solid ${a.severity === "critical" ? "#fecaca" : a.severity === "warning" ? "#fde68a" : "#bbf7d0"}`,
                color: a.severity === "critical" ? "#991b1b" : a.severity === "warning" ? "#92400e" : "#166534",
              }}
            >
              {a.message}
            </div>
          ))}
        </div>
      )}
    </PortalLayout>
  );
}
