/**
 * RedemptionPage — 兑换中心
 *
 * Features:
 * - Voucher code input + redeem button
 * - Redemption history table
 * - Toast feedback
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import { HelpIcon, Table, ColumnDef, StatusBadge, EmptyState } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

interface RedemptionRecord {
  id: string;
  code: string;
  amount: string;
  type: string;
  status: "success" | "expired" | "used" | "pending";
  usedTime: string;
}

const MOCK_RECORDS: RedemptionRecord[] = [
  { id: "1", code: "3CLOUD-ABCD-EFGH-IJKL", amount: "¥50.00", type: "充值代金券", status: "success", usedTime: "2026-08-05 14:30" },
  { id: "2", code: "3CLOUD-MNOP-QRST-UVWX", amount: "¥20.00", type: "新人礼券", status: "success", usedTime: "2026-08-01 10:00" },
  { id: "3", code: "3CLOUD-YZ01-2345-6789", amount: "¥100.00", type: "活动奖励", status: "expired", usedTime: "2026-07-15 09:00" },
  { id: "4", code: "3CLOUD-WELCOME-2026", amount: "¥30.00", type: "注册奖励", status: "used", usedTime: "2026-07-28 16:20" },
];

const columns: ColumnDef<RedemptionRecord>[] = [
  { key: "code", title: "兑换码", dataIndex: "code", render: (v) => (
    <span style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      {String(v)}
    </span>
  )},
  { key: "amount", title: "金额", dataIndex: "amount", render: (v) => (
    <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{String(v)}</span>
  )},
  { key: "type", title: "类型", dataIndex: "type" },
  { key: "status", title: "状态", dataIndex: "status", render: (v) => {
    const statusMap: Record<string, { status: "success" | "warning" | "danger" | "default"; text: string }> = {
      success: { status: "success", text: "已到账" },
      expired: { status: "danger", text: "已过期" },
      used: { status: "warning", text: "已使用" },
      pending: { status: "warning", text: "处理中" },
    };
    const s = statusMap[String(v)] || { status: "default" as const, text: String(v) };
    return <StatusBadge status={s.status} variant="pill">{s.text}</StatusBadge>;
  }},
  { key: "usedTime", title: "使用时间", dataIndex: "usedTime" },
];

export default function RedemptionPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [records] = useState<RedemptionRecord[]>(MOCK_RECORDS);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">("info");
  const [toastShow, setToastShow] = useState(false);

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2500);
  }, []);

  const handleRedeem = useCallback(async () => {
    if (!code.trim()) {
      showToast("请输入兑换码", "error");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    if (code.includes("EXPIRED")) {
      showToast("兑换码已过期", "error");
    } else if (code.includes("USED")) {
      showToast("兑换码已被使用", "error");
    } else {
      showToast("兑换成功！金额已到账", "success");
      setCode("");
    }
    setLoading(false);
  }, [code, showToast]);

  return (
    <>
      <PortalTopbar title="兑换中心" helpHint="输入兑换码获取代金券或充值金额，支持活动码和新手礼券" />

      {/* Redemption Input */}
      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        padding: 24, boxShadow: "var(--shadow-panel)", marginBottom: 20,
      }}>
        <h3 style={{
          fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)",
          marginBottom: 6, display: "flex", alignItems: "center", gap: 6,
        }}>
          🎁 兑换码
          <HelpIcon text="输入您获得的兑换码，金额将直接到账到您的账户余额" />
        </h3>
        <p style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)", marginBottom: 20 }}>
          输入活动兑换码、新人礼券或代金券代码，兑换金额将直接到账。
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <input
            type="text"
            placeholder="请输入兑换码，如：3CLOUD-XXXX-XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{
              flex: 1, height: 44, border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)", padding: "0 16px",
              fontSize: "var(--font-size-base)", background: "var(--color-panel)",
              color: "var(--color-text)", outline: "none",
              fontFamily: "var(--font-family-mono)",
              transition: "border var(--transition-fast)",
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleRedeem(); }}
          />
          <button
            onClick={handleRedeem}
            disabled={loading}
            style={{
              height: 44, padding: "0 32px", borderRadius: "var(--radius-lg)",
              background: loading ? "#a0b4f9" : "var(--color-primary)",
              color: "#fff", border: "none", fontSize: "var(--font-size-base)",
              fontWeight: 500, cursor: loading ? "not-allowed" : "pointer",
              transition: "background var(--transition-fast)",
            }}
          >
            {loading ? "兑换中…" : "兑换"}
          </button>
        </div>
      </div>

      {/* Redemption Records */}
      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-panel)", overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{
            fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            📋 兑换记录
            <HelpIcon text="查看您所有的兑换历史记录" />
          </h3>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            共 {records.length} 条记录
          </span>
        </div>
        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          emptyText="暂无兑换记录"
        />
      </div>

      {/* Toast */}
      {toastShow && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "10px 20px", borderRadius: "var(--radius-lg)",
          fontSize: "var(--font-size-md)",
          background: toastType === "success" ? "var(--color-success-bg)" :
                      toastType === "error" ? "var(--color-danger-bg)" :
                      "var(--color-primary-light)",
          color: toastType === "success" ? "var(--color-success-text)" :
                  toastType === "error" ? "var(--color-danger-text)" :
                  "var(--color-primary)",
          border: `1px solid ${
            toastType === "success" ? "var(--color-success-border)" :
            toastType === "error" ? "var(--color-danger-border)" :
            "rgba(79,110,247,0.3)"}`,
          boxShadow: "var(--shadow-toast)",
          transform: "translateY(0)", opacity: 1,
          transition: "all 0.3s",
        }}>
          {toastMsg}
        </div>
      )}
    </>
  );
}
