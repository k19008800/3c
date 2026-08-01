import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

interface RedeemHistory {
  id: number;
  code: string;
  amount: number;
  batch_name: string;
  created_at: string;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = { padding: "10px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600 };

export default function RedemptionPage() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const historyQ = useQuery({
    queryKey: ["me-redemption-history"],
    queryFn: async () => (await api.get<{ data: { list: RedeemHistory[] } }>("/me/redemption/history?page_size=50")).data.data,
  });

  const redeemMut = useMutation({
    mutationFn: async () => (await api.post("/me/redemption/redeem", { code: code.trim().toUpperCase() })).data,
    onSuccess: (d: { data?: { message?: string; amount?: number } }) => {
      setResult({ type: "success", msg: d?.data?.message ?? "兑换成功" });
      setCode("");
      qc.invalidateQueries({ queryKey: ["me-redemption-history"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["me-stats"] });
    },
    onError: (e) => setResult({ type: "error", msg: extractError(e) }),
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>兑换码</h2>

      {/* 兑换输入 */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>兑换余额</h3>
        <div style={{ display: "flex", gap: 10, maxWidth: 480 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="输入兑换码（如 3C-XXXXXXXXXX）"
            style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #cbd5e1", flex: 1, fontFamily: "monospace", letterSpacing: 1 }}
          />
          <button
            onClick={() => redeemMut.mutate()}
            disabled={redeemMut.isPending || !code.trim().startsWith("3C-")}
            style={{ ...btnBase, background: "#2563eb", color: "#fff", whiteSpace: "nowrap", opacity: redeemMut.isPending || !code.trim().startsWith("3C-") ? 0.6 : 1 }}
          >
            {redeemMut.isPending ? "兑换中..." : "兑换"}
          </button>
        </div>
        {result && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: result.type === "success" ? "#dcfce7" : "#fee2e2", color: result.type === "success" ? "#166534" : "#991b1b", fontSize: 14 }}>
            {result.msg}
          </div>
        )}
      </div>

      {/* 兑换历史 */}
      <div style={card}>
        <h3 style={{ marginBottom: 16 }}>兑换记录</h3>
        {historyQ.isLoading ? <div style={{ color: "#94a3b8" }}>加载中...</div> : (historyQ.data?.list?.length ?? 0) === 0 ? (
          <div style={{ color: "#94a3b8" }}>暂无兑换记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>兑换码</th>
                <th style={{ padding: "8px" }}>批次</th>
                <th style={{ padding: "8px" }}>到账金额</th>
                <th style={{ padding: "8px" }}>时间</th>
              </tr>
            </thead>
            <tbody>
              {historyQ.data?.list.map((h) => (
                <tr key={h.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 13 }}>{h.code}</td>
                  <td style={{ padding: "8px" }}>{h.batch_name ?? "-"}</td>
                  <td style={{ padding: "8px", fontWeight: 600, color: "#166534" }}>¥{h.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 13 }}>{new Date(h.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
