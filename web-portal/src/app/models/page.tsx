// 模型目录 — 服务端组件（SSR）
// T6：按「模型编码」展示。一个（模型 × 供应商）= 一条全局唯一模型编码条目，
// 显示名 = 模型名（供应商名）；编码规则默认「厂商+模型」={supplier_code}-{model_name}。
// 数据源沿用公开 /public/models；该接口当前未下发 model_code，字段缺失时按口径留空、不拼造，
// 待后端在公开接口补充 model_code 后自动展示（契约登记见交付报告）。
import { PageHelp } from "../../components/Help";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface PublicModel {
  name: string;
  display_name: string | null;
  category: string | null;
  context_length: number | null;
  vendor: string;
  cost_input_price: string;
  cost_output_price: string;
  // 编码口径字段：公开接口待后端补充（缺失时为 undefined，不拼造）
  model_code?: string | null;
}

interface PublicModelHealth {
  model: string;
  success_rate: number | null;
  p50_ms: number;
  status: "healthy" | "degraded" | "unavailable" | "no_data";
  min_price: number | null;
}

async function getModels(): Promise<PublicModel[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/models`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return data.list ?? [];
    }
  } catch {
    /* 兜底 */
  }
  return [];
}

/** 拉取最近 24h 的模型健康度（免鉴权，仅暴露健康/价格） */
async function getModelHealth(): Promise<Map<string, PublicModelHealth>> {
  const map = new Map<string, PublicModelHealth>();
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/models/health?window=1h`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      const items: PublicModelHealth[] = body.data?.items ?? [];
      for (const it of items) map.set(it.model, it);
    }
  } catch {
    /* 兜底 */
  }
  return map;
}

const STATUS_META: Record<PublicModelHealth["status"], { text: string; color: string; bg: string }> = {
  healthy: { text: "健康", color: "#15803d", bg: "#dcfce7" },
  degraded: { text: "降级", color: "#b45309", bg: "#fef3c7" },
  unavailable: { text: "异常", color: "#b91c1c", bg: "#fee2e2" },
  no_data: { text: "暂无数据", color: "#64748b", bg: "#f1f5f9" },
};

/** 页面级 [?] 帮助文案（R-MC-05 / PRD 补充 §3） */
const PAGE_HELP =
  "模型目录：每个条目 = 一条模型编码。同一逻辑模型来自不同供应商时会显示为多个条目（显示名 = 模型名（供应商名）），选择/调用不同条目即选择不同供应商。模型编码由平台按规则生成，默认「厂商+模型」={supplier_code}-{model_name}，规则可在后台配置。";

export const metadata = {
  title: "3Cloud 模型目录",
  description: "3Cloud 接入的 AI 模型一览（按模型编码展示）",
  openGraph: {
    title: "3Cloud 模型目录",
    description: "3Cloud 接入的 AI 模型一览（按模型编码展示）",
    type: "website",
  },
};

export default async function ModelsPage() {
  const [models, health] = await Promise.all([getModels(), getModelHealth()]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>
        模型目录
        <PageHelp text={PAGE_HELP} />
      </h1>
      <p style={{ color: "#64748b", marginBottom: 8 }}>共 {models.length} 个模型编码条目</p>
      <p style={{ color: "#94a3b8", marginBottom: 32, fontSize: 14 }}>
        每个条目对应一条全局唯一模型编码；同一模型多供应商时并排为多条编码。编码默认按「厂商+模型」规则生成（如 <code>供应商code-模型名</code>）。
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16 }}>
        {models.map((m, idx) => {
          const h = health.get(m.name);
          const meta = h ? STATUS_META[h.status] : null;
          // 显示名 = 模型名（供应商名）；编码字段待后端补充，缺失时不拼造
          const title = `${m.name}（${m.vendor}）`;
          return (
            <div key={`${m.name}-${m.vendor}-${idx}`} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
                {meta && (
                  <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, background: meta.bg, padding: "2px 10px", borderRadius: 999 }}>
                    {meta.text}
                  </span>
                )}
              </div>
              {m.model_code ? (
                <code style={{ fontSize: 13, color: "#2563eb" }}>{m.model_code}</code>
              ) : (
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>模型编码待下发（按「厂商+模型」规则生成）</div>
              )}
              <div style={{ marginTop: 12, fontSize: 13, color: "#64748b" }}>
                逻辑模型: {m.name}
                <br />
                供应商: {m.vendor}
                <br />
                上下文: {m.context_length ? `${m.context_length} tokens` : "-"}
                <br />
                分类: {m.category ?? "-"}
                <br />
                {h && h.min_price != null ? (
                  <>
                    P50 延迟: {h.p50_ms > 0 ? `${h.p50_ms}ms` : "-"}
                    <br />
                    <span style={{ color: "#15803d", fontWeight: 600 }}>最低价: ¥{h.min_price} / 1M tokens</span>
                  </>
                ) : (
                  <>价格: ¥{m.cost_input_price} / ¥{m.cost_output_price}</>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {models.length === 0 && <p style={{ color: "#94a3b8" }}>暂无模型数据（请确认后端与 seed 状态）</p>}
    </div>
  );
}
