import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3Cloud — 一站式 AI API 聚合平台",
  description: "接入 DeepSeek、Qwen、GLM 等主流模型，统一计费、智能路由、精细运营",
  openGraph: {
    title: "3Cloud — 一站式 AI API 聚合平台",
    description: "统一计费、智能路由、精细运营",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header
          style={{
            borderBottom: "1px solid #e2e8f0",
            padding: "0 24px",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#fff",
          }}
        >
          <a href="/" style={{ fontWeight: 700, fontSize: 20, color: "#0f172a", textDecoration: "none" }}>
            3Cloud
          </a>
          <nav style={{ display: "flex", gap: 24 }}>
            <a href="/models" style={{ color: "#475569", textDecoration: "none" }}>
              模型目录
            </a>
            <a href="/pricing" style={{ color: "#475569", textDecoration: "none" }}>
              定价
            </a>
            <a href="/status" style={{ color: "#475569", textDecoration: "none" }}>
              系统状态
            </a>
          </nav>
        </header>
        <main style={{ minHeight: "calc(100vh - 128px)" }}>{children}</main>
        <footer style={{ borderTop: "1px solid #e2e8f0", padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          © 2026 3Cloud · AI Token 聚合平台
        </footer>
      </body>
    </html>
  );
}
