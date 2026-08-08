import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, extractError } from "../lib/api";
import { HelpIcon, StatusBadge, useToast } from "@3cloud/shared-ui";

interface RnStatus {
  status: string;
  status_label: string;
  real_name: string | null;
  id_number: string | null;
  type: string | null;
  type_label: string | null;
  reject_reason: string | null;
}

const card = { background: "#fff", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };
const btnBase: React.CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
};
const inp: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 10,
  fontFamily: "inherit",
};

export default function RealNamePage() {
  const qc = useQueryClient();
  const [type, setType] = useState("individual");
  const [form, setForm] = useState({
    real_name: "",
    id_number: "",
    phone: "",
    legal_person: "",
    company_address: "",
  });
  const { toast } = useToast();

  const statusQ = useQuery({
    queryKey: ["me-real-name"],
    queryFn: async () => (await api.get<{ data: RnStatus }>("/me/real-name")).data.data,
  });
  const submitMut = useMutation({
    mutationFn: async () => (await api.post("/me/real-name", { type, ...form })).data,
    onSuccess: (d: { data?: { message?: string } }) => {
      toast.success(d?.data?.message ?? "已提交");
      setForm({ real_name: "", id_number: "", phone: "", legal_person: "", company_address: "" });
      qc.invalidateQueries({ queryKey: ["me-real-name"] });
    },
    onError: (e) => toast.error(extractError(e)),
  });

  const st = statusQ.data;
  const canApply = !st || st.status === "unverified" || st.status === "rejected";

  const getStatusBadge = () => {
    if (!st) return <StatusBadge status="default">未认证</StatusBadge>;
    switch (st.status) {
      case "approved":
        return <StatusBadge status="success">{st.status_label}</StatusBadge>;
      case "pending_review":
        return <StatusBadge status="warning">{st.status_label}</StatusBadge>;
      case "rejected":
        return <StatusBadge status="danger">{st.status_label}</StatusBadge>;
      default:
        return <StatusBadge status="default">{st.status_label ?? "未认证"}</StatusBadge>;
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ marginBottom: 20 }}>
        实名认证
        <HelpIcon text="完成实名认证以解锁更多功能。支持个人认证和企业认证两种方式，提交后由管理员审核。" level="page" />
      </h2>

      {/* 当前状态 */}
      <div style={{ ...card, marginBottom: 24 }}>
        <h3 style={{ marginBottom: 12 }}>认证状态</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {getStatusBadge()}
          {st?.real_name && (
            <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>
              {st.type_label} · {st.real_name} · {st.id_number}
            </span>
          )}
        </div>
        {st?.status === "rejected" && st.reject_reason && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--color-danger-bg)",
              color: "var(--color-danger-text)",
              fontSize: 13,
            }}
          >
            驳回原因：{st.reject_reason}
          </div>
        )}
        {st?.status === "pending_review" && (
          <div style={{ marginTop: 12, color: "var(--color-warning-text)", fontSize: 13 }}>
            正在审核中，请耐心等待
          </div>
        )}
      </div>

      {/* 申请表单 */}
      {canApply && (
        <div style={card}>
          <h3 style={{ marginBottom: 12 }}>{st?.status === "rejected" ? "重新提交" : "提交认证"}</h3>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button
              onClick={() => setType("individual")}
              style={{
                ...btnBase,
                flex: 1,
                background: type === "individual" ? "var(--color-primary)" : "#fff",
                color: type === "individual" ? "#fff" : "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
            >
              个人认证
            </button>
            <button
              onClick={() => setType("enterprise")}
              style={{
                ...btnBase,
                flex: 1,
                background: type === "enterprise" ? "var(--color-primary)" : "#fff",
                color: type === "enterprise" ? "#fff" : "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
            >
              企业认证
            </button>
          </div>
          <input
            value={form.real_name}
            onChange={(e) => setForm({ ...form, real_name: e.target.value })}
            placeholder={type === "individual" ? "真实姓名 *" : "企业名称 *"}
            style={inp}
          />
          <input
            value={form.id_number}
            onChange={(e) => setForm({ ...form, id_number: e.target.value })}
            placeholder={type === "individual" ? "身份证号 *" : "统一社会信用代码 *"}
            style={inp}
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="联系电话"
            style={inp}
          />
          {type === "enterprise" && (
            <>
              <input
                value={form.legal_person}
                onChange={(e) => setForm({ ...form, legal_person: e.target.value })}
                placeholder="法人代表"
                style={inp}
              />
              <input
                value={form.company_address}
                onChange={(e) => setForm({ ...form, company_address: e.target.value })}
                placeholder="注册地址"
                style={inp}
              />
            </>
          )}
          <button
            onClick={() => submitMut.mutate()}
            disabled={submitMut.isPending || !form.real_name || !form.id_number}
            style={{
              ...btnBase,
              background: "var(--color-success-text)",
              color: "#fff",
              opacity: submitMut.isPending || !form.real_name || !form.id_number ? 0.6 : 1,
            }}
          >
            {submitMut.isPending ? "提交中..." : "提交认证"}
          </button>
        </div>
      )}
    </div>
  );
}
