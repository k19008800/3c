import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../../lib/api";
import { HelpIcon, Modal, SkeletonGroup, useToast, ConfirmPopover } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 演示数据（对齐原型 admin-security-ip-blacklist.html 分布） ───────── */

interface IpRow { id: number; ip: string; reason: string; created_at: string; operator: string; }
interface IpData { list: IpRow[]; demo?: boolean; }

const MOCK: IpData = {
  list: [
    { id: 1, ip: "203.0.113.45", reason: "暴力破解尝试", created_at: "2026-08-10 12:15", operator: "安全组-王工" },
    { id: 2, ip: "198.51.100.23", reason: "API 滥用", created_at: "2026-08-10 10:40", operator: "安全组-李工" },
    { id: 3, ip: "192.0.2.88", reason: "爬虫抓取", created_at: "2026-08-09 22:03", operator: "系统自动" },
    { id: 4, ip: "185.220.101.5", reason: "撞库攻击", created_at: "2026-08-09 16:30", operator: "安全组-王工" },
    { id: 5, ip: "45.155.204.11", reason: "账户盗用", created_at: "2026-08-08 09:12", operator: "安全组-李工" },
  ],
  demo: true,
};

export default function AdminSecurityIpBlacklistPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [addForm, setAddForm] = useState({ ip: "", reason: "" });
  const [showAdd, setShowAdd] = useState(false);
  // 演示兜底：本地可变列表（写操作在演示模式下直接改它）
  const [localList, setLocalList] = useState<IpRow[]>(MOCK.list);

  const listQ = useQuery({
    queryKey: ["admin-ip-blacklist", keyword],
    queryFn: async () => (await api.get(`/admin/security/ip-blacklist?keyword=${keyword}`)).data.data,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const list = listQ.data?.list != null ? listQ.data.list : localList;
  const demo = listQ.data?.list == null;

  const addMut = useMutation({
    mutationFn: async (body: { ip: string; reason: string }) =>
      (await api.post("/admin/security/ip-blacklist", body)).data,
    onSuccess: () => { toast.success("IP 已加入黑名单"); setShowAdd(false); setAddForm({ ip: "", reason: "" }); qc.invalidateQueries({ queryKey: ["admin-ip-blacklist"] }); },
    onError: (e: any, vars?: { ip: string; reason: string }) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && vars) {
        const next: IpRow = { id: Date.now(), ip: vars.ip, reason: vars.reason, created_at: "刚刚", operator: "当前管理员" };
        setLocalList(prev => [...prev, next]);
        toast.success("IP 已加入黑名单（演示）");
        setShowAdd(false); setAddForm({ ip: "", reason: "" });
      } else {
        toast.error(extractError(e));
      }
    },
  });

  const removeMut = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/admin/security/ip-blacklist/${id}`)).data,
    onSuccess: () => { toast.success("已移除"); qc.invalidateQueries({ queryKey: ["admin-ip-blacklist"] }); },
    onError: (e: any, id?: number) => {
      // 演示模式：后端未实现时本地生效
      if (e?.response?.status === 404 && id != null) {
        setLocalList(prev => prev.filter(x => x.id !== id));
        toast.success("已移除（演示）");
      } else {
        toast.error(extractError(e));
      }
    },
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>IP 黑名单管理</h2>
        <HelpIcon text="ip_blacklist" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/security/ip-blacklist 待接入）</span>}
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, flex: 1 }}>
          <input style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", flex: 1 }}
            placeholder="搜索 IP 地址..." value={keyword} onChange={e => setKeyword(e.target.value)} />
        </div>
        <button style={{ ...btnBase, background: "#e53935", color: "#fff" }} onClick={() => setShowAdd(true)}>＋ 添加 IP</button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>🌍 IP 黑名单列表 <HelpIcon text="ip_blacklist" /></div>
        {listQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#f8f9fa" }}>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>IP 地址</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>加入原因</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>加入时间</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作人</th>
              <th style={{ padding: "10px 12px", textAlign: "left" }}>操作</th>
            </tr></thead>
            <tbody>
              {(list ?? []).map((ip: IpRow) => (
                <tr key={ip.id} style={{ borderTop: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 500 }}>{ip.ip}</td>
                  <td style={{ padding: "10px 12px" }}>{ip.reason}</td>
                  <td style={{ padding: "10px 12px", color: "#888", fontSize: 12 }}>{ip.created_at}</td>
                  <td style={{ padding: "10px 12px", color: "#888" }}>{ip.operator}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <ConfirmPopover title={`确认移除 ${ip.ip}？`} onConfirm={() => removeMut.mutate(ip.id)}>
                      <button style={{ ...btnBase, background: "#fff", border: "1px solid #e53935", color: "#e53935", fontSize: 12 }}>移除</button>
                    </ConfirmPopover>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal open onClose={() => setShowAdd(false)} title="添加 IP 到黑名单">
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 10 }}>
            <label>IP 地址 <input placeholder="例: 192.168.1.1" value={addForm.ip} onChange={e => setAddForm({ ...addForm, ip: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%" }} /></label>
            <label>封禁原因 <textarea value={addForm.reason} onChange={e => setAddForm({ ...addForm, reason: e.target.value })}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", width: "100%", minHeight: 60 }} /></label>
            <button style={{ ...btnBase, background: "#e53935", color: "#fff", marginTop: 8 }}
              onClick={() => addMut.mutate(addForm)}>确认加入黑名单</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
