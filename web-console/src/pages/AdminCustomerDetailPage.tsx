import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, SkeletonGroup, EmptyState } from "@3cloud/shared-ui";

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

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)", marginBottom: 16 };
const statusMap: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  lead: "warning", trial: "info", active: "success", silent: "default", churned: "danger",
};

export default function AdminCustomerDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"info" | "consumption" | "apikeys" | "tickets">("info");

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

  const apiKeyQ = useQuery({
    queryKey: ["admin-customer-apikeys", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/api-keys`)).data.data,
    enabled: !!userId && tab === "apikeys",
  });

  const ticketQ = useQuery({
    queryKey: ["admin-customer-tickets", userId],
    queryFn: async () => (await api.get<{ data: { list: any[] } }>(`/admin/customers/${userId}/tickets?page_size=50`)).data.data,
    enabled: !!userId && tab === "tickets",
  });

  const tabs = [
    { key: "info", label: "基本信息" },
    { key: "consumption", label: "消费记录" },
    { key: "apikeys", label: "API Keys" },
    { key: "tickets", label: "工单记录" },
  ];

  const c = q.data;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <button onClick={() => navigate("/admin/customers")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--color-primary)" }}>←</button>
        <h2 style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
          客户详情
          <HelpIcon text="查看客户完整信息：基本资料、消费记录、API Key 列表、工单记录、额度使用。" level="page" />
        </h2>
      </div>

      {q.isLoading ? <SkeletonGroup lines={8} /> : !c ? <EmptyState title="客户不存在" /> : (
        <>
          <div style={card}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>ID</div>
                <div style={{ fontWeight: 600 }}>{c.user_id}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>用户名</div>
                <div style={{ fontWeight: 600 }}>{c.username || "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>邮箱</div>
                <div>{c.email}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>余额</div>
                <div style={{ fontWeight: 700, color: "var(--color-success-text)", fontSize: 18 }}>¥{(c.balance ?? 0).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>状态</div>
                <div><StatusBadge status={statusMap[c.status] ?? "default"}>{c.status_label}</StatusBadge></div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>实名认证</div>
                <div><StatusBadge status={c.real_name_verified ? "success" : "default"}>{c.real_name_label || (c.real_name_verified ? "已认证" : "未认证")}</StatusBadge></div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>手机</div>
                <div>{c.phone ?? "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>公司</div>
                <div>{c.company ?? "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>销售员</div>
                <div>{c.salesperson_name ?? "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>注册时间</div>
                <div>{c.created_at ? new Date(c.created_at).toLocaleString() : "-"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>额度使用</div>
                <div>¥{c.quota_used ?? 0} / ¥{c.quota_total ?? 0}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>标签</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(c.tags ?? []).map((t, i) => (
                    <span key={i} style={{ padding: "2px 8px", borderRadius: 12, background: "var(--color-bg)", fontSize: 12, color: "var(--color-text-secondary)" }}>{t}</span>
                  ))}
                  {(c.tags ?? []).length === 0 && <span>-</span>}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)} style={{
                padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border)",
                cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: tab === t.key ? "var(--color-primary)" : "var(--color-panel)",
                color: tab === t.key ? "#fff" : "var(--color-text-secondary)",
              }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === "consumption" && (
            <div style={card}>
              <h4 style={{ margin: "0 0 12px 0" }}>📊 消费记录</h4>
              {consumerQ.isLoading ? <SkeletonGroup lines={5} /> : (consumerQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无消费记录" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>时间</th><th style={{ padding: "8px" }}>模型</th>
                    <th style={{ padding: "8px" }}>输入 Tokens</th><th style={{ padding: "8px" }}>输出 Tokens</th>
                    <th style={{ padding: "8px" }}>消费金额</th>
                  </tr></thead>
                  <tbody>
                    {consumerQ.data?.list.map((r: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px" }}>{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: "8px" }}>{r.model_name ?? "-"}</td>
                        <td style={{ padding: "8px" }}>{r.input_tokens?.toLocaleString() ?? 0}</td>
                        <td style={{ padding: "8px" }}>{r.output_tokens?.toLocaleString() ?? 0}</td>
                        <td style={{ padding: "8px", fontWeight: 600, color: "var(--color-danger-text)" }}>¥{r.amount?.toFixed(4) ?? "0.00"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "apikeys" && (
            <div style={card}>
              <h4 style={{ margin: "0 0 12px 0" }}>🔑 API Keys</h4>
              {apiKeyQ.isLoading ? <SkeletonGroup lines={4} /> : (apiKeyQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无 API Key" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>Key 名称</th><th style={{ padding: "8px" }}>前缀</th>
                    <th style={{ padding: "8px" }}>状态</th><th style={{ padding: "8px" }}>创建时间</th>
                    <th style={{ padding: "8px" }}>最后使用</th>
                  </tr></thead>
                  <tbody>
                    {apiKeyQ.data?.list.map((k: any) => (
                      <tr key={k.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", fontWeight: 600 }}>{k.name ?? "-"}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace" }}>{k.key_prefix ?? "-"}</td>
                        <td style={{ padding: "8px" }}><StatusBadge status={k.status === "active" ? "success" : "default"}>{k.status_label ?? k.status}</StatusBadge></td>
                        <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{k.created_at ? new Date(k.created_at).toLocaleString() : "-"}</td>
                        <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "从未"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "tickets" && (
            <div style={card}>
              <h4 style={{ margin: "0 0 12px 0" }}>🎫 工单记录</h4>
              {ticketQ.isLoading ? <SkeletonGroup lines={4} /> : (ticketQ.data?.list?.length ?? 0) === 0 ? <EmptyState title="暂无工单" /> : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ color: "var(--color-text-secondary)", textAlign: "left" }}>
                    <th style={{ padding: "8px" }}>工单号</th><th style={{ padding: "8px" }}>标题</th>
                    <th style={{ padding: "8px" }}>类型</th><th style={{ padding: "8px" }}>状态</th>
                    <th style={{ padding: "8px" }}>创建时间</th>
                  </tr></thead>
                  <tbody>
                    {ticketQ.data?.list.map((t: any) => (
                      <tr key={t.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{t.ticket_no ?? `#${t.id}`}</td>
                        <td style={{ padding: "8px" }}>{t.title ?? "-"}</td>
                        <td style={{ padding: "8px" }}>{t.type_label ?? t.type ?? "-"}</td>
                        <td style={{ padding: "8px" }}><StatusBadge status={t.status === "open" ? "warning" : t.status === "closed" ? "success" : "info"}>{t.status_label ?? t.status}</StatusBadge></td>
                        <td style={{ padding: "8px", color: "var(--color-text-secondary)" }}>{t.created_at ? new Date(t.created_at).toLocaleString() : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
