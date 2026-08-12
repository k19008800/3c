import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { PageHeader, HelpIcon, StatusBadge, SkeletonGroup, EmptyState } from "@3cloud/shared-ui";

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

/** 原型 grid 字段：标签 + 值 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#888" }}>{label}</div>
      <div style={{ marginTop: 2 }}>{children}</div>
    </div>
  );
}

/** 通用区块标题（原型 panel-header h3） */
function BlockTitle({ icon, text }: { icon: string; text: string }) {
  return <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{icon} {text}</h3>;
}

/** 消费记录表格（原型第 2 块面板） */
function ConsumptionTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) return <EmptyState title="暂无消费记录" />;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
          <th style={{ padding: "8px" }}>时间</th>
          <th style={{ padding: "8px" }}>模型</th>
          <th style={{ padding: "8px" }}>输入 Tokens</th>
          <th style={{ padding: "8px" }}>输出 Tokens</th>
          <th style={{ padding: "8px" }}>消费金额</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r: any, i: number) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
            <td style={{ padding: "8px" }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
            <td style={{ padding: "8px" }}>{r.model_name ?? "-"}</td>
            <td style={{ padding: "8px" }}>{r.input_tokens?.toLocaleString() ?? 0}</td>
            <td style={{ padding: "8px" }}>{r.output_tokens?.toLocaleString() ?? 0}</td>
            <td style={{ padding: "8px", fontWeight: 600, color: "#e53935" }}>¥{r.amount?.toFixed(4) ?? "0.00"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminCustomerDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["admin-customer-detail", userId],
    queryFn: async () => (await api.get<{ data: CustomerDetail }>(`/admin/customers/${userId}`)).data.data,
    enabled: !!userId,
  });

  const consumerQ = useQuery({
    queryKey: ["admin-customer-consumption", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/consumption?page_size=50`)).data.data,
    enabled: !!userId,
  });

  const apiKeyQ = useQuery({
    queryKey: ["admin-customer-apikeys", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/api-keys`)).data.data,
    enabled: !!userId,
  });

  const ticketQ = useQuery({
    queryKey: ["admin-customer-tickets", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/tickets?page_size=50`)).data.data,
    enabled: !!userId,
  });

  const c = q.data;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <PageHeader title="客户详情" help="查看客户完整信息：基本资料、消费记录、API Key 列表、工单记录、额度使用。" />
      <button onClick={() => navigate("/admin/customers")} className="c3-back-btn">
        ← 返回客户列表
      </button>

      {q.isLoading ? <SkeletonGroup lines={8} /> : !c ? <EmptyState title="客户不存在" /> : (
        <>
          {/* 客户信息面板 — 原型 panel：header + 3 列 grid */}
          <section className="c3-panel">
            <header className="c3-panel__header">
              <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                👤 客户信息
                <HelpIcon text="查看客户完整信息：基本资料、消费记录、API Key 列表、工单记录、额度使用。" level="page" />
              </h3>
              <div className="c3-btn-group">
                <button type="button" className="c3-btn c3-btn--primary c3-btn--sm" onClick={() => navigate(`/admin/customers/quotas?customer=${c.user_id}`)}>
                  编辑额度
                </button>
                <button type="button" className="c3-btn c3-btn--default c3-btn--sm">重置密码</button>
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
              <Field label="公司">{c.company ?? "-"}</Field>
              <Field label="销售员">{c.salesperson_name ?? "-"}</Field>
              <Field label="额度使用">¥{c.quota_used ?? 0} / ¥{c.quota_total ?? 0}</Field>
              <Field label="标签">
                {(c.tags ?? []).length === 0 ? (
                  "-"
                ) : (
                  <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {(c.tags ?? []).map((t, i) => (
                      <span key={i} style={{ padding: "2px 8px", borderRadius: 12, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text-secondary)" }}>{t}</span>
                    ))}
                  </span>
                )}
              </Field>
            </div>
          </section>

          {/* 消费记录 — 原型独立面板 */}
          <section className="c3-panel">
            <header className="c3-panel__header">
              <BlockTitle icon="📊" text="消费记录" />
            </header>
            <div className="c3-panel__body" style={{ padding: 0 }}>
              {consumerQ.isLoading ? <SkeletonGroup lines={5} /> : <ConsumptionTable rows={consumerQ.data?.list ?? []} />}
            </div>
          </section>

          {/* API Keys — 原型 detail 侧栏提及列表 */}
          <section className="c3-panel">
            <header className="c3-panel__header">
              <BlockTitle icon="🔑" text="API Keys" />
            </header>
            <div className="c3-panel__body" style={{ padding: 0 }}>
              {apiKeyQ.isLoading ? <SkeletonGroup lines={4} /> : (apiKeyQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无 API Key" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "8px" }}>Key 名称</th>
                      <th style={{ padding: "8px" }}>前缀</th>
                      <th style={{ padding: "8px" }}>状态</th>
                      <th style={{ padding: "8px" }}>创建时间</th>
                      <th style={{ padding: "8px" }}>最后使用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeyQ.data?.list.map((k: any) => (
                      <tr key={k.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", fontWeight: 600 }}>{k.name ?? "-"}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace" }}>{k.key_prefix ?? "-"}</td>
                        <td style={{ padding: "8px" }}><StatusBadge status={k.status === "active" ? "success" : "default"}>{k.status_label ?? k.status}</StatusBadge></td>
                        <td style={{ padding: "8px", color: "#888" }}>{k.created_at ? new Date(k.created_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: "8px", color: "#888" }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "从未"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* 工单记录 — 原型 detail 提及列表 */}
          <section className="c3-panel">
            <header className="c3-panel__header">
              <BlockTitle icon="🎫" text="工单记录" />
            </header>
            <div className="c3-panel__body" style={{ padding: 0 }}>
              {ticketQ.isLoading ? <SkeletonGroup lines={4} /> : (ticketQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无工单" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: "#666", textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                      <th style={{ padding: "8px" }}>工单号</th>
                      <th style={{ padding: "8px" }}>标题</th>
                      <th style={{ padding: "8px" }}>类型</th>
                      <th style={{ padding: "8px" }}>状态</th>
                      <th style={{ padding: "8px" }}>创建时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketQ.data?.list.map((t: any) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{t.ticket_no ?? `#${t.id}`}</td>
                        <td style={{ padding: "8px" }}>{t.title ?? "-"}</td>
                        <td style={{ padding: "8px" }}>{t.type_label ?? t.type ?? "-"}</td>
                        <td style={{ padding: "8px" }}><StatusBadge status={t.status === "open" ? "warning" : t.status === "closed" ? "success" : "info"}>{t.status_label ?? t.status}</StatusBadge></td>
                        <td style={{ padding: "8px", color: "#888" }}>{t.created_at ? new Date(t.created_at).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
