/**
 * Portal layout — fixed sidebar + topbar + main content area
 * Used by all internal portal pages (realname, notifications, deletion, etc.)
 */
"use client";

import "@3cloud/shared-ui/src/tokens.css";
import { ToastProvider } from "@3cloud/shared-ui";
import PortalSidebar from "./_components/PortalSidebar";
import PortalTopbar from "./_components/PortalTopbar";
import { useState } from "react";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed] = useState(false);

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
