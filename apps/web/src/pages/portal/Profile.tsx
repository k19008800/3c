import { useState, useEffect, type FormEvent } from "react";
import PortalLayout from "../../components/PortalLayout";
import HelpIcon from "../../components/HelpIcon";
import api from "../../services/api";

interface Toast {
  message: string;
  type: "success" | "error";
}

interface UserProfile {
  id: number;
  email: string;
  username: string;
  phone: string | null;
  role: string;
  status: string;
  balance: number;
  realNameStatus: string | null;
  createdAt: string;
}

export default function Profile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [password, setPassword] = useState({ current: "", new: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await api.get<UserProfile>("/me");
      if (res.error) {
        setError(res.error);
      } else {
        setProfile(res.data);
      }
      setLoading(false);
    }
    load();
  }, []);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handlePasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.new !== password.confirm) {
      showToast("两次输入的新密码不一致", "error");
      return;
    }
    if (password.new.length < 6) {
      showToast("新密码长度至少6位", "error");
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setPassword({ current: "", new: "", confirm: "" });
      showToast("密码修改功能暂未接入后端 API");
    }, 800);
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
      {toast && (
        <div className={`toast${toast.type === "error" ? " error" : ""}`}>
          {toast.message}
        </div>
      )}

      <h1 className="page-title">
        个人中心 <HelpIcon title="管理您的个人信息、密码和邮箱绑定" />
      </h1>
      <p className="page-subtitle">管理您的账户信息和偏好设置</p>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* Basic Info */}
      {profile && (
        <div className="section mt-4">
          <div className="card">
            <div className="card-title">基本信息</div>
            <div className="flex-row">
              <div className="avatar-lg" title="当前用户">
                {profile.username?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{profile.username}</div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 14, marginTop: 4 }}>
                  邮箱：{profile.email}
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 14, marginTop: 2 }}>
                  手机：{profile.phone || "未绑定"}
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13, marginTop: 2 }}>
                  注册时间：{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString("zh-CN") : "—"}
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13, marginTop: 2 }}>
                  角色：{profile.role === "admin" ? "管理员" : profile.role === "user" ? "用户" : profile.role}
                </div>
                <div style={{ color: "var(--color-text-secondary)", fontSize: 13, marginTop: 2 }}>
                  余额：¥{((profile.balance ?? 0) / 100).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password */}
      <div className="section">
        <div className="card">
          <div className="card-title">修改密码 <HelpIcon title="输入当前密码和新密码来更新您的登录凭证" /></div>
          <form onSubmit={handlePasswordSubmit}>
            <div className="form-group">
              <label className="form-label">当前密码</label>
              <input
                className="form-input"
                type="password"
                value={password.current}
                onChange={(e) => setPassword((p) => ({ ...p, current: e.target.value }))}
                placeholder="请输入当前密码"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">新密码</label>
              <input
                className="form-input"
                type="password"
                value={password.new}
                onChange={(e) => setPassword((p) => ({ ...p, new: e.target.value }))}
                placeholder="请输入新密码（至少6位）"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">确认新密码</label>
              <input
                className="form-input"
                type="password"
                value={password.confirm}
                onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))}
                placeholder="请再次输入新密码"
                required
              />
            </div>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? "保存中..." : "更新密码"}
            </button>
          </form>
          <div className="form-hint mt-2" style={{ marginTop: 8 }}>
            {/* TODO: backend endpoint not yet available for password change */}
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
