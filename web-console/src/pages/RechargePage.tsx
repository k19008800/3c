import { useState, useRef } from "react";
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

/* ============ 类型 ============ */
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
    branch_name?: string;
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

/* ============ 常量 ============ */
const QUICK_AMOUNTS = [100, 500, 1000, 5000, 10000];
const METHOD_LABEL: Record<string, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
  bank_transfer: "对公转账",
};
const METHOD_ICONS: Record<string, string> = {
  alipay: "💙",
  wechat: "💚",
  bank_transfer: "🏦",
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  maxWidth: 520,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const btnBase: React.CSSProperties = {
  padding: "8px 20px",
  borderRadius: 8,
  border: "1px solid #d9d9d9",
  background: "#fff",
  fontSize: 14,
  cursor: "pointer",
};

/* ============ 组件 ============ */
export default function RechargePage() {
  const qc = useQueryClient();
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<"alipay" | "wechat" | "bank_transfer">("alipay");
  const [paying, setPaying] = useState<RechargeResult | null>(null);
  const [bankOrder, setBankOrder] = useState<RechargeResult | null>(null);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "auditing">("idle");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const balanceQ = useQuery({
    queryKey: ["me-balance"],
    queryFn: async () => {
      const r = await api.get<{ data: { balance: number } }>("/me/balance");
      return r.data.data.balance;
    },
    refetchInterval: 15000,
  });

  const ordersQ = useQuery({
    queryKey: ["me-recharge-orders"],
    queryFn: async () => {
      const r = await api.get<{ data: { list: RechargeRecord[] } }>("/me/recharge-orders?page=1&page_size=5");
      return r.data.data.list;
    },
  });

  const promoQ = useQuery({
    queryKey: ["me-promotions"],
    queryFn: async () => {
      const r = await api.get<{ data: { list: Promotion[] } }>("/me/promotions");
      return r.data.data.list;
    },
  });

  const rechargeMut = useMutation({
    mutationFn: async () => {
      const r = await api.post<{ data: RechargeResult }>("/me/recharge", {
        amount: Number(amountInput),
        payment_method: method,
      });
      return r.data.data;
    },
    onSuccess: (d) => {
      // 对公转账：提交审核后只展示审核中状态，不弹 bankInfo 弹窗
      if (method !== "bank_transfer") {
        if (d.bank_info) setBankOrder(d);
        else setPaying(d);
      }
      // 下单落库成功后刷新记录（对公转账也在此刷新，避免 invalidate 先于 POST 完成）
      qc.invalidateQueries({ queryKey: ["me-recharge-orders"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const balance = balanceQ.data ?? 0;
  const amount = Number(amountInput) || 0;
  const isValidAmount = amount > 0;

  const handleSetAmount = (val: number) => {
    setAmountInput(String(val));
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setUploadFile(f);
  };

  const handleRemoveUpload = () => {
    setUploadFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmitTransfer = () => {
    setBankOrder(null);
    setSubmitStatus("auditing");
    // 对公转账：下单落库（status=pending），财务审核通过后到账
    rechargeMut.mutate();
    toast.success("对公转账申请已提交，等待财务审核（预计 1-3 个工作日）");
    qc.invalidateQueries({ queryKey: ["me-recharge-orders"] });
  };

  const topPromo = promoQ.data?.[0];

  const recordColumns: ColumnDef<RechargeRecord>[] = [
    {
      key: "order_id",
      title: "订单号",
      dataIndex: "order_id",
      render: (v) => <span style={{ fontFamily: "monospace", fontSize: 12 }}>{v as string}</span>,
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
        return <StatusBadge status="danger">{s}</StatusBadge>;
      },
    },
    {
      key: "created_at",
      title: "时间",
      dataIndex: "created_at",
      render: (v) => (
        <span style={{ fontSize: 12, color: "#888" }}>
          {new Date(v as string).toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
        💰 账户充值
        <HelpIcon text="为您的账户充值，支持支付宝、微信支付和对公转账" level="page" />
      </h2>

      {/* ===== 充值卡片（原型：recharge-card 单列） ===== */}
      <div style={card}>
        {/* 当前余额 */}
        <div style={{ fontSize: 14, color: "#888", marginBottom: 24 }}>
          当前余额 <span style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>¥{balance.toFixed(2)}</span>
        </div>

        {/* 金额输入 */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 6 }}>充值金额</label>
          <input
            type="text"
            value={amountInput}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              const parts = v.split(".");
              const sanitized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : v;
              setAmountInput(sanitized);
            }}
            placeholder="输入充值金额"
            style={{
              width: "100%",
              height: 48,
              padding: "0 16px",
              fontSize: 20,
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 快捷金额 */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
          {QUICK_AMOUNTS.map((val) => (
            <button
              key={val}
              onClick={() => handleSetAmount(val)}
              style={{
                ...btnBase,
                borderColor: amountInput === String(val) ? "#4f6ef7" : "#d9d9d9",
                background: amountInput === String(val) ? "#eef1ff" : "#fff",
                color: amountInput === String(val) ? "#4f6ef7" : "#333",
              }}
            >
              ¥{val.toLocaleString()}
            </button>
          ))}
        </div>

        {/* 支付方式 */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, color: "#333", marginBottom: 8 }}>支付方式</label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {(["alipay", "wechat", "bank_transfer"] as const).map((m) => (
              <label
                key={m}
                onClick={() => {
                  setMethod(m);
                  if (m === "bank_transfer") setSubmitStatus("idle");
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "12px 20px",
                  border: `1px solid ${method === m ? "#4f6ef7" : "#d9d9d9"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: method === m ? "#eef1ff" : "#fff",
                }}
              >
                <input
                  type="radio"
                  name="pay"
                  checked={method === m}
                  onChange={() => {}}
                  style={{ accentColor: "#4f6ef7" }}
                />
                {METHOD_ICONS[m]} {METHOD_LABEL[m]}
              </label>
            ))}
          </div>
        </div>

        {/* 对公转账信息（原型：点击"对公转账"后展现） */}
        {method === "bank_transfer" && submitStatus === "idle" && (
          <div
            style={{
              marginTop: 16,
              padding: 16,
              background: "#f8f9fa",
              borderRadius: 10,
              border: "1px solid #e8e8e8",
              marginBottom: 16,
            }}
          >
            <h4 style={{ fontSize: 14, marginBottom: 12 }}>🏦 对公转账信息</h4>

            {/* 后端缺失：银行信息由 /me/recharge 返回，此处用静态展示 */}
            <div style={{ display: "flex", marginBottom: 8, fontSize: 13 }}>
              <span style={{ width: 90, color: "#888", flexShrink: 0 }}>开户名称</span>
              <span style={{ color: "#333" }}>杭州灵通云智算科技有限公司</span>
            </div>
            <div style={{ display: "flex", marginBottom: 8, fontSize: 13 }}>
              <span style={{ width: 90, color: "#888", flexShrink: 0 }}>银行账号</span>
              <span
                style={{ color: "#4f6ef7", fontFamily: "monospace", cursor: "pointer" }}
                onClick={() => {
                  navigator.clipboard.writeText("5719020097201298888").then(() => toast.success("账号已复制"));
                }}
              >
                5719020097201298888 📋
              </span>
            </div>
            <div style={{ display: "flex", marginBottom: 8, fontSize: 13 }}>
              <span style={{ width: 90, color: "#888", flexShrink: 0 }}>开户银行</span>
              <span style={{ color: "#333" }}>招商银行杭州分行高新支行</span>
            </div>
            {isValidAmount && (
              <div style={{ display: "flex", marginBottom: 8, fontSize: 13 }}>
                <span style={{ width: 90, color: "#888", flexShrink: 0 }}>转账金额</span>
                <span style={{ color: "#e53935", fontWeight: 600 }}>¥{amount.toFixed(2)}</span>
              </div>
            )}
            <div
              style={{
                fontSize: 12,
                color: "#e53935",
                marginTop: 10,
                padding: "8px 12px",
                background: "#fff1f0",
                borderRadius: 6,
              }}
            >
              ⚠️ 请在转账备注中注明您的账号邮箱。对公转账到账后需人工审核，预计 1-3 个工作日到账。
            </div>

            {/* 上传凭证 */}
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 14, marginBottom: 12 }}>📎 上传转账凭证（可选）</h4>
              {!uploadFile ? (
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: "2px dashed #d9d9d9",
                    borderRadius: 10,
                    padding: 24,
                    textAlign: "center",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 13, color: "#888" }}>
                    拖拽或点击 <strong style={{ color: "#4f6ef7" }}>上传转账凭证</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "#bbb", marginTop: 4 }}>支持 JPG / PNG / PDF，不超过 10MB</div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*,.pdf"
                    style={{ display: "none" }}
                    onChange={handleUpload}
                  />
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    background: "#f0f9f0",
                    borderRadius: 8,
                    border: "1px solid #c8e6c9",
                  }}
                >
                  <span style={{ fontSize: 24 }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: "#333" }}>{uploadFile.name}</div>
                    <div style={{ fontSize: 12, color: "#888" }}>{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <span onClick={handleRemoveUpload} style={{ cursor: "pointer", color: "#e53935", fontSize: 12 }}>
                    ✕ 移除
                  </span>
                </div>
              )}
              <button
                onClick={handleSubmitTransfer}
                disabled={!isValidAmount}
                style={{
                  width: "100%",
                  height: 44,
                  background: isValidAmount ? "#22c55e" : "#a0b4f9",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 16,
                  cursor: isValidAmount ? "pointer" : "not-allowed",
                  marginTop: 16,
                }}
              >
                提交审核
              </button>
            </div>
          </div>
        )}

        {/* 审核中状态 */}
        {method === "bank_transfer" && submitStatus === "auditing" && (
          <div
            style={{
              marginTop: 16,
              marginBottom: 16,
              padding: 16,
              background: "#fff8e1",
              borderRadius: 10,
              border: "1px solid #ffe082",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 28 }}>⏳</span>
              <div>
                <h4 style={{ fontSize: 14, color: "#e65100", margin: "0 0 4px 0" }}>对公转账审核中</h4>
                <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
                  您已提交 ¥{amount.toFixed(2)} 的对公转账申请，预计 1-3 个工作日到账
                </p>
              </div>
            </div>
            <div style={{ marginTop: 12, height: 4, background: "#ffe082", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: "60%",
                  background: "#f57c00",
                  borderRadius: 2,
                  animation: "progressMove 2s ease-in-out infinite",
                }}
              />
            </div>
          </div>
        )}

        {/* 微信/支付宝充值按钮 */}
        {method !== "bank_transfer" && (
          <button
            onClick={() => rechargeMut.mutate()}
            disabled={!isValidAmount || rechargeMut.isPending}
            style={{
              width: "100%",
              height: 44,
              background: !isValidAmount ? "#a0b4f9" : "#4f6ef7",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 16,
              cursor: !isValidAmount ? "not-allowed" : "pointer",
            }}
          >
            {rechargeMut.isPending ? "创建订单中..." : "立即充值"}
          </button>
        )}

        {/* 充值记录链接 */}
        <a href="/topup-records" style={{ display: "block", textAlign: "right", marginTop: 16, fontSize: 13, color: "#4f6ef7", textDecoration: "none" }}>
          充值记录 →
        </a>
      </div>

      {/* ===== 充值记录（原型：卡片底部含表格链接，此处加一行简要记录） ===== */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          最近充值记录
          <HelpIcon text="最近 5 条充值记录，查看全部前往充值记录页面" />
        </h3>
        {ordersQ.isLoading ? (
          <SkeletonGroup lines={3} />
        ) : (ordersQ.data?.length ?? 0) === 0 ? (
          <EmptyState icon="💳" title="暂无充值记录" description="您还没有任何充值" actionText="去充值" onAction={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
        ) : (
          <Table columns={recordColumns} dataSource={ordersQ.data ?? []} loading={ordersQ.isLoading} emptyText="暂无充值记录" />
        )}
      </div>

      {/* ===== 扫码支付弹窗 ===== */}
      <Modal open={!!paying && method !== "bank_transfer"} onClose={() => setPaying(null)} title="扫码支付">
        {paying && (
          <PayModalContent
            amount={amount}
            qrUrl={paying.qr_code_url ?? ""}
            expiresAt={paying.expires_at ?? ""}
            onClose={() => setPaying(null)}
            onSuccess={() => {
              toast.success("充值成功！余额已更新");
              setPaying(null);
              qc.invalidateQueries({ queryKey: ["me-balance"] });
            }}
          />
        )}
      </Modal>

      {/* ===== 对公转账详情弹窗（后端返回 bank_info 时） ===== */}
      <Modal open={!!bankOrder} onClose={() => setBankOrder(null)} title="对公转账信息">
        {bankOrder && (
          <BankModalContent
            bankInfo={bankOrder.bank_info!}
            amount={amount}
            onClose={() => setBankOrder(null)}
            onSubmitted={() => {
              setBankOrder(null);
              toast.success("凭证已提交，财务将审核");
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
  const [left, setLeft] = useState(() => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  });

  useState(() => {
    const t = setInterval(() => setLeft((l) => (l > 0 ? l - 1 : 0)), 1000);
    return () => clearInterval(t);
  });

  return (
    <div style={{ textAlign: "center" }}>
      <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>¥{amount.toFixed(2)}</p>
      <div
        style={{
          width: 200,
          height: 200,
          margin: "0 auto 16px",
          border: "1px solid #d9d9d9",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f5f5f5",
        }}
      >
        {qrUrl ? (
          <img src={qrUrl} alt="支付二维码" width={180} height={180} />
        ) : (
          <span style={{ color: "#888", fontSize: 12 }}>二维码加载中…</span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
        剩余有效时间:{" "}
        <strong>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </strong>
      </p>
      <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>请使用支付宝/微信扫码完成支付</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          onClick={onClose}
          style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer" }}
        >
          关闭
        </button>
        <button
          onClick={onSuccess}
          style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#4f6ef7", color: "#fff", cursor: "pointer" }}
        >
          我已支付
        </button>
      </div>
    </div>
  );
}

/* ============ 对公转账弹窗内容（后端 bank_info 方式） ============ */
function BankModalContent({
  bankInfo,
  amount,
  onClose,
  onSubmitted,
}: {
  bankInfo: { account_name: string; account_number: string; bank_name: string; branch_name?: string };
  amount: number;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  return (
    <div>
      <p style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>转账金额: ¥{amount.toFixed(2)}</p>
      <div style={{ background: "#f5f5f5", padding: 16, borderRadius: 8, marginBottom: 16, fontSize: 14, lineHeight: 2 }}>
        <div>户名: <strong>{bankInfo.account_name}</strong></div>
        <div>账号: <strong style={{ fontFamily: "monospace" }}>{bankInfo.account_number}</strong></div>
        <div>开户行: {bankInfo.bank_name}</div>
        {bankInfo.branch_name && <div>支行: {bankInfo.branch_name}</div>}
      </div>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
        💡 转账后请在「充值记录」中对应订单上传凭证，财务审核到账后自动充值（工作日 T+1）。
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 8, border: "1px solid #d9d9d9", background: "#fff", cursor: "pointer" }}>
          关闭
        </button>
        <button onClick={onSubmitted} style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "#4f6ef7", color: "#fff", cursor: "pointer" }}>
          我已转账，去上传凭证
        </button>
      </div>
    </div>
  );
}
