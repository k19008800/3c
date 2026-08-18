import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, Pagination, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 真实接口契约（GET /admin/security/incidents） ───────── */

interface IncidentRow {
  id: number;
  incident_type: string;
  severity: string;
  status: string; // open | resolved | ignored
  description: string | null;
  affected: string | null;
  user_email: string | null;
  handler: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface IncidentData {
  list: IncidentRow[];
  pagination: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

export default function AdminSecurityIncidentPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<IncidentRow | null>(null);

  const listQ = useQuery<IncidentData>({
    queryKey: ["admin-security-incidents", status, page],
    queryFn: async () => (await api.get(`/admin/security/incidents?status=${status}&page=${page}&page_size=${PAGE_SIZE}`)).data.data,
    retry: 0,
  });

  const handleMut = useMutation<any, unknown, { id: number; op: string }>({
    mutationFn: async ({ id, op }: { id: number; op: string }) =>
      (await api.post(`/admin/security/incidents/${id}/${op}`, {})).data,
    onSuccess: () => { toast.success("操作成功"); setDetail(null); qc.invalidateQueries({ queryKey: ["admin-security-incidents"] }); },
    onError: (e: any) => { toast.error(extractError(e)); },
  });

  const list = listQ.data?.list ?? [];
  const total = listQ.data?.pagination?.total ?? 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>安全事件响应</h2>
        <HelpIcon text="security_incident" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="">全部状态</option>
          <option value="open">待处理</option>
          <option value="resolved">已解决</option>
          <option value="ignored">已忽略</option>
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>共 {total} 条</span>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🛡️ 安全事件列表 <HelpIcon text="security_incident" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>ID</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>事件类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>严重度</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>受影响</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>处理人</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {list.map((inc: IncidentRow) => (
                <tr key={inc.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888" }}>#{inc.id}</td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{inc.created_at?.slice(0, 19).replace("T", " ")}</td>
                  <td style={{ padding: "10px 12px" }}>{inc.incident_type}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={inc.severity === "critical" ? "danger" : inc.severity === "high" ? "warning" : "info"}>
                      {({ critical: "严重", high: "高", medium: "中", low: "低" } as Record<string, string>)[inc.severity] ?? inc.severity}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{inc.affected ?? (inc.user_email ?? "—")}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={inc.status === "open" ? "danger" : inc.status === "resolved" ? "success" : "default"}>
                      {({ open: "待处理", resolved: "已解决", ignored: "已忽略" } as Record<string, string>)[inc.status] ?? inc.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{inc.handler ?? "—"}</td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                    <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}
                      onClick={() => setDetail(inc)}>查看</button>
                    {inc.status === "open" && (
                      <>
                        <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }}
                          onClick={() => handleMut.mutate({ id: inc.id, op: "resolve" })}>解决</button>
                        <button style={{ ...btnBase, background: "#f59e0b", color: "#fff", fontSize: 12 }}
                          onClick={() => handleMut.mutate({ id: inc.id, op: "ignore" })}>忽略</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && !listQ.isLoading && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无安全事件</td></tr>
              )}
            </tbody>
          </table>
        )}
        {total > PAGE_SIZE && (
          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12 }}>
            <Pagination current={page} total={total} pageSize={PAGE_SIZE} onChange={(p) => setPage(p)} />
          </div>
        )}
      </div>

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`安全事件 #${detail.id}`}>
          <div style={{ padding: 10, fontSize: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><strong>类型:</strong> {detail.incident_type}</div>
              <div><strong>严重度:</strong> {detail.severity}</div>
              <div><strong>时间:</strong> {detail.created_at?.slice(0, 19).replace("T", " ")}</div>
              <div><strong>状态:</strong> {({ open: "待处理", resolved: "已解决", ignored: "已忽略" } as Record<string, string>)[detail.status] ?? detail.status}</div>
              <div><strong>受影响:</strong> {detail.affected ?? (detail.user_email ?? "—")}</div>
              <div><strong>处理人:</strong> {detail.handler ?? "—"}</div>
            </div>
            <div style={{ marginTop: 12 }}><strong>详情:</strong> {detail.description ?? "—"}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
