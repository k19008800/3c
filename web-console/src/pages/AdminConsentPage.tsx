import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

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

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid var(--color-border)`, width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const EXPORT_STATUS_MAP: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  pending: "warning", processing: "info", completed: "success", failed: "danger", rejected: "default", overdue: "danger",
};
const EXPORT_LABEL: Record<string, string> = {
  pending: "待处理", processing: "处理中", completed: "已完成", failed: "失败", rejected: "已拒绝", overdue: "已过期",
};

const HELP: Record<string, { title: string; body: string }> = {
  privacy: { title: "隐私政策管理", body: "管理平台隐私政策版本。发布新版本后，已注册用户下次登录需重新确认；可查看各版本同意率，支持一键回滚。" },
  tos: { title: "服务条款管理", body: "与服务条款版本一致。条款更新后未确认用户将逐步限制功能（先限制新 API 创建，再限制调用）。" },
  export: { title: "数据导出管理", body: "审核用户的数据导出请求（GDPR 数据可携带权）。审核通过后生成 ZIP 并通知用户，处理期限 30 天，超期自动标记并升级通知。" },
};

/* ───────── 演示数据（后端 /admin/settings/*、/admin/data-export 待接入） ───────── */
const MOCK_VERSIONS: VersionRow[] = [
  { id: 1, version: "v2.1", title: null, status: "published", published_at: "2026-06-01T10:00:00", revoked_at: null, summary: "更新数据共享说明，明确第三方供应商范围", consent_count: 8234, pending_count: 156, consent_rate: 98 },
  { id: 2, version: "v2.2", title: null, status: "draft", published_at: null, revoked_at: null, summary: "新增「儿童信息保护」章节", consent_count: 0, pending_count: 0, consent_rate: 0 },
  { id: 3, version: "v1.9", title: null, status: "revoked", published_at: "2026-03-15T09:00:00", revoked_at: "2026-06-01T10:00:00", summary: null, consent_count: 7210, pending_count: 0, consent_rate: 97 },
];
const MOCK_EXPORTS: ExportRow[] = [
  { id: 1, user_id: 1001, email: "user1@example.com", username: "用户小王", requested_at: "2026-08-05T10:30:00", status: "pending", priority: false, processed_by: null, processed_at: null, file_size_bytes: null, file_count: null, part_count: 0, reject_reason: null, error_message: null, deadline: "2026-09-04T10:30:00", notification_sent: false },
  { id: 2, user_id: 1002, email: "user2@example.com", username: "用户小李", requested_at: "2026-08-02T14:00:00", status: "completed", priority: true, processed_by: 1, processed_at: "2026-08-02T14:30:00", file_size_bytes: 245760, file_count: 12, part_count: 1, reject_reason: null, error_message: null, deadline: "2026-09-01T14:00:00", notification_sent: true },
  { id: 3, user_id: 1003, email: "user3@example.com", username: "用户小张", requested_at: "2026-07-30T09:00:00", status: "failed", priority: false, processed_by: null, processed_at: null, file_size_bytes: null, file_count: null, part_count: 0, reject_reason: null, error_message: "存储服务超时", deadline: "2026-08-29T09:00:00", notification_sent: false },
];
const MOCK_EXPORT_STATS = { pending: 1, processing: 0, completed: 1, failed: 1, rejected: 0, overdue: 0 };

export default function AdminConsentPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"privacy" | "tos" | "export">("privacy");

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        合规法务管理
        <HelpIcon text="覆盖隐私政策/服务条款版本管理、用户数据导出（GDPR 数据可携带权）。所有协议变更属敏感操作，全程留审计。" level="page" />
      </h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {([["privacy", "隐私政策"], ["tos", "服务条款"], ["export", "数据导出"]] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              ...btnBase,
              background: tab === k ? "var(--color-primary)" : "var(--color-border)",
              color: tab === k ? "#fff" : "var(--color-text)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "privacy" && <PolicySection kind="privacy" toast={toast} qc={qc} help={HELP.privacy!} />}
      {tab === "tos" && <PolicySection kind="tos" toast={toast} qc={qc} help={HELP.tos!} />}
      {tab === "export" && <ExportSection toast={toast} qc={qc} help={HELP.export!} />}
    </div>
  );
}

/* ============ 隐私政策 / 服务条款 共用 ============ */
function PolicySection({ kind, toast, qc, help }: { kind: "privacy" | "tos"; toast: ReturnType<typeof useToast>["toast"]; qc: ReturnType<typeof useQueryClient>; help: { title: string; body: string } }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ version: "", title: "", content: "", summary: "" });
  const [viewId, setViewId] = useState<number | null>(null);
  // 演示兜底：本地可变版本列表（写操作在演示模式下直接改它）
  const [localVersions, setLocalVersions] = useState<VersionRow[]>(MOCK_VERSIONS);
  const [demo, setDemo] = useState(true);

  const endpoint = kind === "privacy" ? "privacy-policy" : "terms-of-service";
  const label = kind === "privacy" ? "隐私政策" : "服务条款";

  const versionsQ = useQuery({
    queryKey: [`admin-${endpoint}`],
    queryFn: async () => (await api.get<{ data: { list: VersionRow[] } }>(`/admin/settings/${endpoint}/versions`)).data.data.list,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const versions = versionsQ.data != null ? versionsQ.data : (demo ? localVersions : []);

  const viewQ = useQuery({
    queryKey: [`admin-${endpoint}-view`, viewId],
    queryFn: async () => {
      const list = versions ?? [];
      return list.find((v) => v.id === viewId) ?? null;
    },
    enabled: !!viewId && versions.length > 0,
  });

  const createMut = useMutation({
    mutationFn: async () => (await api.post(`/admin/settings/${endpoint}/versions`, form)).data,
    onSuccess: () => {
      setShowForm(false); setForm({ version: "", title: "", content: "", summary: "" });
      toast.success(`已创建${label}草稿`);
      qc.invalidateQueries({ queryKey: [`admin-${endpoint}`] });
    },
    onError: (e: any) => {
      // 演示模式：后端未实现时本地新增草稿版本
      if (e?.response?.status === 404) {
        const nv: VersionRow = { id: Date.now(), version: form.version || "v-draft", title: form.title || null, status: "draft", published_at: null, revoked_at: null, summary: form.summary || null, consent_count: 0, pending_count: 0, consent_rate: 0 };
        setLocalVersions((prev) => [nv, ...prev]);
        setShowForm(false); setForm({ version: "", title: "", content: "", summary: "" });
        toast.success(`已创建${label}草稿（演示）`);
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const publishMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/settings/${endpoint}/versions/${id}/publish`, {})).data,
    onSuccess: (d: any) => {
      toast.success(d.message || "已发布");
      qc.invalidateQueries({ queryKey: [`admin-${endpoint}`] });
    },
    onError: (e: any, id?: number) => {
      // 演示模式：后端未实现时本地改为已发布
      if (e?.response?.status === 404 && id != null) {
        setLocalVersions((prev) => prev.map((v) => v.id === id ? { ...v, status: "published", published_at: new Date().toISOString() } : v));
        toast.success(`已发布${label}（演示）`);
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const rollbackMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/settings/${endpoint}/versions/${id}/rollback`, {})).data,
    onSuccess: (d: any) => {
      toast.success(d.message || "已回滚");
      qc.invalidateQueries({ queryKey: [`admin-${endpoint}`] });
    },
    onError: (e: any, id?: number) => {
      // 演示模式：后端未实现时本地回滚（目标设为已发布，其余已发布版本撤销）
      if (e?.response?.status === 404 && id != null) {
        setLocalVersions((prev) => prev.map((v) => {
          if (v.id === id) return { ...v, status: "published", published_at: v.published_at ?? new Date().toISOString() };
          if (v.status === "published") return { ...v, status: "revoked", revoked_at: new Date().toISOString() };
          return v;
        }));
        toast.success("已回滚到此版本（演示）");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const getVersionStatus = (s: string): "success" | "warning" | "danger" | "info" | "default" => {
    if (s === "published") return "success";
    if (s === "revoked") return "danger";
    return "default";
  };

  return (
    <div>
      <div style={card}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center" }}>
          {label}版本管理
          <HelpIcon text={help.body} level="page" />
          {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/settings 待接入）</span>}
        </h3>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setShowForm(!showForm)} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>
            {showForm ? "取消" : "发布新版本"}
          </button>
        </div>

        {showForm && (
          <div style={{ background: "var(--color-bg)", padding: 16, borderRadius: 8, marginBottom: 14, border: `1px solid var(--color-border)` }}>
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
              style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", opacity: !form.version.trim() || !form.content.trim() ? 0.6 : 1 }}
            >
              {createMut.isPending ? "创建中..." : "保存草稿"}
            </button>
          </div>
        )}

        {versionsQ.isLoading ? (
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        ) : versions.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无版本记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid var(--color-border)`, textAlign: "left" }}>
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
              {versions.map((v) => (
                <tr key={v.id} style={{ borderBottom: `1px solid var(--color-border)` }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{v.version}</td>
                  <td style={{ padding: "8px" }}>
                    <StatusBadge status={getVersionStatus(v.status)}>
                      {v.status === "published" ? "已发布" : v.status === "revoked" ? "已撤销" : "草稿"}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "8px", color: "#475569" }}>{v.published_at ? new Date(v.published_at).toLocaleDateString() : "—"}</td>
                  <td style={{ padding: "8px" }}>{v.consent_count}</td>
                  <td style={{ padding: "8px", color: v.pending_count > 0 ? "var(--color-danger-text)" : "#475569" }}>{v.status === "published" ? v.pending_count : "—"}</td>
                  <td style={{ padding: "8px" }}>{v.status === "published" ? `${v.consent_rate}%` : "—"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setViewId(v.id)} style={{ ...btnBase, background: "var(--color-border)", color: "var(--color-text)", marginRight: 6 }}>查看</button>
                    {v.status === "draft" && (
                      <button onClick={() => publishMut.mutate(v.id)} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", marginRight: 6 }}>发布</button>
                    )}
                    {(v.status === "published" || v.status === "revoked") && versions.some((x) => x.status === "published" && x.id !== v.id) && (
                      <button onClick={() => rollbackMut.mutate(v.id)} style={{ ...btnBase, background: "#f59e0b", color: "#fff" }}>回滚到此</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 版本内容查看 Modal */}
      <Modal open={!!viewId && !!viewQ.data} onClose={() => setViewId(null)} title={`版本 ${viewQ.data?.version ?? ""} 内容`}>
        {viewQ.data && (
          <div>
            {viewQ.data.summary && (
              <div style={{ margin: "12px 0", padding: "10px 14px", background: "#fefce8", borderRadius: 8, fontSize: 13, color: "#854d0e" }}>
                变更摘要：{viewQ.data.summary}
              </div>
            )}
            <pre style={{ whiteSpace: "pre-wrap", background: "var(--color-bg)", padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
              {viewQ.data.title && `${viewQ.data.title}\n\n`}
              版本：{viewQ.data.version} ｜ 状态：{viewQ.data.status === "published" ? "已发布" : viewQ.data.status === "revoked" ? "已撤销" : "草稿"} ｜ 已同意：{viewQ.data.consent_count} 人
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============ 数据导出 ============ */
function ExportSection({ toast, qc, help }: { toast: ReturnType<typeof useToast>["toast"]; qc: ReturnType<typeof useQueryClient>; help: { title: string; body: string } }) {
  const [statusFilter, setStatusFilter] = useState("");
  // 演示兜底：本地可变导出列表（写操作在演示模式下直接改它）
  const [localExports, setLocalExports] = useState<ExportRow[]>(MOCK_EXPORTS);
  const [demo, setDemo] = useState(true);

  const listQ = useQuery({
    queryKey: ["admin-data-export", statusFilter],
    queryFn: async () => {
      const p = statusFilter ? `?status=${statusFilter}` : "";
      return (await api.get<{ data: { list: ExportRow[] } }>(`/admin/data-export/requests${p}`)).data.data.list;
    },
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });
  const statsQ = useQuery({
    queryKey: ["admin-data-export-stats"],
    queryFn: async () => (await api.get<{ data: Record<string, number> }>("/admin/data-export/stats")).data.data,
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const exports = listQ.data != null ? listQ.data : (demo ? (statusFilter ? localExports.filter((r) => r.status === statusFilter) : localExports) : []);
  const stats = statsQ.data != null ? statsQ.data : (demo ? MOCK_EXPORT_STATS : null);

  const processMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/data-export/${id}/process`, {})).data,
    onSuccess: (d: any) => {
      toast.success(d.message || "已处理");
      qc.invalidateQueries({ queryKey: ["admin-data-export"] });
      qc.invalidateQueries({ queryKey: ["admin-data-export-stats"] });
    },
    onError: (e: any, id?: number) => {
      // 演示模式：后端未实现时本地标记完成
      if (e?.response?.status === 404 && id != null) {
        setLocalExports((prev) => prev.map((r) => r.id === id ? { ...r, status: "completed", processed_by: 1, processed_at: new Date().toISOString(), file_size_bytes: 245760, file_count: 12, notification_sent: true } : r));
        toast.success("已处理（演示）");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const rejectMut = useMutation<any, unknown, { id: number; reason: string }>({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await api.post(`/admin/data-export/${id}/reject`, { reason })).data,
    onSuccess: () => {
      toast.success("已拒绝");
      qc.invalidateQueries({ queryKey: ["admin-data-export"] });
      qc.invalidateQueries({ queryKey: ["admin-data-export-stats"] });
    },
    onError: (e: any, vars?: { id: number; reason: string }) => {
      // 演示模式：后端未实现时本地标记拒绝
      if (e?.response?.status === 404 && vars) {
        setLocalExports((prev) => prev.map((r) => r.id === vars.id ? { ...r, status: "rejected", reject_reason: vars.reason, notification_sent: true } : r));
        toast.success("已拒绝（演示）");
        setRejectId(null); setRejectReason("");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const resendMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/data-export/${id}/resend`, {})).data,
    onSuccess: (d: any) => toast.success(d.message || (d.data?.notification_sent ? "已发送" : "SMTP 未配置")),
    onError: (e: any, id?: number) => {
      // 演示模式：后端未实现时本地模拟发送
      if (e?.response?.status === 404 && id != null) {
        setLocalExports((prev) => prev.map((r) => r.id === id ? { ...r, notification_sent: true } : r));
        toast.success("已发送（演示）");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  if (rejectId && exports.length > 0) {
    const row = exports.find((r) => r.id === rejectId);
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
            style={{ ...btnBase, background: "var(--color-danger-text)", color: "#fff", opacity: !rejectReason.trim() ? 0.6 : 1 }}
          >
            确认拒绝
          </button>
          <button onClick={() => setRejectId(null)} style={{ ...btnBase, background: "var(--color-border)", color: "var(--color-text)" }}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={card}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center" }}>
          数据导出请求管理
          <HelpIcon text={help.body} level="page" />
          {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/data-export 待接入）</span>}
        </h3>

        {stats && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            {Object.entries(stats).map(([k, v]) => (
              <StatusBadge key={k} status={EXPORT_STATUS_MAP[k] ?? "default"} variant="pill">
                {EXPORT_LABEL[k] ?? k} {v}
              </StatusBadge>
            ))}
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
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        ) : exports.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无导出请求</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid var(--color-border)`, textAlign: "left" }}>
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
              {exports.map((r) => {
                const st = EXPORT_STATUS_MAP[r.status] ?? "default";
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid var(--color-border)` }}>
                    <td style={{ padding: "8px" }}>#{r.id}</td>
                    <td style={{ padding: "8px" }}>
                      <div style={{ fontWeight: 600 }}>{r.username}</div>
                      <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{r.email}</div>
                    </td>
                    <td style={{ padding: "8px", color: "#475569" }}>{new Date(r.requested_at).toLocaleString()}</td>
                    <td style={{ padding: "8px" }}>
                      <StatusBadge status={st}>{EXPORT_LABEL[r.status] ?? r.status}</StatusBadge>
                    </td>
                    <td style={{ padding: "8px", color: "#475569" }}>
                      {r.status === "completed" && r.file_size_bytes ? `${(r.file_size_bytes / 1024).toFixed(1)} KB / ${r.file_count} 文件` : r.error_message ? <span style={{ color: "var(--color-danger-text)" }}>{r.error_message}</span> : "—"}
                    </td>
                    <td style={{ padding: "8px", color: r.deadline && new Date(r.deadline) < new Date() ? "var(--color-danger-text)" : "#475569" }}>
                      {r.deadline ? new Date(r.deadline).toLocaleDateString() : "—"}
                    </td>
                    <td style={{ padding: "8px" }}>
                      {r.status === "pending" && (
                        <>
                          <button onClick={() => processMut.mutate(r.id)} disabled={processMut.isPending} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", marginRight: 6 }}>处理</button>
                          <button onClick={() => setRejectId(r.id)} style={{ ...btnBase, background: "var(--color-danger-text)", color: "#fff" }}>拒绝</button>
                        </>
                      )}
                      {r.status === "failed" && (
                        <button onClick={() => processMut.mutate(r.id)} style={{ ...btnBase, background: "#f59e0b", color: "#fff" }}>重新处理</button>
                      )}
                      {r.status === "completed" && (
                        <button onClick={() => resendMut.mutate(r.id)} style={{ ...btnBase, background: "var(--color-border)", color: "var(--color-text)" }}>重发链接</button>
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
