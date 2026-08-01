import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface Ann {
  id: number;
  title: string;
  content: string;
  type: string;
  type_label: string;
  priority: number;
  is_read: boolean;
  created_at: string;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const TYPE_BADGE: Record<string, string> = {
  system_announcement: "#dbeafe",
  maintenance: "#fef3c7",
  activity: "#dcfce7",
  security: "#fee2e2",
};

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const listQ = useQuery({
    queryKey: ["me-announcements"],
    queryFn: async () => (await api.get<{ data: { list: Ann[] } }>("/me/announcements")).data.data,
  });
  const unreadQ = useQuery({
    queryKey: ["me-announcements-unread"],
    queryFn: async () => (await api.get<{ data: { unread: number } }>("/me/announcements/unread-count")).data.data,
  });
  const readMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/me/announcements/${id}/read`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-announcements"] }); qc.invalidateQueries({ queryKey: ["me-announcements-unread"] }); },
  });
  const readAllMut = useMutation({
    mutationFn: async () => (await api.post("/me/announcements/read-all")).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-announcements"] }); qc.invalidateQueries({ queryKey: ["me-announcements-unread"] }); },
  });

  const markRead = (id: number) => { if (!(listQ.data?.list?.find(x => x.id === id)?.is_read)) readMut.mutate(id); };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>公告</h2>
        {unreadQ.data?.unread ? <span style={{ marginLeft: 12, background: "#dc2626", color: "#fff", padding: "2px 10px", borderRadius: 10, fontSize: 12 }}>{unreadQ.data.unread} 条未读</span> : null}
        <button onClick={() => readAllMut.mutate()} style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 600 }}>全部已读</button>
      </div>

      <div style={card}>
        {listQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (listQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无公告</div>
        ) : (
          listQ.data?.list.map((a) => (
            <div key={a.id} onClick={() => markRead(a.id)} style={{ padding: "16px 0", borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!a.is_read && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626" }} />}
                <span style={{ background: TYPE_BADGE[a.type] ?? "#f1f5f9", color: "#475569", padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>{a.type_label}</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: a.is_read ? "#475569" : "#0f172a" }}>{a.title}</span>
                <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12 }}>{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <div style={{ marginTop: 8, color: "#64748b", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{a.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
