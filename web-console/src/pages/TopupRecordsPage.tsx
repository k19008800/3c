import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import {
  HelpIcon,
  StatusBadge,
  useToast,
  SkeletonGroup,
  Modal,
  EmptyState,
} from "@3cloud/shared-ui";

/* ============ 类型 ============ */
interface TopupRecord {
  id: number;
  order_id: string;
  amount: number;
  payment_method: string;
  method_label?: string;
  status: string;
  status_label?: string;
  create_time: string;
  complete_time: string | null;
  payer?: string;
  trade_no?: string | null;
  remark?: string | null;
  voucher?: string | null;
  reject_reason?: string | null;
}

/* ============ 常量 ============ */
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const METHOD_LABEL: Record<string, string> = {
  alipay: "支付宝",
  wechat: "微信支付",
  bank_transfer: "对公转账",
  bank: "对公转账",
  usdt: "USDT",
};
const STATUS_LABEL: Record<string, { label: string; status: "success" | "warning" | "danger" | "default" }> = {
  completed: { label: "已完成", status: "success" },
  pending: { label: "待审核", status: "warning" },
  rejected: { label: "驳回", status: "danger" },
  cancelled: { label: "已取消", status: "default" },
};

export default function TopupRecordsPage() {
  const [timeRange, setTimeRange] = useState<"7" | "30" | "90" | "custom">("7");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailRecord, setDetailRecord] = useState<TopupRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  /* 真实 API 获取记录 */
  const { data, isLoading } = useQuery({
    queryKey: ["me-recharge-records", timeRange, startDate, endDate, page, pageSize],
    queryFn: async () => {
      const params: any = { page, page_size: pageSize };
      if (timeRange === "custom" && startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      } else if (timeRange !== "custom") {
        params.days = Number(timeRange);
      }
      const r = await api.get<{ data: { list: TopupRecord[]; total: number } }>("/me/recharge/records", { params });
      return r.data.data;
    },
  });

  /* 客户端侧筛选（支付方式+状态） — 后端若支持 query 参数可直接过滤，否则客户端本地筛 */
  const filteredList = useMemo(() => {
    let list = data?.list ?? [];
    if (filterMethod) list = list.filter((r) => r.payment_method === filterMethod);
    if (filterStatus) list = list.filter((r) => r.status === filterStatus);
    return list;
  }, [data, filterMethod, filterStatus]);

  const total = data?.total ?? 0;

  const handleReset = useCallback(() => {
    setTimeRange("7");
    setStartDate("");
    setEndDate("");
    setFilterMethod("");
    setFilterStatus("");
    setPage(1);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      /* 后端缺失：/me/recharge/records/export 导出接口，当前由前端生成 CSV */
      const allResp = await api.get<{ data: { list: TopupRecord[] } }>("/me/recharge/records", {
        params: { page: 1, page_size: 9999, days: timeRange === "custom" ? undefined : Number(timeRange) },
      });
      const rows = (allResp.data.data.list ?? []).filter((r) => {
        if (filterMethod && r.payment_method !== filterMethod) return false;
        if (filterStatus && r.status !== filterStatus) return false;
        return true;
      });

      const header = ["订单号", "充值金额", "支付方式", "状态", "创建时间", "完成时间"];
      const csvRows = rows.map((r) =>
        [
          r.order_id,
          (r.amount / 100).toFixed(2),
          METHOD_LABEL[r.payment_method] ?? r.payment_method,
          STATUS_LABEL[r.status]?.label ?? r.status,
          r.create_time,
          r.complete_time ?? "",
        ].join(",")
      );
      const csv = "\uFEFF" + header.join(",") + "\n" + csvRows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `充值记录_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV 导出成功");
    } catch (e) {
      toast.error(extractError(e));
    } finally {
      setExporting(false);
    }
  }, [timeRange, filterMethod, filterStatus, toast]);

  return (
    <div>
      {/* 标题 */}
      <h2 style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 20, fontWeight: 600 }}>
        📋 充值记录
        <HelpIcon text="查看所有充值订单记录，支持按时间、支付方式、状态筛选，可导出 CSV" level="page" />
      </h2>

      {/* ===== 时间筛选栏（原型：近7/30/90天 + 自定义日期） ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#888", whiteSpace: "nowrap" }}>时间范围：</span>
        {([
          { k: "7" as const, label: "近7天" },
          { k: "30" as const, label: "近30天" },
          { k: "90" as const, label: "近90天" },
          { k: "custom" as const, label: "自定义" },
        ]).map((t) => (
          <button
            key={t.k}
            onClick={() => {
              setTimeRange(t.k);
              setPage(1);
            }}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: `1px solid ${timeRange === t.k ? "#4f6ef7" : "#d9d9d9"}`,
              background: timeRange === t.k ? "#4f6ef7" : "#fff",
              color: timeRange === t.k ? "#fff" : "#888",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
        {timeRange === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #d9d9d9",
                fontSize: 13,
                width: 130,
              }}
            />
            <span style={{ color: "#888", fontSize: 13 }}>至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #d9d9d9",
                fontSize: 13,
                width: 130,
              }}
            />
            <button
              onClick={() => {
                if (!startDate || !endDate) {
                  toast.error("请选择起止日期");
                  return;
                }
                setPage(1);
              }}
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                border: "1px solid #4f6ef7",
                background: "#4f6ef7",
                color: "#fff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              应用
            </button>
          </div>
        )}
      </div>

      {/* ===== 支付方式 + 状态 筛选 + 导出 ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#888" }}>支付方式：</span>
        <select
          value={filterMethod}
          onChange={(e) => { setFilterMethod(e.target.value); setPage(1); }}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #d9d9d9",
            fontSize: 13,
            minWidth: 120,
            background: "#fff",
          }}
        >
          <option value="">全部</option>
          <option value="alipay">支付宝</option>
          <option value="wechat">微信支付</option>
          <option value="bank_transfer">对公转账</option>
          <option value="usdt">USDT</option>
        </select>

        <span style={{ fontSize: 13, color: "#888", marginLeft: 8 }}>状态：</span>
        <select
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #d9d9d9",
            fontSize: 13,
            minWidth: 120,
            background: "#fff",
          }}
        >
          <option value="">全部</option>
          <option value="completed">已完成</option>
          <option value="pending">待审核</option>
          <option value="rejected">驳回</option>
          <option value="cancelled">已取消</option>
        </select>

        <button
          onClick={handleReset}
          style={{
            padding: "4px 12px",
            borderRadius: 4,
            border: "1px solid #d9d9d9",
            background: "transparent",
            color: "#888",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          重置
        </button>

        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            marginLeft: "auto",
            padding: "6px 16px",
            borderRadius: 6,
            border: "1px solid #4f6ef7",
            background: "#4f6ef7",
            color: "#fff",
            fontSize: 13,
            cursor: exporting ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: exporting ? 0.6 : 1,
          }}
        >
          {exporting && (
            <span
              style={{
                width: 12,
                height: 12,
                border: "2px solid rgba(255,255,255,.4)",
                borderTopColor: "#fff",
                borderRadius: "50%",
                display: "inline-block",
                animation: "spin 0.6s linear infinite",
              }}
            />
          )}
          导出 CSV
          <HelpIcon text="导出当前筛选结果为 CSV 文件" />
        </button>
      </div>

      {/* ===== 表格面板 ===== */}
      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#333", display: "flex", alignItems: "center", gap: 6 }}>
            充值记录
            <HelpIcon text="展示所有充值订单，点击订单号查看详情" />
          </h3>
          <span style={{ fontSize: 12, color: "#888" }}>共 {total} 条记录</span>
        </div>
        <div style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ padding: 20 }}>
              <SkeletonGroup lines={6} />
            </div>
          ) : filteredList.length === 0 ? (
            <EmptyState icon="📭" title="暂无充值记录" description="没有符合条件的充值记录" actionText="去充值" onAction={() => window.location.href = "/recharge"} />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>订单号</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>充值金额</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>支付方式</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>状态</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>创建时间</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>完成时间</th>
                  <th style={{ textAlign: "left", padding: "14px 16px", background: "#fafafa", color: "#888", fontWeight: 500, borderBottom: "1px solid #eee" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((r) => {
                  const st = STATUS_LABEL[r.status] ?? { label: r.status_label ?? r.status, status: "default" as const };
                  const methodLabel = r.method_label ?? METHOD_LABEL[r.payment_method] ?? r.payment_method;
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "14px 16px", color: "#333" }}>{r.order_id}</td>
                      <td style={{ padding: "14px 16px", color: "#333" }}>¥{((r.amount ?? 0) / 100).toFixed(2)}</td>
                      <td style={{ padding: "14px 16px", color: "#333" }}>{methodLabel}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <StatusBadge status={st.status}>{st.label}</StatusBadge>
                      </td>
                      <td style={{ padding: "14px 16px", color: "#333" }}>{r.create_time}</td>
                      <td style={{ padding: "14px 16px", color: r.complete_time ? "#333" : "#bbb" }}>
                        {r.complete_time || "—"}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <button
                          onClick={() => setDetailRecord(r)}
                          style={{
                            padding: "4px 12px",
                            borderRadius: 6,
                            border: "1px solid #d9d9d9",
                            background: "#fff",
                            fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          📄 查看详情
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== 分页（原型：上一页/下一页+页码+每页条数+跳转） ===== */}
      {!isLoading && filteredList.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#888", fontSize: 13 }}>每页</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid #d9d9d9", fontSize: 13, background: "#fff", height: 32 }}
            >
              {PAGE_SIZE_OPTIONS.map((ps) => (
                <option key={ps} value={ps}>{ps}</option>
              ))}
            </select>
            <span style={{ color: "#888", fontSize: 13 }}>条</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
              style={{
                height: 32, minWidth: 32, padding: "0 10px", borderRadius: 6, border: "1px solid #d9d9d9",
                background: "#fff", color: page <= 1 ? "#bbb" : "#555", fontSize: 13, cursor: page <= 1 ? "default" : "pointer",
              }}
            >
              上一页
            </button>
            <button
              style={{ height: 32, minWidth: 32, padding: "0 10px", borderRadius: 6, border: "1px solid #4f6ef7", background: "#4f6ef7", color: "#fff", fontSize: 13, cursor: "default" }}
            >
              {page}
            </button>
            <button
              disabled={page * pageSize >= total}
              onClick={() => setPage(page + 1)}
              style={{
                height: 32, minWidth: 32, padding: "0 10px", borderRadius: 6, border: "1px solid #d9d9d9",
                background: "#fff", color: page * pageSize >= total ? "#bbb" : "#555", fontSize: 13,
                cursor: page * pageSize >= total ? "default" : "pointer",
              }}
            >
              下一页
            </button>
            <span style={{ color: "#888", fontSize: 13, margin: "0 8px" }}>
              第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#888", fontSize: 13 }}>跳至</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, Math.ceil(total / pageSize))}
              defaultValue={page}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (v >= 1 && v <= Math.ceil(total / pageSize)) setPage(v);
                }
              }}
              style={{ width: 60, height: 32, padding: "0 8px", borderRadius: 6, border: "1px solid #d9d9d9", fontSize: 13, textAlign: "center" }}
            />
            <span style={{ color: "#888", fontSize: 13 }}>页</span>
            <button
              onClick={() => {
                const inp = document.querySelector(".page-jump-input") as HTMLInputElement;
                if (inp) {
                  const v = Number(inp.value);
                  if (v >= 1 && v <= Math.ceil(total / pageSize)) setPage(v);
                }
              }}
              style={{ height: 32, padding: "0 14px", borderRadius: 6, border: "1px solid #d9d9d9", background: "#fff", color: "#888", fontSize: 12, cursor: "pointer" }}
            >
              GO
            </button>
          </div>
        </div>
      )}

      {/* ===== 订单详情 Modal ===== */}
      <Modal open={!!detailRecord} onClose={() => setDetailRecord(null)} title="订单详情">
        {detailRecord && (
          <DetailContent
            record={detailRecord}
            onClose={() => setDetailRecord(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ============ 订单详情内容 ============ */
function DetailContent({ record: r, onClose }: { record: TopupRecord; onClose: () => void }) {
  const { toast } = useToast();
  const methodLabel = r.method_label ?? METHOD_LABEL[r.payment_method] ?? r.payment_method;
  const st = STATUS_LABEL[r.status] ?? { label: r.status_label ?? r.status, status: "default" as const };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>订单号</span>
          <span style={{ fontSize: 14, color: "#333", fontFamily: "monospace" }}>{r.order_id}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>充值金额</span>
          <span style={{ fontSize: 18, fontWeight: 600, color: "#6a8aff" }}>¥{((r.amount ?? 0) / 100).toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>支付方式</span>
          <span style={{ fontSize: 14, color: "#333" }}>{methodLabel}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>状态</span>
          <span>
            <StatusBadge status={st.status}>{st.label}</StatusBadge>
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>创建时间</span>
          <span style={{ fontSize: 14, color: "#333" }}>{r.create_time}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>完成时间</span>
          <span style={{ fontSize: 14, color: "#333" }}>{r.complete_time || "—"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>交易流水号</span>
          <span style={{ fontSize: 14, color: "#333", fontFamily: "monospace" }}>{r.trade_no || "—"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#888" }}>付款方</span>
          <span style={{ fontSize: 14, color: "#333" }}>{r.payer || "—"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: "1/-1" }}>
          <span style={{ fontSize: 12, color: "#888" }}>备注</span>
          <span style={{ fontSize: 14, color: "#333" }}>{r.remark || "—"}</span>
        </div>
      </div>

      {/* 对公转账凭证 */}
      {(r.payment_method === "bank" || r.payment_method === "bank_transfer") && (
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid #eee" }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#888", marginBottom: 12 }}>
            转账凭证
            <HelpIcon text="对公转账的银行回单扫描件" />
          </div>
          {r.voucher ? (
            <div
              style={{
                width: 120,
                height: 80,
                borderRadius: 6,
                border: "1px solid #d9d9d9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f5f5f5",
                fontSize: 11,
                color: "#888",
                cursor: "pointer",
              }}
              onClick={() => toast.error("凭证预览功能开发中（后端缺失）")}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 24 }}>📄</div>
                <div>{r.voucher}</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#666" }}>无凭证</div>
          )}
        </div>
      )}

      {/* 驳回原因 + 重新提交 */}
      {r.status === "rejected" && r.reject_reason && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 16px",
            background: "#fff1f0",
            border: "1px solid #ffccc7",
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#c62828", marginBottom: 4 }}>驳回原因</div>
          <div style={{ fontSize: 13, color: "#555" }}>{r.reject_reason}</div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
        {r.status === "rejected" && (
          <button
            onClick={() => { onClose(); window.location.href = "/recharge"; }}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #4f6ef7",
              background: "#4f6ef7",
              color: "#fff",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            重新提交
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            padding: "8px 20px",
            borderRadius: 6,
            border: "1px solid #d9d9d9",
            background: "#fff",
            color: "#333",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          关闭
        </button>
      </div>
    </div>
  );
}
