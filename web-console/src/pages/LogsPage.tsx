import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

interface CallLog {
  id: number;
  provider: string | null;
  upstream_model: string | null;
  request_tokens: number;
  response_tokens: number;
  total_tokens: number;
  cost_cents: number;
  status: string;
  error_code: string | null;
  latency_ms: number | null;
  created_at: string;
}

export default function LogsPage() {
  const { data, isLoading } = useQuery<{ list: CallLog[] }>({
    queryKey: ["me-logs"],
    queryFn: async () => (await api.get("/me/logs")).data,
    refetchInterval: 10000,
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 8 }}>调用日志</h2>
      <p style={{ color: "#64748b", marginBottom: 20, fontSize: 14 }}>最近 {data?.list.length ?? 0} 条 API 调用记录</p>

      {isLoading ? (
        <div>加载中...</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: 12 }}>时间</th>
                <th style={{ padding: 12 }}>供应商</th>
                <th style={{ padding: 12 }}>模型</th>
                <th style={{ padding: 12 }}>Tokens</th>
                <th style={{ padding: 12 }}>费用</th>
                <th style={{ padding: 12 }}>延迟</th>
                <th style={{ padding: 12 }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {data?.list.map((log) => (
                <tr key={log.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: 12, fontSize: 13, color: "#475569" }}>{new Date(log.created_at).toLocaleString()}</td>
                  <td style={{ padding: 12 }}>{log.provider ?? "-"}</td>
                  <td style={{ padding: 12, fontFamily: "monospace", fontSize: 13 }}>{log.upstream_model ?? "-"}</td>
                  <td style={{ padding: 12 }}>{log.total_tokens}</td>
                  <td style={{ padding: 12 }}>¥{(log.cost_cents / 100).toFixed(4)}</td>
                  <td style={{ padding: 12 }}>{log.latency_ms != null ? `${log.latency_ms}ms` : "-"}</td>
                  <td style={{ padding: 12 }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        background: log.status === "success" ? "#dcfce7" : "#fee2e2",
                        color: log.status === "success" ? "#166534" : "#991b1b",
                      }}
                    >
                      {log.status}
                      {log.error_code ? ` (${log.error_code})` : ""}
                    </span>
                  </td>
                </tr>
              ))}
              {data?.list.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>暂无调用记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
