"use client";

import { useState } from "react";

/**
 * Portal `[?]` 帮助组件（零依赖实现，对齐 PRODUCT-DESIGN-PRINCIPLES.md P1）
 *
 * - PageHelp：页面标题旁使用，点击弹出帮助弹窗（页面级帮助）
 * - ButtonHelp：按钮/操作入口旁使用，悬停显示 Tooltip（按钮级帮助）
 *
 * @see docs/PRODUCT-DESIGN-PRINCIPLES.md P1
 * @module components/Help
 */

/** 页面级 `[?]`：点击弹出帮助弹窗 */
export function PageHelp({ text, title = "页面帮助" }: { text: string; title?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={title}
        title="点击查看页面帮助"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid #94a3b8",
          background: "#f1f5f9",
          color: "#475569",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "pointer",
          marginLeft: 8,
          verticalAlign: "middle",
        }}
      >
        ?
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 520,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,.25)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <strong style={{ fontSize: 15, color: "#0f172a" }}>{title}</strong>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭"
                style={{ border: "none", background: "none", fontSize: 16, cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>
            <div style={{ padding: "18px 20px", fontSize: 14, color: "#334155", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
              {text}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** 按钮级 `[?]`：悬停显示 Tooltip（纯 CSS，无 JS 依赖） */
export function ButtonHelp({ text }: { text: string }) {
  return (
    <span className="portal-help-tip" style={{ position: "relative", display: "inline-flex", marginLeft: 6 }} tabIndex={0} aria-label="帮助">
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid #cbd5e1",
          background: "#f8fafc",
          color: "#64748b",
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          cursor: "help",
        }}
      >
        ?
      </span>
      <span className="portal-help-tooltip" role="tooltip">
        {text}
      </span>
    </span>
  );
}
