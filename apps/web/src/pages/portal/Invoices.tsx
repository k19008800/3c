import { useState, useEffect, useCallback } from "react";
import PortalLayout from "../../components/PortalLayout";
import HelpIcon from "../../components/HelpIcon";
import Modal from "../../components/Modal";
import api from "../../services/api";

interface Invoice {
  id: string;
  number: string;
  amount: number;
  date: string;
  status: "issued" | "pending" | "cancelled";
  type: string;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  issued: { label: "已开具", cls: "badge-success" },
  pending: { label: "处理中", cls: "badge-warning" },
  cancelled: { label: "已取消", cls: "badge-danger" },
};

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [applyForm, setApplyForm] = useState({
    amount: "",
    title: "",
    taxId: "",
    type: "电子普通发票",
    email: "",
  });
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await api.get<Invoice[]>("/invoices");
      if (error) throw new Error(error);
      setInvoices(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setLoadError(e.message || "加载发票列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleApply = async () => {
    if (!applyForm.amount || !applyForm.title) return;
    setApplySubmitting(true);
    try {
      const { error } = await api.post("/invoices", {
        amount: parseFloat(applyForm.amount),
        title: applyForm.title,
        tax_id: applyForm.taxId || undefined,
        type: applyForm.type,
        email: applyForm.email || undefined,
      });
      if (error) throw new Error(error);
      setShowApply(false);
      setApplyForm({ amount: "", title: "", taxId: "", type: "电子普通发票", email: "" });
      fetchInvoices();
    } catch (e: any) {
      setActionError(e.message || "提交发票申请失败");
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setApplySubmitting(false);
    }
  };

  return (
    <PortalLayout>
      <h1 className="page-title">
        发票管理 <HelpIcon title="查看已开具的发票或申请新的发票" />
      </h1>
      <p className="page-subtitle">管理您的消费发票，支持电子发票和专用发票</p>

      {actionError && (
        <div style={{ padding: "8px 12px", marginBottom: 12, background: "var(--color-warning-bg)", borderRadius: 6, fontSize: 13, color: "var(--color-warning-text)" }}>
          {actionError}
        </div>
      )}

      <div className="section mt-4">
        {loading ? (
          <div className="empty-state"><div className="empty-state-icon">⏳</div><div>加载中...</div></div>
        ) : loadError ? (
          <div className="empty-state"><div className="empty-state-icon">⚠️</div><div>{loadError}</div></div>
        ) : (
        <div className="card">
          <div className="flex-between mb-4">
            <div className="card-title" style={{ marginBottom: 0 }}>发票列表</div>
            <button className="btn btn-primary" onClick={() => setShowApply(true)}>
              + 申请开票 <HelpIcon title="填写开票信息，提交发票申请" />
            </button>
          </div>
          {invoices.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <div>暂无发票记录</div>
            </div>
          ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>发票编号</th>
                  <th>发票类型</th>
                  <th>金额</th>
                  <th>日期</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const status = STATUS_MAP[inv.status] || STATUS_MAP["pending"];
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontFamily: "monospace" }}>{inv.number}</td>
                      <td>{inv.type}</td>
                      <td>¥{Number(inv.amount).toFixed(2)}</td>
                      <td>{inv.date}</td>
                      <td>
                        <span className={`badge ${status.cls}`}>{status.label}</span>
                      </td>
                      <td>
                        <div className="flex-row gap-2">
                          <button className="btn btn-outline btn-sm">查看</button>
                          {inv.status === "issued" && (
                            <button className="btn btn-primary btn-sm">下载</button>
                          )}
                          {inv.status === "pending" && (
                            <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>等待中</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )}
      </div>

      <Modal open={showApply} onClose={() => setShowApply(false)} title="申请开票">
        <div className="form-group">
          <label className="form-label">开票金额 (¥)</label>
          <input
            className="form-input"
            type="number"
            placeholder="请输入开票金额"
            value={applyForm.amount}
            onChange={(e) => setApplyForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">发票抬头</label>
          <input
            className="form-input"
            type="text"
            placeholder="公司名称或个人姓名"
            value={applyForm.title}
            onChange={(e) => setApplyForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">纳税人识别号</label>
          <input
            className="form-input"
            type="text"
            placeholder="选填"
            value={applyForm.taxId}
            onChange={(e) => setApplyForm((f) => ({ ...f, taxId: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">发票类型</label>
          <select
            className="form-input"
            value={applyForm.type}
            onChange={(e) => setApplyForm((f) => ({ ...f, type: e.target.value }))}
          >
            <option>电子普通发票</option>
            <option>增值税专用发票</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">接收邮箱</label>
          <input
            className="form-input"
            type="email"
            placeholder="用于接收电子发票"
            value={applyForm.email}
            onChange={(e) => setApplyForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="flex-row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn btn-outline" onClick={() => setShowApply(false)}>
            取消
          </button>
          <button
            className="btn btn-primary"
            onClick={handleApply}
            disabled={applySubmitting || !applyForm.amount || !applyForm.title}
          >
            {applySubmitting ? "提交中..." : "提交申请"}
          </button>
        </div>
      </Modal>
    </PortalLayout>
  );
}
