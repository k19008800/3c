"use client";

// 渠道自助门户仪表盘 — /vendor/dashboard（本月消耗 / 待结算 / 公告 / 申请结算）
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHelp, ButtonHelp } from "../../../components/Help";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface Dash {
  supplier_name: string;
  period: string;
  this_month_consumption: number;
  pending_settlement: number;
  settled_total: number;
  model_count: number;
  min_settlement_amount: number;
  has_open_settlement_request: boolean;
}

interface Notice {
  id: number;
  title: string;
  content: string;
  category: string;
  priority: string;
  is_pinned: boolean;
}

function yuan(v: number) {
  return `¥${Number(v || 0).toFixed(2)}`;
}

export default function VendorDashboardPage() {
  const router = useRouter();
  const [dash, setDash] = useState<Dash | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("vendor_token");
    if (!token) {
      router.replace("/vendor/login");
      return;
    }
    (async () => {
      const headers = { authorization: `Bearer ${token}` };
      const [dRes, nRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/vendor/dashboard`, { headers }),
        fetch(`${API_BASE}/api/v1/vendor/notifications?page=1&pageSize=10`, { headers }),
      ]);
      if (dRes.status === 401) {
        localStorage.removeItem("vendor_token");
        router.replace("/vendor/login");
        return;
      }
      const dBody = await dRes.json();
      setDash(dBody.data);
      if (nRes.ok) setNotices((await nRes.json()).data.items);
      setLoading(false);
    })();
  }, [router]);

  async function requestSettlement() {
    setMsg("");
    const token = localStorage.getItem("vendor_token");
    const res = await fetch(`${API_BASE}/api/v1/vendor/settlements/request`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await res.json();
    if (!res.ok) {
      setMsg(body.message ?? "申请失败");
      return;
    }
    setMsg(body.message ?? "结算申请已提交");
    // 刷新仪表盘状态
    const dRes = await fetch(`${API_BASE}/api/v1/vendor/dashboard`, { headers: { authorization: `Bearer ${token}` } });
    setDash((await dRes.json()).data);
  }

  function logout() {
    localStorage.removeItem("vendor_token");
    localStorage.removeItem("vendor_info");
    router.push("/vendor/login");
  }

  if (loading) return <section className="section container">加载中…</section>;

  const cards: Array<{ label: string; value: string; help: string }> = [
    { label: "本月消耗", value: yuan(dash?.this_month_consumption ?? 0), help: "本自然月内，平台按消费记录聚合的本渠道应付金额。" },
    { label: "待结算金额", value: yuan(dash?.pending_settlement ?? 0), help: "已生成结算单但尚未打款的累计金额。" },
    { label: "已结算总额", value: yuan(dash?.settled_total ?? 0), help: "历史已完成打款（paid）的累计金额。" },
    { label: "接入模型数", value: String(dash?.model_count ?? 0), help: "本渠道当前接入并可用的模型数量。" },
  ];

  return (
    <section className="section container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ display: "inline-flex", alignItems: "center" }}>
          渠道仪表盘
          <PageHelp text="渠道自助门户首页。\n\n· 本月消耗：本自然月按消费聚合的应付金额\n· 待结算：已生成结算单但尚未打款的累计金额\n· 申请结算：当待结算金额达到最低额（默认 ¥500）且无进行中申请时，可主动发起自助结算，等待平台审核打款\n· 公告：平台推送的系统维护 / 结算通知 / 新模型上线等" />
        </h1>
        <button onClick={logout} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "none", cursor: "pointer" }}>
          退出登录
        </button>
      </div>
      <p style={{ color: "var(--color-text-muted)" }}>
        {dash?.supplier_name} · 当前账期 {dash?.period}
      </p>

      <div className="feature-grid" style={{ marginTop: 24 }}>
        {cards.map((c) => (
          <div key={c.label} className="feature-card">
            <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
              {c.label}
              <ButtonHelp text={c.help} />
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 28, display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={requestSettlement}
          disabled={dash?.has_open_settlement_request}
          style={{ padding: "10px 18px", borderRadius: 8, border: "none", background: "var(--color-primary, #4f6ef7)", color: "#fff", cursor: dash?.has_open_settlement_request ? "not-allowed" : "pointer", opacity: dash?.has_open_settlement_request ? 0.6 : 1 }}
        >
          {dash?.has_open_settlement_request ? "结算申请审核中" : "申请自助结算"}
        </button>
        <ButtonHelp text={`对待结算金额发起自助结算申请，平台审核后打款。最低申请额 ¥${dash?.min_settlement_amount ?? 500}。`} />
        <Link href="/vendor/settlements" style={{ marginLeft: 8 }}>查看历史结算 →</Link>
        {msg && <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{msg}</span>}
      </div>

      <h2 style={{ marginTop: 36, fontSize: 18 }}>平台公告</h2>
      {notices.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>暂无公告</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {notices.map((n) => (
            <div key={n.id} className="feature-card" style={{ borderLeft: n.is_pinned ? "3px solid var(--color-primary, #4f6ef7)" : "none" }}>
              <strong>{n.title}</strong>
              <p style={{ color: "var(--color-text-muted)", margin: "6px 0 0", fontSize: 14 }}>{n.content}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
