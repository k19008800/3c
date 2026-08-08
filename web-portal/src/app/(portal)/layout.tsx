"use client";

import "@3cloud/shared-ui/src/tokens.css";
import { ToastProvider } from "@3cloud/shared-ui";
import PortalSidebar from "./_components/PortalSidebar";
import PortalTopbar from "./_components/PortalTopbar";
import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed] = useState(false);
  const [authed, setAuthed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else {
      setAuthed(true);
    }
  }, [pathname, router]);

  if (!authed) {
    return (
      <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f0f2f5", fontFamily: "var(--font-family)" }}>
        <div style={{ fontSize: 14, color: "#64748b" }}>验证中…</div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-family)" }}>
        <PortalSidebar collapsed={sidebarCollapsed} />
        <div
          style={{
            marginLeft: sidebarCollapsed ? 60 : "var(--sidebar-width)",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: "100vh",
          }}
        >
          <PortalTopbar />
          <main style={{ padding: "var(--main-padding)", flex: 1 }}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
