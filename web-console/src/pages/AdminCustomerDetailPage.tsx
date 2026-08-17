import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { PageHeader, HelpIcon, StatusBadge, SkeletonGroup, EmptyState, Modal, useToast } from "@3cloud/shared-ui";

interface CustomerDetail {
  id: number; user_id: number; username: string; email: string;
  status: string; status_label: string; balance: number;
  real_name_verified: boolean; real_name_label: string;
  quota_total: number; quota_used: number;
  created_at: string; updated_at: string;
  phone: string | null; company: string | null;
  salesperson_id: number | null; salesperson_name: string | null;
  tags: string[];
}

const statusMap: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  lead: "warning", trial: "info", active: "success", silent: "default", churned: "danger",
};

type TabKey = "consumption" | "recharges" | "keys" | "tickets" | "ops";

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: "consumption", icon: "📊", label: "消费记录" },
  { key: "recharges", icon: "🧾", label: "充值记录" },
  { key: "keys", icon: "🔑", label: "API 密钥" },
  { key: "tickets", icon: "🎫", label: "工单记录" },
  { key: "ops", icon: "📝", label: "操作日志" },
];

/** 原型 grid 字段：标签 + 值 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}

/** 通用表格包装（对齐原型 panel 表格） */
function PlainTable({ head, children, empty, colSpan }: {
  head: string[];
  children: React.ReactNode;
  empty?: string;
  colSpan: number;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
          {head.map((h) => <th key={h} style={{ padding: "8px" }}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {children || (
          <tr>
            <td colSpan={colSpan} style={{ textAlign: "center", color: "#999", padding: "28px 0", fontSize: 13 }}>
              {empty ?? "暂无数据"}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export default function AdminCustomerDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<TabKey>("consumption");

  const q = useQuery({
    queryKey: ["admin-customer-detail", userId],
    queryFn: async () => (await api.get<{ data: CustomerDetail }>(`/admin/customers/${userId}`)).data.data,
    enabled: !!userId,
  });

  const consumerQ = useQuery({
    queryKey: ["admin-customer-consumption", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/consumption?page_size=50`)).data.data,
    enabled: !!userId && tab === "consumption",
  });

  const rechargeQ = useQuery({
    queryKey: ["admin-customer-recharges", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/recharges?page_size=50`)).data.data,
    enabled: !!userId && tab === "recharges",
  });

  const apiKeyQ = useQuery({
    queryKey: ["admin-customer-apikeys", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/api-keys`)).data.data,
    enabled: !!userId && tab === "keys",
  });

  const ticketQ = useQuery({
    queryKey: ["admin-customer-tickets", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/tickets?page_size=50`)).data.data,
    enabled: !!userId && tab === "tickets",
  });

  const opsQ = useQuery({
    queryKey: ["admin-customer-ops", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/operation-logs?page_size=50`)).data.data,
    enabled: !!userId && tab === "ops",
  });

  const c = q.data;

  /* ── 编辑基本信息（弹窗） ── */
  const [editOpen, setEditOpen] = useState(false);
  const [eEmail, setEEmail] = useState("");
  const [eName, setEName] = useState("");
  const [eStatus, setEStatus] = useState<"active" | "disabled">("active");

  const editMut = useMutation({
    mutationFn: async (body: { email: string; name: string; status: string }) =>
      (await api.put(`/admin/customers/${userId}`, body)).data,
    onSuccess: () => {
      toast.success("客户信息已更新");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-customer-detail", userId] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const openEdit = () => {
    if (!c) return;
    setEEmail(c.email);
    setEName(c.username || "");
    setEStatus(c.status === "disabled" ? "disabled" : "active");
    setEditOpen(true);
  };

  const submitEdit = () => {
    const email = eEmail.trim();
    const name = eName.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error("请输入正确的邮箱地址"); return; }
    if (!name) { toast.error("客户名称不能为空"); return; }
    editMut.mutate({ email, name, status: eStatus });
  };

  /* ── 重置密码（自动生成 / 手动指定） ── */
  const [resetOpen, setResetOpen] = useState(false);
  const [resetMode, setResetMode] = useState<"auto" | "manual">("auto");
  const [manualPw, setManualPw] = useState("");
  const [resetResult, setResetResult] = useState<string | null>(null);

  const resetPwMut = useMutation({
    mutationFn: async (body?: { password?: string }) =>
      (await api.post(`/admin/customers/${userId}/reset-password`, body ?? {})).data as {
        data?: { newPassword?: string; mode?: "auto" | "manual" };
      },
    onSuccess: (d) => {
      const mode = d.data?.mode ?? "auto";
      if (mode === "manual") {
        toast.success("密码已重置（手动指定）");
        setResetOpen(false);
        setResetResult(null);
        setManualPw("");
      } else {
        const pw = d.data?.newPassword;
        setResetResult(pw ?? "");
        toast.success("密码已重置，新密码见弹窗（仅本次可见）");
      }
      qc.invalidateQueries({ queryKey: ["admin-customer-ops", userId] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  const openReset = () => {
    setResetMode("auto");
    setManualPw("");
    setResetResult(null);
    setResetOpen(true);
  };

  const submitReset = () => {
    if (resetMode === "manual") {
      const pw = manualPw.trim();
      if (pw.length < 8) { toast.error("密码长度至少 8 位"); return; }
      resetPwMut.mutate({ password: pw });
      return;
    }
    resetPwMut.mutate({});
  };

  /* ── 冻结 / 解冻 ── */
  const statusMut = useMutation({
    mutationFn: async (next: "active" | "disabled") => {
      await api.patch(`/admin/customers/${userId}/status`, { status: next });
    },
    onSuccess: () => {
      toast.success("操作成功");
      qc.invalidateQueries({ queryKey: ["admin-customer-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-customer-ops", userId] });
    },
    onError: (err) => toast.error(extractError(err)),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <PageHeader title="客户详情" help="查看客户完整信息：基本资料、消费记录、充值记录、API Key 列表、工单记录、操作日志。" />
      <button onClick={() => navigate("/admin/customers")} className="c3-back-btn">
        ← 返回客户列表
      </button>

      {q.isLoading ? <SkeletonGroup lines={8} /> : !c ? <EmptyState title="客户不存在" /> : (
        <>
          {/* 客户信息面板 — 原型 identity card + 操作按钮 */}
          <section className="c3-panel">
            <header className="c3-panel__header">
              <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                👤 客户信息
                <HelpIcon text="查看客户完整信息：基本资料、消费记录、充值记录、API Key 列表、工单记录、操作日志。可编辑基本信息、重置密码、冻结/解冻。" level="page" />
              </h3>
              <div className="c3-btn-group">
                <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={openEdit}>编辑</button>
                <button type="button" className="c3-btn c3-btn--default c3-btn--sm" disabled={resetPwMut.isPending} onClick={openReset}>
                  {resetPwMut.isPending ? "重置中…" : "重置密码"}
                </button>
                <button
                  type="button"
                  className={`c3-btn c3-btn--default c3-btn--sm ${c.status === "active" ? "c3-danger" : ""}`}
                  disabled={statusMut.isPending}
                  onClick={() => statusMut.mutate(c.status === "disabled" ? "active" : "disabled")}
                >
                  {c.status === "disabled" ? "启用" : "禁用"}
                </button>
                <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => navigate(`/admin/customers/quotas?customer=${c.user_id}`)}>
                  编辑额度
                </button>
              </div>
            </header>
            <div className="c3-panel__body" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
              <Field label="邮箱">{c.email}</Field>
              <Field label="名称">{c.username || c.company || "-"}</Field>
              <Field label="余额">
                <span className="c3-rank-amount" style={{ fontWeight: 600 }}>¥{c.balance ?? 0}</span>
              </Field>
              <Field label="状态"><StatusBadge status={statusMap[c.status] ?? "default"}>{c.status_label}</StatusBadge></Field>
              <Field label="注册时间">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "-"}</Field>
              <Field label="实名认证">
                <StatusBadge status={c.real_name_verified ? "success" : "default"}>{c.real_name_label || (c.real_name_verified ? "已认证" : "未认证")}</StatusBadge>
              </Field>
              <Field label="ID">{c.user_id}</Field>
              <Field label="手机">{c.phone ?? "-"}</Field>
              <Field label="额度使用">¥{c.quota_used ?? 0} / ¥{c.quota_total ?? 0}</Field>
            </div>
          </section>

          {/* Tab 区 — 原型 sub-tabs：消费/充值/密钥/工单/操作日志 */}
          <div className="c3-sub-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                className={`c3-sub-tab${tab === t.key ? " c3-sub-tab--active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* Tab1: 消费记录 */}
          {tab === "consumption" && (
            <section className="c3-panel">
              <header className="c3-panel__header">
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>📊 消费记录</h3>
              </header>
              <div className="c3-panel__body" style={{ padding: 0 }}>
                {consumerQ.isLoading ? <SkeletonGroup lines={5} /> : (
                  <PlainTable
                    colSpan={5}
                    empty="暂无消费记录"
                    head={["时间", "模型", "输入 Tokens", "输出 Tokens", "消费金额"]}
                  >
                    {(consumerQ.data?.list ?? []).map((r: any, i: number) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px" }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: "8px" }}>{r.model_name ?? "-"}</td>
                        <td style={{ padding: "8px" }}>{r.input_tokens?.toLocaleString() ?? 0}</td>
                        <td style={{ padding: "8px" }}>{r.output_tokens?.toLocaleString() ?? 0}</td>
                        <td style={{ padding: "8px", fontWeight: 600, color: "#e53935" }}>¥{r.amount?.toFixed(4) ?? "0.00"}</td>
                      </tr>
                    ))}
                  </PlainTable>
                )}
              </div>
            </section>
          )}

          {/* Tab2: 充值记录 */}
          {tab === "recharges" && (
            <section className="c3-panel">
              <header className="c3-panel__header">
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>🧾 充值记录</h3>
              </header>
              <div className="c3-panel__body" style={{ padding: 0 }}>
                {rechargeQ.isLoading ? <SkeletonGroup lines={4} /> : (
                  <PlainTable
                    colSpan={5}
                    empty="暂无充值记录"
                    head={["充值单号", "时间", "充值金额", "支付方式", "状态"]}
                  >
                    {(rechargeQ.data?.list ?? []).map((r: any) => (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{r.order_no ?? `#${r.id}`}</td>
                        <td style={{ padding: "8px", color: "#888" }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: "8px", fontWeight: 600 }}>¥{r.amount ?? 0}</td>
                        <td style={{ padding: "8px" }}>{r.method ?? "-"}</td>
                        <td style={{ padding: "8px" }}><StatusBadge status={r.status === "paid" ? "success" : r.status === "pending" ? "warning" : "default"}>{r.status_label ?? r.status}</StatusBadge></td>
                      </tr>
                    ))}
                  </PlainTable>
                )}
              </div>
            </section>
          )}

          {/* Tab3: API 密钥 */}
          {tab === "keys" && (
            <section className="c3-panel">
              <header className="c3-panel__header">
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>🔑 API 密钥</h3>
              </header>
              <div className="c3-panel__body" style={{ padding: 0 }}>
                {apiKeyQ.isLoading ? <SkeletonGroup lines={4} /> : (
                  <PlainTable
                    colSpan={5}
                    empty="暂无 API 密钥"
                    head={["Key 名称", "前缀", "状态", "创建时间", "最后使用"]}
                  >
                    {(apiKeyQ.data?.list ?? []).map((k: any) => (
                      <tr key={k.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", fontWeight: 600 }}>{k.name ?? "-"}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace" }}>{k.key_prefix ?? "-"}</td>
                        <td style={{ padding: "8px" }}><StatusBadge status={k.status === "active" ? "success" : "default"}>{k.status_label ?? k.status}</StatusBadge></td>
                        <td style={{ padding: "8px", color: "#888" }}>{k.created_at ? new Date(k.created_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: "8px", color: "#888" }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "从未"}</td>
                      </tr>
                    ))}
                  </PlainTable>
                )}
              </div>
            </section>
          )}

          {/* Tab4: 工单记录 */}
          {tab === "tickets" && (
            <section className="c3-panel">
              <header className="c3-panel__header">
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>🎫 工单记录</h3>
              </header>
              <div className="c3-panel__body" style={{ padding: 0 }}>
                {ticketQ.isLoading ? <SkeletonGroup lines={4} /> : (
                  <PlainTable
                    colSpan={5}
                    empty="暂无工单"
                    head={["工单号", "标题", "类型", "状态", "创建时间"]}
                  >
                    {(ticketQ.data?.list ?? []).map((t: any) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{t.ticket_no ?? `#${t.id}`}</td>
                        <td style={{ padding: "8px" }}>{t.title ?? "-"}</td>
                        <td style={{ padding: "8px" }}>{t.type_label ?? t.type ?? "-"}</td>
                        <td style={{ padding: "8px" }}><StatusBadge status={t.status === "open" ? "warning" : t.status === "closed" ? "success" : "info"}>{t.status_label ?? t.status}</StatusBadge></td>
                        <td style={{ padding: "8px", color: "#888" }}>{t.created_at ? new Date(t.created_at).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </PlainTable>
                )}
              </div>
            </section>
          )}

          {/* Tab5: 操作日志 */}
          {tab === "ops" && (
            <section className="c3-panel">
              <header className="c3-panel__header">
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>📝 操作日志</h3>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>冻结/解冻、编辑、重置密码等操作均写入审计日志</span>
              </header>
              <div className="c3-panel__body" style={{ padding: 0 }}>
                {opsQ.isLoading ? <SkeletonGroup lines={4} /> : (
                  <PlainTable
                    colSpan={4}
                    empty="暂无操作日志"
                    head={["时间", "操作", "操作人 ID", "备注"]}
                  >
                    {(opsQ.data?.list ?? []).map((o: any) => (
                      <tr key={o.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", color: "#888" }}>{o.created_at ? new Date(o.created_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: "8px" }}>{o.action_label ?? o.action}</td>
                        <td style={{ padding: "8px" }}>{o.operator_id ?? "-"}</td>
                        <td style={{ padding: "8px", fontSize: 12, color: "#888" }}>
                          {o.details ? JSON.stringify(o.details) : "-"}
                        </td>
                      </tr>
                    ))}
                  </PlainTable>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* 编辑客户弹窗 */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`✏️ 编辑客户 — ${c?.username ?? ""}`} width={440}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>邮箱 <span style={{ color: "#e53935" }}>*</span></label>
            <input type="text" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
          </div>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>客户名称 <span style={{ color: "#e53935" }}>*</span></label>
            <input type="text" value={eName} onChange={(e) => setEName(e.target.value)} />
          </div>
          <div className="c3-form-group" style={{ marginBottom: 0 }}>
            <label>状态</label>
            <select value={eStatus} onChange={(e) => setEStatus(e.target.value as "active" | "disabled")}>
              <option value="active">正常</option>
              <option value="disabled">已禁用</option>
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
            <button type="button" className="c3-btn c3-btn--default c3-btn--sm" onClick={() => setEditOpen(false)}>取消</button>
            <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" disabled={editMut.isPending} onClick={submitEdit}>
              {editMut.isPending ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </Modal>

      {/* 重置密码弹窗 — 自动生成 / 手动指定 */}
      <Modal open={resetOpen} onClose={() => { if (!resetPwMut.isPending) { setResetOpen(false); setResetResult(null); } }} title={`🔑 重置密码 — ${c?.username ?? ""}`} width={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#666" }}>
            {c?.email ?? ""} 的登录密码将被重置，旧密码立即失效。
          </p>

          {/* 模式选择：自动生成 / 手动指定 */}
          <div style={{ display: "flex", gap: 8 }}>
            <label
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                padding: "10px 12px", borderRadius: 8, border: resetMode === "auto" ? "1.5px solid var(--color-primary)" : "1px solid #d9d9d9",
                background: resetMode === "auto" ? "rgba(79,110,247,.06)" : "#fff", fontSize: 13,
              }}
            >
              <input type="radio" checked={resetMode === "auto"} onChange={() => { setResetMode("auto"); setResetResult(null); }} />
              <span>
                <b>自动生成</b>
                <div style={{ fontSize: 12, color: "#999" }}>系统生成随机强密码，仅本次可见</div>
              </span>
            </label>
            <label
              style={{
                flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                padding: "10px 12px", borderRadius: 8, border: resetMode === "manual" ? "1.5px solid var(--color-primary)" : "1px solid #d9d9d9",
                background: resetMode === "manual" ? "rgba(79,110,247,.06)" : "#fff", fontSize: 13,
              }}
            >
              <input type="radio" checked={resetMode === "manual"} onChange={() => { setResetMode("manual"); setResetResult(null); }} />
              <span>
                <b>手动指定</b>
                <div style={{ fontSize: 12, color: "#999" }}>自行输入新密码（至少 8 位）</div>
              </span>
            </label>
          </div>

          {resetMode === "manual" ? (
            <div className="c3-form-group" style={{ marginBottom: 0 }}>
              <label>新密码 <span style={{ color: "#e53935" }}>*</span></label>
              <input
                type="text"
                placeholder="至少 8 位"
                value={manualPw}
                onChange={(e) => setManualPw(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#666" }}>
              重置后将生成随机密码（含大写/小写/数字），点击「确认重置」后展示，<b>仅本次可见</b>，请立即复制并安全告知客户。
            </div>
          )}

          {resetResult !== null && (
            <div style={{ background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: "#389e0d", marginBottom: 4 }}>✅ 密码已重置，新密码：</div>
              <code style={{ fontSize: 15, fontWeight: 600, wordBreak: "break-all", userSelect: "all" }}>{resetResult}</code>
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>仅本次展示，关闭后无法再次查看，请及时保存。</div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 6 }}>
            {resetResult === null ? (
              <>
                <button type="button" className="c3-btn c3-btn--default c3-btn--sm" disabled={resetPwMut.isPending} onClick={() => setResetOpen(false)}>取消</button>
                <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" disabled={resetPwMut.isPending} onClick={submitReset}>
                  {resetPwMut.isPending ? "重置中…" : "确认重置"}
                </button>
              </>
            ) : (
              <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => { setResetOpen(false); setResetResult(null); }}>完成</button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
