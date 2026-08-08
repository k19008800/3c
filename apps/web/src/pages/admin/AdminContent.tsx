import { useState, useEffect } from "react";
import AdminLayout from "../../components/AdminLayout";
import HelpModal from "../../components/HelpModal";
import { apiGet, apiPost, apiPut, apiDelete } from "../../services/api";

// ── Types ──
interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  priority: number;
  status: boolean; // published status
  createdBy: string;
  createdAt: string;
  readCount?: number;
  type_label?: string;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
  start_at: string;
  end_at: string;
  budget_amount: number;
  issued_amount: number;
  participant_count: number;
  status_label: string;
  type_label: string;
  updated_at: string;
}

const TYPE_LABELS: Record<string, { cls: string; label: string }> = {
  system_announcement: { cls: "badge-info", label: "系统公告" },
  maintenance: { cls: "badge-warning", label: "维护通知" },
  activity: { cls: "badge-success", label: "活动通知" },
  security: { cls: "badge-danger", label: "安全告警" },
};

const CAMPAIGN_STATUS_MAP: Record<string, { cls: string; label: string }> = {
  active: { cls: "badge-success", label: "进行中" },
  draft: { cls: "badge-warning", label: "草稿" },
  ended: { cls: "badge-danger", label: "已结束" },
  archived: { cls: "badge-info", label: "已归档" },
};

const PRIORITY_LABELS: Record<number, { cls: string; label: string }> = {
  0: { cls: "badge-info", label: "普通" },
  1: { cls: "badge-warning", label: "重要" },
  2: { cls: "badge-danger", label: "严重" },
};

// ── Component ──
export default function AdminContent() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTab, setActiveTab] = useState<"announce" | "campaign">("announce");
  const [showCreate, setShowCreate] = useState(false);
  const [newAnn, setNewAnn] = useState({
    title: "",
    content: "",
    type: "system_announcement",
    priority: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadAnnouncements = async () => {
    try {
      const data = await apiGet<{ list: Announcement[] }>("/admin/announcements");
      setAnnouncements(data.list.map((a) => ({ ...a, id: String(a.id) })));
    } catch (e: any) {
      setError(e.message || "加载公告失败");
    }
  };

  const loadCampaigns = async () => {
    try {
      const data = await apiGet<{ list: Campaign[]; pagination: any }>("/admin/campaigns");
      setCampaigns(data.list.map((c) => ({ ...c, id: String(c.id) })));
    } catch {
      // campaigns are optional
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([loadAnnouncements(), loadCampaigns()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const togglePublish = async (ann: Announcement) => {
    try {
      await apiPut(`/admin/announcements/${ann.id}`, {
        title: ann.title,
        content: ann.content,
        publish: !ann.status,
      });
      setAnnouncements((prev) =>
        prev.map((a) =>
          a.id === ann.id
            ? { ...a, status: !a.status, createdAt: !a.status ? new Date().toISOString() : a.createdAt }
            : a
        )
      );
    } catch (e: any) {
      alert(e.message || "操作失败");
    }
  };

  const deleteAnnouncement = async (id: string) => {
    if (!confirm("确定删除此公告？")) return;
    try {
      await apiDelete(`/admin/announcements/${id}`);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      alert(e.message || "删除失败");
    }
  };

  const createAnnouncement = async () => {
    if (!newAnn.title.trim() || !newAnn.content.trim()) return;
    setSaving(true);
    try {
      await apiPost("/admin/announcements", {
        title: newAnn.title,
        content: newAnn.content,
        type: newAnn.type,
        priority: newAnn.priority,
        publish: true,
      });
      setNewAnn({ title: "", content: "", type: "system_announcement", priority: 0 });
      setShowCreate(false);
      await loadAnnouncements();
    } catch (e: any) {
      alert(e.message || "创建失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <span className="loading-spinner" /> 加载中…
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="panel" style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <div style={{ color: "var(--color-danger)" }}>{error}</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={loadData}>
            重试
          </button>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <h1 className="page-title">
        内容管理
        <HelpModal title="内容管理">
          <p>管理平台的公告、活动页面和营销内容。</p>
          <p style={{ marginTop: 8 }}>📝 两大模块：</p>
          <ul style={{ paddingLeft: 20, marginTop: 4 }}>
            <li><strong>公告管理</strong>：创建、发布和管理系统公告，支持多种类型和优先级</li>
            <li><strong>活动/营销页面</strong>：查看营销活动效果数据</li>
          </ul>
        </HelpModal>
      </h1>
      <p className="page-subtitle">管理公告、活动页面和营销内容</p>

      {/* Tabs */}
      <div className="filter-tabs mb-16">
        {(["announce", "campaign"] as const).map((tab) => (
          <button
            key={tab}
            className={`filter-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === "announce" ? "公告管理" : "活动/营销页面"}
          </button>
        ))}
      </div>

      {/* Announcements */}
      {activeTab === "announce" && (
        <>
          <div className="flex-between mb-16">
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              共 {announcements.length} 条公告（{announcements.filter((a) => a.status).length} 已发布）
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              + 新建公告
            </button>
          </div>

          {announcements.length === 0 ? (
            <div className="panel" style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📝</div>
              <div style={{ color: "var(--color-text-secondary)" }}>暂无公告</div>
            </div>
          ) : (
            announcements.map((a) => {
              const typeInfo = TYPE_LABELS[a.type] || { cls: "badge-info", label: a.type_label || a.type };
              const priInfo = PRIORITY_LABELS[a.priority] || PRIORITY_LABELS[0];
              return (
                <div key={a.id} className="panel mb-12">
                  <div className="panel-header">
                    <div className="flex-wrap">
                      <strong>{a.title}</strong>
                      <span className={`badge ${typeInfo.cls}`}>{typeInfo.label}</span>
                      <span className={`badge ${priInfo.cls}`}>{priInfo.label}</span>
                      {a.status ? (
                        <span className="badge badge-success">已发布</span>
                      ) : (
                        <span className="badge badge-warning">草稿</span>
                      )}
                    </div>
                    <div className="flex-wrap">
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        {a.createdBy || "—"} · {a.createdAt?.slice(0, 10) || "未发布"}
                        {a.readCount != null && ` · ${a.readCount} 已读`}
                      </span>
                      <button className="btn btn-xs btn-secondary" onClick={() => togglePublish(a)}>
                        {a.status ? "下架" : "发布"}
                      </button>
                      <button className="btn btn-xs btn-secondary" onClick={() => deleteAnnouncement(a.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                  <div className="panel-body">
                    <p style={{ fontSize: 13, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap" }}>
                      {a.content}
                    </p>
                  </div>
                </div>
              );
            })
          )}

          {/* Create Announcement Modal */}
          {showCreate && (
            <div className="modal-overlay" onClick={() => setShowCreate(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
                <div className="modal-header">
                  <h3 style={{ fontSize: 18, fontWeight: 600 }}>新建公告</h3>
                  <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label">公告标题 *</label>
                    <input
                      className="form-input"
                      placeholder="例如：系统维护通知"
                      value={newAnn.title}
                      onChange={(e) => setNewAnn({ ...newAnn, title: e.target.value })}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div className="form-group">
                      <label className="form-label">类型</label>
                      <select
                        className="form-select"
                        value={newAnn.type}
                        onChange={(e) => setNewAnn({ ...newAnn, type: e.target.value })}
                      >
                        <option value="system_announcement">系统公告</option>
                        <option value="maintenance">维护通知</option>
                        <option value="activity">活动通知</option>
                        <option value="security">安全告警</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">优先级</label>
                      <select
                        className="form-select"
                        value={newAnn.priority}
                        onChange={(e) => setNewAnn({ ...newAnn, priority: parseInt(e.target.value) || 0 })}
                      >
                        <option value={0}>普通</option>
                        <option value={1}>重要</option>
                        <option value={2}>严重</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">公告内容 *</label>
                    <textarea
                      className="form-textarea"
                      rows={6}
                      placeholder="输入公告内容…"
                      value={newAnn.content}
                      onChange={(e) => setNewAnn({ ...newAnn, content: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
                  <button
                    className="btn btn-primary"
                    onClick={createAnnouncement}
                    disabled={!newAnn.title.trim() || !newAnn.content.trim() || saving}
                  >
                    {saving ? "发布中…" : "发布公告"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Campaigns / Marketing Pages */}
      {activeTab === "campaign" && (
        <div className="panel">
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>活动名称</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>活动时间</th>
                  <th>预算 (¥)</th>
                  <th>已发放 (¥)</th>
                  <th>参与人数</th>
                  <th>最近更新</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: 60 }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
                      <div style={{ color: "var(--color-text-secondary)" }}>暂无营销活动</div>
                    </td>
                  </tr>
                ) : (
                  campaigns.map((c) => {
                    const statusInfo = CAMPAIGN_STATUS_MAP[c.status] || { cls: "badge-info", label: c.status_label || c.status };
                    return (
                      <tr key={c.id} style={{ opacity: c.status === "ended" || c.status === "archived" ? 0.6 : 1 }}>
                        <td><strong>{c.name}</strong></td>
                        <td>
                          <span className="badge badge-info">{c.type_label || c.type}</span>
                        </td>
                        <td>
                          <span className={`badge ${statusInfo.cls}`}>{statusInfo.label}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {c.start_at ? c.start_at.slice(0, 10) : "—"} ~ {c.end_at ? c.end_at.slice(0, 10) : "—"}
                        </td>
                        <td>¥{c.budget_amount?.toFixed(2) || "0.00"}</td>
                        <td style={{ color: c.issued_amount > 0 ? "var(--color-danger-text)" : undefined }}>
                          ¥{(c.issued_amount || 0).toFixed(2)}
                        </td>
                        <td>{c.participant_count || 0}</td>
                        <td style={{ fontSize: 12 }}>{c.updated_at ? c.updated_at.slice(0, 10) : "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
