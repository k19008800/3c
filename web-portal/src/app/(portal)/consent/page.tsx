/**
 * ConsentPage — 协议与数据管理
 *
 * Features:
 * - Privacy policy / Terms of service version management
 * - Export task list (reuse pattern from deletion page)
 * - Consent history
 */
"use client";

import { useState, useCallback } from "react";
import { HelpIcon, StatusBadge, Table, ColumnDef } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

interface PolicyVersion {
  id: string;
  type: "privacy" | "terms";
  title: string;
  version: string;
  effectiveDate: string;
  agreedAt: string | null;
}

interface ConsentRecord {
  id: string;
  policy: string;
  action: string;
  timestamp: string;
  ip: string;
}

const MOCK_POLICIES: PolicyVersion[] = [
  { id: "1", type: "privacy", title: "隐私政策", version: "v2.3", effectiveDate: "2026-08-01", agreedAt: "2026-08-01 09:30" },
  { id: "2", type: "terms", title: "服务条款", version: "v2.0", effectiveDate: "2026-07-15", agreedAt: "2026-07-15 10:00" },
  { id: "3", type: "privacy", title: "隐私政策", version: "v2.2", effectiveDate: "2026-06-01", agreedAt: "2026-06-02 14:20" },
];

const MOCK_RECORDS: ConsentRecord[] = [
  { id: "1", policy: "隐私政策 v2.3", action: "同意", timestamp: "2026-08-01 09:30", ip: "192.168.1.1" },
  { id: "2", policy: "服务条款 v2.0", action: "同意", timestamp: "2026-07-15 10:00", ip: "192.168.1.1" },
  { id: "3", policy: "隐私政策 v2.2", action: "同意", timestamp: "2026-06-02 14:20", ip: "192.168.1.1" },
  { id: "4", policy: "Cookie 声明", action: "同意", timestamp: "2026-05-20 08:00", ip: "192.168.1.1" },
];

const policyColumns: ColumnDef<PolicyVersion>[] = [
  { key: "title", title: "协议名称", dataIndex: "title", render: (v, r) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span>{String(v)}</span>
      <StatusBadge status={r.type === "privacy" ? "info" : "warning"}>
        {r.type === "privacy" ? "隐私" : "条款"}
      </StatusBadge>
    </div>
  )},
  { key: "version", title: "版本", dataIndex: "version", render: (v) => (
    <span style={{ fontFamily: "var(--font-family-mono)", fontWeight: 600 }}>{String(v)}</span>
  )},
  { key: "effectiveDate", title: "生效日期", dataIndex: "effectiveDate" },
  { key: "agreedAt", title: "同意时间", dataIndex: "agreedAt", render: (v) =>
    v ? <span style={{ color: "var(--color-success-text)" }}>{String(v)}</span> :
         <span style={{ color: "var(--color-danger-text)" }}>待同意</span>
  },
  { key: "action", title: "操作", render: (_, record) => (
    <button style={{
      padding: "4px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
      background: "var(--color-panel)", fontSize: "var(--font-size-sm)", cursor: "pointer",
      color: "var(--color-primary)", transition: "all var(--transition-fast)",
    }}>
      查看全文
    </button>
  )},
];

const recordColumns: ColumnDef<ConsentRecord>[] = [
  { key: "policy", title: "协议", dataIndex: "policy" },
  { key: "action", title: "操作", dataIndex: "action", render: (v) => (
    <StatusBadge status={v === "同意" ? "success" : "warning"}>{String(v)}</StatusBadge>
  )},
  { key: "timestamp", title: "时间", dataIndex: "timestamp" },
  { key: "ip", title: "IP 地址", dataIndex: "ip", render: (v) => (
    <span style={{ fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
      {String(v)}
    </span>
  )},
];

export default function ConsentPage() {
  const [policies] = useState<PolicyVersion[]>(MOCK_POLICIES);
  const [records] = useState<ConsentRecord[]>(MOCK_RECORDS);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContent, setDetailContent] = useState("");
  const [detailTitle, setDetailTitle] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [toastShow, setToastShow] = useState(false);

  const showToast = useCallback(() => {
    setToastShow(true);
    setTimeout(() => setToastShow(false), 2500);
  }, []);

  const handleViewPolicy = useCallback((policy: PolicyVersion) => {
    setDetailTitle(`${policy.title} · ${policy.version}`);
    setDetailContent(`<h3>${policy.title}（${policy.version}）</h3>
<p><strong>生效日期：</strong>${policy.effectiveDate}</p>
<p>这是 ${policy.title} 的完整内容。本文档概述了我们如何收集、使用和保护您的个人信息。</p>
<p>（具体内容由业务团队提供，此处为占位文本）</p>
<p>如有关于本政策的任何疑问，请通过 support@3cloud.ai 与我们联系。</p>`);
    setDetailOpen(true);
  }, []);

  const handleExport = useCallback(async () => {
    setExportLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setExportLoading(false);
    showToast();
  }, [showToast]);

  return (
    <>
      <PortalTopbar title="协议与数据管理" helpHint="查看和管理您的隐私政策同意记录、服务条款版本和数据导出" />

      {/* Policy Versions */}
      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-panel)", overflow: "hidden", marginBottom: 20,
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{
            fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            📜 协议版本
            <HelpIcon text="平台发布的隐私政策和服务条款版本历史" />
          </h3>
        </div>
        <Table
          columns={policyColumns.map((c) => ({
            ...c,
            render: c.key === "action"
              ? (_: unknown, record: PolicyVersion) => (
                  <button
                    style={{
                      padding: "4px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)",
                      background: "var(--color-panel)", fontSize: "var(--font-size-sm)", cursor: "pointer",
                      color: "var(--color-primary)",
                    }}
                    onClick={() => handleViewPolicy(record)}
                  >
                    查看全文
                  </button>
                )
              : c.render,
          }))}
          dataSource={policies}
          rowKey="id"
        />
      </div>

      {/* Consent Records */}
      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        boxShadow: "var(--shadow-panel)", overflow: "hidden", marginBottom: 20,
      }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h3 style={{
            fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            ✅ 同意记录
            <HelpIcon text="您的协议同意历史记录" />
          </h3>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            共 {records.length} 条
          </span>
        </div>
        <Table columns={recordColumns} dataSource={records} rowKey="id" />
      </div>

      {/* Export */}
      <div style={{
        background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
        padding: 24, boxShadow: "var(--shadow-panel)",
      }}>
        <h3 style={{
          fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)",
          marginBottom: 6, display: "flex", alignItems: "center", gap: 6,
        }}>
          📥 导出同意记录
          <HelpIcon text="导出您所有协议的同意历史记录，用于合规审计" />
        </h3>
        <p style={{
          fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)",
          marginBottom: 16,
        }}>
          导出包含所有隐私政策、服务条款和 Cookie 声明的同意记录，导出为 CSV 文件。
        </p>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          style={{
            padding: "10px 24px", borderRadius: "var(--radius-lg)",
            background: exportLoading ? "#a0b4f9" : "var(--color-primary)",
            color: "#fff", border: "none", fontSize: "var(--font-size-base)",
            cursor: exportLoading ? "not-allowed" : "pointer",
            transition: "background var(--transition-fast)",
          }}
        >
          {exportLoading ? "导出中…" : "导出 CSV"}
        </button>
      </div>

      {/* Policy Detail Modal */}
      {detailOpen && (
        <div
          style={{
            position: "fixed", inset: 0, background: "var(--color-modal-overlay)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setDetailOpen(false)}
        >
          <div
            style={{
              background: "var(--color-panel)", borderRadius: "var(--radius-2xl)",
              width: 600, maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto",
              boxShadow: "var(--shadow-modal)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <h3 style={{ fontSize: "var(--font-size-xl)", fontWeight: 600 }}>
                {detailTitle}
              </h3>
              <button onClick={() => setDetailOpen(false)} style={{
                background: "none", border: "none", fontSize: 22, color: "var(--color-text-secondary)", cursor: "pointer",
              }}>×</button>
            </div>
            <div
              style={{ padding: 24, fontSize: "var(--font-size-base)", lineHeight: 1.9, color: "var(--color-text)" }}
              dangerouslySetInnerHTML={{ __html: detailContent }}
            />
            <div style={{ padding: "0 24px 24px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setDetailOpen(false)}
                style={{
                  padding: "10px 24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)",
                  background: "var(--color-panel)", cursor: "pointer", color: "var(--color-text-secondary)",
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastShow && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "10px 20px", borderRadius: "var(--radius-lg)",
          fontSize: "var(--font-size-md)",
          background: "var(--color-success-bg)", color: "var(--color-success-text)",
          border: "1px solid var(--color-success-border)",
          boxShadow: "var(--shadow-toast)",
        }}>
          ✅ 同意记录已导出
        </div>
      )}
    </>
  );
}
