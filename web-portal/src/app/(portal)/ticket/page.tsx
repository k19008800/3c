"use client";

import React, { useState, useRef } from "react";
import { StatusBadge, useToast } from "@3cloud/shared-ui";

type TStatus = "pending" | "processing" | "replied" | "resolved";
interface Msg { role: "customer" | "staff"; text: string; time: string; }
interface Ticket { id: string; title: string; type: string; status: TStatus; createdAt: string; lastReply: string; messages: Msg[]; }

const S: Record<TStatus, { l: string; s: "warning" | "info" | "success" | "default" }> = {
  pending: { l: "待处理", s: "warning" }, processing: { l: "处理中", s: "info" },
  replied: { l: "已回复", s: "success" }, resolved: { l: "已解决", s: "default" },
};

function now() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

const INIT: Ticket[] = [
  { id: "TK-20260805-001", title: "API 调用频繁返回 429 限流", type: "技术问题", status: "processing", createdAt: "2026-08-05 09:12", lastReply: "2026-08-05 14:30", messages: [
    { role: "customer", text: "我们的服务在高峰期大量收到 429 错误，请问是否可以提升速率限制？", time: "2026-08-05 09:12" },
    { role: "staff", text: "您好，已查看到您的账户 RPM 配额为 600/分钟。我们可以为您升级到企业版，RPM 提升至 3000/分钟。", time: "2026-08-05 11:45" },
    { role: "customer", text: "好的，请帮我升级。费用怎么算？", time: "2026-08-05 14:30" }],
  },
  { id: "TK-20260804-006", title: "发票抬头信息修改", type: "计费咨询", status: "replied", createdAt: "2026-08-04 16:20", lastReply: "2026-08-05 10:00", messages: [
    { role: "customer", text: "请帮我将发票抬头从「个人」改为「上海三云科技有限公司」。", time: "2026-08-04 16:20" },
    { role: "staff", text: "已为您更新发票抬头信息，下次开票时自动生效。", time: "2026-08-05 10:00" }],
  },
  { id: "TK-20260803-012", title: "希望支持 DeepSeek-V4 模型", type: "功能建议", status: "pending", createdAt: "2026-08-03 08:45", lastReply: "—", messages: [{ role: "customer", text: "希望平台能尽快接入 DeepSeek-V4 模型。", time: "2026-08-03 08:45" }] },
  { id: "TK-20260802-003", title: "账户无法登录", type: "账户问题", status: "resolved", createdAt: "2026-08-02 10:30", lastReply: "2026-08-03 15:20", messages: [
    { role: "customer", text: "今天突然无法登录，一直提示凭据无效。", time: "2026-08-02 10:30" },
    { role: "staff", text: "检测到您的账户因安全策略触发了临时锁定，已为您解除。", time: "2026-08-02 14:00" },
    { role: "customer", text: "已重置密码，登录成功。感谢！", time: "2026-08-03 15:20" }],
  },
];

const panel = { background: "var(--color-panel)", borderRadius: 12, boxShadow: "var(--shadow-panel)", overflow: "hidden" };
const th: React.CSSProperties = { textAlign: "left", padding: "14px 16px", background: "var(--color-table-header-bg)", fontSize: 13, color: "var(--color-text-secondary)", fontWeight: 500, borderBottom: "1px solid var(--color-divider)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "14px 16px", borderBottom: "1px solid var(--color-divider-light)", fontSize: 13, color: "var(--color-text)" };

export default function TicketsPage() {
  const { toast } = useToast();
  const [tickets, setTickets] = useState(INIT);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"list" | "detail">("list");
  const [idx, setIdx] = useState(-1);
  const [showNew, setShowNew] = useState(false);
  const [showPop, setShowPop] = useState(false);
  const [fTitle, setFTitle] = useState(""); const [fType, setFType] = useState("技术问题");
  const [fDesc, setFDesc] = useState(""); const [files, setFiles] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
  const cur = idx >= 0 ? tickets[idx] : null;

  const showDetail = (i: number) => { setIdx(i); setView("detail"); };

  const handleCreate = () => {
    if (!fTitle.trim()) { toast.error("请输入工单标题"); return; }
    if (!fDesc.trim()) { toast.error("请填写问题描述"); return; }
    const ts = now();
    const newT: Ticket = { id: "TK-" + ts.replace(/[-: ]/g, "").slice(0, 8) + "-" + String(Math.floor(Math.random() * 900 + 100)), title: fTitle, type: fType, status: "pending", createdAt: ts, lastReply: "—", messages: [{ role: "customer", text: fDesc + (files.length ? "\n\n附件：" + files.join("、") : ""), time: ts }] };
    setTickets(prev => [newT, ...prev]); setShowNew(false); setFTitle(""); setFDesc(""); setFType("技术问题"); setFiles([]); toast.success("工单已提交");
  };

  const submitReply = () => {
    if (!reply.trim()) { toast.error("请输入回复内容"); return; }
    if (idx < 0) return;
    const ts = now();
    setTickets(prev => prev.map((t, i) => i !== idx ? t : { ...t, lastReply: ts, status: t.status === "pending" ? "replied" : t.status, messages: [...t.messages, { role: "customer" as const, text: reply, time: ts }] }));
    setReply(""); toast.success("回复已发送");
  };

  const resolve = () => { setTickets(prev => prev.map((t, i) => i !== idx ? t : { ...t, status: "resolved" })); setShowPop(false); toast.success("工单已解决"); };

  return (
    <div style={{ padding: "var(--main-padding)" }}>
      {view === "list" && (<>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 13 }}>
            <option value="all">全部状态</option><option value="pending">待处理</option><option value="processing">处理中</option><option value="replied">已回复</option><option value="resolved">已解决</option>
          </select>
          <button onClick={() => setShowNew(true)} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, cursor: "pointer" }}>＋ 创建工单</button>
        </div>
        <div style={panel}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["工单号","标题","类型","状态","创建时间","最后回复","操作"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.length === 0 ? <tr><td colSpan={7} style={{ textAlign: "center", padding: 60, color: "var(--color-text-secondary)" }}>暂无工单</td></tr> : filtered.map(t => { const si = tickets.indexOf(t); return (
                  <tr key={t.id}><td style={{ ...td, color: "var(--color-primary)", fontWeight: 600 }}>{t.id}</td><td style={td}>{t.title}</td><td style={td}>{t.type}</td><td style={td}><StatusBadge status={S[t.status].s}>{S[t.status].l}</StatusBadge></td><td style={td}>{t.createdAt}</td><td style={td}>{t.lastReply}</td><td style={td}><a onClick={() => showDetail(si)} style={{ color: "var(--color-primary)", cursor: "pointer", fontSize: 13 }}>查看详情</a></td></tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      </>)}

      {view === "detail" && cur && (<>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setView("list")} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", fontSize: 13, cursor: "pointer" }}>← 返回列表</button>
            <span style={{ fontSize: 20, fontWeight: 600 }}>{cur.title}</span>
          </div>
          {cur.status !== "resolved" && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setShowPop(!showPop)} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, cursor: "pointer" }}>✓ 确认解决</button>
              {showPop && <div style={{ position: "absolute", bottom: "100%", right: 0, marginBottom: 8, background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, boxShadow: "0 -4px 16px rgba(0,0,0,0.1)", zIndex: 10, whiteSpace: "nowrap" }}>
                <p style={{ fontSize: 13, marginBottom: 10 }}>确认将此工单标记为已解决？</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={resolve} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--color-success-text)", color: "#fff", fontSize: 12, cursor: "pointer" }}>确认</button>
                  <button onClick={() => setShowPop(false)} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", fontSize: 12, cursor: "pointer" }}>取消</button>
                </div>
              </div>}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 20, fontSize: 13, color: "var(--color-text-secondary)" }}>
          <span>工单号：{cur.id}</span><span>类型：{cur.type}</span><span>状态：<StatusBadge status={S[cur.status].s}>{S[cur.status].l}</StatusBadge></span><span>创建时间：{cur.createdAt}</span>
        </div>

        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 24, maxHeight: 500, overflowY: "auto", marginBottom: 20, boxShadow: "var(--shadow-card)" }}>
          {cur.messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 16, maxWidth: "70%", textAlign: m.role === "staff" ? "right" : "left", marginLeft: m.role === "staff" ? "auto" : 0 }}>
              <div style={{ display: "inline-block", padding: "12px 16px", borderRadius: 12, background: m.role === "staff" ? "var(--color-info-bg)" : "var(--color-disabled-bg)", border: `1px solid ${m.role === "staff" ? "#c5d4ff" : "var(--color-border)"}`, fontSize: 14, lineHeight: 1.6, color: "var(--color-text)", borderBottomRightRadius: m.role === "staff" ? 4 : 12, borderBottomLeftRadius: m.role === "customer" ? 4 : 12 }}>{m.text}</div>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>{m.time}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 16, boxShadow: "var(--shadow-card)" }}>
          <textarea value={reply} onChange={e => setReply(e.target.value)} placeholder="输入回复内容…" style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: 6, padding: 12, fontSize: 14, minHeight: 80, resize: "vertical", outline: "none", fontFamily: "inherit", background: "var(--color-panel)", color: "var(--color-text)" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
            <button onClick={() => setReply("")} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", fontSize: 13, cursor: "pointer" }}>清空</button>
            <button onClick={submitReply} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, cursor: "pointer" }}>发送回复</button>
          </div>
        </div>
      </>)}

      {/* Create Modal */}
      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: "fixed", inset: 0, background: "var(--color-modal-overlay)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--color-panel)", borderRadius: 16, width: 520, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--color-divider)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 16 }}>创建工单</h3>
              <button onClick={() => setShowNew(false)} style={{ background: "none", border: "none", fontSize: 20, color: "var(--color-text-secondary)", cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ marginBottom: 18 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>标题 <span style={{ fontSize: 11 }}>[? 简要描述问题]</span></label><input value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="请输入工单标题" style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", fontSize: 13, outline: "none" }} /></div>
              <div style={{ marginBottom: 18 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>类型</label><select value={fType} onChange={e => setFType(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", fontSize: 13, cursor: "pointer" }}><option>技术问题</option><option>计费咨询</option><option>功能建议</option><option>账户问题</option><option>其他</option></select></div>
              <div style={{ marginBottom: 18 }}><label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>描述</label><textarea value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="请详细描述您的问题…" style={{ width: "100%", minHeight: 100, padding: "10px 14px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", fontSize: 13, resize: "vertical", fontFamily: "inherit", outline: "none" }} /></div>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 6 }}>附件 <span style={{ fontSize: 11 }}>[? 最多3个文件]</span></label>
                <div onClick={() => fileRef.current?.click()} style={{ border: "2px dashed var(--color-border)", borderRadius: 8, padding: 24, textAlign: "center", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 13 }}>📎 点击上传（最多 3 个）</div>
                <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => { if (e.target.files) setFiles(prev => { const names = Array.from(e.target.files!).map(f => f.name).slice(0, 3 - prev.length); return [...prev, ...names]; }); }} />
                <div style={{ marginTop: 8 }}>{files.map((n, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", background: "var(--color-disabled-bg)", border: "1px solid var(--color-border)", padding: "8px 12px", borderRadius: 6, marginBottom: 6, fontSize: 12 }}><span>📎 {n}</span><span onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{ color: "var(--color-danger-text)", cursor: "pointer" }}>✕</span></div>)}</div>
              </div>
            </div>
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--color-divider)", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-panel)", color: "var(--color-text)", fontSize: 13, cursor: "pointer" }}>取消</button>
              <button onClick={handleCreate} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "var(--color-primary)", color: "#fff", fontSize: 13, cursor: "pointer" }}>提交工单</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
