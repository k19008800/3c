import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Link } from "react-router-dom";

interface Stats {
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  todayCalls: number;
  balance: number;
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["me-stats"],
    queryFn: async () => (await api.get<Stats>("/me/stats")).data,
    refetchInterval: 15000,
  });

  const cards = [
    { label: "当前余额", value: `¥${((data?.balance ?? 0)).toFixed(2)}`, hint: "可用于 API 调用" },
    { label: "累计调用", value: String(data?.totalCalls ?? "-"), hint: "总请求次数" },
    { label: "累计 Tokens", value: (data?.totalTokens ?? 0).toLocaleString(), hint: "总 Token 消耗" },
    { label: "累计消费", value: `¥${(data?.totalCost ?? 0).toFixed(4)}`, hint: "总费用" },
    { label: "今日调用", value: String(data?.todayCalls ?? "-"), hint: "近 24 小时" },
  ];

  if (isLoading) return <div style={{ fontFamily: "system-ui, sans-serif" }}>加载中...</div>;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>仪表盘</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{c.value}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{c.hint}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", padding: 20, borderRadius: 10 }}>
        <h3 style={{ marginBottom: 12 }}>快速开始</h3>
        <p style={{ color: "#475569", marginBottom: 8 }}>创建 API Key 后用 OpenAI 兼容接口调用模型：</p>
        <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: 16, borderRadius: 8, overflowX: "auto", fontSize: 13 }}>
{`curl http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer sk-你的key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}'`}
        </pre>
        <Link to="/api-keys" style={{ display: "inline-block", marginTop: 12, color: "#2563eb", textDecoration: "none" }}>
          前往 API Keys 创建 →
        </Link>
      </div>
    </div>
  );
}
