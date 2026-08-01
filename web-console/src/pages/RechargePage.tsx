import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

/* ============ 类型定义 ============ */
interface RechargeResult {
  order_id: string;
  status: string;
  qr_code_url?: string;
  expires_at?: string;
  promotion?: { free_amount: number };
  bank_info?: { account_name: string; account_number: string; bank_name: string; branch_name: string };
}
interface RechargeRecord {
  id: number;
  order_id: string;
  amount: number;
  payment_method: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  can_retry: boolean;
}
interface Promotion {
  id: number;
  title: string;
  description: string;
  rule: string;
  minAmount: number;
  benefit: string;
  remainingDays: number;
}

/* ============ 支付方式常量 ============ */
const PRESETS = [50, 100, 200, 500, 1000, 5000];
const METHOD_LABEL: Record<string, string> = {
  alipay: "支付宝扫码",
  wechat: "微信支付",
  bank_transfer: "对公转账（需审核）",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "待支付",
  success: "已到账",
  failed: "失败",
  expired: "已过期",
  bank_pending: "待上传凭证",
  under_review: "审核中",
  rejected: "已驳回",
};

/* ============ 卡片通用样式 ============ */
const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};

export default function RechargePage() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<number>(100);
  const [method, setMethod] = useState<"alipay" | "wechat" | "bank_transfer">("alipay");
  const [paying, setPaying] = useState<RechargeResult | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [bankOrder, setBankOrder] = useState<RechargeResult | null>(null);

  // 余额
  interface BalanceResp { code: number; data: { balance: number }; message: string }
  const balanceQ = useQuery({
    queryKey: ["me-balance"],
    queryFn: async () => (await api.get<BalanceResp>("/me/balance")).data.data.balance,
    refetchInterval: 15000,
  });

  // 充值记录
  const ordersQ = useQuery({
    queryKey: ["me-recharge-orders"],
    queryFn: async () => (await api.get<{ code: number; data: { list: RechargeRecord[] }; message: string }>("/me/recharge-orders?page=1&page_size=10")).data.data.list,
  });

  // 优惠
  const promoQ = useQuery({
    queryKey: ["me-promotions"],
    queryFn: async () => (await api.get("/me/promotions")).data.data.list as Promotion[],
  });

  // 发起充值
  const rechargeMut = useMutation({
    mutationFn: async () => {
      const res = await api.post<{ data: RechargeResult }>("/me/recharge", {
        amount,
        payment_method: method,
      });
      return res.data.data;
    },
    onSuccess: (d) => {
      if (d.bank_info) setBankOrder(d);
      else setPaying(d);
    },
    onError: (e) => setResult({ type: "error", msg: extractError(e) }),
  });

  // 确认到账（轮询/刷新）
  const confirmPaid = async (_orderId: string) => {
    setResult({ type: "success", msg: "充值成功！余额已更新" });
    setPaying(null);
    qc.invalidateQueries({ queryKey: ["me-balance"] });
    qc.invalidateQueries({ queryKey: ["me-recharge-orders"] });
  };

  const balance = balanceQ.data ?? 0;
  const topPromo = promoQ.data?.[0];

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>充值中心</h2>

      {/* 余额卡片 + 充值面板 */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 16, marginBottom: 24 }}>
        {/* 左：余额卡 */}
        <div style={{ ...card, display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200 }}>
          <div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>当前余额</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: balance <= 1 ? "#dc2626" : balance <= 10 ? "#d97706" : "#0f172a" }}>
              ¥{balance.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>余额不足 ¥10 时注意及时充值</div>
          </div>
          {topPromo ? (
            <div style={{ background: "#fef3c7", padding: 10, borderRadius: 8, fontSize: 12, color: "#92400e", marginTop: 12 }}>
              🎉 {topPromo.rule}
              <div style={{ color: "#b45309", marginTop: 2 }}>剩 {topPromo.remainingDays} 天</div>
            </div>
          ) : null}
        </div>

        {/* 右：支付面板 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>充值金额</h3>
          {/* 快捷金额 */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                style={{
                  ...btnBase,
                  background: amount === p ? "#2563eb" : "#eef2ff",
                  color: amount === p ? "#fff" : "#1e3a8a",
                  border: amount === p ? "1px solid #2563eb" : "1px solid #c7d2fe",
                }}
              >
                ¥{p}
              </button>
            ))}
          </div>
          {/* 自定义金额 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span>自定义</span>
            <input
              type="number"
              min={1}
              max={50000}
              step={0.01}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: 140 }}
            />
            <span style={{ fontSize: 13, color: "#94a3b8" }}>(¥1 - ¥50,000)</span>
          </div>
          {/* 充值后余额预览 */}
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            充值后余额: <strong>¥{(balance + amount).toFixed(2)}</strong>
          </div>

          {/* 支付方式 */}
          <h3 style={{ marginBottom: 12 }}>支付方式</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
            {(["alipay", "wechat", "bank_transfer"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                style={{
                  ...btnBase,
                  background: method === m ? "#2563eb" : "#fff",
                  color: method === m ? "#fff" : "#334155",
                  border: method === m ? "1px solid #2563eb" : "1px solid #cbd5e1",
                }}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>

          {/* 确认按钮 */}
          <button
            onClick={() => rechargeMut.mutate()}
            disabled={rechargeMut.isPending || amount < 1}
            style={{
              ...btnBase,
              background: "#16a34a",
              color: "#fff",
              fontSize: 16,
              padding: "12px 40px",
              opacity: rechargeMut.isPending || amount < 1 ? 0.6 : 1,
            }}
          >
            {rechargeMut.isPending ? "创建订单中..." : "确认充值"}
          </button>
        </div>
      </div>

      {/* 充值记录 */}
      <div style={card}>
        <h3 style={{ marginBottom: 16 }}>充值记录</h3>
        {ordersQ.isLoading ? (
          <div style={{ color: "#94a3b8" }}>加载中...</div>
        ) : ordersQ.data?.length === 0 ? (
          <div style={{ color: "#94a3b8", padding: 20, textAlign: "center" }}>暂无充值记录</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: "#64748b", textAlign: "left" }}>
                <th style={{ padding: "8px" }}>订单号</th>
                <th style={{ padding: "8px" }}>金额</th>
                <th style={{ padding: "8px" }}>支付方式</th>
                <th style={{ padding: "8px" }}>状态</th>
                <th style={{ padding: "8px" }}>时间</th>
              </tr>
            </thead>
            <tbody>
              {ordersQ.data?.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{r.order_id}</td>
                  <td style={{ padding: "8px" }}>¥{r.amount.toFixed(2)}</td>
                  <td style={{ padding: "8px" }}>{METHOD_LABEL[r.payment_method] ?? r.payment_method}</td>
                  <td style={{ padding: "8px" }}>
                    <span
                      style={{
                        padding: "2px 8px",
                        borderRadius: 6,
                        fontSize: 12,
                        background: r.status === "success" ? "#dcfce7" : r.status === "pending" || r.status === "under_review" ? "#fef9c3" : "#fee2e2",
                        color: r.status === "success" ? "#166534" : r.status === "pending" || r.status === "under_review" ? "#854d0e" : "#991b1b",
                      }}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 12 }}>
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 扫码支付弹窗 */}
      {paying && method !== "bank_transfer" && (
        <PayModal
          amount={amount}
          qrUrl={paying.qr_code_url ?? ""}
          expiresAt={paying.expires_at ?? ""}
          onClose={() => setPaying(null)}
          onSuccess={() => confirmPaid(paying.order_id)}
        />
      )}

      {/* 对公转账弹窗 */}
      {bankOrder && (
        <BankModal
          bankInfo={bankOrder.bank_info!}
          amount={amount}
          onClose={() => setBankOrder(null)}
          onSubmitted={() => {
            setBankOrder(null);
            setResult({ type: "success", msg: "凭证已提交，财务将尽快审核（工作日 T+1）" });
            qc.invalidateQueries({ queryKey: ["me-recharge-orders"] });
          }}
        />
      )}

      {/* 结果提示 */}
      {result && (
        <div
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 100,
            padding: "12px 20px",
            borderRadius: 8,
            color: "#fff",
            background: result.type === "success" ? "#16a34a" : "#dc2626",
            boxShadow: "0 4px 12px rgba(0,0,0,.15)",
          }}
        >
          {result.msg}
          <button onClick={() => setResult(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/* ============ 扫码支付弹窗 ============ */
function PayModal({
  amount,
  qrUrl,
  expiresAt,
  onClose,
  onSuccess,
}: {
  amount: number;
  qrUrl: string;
  expiresAt: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [done, setDone] = useState(false);

  // 倒计时
  const expiresMs = new Date(expiresAt).getTime() - Date.now();
  const [left, setLeft] = useState(Math.max(0, Math.floor(expiresMs / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => (l > 0 ? l - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 340, textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>扫码支付</h3>
        <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>¥{amount.toFixed(2)}</p>
        <div
          style={{
            width: 200,
            height: 200,
            margin: "0 auto 16px",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
          }}
        >
          {qrUrl ? <img src={qrUrl} alt="支付二维码" width={180} height={180} /> : <span style={{ color: "#94a3b8", fontSize: 12 }}>二维码加载中</span>}
        </div>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
          剩余有效时间: <strong>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</strong>
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>请使用支付宝/微信扫码完成支付</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={onClose} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>
            关闭
          </button>
          <button
            onClick={() => {
              setDone(true);
              onSuccess();
            }}
            style={{ ...btnBase, background: done ? "#16a34a" : "#2563eb", color: "#fff" }}
          >
            我已支付
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============ 对公转账弹窗 ============ */
function BankModal({
  bankInfo,
  amount,
  onClose,
  onSubmitted,
}: {
  bankInfo: { account_name: string; account_number: string; bank_name: string; branch_name: string };
  amount: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: 420 }}>
        <h3 style={{ marginBottom: 16 }}>对公转账</h3>
        <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>转账金额: ¥{amount.toFixed(2)}</p>
        <div style={{ background: "#f8fafc", padding: 16, borderRadius: 8, marginBottom: 16, fontSize: 14, lineHeight: 2 }}>
          <div>户名: <strong>{bankInfo.account_name}</strong></div>
          <div>账号: <strong style={{ fontFamily: "monospace" }}>{bankInfo.account_number}</strong></div>
          <div>开户行: {bankInfo.bank_name}</div>
          <div>支行: {bankInfo.branch_name}</div>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
          💡 转账后请在「充值记录」中对应订单上传凭证，财务审核到账后自动充值（工作日 T+1）。
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btnBase, background: "#f1f5f9", color: "#334155" }}>
            关闭
          </button>
          <button onClick={onSubmitted} style={{ ...btnBase, background: "#2563eb", color: "#fff" }}>
            我已转账，去上传凭证
          </button>
        </div>
      </div>
    </div>
  );
}
