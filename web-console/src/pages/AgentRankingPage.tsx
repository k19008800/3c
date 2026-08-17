import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";

interface RankingItem {
  rank: number;
  agent_id: number;
  agent_name: string;
  total_commission: number;
  customer_count: number;
  month_consumption: number;
  period: string;
}

export default function AgentRankingPage() {
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [myRank, setMyRank] = useState<RankingItem | null>(null);
  const [total, setTotal] = useState(0);
  const [period, setPeriod] = useState<"month" | "total">("month");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/agent/ranking", { params: { period } })
      .then(r => {
        setRanking(r.data?.data?.list ?? []);
        setMyRank(r.data?.data?.my_rank ?? null);
        setTotal(r.data?.data?.total ?? 0);
      }).catch(() => {}).finally(() => setLoading(false));
  }, [period]);

  const medal = (rank: number) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;

  // 进度条：以榜首佣金为 100% 基准（榜空时 0）
  const topCommission = ranking.length > 0 ? ranking[0]!.total_commission : 0;
  const pct = (v: number) => (topCommission > 0 ? Math.min(100, Math.round((v / topCommission) * 100)) : 0);

  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", padding: "20px 24px", borderRadius: 12, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 24 }}>🏆</span>
        <span style={{ flex: 1, fontSize: 18, fontWeight: 700 }}>业绩排行
          <HelpIcon
            text={"适用角色：代理商\n功能定位：查看全部代理商业绩排行，激励销售增长。\n核心操作：切换「本月排行 / 总排行」口径、查看自己的名次与高亮、查看佣金/客户数/消费进度。\n注意事项：本月口径按当前自然月已结算佣金排序，总口径按历史累计排序；名次以金额降序计算。\n常见问题：Q 为什么榜单里没有我？A 本口径下尚无已结算佣金时不会上榜。"}
            level="page"
          />
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button onClick={() => setPeriod("month")} style={{ padding: "6px 16px", borderRadius: 6, border: period === "month" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: period === "month" ? "#eef2ff" : "var(--color-panel)", color: period === "month" ? "#4f6ef7" : "#666", cursor: "pointer", fontSize: 13 }}>
          📅 本月排行
          <HelpIcon text="按当前自然月已结算佣金降序排名。" />
        </button>
        <button onClick={() => setPeriod("total")} style={{ padding: "6px 16px", borderRadius: 6, border: period === "total" ? "2px solid #4f6ef7" : "1px solid var(--color-border)", background: period === "total" ? "#eef2ff" : "var(--color-panel)", color: period === "total" ? "#4f6ef7" : "#666", cursor: "pointer", fontSize: 13 }}>
          🏆 总排行
          <HelpIcon text="按历史累计已结算佣金降序排名。" />
        </button>
        {total > 0 && (
          <span style={{ fontSize: 12, color: "#888", marginLeft: "auto" }}>
            本口径共 {total} 位代理商上榜
          </span>
        )}
      </div>

      {myRank && (
        <div style={{ background: "linear-gradient(135deg,#eef2ff,#f0fdf4)", border: "2px solid #4f6ef7", borderRadius: 10, padding: "16px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 32 }}>{medal(myRank.rank)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>我的排名：第 {myRank.rank} 名</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              佣金 ¥{(myRank.total_commission / 100).toFixed(2)} · {myRank.customer_count} 个客户 · 消费 ¥{(myRank.month_consumption / 100).toFixed(2)}
            </div>
            {topCommission > 0 && (
              <div style={{ marginTop: 8, background: "#fff", borderRadius: 6, height: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct(myRank.total_commission)}%`, background: "linear-gradient(90deg,#22c55e,#4f6ef7)", borderRadius: 6 }} />
              </div>
            )}
          </div>
          {topCommission > 0 && (
            <div style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
              达成榜首
              <div style={{ fontSize: 18, fontWeight: 700, color: "#4f6ef7" }}>{pct(myRank.total_commission)}%</div>
            </div>
          )}
        </div>
      )}

      <div style={{ background: "var(--color-panel)", borderRadius: 10, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ background: "#fafafa" }}>
            <th style={{ padding: "10px 14px", textAlign: "center", width: 80 }}>排名</th>
            <th style={{ padding: "10px 14px", textAlign: "left" }}>代理商</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>佣金</th>
            <th style={{ padding: "10px 14px", textAlign: "center" }}>客户数</th>
            <th style={{ padding: "10px 14px", textAlign: "right" }}>消费</th>
            <th style={{ padding: "10px 14px", textAlign: "left", width: 160 }}>达成进度</th>
          </tr></thead>
          <tbody>
            {ranking.map(r => {
              const isMe = myRank != null && r.agent_id === myRank.agent_id;
              return (
                <tr key={r.agent_id} style={{ borderBottom: "1px solid #f5f5f5", background: isMe ? "#eef2ff" : undefined }}>
                  <td style={{ padding: "12px 14px", textAlign: "center", fontSize: 20 }}>{medal(r.rank)}</td>
                  <td style={{ padding: "12px 14px", fontWeight: 600 }}>
                    {r.agent_name}
                    {isMe && (
                      <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 10, background: "#4f6ef7", color: "#fff", fontSize: 11 }}>我</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 600, color: r.rank <= 3 ? "#f59e0b" : "#333" }}>
                    ¥{(r.total_commission / 100).toFixed(2)}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "center" }}>{r.customer_count}</td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>¥{(r.month_consumption / 100).toFixed(2)}</td>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, background: "#f0f0f0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct(r.total_commission)}%`, background: r.rank <= 3 ? "#f59e0b" : "#4f6ef7", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#888", width: 34, textAlign: "right" }}>{pct(r.total_commission)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {ranking.length === 0 && !loading && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>暂无排行数据</td></tr>}
            {loading && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "#888" }}>加载中…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
