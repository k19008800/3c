import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, StatusBadge, Modal, SkeletonGroup, useToast, ConfirmPopover } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 演示数据（对齐原型 admin-agent-customer-approval.html 分布） ───────── */

interface PendingItem { id: number; agent_name: string; customer_email: string; customer_company: string; submitted_at: string; note: string; }
interface ApprovedItem { id: number; agent_name: string; customer_email: string; approved_at: string; reviewer: string; }
interface RejectedItem { id: number; agent_name: string; customer_email: string; rejected_at: string; reject_reason: string; reviewer: string; }
interface BoundItem { id: number; agent_name: string; customer_email: string; bound_at: string; total_commission: string; }

interface ApprovalsData {
  pending: PendingItem[];
  approved: ApprovedItem[];
  rejected: RejectedItem[];
  bound: BoundItem[];
  demo?: boolean;
}

const MOCK: ApprovalsData = {
  pending: [
    { id: 1, agent_name: "深圳智云科技", customer_email: "contact@techvision.cn", customer_company: "深圳视界科技有限公司", submitted_at: "2026-08-07 09:32", note: "新客户，AI视觉项目" },
    { id: 2, agent_name: "上海数联信息", customer_email: "dev@dataflow.io", customer_company: "数流科技（上海）", submitted_at: "2026-08-07 08:15", note: "大数据处理平台客户" },
    { id: 3, agent_name: "北京云端服务", customer_email: "cto@cloudpeak.com", customer_company: "北京云峰网络科技", submitted_at: "2026-08-06 17:45", note: "企业级客户，预计月消耗5万+" },
    { id: 4, agent_name: "深圳智云科技", customer_email: "pm@smartlab.cn", customer_company: "智慧实验室（深圳）", submitted_at: "2026-08-06 14:20", note: "AI实验室客户" },
    { id: 5, agent_name: "广州创智科技", customer_email: "admin@innotech.gz", customer_company: "广州创智信息技术", submitted_at: "2026-08-06 10:08", note: "初创公司，量小但稳定" },
  ],
  approved: [
    { id: 101, agent_name: "深圳智云科技", customer_email: "info@visiontech.cn", approved_at: "2026-08-07 10:05", reviewer: "张明" },
    { id: 102, agent_name: "上海数联信息", customer_email: "dev@flowdata.io", approved_at: "2026-08-07 09:48", reviewer: "张明" },
    { id: 103, agent_name: "北京云端服务", customer_email: "admin@cloudnet.com", approved_at: "2026-08-07 08:30", reviewer: "李芳" },
    { id: 104, agent_name: "深圳智云科技", customer_email: "tech@ailab.cn", approved_at: "2026-08-06 16:12", reviewer: "张明" },
  ],
  rejected: [
    { id: 201, agent_name: "成都西部云", customer_email: "spam@fake.cn", rejected_at: "2026-08-07 09:12", reject_reason: "客户信息不真实，邮箱无法验证", reviewer: "张明" },
    { id: 202, agent_name: "广州创智科技", customer_email: "test@test.com", rejected_at: "2026-08-06 15:20", reject_reason: "测试邮箱，非真实客户", reviewer: "李芳" },
    { id: 203, agent_name: "北京云端服务", customer_email: "nobody@nowhere.cn", rejected_at: "2026-08-06 10:45", reject_reason: "公司名查无工商注册信息", reviewer: "张明" },
  ],
  bound: [
    { id: 301, agent_name: "深圳智云科技", customer_email: "contact@techvision.cn", bound_at: "2026-07-15 10:00", total_commission: "¥12,480.50" },
    { id: 302, agent_name: "上海数联信息", customer_email: "dev@dataflow.io", bound_at: "2026-07-10 14:30", total_commission: "¥8,920.00" },
    { id: 303, agent_name: "北京云端服务", customer_email: "cto@cloudpeak.com", bound_at: "2026-07-08 09:15", total_commission: "¥23,560.80" },
    { id: 304, agent_name: "深圳智云科技", customer_email: "pm@smartlab.cn", bound_at: "2026-07-01 11:45", total_commission: "¥5,670.30" },
  ],
  demo: true,
};

export default function AdminAgentApprovalsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [keyword, setKeyword] = useState("");
  const [agent, setAgent] = useState("");
  const [rejecting, setRejecting] = useState<PendingItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  // 演示兜底：本地可变列表（写操作在演示模式下直接改它）
  const [local, setLocal] = useState<ApprovalsData>(MOCK);

  const listQ = useQuery({
    queryKey: ["admin-agent-approvals"],
    queryFn: async () => (await api.get(`/admin/agents/approvals?keyword=${keyword}&agent=${agent}`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const data: ApprovalsData = listQ.data?.pending != null ? listQ.data : local;
  const demo = listQ.data?.pending == null;

  const approveMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/agents/approvals/${id}/approve`)).data,
    onSuccess: () => { toast.success("已通过"); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any, id?: number) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && id != null) {
        const item = data.pending.find(x => x.id === id);
        if (item) {
          setLocal(prev => ({
            ...prev,
            pending: prev.pending.filter(x => x.id !== id),
            approved: [{ id: item.id, agent_name: item.agent_name, customer_email: item.customer_email, approved_at: "刚刚", reviewer: "当前管理员" }, ...prev.approved],
          }));
        }
        toast.success("已通过（演示）");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const rejectMut = useMutation<any, unknown, { id: number; reason: string }>({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => (await api.post(`/admin/agents/approvals/${id}/reject`, { reason })).data,
    onSuccess: () => { toast.success("已驳回"); setRejecting(null); setRejectReason(""); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any, vars?: { id: number; reason: string }) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && vars) {
        const item = data.pending.find(x => x.id === vars.id);
        if (item) {
          setLocal(prev => ({
            ...prev,
            pending: prev.pending.filter(x => x.id !== vars.id),
            rejected: [{ id: item.id, agent_name: item.agent_name, customer_email: item.customer_email, rejected_at: "刚刚", reject_reason: vars.reason, reviewer: "当前管理员" }, ...prev.rejected],
          }));
        }
        toast.success("已驳回（演示）");
        setRejecting(null); setRejectReason("");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const rereviewMut = useMutation<any, unknown, number>({
    mutationFn: async (id: number) => (await api.post(`/admin/agents/approvals/${id}/re-review`)).data,
    onSuccess: () => { toast.success("已重新审核"); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any, id?: number) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && id != null) {
        const item = data.rejected.find(x => x.id === id);
        if (item) {
          setLocal(prev => ({
            ...prev,
            rejected: prev.rejected.filter(x => x.id !== id),
            pending: [{ id: item.id, agent_name: item.agent_name, customer_email: item.customer_email, customer_company: item.customer_email.split("@")[1] ?? "", submitted_at: "刚刚", note: "重新提交审核" }, ...prev.pending],
          }));
        }
        toast.success("已重新审核（演示）");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const unbindMut = useMutation<any, unknown, { id: number; from: "approved" | "bound" }>({
    mutationFn: async ({ id, from }: { id: number; from: "approved" | "bound" }) => (await api.post(`/admin/agents/approvals/${id}/unbind`)).data,
    onSuccess: () => { toast.success("已解绑"); qc.invalidateQueries({ queryKey: ["admin-agent-approvals"] }); },
    onError: (e: any, vars?: { id: number; from: "approved" | "bound" }) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && vars) {
        setLocal(prev => ({
          ...prev,
          approved: vars.from === "approved" ? prev.approved.filter(x => x.id !== vars.id) : prev.approved,
          bound: vars.from === "bound" ? prev.bound.filter(x => x.id !== vars.id) : prev.bound,
        }));
        toast.success("已解绑（演示）");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const statCard = (color: string, badge: number, icon: string, label: string, value: number, unit: string) => (
    <div style={{ ...card, display: "flex", alignItems: "center", gap: 12, padding: "16px 20px" }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700 }}>{badge}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "#888" }}>{icon} {label}</div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{value}<span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>{unit}</span></div>
      </div>
    </div>
  );

  const subTab = (key: "pending" | "approved" | "rejected", icon: string, label: string, count?: number) => (
    <button onClick={() => setTab(key)} style={{
      padding: "8px 20px", borderRadius: 8, border: tab === key ? "2px solid #4f6ef7" : "1px solid var(--color-border)",
      background: tab === key ? "#eef2ff" : "var(--color-panel)", color: tab === key ? "#4f6ef7" : "#666",
      cursor: "pointer", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 6,
    }}>
      {icon} {label} {count != null && <span style={{ background: tab === key ? "#4f6ef7" : "#e0e0e0", color: tab === key ? "#fff" : "#888", borderRadius: 10, padding: "0 7px", fontSize: 11 }}>{count}</span>}
    </button>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>代理商客户报备审核</h2>
        <HelpIcon text="审核代理商提交的客户报备申请。通过后客户与代理商建立绑定关系，客户消费计入代理商佣金。" level="page" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/agents/approvals 待接入）</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 20 }}>
        {statCard("#e53935", data.pending.length, "⏳", "待审核报备", data.pending.length, "笔")}
        {statCard("#4f6ef7", data.approved.length, "✅", "今日通过", data.approved.length, "笔")}
        {statCard("#f59e0b", data.rejected.length, "❌", "今日驳回", data.rejected.length, "笔")}
      </div>

      <div style={{ ...card, marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)" }}
          value={agent} onChange={e => setAgent(e.target.value)}>
          <option value="">全部代理商</option>
          <option value="深圳智云科技">深圳智云科技</option>
          <option value="上海数联信息">上海数联信息</option>
          <option value="北京云端服务">北京云端服务</option>
        </select>
        <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
          placeholder="搜索客户邮箱/公司名..." value={keyword} onChange={e => setKeyword(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {subTab("pending", "⏳", "待审核", data.pending.length)}
        {subTab("approved", "✅", "已通过", data.approved.length)}
        {subTab("rejected", "❌", "已驳回", data.rejected.length)}
      </div>

      {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
        <>
          {tab === "pending" && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>待审核报备列表 <HelpIcon text="查看待审核的报备列表，点击「通过」或「驳回」进行审核操作。" /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户公司名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>报备时间</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>备注</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
                </tr></thead>
                <tbody>
                  {data.pending.map((p: PendingItem) => (
                    <tr key={p.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{p.agent_name}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{p.customer_email}</td>
                      <td style={{ padding: "10px 12px" }}>{p.customer_company}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{p.submitted_at}</td>
                      <td style={{ padding: "10px 12px", color: "#888" }}>{p.note}</td>
                      <td style={{ padding: "10px 12px", display: "flex", gap: 4 }}>
                        <button style={{ ...btnBase, background: "#22c55e", color: "#fff", fontSize: 12 }}
                          onClick={() => approveMut.mutate(p.id)}>通过</button>
                        <button style={{ ...btnBase, background: "#fff", border: "1px solid #e53935", color: "#e53935", fontSize: 12 }}
                          onClick={() => { setRejecting(p); setRejectReason(""); }}>驳回</button>
                      </td>
                    </tr>
                  ))}
                  {data.pending.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无待审核报备</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === "approved" && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>已通过报备列表 <HelpIcon text="查看已通过的报备记录，如需解除绑定关系可点击「解绑」。" /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>通过时间</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>审核人</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
                </tr></thead>
                <tbody>
                  {data.approved.map((a: ApprovedItem) => (
                    <tr key={a.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{a.agent_name}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{a.customer_email}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{a.approved_at}</td>
                      <td style={{ padding: "10px 12px" }}>{a.reviewer}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <ConfirmPopover title={`确认解绑 ${a.customer_email}？`} onConfirm={() => unbindMut.mutate({ id: a.id, from: "approved" })}>
                          <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}>解绑</button>
                        </ConfirmPopover>
                      </td>
                    </tr>
                  ))}
                  {data.approved.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无已通过报备</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === "rejected" && (
            <div style={card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>已驳回报备列表 <HelpIcon text="查看被驳回的报备记录，可点击「重新审核」重新进入审核流程。" /></div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>驳回时间</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>驳回原因</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>审核人</th>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
                </tr></thead>
                <tbody>
                  {data.rejected.map((r: RejectedItem) => (
                    <tr key={r.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>{r.agent_name}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{r.customer_email}</td>
                      <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{r.rejected_at}</td>
                      <td style={{ padding: "10px 12px", color: "#e53935" }}>{r.reject_reason}</td>
                      <td style={{ padding: "10px 12px" }}>{r.reviewer}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 12 }}
                          onClick={() => rereviewMut.mutate(r.id)}>重新审核</button>
                      </td>
                    </tr>
                  ))}
                  {data.rejected.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无已驳回报备</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>已绑定客户列表 <HelpIcon text="展示当前所有代理商-客户绑定关系及累计贡献佣金。" /></div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f8f9fa" }}>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>代理商名</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>客户邮箱</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>绑定时间</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>累计贡献佣金</th>
                <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
              </tr></thead>
              <tbody>
                {data.bound.map((b: BoundItem) => (
                  <tr key={b.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500 }}>{b.agent_name}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12 }}>{b.customer_email}</td>
                    <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{b.bound_at}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#22c55e" }}>{b.total_commission}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <ConfirmPopover title={`确认解绑 ${b.customer_email}？`} onConfirm={() => unbindMut.mutate({ id: b.id, from: "bound" })}>
                        <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd", fontSize: 12 }}>解绑</button>
                      </ConfirmPopover>
                    </td>
                  </tr>
                ))}
                {data.bound.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无绑定客户</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rejecting && (
        <Modal open onClose={() => setRejecting(null)} title={`驳回报备 · ${rejecting.customer_email}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
            <div style={{ fontSize: 13, color: "#666" }}>
              代理商：{rejecting.agent_name} · 客户：{rejecting.customer_company}
            </div>
            <label>驳回原因 <span style={{ color: "#e53935" }}>*</span>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="请填写驳回原因（必填）"
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", minHeight: 80, marginTop: 4 }} />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
              <button style={{ ...btnBase, background: "#fff", border: "1px solid #ddd" }} onClick={() => setRejecting(null)}>取消</button>
              <button style={{ ...btnBase, background: "#e53935", color: "#fff" }}
                disabled={!rejectReason.trim()}
                onClick={() => rejectMut.mutate({ id: rejecting.id, reason: rejectReason.trim() })}>确认驳回</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
