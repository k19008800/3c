import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 合规法务管理（SPEC-§33）
 * Tab1 隐私政策 / Tab2 服务条款 / Tab3 数据导出(GDPR)
 */

interface VersionRow {
  id: number;
  version: string;
  title: string | null;
  status: string;
  published_at: string | null;
  revoked_at: string | null;
  summary: string | null;
  consent_count: number;
  pending_count: number;
  consent_rate: number;
}
interface ExportRow {
  id: number;
  user_id: number;
  email: string;
  username: string;
  requested_at: string;
  status: string;
  priority: boolean;
  processed_by: number | null;
  processed_at: string | null;
  file_size_bytes: number | null;
  file_count: number | null;
  part_count: number;
  reject_reason: string | null;
  error_message: string | null;
  deadline: string | null;
  notification_sent: boolean;
}

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const EXPORT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#fef3c7", color: "#92400e", label: "待处理" },
  processing: { bg: "#dbeafe", color: "#1e40af", label: "处理中" },
  completed: { bg: "#dcfce7", color: "#166534", label: "已完成" },
  failed: { bg: "#fee2e2", color: "#991b1b", label: "失败" },
  rejected: { bg: "#f1f5f9", color: "#64748b", label: "已拒绝" },
  overdue: { bg: "#fee2e2", color: "#991b1b", label: "已过期" },
};

const HELP: Record<string, { title: string; body: string }> = {
  privacy: { title: "隐私政策管理", body: "管理平台隐私政策版本。发布新版本后，已注册用户下次登录需重新确认；可查看各版本同意率，支持一键回滚。" },
  tos: { title: "服务条款管理", body: "与服务条款版本一致。条款更新后未确认用户将逐步限制功能（先限制新 API 创建，再限制调用）。" },
  export: { title: "数据导出管理", body: "审核用户的数据导出请求（GDPR 数据可携带权）。审核通过后生成 ZIP 并通知用户，处理期限 30 天，超期自动标记并升级通知。" },
};

export default function AdminConsentPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"privacy" | "tos" | "export">("privacy");
  const [notice, setNotice] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        合规法务管理{" "}
        <span
          style={{ fontSize: 13, color: "#94a3b8", cursor: "help" }}
          title="覆盖隐私政策/服务条款版本管理、用户数据导出（GDPR 数据可携带权）。所有协议变更属敏感操作，全程留审计。"
        >
          [?]
        </span>
      </h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {([["privacy", "隐私政策"], ["tos", "服务条款"], ["export", "数据导出"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              ...btnBase,
              background: tab === k ? "#2563eb" : "#e2e8f0",
              color: tab === k ? "#fff" : "#334155",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 14, fontSize: 14, background: notice.type === "ok" ? "#dcfce7" : "#fee2e2", color: notice.type === "ok" ? "#166534" : "#991b1b" }}>
          {notice.msg}
        </div>
      )}

      {tab === "privacy" && <PolicySection kind="privacy" notice={setNotice} qc={qc} help={HELP.privacy!} />}
      {tab === "tos" && <PolicySection kind="tos" notice={setNotice} qc={qc} help={HELP.tos!} />}
      {tab === "export" && <ExportSection notice={setNotice} qc={qc} help={HELP.export!} />}
    </div>
  );
}

/* ============ 隐私政策 / 服务条款 共用 ============ */
function PolicySection({ kind, notice, qc, help }: { kind: "privacy" | "tos"; notice: (n: { type: "ok" | "err"; msg: string } | null) => void; qc: ReturnType<typeof useQueryClient>; help: { title: string; body: string } }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ version: "", title: "", content: "", summary: "" });
  const [viewId, setViewId] = useState<number | null>(null);

  const endpoint = kind === "privacy" ? "privacy-policy" : "terms-of-service";
  const label = kind === "privacy" ? "隐私政策" : "服务条款";

  const versionsQ = useQuery({
    queryKey: [`admin-${endpoint}`],
    queryFn: async () => (await api.get<{ data: { list: VersionRow[] } }>(`/admin/settings/${endpoint}/versions`)).data.data.list,
  });

  const viewQ = useQuery({
    queryKey: [`admin-${endpoint}-view`, viewId],
    queryFn: async () => {
      const list = versionsQ.data ?? [];
      return list.find((v) => v.id === viewId) ?? null;
    },
    enabled: !!viewId && !!versionsQ.data,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/settings/${endpoint}/versions`, form)).data,
    onSuccess: () => {
      setShowForm(false); setForm({ version: "", title: "", content: "", summary: "" });
      notice({ type: "ok", msg: `已创建${label}草稿` });
      qc.invalidateQueries({ queryKey: [`admin-${endpoint}`] });
    },
    onError: (e: any) => notice({ type: "err", msg: extractError(e) }),
  });

  const publishMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/settings/${endpoint}/versions/${id}/publish`, {})).data,
    onSuccess: (d: any) => {
      notice({ type: "ok", msg: d.message || "已发布" });
      qc.invalidateQueries({ queryKey: [`admin-${endpoint}`] });
    },
    onError: (e: any) => notice({ type: "err", msg: extractError(e) }),
  });

  const rollbackMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/settings/${endpoint}/versions/${id}/rollback`, {})).data,
    onSuccess: (d: any) => {
      notice({ type: "ok", msg: d.message || "已回滚" });
      qc.invalidateQueries({ queryKey: [`admin-${endpoint}`] });
    },
    onError: (e: any) => notice({ type: "err", msg: extractError(e) }),
  });

  return (
    <div>
      <div style={card}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center" }}>
          {label}版本管理{" "}
          <span style={{ fontSize: 13, color: "#94a3b8", cursor: "help", marginLeft: 8 }} title={help.body}>
            [?]
          </span>
        </h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setShowForm(!showForm)} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>
            {showForm ? "取消" : "发布新版本"}
          </button>
        </div>

        {showForm && (
          <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 14, border: "1px solid #e2e8f0" }}>
            <input style={inp} placeholder="版本号（如 v2.1）" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
            <input style={inp} placeholder="标题（可选）" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <textarea
              style={{ ...inp, minHeight: 120, resize: "vertical" }}
              placeholder={`${label}内容（Markdown）`}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <input style={inp} placeholder="变更摘要（可选，展示给用户的更新说明）" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
            <button
              onClick={() => createMut.mutate()}
              disabled={!form.version.trim() || !form.content.trim() || createMut.isPending}
              style={{ ...btnBase, background: "#2563eb", color: "#fff", opacity: !form.version.trim() || !form.content.trim() ? 0.6 : 1 }}
            >
              {createMut.isPending ? "创建中..." : "保存草稿"}
            </button>
          </div>
        )}

        {versionsQ.isLoading ? (
          <div style={{ color: "#64748b" }}>加载中...</div>
        ) : versionsQ.data?.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无版本记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>版本</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>发布时间</th>
                <th style={{ padding: "8px" }}>已同意</th>
                <th style={{ padding: "8px" }}>待同意</th>
                <th style={{ padding: "8px" }}>同意率</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {versionsQ.data?.map((v) => (
                <tr key={v.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{v.version}</td>
                  <td style={{ padding: "8px" }}>
                    <span
                      style={{
                        padding: "3px 8px", borderRadius: 6, fontSize: 12,
                        background: v.status === "published" ? "#dcfce7" : v.status === "revoked" ? "#fee2e2" : "#f1f5f9",
                        color: v.status === "published" ? "#166534" : v.status === "revoked" ? "#991b1b" : "#64748b",
                      }}
                    >
                      {v.status === "published" ? "已发布" : v.status === "revoked" ? "已撤销" : "草稿"}
                    </span>
                  </td>
                  <td style={{ padding: "8px", color: "#475569" }}>{v.published_at ? new Date(v.published_at).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "8px" }}>{v.consent_count}</td>
                  <td style={{ padding: "8px", color: v.pending_count > 0 ? "#b91c1c" : "#475569" }}>{v.status === "published" ? v.pending_count : "—"}</td>
                  <td style={{ padding: "8px" }}>{v.status === "published" ? `${v.consent_rate}%` : "—"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setViewId(v.id)} style={{ ...btnBase, background: "#e2e8f0", color: "#334155", marginRight: 6 }}>查看</button>
                    {v.status === "draft" && (
                      <button
                        onClick={() => publishMut.mutate(v.id)}
                        style={{ ...btnBase, background: "#2563eb", color: "#fff", marginRight: 6 }}
                      >
                        发布
                      </button>
                    )}
                    {(v.status === "published" || v.status === "revoked") && versionsQ.data!.some((x) => x.status === "published" && x.id !== v.id) && (
                      <button
                        onClick={() => rollbackMut.mutate(v.id)}
                        style={{ ...btnBase, background: "#f59e0b", color: "#fff" }}
                      >
                        回滚到此
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 版本内容查看 */}
      {viewId && viewQ.data && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>
              版本 {viewQ.data.version} 内容
              <span style={{ fontSize: 13, color: "#94a3b8", marginLeft: 8, cursor: "help" }} title="查看该版本完整内容。">[?]</span>
            </h3>
            <button onClick={() => setViewId(null)} style={{ ...btnBase, background: "#e2e8f0", color: "#334155" }}>关闭</button>
          </div>
          {viewQ.data.summary && (
            <div style={{ margin: "12px 0", padding: "10px 14px", background: "#fefce8", borderRadius: 8, fontSize: 13, color: "#854d0e" }}>
              变更摘要：{viewQ.data.summary}
            </div>
          )}
          <pre style={{ whiteSpace: "pre-wrap", background: "#f8fafc", padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
            {viewQ.data.title && `${viewQ.data.title}\n\n`}
            {/* 内容接口未暴露，此处展示版本元信息 */}
            版本：{viewQ.data.version} ｜ 状态：{viewQ.data.status === "published" ? "已发布" : viewQ.data.status === "revoked" ? "已撤销" : "草稿"} ｜ 已同意：{viewQ.data.consent_count} 人
          </pre>
        </div>
      )}
    </div>
  );
}

/* ============ 数据导出 ============ */
function ExportSection({ notice, qc, help }: { notice: (n: { type: "ok" | "err"; msg: string } | null) => void; qc: ReturnType<typeof useQueryClient>; help: { title: string; body: string } }) {
  const [statusFilter, setStatusFilter] = useState("");

  const listQ = useQuery({
    queryKey: ["admin-data-export", statusFilter],
    queryFn: async () => {
      const p = statusFilter ? `?status=${statusFilter}` : "";
      return (await api.get<{ data: { list: ExportRow[] } }>(`/admin/data-export/requests${p}`)).data.data.list;
    },
  });
  const statsQ = useQuery({
    queryKey: ["admin-data-export-stats"],
    queryFn: async () => (await api.get<{ data: Record<string, number> }>("/admin/data-export/stats")).data.data,
  });

  const processMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/data-export/${id}/process`, {})).data,
    onSuccess: (d: any) => {
      notice({ type: d.data?.status === "completed" ? "ok" : "err", msg: d.message || "已处理" });
      qc.invalidateQueries({ queryKey: ["admin-data-export"] });
      qc.invalidateQueries({ queryKey: ["admin-data-export-stats"] });
    },
    onError: (e: any) => notice({ type: "err", msg: extractError(e) }),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await api.post(`/admin/data-export/${id}/reject`, { reason })).data,
    onSuccess: () => {
      notice({ type: "ok", msg: "已拒绝" });
      qc.invalidateQueries({ queryKey: ["admin-data-export"] });
      qc.invalidateQueries({ queryKey: ["admin-data-export-stats"] });
    },
    onError: (e: any) => notice({ type: "err", msg: extractError(e) }),
  });

  const resendMut = useMutation({
    mutationFn: async (id: number) => (await api.post(`/admin/data-export/${id}/resend`, {})).data,
    onSuccess: (d: any) => notice({ type: "ok", msg: d.message || (d.data?.notification_sent ? "已发送" : "SMTP 未配置") }),
    onError: (e: any) => notice({ type: "err", msg: extractError(e) }),
  });

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  if (rejectId && listQ.data) {
    const row = listQ.data.find((r) => r.id === rejectId);
    return (
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>拒绝导出请求 #{rejectId}</h3>
        {row && <div style={{ fontSize: 13, color: "#475569", marginBottom: 10 }}>用户：{row.username}（{row.email}）</div>}
        <textarea
          style={{ ...inp, minHeight: 80, resize: "vertical" }}
          placeholder="拒绝原因（必填，将通知用户）"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => rejectMut.mutate({ id: rejectId, reason: rejectReason })}
            disabled={!rejectReason.trim()}
            style={{ ...btnBase, background: "#dc2626", color: "#fff", opacity: !rejectReason.trim() ? 0.6 : 1 }}
          >
            确认拒绝
          </button>
          <button onClick={() => setRejectId(null)} style={{ ...btnBase, background: "#e2e8f0", color: "#334155" }}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={card}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center" }}>
          数据导出请求管理{" "}
          <span style={{ fontSize: 13, color: "#94a3b8", cursor: "help", marginLeft: 8 }} title={help.body}>
            [?]
          </span>
        </h3>

        {statsQ.data && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.entries(statsQ.data).map(([k, v]) => {
              const s = EXPORT_STYLE[k] ?? { bg: "#f1f5f9", color: "#475569", label: k };
              return (
                <span key={k} style={{ background: s.bg, color: s.color, padding: "4px 12px", borderRadius: 999, fontSize: 12 }}>
                  {s.label} {v}
                </span>
              );
            })}
          </div>
        )}

        <select style={{ ...inp, width: 180, marginBottom: 12 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          <option value="pending">待处理</option>
          <option value="processing">处理中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="rejected">已拒绝</option>
          <option value="overdue">已过期</option>
        </select>

        {listQ.isLoading ? (
          <div style={{ color: "#64748b" }}>加载中...</div>
        ) : listQ.data?.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无导出请求</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e2e8f0", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>ID</th>
                <th style={{ padding: "8px" }}>用户</th>
                <th style={{ padding: "8px" }}>申请时间</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>文件</th>
                <th style={{ padding: "8px" }}>期限</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {listQ.data?.map((r) => {
                const st = EXPORT_STYLE[r.status] ?? { bg: "#f1f5f9", color: "#475569", label: r.status };
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px" }}>#{r.id}</td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{r.username}</div>
                      <div style={{ color: "#64748b", fontSize: 12 }}>{r.email}</div>
                    </td>
                    <td style={{ padding: "8px", color: "#475569" }}>{new Date(r.requested_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ background: st.bg, color: st.color, padding: "3px 8px", borderRadius: 6, fontSize: 12 }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "8px", color: "#475569" }}>
                      {r.status === "completed" && r.file_size_bytes ? `${(r.file_size_bytes / 1024).toFixed(1)} KB / ${r.file_count} 文件` : r.error_message ? <span style={{ color: "#b91c1c" }}>{r.error_message}</span> : "—"}
                    </td>
                    <td style={{ padding: "8px", color: r.deadline && new Date(r.deadline) < new Date() ? "#b91c1c" : "#475569" }}>
                      {r.deadline ? new Date(r.deadline).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "pending" && (
                        <>
                          <button
                            onClick={() => processMut.mutate(r.id)}
                            disabled={processMut.isPending}
                            style={{ ...btnBase, background: "#2563eb", color: "#fff", marginRight: 6 }}
                          >
                            处理
                          </button>
                          <button onClick={() => setRejectId(r.id)} style={{ ...btnBase, background: "#dc2626", color: "#fff" }}>拒绝</button>
                        </>
                      )}
                      {r.status === "failed" && (
                        <button onClick={() => processMut.mutate(r.id)} style={{ ...btnBase, background: "#f59e0b", color: "#fff" }}>重新处理</button>
                      )}
                      {r.status === "completed" && (
                        <button onClick={() => resendMut.mutate(r.id)} style={{ ...btnBase, background: "#e2e8f0", color: "#334155" }}>重发链接</button>
                      )}
                    </td>
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
