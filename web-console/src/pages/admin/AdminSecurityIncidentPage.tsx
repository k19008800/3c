import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 演示数据（对齐原型 admin-security-incident.html 分布） ───────── */

interface IncidentRow { id: number; created_at: string; incident_type: string; severity: string; affected: string; status: string; handler: string | null; description?: string; }
interface IncidentData { list: IncidentRow[]; demo?: boolean; }

const MOCK: IncidentData = {
  list: [
    { id: 1, created_at: "2026-08-10 13:22", incident_type: "暴力破解", severity: "critical", affected: "3 个账户", status: "open", handler: null, description: "检测到 5 分钟内对多个账户的暴力密码尝试，源 IP 已临时封禁。" },
    { id: 2, created_at: "2026-08-10 11:05", incident_type: "API 滥用", severity: "high", affected: "1 个 API Key", status: "investigating", handler: "安全组-王工", description: "单个 API Key 短时间内请求量激增，疑似被滥用，正在排查调用来源。" },
    { id: 3, created_at: "2026-08-10 09:48", incident_type: "异常登录", severity: "medium", affected: "2 个账户", status: "mitigated", handler: "安全组-李工", description: "非常用设备登录成功，已发送告警并要求二次验证。" },
    { id: 4, created_at: "2026-08-09 18:30", incident_type: "数据导出异常", severity: "medium", affected: "1 个机构", status: "resolved", handler: "安全组-王工", description: "数据调取请求导出目录权限配置错误，已修复并复核日志。" },
    { id: 5, created_at: "2026-08-09 14:12", incident_type: "钓鱼邮件", severity: "high", affected: "平台全员", status: "closed", handler: "安全组-李工", description: "伪装为平台官方的钓鱼邮件，已全部标记并通知用户。" },
  ],
  demo: true,
};

export default function AdminSecurityIncidentPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<any>(null);
  // 演示兜底：本地可变列表（写操作在演示模式下直接改它）
  const [localList, setLocalList] = useState<IncidentRow[]>(MOCK.list);

  const listQ = useQuery({
    queryKey: ["admin-security-incidents", status],
    queryFn: async () => (await api.get(`/admin/security/incidents?status=${status}&page_size=50`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const list = listQ.data?.list != null ? listQ.data.list : localList;
  const demo = listQ.data?.list == null;

  const handleMut = useMutation({
    mutationFn: async ({ id, op, reason }: { id: number; op: string; reason?: string }) =>
      (await api.post(`/admin/security/incidents/${id}/${op}`, { reason })).data,
    onSuccess: () => { toast.success("操作成功"); setDetail(null); qc.invalidateQueries({ queryKey: ["admin-security-incidents"] }); },
    onError: (e: any, vars?: { id: number; op: string }) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && vars) {
        const { id, op } = vars;
        if (op === "investigate") {
          setLocalList(prev => prev.map(x => x.id === id ? { ...x, status: "investigating", handler: "当前管理员" } : x));
          toast.success("已接手（演示）");
        } else if (op === "resolve") {
          setLocalList(prev => prev.map(x => x.id === id ? { ...x, status: "resolved" } : x));
          toast.success("已解决（演示）");
        } else {
          toast.success("操作成功（演示）");
        }
        setDetail(null);
      } else {
        toast.error(extractError(e));
      }
    },
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>安全事件响应</h2>
        <HelpIcon text="security_incident" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/security/incidents 待接入）</span>}
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="open">待处理</option>
          <option value="investigating">调查中</option>
          <option value="mitigated">已缓解</option>
          <option value="resolved">已解决</option>
          <option value="closed">已关闭</option>
        </select>
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
              {(list ?? []).map((inc: IncidentRow) => (
                <tr key={inc.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888" }}>#{inc.id}</td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{inc.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{inc.incident_type}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={inc.severity === "critical" ? "danger" : inc.severity === "high" ? "warning" : "info"}>
                      {({ critical: "严重", high: "高", medium: "中", low: "低" } as Record<string, string>)[inc.severity] ?? inc.severity}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px" }}>{inc.affected}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StatusBadge status={inc.status === "open" ? "danger" : inc.status === "investigating" ? "warning" : inc.status === "resolved" ? "success" : "default"}>
                      {({ open: "待处理", investigating: "调查中", mitigated: "已缓解", resolved: "已解决", closed: "已关闭" } as Record<string, string>)[inc.status] ?? inc.status}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{inc.handler ?? "—"}</td>
                  <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                    <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}
                      onClick={() => setDetail(inc)}>查看</button>
                    {inc.status === "open" && (
                      <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 12 }}
                        onClick={() => handleMut.mutate({ id: inc.id, op: "investigate" })}>接手</button>
                    )}
                    {inc.status === "investigating" && (
                      <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }}
                        onClick={() => handleMut.mutate({ id: inc.id, op: "resolve" })}>解决</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`安全事件 #${detail.id}`}>
          <div style={{ padding: 10, fontSize: 13 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><strong>类型:</strong> {detail.incident_type}</div>
              <div><strong>严重度:</strong> {detail.severity}</div>
              <div><strong>时间:</strong> {detail.created_at}</div>
              <div><strong>状态:</strong> {detail.status}</div>
              <div><strong>受影响:</strong> {detail.affected}</div>
              <div><strong>处理人:</strong> {detail.handler ?? "—"}</div>
            </div>
            <div style={{ marginTop: 12 }}><strong>详情:</strong> {detail.description ?? "—"}</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
