import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { HelpIcon, SkeletonGroup } from "@3cloud/shared-ui";

const card = { background: "var(--color-panel)", padding: 20, borderRadius: 10, boxShadow: "0 1px 4px rgba(0,0,0,.06)" };

export default function AdminConversionFunnelPage() {
  const [period, setPeriod] = useState("month");

  const funnelQ = useQuery({
    queryKey: ["admin-conversion-funnel", period],
    queryFn: async () => (await api.get(`/admin/conversion/funnel?period=${period}`)).data.data,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>转化漏斗</h2>
        <HelpIcon text="conversion_funnel" />
      </div>

      <div style={{ ...card, marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        {["week", "month", "quarter", "year"].map(p => (
          <button key={p} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--color-border)",
            background: period === p ? "#4f6ef7" : "#fff", color: period === p ? "#fff" : "#333", cursor: "pointer", fontSize: 13 }}
            onClick={() => setPeriod(p)}>
            {{ week: "本周", month: "本月", quarter: "本季", year: "本年" }[p]}
          </button>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>📊 转化漏斗 <HelpIcon text="conversion_funnel" /></div>
        {funnelQ.isLoading ? <SkeletonGroup lines={5} /> : (
          <div>
            {(funnelQ.data?.stages ?? [
              { name: "网站访问", value: 12000, color: "#4f6ef7" },
              { name: "注册账号", value: 4800, color: "#7c3aed" },
              { name: "完成实名", value: 2100, color: "#f59e0b" },
              { name: "首次充值", value: 860, color: "#22c55e" },
              { name: "首次调用 API", value: 520, color: "#e53935" },
            ]).map((s: any, i: number) => {
              const max = funnelQ.data?.stages?.[0]?.value ?? 12000;
              const pct = max ? Math.round(s.value / max * 100) : 0;
              const prev = i > 0 ? (funnelQ.data?.stages ?? [])[i - 1]?.value : s.value;
              const rate = prev ? Math.round(s.value / prev * 100) : 100;
              return (
                <div key={s.name} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                    <span>{s.name}</span>
                    <span style={{ color: "#888" }}>{s.value.toLocaleString()} <span style={{ fontSize: 11 }}>({rate}%)</span></span>
                  </div>
                  <div style={{ height: 32, background: "#f0f0f0", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: s.color, borderRadius: 6,
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600 }}>
                      {pct}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginTop: 20 }}>
        {[{ icon: "📊", label: "访问到注册", value: funnelQ.data?.rates?.visit_to_register != null ? `${funnelQ.data.rates.visit_to_register}%` : "—" },
          { icon: "💳", label: "注册到充值", value: funnelQ.data?.rates?.register_to_topup != null ? `${funnelQ.data.rates.register_to_topup}%` : "—" },
          { icon: "🚀", label: "充值到调用", value: funnelQ.data?.rates?.topup_to_api != null ? `${funnelQ.data.rates.topup_to_api}%` : "—" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ fontSize: 24 }}>{s.icon}</div>
            <div style={{ fontSize: 12, color: "#888", margin: "6px 0" }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
