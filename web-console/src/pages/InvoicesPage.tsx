import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";

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
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid #cbd5e1", width: "100%", boxSizing: "border-box", marginBottom: 10, fontFamily: "inherit" };
const btnBase: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13 };
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#dbeafe", color: "#1e40af" },
  issued: { bg: "#dcfce7", color: "#166534" },
  rejected: { bg: "#fee2e2", color: "#991b1b" },
  voided: { bg: "#f1f5f9", color: "#475569" },
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ amount: "", type: "ordinary", title: "", tax_no: "", address: "", bank_account: "", email: "", remark: "" });
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const quotaQ = useQuery({
    queryKey: ["me-invoices-quota"],
    queryFn: async () => (await api.get<{ data: InvoiceQuota }>("/me/invoices/quota")).data.data,
  });
  const listQ = useQuery({
    queryKey: ["me-invoices-list"],
    queryFn: async () => (await api.get<{ data: { list: Invoice[] } }>("/me/invoices")).data.data.list,
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
      setNotice({ type: "success", msg: d?.data?.message ?? "发票申请已提交" });
      setForm({ amount: "", type: "ordinary", title: "", tax_no: "", address: "", bank_account: "", email: "", remark: "" });
      qc.invalidateQueries({ queryKey: ["me-invoices-quota"] });
      qc.invalidateQueries({ queryKey: ["me-invoices-list"] });
    },
    onError: (e) => setNotice({ type: "error", msg: extractError(e) }),
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
      setNotice({ type: "success", msg: "发票 PDF 已下载" });
    } catch (e) {
      setNotice({ type: "error", msg: extractError(e) });
    } finally {
      setDownloadingId(null);
    }
  };

  const quota = quotaQ.data;

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ marginBottom: 20 }}>发票开具</h2>

      {/* 额度卡 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="累计已消费" value={`¥${(quota?.consumed ?? 0).toFixed(2)}`} hint="历史账单总额" />
        <StatCard label="已申请/已开票" value={`¥${(quota?.applied ?? 0).toFixed(2)}`} hint="占用开票额度" />
        <StatCard label="可开票额度" value={`¥${(quota?.available ?? 0).toFixed(2)}`} hint="消费 - 已申请" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px, 420px) 1fr", gap: 24, alignItems: "start" }}>
        {/* 申请表单 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>申请发票</h3>
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            {[{ v: "ordinary", label: "增值税普通发票" }, { v: "special", label: "增值税专用发票" }].map((t) => (
              <label key={t.v} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input type="radio" checked={form.type === t.v} onChange={() => setForm({ ...form, type: t.v })} />
                {t.label}
              </label>
            ))}
          </div>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={`开票金额 (可用 ¥${(quota?.available ?? 0).toFixed(2)})`} type="number" step="0.01" style={inp} />
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="发票抬头 *" style={inp} />
          {form.type === "special" && <input value={form.tax_no} onChange={(e) => setForm({ ...form, tax_no: e.target.value })} placeholder="纳税人识别号 * (专票必填)" style={inp} />}
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="注册地址" style={inp} />
          <input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} placeholder="开户行及账号" style={inp} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="收票邮箱" style={inp} />
          <textarea value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="备注" rows={2} style={{ ...inp, resize: "vertical" }} />
          <button
            onClick={() => applyMut.mutate()}
            disabled={!form.amount || !form.title || applyMut.isPending}
            style={{ ...btnBase, background: "#2563eb", color: "#fff", width: "100%" }}
          >
            {applyMut.isPending ? "提交中..." : "提交申请"}
          </button>
        </div>

        {/* 我的发票列表 */}
        <div style={card}>
          <h3 style={{ marginBottom: 16 }}>我的发票</h3>
          {listQ.isLoading ? (
            <div style={{ color: "#94a3b8" }}>加载中...</div>
          ) : (listQ.data?.length ?? 0) === 0 ? (
            <div style={{ color: "#94a3b8", padding: 30, textAlign: "center" }}>暂无发票申请记录</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ color: "#64748b", textAlign: "left" }}>
                  <th style={{ padding: "8px" }}>发票号</th>
                  <th style={{ padding: "8px" }}>抬头</th>
                  <th style={{ padding: "8px" }}>类型</th>
                  <th style={{ padding: "8px" }}>金额</th>
                  <th style={{ padding: "8px" }}>状态</th>
                  <th style={{ padding: "8px" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {listQ.data?.map((inv) => (
                  <tr key={inv.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{inv.invoice_no ?? "-"}</td>
                    <td style={{ padding: "8px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={inv.title}>{inv.title}</td>
                    <td style={{ padding: "8px" }}>{inv.type_label}</td>
                    <td style={{ padding: "8px" }}>¥{inv.total_amount.toFixed(2)}</td>
                    <td style={{ padding: "8px" }}>
                      <span style={{ ...(STATUS_STYLE[inv.status] ?? STATUS_STYLE.pending), padding: "2px 10px", borderRadius: 6, fontSize: 12 }}>
                        {inv.status_label}
                      </span>
                    </td>
                    <td style={{ padding: "8px" }}>
                      {inv.status === "issued" && (
                        <button onClick={() => handleDownload(inv.id)} disabled={downloadingId === inv.id} style={{ ...btnBase, background: "#16a34a", color: "#fff", padding: "4px 10px" }}>
                          {downloadingId === inv.id ? "下载中..." : "下载 PDF"}
                        </button>
                      )}
                      {inv.status === "rejected" && inv.reject_reason && (
                        <span style={{ fontSize: 12, color: "#991b1b" }} title={inv.reject_reason}>驳回</span>
                      )}
                      {inv.status === "pending" && <span style={{ fontSize: 12, color: "#94a3b8" }}>审核中</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {notice && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1100, padding: "12px 20px", borderRadius: 8, color: "#fff", background: notice.type === "success" ? "#16a34a" : "#dc2626", boxShadow: "0 4px 12px rgba(0,0,0,.15)" }}>
          {notice.msg}
          <button onClick={() => setNotice(null)} style={{ marginLeft: 12, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{hint}</div>
    </div>
  );
}
