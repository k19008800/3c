import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { HelpIcon } from "@3cloud/shared-ui";
import "./console-misc.css";

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

  // 进度条：以榜首佣金为 100% 基准（榜空时 0）
  const topCommission = ranking.length > 0 ? ranking[0]!.total_commission : 0;
  const pct = (v: number) => (topCommission > 0 ? Math.min(100, Math.round((v / topCommission) * 100)) : 0);

  const periodBtn = (active: boolean): React.CSSProperties => ({
    padding: "6px 16px", borderRadius: "var(--radius-sm)", fontSize: 13, cursor: "pointer",
    border: active ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
    background: active ? "var(--color-primary-light)" : "var(--color-panel)",
    color: active ? "var(--color-primary)" : "var(--color-text-secondary)",
    fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <div className="cm-pagehead">
        <div className="cm-pagehead__titles">
          <div className="cm-pagehead__title">业绩排行
            <HelpIcon
              text={"适用角色：代理商\n功能定位：查看全部代理商业绩排行，激励销售增长。\n核心操作：切换「本月排行 / 总排行」口径、查看自己的名次与高亮、查看佣金/客户数/消费进度。\n注意事项：本月口径按当前自然月已结算佣金排序，总口径按历史累计排序；名次以金额降序计算。\n常见问题：Q 为什么榜单里没有我？A 本口径下尚无已结算佣金时不会上榜。"}
              level="page"
            />
          </div>
          <div className="cm-pagehead__sub">按本月或历史累计已结算佣金降序排名，激励销售增长。</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => setPeriod("month")} style={periodBtn(period === "month")}>
          本月排行
          <HelpIcon text="按当前自然月已结算佣金降序排名。" />
        </button>
        <button onClick={() => setPeriod("total")} style={periodBtn(period === "total")}>
          总排行
          <HelpIcon text="按历史累计已结算佣金降序排名。" />
        </button>
        {total > 0 && (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: "auto" }}>
            本口径共 {total} 位代理商上榜
          </span>
        )}
      </div>

      {myRank && (
        <div style={{ background: "var(--color-primary-lighter)", border: "1px solid var(--color-primary-border)", borderRadius: "var(--radius-lg)", padding: "16px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--color-primary)", minWidth: 48, textAlign: "center" }}>#{myRank.rank}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>我的排名：第 {myRank.rank} 名</div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
              佣金 ¥{(myRank.total_commission / 100).toFixed(2)} · {myRank.customer_count} 个客户 · 消费 ¥{(myRank.month_consumption / 100).toFixed(2)}
            </div>
            {topCommission > 0 && (
              <div style={{ marginTop: 8, background: "var(--color-panel)", borderRadius: "var(--radius-sm)", height: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct(myRank.total_commission)}%`, background: "var(--color-primary)", borderRadius: "var(--radius-sm)" }} />
              </div>
            )}
          </div>
          {topCommission > 0 && (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", textAlign: "right" }}>
              达成榜首
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--color-primary)" }}>{pct(myRank.total_commission)}%</div>
            </div>
          )}
        </div>
      )}

      <div style={{ background: "var(--color-panel)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
        <table className="cm-table">
          <thead><tr>
            <th style={{textAlign:"center", width:80}}>排名</th>
            <th>代理商</th>
            <th className="num">佣金</th>
            <th style={{textAlign:"center"}}>客户数</th>
            <th className="num">消费</th>
            <th style={{width:160}}>达成进度</th>
          </tr></thead>
          <tbody>
            {ranking.map(r => {
              const isMe = myRank != null && r.agent_id === myRank.agent_id;
              return (
                <tr key={r.agent_id} style={{ background: isMe ? "var(--color-row-selected)" : undefined }}>
                  <td style={{ textAlign: "center", fontWeight: 700, color: r.rank <= 3 ? "var(--color-warning-text)" : "var(--color-text)" }}>#{r.rank}</td>
                  <td style={{ fontWeight: 600 }}>
                    {r.agent_name}
                    {isMe && (
                      <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: "var(--radius-pill)", background: "var(--color-primary)", color: "#fff", fontSize: 11 }}>我</span>
                    )}
                  </td>
                  <td className="num" style={{ fontWeight: 600, color: r.rank <= 3 ? "var(--color-warning-text)" : "var(--color-text)" }}>
                    ¥{(r.total_commission / 100).toFixed(2)}
                  </td>
                  <td style={{ textAlign: "center" }}>{r.customer_count}</td>
                  <td className="num">¥{(r.month_consumption / 100).toFixed(2)}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, background: "var(--color-disabled-bg)", borderRadius: "var(--radius-xs)", height: 6, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct(r.total_commission)}%`, background: r.rank <= 3 ? "var(--color-warning-text)" : "var(--color-primary)", borderRadius: "var(--radius-xs)" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)", width: 34, textAlign: "right" }}>{pct(r.total_commission)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {ranking.length === 0 && !loading && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>暂无排行数据</td></tr>}
            {loading && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--color-text-muted)" }}>加载中…</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
