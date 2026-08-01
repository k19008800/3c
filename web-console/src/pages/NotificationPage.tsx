import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface Prefs { [type: string]: { site: boolean; email: boolean } }

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600 };

export default function NotificationPage() {
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const notifQ = useQuery({
    queryKey: ["me-notif"],
    queryFn: async () => (await api.get<{ data: { types: Record<string, string>; prefs: Prefs } }>("/me/notification-subscriptions")).data.data,
  });

  const toggleMut = useMutation({
    mutationFn: async ({ type, channel, enabled }: { type: string; channel: string; enabled: boolean }) => (await api.post(`/me/notification-subscriptions/${type}/${channel}`, { enabled })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-notif"] }); },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
      <h2 style={{ marginBottom: 20 }}>通知设置</h2>
      <div style={card}>
        {notifQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "10px" }}>通知类型</th>
                <th style={{ padding: "10px", textAlign: "center" }}>站内信</th>
                <th style={{ padding: "10px", textAlign: "center" }}>邮件</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(notifQ.data?.types ?? {}).map(([type, label]) => {
                const p = notifQ.data?.prefs[type];
                return (
                  <tr key={type} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px", fontWeight: 500 }}>{label}</td>
                    {(["site", "email"] as const).map((channel) => (
                      <td key={channel} style={{ padding: "10px", textAlign: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={p?.[channel] ?? true}
                            onChange={(e) => toggleMut.mutate({ type, channel, enabled: e.target.checked })}
                            style={{ width: 18, height: 18 }}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>
        控制各类通知推送到站内信或邮件。关闭后该类通知将不再发送。
      </div>

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}<button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}
