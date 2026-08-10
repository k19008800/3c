import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";
import { HelpIcon, EmptyState } from "@3cloud/shared-ui";

interface Activity {
  id: string; timestamp: number; model: string; status: "success" | "error";
  inputTokens: number; outputTokens: number; cost: number; provider: string; userId: number | null;
}

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

/* ───────── 演示数据（后端 /admin/activity 待接入） ───────── */
const MOCK_EVENTS: Activity[] = [
  { id: "evt-1", timestamp: Date.now() - 10000, model: "GPT-4o", status: "success", inputTokens: 1200, outputTokens: 340, cost: 0.012, provider: "OpenAI", userId: 1001 },
  { id: "evt-2", timestamp: Date.now() - 20000, model: "Claude 3.5 Sonnet", status: "error", inputTokens: 400, outputTokens: 0, cost: 0.001, provider: "Anthropic", userId: 1002 },
  { id: "evt-3", timestamp: Date.now() - 30000, model: "GPT-4o mini", status: "success", inputTokens: 900, outputTokens: 150, cost: 0.003, provider: "OpenAI", userId: 1001 },
  { id: "evt-4", timestamp: Date.now() - 45000, model: "Qwen-Max", status: "success", inputTokens: 2100, outputTokens: 480, cost: 0.018, provider: "Alibaba", userId: 1003 },
];

export default function AdminActivityPage() {
  const token = useAuthStore((s) => s.token);
  const [events, setEvents] = useState<Activity[]>(MOCK_EVENTS);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const [conn, setConn] = useState<"connecting" | "connected" | "closed">("connecting");
  const [demo, setDemo] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  // 初始历史
  useQuery({
    queryKey: ["admin-activity-history"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/activity/history", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d?.data?.list?.length) {
        setEvents((prev) => {
          const seen = new Set(prev.map((x) => x.id));
          return [...d.data.list.filter((x: Activity) => !seen.has(x.id)), ...prev];
        });
        setDemo(false);
      }
      return d;
    },
    enabled: !!token,
    // 后端未实现时立即保持演示数据
    retry: 0,
  });

  // SSE 订阅
  useEffect(() => {
    if (!token) return;
    const es = new EventSource(`/api/v1/admin/activity/stream`);
    setConn("connecting");
    es.onopen = () => setConn("connected");
    es.onerror = () => setConn("closed");
    es.onmessage = (e) => {
      try {
        const d: Activity = JSON.parse(e.data);
        setEvents((prev) => [{ ...d }, ...prev].slice(0, 100));
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [token]);

  // 自动滚动
  useEffect(() => {
    if (autoScroll && listRef.current) listRef.current.scrollTop = 0;
  }, [events, autoScroll]);

  const filtered = filter ? events.filter((x) => x.status === filter) : events;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>
        实时活动流
        <HelpIcon text="实时 API 活动监控 — 通过 SSE 订阅全平台 API 调用事件流。查看模型、供应商、Token 消耗和消费金额。支持按成功/失败筛选。" level="page" />
        {demo && <span style={{ fontSize: 11, color: "#f59e0b" }}>⚠️ 演示数据（后端 /admin/activity 待接入）</span>}
      </h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, ...(conn === "connected" ? { color: "var(--color-success-text)" } : { color: conn === "connecting" ? "#d97706" : "var(--color-danger-text)" }) }}>
          {conn === "connected" ? "● 实时连接中" : conn === "connecting" ? "● 连接中" : "○ 已断开"}
        </span>
        <button onClick={() => setAutoScroll(!autoScroll)} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, background: "var(--color-panel)", cursor: "pointer", fontSize: 13 }}>{autoScroll ? "自动滚动：开" : "自动滚动：关"}</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid var(--color-border)`, fontSize: 13 }}>
          <option value="">全部</option><option value="success">仅成功</option><option value="error">仅失败</option>
        </select>
        <button onClick={() => setEvents([])} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 6, border: `1px solid var(--color-border)`, background: "var(--color-panel)", cursor: "pointer", fontSize: 13 }}>清空</button>
      </div>

      <div ref={listRef} style={{ ...card, maxHeight: 600, overflow: "auto" }}>
        {filtered.length === 0 ? <EmptyState title="等待 API 调用事件..." description="API 调用事件将实时显示在此处" icon="📡" /> : filtered.map((ev) => (
          <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid var(--color-border)` /* #f1f5f9 ≈ var(--color-bg) tone */, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ev.status === "success" ? "var(--color-success-text)" : "var(--color-danger-text)", flexShrink: 0 }} />
            <span style={{ fontFamily: "monospace", fontWeight: 600, minWidth: 140 }}>{ev.model}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{ev.provider}</span>
            <span style={{ color: "var(--color-text-secondary)" }}>{ev.inputTokens}+{ev.outputTokens} tok</span>
            <span style={{ color: "var(--color-success-text)", fontWeight: 600 }}>¥{ev.cost.toFixed(4)}</span>
            <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12 }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
