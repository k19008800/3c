import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 我的数据导出（SPEC-§33.3 GDPR 数据可携带权）
 * 用户可申请导出自己的全部数据，管理员审核后生成 ZIP 下载
 */

interface ExportRequest {
  id: number;
  requested_at: string;
  status: string;
  file_size_bytes: number | null;
  file_count: number | null;
  reject_reason: string | null;
  error_message: string | null;
  processed_at: string | null;
  deadline: string | null;
}

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const btnBase: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14 };
const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#fef3c7", color: "#92400e", label: "待处理" },
  processing: { bg: "#dbeafe", color: "#1e40af", label: "处理中" },
  completed: { bg: "#dcfce7", color: "#166534", label: "已完成" },
  failed: { bg: "#fee2e2", color: "#991b1b", label: "失败" },
  rejected: { bg: "#f1f5f9", color: "#64748b", label: "已拒绝" },
  overdue: { bg: "#fee2e2", color: "#991b1b", label: "已过期" },
};

const dumpTypes = [
  { key: "personal", label: "个人资料" },
  { key: "api_keys", label: "API Key 列表" },
  { key: "call_logs", label: "调用日志" },
  { key: "recharge", label: "充值记录" },
  { key: "transactions", label: "交易记录" },
  { key: "invoices", label: "发票记录" },
  { key: "balance", label: "余额变动" },
  { key: "agent", label: "代理信息" },
  { key: "devices", label: "设备/登录历史" },
  { key: "notification", label: "通知偏好" },
  { key: "consent", label: "协议同意历史" },
];

export default function ConsentPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const requestsQ = useQuery({
    queryKey: ["me-data-export"],
    queryFn: async () => (await api.get<{ data: { list: ExportRequest[] } }>("/me/data-export/requests")).data.data.list,
  });

  const requestMut = useMutation({
    mutationFn: async () => (await api.post("/me/data-export/request", {})).data,
    onSuccess: (d: any) => {
      if (d.data?.ok) {
        setNotice({ type: "ok", msg: "导出申请已提交，管理员将在 24 小时内处理" });
      } else {
        setNotice({ type: "err", msg: d.data?.message || "已有待处理的导出请求" });
      }
      qc.invalidateQueries({ queryKey: ["me-data-export"] });
    },
    onError: (e: any) => setNotice({ type: "err", msg: extractError(e) }),
  });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        我的数据导出{" "}
        <span
          style={{ fontSize: 13, color: "#94a3b8", cursor: "help" }}
          title="您可申请导出在本平台的全部数据（个人资料/API Key/调用日志/充值/交易/发票等），满足 GDPR 数据可携带权。管理员审核通过后会生成 ZIP 文件供下载，链接 7 天内有效。"
        >
          [?]
        </span>
      </h2>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>申请后管理员将在 24 小时内处理；处理完成会通过邮箱发送下载链接。</div>

      {notice && (
        <div
          style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 14,
            background: notice.type === "ok" ? "#dcfce7" : "#fee2e2",
            color: notice.type === "ok" ? "#166534" : "#991b1b",
          }}
        >
          {notice.msg}
        </div>
      )}

      {/* 申请导出 */}
      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>申请导出</h3>
        <div style={{ fontSize: 13, color: "#475569", marginBottom: 14 }}>
          可导出的数据：
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {dumpTypes.map((t) => (
              <span
                key={t.key}
                style={{ background: "#f1f5f9", padding: "4px 10px", borderRadius: 999, fontSize: 12, color: "#334155" }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => requestMut.mutate()}
          disabled={requestMut.isPending}
          style={{ ...btnBase, background: "#2563eb", color: "#fff", opacity: requestMut.isPending ? 0.6 : 1 }}
        >
          {requestMut.isPending ? "提交中..." : "申请导出"}
        </button>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>导出后将以 ZIP 格式提供下载，链接 7 天有效；处理期限最长 30 天（GDPR 合规）。</div>
      </div>

      {/* 导出记录 */}
      <div style={card}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>
          导出记录{" "}
          <span style={{ fontSize: 13, color: "#94a3b8", cursor: "help" }} title="查看您提交的数据导出请求及处理状态。完成状态可下载 ZIP，失败可重新申请。">
            [?]
          </span>
        </h3>
        {requestsQ.isLoading ? (
          <div style={{ color: "#64748b", fontSize: 14 }}>加载中...</div>
        ) : requestsQ.data?.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 14 }}>暂无导出记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>请求ID</th>
                <th style={{ padding: "8px" }}>申请时间</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>文件</th>
                <th style={{ padding: "8px" }}>拒绝原因</th>
              </tr>
            </thead>
            <tbody>
              {requestsQ.data?.map((r) => {
                const st = STATUS_STYLE[r.status] ?? { bg: "#f1f5f9", color: "#475569", label: r.status };
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px" }}>#{r.id}</td>
                    <td style={{ padding: "8px", color: "#475569" }}>{new Date(r.requested_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ background: st.bg, color: st.color, padding: "3px 8px", borderRadius: 6, fontSize: 12 }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: "8px", color: "#475569" }}>
                      {r.status === "completed" && r.file_size_bytes ? `${(r.file_size_bytes / 1024).toFixed(1)} KB / ${r.file_count} 文件` : "—"}
                    </td>
                    <td style={{ padding: "8px", color: "#b91c1c" }}>{r.reject_reason ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
