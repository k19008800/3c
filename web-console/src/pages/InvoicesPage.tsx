import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  StatusBadge,
  Table,
  SkeletonGroup,
  EmptyState,
  useToast,
} from "@3cloud/shared-ui";
import type { ColumnDef } from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface InvoiceQuota {
  consumed: number;
  applied: number;
  available: number;
  accumulated_recharge?: number;
  total_invoiced?: number;
}
interface Invoice {
  id: number;
  invoice_no: string | null;
  type: string;
  type_label: string;
  status: string;
  status_label: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  title: string;
  tax_no: string | null;
  reject_reason: string | null;
  created_at: string;
}

/* ============ 常量 ============ */
const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};
const inp: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 6,
  border: "1px solid #d9d9d9",
  background: "#fff",
  color: "#333",
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [invoiceType, setInvoiceType] = useState<"general" | "special">("general");
  const [amountInput, setAmountInput] = useState("");
  const [form, setForm] = useState({
    title: "",
    tax_no: "",
    address: "",
    phone: "",
    bank: "",
    account: "",
    email: "",
    remark: "",
  });
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { toast } = useToast();

  /* 获取开票额度 */
  const quotaQ = useQuery({
    queryKey: ["me-invoices-quota"],
    queryFn: async () => {
      const r = await api.get<{ data: InvoiceQuota }>("/me/invoices/quota");
      return r.data.data;
    },
  });

  /* 获取发票列表 */
  const listQ = useQuery({
    queryKey: ["me-invoices-list"],
    queryFn: async () => {
      const r = await api.get<{ data: { list: Invoice[] } }>("/me/invoices");
      return r.data.data.list;
    },
  });

  /* 提交申请 */
  const applyMut = useMutation({
    mutationFn: async () => {
      const body: any = {
        amount: Number(amountInput),
        type: invoiceType === "special" ? "special" : "ordinary",
        title: form.title,
      };
      if (form.tax_no) body.tax_no = form.tax_no;
      if (form.address) body.address = form.address;
      if (form.phone) body.phone = form.phone;
      if (form.bank) body.bank = form.bank;
      if (form.account) body.bank_account = form.account;
      if (form.email) body.email = form.email;
      if (form.remark) body.remark = form.remark;
      return (await api.post("/me/invoices", body)).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => {
      toast.success(d?.data?.message ?? "发票申请已提交");
      setAmountInput("");
      setForm({ title: "", tax_no: "", address: "", phone: "", bank: "", account: "", email: "", remark: "" });
      qc.invalidateQueries({ queryKey: ["me-invoices-quota"] });
      qc.invalidateQueries({ queryKey: ["me-invoices-list"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  /* 下载 PDF */
  const handleDownload = async (id: number) => {
    try {
      setDownloadingId(id);
      const res = await api.get(`/me/invoices/${id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("发票 PDF 已下载");
    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setDownloadingId(null);
    }
  };

  const quota = quotaQ.data;
  const available = quota?.available ?? 0;
  /* 原型展示公式：累计充值 — 已开票金额，用 extended 字段 */
  const accumulated = (quota as any)?.accumulated_recharge ?? (quota?.consumed ?? 0);
  const invoicedAmount = (quota as any)?.total_invoiced ?? (quota?.applied ?? 0);

  const isSpecial = invoiceType === "special";
  const amount = Number(amountInput) || 0;
  const isValid =
    amount >= 100 && amount <= available && form.title.trim() !== "" &&
    (!isSpecial || (form.tax_no.trim() && form.address.trim() && form.phone.trim() && form.bank.trim() && form.account.trim()));

  const invoiceColumns: ColumnDef<Invoice>[] = [
    {
      key: "created_at",
      title: "申请时间",
      dataIndex: "created_at",
      render: (v) => (
        <span style={{ fontSize: 12 }}>
          {new Date(v as string).toLocaleString()}
        </span>
      ),
    },
    {
      key: "type_label",
      title: "发票类型",
      dataIndex: "type_label",
      render: (v) => (v as string) ?? (invoiceType === "general" ? "普通发票（电子）" : "专用发票（电子）"),
    },
    {
      key: "total_amount",
      title: "开票金额",
      dataIndex: "total_amount",
      render: (v) => `¥${(v as number).toFixed(2)}`,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v, record) => {
        const s = v as string;
        const inv = record as Invoice;
        if (s === "issued") return <StatusBadge status="success">已开票</StatusBadge>;
        if (s === "pending") return <StatusBadge status="warning">待审核</StatusBadge>;
        if (s === "rejected")
          return (
            <span
              title={inv.reject_reason ?? undefined}
              style={{ cursor: "help" }}
            >
              <StatusBadge status="danger">已驳回</StatusBadge>
            </span>
          );
        return <StatusBadge status="default">{inv.status_label ?? s}</StatusBadge>;
      },
    },
    {
      key: "action",
      title: "操作",
      render: (_, record) => {
        const inv = record as Invoice;
        if (inv.status === "issued") {
          return (
            <button
              onClick={() => handleDownload(inv.id)}
              disabled={downloadingId === inv.id}
              style={{
                fontSize: 12,
                color: "#4f6ef7",
                cursor: "pointer",
                background: "none",
                border: "none",
                textDecoration: "underline",
              }}
            >
              {downloadingId === inv.id ? "下载中..." : "下载 PDF"}
            </button>
          );
        }
        if (inv.status === "rejected" && inv.reject_reason) {
          return <span style={{ fontSize: 12, color: "#888" }} title={inv.reject_reason}>驳回原因</span>;
        }
        if (inv.status === "pending") return <span style={{ fontSize: 12, color: "#888" }}>—</span>;
        return null;
      },
    },
  ];

  return (
    <div>
      {/* 标题 */}
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
        发票申请
        <HelpIcon text="申请开具电子/纸质发票，查看历史开票记录" level="page" />
      </h2>

      {/* ===== 可开票余额卡片（原型：balance-card 布局） ===== */}
      <div
        style={{
          ...card,
          padding: 24,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 13, color: "#888", display: "flex", alignItems: "center", gap: 6 }}>
            可开票余额
            <HelpIcon text="可开票余额 = 累计充值金额 — 已开票金额" />
          </div>
          <div style={{ fontSize: 32, fontWeight: 600, color: "#333" }}>¥{available.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
            可开票余额 = <span style={{ color: "#4f6ef7" }}>累计充值 ¥{accumulated.toFixed(2)}</span> — <span style={{ color: "#4f6ef7" }}>已开票金额 ¥{invoicedAmount.toFixed(2)}</span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, color: "#888", marginBottom: 4 }}>
            累计充值 <span style={{ color: "#333", fontWeight: 500 }}>¥{accumulated.toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 13, color: "#888" }}>
            已开票金额 <span style={{ color: "#333", fontWeight: 500 }}>¥{invoicedAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* ===== 开票申请面板 ===== */}
      <div style={{ ...card, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", gap: 6 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
            开票申请
            <HelpIcon text="填写发票类型、金额及开票信息后提交申请" />
          </h3>
        </div>
        <div style={{ padding: 20 }}>

          {/* 发票类型切换（原型：type-tabs） */}
          <div style={{ display: "flex", gap: 4, background: "#f5f5f5", borderRadius: 6, padding: 3, marginBottom: 20, width: "fit-content" }}>
            {([
              { v: "general" as const, label: "普通发票（电子）" },
              { v: "special" as const, label: "专用发票（纸质/电子）" },
            ]).map((t) => (
              <button
                key={t.v}
                onClick={() => setInvoiceType(t.v)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 4,
                  border: "none",
                  background: invoiceType === t.v ? "#fff" : "transparent",
                  color: invoiceType === t.v ? "#4f6ef7" : "#888",
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: invoiceType === t.v ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 金额输入 */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              开票金额
              <HelpIcon text="开票金额不能超过可开票余额，最低开票金额 ¥100" />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 10 }}>
              <span style={{ padding: "8px 12px", background: "#fafafa", border: "1px solid #d9d9d9", borderRight: "none", borderRadius: "6px 0 0 6px", color: "#888", fontSize: 14 }}>
                ¥
              </span>
              <input
                type="text"
                value={amountInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, "");
                  const parts = v.split(".");
                  setAmountInput(parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : v);
                }}
                placeholder="请输入开票金额"
                style={{
                  flex: 1,
                  maxWidth: 300,
                  padding: "8px 12px",
                  border: "1px solid #d9d9d9",
                  borderRadius: "0 6px 6px 0",
                  background: "#fff",
                  color: "#333",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                { label: "全部可用余额", mode: "all" },
                { label: "50%", mode: "50" },
                { label: "100%", mode: "100" },
              ].map((btn) => {
                let val = "";
                if (btn.mode === "all") val = available.toFixed(2);
                else if (btn.mode === "50") val = (available * 0.5).toFixed(2);
                else if (btn.mode === "100") val = available.toFixed(2);
                return (
                  <button
                    key={btn.mode}
                    onClick={() => setAmountInput(val)}
                    style={{
                      padding: "4px 12px",
                      borderRadius: 6,
                      border: `1px solid ${amountInput === val ? "#4f6ef7" : "#d9d9d9"}`,
                      background: amountInput === val ? "#eef1ff" : "#fff",
                      color: amountInput === val ? "#4f6ef7" : "#888",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 开票信息表单 */}
          <div style={{ display: "grid", gridTemplateColumns: isSpecial ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 24 }}>
            {/* 名称（通用 + 专票都需要） */}
            <div style={{ gridColumn: isSpecial ? "1/-1" : undefined, display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 4 }}>
                名称
                <HelpIcon text="发票抬头名称，如企业全称" />
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="请输入发票抬头名称"
                style={inp}
              />
            </div>

            {/* 专用发票额外字段 */}
            {isSpecial && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 4 }}>
                    税号
                    <HelpIcon text="纳税人识别号（统一社会信用代码）" />
                  </label>
                  <input
                    value={form.tax_no}
                    onChange={(e) => setForm({ ...form, tax_no: e.target.value })}
                    placeholder="请输入税号"
                    style={inp}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 4 }}>
                    地址
                    <HelpIcon text="注册地址" />
                  </label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="请输入注册地址"
                    style={inp}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 4 }}>
                    电话
                    <HelpIcon text="注册联系电话" />
                  </label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="请输入联系电话"
                    style={inp}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 4 }}>
                    开户行
                    <HelpIcon text="开户银行名称" />
                  </label>
                  <input
                    value={form.bank}
                    onChange={(e) => setForm({ ...form, bank: e.target.value })}
                    placeholder="请输入开户银行"
                    style={inp}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 4 }}>
                    账号
                    <HelpIcon text="银行账号" />
                  </label>
                  <input
                    value={form.account}
                    onChange={(e) => setForm({ ...form, account: e.target.value })}
                    placeholder="请输入银行账号"
                    style={inp}
                  />
                </div>
              </>
            )}

            {/* 邮箱 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#333", display: "flex", alignItems: "center", gap: 4 }}>
                收票邮箱
                <HelpIcon text="已开票后发送 PDF 至该邮箱" />
              </label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="请输入收票邮箱"
                style={inp}
              />
            </div>

            {/* 备注 */}
            <div style={{ gridColumn: "1/-1", display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, color: "#333" }}>备注</label>
              <input
                value={form.remark}
                onChange={(e) => setForm({ ...form, remark: e.target.value })}
                placeholder="备注（可选）"
                style={inp}
              />
            </div>
          </div>

          {/* 提交区 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 8 }}>
            <button
              onClick={() => applyMut.mutate()}
              disabled={!isValid || applyMut.isPending}
              style={{
                padding: "10px 32px",
                borderRadius: 8,
                border: "none",
                background: !isValid ? "#f5f5f5" : "#4f6ef7",
                color: !isValid ? "#bbb" : "#fff",
                fontSize: 14,
                fontWeight: 500,
                cursor: !isValid ? "not-allowed" : "pointer",
              }}
            >
              提交申请
            </button>
            <a href="#records" style={{ fontSize: 13, color: "#4f6ef7", textDecoration: "none" }}>
              开票记录 →
            </a>
          </div>
        </div>
      </div>

      {/* ===== 开票记录面板（原型：下方记录表格，5列） ===== */}
      <div style={{ ...card, overflow: "hidden" }} id="records">
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
            开票记录
            <HelpIcon text="按申请时间倒序排列，可下载已开票的 PDF 文件" />
          </h3>
        </div>
        <div style={{ padding: 0 }}>
          {listQ.isLoading ? (
            <div style={{ padding: 20 }}>
              <SkeletonGroup lines={4} />
            </div>
          ) : (listQ.data?.length ?? 0) === 0 ? (
            <EmptyState icon="🧾" title="暂无开票记录" description="您还没有申请过发票" />
          ) : (
            <Table
              columns={invoiceColumns}
              dataSource={listQ.data ?? []}
              loading={listQ.isLoading}
              emptyText="暂无开票记录"
            />
          )}
        </div>
      </div>
    </div>
  );
}
