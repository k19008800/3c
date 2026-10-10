// 开发者文档 — 快速开始 / 认证方式 / 兼容协议 / 常用端点 / 错误码
// 品牌：3Cloud。base_url 优先读取后台「系统设置 → API 服务」配置，失败时回退默认域名。
// [?] 页面级帮助：对齐 docs/PRODUCT-DESIGN-PRINCIPLES.md P1
import type { Metadata } from "next";
import { PageHelp } from "../../components/Help";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

interface ApiConfig {
  apiDomain: string;
  openaiBaseUrl: string;
  anthropicBaseUrl: string;
  openaiChatUrl: string;
  anthropicMessagesUrl: string;
}

/** 对外 API 接入地址（后台 系统设置 → API 服务 可配置 api_domain） */
async function fetchApiConfig(): Promise<ApiConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/public/api-config`, { cache: "no-store" });
    if (res.ok) {
      const body = await res.json();
      if (body?.data) return body.data;
    }
  } catch {
    // Keep the docs renderable when the optional public configuration is unavailable.
  }
  return {
    apiDomain: "api.unmisa.com",
    openaiBaseUrl: "https://api.unmisa.com/v1",
    anthropicBaseUrl: "https://api.unmisa.com/anthropic",
    openaiChatUrl: "https://api.unmisa.com/v1/chat/completions",
    anthropicMessagesUrl: "https://api.unmisa.com/anthropic/v1/messages",
  };
}

/** 页面级 [?] 帮助文案 */
const PAGE_HELP =
  "开发者文档：面向接入 3Cloud 的开发者。本文说明如何获取 API Key、配置 base_url、发出第一个请求，以及平台兼容的协议、常用端点与错误码处理。排查调用问题时先对照错误码表，再到控制台查看实时调用日志；上游故障时平台会自动故障转移，无需手动切换 Key。";

export const metadata: Metadata = {
  title: "开发者文档",
  description:
    "3Cloud 开发者文档：快速开始、Bearer Token 认证、OpenAI / Anthropic 兼容协议、常用端点与错误码说明",
  openGraph: {
    title: "开发者文档 — 3Cloud",
    description: "一套 API Key 接入全部主流 AI 模型",
    type: "website",
  },
};

const QUICKSTART_STEPS = [
  { step: "01", title: "获取 API Key", desc: "登录3Cloud控制台，在「API 密钥」页面创建新密钥并妥善保管。" },
  { step: "02", title: "配置 base_url", desc: "将 SDK 的 base_url 指向平台网关地址（见下方示例），无需逐一对接各家供应商。" },
  { step: "03", title: "发送第一个请求", desc: "使用 OpenAI 兼容协议发起一次对话补全，即可得到模型返回结果。" },
];

const ENDPOINTS = [
  { method: "GET", path: "/v1/models", desc: "列出当前 API Key 可调用的全部模型及其上下文长度" },
  { method: "POST", path: "/v1/chat/completions", desc: "对话补全（OpenAI 兼容，支持 stream=true 流式输出）" },
  { method: "POST", path: "/v1/completions", desc: "文本补全（OpenAI 兼容）" },
  { method: "POST", path: "/v1/embeddings", desc: "文本向量嵌入" },
  { method: "POST", path: "/v1/images/generations", desc: "图像生成（OpenAI 兼容）" },
  { method: "POST", path: "/anthropic/v1/messages", desc: "Anthropic Messages 兼容接口（支持 tool_use / 流式）" },
];

const ERROR_CODES = [
  { status: "401", meaning: "未认证：缺少 Authorization 头或 API Key 无效", action: "确认请求头为 `Authorization: Bearer <你的Key>`" },
  { status: "403", meaning: "无权限：模型未授权 / Key 被禁用 / 账户预算熔断", action: "在控制台检查 Key 的模型黑白名单与账户余额" },
  { status: "404", meaning: "模型不存在或当前 Key 未开通该模型", action: "核对模型编码拼写，或在控制台开通对应模型" },
  { status: "429", meaning: "限流：RPM/TPM 或日 Token 上限触发", action: "降低并发与频率，或申请提升配额；检查 Key 限额" },
  { status: "500", meaning: "上游模型服务内部错误", action: "平台会自动故障转移；持续失败请联系客服" },
  { status: "502 / 503 / 504", meaning: "上游通道异常或网关超时", action: "稍后自动重试即可，平台已切换备用通道" },
];

const METHOD_COLORS: Record<string, string> = {
  GET: "var(--color-success-text)",
  POST: "var(--color-primary)",
};

export default async function DocsPage() {
  const api = await fetchApiConfig();

  return (
    <div>
      {/* ===== 页头 ===== */}
      <section className="page-head">
        <div className="container">
          <span className="overline">Developers</span>
          <h1>
            开发者文档
            <PageHelp text={PAGE_HELP} />
          </h1>
          <p className="page-subtitle">一套 API Key，接入全部主流 AI 模型</p>
          <p className="page-note">
            平台同时兼容 OpenAI 与 Anthropic 两套协议，现有 SDK 仅需修改 <code>base_url</code> 与 <code>api_key</code> 即可迁移。
          </p>
        </div>
      </section>

      {/* ===== 快速开始 ===== */}
      <section className="section container">
        <div className="section-head">
          <span className="overline">Quickstart</span>
          <h2 className="section-title">快速开始</h2>
          <p className="section-subtitle">三步完成接入，平均耗时 5 分钟</p>
        </div>
        <div className="steps-grid">
          {QUICKSTART_STEPS.map((s) => (
            <div key={s.step} className="step-card">
              <div className="step-num">{s.step}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 第一个请求（暗色代码窗） ===== */}
      <section className="band-dark section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">第一个请求</h2>
            <p className="section-subtitle">cURL · OpenAI 兼容协议</p>
          </div>
          <div className="code-window">
            <div><span className="tok-cmt">$</span> <span className="tok-cmd">curl</span> {api.openaiChatUrl} \</div>
            <div>&nbsp;&nbsp;-H <span className="tok-str">"Authorization: Bearer YOUR_API_KEY"</span> \</div>
            <div>&nbsp;&nbsp;-H <span className="tok-str">"Content-Type: application/json"</span> \</div>
            <div>&nbsp;&nbsp;-d <span className="tok-str">'{`{"model":"deepseek-chat","messages":[{"role":"user","content":"你好"}]}`}'</span></div>
          </div>
        </div>
      </section>

      {/* ===== 认证方式 ===== */}
      <section className="section container">
        <div className="section-head">
          <span className="overline">Authentication</span>
          <h2 className="section-title">认证方式</h2>
          <p className="section-subtitle">所有请求均通过 HTTP Header 传递 API Key</p>
        </div>
        <div className="prose">
          <p>
            每个请求必须在 Header 中携带 <code>Authorization</code> 字段，格式为
            <code>Bearer &lt;YOUR_API_KEY&gt;</code>。平台校验通过后，按 Key 绑定的权限与预算路由到对应上游模型。
          </p>
          <ul>
            <li>API Key 在控制台「API 密钥」页创建，仅在创建时完整展示一次，请妥善保管。</li>
            <li>泄露后请立即在控制台禁用并重建；可对 Key 设置模型黑白名单、IP 白名单、日 Token 上限与 RPM/TPM 限流。</li>
            <li>请勿将 Key 写入前端公开代码或客户端仓库，建议仅在服务端调用。</li>
          </ul>
        </div>
      </section>

      {/* ===== 兼容协议 ===== */}
      <section className="band-gray section">
        <div className="container">
          <div className="section-head">
            <span className="overline">Protocols</span>
            <h2 className="section-title">支持的协议</h2>
            <p className="section-subtitle">兼容两大主流 SDK，零改造迁移</p>
          </div>
          <div className="feature-grid">
            <div className="feature-card">
              <h3>OpenAI 兼容</h3>
              <p style={{ marginBottom: 8 }}>使用官方 openai-python / openai-node SDK，仅替换 base_url。</p>
              <div className="mc-code" style={{ fontFamily: "var(--font-family-mono)", color: "var(--color-primary)", fontSize: 13 }}>
                base_url = {api.openaiBaseUrl}
              </div>
            </div>
            <div className="feature-card">
              <h3>Anthropic 兼容</h3>
              <p style={{ marginBottom: 8 }}>使用 anthropic SDK，支持 tool_use 与流式输出。</p>
              <div className="mc-code" style={{ fontFamily: "var(--font-family-mono)", color: "var(--color-primary)", fontSize: 13 }}>
                base_url = {api.anthropicBaseUrl}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 常用端点 ===== */}
      <section className="section container">
        <div className="section-head">
          <span className="overline">Endpoints</span>
          <h2 className="section-title">常用端点</h2>
          <p className="section-subtitle">均挂载在网关上，统一鉴权与计费</p>
        </div>
        <div className="table-scroll">
          <table className="price-table" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>方法</th>
                <th>路径</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.path}>
                  <td>
                    <span
                      style={{
                        fontFamily: "var(--font-family-mono)",
                        fontWeight: 700,
                        fontSize: 12,
                        color: METHOD_COLORS[e.method] ?? "var(--color-text-secondary)",
                      }}
                    >
                      {e.method}
                    </span>
                  </td>
                  <td style={{ fontFamily: "var(--font-family-mono)", color: "var(--color-primary)", fontSize: 13 }}>
                    {e.path}
                  </td>
                  <td style={{ color: "var(--color-text-secondary)" }}>{e.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== 错误码 ===== */}
      <section className="band-gray section">
        <div className="container">
          <div className="section-head">
            <span className="overline">Errors</span>
            <h2 className="section-title">错误码说明</h2>
            <p className="section-subtitle">按 HTTP 状态码快速定位问题</p>
          </div>
          <div className="table-scroll">
            <table className="price-table" style={{ minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>状态码</th>
                  <th>含义</th>
                  <th>处理建议</th>
                </tr>
              </thead>
              <tbody>
                {ERROR_CODES.map((e) => (
                  <tr key={e.status}>
                    <td style={{ fontFamily: "var(--font-family-mono)", fontWeight: 700, color: "var(--color-primary)" }}>
                      {e.status}
                    </td>
                    <td style={{ color: "var(--color-text)" }}>{e.meaning}</td>
                    <td style={{ color: "var(--color-text-secondary)" }}>{e.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="cta-band">
        <h2>准备好开始了吗？</h2>
        <p>创建 API Key，立即调用第一个模型</p>
        <a href="/app/login" className="btn btn-primary btn-lg">进入控制台</a>
      </section>
    </div>
  );
}
