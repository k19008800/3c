import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  StatusBadge,
  Table,
  Modal,
  EmptyState,
  SkeletonGroup,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/* ============ 类型定义 ============ */
interface RechargeResult {
  order_id: string;
  status: string;
  qr_code_url?: string;
  expires_at?: string;
  promotion?: { free_amount: number };
  bank_info?: {
    account_name: string;
    account_number: string;
    bank_name: string;
    branch_name: string;
  };
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

/* ============ 卡片通用样式 ============ */
const card: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 1px 4px rgba(0,0,0,.06)",
};
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
  const [bankOrder, setBankOrder] = useState<RechargeResult | null>(null);
  const { toast } = useToast();

  // 余额
  interface BalanceResp {
    code: number;
    data: { balance: number };
    message: string;
  }
  const balanceQ = useQuery({
    queryKey: ["me-balance"],
    queryFn: async () => (await api.get<BalanceResp>("/me/balance")).data.data.balance,
    refetchInterval: 15000,
  });

  // 充值记录
  const ordersQ = useQuery({
    queryKey: ["me-recharge-orders"],
    queryFn: async () =>
      (
        await api.get<{
          code: number;
          data: { list: RechargeRecord[] };
          message: string;
        }>("/me/recharge-orders?page=1&page_size=10")
      ).data.data.list,
  });

  // 优惠
  const promoQ = useQuery({
    queryKey: ["me-promotions"],
    queryFn: async () =>
      (await api.get("/me/promotions")).data.data.list as Promotion[],
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
    onError: (e) => toast.error(extractError(e)),
  });

  // 确认到账（轮询/刷新）
  const confirmPaid = async (_orderId: string) => {
    toast.success("充值成功！余额已更新");
    setPaying(null);
    qc.invalidateQueries({ queryKey: ["me-balance"] });
    qc.invalidateQueries({ queryKey: ["me-recharge-orders"] });
  };

  const balance = balanceQ.data ?? 0;
  const topPromo = promoQ.data?.[0];

  const recordColumns: ColumnDef<RechargeRecord>[] = [
    {
      key: "order_id",
      title: "订单号",
      dataIndex: "order_id",
      render: (v) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{v as string}</span>
      ),
    },
    {
      key: "amount",
      title: "金额",
      dataIndex: "amount",
      render: (v) => `¥${(v as number).toFixed(2)}`,
    },
    {
      key: "payment_method",
      title: "支付方式",
      dataIndex: "payment_method",
      render: (v) => METHOD_LABEL[v as string] ?? (v as string),
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v) => {
        const s = v as string;
        if (s === "success") return <StatusBadge status="success">已到账</StatusBadge>;
        if (s === "pending" || s === "under_review" || s === "bank_pending")
          return <StatusBadge status="warning">待处理</StatusBadge>;
        if (s === "failed" || s === "rejected")
          return <StatusBadge status="danger">失败</StatusBadge>;
        return <StatusBadge status="default">{s}</StatusBadge>;
      },
    },
    {
      key: "created_at",
      title: "时间",
      dataIndex: "created_at",
      render: (v) => (
        <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
          {new Date(v as string).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>
        充值中心
        <HelpIcon text="账户余额充值，支持支付宝、微信扫码支付和对公转账。选择金额和支付方式后创建充值订单。" level="page" />
      </h2>

      {/* 余额卡片 + 充值面板 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 340px) 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* 左：余额卡 */}
        <div
          style={{
            ...card,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 200,
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              当前余额
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 700,
                color:
                  balance <= 1
                    ? "var(--color-danger-text)"
                    : balance <= 10
                    ? "var(--color-warning-text)"
                    : "var(--color-text)",
              }}
            >
              ¥{balance.toFixed(2)}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>
              余额不足 ¥10 时注意及时充值
            </div>
          </div>
          {topPromo ? (
            <div
              style={{
                background: "var(--color-warning-bg)",
                padding: 10,
                borderRadius: 8,
                fontSize: 12,
                color: "var(--color-warning-text)",
                marginTop: 12,
              }}
            >
              🎉 {topPromo.rule}
              <div style={{ color: "var(--color-warning-text)", marginTop: 2 }}>
                剩 {topPromo.remainingDays} 天
              </div>
            </div>
          ) : null}
        </div>

        {/* 右：支付面板 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>
            充值金额
            <HelpIcon text="选择或输入充值金额，支持支付宝/微信/对公转账。" level="button" />
          </h3>
          {/* 快捷金额 */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                style={{
                  ...btnBase,
                  background: amount === p ? "var(--color-primary)" : "var(--color-bg)",
                  color: amount === p ? "#fff" : "var(--color-text)",
                  border:
                    amount === p
                      ? "1px solid var(--color-primary)"
                      : "1px solid var(--color-border)",
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
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--color-border)",
                width: 140,
              }}
            />
            <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
              (¥1 - ¥50,000)
            </span>
          </div>
          {/* 充值后余额预览 */}
          <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
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
                  background: method === m ? "var(--color-primary)" : "#fff",
                  color: method === m ? "#fff" : "var(--color-text)",
                  border:
                    method === m
                      ? "1px solid var(--color-primary)"
                      : "1px solid var(--color-border)",
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
              background: "var(--color-success-text)",
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
          <SkeletonGroup lines={4} />
        ) : ordersQ.data?.length === 0 ? (
          <EmptyState icon="💳" title="暂无充值记录" description="您还没有任何充值" actionText="去充值" onAction={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        ) : (
          <Table
            columns={recordColumns}
            dataSource={ordersQ.data ?? []}
            loading={ordersQ.isLoading}
            emptyText="暂无充值记录"
          />
        )}
      </div>

      {/* 扫码支付弹窗 */}
      <Modal open={!!paying && method !== "bank_transfer"} onClose={() => setPaying(null)} title="扫码支付">
        {paying && (
          <PayModalContent
            amount={amount}
            qrUrl={paying.qr_code_url ?? ""}
            expiresAt={paying.expires_at ?? ""}
            onClose={() => setPaying(null)}
            onSuccess={() => confirmPaid(paying.order_id)}
          />
        )}
      </Modal>

      {/* 对公转账弹窗 */}
      <Modal open={!!bankOrder} onClose={() => setBankOrder(null)} title="对公转账">
        {bankOrder && (
          <BankModalContent
            bankInfo={bankOrder.bank_info!}
            amount={amount}
            onClose={() => setBankOrder(null)}
            onSubmitted={() => {
              setBankOrder(null);
              toast.success("凭证已提交，财务将尽快审核（工作日 T+1）");
              qc.invalidateQueries({ queryKey: ["me-recharge-orders"] });
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/* ============ 扫码支付弹窗内容 ============ */
function PayModalContent({
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
  const expiresMs = new Date(expiresAt).getTime() - Date.now();
  const [left, setLeft] = useState(Math.max(0, Math.floor(expiresMs / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft((l) => (l > 0 ? l - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>¥{amount.toFixed(2)}</p>
      <div
        style={{
          width: 200,
          height: 200,
          margin: "0 auto 16px",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg)",
        }}
      >
        {qrUrl ? (
          <img src={qrUrl} alt="支付二维码" width={180} height={180} />
        ) : (
          <span style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>二维码加载中</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
        剩余有效时间:{" "}
        <strong>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </strong>
      </p>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16 }}>
        请使用支付宝/微信扫码完成支付
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          onClick={onClose}
          style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}
        >
          关闭
        </button>
        <button
          onClick={() => {
            setDone(true);
            onSuccess();
          }}
          style={{
            ...btnBase,
            background: done ? "var(--color-success-text)" : "var(--color-primary)",
            color: "#fff",
          }}
        >
          我已支付
        </button>
      </div>
    </div>
  );
}

/* ============ 对公转账弹窗内容 ============ */
function BankModalContent({
  bankInfo,
  amount,
  onClose,
  onSubmitted,
}: {
  bankInfo: {
    account_name: string;
    account_number: string;
    bank_name: string;
    branch_name: string;
  };
  amount: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  return (
    <div>
      <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>转账金额: ¥{amount.toFixed(2)}</p>
      <div
        style={{
          background: "var(--color-bg)",
          padding: 16,
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 14,
          lineHeight: 2,
        }}
      >
        <div>
          户名: <strong>{bankInfo.account_name}</strong>
        </div>
        <div>
          账号:{" "}
          <strong style={{ fontFamily: "monospace" }}>{bankInfo.account_number}</strong>
        </div>
        <div>开户行: {bankInfo.bank_name}</div>
        <div>支行: {bankInfo.branch_name}</div>
      </div>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16 }}>
        💡 转账后请在「充值记录」中对应订单上传凭证，财务审核到账后自动充值（工作日 T+1）。
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onClose}
          style={{ ...btnBase, background: "var(--color-bg)", color: "var(--color-text)" }}
        >
          关闭
        </button>
        <button
          onClick={onSubmitted}
          style={{ ...btnBase, background: "var(--color-primary)", color: "#fff" }}
        >
          我已转账，去上传凭证
        </button>
      </div>
    </div>
  );
}
