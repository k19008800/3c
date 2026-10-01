import { useState } from "react";
import { Link } from "react-router-dom";
import { useVendorAuthStore } from "../../store/vendor-auth";
import { useI18n } from "../../lib/i18n-context";
import "../console-misc.css";

export default function VendorLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const vendorLogin = useVendorAuthStore((s) => s.vendorLogin);
  const { t } = useI18n();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await vendorLogin(email, password);
      window.location.href = "/vendor";
    } catch (err: any) {
      setError(err?.message ?? t("vendor.errorSubmit"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cm-ink-bg" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <form onSubmit={handleSubmit} style={{ background: "var(--color-panel)", padding: 40, borderRadius: "var(--radius-xl)", width: 380, maxWidth: "calc(100vw - 40px)", boxShadow: "var(--shadow-modal)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h1 style={{ marginBottom: 4, fontSize: 22, color: "var(--color-text)" }}>{t("vendor.title")}</h1>
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{t("vendor.subtitle")}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--color-text)" }}>{t("vendor.emailLabel")}</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("vendor.emailPlaceholder")} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }} required />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", marginBottom: 6, fontSize: 14, color: "var(--color-text)" }}>{t("vendor.passwordLabel")}</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("vendor.passwordPlaceholder")} style={{ width: "100%", padding: 10, boxSizing: "border-box", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }} required />
        </div>
        {error && <div style={{ color: "var(--color-danger-text)", marginBottom: 12, fontSize: 14 }}>{error}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: "var(--radius-md)", cursor: "pointer", fontSize: 15 }}>{loading ? t("vendor.loggingIn") : t("vendor.loginButton")}</button>
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 13, color: "var(--color-text-secondary)" }}>
          {t("vendor.noAccount")} <Link to="/vendor/register" style={{ color: "var(--color-primary)" }}>{t("vendor.applyOnboard")}</Link>
        </div>
      </form>
    </div>
  );
}
