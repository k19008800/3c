/**
 * Auth layout — center-card, no sidebar
 * Used by login / register / forgot-password / 2fa
 */
import "@3cloud/shared-ui/src/tokens.css";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        fontFamily: "var(--font-family)",
      }}
    >
      {children}
    </div>
  );
}
