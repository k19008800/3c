// 定价页 — 使用公开标价 API（成本 × 加价率 = 对外标价）
// P2-3：核心文案 i18n（cookie/?lang 切换，en 回退），generateMetadata + [?] 页面帮助
import type { Metadata } from "next";
import PriceCalculator from "./PriceCalculator";
import { fetchDictionary, makeT, resolveLang, siteAlternates } from "../../lib/i18n";
import { getCookieLang } from "../../lib/i18n-server";
import { PageHelp } from "../../components/Help";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface PriceItem {
  name: string;
  display_name: string;
  category: string;
  context_length: number;
  description: string | null;
  vendor: string;
  input_price: number;
  output_price: number;
}

async function fetchPricing(): Promise<{ list: PriceItem[] }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/pricing`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      // 后端返回 { pricing: [{ modelName, supplierName, inputPrice(str), outputPrice(str), ... }] }
      // 映射到页面使用的字段名（与首页 page.tsx 的 fetchPricing 同源）
      return {
        list: (data.pricing ?? []).map((m: any) => ({
          name: m.modelName ?? "",
          display_name: m.modelName ?? "",
          category: "对话",
          context_length: 0,
          description: null,
          vendor: m.supplierName ?? "",
          input_price: parseFloat(m.inputPrice) || 0,
          output_price: parseFloat(m.outputPrice) || 0,
        })),
      };
    }
  } catch {}
  return { list: [] };
}

function formatPrice(p: number): string {
  if (p === 0) return "免费";
  if (p < 0.01) return `¥${p.toFixed(4)}`;
  if (p < 1) return `¥${p.toFixed(3)}`;
  return `¥${p.toFixed(2)}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  chat: "对话", embedding: "嵌入", image: "图像", audio: "音频", video: "视频", rerank: "重排",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);
  return {
    title: t("pricing.title"),
    description: t("pricing.subtitle"),
    openGraph: {
      title: t("pricing.title"),
      description: t("pricing.subtitle"),
      type: "website",
    },
    alternates: siteAlternates("/pricing"),
  };
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const sp = await searchParams;
  const lang = resolveLang(sp?.lang, await getCookieLang());
  const dict = await fetchDictionary(lang);
  const t = makeT(dict);

  const { list: models } = await fetchPricing();

  // 按分类分组
  const categories = Array.from(new Set(models.map((m) => m.category ?? "chat"))).sort();

  const calculatorLabels = {
    title: t("pricing.calc.title"),
    model: t("pricing.calc.model"),
    selectPlaceholder: t("pricing.calc.selectPlaceholder"),
    inputTokens: t("pricing.calc.inputTokens"),
    outputTokens: t("pricing.calc.outputTokens"),
    selectPrompt: t("pricing.calc.selectPrompt"),
    estimate: t("pricing.calc.estimate"),
  };

  const faqs = [
    { q: t("pricing.faq.q1"), a: t("pricing.faq.a1") },
    { q: t("pricing.faq.q2"), a: t("pricing.faq.a2") },
    { q: t("pricing.faq.q3"), a: t("pricing.faq.a3") },
    { q: t("pricing.faq.q4"), a: t("pricing.faq.a4") },
    { q: t("pricing.faq.q5"), a: t("pricing.faq.a5") },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        {t("pricing.title")}
        <PageHelp text={t("help.pricing")} />
      </h1>
      <p style={{ color: "#64748b", marginBottom: 8, fontSize: 15 }}>
        {t("pricing.subtitle")}
      </p>

      <PriceCalculator models={models} labels={calculatorLabels} />

      <h2 style={{ fontSize: 24, fontWeight: 700, margin: "48px 0 16px" }}>{t("pricing.allModels")}</h2>

      {/* 分类筛选 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        <span style={{ background: "#2563eb", color: "#fff", borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 600 }}>
          {t("pricing.allLabel")} ({models.length})
        </span>
        {categories.map((cat) => (
          <span key={cat} style={{ background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "6px 16px", fontSize: 13 }}>
            {CATEGORY_LABELS[cat] ?? cat}
          </span>
        ))}
      </div>

      <div style={{ overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: "#fff", fontSize: 14, minWidth: 700 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "2px solid #e2e8f0" }}>
              <th style={{ padding: "12px 16px" }}>{t("pricing.table.model")}</th>
              <th style={{ padding: "12px 16px" }}>{t("pricing.table.vendor")}</th>
              <th style={{ padding: "12px 16px" }}>{t("pricing.table.category")}</th>
              <th style={{ padding: "12px 16px" }}>{t("pricing.table.input")}</th>
              <th style={{ padding: "12px 16px" }}>{t("pricing.table.output")}</th>
              <th style={{ padding: "12px 16px" }}>{t("pricing.table.context")}</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={`${m.name}-${m.vendor}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "10px 16px" }}>
                  <strong>{m.display_name || m.name}</strong>
                  <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>{m.name}</div>
                </td>
                <td style={{ padding: "10px 16px", color: "#475569" }}>{m.vendor}</td>
                <td style={{ padding: "10px 16px" }}>
                  <span style={{ fontSize: 12, background: "#eff6ff", color: "#2563eb", borderRadius: 4, padding: "2px 8px" }}>
                    {CATEGORY_LABELS[m.category] ?? m.category}
                  </span>
                </td>
                <td style={{ padding: "10px 16px", fontWeight: 600, color: m.input_price === 0 ? "#16a34a" : "#2563eb" }}>
                  {formatPrice(m.input_price)}
                </td>
                <td style={{ padding: "10px 16px", fontWeight: 600, color: m.output_price === 0 ? "#16a34a" : "#2563eb" }}>
                  {formatPrice(m.output_price)}
                </td>
                <td style={{ padding: "10px 16px", color: "#94a3b8" }}>
                  {m.context_length > 0 ? m.context_length.toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {models.length === 0 && (
        <p style={{ color: "#94a3b8", marginTop: 16, textAlign: "center", padding: 40 }}>
          {t("pricing.empty")}
        </p>
      )}

      {/* FAQ */}
      <div style={{ marginTop: 60 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{t("pricing.faq.title")}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {faqs.map((faq) => (
            <details key={faq.q} style={{ background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
              <summary style={{ fontWeight: 600, fontSize: 15, cursor: "pointer", listStyle: "none" }}>Q: {faq.q}</summary>
              <p style={{ marginTop: 10, color: "#475569", fontSize: 14, lineHeight: 1.8, paddingLeft: 8, borderLeft: "3px solid #2563eb" }}>{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
