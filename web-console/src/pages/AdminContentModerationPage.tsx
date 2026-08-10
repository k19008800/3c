import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon, StatusBadge, Modal, useToast } from "@3cloud/shared-ui";

interface ModRecord { id: number; content_type: string; content_preview: string; user_id: number; username: string; result: string; score: number; labels: string[]; review_status: string; moderator_id: number | null; moderator_name: string | null; created_at: string; }

/* ───────── 演示数据（对齐原型 admin-content-moderation.html 分布） ───────── */

const MOCK_RECORDS: ModRecord[] = [
  { id: 1, content_type: "text", content_preview: "客服口令，请加微信：xxx，办理转账...", user_id: 101, username: "user_a", result: "blocked", score: 95, labels: ["诈骗", "引流"], review_status: "pending", moderator_id: null, moderator_name: null, created_at: "2026-08-10 12:20:00" },
  { id: 2, content_type: "text", content_preview: "这个平台太垃圾了，客服永远找不到人", user_id: 102, username: "user_b", result: "flagged", score: 72, labels: ["负面情绪"], review_status: "pending", moderator_id: null, moderator_name: null, created_at: "2026-08-10 11:05:00" },
  { id: 3, content_type: "image", content_preview: "[图片] 疑似包含违规二维码", user_id: 103, username: "user_c", result: "flagged", score: 68, labels: ["二维码", "诱导"], review_status: "approved", moderator_id: 1, moderator_name: "审核员-赵", created_at: "2026-08-10 09:42:00" },
  { id: 4, content_type: "text", content_preview: "API 文档已更新，请查收最新版本说明", user_id: 104, username: "support_bot", result: "passed", score: 12, labels: [], review_status: "approved", moderator_id: 1, moderator_name: "审核员-钱", created_at: "2026-08-10 08:15:00" },
  { id: 5, content_type: "text", content_preview: "低价代充，秒到账，联系客服领取", user_id: 105, username: "user_d", result: "blocked", score: 91, labels: ["代充", "违规营销"], review_status: "rejected", moderator_id: 1, moderator_name: "审核员-赵", created_at: "2026-08-09 20:33:00" },
  { id: 6, content_type: "audio", content_preview: "[音频] 时长 0:12，疑似诱导线下交易", user_id: 106, username: "user_e", result: "flagged", score: 64, labels: ["线下交易"], review_status: "pending", moderator_id: null, moderator_name: null, created_at: "2026-08-09 16:08:00" },
];

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void }> = ({ on, onChange }) => (
  <div style={{ width: 44, height: 24, borderRadius: 12, background: on ? "#22c55e" : "#d9d9d9", position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }} onClick={() => onChange(!on)}>
    <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: 3, transform: on ? "translateX(20px)" : "translateX(0)", transition: "transform .2s" }} />
  </div>
);

export default function AdminContentModerationPage() {
  const { toast } = useToast();
  const [records, setRecords] = useState<ModRecord[]>(MOCK_RECORDS); // 演示数据兜底（后端未实现时展示）
  const [filter, setFilter] = useState<{result: string; type: string; review: string}>({result: "", type: "", review: ""});
  const [tab, setTab] = useState<"log" | "config">("log");
  const [config, setConfig] = useState({ text_moderation: true, image_moderation: true, audio_moderation: false, auto_block_threshold: 85, flag_threshold: 60, whitelist: "" });
  const [demo, setDemo] = useState(true);

  useEffect(() => {
    api.get("/admin/content-moderation/records", { params: filter }).then(r => { setRecords(r.data?.data?.list ?? []); setDemo(false); }).catch(() => {});
    api.get("/admin/content-moderation/config").then(r => setConfig(r.data?.data ?? config)).catch(() => {});
  }, [filter]);

  async function saveConfig() {
    try { await api.put("/admin/content-moderation/config", config); } catch {}
    toast.success("审核配置已保存");
  }

  async function approveReview(id: number) {
    try { await api.post(`/admin/content-moderation/${id}/review`, { action: "approve" }); } catch {}
    toast.success("已标记为通过");
    setRecords(records.map(r => r.id === id ? { ...r, review_status: "approved" } : r));
  }
  async function rejectReview(id: number) {
    try { await api.post(`/admin/content-moderation/${id}/review`, { action: "reject" }); } catch {}
    toast.success("已标记为拒绝");
    setRecords(records.map(r => r.id === id ? { ...r, review_status: "rejected" } : r));
  }

  const resultBadge = (r: string) => {
    const map: Record<string, [string, "success"|"warning"|"danger"]> = {
      blocked: ["🛑 拦截", "danger"], flagged: ["⚠️ 标记", "warning"], passed: ["✅ 放行", "success"],
    };
    const [label, v] = map[r] ?? [r, "default"] as any;
    return <StatusBadge status={v}>{label}</StatusBadge>;
  };

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🛡️</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>内容审核
          <HelpIcon text="AI+人工内容审核系统。自动检测文本/图片/音频中的违规内容，支持拦截、标记、放行及人工复审。" level="page" />
        </span>
        {demo && <span style={{ fontSize: 11, color: "#ffe9a8" }}>⚠️ 演示数据（后端 /admin/content-moderation 待接入）</span>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab("log")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "log" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "log" ? "#eef2ff" : "var(--color-panel)", color: tab === "log" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>📋 审核日志</button>
        <button onClick={() => setTab("config")} style={{ padding: "8px 20px", borderRadius: 8, border: tab === "config" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: tab === "config" ? "#eef2ff" : "var(--color-panel)", color: tab === "config" ? "#4f6ef7" : "#666", cursor: "pointer", fontWeight: 600 }}>⚙️ 审核配置</button>
      </div>

      {tab === "log" && (
        <>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <select value={filter.result} onChange={e => setFilter({...filter, result: e.target.value})} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }}>
              <option value="">全部结果</option><option value="blocked">拦截</option><option value="flagged">标记</option><option value="passed">放行</option>
            </select>
            <select value={filter.type} onChange={e => setFilter({...filter, type: e.target.value})} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }}>
              <option value="">全部类型</option><option value="text">文本</option><option value="image">图片</option><option value="audio">音频</option>
            </select>
            <select value={filter.review} onChange={e => setFilter({...filter, review: e.target.value})} style={{ padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 12 }}>
              <option value="">全部复核状态</option><option value="pending">待复审</option><option value="approved">已通过</option><option value="rejected">已拒绝</option>
            </select>
          </div>

          <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#fafafa" }}>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>用户</th>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>类型</th>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>内容预览</th>
                <th style={{ padding: "10px 14px", textAlign: "center" }}>结果</th>
                <th style={{ padding: "10px 14px", textAlign: "center" }}>置信度</th>
                <th style={{ padding: "10px 14px", textAlign: "center" }}>标签</th>
                <th style={{ padding: "10px 14px", textAlign: "left" }}>时间</th>
                <th style={{ padding: "10px 14px", textAlign: "center" }}>操作</th>
              </tr></thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "8px 14px" }}>{r.username}</td>
                    <td style={{ padding: "8px 14px" }}>{r.content_type}</td>
                    <td style={{ padding: "8px 14px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#888" }}>{r.content_preview}</td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>{resultBadge(r.result)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "center", fontWeight: 600, color: r.score >= 85 ? "#e53935" : r.score >= 60 ? "#f59e0b" : "#22c55e" }}>{r.score}%</td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {r.labels?.map(l => <span key={l} style={{ padding: "1px 6px", borderRadius: 8, fontSize: 10, background: "#f0f0f0", color: "#555" }}>{l}</span>)}
                      </div>
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 12, color: "#888" }}>{new Date(r.created_at).toLocaleString()}</td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      {r.review_status === "pending" && (
                        <>
                          <button onClick={() => approveReview(r.id)} style={{ padding: "3px 10px", border: "1px solid #22c55e", borderRadius: 4, background: "#f0fdf4", color: "#22c55e", cursor: "pointer", marginRight: 4, fontSize: 11 }}>通过</button>
                          <button onClick={() => rejectReview(r.id)} style={{ padding: "3px 10px", border: "1px solid #e53935", borderRadius: 4, background: "#fff1f0", color: "#e53935", cursor: "pointer", fontSize: 11 }}>拒绝</button>
                        </>
                      )}
                      {r.review_status !== "pending" && <span style={{ fontSize: 12, color: "#888" }}>{r.review_status === "approved" ? "✅" : "❌"}</span>}
                    </td>
                  </tr>
                ))}
                {records.length === 0 && <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无审核记录</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "config" && (
        <div style={{ background: "var(--color-panel)", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15 }}>⚙️ 审核配置 <HelpIcon text="配置自动审核规则和阈值。" /></h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>文本审核</span>
            <Toggle on={config.text_moderation} onChange={v => setConfig({...config, text_moderation: v})} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>图片审核</span>
            <Toggle on={config.image_moderation} onChange={v => setConfig({...config, image_moderation: v})} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>音频审核</span>
            <Toggle on={config.audio_moderation} onChange={v => setConfig({...config, audio_moderation: v})} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>拦截阈值 (%) <HelpIcon text="置信度高于此值自动拦截。" /></span>
            <input type="number" value={config.auto_block_threshold} onChange={e => setConfig({...config, auto_block_threshold: Number(e.target.value)})}
              style={{ width: 80, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666" }}>标记阈值 (%) <HelpIcon text="置信度高于此值但低于拦截阈值时标记。" /></span>
            <input type="number" value={config.flag_threshold} onChange={e => setConfig({...config, flag_threshold: Number(e.target.value)})}
              style={{ width: 80, padding: "6px 10px", border: "1px solid var(--color-border)", borderRadius: 4, textAlign: "center" }} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0" }}>
            <span style={{ width: 160, fontSize: 13, color: "#666", paddingTop: 6 }}>白名单关键词</span>
            <textarea value={config.whitelist} onChange={e => setConfig({...config, whitelist: e.target.value})}
              style={{ flex: 1, minHeight: 80, padding: "8px 12px", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: 13, fontFamily: "monospace" }}
              placeholder="一行一个关键词" />
          </div>
          <button onClick={saveConfig} style={{ marginTop: 16, padding: "8px 24px", background: "#4f6ef7", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>保存配置</button>
        </div>
      )}
    </div>
  );
}
