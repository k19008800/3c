import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";

interface RankingItem { rank: number; agent_name: string; total_commission: number; customer_count: number; month_consumption: number; }

export default function AgentRankingPage() {
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [myRank, setMyRank] = useState<RankingItem | null>(null);
  const [period, setPeriod] = useState<"month" | "total">("month");

  useEffect(() => {
    api.get("/agent/ranking", { params: { period } })
      .then(r => {
        setRanking(r.data?.data?.list ?? []);
        setMyRank(r.data?.data?.my_rank ?? null);
      }).catch(() => {});
  }, [period]);

  const medal = (rank: number) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🏆</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>业绩排行
          <HelpIcon text="查看所有代理商业绩排行。按本月/总佣金排序。竞技排名激发您的斗志！" level="page" />
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button onClick={() => setPeriod("month")} style={{ padding: "6px 16px", borderRadius: 6, border: period === "month" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: period === "month" ? "#eef2ff" : "var(--color-panel)", color: period === "month" ? "#4f6ef7" : "#666", cursor: "pointer", fontSize: 13 }}>📅 本月排行</button>
        <button onClick={() => setPeriod("total")} style={{ padding: "6px 16px", borderRadius: 6, border: period === "total" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: period === "total" ? "#eef2ff" : "var(--color-panel)", color: period === "total" ? "#4f6ef7" : "#666", cursor: "pointer", fontSize: 13 }}>🏆 总排行</button>
      </div>

      {myRank && (
        <div style={{ background: "linear-gradient(135deg,#eef2ff,#f0fdf4)", border: "2px solid #4f6ef7", borderRadius: 10, padding: "16px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 32 }}>{medal(myRank.rank)}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>我的排名</div>
            <div style={{ fontSize: 13, color: "#666" }}>佣金 ¥{(myRank.total_commission / 100).toFixed(2)} · {myRank.customer_count} 个客户 · 月消费 ¥{(myRank.month_consumption / 100).toFixed(2)}</div>
          </div>
        </div>
      )}

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "center", width: 80 }}>排名</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>代理商</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>佣金</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>客户数</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>月消费</th>
          </tr></thead>
          <tbody>
            {ranking.map(r => (
              <tr key={r.rank} style={{ borderBottom: "1px solid #f5f5f5", background: myRank && r.rank === myRank.rank ? "#eef2ff" : undefined }}>
                <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 20 }}>{medal(r.rank)}</td>
                <td style={{ padding: "12px 14px", fontWeight: 600 }}>{r.agent_name}</td>
                <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600, color: r.rank <= 3 ? "#f59e0b" : "#333" }}>
                  ¥{(r.total_commission / 100).toFixed(2)}
                </td>
                <td style={{ padding: "12px 14px", textAlign: "center" }}>{r.customer_count}</td>
                <td style={{ padding: "12px 14px", textAlign: "right" }}>¥{(r.month_consumption / 100).toFixed(2)}</td>
              </tr>
            ))}
            {ranking.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无排行数据</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
