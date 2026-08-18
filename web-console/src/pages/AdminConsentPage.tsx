import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

/**
 * 合规法务管理（SPEC-§33）
 * Tab1 合规策略（隐私政策 / 服务条款）版本管理
 * Tab2 用户同意记录
 * 直连后端 /admin/consent/policies、/admin/consent/logs
 */

interface ConsentPolicy {
  id: number;
  key: string;
  name: string;
  content: string;
  version: number;
  version_label: string;
  status: string;
  status_label: string;
  updated_by: number | null;
  updated_at: string;
  created_at: string;
  consent_count: number;
  pending_count: number;
  consent_rate: number;
}
interface ConsentLog {
  id: number;
  user_id: number;
  email: string | null;
  username: string;
  policy_id: number;
  policy_key: string | null;
  policy_name: string | null;
  action: string;
  action_label: string;
  created_at: string;
}

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: `1px solid var(--color-border)`, width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };

const HELP: Record<string, { title: string; body: string }> = {
  policies: { title: "合规策略管理", body: "管理平台隐私政策/服务条款等合规策略。每次编辑版本号自动 +1 并留审计，发布新版本后用户需重新确认。" },
  logs: { title: "用户同意记录", body: "查看用户对各项合规策略的同意/拒绝记录，全程留痕，满足合规审计要求。" },
};

const POLICY_STATUS: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  published: "success",
  revoked: "danger",
  draft: "default",
};

export default function AdminConsentPage() {
  const [tab, setTab] = useState<"policies" | "logs">("policies");

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        合规法务管理
        <HelpIcon text="覆盖隐私政策/服务条款版本管理、用户同意记录。所有协议变更属敏感操作，全程留审计。" level="page" />
      </h2>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        {([["policies", "合规策略"], ["logs", "同意记录"]] as const).map(([k, label]) => (
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

      {tab === "policies" ? <PolicySection help={HELP.policies!} /> : <LogSection help={HELP.logs!} />}
    </div>
  );
}

/* ============ 合规策略列表 + 编辑（版本号 +1） ============ */
function PolicySection({ help }: { help: { title: string; body: string } }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<ConsentPolicy | null>(null);
  const [viewing, setViewing] = useState<ConsentPolicy | null>(null);
  const [form, setForm] = useState({ name: "", content: "" });

  const listQ = useQuery({
    queryKey: ["admin-consent-policies"],
    queryFn: async () => (await api.get<{ data: { list: ConsentPolicy[] } }>("/admin/consent/policies")).data.data.list,
    retry: 0,
  });
  const policies = listQ.data ?? [];

  const saveMut = useMutation({
    mutationFn: async () => (await api.put(`/admin/consent/policies/${editing!.id}`, { name: form.name, content: form.content })).data,
    onSuccess: (d: { data?: { message?: string } }) => {
      toast.success(d?.data?.message ?? "已更新");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-consent-policies"] });
    },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  const openEdit = (p: ConsentPolicy) => { setEditing(p); setForm({ name: p.name, content: p.content }); };

  return (
    <div>
      <div style={card}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center" }}>
          {help.title}
          <HelpIcon text={help.body} level="page" />
        </h3>

        {listQ.isLoading ? (
          <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
        ) : policies.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无合规策略</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid var(--color-border)`, textAlign: "left" }}>
                <th style={{ padding: "8px" }}>策略</th>
                <th style={{ padding: "8px" }}>键</th>
                <th style={{ padding: "8px" }}>版本</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>已同意</th>
                <th style={{ padding: "8px" }}>同意率</th>
                <th style={{ padding: "8px" }}>更新时间</th>
                <th style={{ padding: "8px" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid var(--color-border)` }}>
                  <td style={{ padding: "8px", fontWeight: 600 }}>{p.name}</td>
                  <td style={{ padding: "8px", color: "#475569", fontSize: 12, fontFamily: "monospace" }}>{p.key}</td>
                  <td style={{ padding: "8px" }}>{p.version_label}</td>
                  <td style={{ padding: "8px" }}>
                    <StatusBadge status={POLICY_STATUS[p.status] ?? "default"}>{p.status_label}</StatusBadge>
                  </td>
                  <td style={{ padding: "8px" }}>{p.consent_count}</td>
                  <td style={{ padding: "8px", color: p.consent_rate > 0 ? "var(--color-success-text)" : "#475569" }}>{p.consent_rate}%</td>
                  <td style={{ padding: "8px", color: "#475569", fontSize: 12 }}>{p.updated_at ? new Date(p.updated_at).toLocaleString() : "—"}</td>
                  <td style={{ padding: "8px" }}>
                    <button onClick={() => setViewing(p)} style={{ ...btnBase, background: "var(--color-border)", color: "var(--color-text)", marginRight: 6 }}>查看 <HelpIcon text="查看策略正文内容。" /></button>
                    <button onClick={() => openEdit(p)} style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}>编辑 <HelpIcon text="编辑策略名称与正文，保存后版本号自动 +1 并写审计。" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 编辑弹窗：保存后版本号 +1 */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={`编辑 ${editing?.name ?? ""}（当前 ${editing?.version_label ?? ""}）`} width={640}>
        {editing && (
          <>
            <input style={inp} placeholder="策略名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <textarea
              style={{ ...inp, minHeight: 220, resize: "vertical" }}
              placeholder="策略正文（Markdown）"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10 }}>保存后版本号将从 {editing.version_label} 升为 v{editing.version + 1}，并记录操作审计。</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ ...btnBase, background: "var(--color-border)", color: "var(--color-text)" }}>取消</button>
              <button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending || !form.name.trim() || !form.content.trim()}
                style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", opacity: !form.name.trim() || !form.content.trim() ? 0.6 : 1 }}
              >
                {saveMut.isPending ? "保存中..." : "保存并升版"}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* 查看弹窗 */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`${viewing?.name ?? ""} · ${viewing?.version_label ?? ""}`} width={640}>
        {viewing && (
          <div>
            {viewing.status === "published" && (
              <div style={{ margin: "0 0 12px", padding: "10px 14px", background: "#f0fdf4", borderRadius: 8, fontSize: 13, color: "#166534" }}>
                当前为已发布版本，已同意 {viewing.consent_count} 人，同意率 {viewing.consent_rate}%
              </div>
            )}
            <pre style={{ whiteSpace: "pre-wrap", background: "var(--color-bg)", padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
              {viewing.content}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ============ 用户同意记录 ============ */
function LogSection({ help }: { help: { title: string; body: string } }) {
  const listQ = useQuery({
    queryKey: ["admin-consent-logs"],
    queryFn: async () => (await api.get<{ data: { list: ConsentLog[] } }>("/admin/consent/logs?page_size=100")).data.data.list,
    retry: 0,
  });
  const logs = listQ.data ?? [];

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center" }}>
        {help.title}
        <HelpIcon text={help.body} level="page" />
      </h3>

      {listQ.isLoading ? (
        <div style={{ color: "var(--color-text-secondary)" }}>加载中...</div>
      ) : logs.length === 0 ? (
        <div style={{ color: "#94a3b8" }}>暂无同意记录</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid var(--color-border)`, textAlign: "left" }}>
              <th style={{ padding: "8px" }}>用户</th>
              <th style={{ padding: "8px" }}>策略</th>
              <th style={{ padding: "8px" }}>动作</th>
              <th style={{ padding: "8px" }}>时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} style={{ borderBottom: `1px solid var(--color-border)` }}>
                <td style={{ padding: "8px" }}>
                  <div style={{ fontWeight: 600 }}>{l.username}</div>
                  <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>{l.email ?? `#${l.user_id}`}</div>
                </td>
                <td style={{ padding: "8px" }}>{l.policy_name ?? l.policy_key ?? `#${l.policy_id}`}</td>
                <td style={{ padding: "8px" }}>
                  <StatusBadge status={l.action === "agree" ? "success" : "danger"}>{l.action_label}</StatusBadge>
                </td>
                <td style={{ padding: "8px", color: "#475569", fontSize: 12 }}>{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
