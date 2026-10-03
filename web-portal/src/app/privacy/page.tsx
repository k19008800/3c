// 隐私政策 — 合规必备页面（占位结构文案，后续由法务填充最终版本）
// 品牌：浩寅云。[?] 页面级帮助：对齐 docs/PRODUCT-DESIGN-PRINCIPLES.md P1
import type { Metadata } from "next";
import { PageHelp } from "../../components/Help";

/** 页面级 [?] 帮助文案 */
const PAGE_HELP =
  "隐私政策：说明 浩寅云 如何收集、使用、存储与删除用户信息，以及 Cookie 的使用规则。本页为平台合规文件，涉及账户数据、账单信息与调用日志的处理方式。如对隐私处理有疑问，可通过页脚或文末邮箱联系我们。";

export const metadata: Metadata = {
  title: "隐私政策",
  description: "浩寅云 隐私政策：我们如何收集、使用、存储与删除您的信息",
  openGraph: {
    title: "隐私政策 — 浩寅云",
    description: "了解 浩寅云 如何保护您的隐私与数据安全",
    type: "website",
  },
};

const UPDATED_AT = "2026 年 10 月";

export default function PrivacyPage() {
  return (
    <div>
      <section className="page-head">
        <div className="container">
          <span className="overline">Privacy</span>
          <h1>
            隐私政策
            <PageHelp text={PAGE_HELP} />
          </h1>
          <p className="page-subtitle">我们如何收集、使用与保护您的信息</p>
          <p className="page-note">最近更新：{UPDATED_AT}。本页面为合规占位版本，最终条款以法务审核发布为准。</p>
        </div>
      </section>

      <section className="section" style={{ paddingBottom: "var(--space-8xl)" }}>
        <div className="prose">
          <h3>一、我们收集的信息</h3>
          <p>为向您提供 AI API 聚合服务，我们可能收集以下信息：</p>
          <ul>
            <li><strong>账户信息：</strong>注册时提供的邮箱、手机号、登录凭证。</li>
            <li><strong>计费信息：</strong>充值记录、消费流水、发票抬头等与交易相关的信息。</li>
            <li><strong>调用信息：</strong>API Key 的调用日志、请求模型、Token 用量、来源 IP 等，用于计费、限流与故障排查。</li>
            <li><strong>设备与日志信息：</strong>访问时间、浏览器类型、页面浏览记录等必要的安全审计数据。</li>
          </ul>

          <h3>二、我们如何使用信息</h3>
          <ul>
            <li>提供、维护与改进 AI API 网关、路由与计费服务。</li>
            <li>进行身份认证、风控安全校验与反滥用检测。</li>
            <li>出具账单、开具发票并完成客户支持。</li>
            <li>在获得您单独同意的前提下，发送产品通知与服务公告。</li>
          </ul>

          <h3>三、信息的存储与安全</h3>
          <p>
            您的信息存储于受访问控制的服务器中。我们采用传输加密、权限隔离、审计日志等措施保护数据安全，
            并仅在为实现服务目的所必需的期限内保留您的信息。未经您同意，我们不会向第三方出售您的个人信息。
          </p>

          <h3>四、信息的删除</h3>
          <p>
            您可申请注销账户并删除个人信息。账户注销后，除法律法规要求保留的交易与审计记录外，
            我们将在合理期限内删除或匿名化处理您的个人信息。
          </p>

          <h3>五、Cookie 与本地存储</h3>
          <p>
            我们使用 Cookie 与浏览器本地存储维持登录状态、记录语言偏好与必要的安全校验。
            您可通过浏览器设置清除或拒绝 Cookie，但这可能影响部分功能的正常使用。
          </p>

          <h3>六、政策更新与联系我们</h3>
          <p>
            我们可能适时更新本政策，更新后将在本页面公示。如您对本政策或个人信息处理有任何疑问、意见或投诉，
            请通过以下方式联系我们：
          </p>
          <ul>
            <li>联系邮箱：support@unmisa.com（占位，以后台系统设置为准）</li>
            <li>或通过控制台「在线客服 / 工单」提交咨询。</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
