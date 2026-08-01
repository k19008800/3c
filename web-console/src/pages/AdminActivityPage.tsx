import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";

interface Activity {
  id: string; timestamp: number; model: string; status: "success" | "error";
  inputTokens: number; outputTokens: number; cost: number; provider: string; userId: number | null;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminActivityPage() {
  const token = useAuthStore((s) => s.token);
  const [events, setEvents] = useState<Activity[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState("");
  const [conn, setConn] = useState<"connecting" | "connected" | "closed">("connecting");
  const listRef = useRef<HTMLDivElement>(null);

  // 初始历史
  useQuery({
    queryKey: ["admin-activity-history"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/activity/history", { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      if (d?.data?.list?.length) setEvents((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...d.data.list.filter((x: Activity) => !seen.has(x.id)), ...prev];
      });
      return d;
    },
    enabled: !!token,
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

  const filtered = filter ? events.filter((x) => x.status === filter || (filter === "model" && true)) : events;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>实时活动流</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, ...(conn === "connected" ? { color: "#16a34a" } : { color: conn === "connecting" ? "#d97706" : "#dc2626" }) }}>
          {conn === "connected" ? "● 实时连接中" : conn === "connecting" ? "● 连接中" : "○ 已断开"}
        </span>
        <button onClick={() => setAutoScroll(!autoScroll)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 13 }}>{autoScroll ? "自动滚动：开" : "自动滚动：关"}</button>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13 }}>
          <option value="">全部</option><option value="success">仅成功</option><option value="error">仅失败</option>
        </select>
        <button onClick={() => setEvents([])} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", fontSize: 13 }}>清空</button>
      </div>

      <div ref={listRef} style={{ ...card, maxHeight: 600, overflow: "auto" }}>
        {filtered.length === 0 ? <div style={{ color: "#94a3b8", textAlign: "center", padding: 40 }}>等待 API 调用事件...</div> : filtered.map((ev) => (
          <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: ev.status === "success" ? "#16a34a" : "#dc2626", flexShrink: 0 }} />
            <span style={{ fontFamily: "monospace", fontWeight: 600, minWidth: 140 }}>{ev.model}</span>
            <span style={{ fontSize: 12, color: "#64748b" }}>{ev.provider}</span>
            <span style={{ color: "#64748b" }}>{ev.inputTokens}+{ev.outputTokens} tok</span>
            <span style={{ color: "#166534", fontWeight: 600 }}>¥{ev.cost.toFixed(4)}</span>
            <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 12 }}>{new Date(ev.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
