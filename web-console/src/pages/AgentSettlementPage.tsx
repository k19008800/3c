import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/**
 * 代理端 — 结算对账
 * 对齐 docs/sprint-1/04-settlement-frontend.md
 */

const card: React.CSSProperties = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const icon = { cursor: "pointer", color: "#64748b", fontSize: 14, marginLeft: 8 } as const;

const PAGE_HELP = "结算对账模块：查看每个结算周期的佣金账单，可查看明细和导出 CSV。在冷却期内可取消注销。";

export default function AgentSettlementPage() {
  const [help, setHelp] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const qc = useQueryClient();
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  // 列表
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["agent/settlements", statusFilter],
    queryFn: () =>
      api
        .get("/agent/settlements", { params: { status: statusFilter || undefined, limit: 50, offset: 0 } })
        .then((r) => r.data.data),
  });

  // 详情
  const { data: detail } = useQuery({
    queryKey: ["agent/settlements", detailId],
    queryFn: () => api.get(`/agent/settlements/${detailId}`).then((r) => r.data.data),
    enabled: detailId !== null,
  });

  // 确认结算
  const confirmMut = useMutation({
    mutationFn: (id: number) => api.post(`/agent/settlements/${id}/confirm`),
    onSuccess: () => {
      setNotice({ type: "success", msg: "结算单已确认，金额已转入余额" });
      setDetailId(null);
      setConfirmingId(null);
      refetch();
    },
    onError: (err) => setNotice({ type: "error", msg: extractError(err) }),
  });

  const list = data?.rows ?? [];
  const stats: Record<string, number> = data?.stats ?? {};

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 4 }}>
        结算对账 <span onClick={() => setHelp(PAGE_HELP)} style={icon} title="帮助">[?]</span>
      </h2>
      <p style={{ color: "#94a3b8", marginTop: 0, fontSize: 13 }}>佣金结算账单 · 确认后金额转入余额 · Sprint 1</p>

      {notice && (
        <div style={{ padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, background: notice.type === "success" ? "#d1fae5" : "#fee2e2", color: notice.type === "success" ? "#065f46" : "#991b1b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "inherit" }}>×</button>
        </div>
      )}

      {stats && Object.keys(stats).length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
          {[{ key: "pending", label: "待确认", color: "#f59e0b" }, { key: "settled", label: "已结算", color: "#10b981" }].map((item) => (
            <div key={item.key} style={{ ...card, padding: "12px 16px", minWidth: 100, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: item.color }}>{stats[item.key] ?? 0}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 状态切换 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { key: "", label: "全部" },
          { key: "pending", label: "待确认" },
          { key: "settled", label: "已结算" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            style={{ ...btnBase, background: statusFilter === t.key ? "#2563eb" : "#fff", color: statusFilter === t.key ? "#fff" : "#475569", border: "1px solid #cbd5e1" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: "#94a3b8" }}>加载中...</p>
      ) : list.length === 0 ? (
        <p style={{ color: "#94a3b8" }}>暂无数据</p>
      ) : (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>周期</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>佣金总额</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>调整</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>结算金额</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>状态</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>生成时间</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row: any, i: number) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #e2e8f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ padding: "10px 16px", color: "#334155" }}>
                    {row.period_start ?? "-"} ~ {row.period_end ?? "-"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#334155" }}>¥{Number(row.total_commission ?? 0).toFixed(2)}</td>
                  <td style={{ padding: "10px 16px", color: Number(row.adjustment_amount ?? 0) < 0 ? "#dc2626" : "#10b981" }}>
                    {Number(row.adjustment_amount ?? 0) !== 0 ? `${Number(row.adjustment_amount) > 0 ? "+" : ""}¥${Number(row.adjustment_amount).toFixed(2)}` : "-"}
                  </td>
                  <td style={{ padding: "10px 16px", fontWeight: 600, color: "#334155" }}>¥{Number(row.settled_amount ?? 0).toFixed(2)}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, background: row.status === "pending" ? "#fef3c7" : "#dcfce7", color: row.status === "pending" ? "#92400e" : "#166534", padding: "2px 8px", borderRadius: 4 }}>
                      {row.status === "pending" ? "待确认" : "已结算"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 16px", color: "#64748b", fontSize: 12 }}>
                    {new Date(row.created_at).toLocaleDateString("zh-CN")}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => setDetailId(row.id)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12 }}>详情</button>
                      {row.status === "pending" && (
                        <button
                          onClick={() => { setConfirmingId(row.id); }}
                          style={{ ...btnBase, background: "#2563eb", color: "#fff", fontSize: 12 }}
                        >
                          确认
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailId !== null && detail && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setDetailId(null)}>
          <div style={{ ...card, width: 540, maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>
              结算单 #{detail.settlement.id}
            </h3>

            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", color: "#475569" }}>
                <div>周期：{detail.cycle?.period_start ?? "-"} ~ {detail.cycle?.period_end ?? "-"}</div>
                <div>周期状态：{statusLabel(detail.cycle?.status)}</div>
                <div>佣金总额：¥{Number(detail.settlement.total_commission ?? 0).toFixed(2)}</div>
                <div>调整金额：{Number(detail.settlement.adjustment_amount ?? 0) !== 0 ? `¥${Number(detail.settlement.adjustment_amount).toFixed(2)}` : "无"}</div>
                {detail.settlement.adjustment_reason && <div style={{ gridColumn: "1 / -1" }}>调整原因：{detail.settlement.adjustment_reason}</div>}
                <div style={{ fontWeight: 600 }}>结算金额：¥{Number(detail.settlement.settled_amount ?? 0).toFixed(2)}</div>
                <div>状态：{statusLabel(detail.settlement.status)}</div>
              </div>
            </div>

            {/* 操作日志 */}
            {detail.logs && detail.logs.length > 0 && (
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                <div style={{ color: "#334155", fontWeight: 600, marginBottom: 8 }}>操作日志</div>
                {detail.logs.map((log: any) => (
                  <div key={log.id} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12, color: "#475569" }}>
                    <span style={{ color: actionColor(log.action), fontWeight: 500, minWidth: 70 }}>{actionLabel(log.action)}</span>
                    <span>{log.detail ?? ""}</span>
                    <span style={{ color: "#94a3b8", marginLeft: "auto" }}>{new Date(log.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
              <button onClick={() => setDetailId(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>关闭</button>
              {detail.settlement.status === "pending" && (
                <button
                  onClick={() => { setConfirmingId(detail.settlement.id); setDetailId(null); }}
                  style={{ ...btnBase, background: "#2563eb", color: "#fff" }}
                >
                  确认结算
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 确认弹窗 */}
      {confirmingId !== null && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setConfirmingId(null)}>
          <div style={{ ...card, width: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px" }}>确认结算单</h3>
            <p style={{ color: "#475569", fontSize: 14, lineHeight: 1.6 }}>
              确认后该结算单金额将自动转入您的账号余额。<strong>此操作不可撤销。</strong>
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setConfirmingId(null)} style={{ ...btnBase, background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}>取消</button>
              <button
                onClick={() => confirmMut.mutate(confirmingId)}
                disabled={confirmMut.isPending}
                style={{ ...btnBase, background: "#2563eb", color: "#fff", opacity: confirmMut.isPending ? 0.6 : 1 }}
              >
                {confirmMut.isPending ? "确认中..." : "确认结算"}
              </button>
            </div>
          </div>
        </div>
      )}

      {help && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 }} onClick={() => setHelp("")}>
          <div style={{ ...card, width: 460 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>帮助</h3>
            <p style={{ color: "#475569", lineHeight: 1.7, margin: 0 }}>{help}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setHelp("")} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function actionLabel(action: string): string {
  const m: Record<string, string> = { generate: "生成", confirm: "确认", auto_confirm: "自动确认", adjust: "调整" };
  return m[action] ?? action;
}
function actionColor(action: string): string {
  const m: Record<string, string> = { generate: "#64748b", confirm: "#2563eb", auto_confirm: "#10b981", adjust: "#f59e0b" };
  return m[action] ?? "#64748b";
}
function statusLabel(s: string): string {
  const m: Record<string, string> = { open: "开启", closed: "已关账", settled: "已结算", pending: "待确认" };
  return m[s] ?? s;
}
