import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 演示数据（对齐原型 admin-operation-diff.html 分布） ───────── */

interface DiffRow { id: number; created_at: string; type: string; operator: string; description: string; old_value: string; new_value: string; status: string; }
interface DiffData { list: DiffRow[]; demo?: boolean; }

const MOCK: DiffData = {
  list: [
    { id: 1, created_at: "2026-08-10 11:20", type: "audit", operator: "admin@3cloud.dev", description: "用户角色变更", old_value: "user", new_value: "agent", status: "pending" },
    { id: 2, created_at: "2026-08-10 10:05", type: "finance", operator: "finance@3cloud.dev", description: "余额手动调整", old_value: "¥1,200.00", new_value: "¥1,000.00", status: "pending" },
    { id: 3, created_at: "2026-08-10 09:12", type: "config", operator: "ops@3cloud.dev", description: "风控阈值修改", old_value: "拦截 85%", new_value: "拦截 90%", status: "pending" },
    { id: 4, created_at: "2026-08-09 18:44", type: "customer", operator: "cs@3cloud.dev", description: "客户等级变更", old_value: "normal", new_value: "vip", status: "resolved" },
    { id: 5, created_at: "2026-08-09 15:30", type: "finance", operator: "finance@3cloud.dev", description: "退款金额修改", old_value: "¥500.00", new_value: "¥600.00", status: "resolved" },
    { id: 6, created_at: "2026-08-09 11:02", type: "config", operator: "ops@3cloud.dev", description: "限流规则变更", old_value: "100 QPS", new_value: "80 QPS", status: "ignored" },
  ],
  demo: true,
};

export default function AdminOperationDiffPage() {
  const [type, setType] = useState("");

  const diffQ = useQuery({
    queryKey: ["admin-operation-diff", type],
    queryFn: async () => (await api.get(`/admin/operation/diff?type=${type}`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const data: DiffData = diffQ.data?.list != null ? diffQ.data : MOCK;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>操作差异</h2>
        <HelpIcon text="operation_diff" />
        {data.demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/operation/diff 待接入）</span>}
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={type} onChange={e => setType(e.target.value)}>
          <option value="">全部类型</option>
          <option value="audit">审核差异</option>
          <option value="finance">财务差异</option>
          <option value="customer">客户差异</option>
          <option value="config">配置差异</option>
        </select>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🔄 操作差异记录 <HelpIcon text="operation_diff" /></div>
        {diffQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>类型</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作员</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>差异描述</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>原值</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>新值</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>状态</th>
            </tr></thead>
            <tbody>
              {(data.list ?? []).map((d: DiffRow) => (
                <tr key={d.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{d.created_at}</td>
                  <td style={{ padding: "10px 12px" }}>{d.type}</td>
                  <td style={{ padding: "10px 12px" }}>{d.operator}</td>
                  <td style={{ padding: "10px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{d.description}</td>
                  <td style={{ padding: "10px 12px", color: "#e53935" }}>{d.old_value}</td>
                  <td style={{ padding: "10px 12px", color: "#22c55e" }}>{d.new_value}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11,
                      background: d.status === "resolved" ? "#e8f5e9" : "#fff8e1",
                      color: d.status === "resolved" ? "#2e7d32" : "#e65100" }}>
                      {({ pending: "待处理", resolved: "已解决", ignored: "已忽略" } as Record<string, string>)[d.status] ?? d.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
