/**
 * HelpCenterPage — 帮助中心
 *
 * Features:
 * - Search box + category list
 * - Help article content display
 */
"use client";

import { useState, useCallback, useMemo } from "react";
import { HelpIcon } from "@3cloud/shared-ui";
import PortalTopbar from "../_components/PortalTopbar";

interface Article {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  body: string;
}

const CATEGORIES = [
  { key: "all", label: "全部", icon: "📚" },
  { key: "getting-started", label: "快速入门", icon: "🚀" },
  { key: "api", label: "API 使用", icon: "🔌" },
  { key: "billing", label: "计费与充值", icon: "💰" },
  { key: "security", label: "安全与账户", icon: "🔒" },
];

const ARTICLES: Article[] = [
  {
    id: "1", category: "getting-started", title: "3cloud 快速上手指南",
    excerpt: "从注册到第一次 API 调用，只需 5 分钟。",
    body: `<h3>3cloud 快速上手指南</h3>
<p>欢迎使用 3cloud AI Token 聚合分发平台！本指南将帮助您在 5 分钟内完成注册到第一次 API 调用。</p>
<h4>第一步：注册账号</h4>
<p>访问注册页面，使用邮箱注册并完成邮箱验证。</p>
<h4>第二步：创建 API Key</h4>
<p>登录后在「API Key 管理」页面创建您的第一个 Key，选择需要调用的模型。</p>
<h4>第三步：发起 API 调用</h4>
<p>使用标准的 OpenAI 兼容接口，将 API 地址替换为 3cloud 网关地址，即可开始调用。</p>`,
  },
  {
    id: "2", category: "api", title: "API 接口格式说明",
    excerpt: "兼容 OpenAI Chat Completions 接口，无缝迁移。",
    body: `<h3>API 接口格式说明</h3>
<p>3cloud API 兼容 OpenAI Chat Completions 接口格式。</p>
<h4>端点</h4>
<pre>POST https://api.3cloud.ai/v1/chat/completions</pre>
<h4>请求头</h4>
<pre>Authorization: Bearer YOUR_API_KEY
Content-Type: application/json</pre>
<h4>支持的特性</h4>
<ul><li>普通对话</li><li>流式调用 (SSE)</li><li>函数调用</li><li>视觉理解</li></ul>`,
  },
  {
    id: "3", category: "api", title: "模型列表与厂商选择",
    excerpt: "了解如何使用模型路由和厂商选择功能。",
    body: `<h3>模型列表与厂商选择</h3>
<p>3cloud 聚合了 30+ 主流 AI 模型。每个模型可由多个厂商提供，您可以在 API Key 创建时选择：</p>
<ul>
<li><strong>自动选择：</strong>系统根据健康度、延迟、价格综合评分智能路由</li>
<li><strong>指定厂商：</strong>锁定某个特定厂商，适合对稳定性有要求的场景</li>
</ul>
<p>切换厂商后 API 调用方式不变，无需修改代码。</p>`,
  },
  {
    id: "4", category: "billing", title: "计费规则说明",
    excerpt: "按 token 计费，价格透明，无隐藏费用。",
    body: `<h3>计费规则说明</h3>
<p>3cloud 采用按量计费模式，按实际使用的 token 数扣费。</p>
<h4>计费公式</h4>
<pre>费用 = 输入 token 数 × 输入单价 + 输出 token 数 × 输出单价</pre>
<h4>计价单位</h4>
<p>每 1000 tokens 或每 1M tokens（视模型而定）。</p>
<h4>各模型价格</h4>
<p>请查看定价页面获取最新价格表。</p>`,
  },
  {
    id: "5", category: "billing", title: "充值方式与限额",
    excerpt: "支持支付宝、微信、对公转账和 USDT 充值。",
    body: `<h3>充值方式与限额</h3>
<h4>在线支付</h4>
<ul><li>支付宝：即时到账，最低 ¥10.00</li><li>微信支付：即时到账，最低 ¥10.00</li></ul>
<h4>对公转账</h4>
<p>提交转账凭证后需人工审核，通常 1 个工作日到账。</p>
<h4>USDT</h4>
<p>支持 TRC20 网络，最低 50 USDT。</p>`,
  },
  {
    id: "6", category: "security", title: "账户安全最佳实践",
    excerpt: "如何保护您的账户和 API Key 安全。",
    body: `<h3>账户安全最佳实践</h3>
<ol>
<li><strong>启用两步验证：</strong>使用 Google Authenticator 添加 2FA</li>
<li><strong>API Key 安全管理：</strong>创建后密钥仅显示一次，请妥善保管</li>
<li><strong>定期轮换 Key：</strong>建议每月更换 API Key</li>
<li><strong>设置过期时间：</strong>为每个 Key 设置合理的过期时间</li>
<li><strong>检查登录记录：</strong>定期查看账户安全页面的登录记录</li>
</ol>`,
  },
  {
    id: "7", category: "security", title: "实名认证流程说明",
    excerpt: "了解个人认证和企业认证的流程与所需材料。",
    body: `<h3>实名认证流程说明</h3>
<h4>个人认证</h4>
<ol><li>准备材料：身份证正反面照片</li><li>填写姓名、身份证号、手机号</li><li>上传身份证照片</li><li>提交审核，1-3 个工作日</li></ol>
<h4>企业认证</h4>
<ol><li>准备材料：营业执照副本、法人身份证</li><li>填写企业信息和法人信息</li><li>上传营业执照和授权委托书</li><li>提交审核，3-5 个工作日</li></ol>`,
  },
];

export default function HelpCenterPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const filtered = useMemo(() => {
    return ARTICLES.filter((a) => {
      const catOk = activeCategory === "all" || a.category === activeCategory;
      const searchOk = !search || a.title.includes(search) || a.excerpt.includes(search) || a.body.includes(search);
      return catOk && searchOk;
    });
  }, [search, activeCategory]);

  return (
    <>
      <PortalTopbar title="帮助中心" helpHint="查找使用指南、API 接口文档、计费说明和安全最佳实践" />

      {selectedArticle ? (
        /* Article Detail */
        <div>
          <button
            onClick={() => setSelectedArticle(null)}
            style={{
              background: "none", border: "none", color: "var(--color-primary)",
              fontSize: "var(--font-size-base)", cursor: "pointer", marginBottom: 16,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            ← 返回列表
          </button>
          <div style={{
            background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
            padding: 32, boxShadow: "var(--shadow-panel)",
          }}>
            <div
              style={{
                fontSize: "var(--font-size-base)", lineHeight: 1.9, color: "var(--color-text)",
              }}
              dangerouslySetInnerHTML={{ __html: selectedArticle.body }}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Search */}
          <div style={{
            background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
            padding: 24, marginBottom: 20, boxShadow: "var(--shadow-panel)",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="text"
                  placeholder="搜索帮助文档…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%", height: 44, border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-lg)", padding: "0 16px 0 40px",
                    fontSize: "var(--font-size-base)", background: "var(--color-panel)",
                    color: "var(--color-text)", outline: "none",
                    transition: "border var(--transition-fast)",
                  }}
                />
                <span style={{
                  position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                  color: "var(--color-text-secondary)", fontSize: 16,
                }}>
                  🔍
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 20 }}>
            {/* Category Sidebar */}
            <div style={{
              width: 200, flexShrink: 0,
              background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
              boxShadow: "var(--shadow-panel)", overflow: "hidden",
            }}>
              <div style={{
                padding: "14px 20px", borderBottom: "1px solid var(--color-divider)",
              }}>
                <h3 style={{ fontSize: "var(--font-size-base)", fontWeight: 600, color: "var(--color-text)" }}>
                  分类
                </h3>
              </div>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 20px", border: "none", cursor: "pointer",
                    background: activeCategory === cat.key ? "var(--color-primary-light)" : "transparent",
                    color: activeCategory === cat.key ? "var(--color-primary)" : "var(--color-text-secondary)",
                    fontSize: "var(--font-size-md)", fontWeight: activeCategory === cat.key ? 500 : 400,
                    borderRight: activeCategory === cat.key ? "3px solid var(--color-primary)" : "3px solid transparent",
                    transition: "all var(--transition-fast)", textAlign: "left",
                  }}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Article List */}
            <div style={{ flex: 1 }}>
              {filtered.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "60px 20px",
                  background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
                  boxShadow: "var(--shadow-panel)",
                  color: "var(--color-text-secondary)", fontSize: "var(--font-size-base)",
                }}>
                  <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>📚</div>
                  <div>未找到相关文章</div>
                  <div style={{ fontSize: "var(--font-size-sm)", marginTop: 8 }}>
                    请尝试更换搜索关键词
                  </div>
                </div>
              ) : (
                <div style={{
                  background: "var(--color-panel)", borderRadius: "var(--radius-xl)",
                  boxShadow: "var(--shadow-panel)", overflow: "hidden",
                }}>
                  {filtered.map((article) => (
                    <div
                      key={article.id}
                      onClick={() => setSelectedArticle(article)}
                      style={{
                        padding: "16px 20px", borderBottom: "1px solid var(--color-divider-light)",
                        cursor: "pointer", transition: "background var(--transition-fast)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-primary-lighter)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                    >
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6,
                      }}>
                        <h4 style={{ fontSize: "var(--font-size-lg)", fontWeight: 500, color: "var(--color-text)" }}>
                          {article.title}
                        </h4>
                        <span style={{
                          padding: "2px 10px", borderRadius: 10, fontSize: "var(--font-size-xs)",
                          background: "var(--color-primary-light)", color: "var(--color-primary)",
                          whiteSpace: "nowrap", marginLeft: 16,
                        }}>
                          {CATEGORIES.find((c) => c.key === article.category)?.label || article.category}
                        </span>
                      </div>
                      <div style={{ fontSize: "var(--font-size-md)", color: "var(--color-text-secondary)" }}>
                        {article.excerpt}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
