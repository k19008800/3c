import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, useToast } from "@3cloud/shared-ui";

const card: React.CSSProperties = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };

/* ───────── 类型与演示数据（对齐原型 admin-supplier-bill-match.html） ───────── */

type MatchStatus = "matched" | "partial" | "unmatched" | "extra";
type RowAction = "confirmed" | "flagged" | "ignored" | null;

interface MatchRow {
  date: string;
  model: string;
  calls: number;
  amount: number;
}
interface MatchPair {
  id: number;
  status: MatchStatus;
  bill: MatchRow | null;      // 供应商账单
  platform: MatchRow | null;  // 平台记录
  note: string;
}
interface UploadFile { id: number; name: string; size: string; status: "parsed" | "parsing"; }
interface BillMatchData {
  summary: { pending: number; matched_count: number; diff_count: number; match_rate: number };
  files: UploadFile[];
  pairs: MatchPair[];
  totals: { bill_amount: number; platform_amount: number; diff_amount: number; match_rate: number };
  demo?: boolean;
}

const MOCK: BillMatchData = {
  summary: { pending: 8, matched_count: 1256, diff_count: 23, match_rate: 98.2 },
  files: [
    { id: 1, name: "DeepSeek_2026-08-账单.xlsx", size: "2.3 MB", status: "parsed" },
    { id: 2, name: "OpenAI_2026-08-账单.csv", size: "1.8 MB", status: "parsed" },
    { id: 3, name: "Anthropic_2026-08-账单.xlsx", size: "3.1 MB", status: "parsing" },
  ],
  pairs: [
    { id: 1, status: "matched", bill: { date: "2026-08-01", model: "DeepSeek-V4", calls: 256000, amount: 14328 }, platform: { date: "2026-08-01", model: "DeepSeek-V4", calls: 256000, amount: 14328 }, note: "" },
    { id: 2, status: "partial", bill: { date: "2026-08-02", model: "GPT-4o", calls: 85200, amount: 9856 }, platform: { date: "2026-08-02", model: "GPT-4o", calls: 84980, amount: 9832 }, note: "调用量差异 220 次，金额差异 ¥24" },
    { id: 3, status: "matched", bill: { date: "2026-08-03", model: "Claude-3.5", calls: 42000, amount: 5680 }, platform: { date: "2026-08-03", model: "Claude-3.5", calls: 42000, amount: 5680 }, note: "" },
    { id: 4, status: "unmatched", bill: { date: "2026-08-04", model: "GLM-5.2", calls: 128500, amount: 4520 }, platform: null, note: "平台无对应日期记录，可能存在数据丢失" },
    { id: 5, status: "extra", bill: null, platform: { date: "2026-08-05", model: "Qwen3-72B", calls: 68000, amount: 3420 }, note: "平台有记录但供应商账单中无对应" },
    { id: 6, status: "matched", bill: { date: "2026-08-06", model: "DeepSeek-V4", calls: 215000, amount: 12050 }, platform: { date: "2026-08-06", model: "DeepSeek-V4", calls: 215000, amount: 12050 }, note: "" },
  ],
  totals: { bill_amount: 46234, platform_amount: 45310, diff_amount: 924, match_rate: 98.0 },
  demo: true,
};

const fmt = (n: number) => n.toLocaleString("zh-CN");
const STATUS_ICON: Record<MatchStatus, { icon: string; bg: string; label: string; color: string }> = {
  matched:   { icon: "✅", bg: "#e8f5e9", label: "完全匹配", color: "#22c55e" },
  partial:   { icon: "⚠️", bg: "#fff3e0", label: "部分匹配", color: "#f59e0b" },
  unmatched: { icon: "❌", bg: "#ffebee", label: "未匹配",   color: "#e53935" },
  extra:     { icon: "➕", bg: "#e3f2fd", label: "多出记录", color: "#4f6ef7" },
};

/* ───────── 页面 ───────── */

export default function AdminSupplierBillMatchPage() {
  const { toast } = useToast();
  const [vendor, setVendor] = useState("");
  const [period, setPeriod] = useState("2026-08");
  const [status, setStatus] = useState("");
  const [actions, setActions] = useState<Record<number, RowAction>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ["admin-supplier-bill-match", vendor, period, status],
    queryFn: async () =>
      (await api.get(`/admin/supplier-bill-match?vendor=${vendor}&period=${period}&status=${status}`)).data.data as BillMatchData,
    // 后端未实现时立即回退演示数据，避免 404 反复重试导致页面卡加载
    retry: 0,
  });

  // 后端未实现时回退到演示数据（未来接入真实端点后此兜底自动失效）
  const data: BillMatchData = q.data?.summary != null ? q.data : MOCK;

  function handlePairAction(id: number, action: Exclude<RowAction, null>) {
    setActions(prev => ({ ...prev, [id]: action }));
    toast.success({ confirmed: "已确认（演示数据）", flagged: "已标记（演示数据）", ignored: "已忽略（演示数据）" }[action]);
  }

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) toast.success(`已上传 ${f.name}，等待解析`);
    e.target.value = "";
  }

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#667eea,#764ba2)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🧾</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>供应商账单核对
          <HelpIcon text="核对供应商提供的账单与平台记录的一致性，确保成本数据准确无误。" level="page" />
        </span>
        {data.demo && <span style={{ fontSize: 11, color: "#ffe9a8" }}>⚠️ 演示数据（后端 /admin/supplier-bill-match 待接入）</span>}
      </div>

      {/* ── 统计卡 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 20 }}>
        {[
          { icon: "📋", label: "待核对账单数", value: data.summary.pending, sub: "本月待处理", color: "#4f6ef7" },
          { icon: "✅", label: "已匹配笔数", value: fmt(data.summary.matched_count), sub: "本月累计 ↑ 5.2%", color: "#22c55e" },
          { icon: "⚠️", label: "差异笔数", value: data.summary.diff_count, sub: "需要处理 ↑ 3", color: "#f59e0b" },
          { icon: "📊", label: "匹配率", value: `${data.summary.match_rate}%`, sub: "较上月 ↑ 0.3%", color: "#22c55e" },
        ].map((s, i) => (
          <div key={i} style={{ ...card, borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── 筛选栏 ── */}
      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#666" }}>供应商</span>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}
          value={vendor} onChange={e => setVendor(e.target.value)}>
          <option value="">全部供应商</option>
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="glm">智谱AI</option>
        </select>
        <span style={{ fontSize: 13, color: "#666" }}>对账周期</span>
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }} />
        <span style={{ fontSize: 13, color: "#666" }}>状态</span>
        <select style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 13 }}
          value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">全部</option>
          <option value="matched">✅ 已匹配</option>
          <option value="partial">⚠️ 部分匹配</option>
          <option value="unmatched">❌ 未匹配</option>
          <option value="extra">➕ 多出</option>
        </select>
        <div style={{ flex: 1 }} />
        <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 13 }} onClick={() => toast.info("查询演示数据")}>查询</button>
        <button style={{ ...btnBase, background: "#fff", border: "1px solid var(--color-border)", fontSize: 13 }} onClick={() => toast.info("导出演示")}>导出</button>
      </div>

      {/* ── 账单上传 ── */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📤 账单上传 <HelpIcon text="支持 CSV / Excel (.xlsx) 格式，单个文件不超过 50MB" /></div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={onFilePick} />
        <div
          style={{ border: "2px dashed #ccc", borderRadius: 8, padding: 32, textAlign: "center", cursor: "pointer", transition: "all .2s" }}
          onMouseOver={e => { e.currentTarget.style.borderColor = "#4f6ef7"; e.currentTarget.style.background = "#f0f4ff"; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = "#ccc"; e.currentTarget.style.background = "transparent"; }}
          onClick={() => fileRef.current?.click()}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📥</div>
          <div style={{ color: "#666", fontSize: 14 }}>点击或拖拽文件到此处上传</div>
          <div style={{ color: "#999", fontSize: 12, marginTop: 4 }}>支持 CSV / Excel (.xlsx) 格式，单个文件不超过 50MB</div>
        </div>
        <div style={{ marginTop: 16 }}>
          {data.files.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid #e0e0e0", borderRadius: 4, marginBottom: 8, fontSize: 13 }}>
              <span style={{ fontSize: 18 }}>📊</span>
              <span style={{ flex: 1 }}>{f.name}</span>
              <span style={{ color: "#999" }}>{f.size}</span>
              <span style={{ fontSize: 12, color: f.status === "parsed" ? "#22c55e" : "#f59e0b" }}>
                {f.status === "parsed" ? "✅ 已解析" : "⏳ 解析中"}
              </span>
              {f.status === "parsed" && (
                <button style={{ ...btnBase, background: "none", fontSize: 12, color: "#4f6ef7", padding: "2px 8px" }}
                  onClick={() => toast.success(`${f.name} 开始匹配（演示）`)}>开始匹配</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── 匹配结果 ── */}
      <div style={{ ...card, marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>🔍 匹配结果 <HelpIcon text="供应商账单行与平台记录行左右对比，可按匹配状态处理差异" /></span>
          <span style={{ fontSize: 13, color: "#888" }}>DeepSeek 2026年8月 · 共 {data.pairs.length} 条记录</span>
        </div>
        {data.pairs.map(p => {
          const s = STATUS_ICON[p.status];
          const action = actions[p.id];
          return (
            <div key={p.id} style={{ border: "1px solid #e0e0e0", borderRadius: 4, marginBottom: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px" }}>
                <div style={{ padding: "10px 12px", background: "#f8f9fa" }}>
                  <div style={{ color: "#888", fontSize: 11 }}>供应商账单</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    {p.bill ? `${p.bill.date} | ${p.bill.model} | ${fmt(p.bill.calls)} 次 | ¥${fmt(p.bill.amount)}` : "— 无对应记录 —"}
                  </div>
                </div>
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ color: "#888", fontSize: 11 }}>平台记录</div>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    {p.platform ? `${p.platform.date} | ${p.platform.model} | ${fmt(p.platform.calls)} 次 | ¥${fmt(p.platform.amount)}` : "— 无匹配记录 —"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, background: s.bg }}>{s.icon}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 12px", gap: 8, borderTop: "1px solid #f0f0f0", fontSize: 12 }}>
                <span style={{ color: s.color }}>{p.note ? `${s.label}：${p.note}` : s.label}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {!action && (<>
                    <button style={{ ...btnBase, background: "none", fontSize: 12, color: "#4f6ef7", padding: "2px 8px" }} onClick={() => handlePairAction(p.id, "confirmed")}>确认</button>
                    <button style={{ ...btnBase, background: "none", fontSize: 12, color: "#666", padding: "2px 8px" }} onClick={() => handlePairAction(p.id, "flagged")}>标记</button>
                    <button style={{ ...btnBase, background: "none", fontSize: 12, color: "#999", padding: "2px 8px" }} onClick={() => handlePairAction(p.id, "ignored")}>忽略</button>
                  </>)}
                  {action && <span style={{ fontSize: 11, color: "#888" }}>
                    {({ confirmed: "✅ 已确认", flagged: "📌 已标记", ignored: "— 已忽略" } as Record<string, string>)[action]}
                  </span>}
                </div>
              </div>
            </div>
          );
        })}

        {/* ── 差异汇总 ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, padding: 16, background: "#f8f9fa", borderRadius: 8, marginTop: 16 }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>总账单金额</div><div style={{ fontSize: 20, fontWeight: 600 }}>¥{fmt(data.totals.bill_amount)}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>平台记录金额</div><div style={{ fontSize: 20, fontWeight: 600 }}>¥{fmt(data.totals.platform_amount)}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>差异金额</div><div style={{ fontSize: 20, fontWeight: 600, color: "#e53935" }}>¥{fmt(data.totals.diff_amount)}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>匹配率</div><div style={{ fontSize: 20, fontWeight: 600, color: "#22c55e" }}>{data.totals.match_rate}%</div></div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button style={{ ...btnBase, background: "#fff", border: "1px solid var(--color-border)", fontSize: 13 }} onClick={() => toast.info("导出差异报告（演示）")}>📥 导出差异报告</button>
          <button style={{ ...btnBase, background: "#4f6ef7", color: "#fff", fontSize: 13 }} onClick={() => toast.success("对账已提交确认（演示）")}>提交对账确认</button>
        </div>
      </div>
    </div>
  );
}
