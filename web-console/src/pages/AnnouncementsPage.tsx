import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, SkeletonGroup, EmptyState, useToast } from "@3cloud/shared-ui";

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
const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  system_announcement: { bg: "var(--color-bg)", color: "var(--color-primary)" },
  maintenance: { bg: "var(--color-warning-bg)", color: "var(--color-warning-text)" },
  activity: { bg: "var(--color-success-bg)", color: "var(--color-success-text)" },
  security: { bg: "var(--color-danger-bg)", color: "var(--color-danger-text)" },
};

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const listQ = useQuery({
    queryKey: ["me-announcements"],
    queryFn: async () =>
      (await api.get<{ data: { list: Ann[] } }>("/me/announcements")).data.data,
  });
  const unreadQ = useQuery({
    queryKey: ["me-announcements-unread"],
    queryFn: async () =>
      (await api.get<{ data: { unread: number } }>("/me/announcements/unread-count")).data.data,
  });
  const readMut = useMutation({
    mutationFn: async (id: number) =>
      (await api.post(`/me/announcements/${id}/read`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-announcements"] });
      qc.invalidateQueries({ queryKey: ["me-announcements-unread"] });
    },
  });
  const readAllMut = useMutation({
    mutationFn: async () => (await api.post("/me/announcements/read-all")).data,
    onSuccess: () => {
      toast.success("全部标记为已读");
      qc.invalidateQueries({ queryKey: ["me-announcements"] });
      qc.invalidateQueries({ queryKey: ["me-announcements-unread"] });
    },
  });

  const markRead = (id: number) => {
    if (!listQ.data?.list?.find((x) => x.id === id)?.is_read) readMut.mutate(id);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>
          公告
          <HelpIcon text="查看平台发布的系统公告、维护通知、活动信息和安全提醒。点击公告可标记为已读。" level="page" />
        </h2>
        {unreadQ.data?.unread ? (
          <span
            style={{
              marginLeft: 12,
              background: "var(--color-danger-text)",
              color: "#fff",
              padding: "2px 10px",
              borderRadius: 10,
              fontSize: 12,
            }}
          >
            {unreadQ.data.unread} 条未读
          </span>
        ) : null}
        <button
          onClick={() => readAllMut.mutate()}
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid var(--color-border)",
            background: "#fff",
            color: "var(--color-text)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          全部已读
        </button>
      </div>

      <div style={card}>
        {listQ.isLoading ? (
          <SkeletonGroup lines={5} />
        ) : (listQ.data?.list?.length ?? 0) === 0 ? (
          <EmptyState icon="📢" title="暂无公告" description="当前没有公告信息" />
        ) : (
          listQ.data?.list.map((a) => {
            const badge = TYPE_BADGE[a.type] ?? { bg: "var(--color-bg)", color: "var(--color-text-secondary)" };
            return (
              <div
                key={a.id}
                onClick={() => markRead(a.id)}
                style={{
                  padding: "16px 0",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {!a.is_read && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "var(--color-danger-text)",
                      }}
                    />
                  )}
                  <span
                    style={{
                      background: badge.bg,
                      color: badge.color,
                      padding: "2px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  >
                    {a.type_label}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 15,
                      color: a.is_read ? "var(--color-text)" : "var(--color-text)",
                    }}
                  >
                    {a.title}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      color: "var(--color-text-secondary)",
                      fontSize: 12,
                    }}
                  >
                    {new Date(a.created_at).toLocaleString()}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 8,
                    color: "var(--color-text-secondary)",
                    fontSize: 14,
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {a.content}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
