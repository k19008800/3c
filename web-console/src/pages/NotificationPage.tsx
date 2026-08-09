import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";

/**
 * 通知中心 — 门户端通知页面
 *
 * 原型参考: kb/3cloud/prototypes/portal-notification.html
 *
 * 两个 Tab:
 * - 通知列表：分类筛选（全部/系统公告/安全/消费/工单）、已读/未读、详情弹窗、"全部已读"
 * - 通知设置：各类型通知的站内信（锁定开启）/ 邮件（可切换）
 */

/* ---------- types ---------- */

interface NotificationItem {
  id: number;
  category: "system" | "security" | "consume" | "ticket";
  category_label: string;
  icon: string;
  title: string;
  desc: string;
  body_html: string;
  created_at: string;
  is_read: boolean;
  action?: string;
  action_target?: string;
}

interface NotificationPref {
  site: boolean;  // 站内信 — 始终 true（后端强制）
  email: boolean;
}

interface NotificationSettings {
  types: Record<string, { label: string; icon: string; desc: string }>;
  prefs: Record<string, NotificationPref>;
}

interface ListResponse {
  list: NotificationItem[];
  total: number;
  unread: number;
}

/* ---------- constants ---------- */

const CATEGORY_TABS = [
  { value: "all", label: "全部", icon: null },
  { value: "system", label: "系统公告", icon: "📢" },
  { value: "security", label: "安全", icon: "🔒" },
  { value: "consume", label: "消费", icon: "💰" },
  { value: "ticket", label: "工单", icon: "🎫" },
] as const;

const ACTION_TARGET_MAP: Record<string, string> = {
  system: "查看系统公告",
  recharge: "前往充值页面",
  security: "前往安全设置",
  ticket: "前往工单中心",
  apikey: "前往 API Key 管理",
  invoice: "前往发票管理",
};

/* ---------- styles ---------- */

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, marginBottom: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnGhost: React.CSSProperties = { padding: "8px 14px", borderRadius: 6, border: "1px solid #d9d9d9", background: "#fff", color: "#333", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" };
const btnPrimary: React.CSSProperties = { padding: "8px 20px", borderRadius: 6, border: "none", background: "#4f6ef7", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" };

function getIconStyle(cat: string): React.CSSProperties {
  const colors: Record<string, string> = {
    system: "#4f6ef7", security: "#ef5350", consume: "#ffa726", ticket: "#66bb6a",
  };
  return {
    width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 18, flexShrink: 0,
    background: `${colors[cat] || "#4f6ef7"}20`, color: colors[cat] || "#4f6ef7",
  };
}

function formatDate(d: string) {
  return new Date(d).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function NotificationPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  /* ---------- state ---------- */
  const [viewTab, setViewTab] = useState<"list" | "settings">("list");
  const [catFilter, setCatFilter] = useState("all");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  /* ---------- queries ---------- */

  const listQ = useQuery({
    queryKey: ["me-notifications", catFilter, page],
    queryFn: async () =>
      (await api.get<{ data: ListResponse }>("/me/notifications", {
        params: { category: catFilter === "all" ? undefined : catFilter, page, page_size: 50 },
      })).data.data,
  });

  const settingsQ = useQuery({
    queryKey: ["me-notification-settings"],
    queryFn: async () =>
      (await api.get<{ data: NotificationSettings }>("/me/notification-settings")).data.data,
  });

  /* ---------- mutations ---------- */

  const markReadMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/me/notifications/${id}/read`, {})).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me-notifications"] }); },
    // silent, no toast
  });

  const markAllReadMut = useMutation({
    mutationFn: async () => (await api.post("/me/notifications/read-all", {})).data,
    onSuccess: () => {
      toast.success("已标记全部为已读");
      qc.invalidateQueries({ queryKey: ["me-notifications"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const toggleEmailMut = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) =>
      (await api.post(`/me/notification-settings/${type}/email`, { enabled })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me-notification-settings"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* ---------- detail modal item ---------- */

  const detailItem = detailId
    ? listQ.data?.list?.find((n) => n.id === detailId) ?? null
    : null;

  return (
    <div>
      {/* header */}
      <h2 style={{ margin: "0 0 20px", display: "flex", alignItems: "center", gap: 8 }}>
        通知中心
        <HelpIcon text="查看系统公告、安全告警、消费提醒、工单回复等通知。可在「通知设置」中配置各类通知的接收渠道。站内信默认开启且不可关闭。" level="page" />
      </h2>

      {/* view tabs */}
      <div style={{ display: "flex", gap: 4, background: "#f5f5f5", borderRadius: 8, padding: 3, marginBottom: 20, width: "fit-content" }}>
        {(["list", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setViewTab(t)}
            style={{
              padding: "8px 24px", borderRadius: 6, border: "none",
              background: viewTab === t ? "#eef1ff" : "transparent",
              color: viewTab === t ? "#4f6ef7" : "#666",
              fontSize: 14, cursor: "pointer", fontWeight: viewTab === t ? 500 : 400,
            }}
          >
            {t === "list" ? "通知列表" : "通知设置"}
          </button>
        ))}
      </div>

      {/* ── NOTIFICATION LIST ── */}
      {viewTab === "list" && (
        <div style={card}>
          {/* category tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #eee" }}>
            {CATEGORY_TABS.map((c) => (
              <div
                key={c.value}
                onClick={() => { setCatFilter(c.value); setPage(1); }}
                style={{
                  padding: "10px 20px", fontSize: 13, color: catFilter === c.value ? "#4f6ef7" : "#666",
                  cursor: "pointer", borderBottom: catFilter === c.value ? "2px solid #4f6ef7" : "2px solid transparent",
                  fontWeight: catFilter === c.value ? 500 : 400,
                }}
              >
                {c.label}
              </div>
            ))}
          </div>

          {/* action bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid #eee" }}>
            <span style={{ fontSize: 13, color: "#888" }}>
              {(listQ.data?.unread ?? 0) > 0 ? `${listQ.data?.unread} 条未读` : "全部已读"}
            </span>
            <button
              style={btnGhost}
              onClick={() => {
                if ((listQ.data?.unread ?? 0) === 0) { toast.error("没有未读通知"); return; }
                markAllReadMut.mutate();
              }}
            >
              ✓ 全部已读
              <HelpIcon text="将所有未读通知标记为已读" level="button" />
            </button>
          </div>

          {/* notification list */}
          {listQ.isLoading ? (
            <div style={{ padding: 20 }}><SkeletonGroup lines={5} /></div>
          ) : (listQ.data?.list?.length ?? 0) === 0 ? (
            <EmptyState icon="🔔" title={catFilter === "all" ? "暂无通知" : `暂无${CATEGORY_TABS.find(c => c.value === catFilter)?.label || ""}通知`} description="当有新的通知时会显示在这里" />
          ) : (
            <div>
              {listQ.data!.list.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    setDetailId(n.id);
                    if (!n.is_read) markReadMut.mutate(n.id);
                  }}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 20px",
                    borderBottom: "1px solid #f5f5f5", cursor: "pointer",
                    position: "relative", opacity: n.is_read ? 0.7 : 1,
                  }}
                >
                  {!n.is_read && (
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 6, height: 6, borderRadius: "50%", background: "#4f6ef7" }} />
                  )}
                  <div style={{ ...getIconStyle(n.category), marginLeft: 8 }}>{n.icon || "📢"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: n.is_read ? 400 : 600,
                      color: n.is_read ? "#999" : "#333", marginBottom: 4,
                    }}>
                      {n.title}
                      <span style={{
                        display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11, marginLeft: 8,
                        ...getIconStyle(n.category), width: "auto", height: "auto",
                      }}>
                        {n.category_label}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {n.desc}
                    </div>
                    <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{formatDate(n.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── NOTIFICATION SETTINGS ── */}
      {viewTab === "settings" && (
        <div style={card}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              通知偏好设置
              <HelpIcon text="配置各类通知的接收渠道。站内信默认开启且不可关闭，确保重要通知不会遗漏。" level="page" />
            </h3>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {settingsQ.isLoading ? (
              <SkeletonGroup lines={5} />
            ) : settingsQ.data ? (
              Object.entries(settingsQ.data.types).map(([typeKey, typeInfo]) => {
                const pref = settingsQ.data.prefs[typeKey] ?? { site: true, email: true };
                return (
                  <div key={typeKey} style={{ marginBottom: 24 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 600, color: "#333", margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 6 }}>
                      {typeInfo.icon} {typeInfo.label}
                      <HelpIcon text={typeInfo.desc} level="button" />
                    </h4>

                    {/* site channel (locked ON) */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f5f5f5" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#333" }}>站内信</div>
                        <div style={{ fontSize: 12, color: "#888" }}>在通知中心显示，无法关闭</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{ fontSize: 12, color: "#888", minWidth: 50, textAlign: "center" }}>站内信</span>
                        <div style={{ position: "relative", width: 40, height: 22 }}>
                          <div style={{ position: "absolute", inset: 0, background: "#4f6ef740", borderRadius: 11 }}>
                            <div style={{ position: "absolute", width: 18, height: 18, left: 20, top: 2, background: "#4f6ef7", borderRadius: "50%", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                          </div>
                          <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 10, color: "#888", pointerEvents: "none" }}>🔒</span>
                        </div>
                      </div>
                    </div>

                    {/* email channel (toggle-able) */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f5f5f5" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "#333" }}>邮件通知</div>
                        <div style={{ fontSize: 12, color: "#888" }}>发送至注册邮箱</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <span style={{ fontSize: 12, color: "#888", minWidth: 50, textAlign: "center" }}>邮件</span>
                        <div
                          onClick={() => toggleEmailMut.mutate({ type: typeKey, enabled: !pref.email })}
                          style={{
                            position: "relative", width: 40, height: 22, cursor: "pointer",
                            opacity: toggleEmailMut.isPending ? 0.6 : 1,
                          }}
                        >
                          <div style={{
                            position: "absolute", inset: 0, borderRadius: 11, transition: "background .2s",
                            background: pref.email ? "#4f6ef740" : "#d9d9d9",
                          }}>
                            <div style={{
                              position: "absolute", width: 18, height: 18, top: 2, borderRadius: "50%",
                              transition: "transform .2s, background .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                              left: pref.email ? 20 : 2, background: pref.email ? "#4f6ef7" : "#fff",
                            }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <EmptyState icon="⚙️" title="暂无通知设置" description="请稍后再试" />
            )}
          </div>
        </div>
      )}

      {/* ── DETAIL MODAL ── */}
      {detailItem && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex",
            alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setDetailId(null)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 12, width: 540, maxWidth: "90vw", maxHeight: "80vh",
              overflowY: "auto", border: "1px solid #eee", boxShadow: "0 2px 12px rgba(0,0,0,.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* modal header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span>{detailItem.icon || "📢"}</span>
                {detailItem.title}
                <span style={{
                  ...getIconStyle(detailItem.category), width: "auto", height: "auto",
                  display: "inline-block", padding: "1px 8px", borderRadius: 10, fontSize: 11,
                }}>
                  {detailItem.category_label}
                </span>
              </h3>
              <button
                onClick={() => setDetailId(null)}
                style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* modal body */}
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>📅 {formatDate(detailItem.created_at)}</div>
              <div
                style={{ fontSize: 14, lineHeight: 1.8, color: "#333" }}
                dangerouslySetInnerHTML={{ __html: detailItem.body_html }}
              />
            </div>

            {/* modal footer */}
            <div style={{ padding: "16px 20px", borderTop: "1px solid #eee", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button style={btnGhost} onClick={() => setDetailId(null)}>关闭</button>
              {detailItem.action && detailItem.action_target && (
                <button
                  style={btnPrimary}
                  onClick={() => {
                    toast.success(`即将跳转：${ACTION_TARGET_MAP[detailItem.action_target!] || detailItem.action_target}`);
                    setDetailId(null);
                  }}
                >
                  {detailItem.action} →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
