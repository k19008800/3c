import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  Table,
  StatusBadge,
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

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const inp: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 10,
  fontFamily: "inherit",
};
const btnBase: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    amount: "",
    type: "ordinary",
    title: "",
    tax_no: "",
    address: "",
    bank_account: "",
    email: "",
    remark: "",
  });
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { toast } = useToast();

  const quotaQ = useQuery({
    queryKey: ["me-invoices-quota"],
    queryFn: async () =>
      (await api.get<{ data: InvoiceQuota }>("/me/invoices/quota")).data.data,
  });
  const listQ = useQuery({
    queryKey: ["me-invoices-list"],
    queryFn: async () =>
      (await api.get<{ data: { list: Invoice[] } }>("/me/invoices")).data.data.list,
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const body: any = { amount: Number(form.amount), type: form.type, title: form.title };
      if (form.tax_no) body.tax_no = form.tax_no;
      if (form.address) body.address = form.address;
      if (form.bank_account) body.bank_account = form.bank_account;
      if (form.email) body.email = form.email;
      if (form.remark) body.remark = form.remark;
      return (await api.post("/me/invoices", body)).data;
    },
    onSuccess: (d: { data?: { message?: string } }) => {
      toast.success(d?.data?.message ?? "发票申请已提交");
      setForm({
        amount: "",
        type: "ordinary",
        title: "",
        tax_no: "",
        address: "",
        bank_account: "",
        email: "",
        remark: "",
      });
      qc.invalidateQueries({ queryKey: ["me-invoices-quota"] });
      qc.invalidateQueries({ queryKey: ["me-invoices-list"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

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

  const invoiceColumns: ColumnDef<Invoice>[] = [
    {
      key: "invoice_no",
      title: "发票号",
      dataIndex: "invoice_no",
      render: (v) => (
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{(v as string) ?? "-"}</span>
      ),
    },
    {
      key: "title",
      title: "抬头",
      dataIndex: "title",
      render: (v) => (
        <span
          style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}
          title={v as string}
        >
          {v as string}
        </span>
      ),
    },
    { key: "type_label", title: "类型", dataIndex: "type_label" },
    {
      key: "total_amount",
      title: "金额",
      dataIndex: "total_amount",
      render: (v) => `¥${(v as number).toFixed(2)}`,
    },
    {
      key: "status",
      title: "状态",
      dataIndex: "status",
      render: (v, record) => {
        const s = v as string;
        if (s === "issued") return <StatusBadge status="success">{(record as Invoice).status_label}</StatusBadge>;
        if (s === "pending") return <StatusBadge status="info">{(record as Invoice).status_label}</StatusBadge>;
        if (s === "rejected") return <StatusBadge status="danger">{(record as Invoice).status_label}</StatusBadge>;
        return <StatusBadge status="default">{(record as Invoice).status_label}</StatusBadge>;
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
              style={{ ...btnBase, background: "var(--color-success-text)", color: "#fff", padding: "4px 10px" }}
            >
              {downloadingId === inv.id ? "下载中..." : "下载 PDF"}
            </button>
          );
        }
        if (inv.status === "rejected" && inv.reject_reason) {
          return <span style={{ fontSize: 12, color: "var(--color-danger-text)" }} title={inv.reject_reason}>驳回</span>;
        }
        if (inv.status === "pending") return <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>审核中</span>;
        return null;
      },
    },
  ];

  return (
    <div>
      <h2 style={{ marginBottom: 20 }}>
        发票开具
        <HelpIcon text="申请开具发票，支持增值税普通发票和专用发票。查看开票额度和历史发票记录，已开票可下载 PDF。" level="page" />
      </h2>

      {/* 额度卡 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard label="累计已消费" value={`¥${(quota?.consumed ?? 0).toFixed(2)}`} hint="历史账单总额" />
        <StatCard label="已申请/已开票" value={`¥${(quota?.applied ?? 0).toFixed(2)}`} hint="占用开票额度" />
        <StatCard label="可开票额度" value={`¥${(quota?.available ?? 0).toFixed(2)}`} hint="消费 - 已申请" />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(340px, 420px) 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* 申请表单 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>
            申请发票
            <HelpIcon text="填写发票信息并提交申请。专票需提供纳税人识别号。审核通过后可在列表中下载 PDF。" level="button" />
          </h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            {[
              { v: "ordinary", label: "增值税普通发票" },
              { v: "special", label: "增值税专用发票" },
            ].map((t) => (
              <label
                key={t.v}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  checked={form.type === t.v}
                  onChange={() => setForm({ ...form, type: t.v })}
                />
                {t.label}
              </label>
            ))}
          </div>
          <input
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            placeholder={`开票金额 (可用 ¥${(quota?.available ?? 0).toFixed(2)})`}
            type="number"
            step="0.01"
            style={inp}
          />
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="发票抬头 *"
            style={inp}
          />
          {form.type === "special" && (
            <input
              value={form.tax_no}
              onChange={(e) => setForm({ ...form, tax_no: e.target.value })}
              placeholder="纳税人识别号 * (专票必填)"
              style={inp}
            />
          )}
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="注册地址"
            style={inp}
          />
          <input
            value={form.bank_account}
            onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
            placeholder="开户行及账号"
            style={inp}
          />
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="收票邮箱"
            style={inp}
          />
          <textarea
            value={form.remark}
            onChange={(e) => setForm({ ...form, remark: e.target.value })}
            placeholder="备注"
            rows={2}
            style={{ ...inp, resize: "vertical" }}
          />
          <button
            onClick={() => applyMut.mutate()}
            disabled={!form.amount || !form.title || applyMut.isPending}
            style={{ ...btnBase, background: "var(--color-primary)", color: "#fff", width: "100%" }}
          >
            {applyMut.isPending ? "提交中..." : "提交申请"}
          </button>
        </div>

        {/* 我的发票列表 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>我的发票</h3>
          {listQ.isLoading ? (
            <SkeletonGroup lines={4} />
          ) : (listQ.data?.length ?? 0) === 0 ? (
            <EmptyState icon="🧾" title="暂无发票申请记录" description="您还没有申请过发票" />
          ) : (
            <Table
              columns={invoiceColumns}
              dataSource={listQ.data ?? []}
              loading={listQ.isLoading}
              emptyText="暂无发票申请记录"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 4 }}>{hint}</div>
    </div>
  );
}
