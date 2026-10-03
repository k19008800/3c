// 服务条款 — 合规必备页面（占位结构文案，后续由法务填充最终版本）
// 品牌：浩寅云。[?] 页面级帮助：对齐 docs/PRODUCT-DESIGN-PRINCIPLES.md P1
import type { Metadata } from "next";
import { PageHelp } from "../../components/Help";

/** 页面级 [?] 帮助文案 */
const PAGE_HELP =
  "服务条款：规定您使用 浩寅云 AI API 服务时的权利与义务，包括账户责任、禁止行为、服务可用性、费用计费与终止条件。注册并使用本平台即视为您已阅读并同意本条款，使用前请完整阅读。";

export const metadata: Metadata = {
  title: "服务条款",
  description: "浩寅云 服务条款：服务说明、账户责任、禁止行为、可用性与终止条件",
  openGraph: {
    title: "服务条款 — 浩寅云",
    description: "使用 浩寅云 AI API 服务前请阅读本条款",
    type: "website",
  },
};

const UPDATED_AT = "2026 年 10 月";

export default function TermsPage() {
  return (
    <div>
      <section className="page-head">
        <div className="container">
          <span className="overline">Terms</span>
          <h1>
            服务条款
            <PageHelp text={PAGE_HELP} />
          </h1>
          <p className="page-subtitle">使用 浩寅云 服务前请仔细阅读</p>
          <p className="page-note">最近更新：{UPDATED_AT}。本页面为合规占位版本，最终条款以法务审核发布为准。</p>
        </div>
      </section>

      <section className="section" style={{ paddingBottom: "var(--space-8xl)" }}>
        <div className="prose">
          <h3>一、服务说明</h3>
          <p>
            浩寅云 是 AI API 聚合平台，向开发者与企业用户提供统一的模型接入、智能路由与计费服务。
            您通过本平台调用的模型能力由上游供应商提供，本平台负责统一接入、鉴权、计量与运营保障。
          </p>

          <h3>二、账户责任</h3>
          <ul>
            <li>您应提供真实、准确的注册信息，并及时更新。</li>
            <li>您须妥善保管账户与 API Key，对账户下发生的全部活动负责。</li>
            <li>如发现账户或 Key 被盗用，应立即在控制台禁用并联系我们。</li>
          </ul>

          <h3>三、禁止行为</h3>
          <ul>
            <li>利用本服务从事违法违规、侵犯他人权益或违反上游模型使用政策的活动。</li>
            <li>对平台进行反向工程、恶意攻击、刷单、薅羊毛或绕过限流与计费限制。</li>
            <li>将 API Key 转售、共享给未授权第三方，或以本服务从事欺诈行为。</li>
            <li>生成或传播违法、有害、侵权内容。</li>
          </ul>

          <h3>四、费用与计费</h3>
          <p>
            本平台按 Token 实际用量计费，价格以控制台公示为准。账户余额不足或触发预算熔断时，
            调用将被暂停。充值金额在无违约情形下按公示规则退还，具体以计费页面说明为准。
          </p>

          <h3>五、服务可用性</h3>
          <p>
            我们尽力保障服务稳定，并通过多通道灾备与自动故障转移提升可用性。因系统维护、上游供应商故障、
            不可抗力等原因导致的服务中断，我们会及时公告并按 SLA 规则处理。
          </p>

          <h3>六、免责声明</h3>
          <p>
            模型输出由上游模型生成，可能存在偏差或错误，您应自行判断与核验后使用。
            在适用法律允许的最大范围内，本平台不对依赖模型输出所造成的间接损失承担责任。
          </p>

          <h3>七、服务的变更与终止</h3>
          <p>
            我们可根据业务发展调整服务内容与价格，并提前公告。如您违反本条款，我们有权暂停或终止向您提供服务。
            您也可随时申请注销账户。
          </p>

          <h3>八、联系我们</h3>
          <p>
            如对本条款有任何疑问，请通过 support@unmisa.com（占位，以后台系统设置为准）或控制台工单与我们联系。
          </p>
        </div>
      </section>
    </div>
  );
}
