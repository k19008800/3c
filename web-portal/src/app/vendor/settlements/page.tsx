"use client";

// 渠道自助门户结算列表 — /vendor/settlements（历史结算单 + 状态）
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHelp } from "../../../components/Help";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface SettlementRow {
  id: number;
  period: string;
  total_amount: number;
  item_count: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "待确认",
  generated: "待确认",
  confirmed: "已确认",
  disputed: "争议中",
  paid: "已打款",
};

function yuan(v: number) {
  return `¥${Number(v || 0).toFixed(2)}`;
}

export default function VendorSettlementsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("vendor_token");
    if (!token) {
      router.replace("/vendor/login");
      return;
    }
    (async () => {
      const res = await fetch(`${API_BASE}/api/v1/vendor/settlements?page=1&pageSize=50`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("vendor_token");
        router.replace("/vendor/login");
        return;
      }
      setRows((await res.json()).data.items);
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <section className="section container">加载中…</section>;

  return (
    <section className="section container">
      <h1 style={{ display: "inline-flex", alignItems: "center" }}>
        历史结算
        <PageHelp text="本渠道的全部历史结算单。\n\n· 待确认：已生成结算单，等待核对\n· 已确认：渠道/平台已确认，等待打款\n· 争议中：对金额存在异议，进入人工核对\n· 已打款：完成付款\n\n如需对金额发起结算，请返回仪表盘点击「申请自助结算」。" />
      </h1>
      <p style={{ color: "var(--color-text-muted)", marginBottom: 20 }}>
        <Link href="/vendor/dashboard">← 返回仪表盘</Link>
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>暂无结算记录</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: "10px 8px" }}>账期</th>
                <th style={{ padding: "10px 8px" }}>金额</th>
                <th style={{ padding: "10px 8px" }}>明细数</th>
                <th style={{ padding: "10px 8px" }}>状态</th>
                <th style={{ padding: "10px 8px" }}>打款时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--color-divider)" }}>
                  <td style={{ padding: "10px 8px" }}>{r.period}</td>
                  <td style={{ padding: "10px 8px" }}>{yuan(r.total_amount)}</td>
                  <td style={{ padding: "10px 8px" }}>{r.item_count}</td>
                  <td style={{ padding: "10px 8px" }}>{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td style={{ padding: "10px 8px" }}>{r.paid_at ? new Date(r.paid_at).toLocaleDateString("zh-CN") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
