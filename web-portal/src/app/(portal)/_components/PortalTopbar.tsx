/**
 * PortalTopbar — top bar with page title, user info, balance, bell
 */
"use client";

import { HelpIcon } from "@3cloud/shared-ui";
import Link from "next/link";

interface PortalTopbarProps {
  title?: string;
  helpHint?: string;
  unread?: number;
  balance?: string;
  email?: string;
}

export default function PortalTopbar({
  title = "控制台",
  helpHint,
  unread = 3,
  balance = "¥12,345.67",
  email = "demo@test.com",
}: PortalTopbarProps) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: 56,
        padding: "0 24px",
        background: "var(--color-panel)",
        borderBottom: "1px solid var(--color-divider)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: "var(--font-size-2xl)", fontWeight: 600, color: "var(--color-text)" }}>
          {title}
        </span>
        {helpHint && <HelpIcon text={helpHint} level="page" />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
        <span style={{ color: "#666", cursor: "default" }}>{email}</span>
        <Link
          href="/recharge"
          style={{ color: "var(--color-sidebar-active)", fontWeight: 500, textDecoration: "none" }}
        >
          {balance}
        </Link>
        <Link
          href="/notifications"
          style={{
            position: "relative",
            fontSize: 18,
            cursor: "pointer",
            color: "var(--color-text-secondary)",
            textDecoration: "none",
          }}
        >
          🔔
          {unread > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -8,
                background: "var(--color-bell-badge)",
                color: "#fff",
                fontSize: 10,
                width: 16,
                height: 16,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
              }}
            >
              {unread}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
