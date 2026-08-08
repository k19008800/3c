import { useState, useEffect, type FormEvent } from "react";
import PortalLayout from "../../components/PortalLayout";
import HelpIcon from "../../components/HelpIcon";
import api from "../../services/api";

interface BalanceData {
  balance: number;
  unit: string;
}

interface RechargeOrder {
  id: number;
  order_id: string;
  amount: number;
  payment_method: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  can_retry: boolean;
}

interface Plan {
  id: string;
  amount: number;
  label: string;
  bonus: number;
}

const PLANS: Plan[] = [
  { id: "p1", amount: 50, label: "¥50 套餐", bonus: 0 },
  { id: "p2", amount: 100, label: "¥100 套餐", bonus: 5 },
  { id: "p3", amount: 200, label: "¥200 套餐", bonus: 15 },
  { id: "p4", amount: 500, label: "¥500 套餐", bonus: 50 },
  { id: "p5", amount: 1000, label: "¥1000 套餐", bonus: 120 },
  { id: "p6", amount: 2000, label: "¥2000 套餐", bonus: 300 },
];

export default function Recharge() {
  const [balance, setBalance] = useState<number>(0);
  const [orders, setOrders] = useState<RechargeOrder[]>([]);
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotal, setOrderTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPlan, setSelectedPlan] = useState<string>("p2");
  const [redeemCode, setRedeemCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [paying, setPaying] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true);
    const [balRes, ordersRes] = await Promise.all([
      api.get<BalanceData>("/me/balance"),
      api.get<{ list: RechargeOrder[]; pagination: { page: number; page_size: number; total: number } }>(
        `/me/recharge-orders?page=${orderPage}&page_size=20`
      ),
    ]);

    if (balRes.error) setError(balRes.error);
    else if (balRes.data) setBalance(balRes.data.balance);

    if (ordersRes.data) {
      setOrders(ordersRes.data.list || []);
      setOrderTotal(ordersRes.data.pagination?.total || 0);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [orderPage]);

  const handlePay = async () => {
    setPaying(true);
    const selected = PLANS.find((p) => p.id === selectedPlan);
    if (!selected) return;

    const res = await api.post("/me/recharge", {
      amount: selected.amount,
      payment_method: "alipay",
    });

    if (res.error) {
      showToast(res.error, "error");
    } else {
      showToast("支付订单已创建！请完成支付");
      await loadData();
    }
    setPaying(false);
  };

  const handleRedeem = (e: FormEvent) => {
    e.preventDefault();
    if (!redeemCode.trim()) {
      showToast("请输入兑换码", "error");
      return;
    }
    setRedeeming(true);
    setTimeout(() => {
      setRedeeming(false);
      setRedeemCode("");
      showToast("兑换码功能暂未接入后端 API");
    }, 800);
  };

  const selected = PLANS.find((p) => p.id === selectedPlan);

  if (loading) {
    return (
      <PortalLayout>
        <div className="loading-container">
          <div className="spinner" />
          <p>加载中...</p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      {toast && (
        <div className={`toast${toast.type === "error" ? " error" : ""}`}>
          {toast.message}
        </div>
      )}

      <h1 className="page-title">
        充值 <HelpIcon title="选择套餐充值或使用兑换码增加账户余额" />
      </h1>
      <p className="page-subtitle">为您的账户充值 Token 额度</p>

      {error && <div className="error-banner">⚠️ {error}</div>}

      {/* Balance */}
      <div className="balance-display mt-4">
        <div className="balance-label">当前余额</div>
        <div className="balance-value">¥{balance.toFixed(2)}</div>
        <div className="balance-sub">≈ {(balance * 1000).toLocaleString()} Token</div>
      </div>

      {/* Plan Selection */}
      <div className="section">
        <div className="card">
          <div className="card-title">选择充值套餐 <HelpIcon title="选择适合您的充值金额，不同套餐享有不同赠送" /></div>
          <div className="plan-grid">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`plan-card${selectedPlan === plan.id ? " selected" : ""}`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <div className="plan-amount">¥{plan.amount}</div>
                <div className="plan-label">{plan.label}</div>
                {plan.bonus > 0 && <div className="plan-bonus">🎁 赠送 ¥{plan.bonus}</div>}
              </div>
            ))}
          </div>
          {selected && (
            <div className="mt-4" style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
              您选择了 <strong>¥{selected.amount}</strong> 套餐
              {selected.bonus > 0 && (
                <span style={{ color: "#10b981" }}>（含赠送 ¥{selected.bonus}）</span>
              )}
              ，实付 <strong>¥{selected.amount}</strong>，到账 <strong>¥{selected.amount + selected.bonus}</strong>
            </div>
          )}
          <div className="mt-4">
            <button className="btn btn-primary" onClick={handlePay} disabled={paying}>
              {paying ? "支付中..." : `立即支付 ¥${selected?.amount ?? 0}`}
            </button>
          </div>
        </div>
      </div>

      {/* Redeem Code */}
      <div className="section">
        <div className="card">
          <div className="card-title">兑换码 <HelpIcon title="输入活动赠送或购买的兑换码来获取余额" /></div>
          <form onSubmit={handleRedeem}>
            <div className="form-group">
              <label className="form-label">兑换码</label>
              <div className="flex-row">
                <input
                  className="form-input"
                  type="text"
                  placeholder="请输入兑换码"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value)}
                />
                <button className="btn btn-primary" type="submit" disabled={redeeming}>
                  {redeeming ? "兑换中..." : "兑换"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Recharge History */}
      <div className="section">
        <div className="card">
          <div className="card-title">充值历史 <HelpIcon title="查看您的充值记录和状态" /></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>订单号</th>
                  <th>金额</th>
                  <th>支付方式</th>
                  <th>状态</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: 20, color: "var(--color-text-secondary)" }}>
                      暂无充值记录
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td style={{ fontFamily: "monospace", fontSize: 13 }}>{order.order_id}</td>
                      <td>¥{order.amount.toFixed(2)}</td>
                      <td>{order.payment_method === "alipay" ? "支付宝" : order.payment_method === "wechat" ? "微信支付" : order.payment_method}</td>
                      <td>
                        {order.status === "success" && <span className="badge badge-success">成功</span>}
                        {order.status === "pending" && <span className="badge badge-warning">处理中</span>}
                        {order.status === "expired" && <span className="badge badge-danger">已过期</span>}
                        {order.status === "bank_pending" && <span className="badge badge-warning">待审核</span>}
                        {order.status === "failed" && <span className="badge badge-danger">失败</span>}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                        {new Date(order.created_at).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {orderTotal > 20 && (
            <div className="flex-between mt-4" style={{ marginTop: 16 }}>
              <span className="text-sm text-muted">共 {orderTotal} 条</span>
              <div className="flex-wrap">
                <button className="btn btn-sm btn-secondary" disabled={orderPage <= 1} onClick={() => setOrderPage((p) => p - 1)}>
                  ‹ 上一页
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => setOrderPage((p) => p + 1)}>
                  下一页 ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
