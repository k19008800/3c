/**
 * 3cloud v3 Seed — 初始化超级管理员 + 演示数据（客户/额度/实名认证/限流配置）
 * 用法: pnpm --filter @3cloud/api db:seed
 * 幂等：重复执行会跳过已存在项 / 更新密码
 */
import bcrypt from 'bcryptjs';
import { sql, eq, and } from 'drizzle-orm';
import { db, schema } from './index.js';

const ADMIN_EMAIL = 'admin@3cloud.dev';
const ADMIN_PASSWORD = 'Admin@2024!';
const DEMO_PASSWORD = 'Demo@1234';

async function main() {
  console.log('🌱 开始 seed...\n');

  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  const demoHash = bcrypt.hashSync(DEMO_PASSWORD, 12);

  // ── 超级管理员 ──
  let adminId: number;
  const existingAdmin = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, ADMIN_EMAIL))
    .limit(1);

  if (existingAdmin.length > 0) {
    adminId = existingAdmin[0]!.id;
    await db
      .update(schema.users)
      .set({ passwordHash: adminHash, role: 'super_admin', name: 'Super Admin' })
      .where(eq(schema.users.id, adminId));
    console.log(`✅ admin 用户已更新 (id=${adminId}, role=super_admin)`);
  } else {
    const [user] = await db
      .insert(schema.users)
      .values({ email: ADMIN_EMAIL, passwordHash: adminHash, name: 'Super Admin', role: 'super_admin', status: 'active' })
      .returning({ id: schema.users.id });
    adminId = user!.id;
    console.log(`✅ admin 用户已创建 (id=${adminId}, role=super_admin)`);
  }

  /* ───────── helpers ───────── */
  async function findUser(email: string) {
    const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
    return rows[0]?.id ?? null;
  }

  /** 创建/复用演示用户；已存在则不覆盖 real_name_status */
  async function ensureUser(data: {
    email: string; name: string; customerType?: 'enterprise' | 'personal'; isContract?: boolean;
    realNameStatus?: string; balance?: string;
  }): Promise<number> {
    const email = data.email.toLowerCase();
    const id = await findUser(email);
    if (id) return id;
    const [u] = await db
      .insert(schema.users)
      .values({
        email,
        name: data.name,
        role: 'customer',
        status: 'active',
        passwordHash: demoHash,
        customerType: data.customerType ?? 'personal',
        isContract: data.isContract ?? false,
        realNameStatus: data.realNameStatus ?? 'unverified',
        emailVerified: sql`NOW()`,
        lastLoginAt: sql`NOW() - INTERVAL '2 days'`,
      })
      .returning({ id: schema.users.id });
    const userId = u!.id;
    if (data.balance) {
      await db.insert(schema.customerBalances).values({
        userId,
        totalBalance: data.balance,
        availableBalance: data.balance,
        frozenBalance: '0',
      });
    }
    return userId;
  }

  // ── system_config：限流/额度默认键（幂等 upsert） ──
  const CONFIGS: Array<[string, string, string]> = [
    ['enterprise_rpm', '300', '企业客户默认 RPM'],
    ['enterprise_tpm', '1000000', '企业客户默认 TPM'],
    ['personal_rpm', '60', '个人客户默认 RPM'],
    ['personal_tpm', '200000', '个人客户默认 TPM'],
    ['rate_limit_enabled', 'true', '全局限流开关'],
    ['global_rpm', '10000', '全局 RPM 上限'],
    ['global_tpm', '10000000', '全局 TPM 上限'],
  ];
  for (const [key, value, description] of CONFIGS) {
    await db.insert(schema.systemConfig)
      .values({ key, value, description })
      .onConflictDoUpdate({ target: schema.systemConfig.key, set: { value, description } });
  }
  console.log(`✅ system_config 限流/额度默认键 ${CONFIGS.length} 个`);

  // ── system_config：计费默认键（幂等 upsert；与 admin-settings.ts SETTING_DEFAULTS 一致）──
  const BILLING_CONFIGS: Array<[string, string, string]> = [
    ['billing.balance_threshold', '100', '余额预扣阈值（元）：余额 > 此值走旁路事后扣费，≤ 此值走 Redis Lua 预扣'],
    ['billing.cache_hit_discount', '0.1', '缓存命中折扣率（0-1）：上游返回缓存命中 token 时按全价 × 此比例计费；模型级 vendor_pricing.cache_discount_rate 可覆盖'],
    ['billing.cache_pricing_mode', 'explicit', '缓存计费模式（explicit=显式价优先/discount_rate=兼容旧折扣率行为，灰度/回退开关；ARCH 评审 D-13 默认 explicit）'],
  ];
  for (const [key, value, description] of BILLING_CONFIGS) {
    await db.insert(schema.systemConfig)
      .values({ key, value, description })
      .onConflictDoUpdate({ target: schema.systemConfig.key, set: { value, description } });
  }
  console.log(`✅ system_config 计费默认键 ${BILLING_CONFIGS.length} 个`);

  // ── risk_rules：负余额强制预扣风控规则（P0-1 记负兜底依赖，risk_events.rule_id NOT NULL）──
  // 旁路扣费后余额 < 0 时写 risk_events 引用此规则；该用户后续请求强制预扣直到充值回正。
  const [negRule] = await db
    .select({ id: schema.riskRules.id }).from(schema.riskRules)
    .where(eq(schema.riskRules.name, 'negative-balance-force-preconsume')).limit(1);
  if (!negRule) {
    await db.insert(schema.riskRules).values({
      name: 'negative-balance-force-preconsume',
      ruleType: 'balance',
      description: '旁路扣费后余额为负 → 写风控事件；该用户后续请求强制预扣（Redis neg 标记）直到充值回正',
      config: { action: 'force_preconsume' },
      enabled: true,
    });
    console.log('✅ risk_rules 负余额强制预扣规则已创建');
  } else {
    console.log('✅ risk_rules 负余额强制预扣规则已存在，跳过');
  }

  // ── system_config：站点品牌配置（Portal site-config 白名单，幂等 upsert）──
  // 白名单见 api/src/routes/public.ts SITE_CONFIG_WHITELIST（12 keys）
  const SITE_CONFIGS: Array<[string, string, string]> = [
    ['site_name', '3Cloud', '站点名称（Header/Footer 展示）'],
    ['site_logo_url', '', '站点 logo URL（空则用文字 logo）'],
    ['site_favicon_url', '', '站点 favicon URL'],
    ['site_company_name', '3Cloud Technology', '公司名称'],
    ['site_icp', '', 'ICP 备案号（待补充）'],
    ['site_icp_link', '', 'ICP 备案查询链接'],
    ['site_police_icp', '', '公安备案号（待补充）'],
    ['site_contact_email', 'support@unmisa.com', '联系邮箱（Footer 展示）'],
    ['site_contact_phone', '', '联系电话（待补充）'],
    ['site_copyright', `© ${new Date().getFullYear()} 3Cloud · AI Token 聚合平台`, '版权信息'],
    ['site_wechat_qr_url', '', '公众号二维码 URL（待补充）'],
    ['site_footer_html', '', '自定义 Footer HTML（空则用默认版权渲染）'],
  ];
  for (const [key, value, description] of SITE_CONFIGS) {
    await db.insert(schema.systemConfig)
      .values({ key, value, description })
      .onConflictDoUpdate({ target: schema.systemConfig.key, set: { value, description } });
  }
  console.log(`✅ system_config 站点品牌配置 ${SITE_CONFIGS.length} keys`);

  // ── system_config：运维配置键（performance / undo，与 admin-ops.ts 默认值一致）──
  const OPS_CONFIGS: Array<[string, string, string]> = [
    ['perf_cache_ttl_seconds', '300', '缓存 TTL 秒'],
    ['perf_query_timeout_seconds', '30', '查询超时秒'],
    ['perf_connection_pool_max', '20', '连接池大小'],
    ['perf_connection_pool_idle_timeout', '60', '连接空闲超时秒'],
    ['perf_compression_enabled', 'true', 'GZip 压缩'],
    ['perf_response_gzip_min_bytes', '1024', '压缩最小字节'],
    ['perf_batch_write_enabled', 'true', '批量写入'],
    ['perf_batch_write_interval_ms', '500', '批量写入间隔 ms'],
    ['perf_slow_query_threshold_ms', '1000', '慢查询阈值 ms'],
    ['perf_max_concurrent_requests', '1000', '最大并发请求'],
    ['undo_timeout_seconds', '300', '撤销窗口秒'],
    ['undo_enabled_types', JSON.stringify(['user_status_change', 'user_disable', 'user_delete', 'user_edit', 'balance_adjust', 'role_assign', 'config_edit', 'vendor_delete', 'model_delete']), '可撤销操作类型'],
  ];
  for (const [key, value, description] of OPS_CONFIGS) {
    await db.insert(schema.systemConfig)
      .values({ key, value, description })
      .onConflictDoUpdate({ target: schema.systemConfig.key, set: { value, description } });
  }
  console.log(`✅ system_config 运维配置键 ${OPS_CONFIGS.length} keys`);

  // ── site_content：默认站点内容（内容管理页；slug 幂等）──
  const CONTENTS: Array<{ type: string; slug: string; title: string; content: string }> = [
    { type: 'legal', slug: 'terms', title: '服务条款', content: '（待编辑）欢迎使用 3Cloud。使用即表示你同意本条款。' },
    { type: 'legal', slug: 'privacy', title: '隐私政策', content: '（待编辑）我们重视你的隐私，仅在提供服务所必需时收集数据。' },
    { type: 'page', slug: 'about', title: '关于我们', content: '（待编辑）3Cloud 是 AI Token 聚合平台，为企业与个人提供统一的大模型 API 接入。' },
    { type: 'page', slug: 'contact', title: '联系我们', content: '（待编辑）联系邮箱：support@unmisa.com' },
    { type: 'faq', slug: 'faq', title: '常见问题', content: '（待编辑）Q: 如何获取 API Key？A: 注册并实名认证后，在控制台创建。' },
    { type: 'page', slug: 'help', title: '帮助中心', content: '（待编辑）使用过程中遇到问题？请先查阅常见问题或联系我们。' },
    // P2-3 示例博客（type='blog' + status 默认 published；Portal /blog 消费）
    { type: 'blog', slug: 'welcome-to-3cloud', title: '欢迎使用 3Cloud', content: [
      '# 欢迎使用 3Cloud',
      '',
      '3Cloud 是一个一站式 AI API 聚合平台：统一接入 DeepSeek、Qwen、GLM、GPT、Claude 等主流模型，',
      '提供智能路由、统一计费与精细运营能力，开发者只需一套 API Key 即可调用全部模型。',
      '',
      '## 核心能力',
      '',
      '1. 统一接入：兼容 OpenAI 与 Anthropic 双格式，零代码迁移；',
      '2. 智能路由：自动选择最优供应商，故障自动切换，保障高可用；',
      '3. 统一计费：精确到 Token 的实时计费，账单透明，支持余额预警；',
      '4. 安全合规：IP 白名单、用量限额、操作审计与数据加密传输。',
      '',
      '## 快速开始',
      '',
      '注册账号并完成实名认证后，即可在控制台创建 API Key 并开始调用。',
      '新用户注册即送 ¥5 试用额度，欢迎体验！',
      '',
      '—— 3Cloud 团队',
    ].join('\n') },
    { type: 'blog', slug: '5-minute-quickstart', title: '5 分钟快速接入 3Cloud API', content: [
      '# 5 分钟快速接入 3Cloud API',
      '',
      '本文演示如何用 OpenAI SDK 在 5 分钟内完成首次调用。',
      '',
      '## 第 1 步：注册并获取 API Key',
      '',
      '1. 注册 3Cloud 账号并完成实名认证；',
      '2. 登录控制台，进入「API Keys」页面创建密钥；',
      '3. 复制生成的密钥（仅展示一次，请妥善保存）。',
      '',
      '## 第 2 步：配置 SDK',
      '',
      '```python',
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      '    api_key="YOUR_API_KEY",',
      '    base_url="<api_domain>/v1",  # 见控制台「接入引导」',
      ')',
      '```',
      '',
      '## 第 3 步：发起调用',
      '',
      '```python',
      'response = client.chat.completions.create(',
      '    model="deepseek-chat",',
      '    messages=[{"role": "user", "content": "你好"}],',
      ')',
      'print(response.choices[0].message.content)',
      '```',
      '',
      '调用成功后，可在控制台「调用日志」中查看用量与费用明细。',
      '',
      '更多接入方式（cURL / Node.js / Anthropic SDK）请查阅开发者文档。',
      '',
      '—— 3Cloud 团队',
    ].join('\n') },
  ];
  let contentsCreated = 0;
  for (const c of CONTENTS) {
    const [exists] = await db
      .select({ id: schema.siteContents.id }).from(schema.siteContents)
      .where(eq(schema.siteContents.slug, c.slug)).limit(1);
    if (exists) continue;
    await db.insert(schema.siteContents).values(c);
    contentsCreated++;
  }
  if (contentsCreated > 0) console.log(`✅ site_content 默认内容新增 ${contentsCreated} 条`);

  // ── i18n_entries：门户翻译种子（P2-3；key+lang 幂等 upsert） ──
  // Portal 前端回退源语为英文（web-portal/src/lib/i18n.ts EN_DEFAULTS），
  // 因此 en 条目与英文源语一致；库中缺失的 key 由前端回退英文原文展示。
  // 运营可通过管理端 /admin/i18n/entries 增改，无需改代码。
  const I18N: Array<[key: string, lang: string, value: string]> = [
    // ── nav ──
    ['nav.home', 'zh-CN', '首页'], ['nav.home', 'en', 'Home'],
    ['nav.models', 'zh-CN', '模型目录'], ['nav.models', 'en', 'Models'],
    ['nav.pricing', 'zh-CN', '定价'], ['nav.pricing', 'en', 'Pricing'],
    ['nav.about', 'zh-CN', '关于我们'], ['nav.about', 'en', 'About'],
    ['nav.status', 'zh-CN', '系统状态'], ['nav.status', 'en', 'Status'],
    ['nav.blog', 'zh-CN', '博客'], ['nav.blog', 'en', 'Blog'],
    ['nav.login', 'zh-CN', '登录'], ['nav.login', 'en', 'Sign in'],
    // ── home.hero ──
    ['home.hero.title', 'zh-CN', '一站式 AI API 聚合平台'],
    ['home.hero.title', 'en', 'One-stop AI API Aggregation Platform'],
    ['home.hero.subtitle', 'zh-CN', '统一接入 DeepSeek、Qwen、GLM、GPT、Claude 等主流模型，智能路由、统一计费、精细运营 — 一套 API 搞定全部模型'],
    ['home.hero.subtitle', 'en', 'Unified access to DeepSeek, Qwen, GLM, GPT, Claude and more — smart routing, unified billing, fine-grained operations with a single API'],
    ['home.hero.browseModels', 'zh-CN', '浏览模型目录'], ['home.hero.browseModels', 'en', 'Browse Models'],
    ['home.hero.viewPricing', 'zh-CN', '查看定价'], ['home.hero.viewPricing', 'en', 'View Pricing'],
    ['home.hero.signup', 'zh-CN', '注册 / 登录'], ['home.hero.signup', 'en', 'Sign up / Sign in'],
    ['home.hero.quickstart', 'zh-CN', '一键接入'], ['home.hero.quickstart', 'en', 'Quick start'],
    // ── home.stats ──
    ['home.stats.models', 'zh-CN', '接入模型'], ['home.stats.models', 'en', 'Models'],
    ['home.stats.vendors', 'zh-CN', '供应商'], ['home.stats.vendors', 'en', 'Vendors'],
    ['home.stats.users', 'zh-CN', '平台用户'], ['home.stats.users', 'en', 'Users'],
    ['home.stats.tokens', 'zh-CN', '累计 Tokens'], ['home.stats.tokens', 'en', 'Total Tokens'],
    // ── home.features ──
    ['home.features.title', 'zh-CN', '为什么选择 3Cloud'], ['home.features.title', 'en', 'Why 3Cloud'],
    ['home.features.subtitle', 'zh-CN', '一站接入，覆盖全场景 AI 能力'], ['home.features.subtitle', 'en', 'One integration for every AI scenario'],
    ['home.features.unified.title', 'zh-CN', '统一接入'], ['home.features.unified.title', 'en', 'Unified Access'],
    ['home.features.unified.desc', 'zh-CN', '一套 API Key 接入多家供应商的 200+ 模型，兼容 OpenAI API 格式，零代码迁移'],
    ['home.features.unified.desc', 'en', 'One API key for 200+ models across vendors, OpenAI-compatible, zero-code migration'],
    ['home.features.routing.title', 'zh-CN', '智能路由'], ['home.features.routing.title', 'en', 'Smart Routing'],
    ['home.features.routing.desc', 'zh-CN', '自动选择最优供应商，支持多通道灾备熔断，故障自动切换，保障高可用'],
    ['home.features.routing.desc', 'en', 'Auto-select the best supplier with multi-channel failover and circuit breaking'],
    ['home.features.billing.title', 'zh-CN', '统一计费'], ['home.features.billing.title', 'en', 'Unified Billing'],
    ['home.features.billing.desc', 'zh-CN', '精确到 Token 级别的实时计费，一套账单看清所有模型消费，支持余额预警'],
    ['home.features.billing.desc', 'en', 'Real-time token-level billing, one bill for all models, with balance alerts'],
    ['home.features.vendors.title', 'zh-CN', '多供应商'], ['home.features.vendors.title', 'en', 'Multi-vendor'],
    ['home.features.vendors.desc', 'zh-CN', '对接 DeepSeek、OpenAI、Anthropic、Google、智谱等全球主流 AI 供应商'],
    ['home.features.vendors.desc', 'en', 'Connect to DeepSeek, OpenAI, Anthropic, Google, Zhipu and other leading vendors'],
    ['home.features.security.title', 'zh-CN', '安全合规'], ['home.features.security.title', 'en', 'Security & Compliance'],
    ['home.features.security.desc', 'zh-CN', '支持 IP 白名单、用量限额、操作审计、数据加密传输，满足企业级安全需求'],
    ['home.features.security.desc', 'en', 'IP allowlists, usage limits, audit logs and encrypted transport for enterprise needs'],
    ['home.features.multidevice.title', 'zh-CN', '多端支持'], ['home.features.multidevice.title', 'en', 'Multi-platform'],
    ['home.features.multidevice.desc', 'zh-CN', 'Web 管理后台 + API 接口 + 代理运营面板，覆盖开发/运营/管理全场景'],
    ['home.features.multidevice.desc', 'en', 'Web console + API + agent panel covering dev, operations and management'],
    // ── home.popular ──
    ['home.popular.title', 'zh-CN', '热门模型'], ['home.popular.title', 'en', 'Popular Models'],
    ['home.popular.subtitle', 'zh-CN', '覆盖对话、嵌入、图像、音频等多种能力'], ['home.popular.subtitle', 'en', 'Chat, embedding, image, audio and more'],
    ['home.popular.viewAll', 'zh-CN', '查看全部模型'], ['home.popular.viewAll', 'en', 'View all models'],
    // ── home.how ──
    ['home.how.title', 'zh-CN', '三步开始调用'], ['home.how.title', 'en', 'Start in 3 Steps'],
    ['home.how.subtitle', 'zh-CN', '从注册到首次调用，不到 3 分钟'], ['home.how.subtitle', 'en', 'From signup to first call in under 3 minutes'],
    ['home.how.step1.title', 'zh-CN', '注册账号'], ['home.how.step1.title', 'en', 'Create Account'],
    ['home.how.step1.desc', 'zh-CN', '使用邮箱注册，通过实名认证即可获得 ¥5 试用额度，立即开始体验'],
    ['home.how.step1.desc', 'en', 'Sign up with email, complete verification and get ¥5 trial credit'],
    ['home.how.step2.title', 'zh-CN', '创建 API Key'], ['home.how.step2.title', 'en', 'Create API Key'],
    ['home.how.step2.desc', 'zh-CN', '在控制台创建 API Key，设置权限、用量限额和安全策略'],
    ['home.how.step2.desc', 'en', 'Create an API key in the console with permissions and limits'],
    ['home.how.step3.title', 'zh-CN', '调用模型'], ['home.how.step3.title', 'en', 'Call Models'],
    ['home.how.step3.desc', 'zh-CN', '使用 OpenAI 兼容接口调用，支持 cURL / Python / Node.js 等多种语言'],
    ['home.how.step3.desc', 'en', 'Call via OpenAI-compatible APIs with cURL, Python or Node.js'],
    // ── home.dev ──
    ['home.dev.title', 'zh-CN', '开发者友好'], ['home.dev.title', 'en', 'Developer Friendly'],
    ['home.dev.subtitle', 'zh-CN', '兼容 OpenAI SDK，几行代码即可接入'], ['home.dev.subtitle', 'en', 'OpenAI SDK compatible — integrate in a few lines'],
    // ── home.pricing 预览 ──
    ['home.pricing.title', 'zh-CN', '透明定价'], ['home.pricing.title', 'en', 'Transparent Pricing'],
    ['home.pricing.subtitle', 'zh-CN', '按量计费，用多少付多少，无隐藏费用'], ['home.pricing.subtitle', 'en', 'Pay as you go, no hidden fees'],
    ['home.pricing.model', 'zh-CN', '模型'], ['home.pricing.model', 'en', 'Model'],
    ['home.pricing.category', 'zh-CN', '类别'], ['home.pricing.category', 'en', 'Category'],
    ['home.pricing.input', 'zh-CN', '输入/1K tokens'], ['home.pricing.input', 'en', 'Input / 1K tokens'],
    ['home.pricing.output', 'zh-CN', '输出/1K tokens'], ['home.pricing.output', 'en', 'Output / 1K tokens'],
    ['home.pricing.context', 'zh-CN', '上下文'], ['home.pricing.context', 'en', 'Context'],
    ['home.pricing.viewAll', 'zh-CN', '查看完整定价'], ['home.pricing.viewAll', 'en', 'View full pricing'],
    // ── home.faq ──
    ['home.faq.title', 'zh-CN', '常见问题'], ['home.faq.title', 'en', 'FAQ'],
    ['home.faq.q1', 'zh-CN', '什么是 3Cloud？'], ['home.faq.q1', 'en', 'What is 3Cloud?'],
    ['home.faq.a1', 'zh-CN', '3Cloud 是一个 AI API 聚合平台，提供统一的 API 接口接入多家供应商的 AI 模型，让开发者只需一套 API Key 就能调用所有模型。'],
    ['home.faq.a1', 'en', '3Cloud is an AI API aggregation platform that unifies access to models from multiple vendors through one API key.'],
    ['home.faq.q2', 'zh-CN', '如何计费？'], ['home.faq.q2', 'en', 'How does billing work?'],
    ['home.faq.a2', 'zh-CN', '按 Token 计费，输入和输出分别计价。用多少付多少，无月费无最低消费。'],
    ['home.faq.a2', 'en', 'Billed per token with separate input/output rates. Pay only for what you use, no monthly fee.'],
    ['home.faq.q3', 'zh-CN', '支持哪些模型？'], ['home.faq.q3', 'en', 'Which models are supported?'],
    ['home.faq.a3', 'zh-CN', '支持对话、嵌入、图像、音频、视频等多种类别，覆盖 DeepSeek、Qwen、GLM、GPT、Claude、Gemini 等主流供应商。'],
    ['home.faq.a3', 'en', 'Chat, embedding, image, audio and video models from DeepSeek, Qwen, GLM, GPT, Claude, Gemini and more.'],
    ['home.faq.q4', 'zh-CN', '怎么开始使用？'], ['home.faq.q4', 'en', 'How do I get started?'],
    ['home.faq.a4', 'zh-CN', '注册账号 → 实名认证 → 创建 API Key → 使用 OpenAI 兼容接口调用。新用户注册即送 ¥5 试用额度。'],
    ['home.faq.a4', 'en', 'Sign up → verify → create an API key → call via OpenAI-compatible APIs. New users get ¥5 trial credit.'],
    ['home.faq.q5', 'zh-CN', '是否兼容 OpenAI SDK？'], ['home.faq.q5', 'en', 'Is the OpenAI SDK supported?'],
    ['home.faq.a5', 'zh-CN', '完全兼容。只需将 SDK 的 base_url 指向平台接入地址，搭配 3Cloud API Key 即可使用。'],
    ['home.faq.a5', 'en', 'Fully compatible. Point the SDK base_url to the platform endpoint with a 3Cloud API key.'],
    ['home.faq.q6', 'zh-CN', '供应商故障时怎么办？'], ['home.faq.q6', 'en', 'What if a vendor fails?'],
    ['home.faq.a6', 'zh-CN', '智能路由引擎自动检测供应商健康状态，异常时自动切换到可用供应商，保障高可用。'],
    ['home.faq.a6', 'en', 'The routing engine monitors vendor health and fails over automatically to keep service available.'],
    ['home.faq.q7', 'zh-CN', '企业用户有优惠吗？'], ['home.faq.q7', 'en', 'Do enterprise users get discounts?'],
    ['home.faq.a7', 'zh-CN', '有。企业用户可联系销售获取专属折扣、定制化定价和优先技术支持。'],
    ['home.faq.a7', 'en', 'Yes. Contact sales for custom pricing, dedicated discounts and priority support.'],
    // ── home.cta ──
    ['home.cta.title', 'zh-CN', '准备好开始了吗？'], ['home.cta.title', 'en', 'Ready to get started?'],
    ['home.cta.subtitle', 'zh-CN', '注册即送 ¥5 试用额度，立刻体验'], ['home.cta.subtitle', 'en', 'Get ¥5 trial credit on signup'],
    ['home.cta.button', 'zh-CN', '免费注册'], ['home.cta.button', 'en', 'Sign up free'],
    // ── footer ──
    ['footer.product', 'zh-CN', '产品'], ['footer.product', 'en', 'Product'],
    ['footer.resources', 'zh-CN', '资源'], ['footer.resources', 'en', 'Resources'],
    ['footer.legal', 'zh-CN', '法律'], ['footer.legal', 'en', 'Legal'],
    // ── pricing ──
    ['pricing.title', 'zh-CN', '模型标价'], ['pricing.title', 'en', 'Model Pricing'],
    ['pricing.subtitle', 'zh-CN', '透明计费 · 按量付费 · 无隐藏费用 · 实时拉取标价'],
    ['pricing.subtitle', 'en', 'Transparent · Pay-as-you-go · No hidden fees · Live prices'],
    ['pricing.calculator', 'zh-CN', '价格计算器'], ['pricing.calculator', 'en', 'Price Calculator'],
    ['pricing.allModels', 'zh-CN', '全部模型标价'], ['pricing.allModels', 'en', 'All Model Prices'],
    ['pricing.allLabel', 'zh-CN', '全部'], ['pricing.allLabel', 'en', 'All'],
    ['pricing.empty', 'zh-CN', '暂无模型数据'], ['pricing.empty', 'en', 'No model data'],
    ['pricing.table.model', 'zh-CN', '模型名称'], ['pricing.table.model', 'en', 'Model'],
    ['pricing.table.vendor', 'zh-CN', '供应商'], ['pricing.table.vendor', 'en', 'Vendor'],
    ['pricing.table.category', 'zh-CN', '类别'], ['pricing.table.category', 'en', 'Category'],
    ['pricing.table.input', 'zh-CN', '输入标价/1K tokens'], ['pricing.table.input', 'en', 'Input / 1K tokens'],
    ['pricing.table.output', 'zh-CN', '输出标价/1K tokens'], ['pricing.table.output', 'en', 'Output / 1K tokens'],
    ['pricing.table.context', 'zh-CN', '上下文长度'], ['pricing.table.context', 'en', 'Context length'],
    ['pricing.faq.title', 'zh-CN', '计费说明'], ['pricing.faq.title', 'en', 'Billing Notes'],
    ['pricing.faq.q1', 'zh-CN', '标价是什么意思？'], ['pricing.faq.q1', 'en', 'What does list price mean?'],
    ['pricing.faq.a1', 'zh-CN', '标价是 3Cloud 平台对外的标准售价，由后台为每个供应商-模型独立配置，是用户折扣前的基准价。'],
    ['pricing.faq.a1', 'en', 'The list price is the standard public price configured per vendor-model, the base price before any discount.'],
    ['pricing.faq.q2', 'zh-CN', '如何计费？'], ['pricing.faq.q2', 'en', 'How is billing calculated?'],
    ['pricing.faq.a2', 'zh-CN', '按 Token 计费，输入和输出分别计价。每次调用自动按实际消耗的 Token 数量计算费用并从余额中扣除。'],
    ['pricing.faq.a2', 'en', 'Per-token billing with separate input/output rates, deducted automatically per call.'],
    ['pricing.faq.q3', 'zh-CN', '有套餐吗？'], ['pricing.faq.q3', 'en', 'Are there plans?'],
    ['pricing.faq.a3', 'zh-CN', '按量计费，用多少付多少。如需更高额度或专属折扣，可联系销售获取企业定制方案。'],
    ['pricing.faq.a3', 'en', 'Pay as you go. For higher limits or custom discounts, contact sales.'],
    ['pricing.faq.q4', 'zh-CN', '有免费额度吗？'], ['pricing.faq.q4', 'en', 'Is there free credit?'],
    ['pricing.faq.a4', 'zh-CN', '新用户注册后实名认证即送 ¥5 试用额度，可以充分体验平台各模型能力。'],
    ['pricing.faq.a4', 'en', 'New users get ¥5 trial credit after verification to try all models.'],
    ['pricing.faq.q5', 'zh-CN', '价格会变吗？'], ['pricing.faq.q5', 'en', 'Do prices change?'],
    ['pricing.faq.a5', 'zh-CN', '供应商成本价变动时，标价会自动调整。平台标价为实时拉取，确保定价透明。'],
    ['pricing.faq.a5', 'en', 'Prices update automatically when vendor costs change; the list is always live.'],
    ['pricing.calc.title', 'zh-CN', '价格计算器'], ['pricing.calc.title', 'en', 'Price Calculator'],
    ['pricing.calc.model', 'zh-CN', '模型'], ['pricing.calc.model', 'en', 'Model'],
    ['pricing.calc.selectPlaceholder', 'zh-CN', '请选择模型'], ['pricing.calc.selectPlaceholder', 'en', 'Select a model'],
    ['pricing.calc.inputTokens', 'zh-CN', '输入 Tokens'], ['pricing.calc.inputTokens', 'en', 'Input Tokens'],
    ['pricing.calc.outputTokens', 'zh-CN', '输出 Tokens'], ['pricing.calc.outputTokens', 'en', 'Output Tokens'],
    ['pricing.calc.selectPrompt', 'zh-CN', '选择模型后计算'], ['pricing.calc.selectPrompt', 'en', 'Select a model to calculate'],
    ['pricing.calc.estimate', 'zh-CN', '预估费用'], ['pricing.calc.estimate', 'en', 'Estimated cost'],
    // ── blog ──
    ['blog.title', 'zh-CN', '博客 / 新闻'], ['blog.title', 'en', 'Blog / News'],
    ['blog.subtitle', 'zh-CN', '产品更新、技术分享与平台公告'], ['blog.subtitle', 'en', 'Product updates, tech sharing and announcements'],
    ['blog.empty', 'zh-CN', '暂无文章'], ['blog.empty', 'en', 'No posts yet'],
    ['blog.publishedAt', 'zh-CN', '发布于'], ['blog.publishedAt', 'en', 'Published'],
    ['blog.back', 'zh-CN', '← 返回博客列表'], ['blog.back', 'en', '← Back to blog'],
    ['blog.notFound', 'zh-CN', '文章不存在或已下线'], ['blog.notFound', 'en', 'Post not found or unpublished'],
    // ── help（[?] 帮助文案）──
    ['help.langSwitcher', 'zh-CN', '切换门户显示语言；未翻译的文案将显示英文原文。'],
    ['help.langSwitcher', 'en', 'Switch the portal language; untranslated text falls back to English.'],
    ['help.home', 'zh-CN', '门户首页：展示平台核心能力、热门模型、价格与常见问题。适用角色：所有访客。核心操作：浏览模型、查看定价、注册登录、快速接入。'],
    ['help.home', 'en', 'Portal home: platform capabilities, popular models, pricing and FAQ. Role: all visitors.'],
    ['help.pricing', 'zh-CN', '定价页：展示全部模型标价并支持价格计算器。适用角色：所有访客。核心操作：选择模型并输入 Token 数实时估算费用。'],
    ['help.pricing', 'en', 'Pricing page: all model prices plus a live price calculator. Role: all visitors.'],
    ['help.blog', 'zh-CN', '博客列表：展示已发布的平台文章（产品更新 / 技术分享 / 公告）。适用角色：所有访客。核心操作：浏览文章、点击进入详情。'],
    ['help.blog', 'en', 'Blog list: published platform posts (updates / tech / announcements). Role: all visitors.'],
    ['help.blogPost', 'zh-CN', '博客详情：展示文章正文。适用角色：所有访客。核心操作：阅读文章、返回列表。'],
    ['help.blogPost', 'en', 'Blog post: article content. Role: all visitors.'],
  ];
  let i18nUpserted = 0;
  for (const [key, lang, value] of I18N) {
    await db.insert(schema.i18nEntries)
      .values({ key, lang, value, scope: 'portal', status: 'active', updatedBy: adminId })
      .onConflictDoUpdate({
        target: [schema.i18nEntries.key, schema.i18nEntries.lang],
        set: { value, updatedBy: adminId },
      });
    i18nUpserted++;
  }
  console.log(`✅ i18n_entries 门户翻译种子 upsert ${i18nUpserted} 条（幂等）`);

  /* ── i18n_entries：补 8 语言（Gate-1） ──
   * 目的（docs/多语言i18n改造方案.md §2.4 Gate-1）：让"8 语言 seed 结构存在、
   * 覆盖率面板能计数、normalize 放开后不整页崩溃"。
   * · zh-CN / en 来自上方 I18N 基准。
   * · ja-JP / ko-KR：用下列 shell 术语表翻译（nav/footer/hero/cta/how/分节标题等），
   *   未收录的 key（长描述/FAQ 长文）回退英文——低频 key 回退英文是可接受策略。
   * · vi / th / id / fil：复用英文占位，显式标注【待翻译】。
   * key+lang 幂等 upsert（与上方 I18N 同 pattern），可安全重跑。
   */
  // locale 术语表（key → 目标语言文本）；缺失的 key 自动回退英文。
  const JA_TERMS: Record<string, string> = {
    'nav.home': 'ホーム', 'nav.models': 'モデル一覧', 'nav.pricing': '価格表', 'nav.about': '会社概要',
    'nav.status': 'システム状態', 'nav.blog': 'ブログ', 'nav.login': 'ログイン',
    'footer.product': '製品', 'footer.resources': 'リソース', 'footer.legal': '法務',
    'home.hero.title': 'ワンストップ AI API 集約プラットフォーム',
    'home.hero.browseModels': 'モデル一覧を見る', 'home.hero.viewPricing': '価格表を見る',
    'home.hero.signup': '登録 / ログイン', 'home.hero.quickstart': 'すぐに始める',
    'home.stats.models': '接続モデル', 'home.stats.vendors': 'サプライヤー',
    'home.stats.users': '利用ユーザー', 'home.stats.tokens': '累計トークン',
    'home.features.title': '3Cloud を選ぶ理由',
    'home.features.unified.title': '統合アクセス', 'home.features.routing.title': 'スマートルーティング',
    'home.features.billing.title': '統合課金', 'home.features.vendors.title': '多数サプライヤー',
    'home.features.security.title': '安全とコンプライアンス', 'home.features.multidevice.title': 'マルチデバイス対応',
    'home.popular.title': '人気モデル', 'home.popular.viewAll': '全モデルを見る',
    'home.how.title': '3 ステップで開始', 'home.how.step1.title': 'アカウント作成',
    'home.how.step2.title': 'API キー作成', 'home.how.step3.title': 'モデルを呼び出し',
    'home.dev.title': '開発者フレンドリー', 'home.pricing.title': '透明な価格設定',
    'home.pricing.model': 'モデル', 'home.pricing.category': 'カテゴリ',
    'home.pricing.input': '入力 / 1K tokens', 'home.pricing.output': '出力 / 1K tokens',
    'home.pricing.context': 'コンテキスト', 'home.pricing.viewAll': '詳細価格を見る',
    'home.faq.title': 'よくある質問', 'home.cta.title': '始める準備はできましたか？',
    'home.cta.button': '無料登録', 'pricing.title': 'モデル価格', 'pricing.subtitle': '従量課金・隠れた費用なし',
    'pricing.calculator': '価格計算ツール', 'pricing.allModels': '全モデル価格',
    'pricing.allLabel': 'すべて', 'pricing.empty': 'モデルデータがありません',
    'pricing.table.model': 'モデル名', 'pricing.table.vendor': 'サプライヤー',
    'pricing.table.category': 'カテゴリ', 'pricing.table.input': '入力価格 / 1K tokens',
    'pricing.table.output': '出力価格 / 1K tokens', 'pricing.table.context': 'コンテキスト長',
    'pricing.faq.title': '課金について', 'pricing.calc.title': '価格計算ツール',
    'pricing.calc.model': 'モデル', 'pricing.calc.inputTokens': '入力トークン',
    'pricing.calc.outputTokens': '出力トークン', 'pricing.calc.estimate': '見積費用',
    'blog.title': 'ブログ / ニュース', 'blog.empty': '記事はまだありません',
    'blog.publishedAt': '公開日', 'blog.notFound': '記事が見つからないか非公開です',
    'help.langSwitcher': '表示言語を切り替えます。未翻訳の文言は英語で表示されます。',
  };
  const KO_TERMS: Record<string, string> = {
    'nav.home': '홈', 'nav.models': '모델 목록', 'nav.pricing': '요금제', 'nav.about': '회사 소개',
    'nav.status': '시스템 상태', 'nav.blog': '블로그', 'nav.login': '로그인',
    'footer.product': '제품', 'footer.resources': '리소스', 'footer.legal': '법률',
    'home.hero.title': '올인원 AI API 통합 플랫폼',
    'home.hero.browseModels': '모델 목록 보기', 'home.hero.viewPricing': '요금제 보기',
    'home.hero.signup': '가입 / 로그인', 'home.hero.quickstart': '바로 시작',
    'home.stats.models': '연결 모델', 'home.stats.vendors': '공급업체',
    'home.stats.users': '플랫폼 사용자', 'home.stats.tokens': '누적 토큰',
    'home.features.title': '3Cloud 를 선택하는 이유',
    'home.features.unified.title': '통합 액세스', 'home.features.routing.title': '스마트 라우팅',
    'home.features.billing.title': '통합 과금', 'home.features.vendors.title': '다중 공급업체',
    'home.features.security.title': '보안 및 규정 준수', 'home.features.multidevice.title': '멀티 플랫폼',
    'home.popular.title': '인기 모델', 'home.popular.viewAll': '전체 모델 보기',
    'home.how.title': '3단계로 시작', 'home.how.step1.title': '계정 생성',
    'home.how.step2.title': 'API 키 생성', 'home.how.step3.title': '모델 호출',
    'home.dev.title': '개발자 친화적', 'home.pricing.title': '투명한 가격',
    'home.pricing.model': '모델', 'home.pricing.category': '카테고리',
    'home.pricing.input': '입력 / 1K 토큰', 'home.pricing.output': '출력 / 1K 토큰',
    'home.pricing.context': '컨텍스트', 'home.pricing.viewAll': '전체 요금 보기',
    'home.faq.title': '자주 묻는 질문', 'home.cta.title': '지금 시작할 준비가 되셨나요?',
    'home.cta.button': '무료 가입', 'pricing.title': '모델 요금', 'pricing.subtitle': '종량제 · 숨은 수수료 없음',
    'pricing.calculator': '요금 계산기', 'pricing.allModels': '전체 모델 요금',
    'pricing.allLabel': '전체', 'pricing.empty': '모델 데이터가 없습니다',
    'pricing.table.model': '모델명', 'pricing.table.vendor': '공급업체',
    'pricing.table.category': '카테고리', 'pricing.table.input': '입력 가격 / 1K 토큰',
    'pricing.table.output': '출력 가격 / 1K 토큰', 'pricing.table.context': '컨텍스트 길이',
    'pricing.faq.title': '과금 안내', 'pricing.calc.title': '요금 계산기',
    'pricing.calc.model': '모델', 'pricing.calc.inputTokens': '입력 토큰',
    'pricing.calc.outputTokens': '출력 토큰', 'pricing.calc.estimate': '예상 비용',
    'blog.title': '블로그 / 뉴스', 'blog.empty': '아직 글이 없습니다',
    'blog.publishedAt': '게시일', 'blog.notFound': '글을 찾을 수 없거나 비공개입니다',
    'help.langSwitcher': '표시 언어를 전환합니다. 번역되지 않은 문구는 영어로 표시됩니다.',
  };
  // 8 语言补全：zh/en（上方）+ 6 语言次要。vi/th/id/fil 用英文占位（待翻译）。
  const EXTRA_LANGS = ['ja-JP', 'ko-KR', 'vi', 'th', 'id', 'fil'] as const;
  const enByKey: Record<string, string> = {};
  for (const [key, lang, value] of I18N) {
    if (lang === 'en') enByKey[key] = value;
  }
  let i18nExtra = 0;
  for (const [key, lang, value] of I18N) {
    if (lang !== 'zh-CN') continue; // 每个 key 只需补一次
    const enFallback = enByKey[key] ?? value;
    for (const extraLang of EXTRA_LANGS) {
      let v: string;
      if (extraLang === 'ja-JP') v = JA_TERMS[key] ?? enFallback; // 未收录 key 回退英文
      else if (extraLang === 'ko-KR') v = KO_TERMS[key] ?? enFallback; // 未收录 key 回退英文
      else v = enFallback; // vi/th/id/fil：英文占位【待翻译】
      await db.insert(schema.i18nEntries)
        .values({ key, lang: extraLang, value: v, scope: 'portal', status: 'active', updatedBy: adminId })
        .onConflictDoUpdate({
          target: [schema.i18nEntries.key, schema.i18nEntries.lang],
          set: { value: v, updatedBy: adminId },
        });
      i18nExtra++;
    }
  }
  console.log(`✅ i18n_entries 8 语言补全 upsert ${i18nExtra} 条（zh/en + ja/ko 术语 + vi/th/id/fil 英文占位）`);

  // ── i18n_entries：console/common scope 种子（P2 控制台关键页 8 语言） ──
  // 数据来源：web-console/src/lib/i18n-manifest.json（P2 前端 key 化产出，en+zh_CN）。
  // scope 归属：common.* → 'common'；console/dashboard/apikey.* → 'console'。
  // 生态：zh-CN / en 来自下方表；ja-JP / ko-KR 用 CONSOLE_JA_TERMS / CONSOLE_KO_TERMS
  //       术语表翻译，未收录 key 回退英文；vi/th/id/fil 复用英文占位【待翻译】。
  // key+lang+scope 幂等 upsert，可安全重跑；与上方 portal 8 语言块同 pattern。
  type ConsoleSeed = [key: string, scope: 'console' | 'common', en: string, zhCN: string];
  const CONSOLE_SEED: ConsoleSeed[] = [
    // ── common（通用）──
    ['common.time', 'common', 'Time', '时间'],
    ['common.model', 'common', 'Model', '模型'],
    ['common.token', 'common', 'Tokens', 'Token'],
    ['common.cost', 'common', 'Cost', '费用'],
    ['common.currency', 'common', 'Amount', '金额'],
    ['common.name', 'common', 'Name', '名称'],
    ['common.copy', 'common', 'Copy', '复制'],
    ['common.enable', 'common', 'Enable', '启用'],
    ['common.disable', 'common', 'Disable', '禁用'],
    ['common.status', 'common', 'Status', '状态'],
    ['common.actions', 'common', 'Actions', '操作'],
    ['common.back', 'common', 'Back', '返回'],
    ['common.optional', 'common', 'Optional', '可选'],
    ['common.cancel', 'common', 'Cancel', '取消'],
    ['common.success', 'common', 'Success', '成功'],
    ['common.failed', 'common', 'Failed', '失败'],
    // ── dashboard（个人仪表盘）──
    ['dashboard.title', 'console', 'Dashboard', '控制台'],
    ['dashboard.help.overview', 'console', 'Overview of your account status.', '总览您的账户状态'],
    ['dashboard.help.overviewDetail', 'console', 'Account overview: balance, spend, call volume and active API keys.', '总览您的账户状态：余额、消费、调用量和活跃 Key。'],
    ['dashboard.balance', 'console', 'Account Balance', '账户余额'],
    ['dashboard.rechargeNow', 'console', 'Recharge now', '立即充值'],
    ['dashboard.monthlyCost', 'console', "This Month's Spend", '本月消费'],
    ['dashboard.viewDetail', 'console', 'View details', '查看明细'],
    ['dashboard.todayCalls', 'console', "Today's Calls", '今日调用'],
    ['dashboard.activeKeys', 'console', 'Active API Keys', '活跃 API Key'],
    ['dashboard.manageKeys', 'console', 'Manage', '管理'],
    ['dashboard.subs.todayCalls', 'console', "Today's Calls", '今日调用次数'],
    ['dashboard.subs.successRate', 'console', 'Success rate {rate}', '成功率 {rate}'],
    ['dashboard.subs.tokenUsage', 'console', 'Token Usage', 'Token 消耗'],
    ['dashboard.subs.todayCost', 'console', "Today's Cost", '消费金额'],
    ['dashboard.subs.balance', 'console', 'Current Balance', '当前余额'],
    ['dashboard.subs.estimatedDays', 'console', 'Est. available {days} days', '预计可用 {days} 天'],
    ['dashboard.trend.title', 'console', 'Model Token Usage Curve', '模型 Token 消耗曲线'],
    ['dashboard.trend.today', 'console', 'Today', '今天'],
    ['dashboard.trend.yesterday', 'console', 'Yesterday', '昨天'],
    ['dashboard.trend.week', 'console', 'This Week', '本周'],
    ['dashboard.trend.lastMonth', 'console', 'Last Month', '上月'],
    ['dashboard.trend.selected', 'console', 'Selected: {range}', '选中：{range}'],
    ['dashboard.trend.missingBackend', 'console', 'Trend chart requires the backend /me/stats/trend endpoint', '趋势图需对接后端 /me/stats/trend 接口'],
    ['dashboard.distribution.title', 'console', 'Model Call Distribution', '模型调用分布'],
    ['dashboard.distribution.recentHour', 'console', 'Last hour', '近 1 小时'],
    ['dashboard.distribution.callsTokens', 'console', '{calls} calls · {tokens} Token', '{calls} 次 · {tokens} Token'],
    ['dashboard.recent.title', 'console', 'Recent Consumption', '最近消费'],
    ['dashboard.recent.viewAll', 'console', 'View all', '查看全部'],
    ['dashboard.quick.recharge', 'console', 'Recharge', '立即充值'],
    ['dashboard.quick.createKey', 'console', 'Create API Key', '创建 API Key'],
    ['dashboard.quick.logs', 'console', 'Consumption Details', '消费明细'],
    ['dashboard.quick.ticket', 'console', 'Submit Ticket', '提交工单'],
    // ── apikey（API Key 管理）──
    ['apikey.title', 'console', 'API Key Management', 'API Key 管理'],
    ['apikey.help.title', 'console', 'Manage API access keys. Supports 3 permission modes and IP allowlists.', '管理 API 调用密钥。支持 3 种权限模式和 IP 白名单'],
    ['apikey.endpoint.title', 'console', 'Access Endpoints', '接入地址'],
    ['apikey.endpoint.configHint', 'console', '(configurable under Admin → System Settings → API Services)', '（后台 系统设置 → API 服务 可配置）'],
    ['apikey.endpoint.chat', 'console', 'Chat endpoints', '聊天端点'],
    ['apikey.new.defaultName', 'console', 'New Key', '新 Key'],
    ['apikey.create.button', 'console', 'Create Key', '创建 Key'],
    ['apikey.create.title', 'console', 'Create API Key', '创建 API Key'],
    ['apikey.help.create', 'console', 'Create a new API access key; you can specify permission mode and expiry.', '创建新的 API 调用密钥，可指定权限模式和过期时间'],
    ['apikey.search.placeholder', 'console', 'Search key name…', '搜索 Key 名称…'],
    ['apikey.created.oneTime', 'console', 'API Key created successfully — shown only once, copy it now', 'API Key 创建成功 — 仅展示一次，请立即复制'],
    ['apikey.copy.key', 'console', 'Copy Key', '复制 Key'],
    ['apikey.empty', 'console', 'No API keys yet. Click "Create Key" to get started.', '暂无 API Key，点击上方「创建 Key」开始'],
    ['apikey.created.success', 'console', 'API Key created', 'API Key 创建成功'],
    ['apikey.deleted.success', 'console', 'API Key deleted', 'API Key 已删除'],
    ['apikey.copied', 'console', 'Copied to clipboard', '已复制到剪贴板'],
    ['apikey.col.name', 'console', 'Name', '名称'],
    ['apikey.col.mode', 'console', 'Permission Mode', '权限模式'],
    ['apikey.col.lastUsed', 'console', 'Last Used', '最后调用'],
    ['apikey.col.todayCalls', 'console', "Today's Calls", '今日调用'],
    ['apikey.mode.vendor', 'console', 'A - Bind Vendor + Models', 'A - 绑定供应商+模型'],
    ['apikey.mode.group', 'console', 'B - Bind Model Group', 'B - 绑定模型分组'],
    ['apikey.mode.unlimited', 'console', 'C - Unlimited', 'C - 无限制'],
    ['apikey.status.expiring', 'console', 'Expiring Soon', '即将过期'],
    ['apikey.delete.confirm', 'console', 'Delete this API key?', '确定要删除该 API Key 吗？'],
    ['apikey.form.name.placeholder', 'console', 'e.g. Production', '例如：生产环境'],
    ['apikey.form.mode', 'console', 'Permission Mode', '权限模式'],
    ['apikey.help.mode', 'console', 'A: Bind vendor + models / B: Bind model group / C: Unlimited', 'A: 绑定供应商+模型 / B: 绑定模型分组 / C: 无限制'],
    ['apikey.form.group', 'console', 'Select Group', '选择分组'],
    ['apikey.form.expiry', 'console', 'Expiry Time', '过期时间'],
    ['apikey.form.ipHint', 'console', '(optional, one per line)', '（可选，一行一个）'],
    ['apikey.form.creating', 'console', 'Creating...', '创建中...'],
    ['apikey.form.confirm', 'console', 'Confirm Create', '确认创建'],
    // ── 补充：customer 控制台导航 / 顶栏 / 公共按钮 / auth / vendor（P2 补齐，根因修复：缺这些 key
    //    会让 menu 无论选哪种语言都回退 EN_DEFAULTS 英文） ──
    ['common.login', 'common', 'Sign in', '登录'],
    ['common.register', 'common', 'Sign up', '注册'],
    ['common.logout', 'common', 'Sign out', '退出登录'],
    ['common.save', 'common', 'Save', '保存'],
    ['common.confirm', 'common', 'Confirm', '确认'],
    ['common.submit', 'common', 'Submit', '提交'],
    ['common.loading', 'common', 'Loading...', '加载中...'],
    ['common.search', 'common', 'Search', '搜索'],
    ['common.reset', 'common', 'Reset', '重置'],
    ['common.add', 'common', 'Add', '新增'],
    ['common.edit', 'common', 'Edit', '编辑'],
    ['common.delete', 'common', 'Delete', '删除'],
    ['common.create', 'common', 'Create', '创建'],
    ['common.account', 'common', 'Account', '账户'],
    ['common.balance', 'common', 'Balance', '余额'],
    ['common.language', 'common', 'Language', '语言'],
    ['common.help', 'common', 'Help', '帮助'],
    ['common.enabled', 'common', 'Enabled', '已启用'],
    ['common.disabled', 'common', 'Disabled', '已禁用'],
    ['common.active', 'common', 'Active', '活跃'],
    ['common.inactive', 'common', 'Inactive', '停用'],
    ['common.pending', 'common', 'Pending', '待处理'],
    ['common.required', 'common', 'Required', '必填'],
    ['common.next', 'common', 'Next', '下一步'],
    ['common.previous', 'common', 'Previous', '上一步'],
    ['common.default', 'common', 'Default', '默认'],
    // ── 导航（console scope；个人控制台 + 商务/财务/代理角色菜单） ──
    ['nav.dashboard', 'console', 'Dashboard', '控制台'],
    ['nav.statistics', 'console', 'Statistics', '数据统计'],
    ['nav.apiKeys', 'console', 'API Keys', 'API Key'],
    ['nav.logs', 'console', 'Logs', '调用日志'],
    ['nav.recharge', 'console', 'Recharge', '充值'],
    ['nav.billing', 'console', 'Billing', '账单'],
    ['nav.invoices', 'console', 'Invoices', '发票'],
    ['nav.playground', 'console', 'API Playground', 'API 调试'],
    ['nav.mjTasks', 'console', 'MJ/Suno Tasks', 'MJ/Suno 任务'],
    ['nav.topupRecords', 'console', 'Top-up Records', '充值记录'],
    ['nav.redemption', 'console', 'Redemption', '兑换码'],
    ['nav.announcements', 'console', 'Announcements', '公告'],
    ['nav.realName', 'console', 'Real-name Verification', '实名认证'],
    ['nav.notification', 'console', 'Notifications', '通知'],
    ['nav.tickets', 'console', 'Tickets', '工单'],
    ['nav.chat', 'console', 'Live Support', '在线客服'],
    ['nav.security', 'console', 'Security', '安全设置'],
    ['nav.dataExport', 'console', 'Data Export', '数据导出'],
    ['nav.userGroups', 'console', 'User Groups', '用户分组'],
    ['nav.vendorSelector', 'console', 'Vendor Selection', '供应商选择'],
    ['nav.accountDeletion', 'console', 'Account Deletion', '账号注销'],
    ['nav.help', 'console', 'Help', '帮助中心'],
    ['nav.settings', 'console', 'Settings', '设置'],
    ['nav.profile', 'console', 'Profile', '个人资料'],
    ['nav.adminCockpit', 'console', 'Data Cockpit', '数据驾驶舱'],
    ['nav.adminDashboard', 'console', 'Operations Dashboard', '运营工作台'],
    ['nav.financeWorkbench', 'console', 'Finance Workbench', '财务工作台'],
    ['nav.salesWorkbench', 'console', 'Sales Workbench', '销售工作台'],
    ['nav.salesCustomers', 'console', 'Customer Management', '客户管理'],
    ['nav.salesReminders', 'console', 'Follow-up Reminders', '跟进提醒'],
    ['nav.salesPerformance', 'console', 'Performance Dashboard', '业绩看板'],
    ['nav.financeTopup', 'console', 'Manual Top-up', '人工上账'],
    ['nav.financeOrders', 'console', 'Recharge Orders', '充值订单'],
    ['nav.financeRefunds', 'console', 'Refund Review', '退款审核'],
    ['nav.financeReconciliation', 'console', 'Reconciliation Report', '对账报表'],
    ['nav.financeCustomers', 'console', 'Customer List', '客户列表'],
    ['nav.agentDashboard', 'console', 'Agent Workbench', '代理工作台'],
    ['nav.agentCommission', 'console', 'Commission Records', '佣金记录'],
    ['nav.agentConsumption', 'console', 'Customer Consumption', '客户消费'],
    ['nav.agentCustomers', 'console', 'My Customers', '我的客户'],
    ['nav.agentInvite', 'console', 'Invite Customers', '邀请客户'],
    ['nav.agentRanking', 'console', 'Performance Ranking', '业绩排行'],
    ['nav.agentWithdraw', 'console', 'Withdrawal Management', '提现管理'],
    ['nav.agentSettings', 'console', 'Agent Settings', '代理设置'],
    ['nav.agentSettlements', 'console', 'Settlement Reconciliation', '结算对账'],
    // ── 顶栏 / 账户菜单 ──
    ['topbar.account', 'console', 'Account', '账户'],
    ['topbar.personalSettings', 'console', 'Personal Settings', '个人设置'],
    ['topbar.changePassword', 'console', 'Change Password', '修改密码'],
    ['topbar.balance', 'console', 'Balance', '余额'],
    ['topbar.notifications', 'console', 'Notifications', '通知'],
    ['topbar.languageSwitcher', 'console', 'Language', '语言'],
    ['topbar.langHelp', 'console', 'Switch the console language; untranslated text falls back to English.', '切换控制台语言，未翻译文本将回退为英文。'],
    ['topbar.roleAdmin', 'console', 'ADMIN', '管理员'],
    // ── 金额 / 账单 ──
    ['billing.balance', 'console', 'Balance', '余额'],
    ['billing.todayCost', 'console', "Today's Cost", '今日消费'],
    ['billing.totalCost', 'console', 'Total Cost', '累计消费'],
    ['billing.rechargeNow', 'console', 'Recharge Now', '立即充值'],
    // ── 登录 / 注册（登录前页面，控制台 scope） ──
    ['auth.pageTitle', 'console', 'Sign in', '登录'],
    ['auth.pageTitle2fa', 'console', 'Two-factor Verification', '双重验证'],
    ['auth.registerTitle', 'console', 'Create Account', '注册账号'],
    ['auth.title', 'console', 'Sign in to your account', '登录您的账户'],
    ['auth.subtitle', 'console', 'Manage your API keys and view usage', '管理您的 API Key 并查看用量'],
    ['auth.email', 'console', 'Email', '邮箱'],
    ['auth.password', 'console', 'Password', '密码'],
    ['auth.forgotPassword', 'console', 'Forgot password?', '忘记密码？'],
    ['auth.captcha', 'console', 'Captcha', '验证码'],
    ['auth.loginButton', 'console', 'Sign in', '登录'],
    ['auth.loggingIn', 'console', 'Signing in...', '登录中...'],
    ['auth.noAccount', 'console', "Don't have an account?", '还没有账号？'],
    ['auth.register', 'console', 'Sign up', '注册'],
    ['auth.registering', 'console', 'Signing up...', '注册中...'],
    ['auth.registerNow', 'console', 'Register now', '立即注册'],
    ['auth.haveAccount', 'console', 'Already have an account?', '已有账号？'],
    ['auth.loginNow', 'console', 'Sign in now', '立即登录'],
    ['auth.orUse', 'console', 'or use', '或使用'],
    ['auth.welcomeBack', 'console', 'Welcome back!', '欢迎回来！'],
    ['auth.otpCode', 'console', 'Authenticator code', '验证器验证码'],
    ['auth.backupCode', 'console', 'Backup recovery code', '备用恢复码'],
    ['auth.verifyAndLogin', 'console', 'Verify & sign in', '验证并登录'],
    ['auth.verifying', 'console', 'Verifying...', '验证中...'],
    ['auth.backToLogin', 'console', 'Back to password login', '返回密码登录'],
    ['auth.2faHint', 'console', 'This account has two-factor authentication enabled. Enter your authenticator code or backup recovery code to finish signing in.', '该账号已开启双重验证，请输入验证器验证码或备用恢复码以完成登录。'],
    ['auth.loginHelp', 'console', 'Sign in to your account to manage API keys and view usage records.', '登录您的账户，管理 API Key 并查看用量记录。'],
    ['auth.emailHelp', 'console', 'Enter the email address you registered with.', '输入您注册时使用的邮箱地址。'],
    ['auth.passwordHelp', 'console', 'Enter your login password.', '输入您的登录密码。'],
    ['auth.registerHelp', 'console', 'Register to start using the 3Cloud API Token service.', '注册开始使用 3Cloud API Token 服务。'],
    ['auth.emailPlaceholder', 'console', 'your@email.com', 'your@email.com'],
    ['auth.passwordPlaceholder', 'console', 'Enter your password', '请输入密码'],
    ['auth.captchaPlaceholder', 'console', 'Enter captcha', '请输入验证码'],
    ['auth.sessionSuccess', 'console', 'Signed in successfully', '登录成功'],
    ['auth.2faEnabledToast', 'console', 'This account has two-factor authentication enabled. Please enter the verification code to finish signing in.', '该账号已开启双重验证，请输入验证码完成登录。'],
    ['auth.invalidResponse', 'console', 'Unexpected login response, please try again later.', '登录响应异常，请稍后重试。'],
    ['auth.socialComingSoon', 'console', '{provider} sign-in is coming soon', '{provider} 登录即将上线'],
    ['auth.registerSuccessTitle', 'console', 'Registration Succeeded!', '注册成功！'],
    ['auth.activationSent', 'console', 'Activation link sent to', '激活链接已发送至'],
    ['auth.openEmailToActivate', 'console', 'Please open the email and click the link to activate your account. The link validity is configured by the platform.', '请打开邮件并点击链接激活您的账号，链接有效期由平台配置。'],
    ['auth.goToLogin', 'console', 'Go to sign in', '去登录'],
    ['auth.emailRequired', 'console', 'Password must be at least 8 characters containing letters, numbers and special characters', '密码至少 8 位，需包含字母、数字和特殊字符'],
    ['auth.passwordMismatch', 'console', 'Passwords do not match', '两次输入的密码不一致'],
    ['auth.passwordStrength', 'console', 'Password strength:', '密码强度：'],
    ['auth.strengthNotEntered', 'console', 'Not entered', '未输入'],
    ['auth.strengthTooWeak', 'console', 'Weak — increase complexity', '弱 — 请增加复杂度'],
    ['auth.strengthMedium', 'console', 'Medium — acceptable', '中等 — 可接受'],
    ['auth.strengthStronger', 'console', 'Strong — recommended', '强 — 推荐'],
    ['auth.strengthStrong', 'console', 'Strong — very secure', '非常强 — 很安全'],
    ['auth.confirmPassword', 'console', 'Confirm password', '确认密码'],
    ['auth.inviteCode', 'console', 'Invite code (optional)', '邀请码（可选）'],
    ['auth.orUseEmail', 'console', 'Email', '邮箱'],
    // ── 供应商 Vendor 自助端 ──
    ['vendor.title', 'console', 'Vendor Self-service Platform', '供应商自助平台'],
    ['vendor.subtitle', 'console', 'Sign in to manage your models, statistics and settlements', '登录以管理您的模型、统计与结算'],
    ['vendor.loginButton', 'console', 'Sign in', '登录'],
    ['vendor.loggingIn', 'console', 'Signing in...', '登录中...'],
    ['vendor.emailLabel', 'console', 'Contact email', '联系邮箱'],
    ['vendor.emailPlaceholder', 'console', 'Vendor registered email', '供应商注册邮箱'],
    ['vendor.passwordLabel', 'console', 'Password', '密码'],
    ['vendor.passwordPlaceholder', 'console', 'Password (at least 8 characters)', '密码（至少 8 位）'],
    ['vendor.noAccount', 'console', "Don't have a vendor account?", '还没有供应商账号？'],
    ['vendor.applyOnboard', 'console', 'Apply for onboarding', '申请入驻'],
    ['vendor.registerTitle', 'console', 'Vendor Onboarding Application', '供应商入驻申请'],
    ['vendor.registerSubtitle', 'console', 'Submit the required information; once approved you can integrate with the platform', '提交所需资料，审核通过后即可对接平台'],
    ['vendor.submitApplication', 'console', 'Submit onboarding application', '提交入驻申请'],
    ['vendor.submitting', 'console', 'Submitting...', '提交中...'],
    ['vendor.basicInfo', 'console', 'Basic Information', '基本信息'],
    ['vendor.apiInfo', 'console', 'API Integration Information', 'API 对接信息'],
    ['vendor.goToLogin', 'console', 'Back to sign in', '返回登录'],
    ['vendor.reviewMessage', 'console', 'The platform will review your application within 1-3 business days. Once approved, sign in with your registered email.', '平台将在 1-3 个工作日内审核您的申请，审核通过后请使用注册邮箱登录。'],
    ['vendor.errorSubmit', 'console', 'Failed to submit. Please try again.', '提交失败，请重试。'],
  ];

  // console/common 关键高频词 ja/ko 术语表；未收录 key 回退英文。
  const CONSOLE_JA_TERMS: Record<string, string> = {
    'common.time': '時刻', 'common.model': 'モデル', 'common.token': 'トークン', 'common.cost': '費用',
    'common.currency': '金額', 'common.name': '名前', 'common.copy': 'コピー', 'common.enable': '有効化',
    'common.disable': '無効化', 'common.status': 'ステータス', 'common.actions': '操作', 'common.back': '戻る',
    'common.optional': '任意', 'common.cancel': 'キャンセル', 'common.success': '成功', 'common.failed': '失敗',
    'dashboard.title': 'ダッシュボード', 'dashboard.balance': 'アカウント残高', 'dashboard.rechargeNow': '今すぐチャージ',
    'dashboard.monthlyCost': '今月の利用額', 'dashboard.viewDetail': '明細を見る', 'dashboard.todayCalls': '本日の呼び出し',
    'dashboard.activeKeys': '有効な API キー', 'dashboard.manageKeys': '管理', 'dashboard.trend.today': '今日',
    'dashboard.trend.yesterday': '昨日', 'dashboard.trend.week': '今週', 'dashboard.trend.lastMonth': '先月',
    'dashboard.trend.title': 'モデルトークン消費曲線', 'dashboard.quick.recharge': 'チャージ', 'dashboard.quick.createKey': 'API キー作成',
    'apikey.title': 'API キー管理', 'apikey.create.button': 'キー作成', 'apikey.create.title': 'API キーを作成',
    'apikey.col.name': '名前', 'apikey.col.mode': '権限モード', 'apikey.col.lastUsed': '最終利用', 'apikey.col.todayCalls': '本日の呼び出し',
    'apikey.form.mode': '権限モード', 'apikey.form.group': 'グループを選択', 'apikey.form.expiry': '有効期限',
    'apikey.form.creating': '作成中...', 'apikey.form.confirm': '作成確認', 'apikey.copy.key': 'キーをコピー',
    'apikey.created.success': 'API キーを作成しました', 'apikey.deleted.success': 'API キーを削除しました', 'apikey.copied': 'クリップボードにコピーしました',
  };
  const CONSOLE_KO_TERMS: Record<string, string> = {
    'common.time': '시간', 'common.model': '모델', 'common.token': '토큰', 'common.cost': '비용',
    'common.currency': '금액', 'common.name': '이름', 'common.copy': '복사', 'common.enable': '활성화',
    'common.disable': '비활성화', 'common.status': '상태', 'common.actions': '작업', 'common.back': '뒤로',
    'common.optional': '선택 사항', 'common.cancel': '취소', 'common.success': '성공', 'common.failed': '실패',
    'dashboard.title': '대시보드', 'dashboard.balance': '계정 잔액', 'dashboard.rechargeNow': '충전하기',
    'dashboard.monthlyCost': '이번 달 소비', 'dashboard.viewDetail': '내역 보기', 'dashboard.todayCalls': '오늘 호출',
    'dashboard.activeKeys': '활성 API 키', 'dashboard.manageKeys': '관리', 'dashboard.trend.today': '오늘',
    'dashboard.trend.yesterday': '어제', 'dashboard.trend.week': '이번 주', 'dashboard.trend.lastMonth': '지난달',
    'dashboard.trend.title': '모델 토큰 소비 곡선', 'dashboard.quick.recharge': '충전', 'dashboard.quick.createKey': 'API 키 생성',
    'apikey.title': 'API 키 관리', 'apikey.create.button': '키 생성', 'apikey.create.title': 'API 키 만들기',
    'apikey.col.name': '이름', 'apikey.col.mode': '권한 모드', 'apikey.col.lastUsed': '마지막 사용', 'apikey.col.todayCalls': '오늘 호출',
    'apikey.form.mode': '권한 모드', 'apikey.form.group': '그룹 선택', 'apikey.form.expiry': '만료일',
    'apikey.form.creating': '생성 중...', 'apikey.form.confirm': '생성 확인', 'apikey.copy.key': '키 복사',
    'apikey.created.success': 'API 키를 만들었습니다', 'apikey.deleted.success': 'API 키를 삭제했습니다', 'apikey.copied': '클립보드에 복사했습니다',
  };
  const CONSOLE_EXTRA_LANGS = ['ja-JP', 'ko-KR', 'vi', 'th', 'id', 'fil'] as const;
  let i18nConsole = 0;
  for (const [key, scope, en, zhCN] of CONSOLE_SEED) {
    const pairs: Array<[lang: string, value: string]> = [
      ['zh-CN', zhCN], ['en', en],
    ];
    for (const extraLang of CONSOLE_EXTRA_LANGS) {
      let v: string;
      if (extraLang === 'ja-JP') v = CONSOLE_JA_TERMS[key] ?? en; // 未收录回退英文
      else if (extraLang === 'ko-KR') v = CONSOLE_KO_TERMS[key] ?? en; // 未收录回退英文
      else v = en; // vi/th/id/fil：英文占位【待翻译】
      pairs.push([extraLang, v]);
    }
    for (const [lang, value] of pairs) {
      await db.insert(schema.i18nEntries)
        .values({ key, lang, value, scope, status: 'active', updatedBy: adminId })
        .onConflictDoUpdate({
          target: [schema.i18nEntries.key, schema.i18nEntries.lang],
          set: { value, updatedBy: adminId },
        });
      i18nConsole++;
    }
  }
  console.log(`✅ i18n_entries console/common 8 语言种子 upsert ${i18nConsole} 条（scope=${CONSOLE_SEED.length} keys × 8 lang）`);

  // ── webhook_retry_config：默认回调重试策略（幂等，按 webhook_url 去重）──
  const [whExists] = await db
    .select({ id: schema.webhookRetryConfigs.id }).from(schema.webhookRetryConfigs)
    .where(eq(schema.webhookRetryConfigs.webhookUrl, 'https://api.3cloud.local/callback')).limit(1);
  if (!whExists) {
    await db.insert(schema.webhookRetryConfigs).values({
      name: '默认回调', webhookUrl: 'https://api.3cloud.local/callback',
      maxRetries: 3, retryDelaySeconds: 60, backoffMultiplier: 2, enabled: 'true',
    });
    console.log('✅ webhook_retry_config 默认回调策略已创建');
  }

  // ── user_groups：默认分组（新注册用户自动归属；幂等，按 name 去重）──
  const [defaultGroup] = await db
    .select({ id: schema.userGroups.id }).from(schema.userGroups)
    .where(eq(schema.userGroups.name, 'default')).limit(1);
  if (!defaultGroup) {
    await db.insert(schema.userGroups).values({
      name: 'default',
      description: '默认分组（新注册用户自动归属）',
      pricingGroup: 'default',
      modelWhitelist: [],
      isDefault: true,
      status: 'active',
    });
    console.log('✅ user_groups 默认分组已创建');
  } else {
    console.log('✅ user_groups 默认分组已存在，跳过');
  }

  // ── model_rate_limits：5 个原型模型（硬顶 + 按次计费覆盖） ──
  const MODELS = [
    { modelName: 'gpt-4o', vendor: 'OpenAI', capRpm: 3000, capTpm: 10_000_000, baseRpm: 300, baseTpm: 1_000_000 },
    { modelName: 'gpt-4o-mini', vendor: 'OpenAI', capRpm: 6000, capTpm: 20_000_000, baseRpm: 300, baseTpm: 1_000_000 },
    { modelName: 'claude-sonnet-4.5', vendor: 'Anthropic', capRpm: 3000, capTpm: 10_000_000, baseRpm: 300, baseTpm: 1_000_000 },
    { modelName: 'deepseek-chat', vendor: 'DeepSeek', capRpm: 2000, capTpm: 10_000_000, baseRpm: 60, baseTpm: 200_000 },
    { modelName: 'midjourney-v6', vendor: 'Midjourney', capRpm: 60, capTpm: null, baseRpm: 60, baseTpm: null },
  ] as const;
  for (const m of MODELS) {
    await db.insert(schema.modelRateLimits)
      .values({ ...m, updatedBy: adminId })
      .onConflictDoNothing({ target: schema.modelRateLimits.modelName });
  }
  console.log(`✅ model_rate_limits ${MODELS.length} 个模型`);

  /* ── 演示客户（客户列表页 + 额度管理 + 实名认证） ── */
  // 企业合同客户（含余额）→ 客户列表「正常」、额度页可设置例外
  const corp1 = await ensureUser({ email: 'corp1@demo.cn', name: '星辰数智科技', customerType: 'enterprise', isContract: true, realNameStatus: 'approved', balance: '50000' });
  await ensureUser({ email: 'dev1@demo.cn', name: '陈晨', customerType: 'personal', realNameStatus: 'approved', balance: '500' });   // 余额不足
  await ensureUser({ email: 'dev2@demo.cn', name: '林小', customerType: 'personal', realNameStatus: 'approved', balance: '120000' }); // 正常
  // 演示登录账号（未认证，可在门户提交实名 → 管理员队列出现）
  await ensureUser({ email: 'demo@3cloud.dev', name: '演示用户', customerType: 'personal', balance: '1000' });

  // ── 额度例外（corp1 × 2 模型）+ 历史（逐条幂等，避免部分失败后缺失） ──
  const RULES: Array<Record<string, unknown>> = [
    {
      modelName: 'gpt-4o', rpm: 500, tpm: null, period: 'forever', startDate: null, endDate: null,
      reason: '重点企业客户，申请提升 RPM', op: '开通', afterRpm: 500, afterTpm: null, note: '重点企业客户，申请提升 RPM',
    },
    {
      modelName: 'claude-sonnet-4.5', rpm: 800, tpm: 3_000_000, period: 'range',
      startDate: '2026-07-01', endDate: '2026-12-31',
      reason: '活动期临时提升', op: '开通', afterRpm: 800, afterTpm: 3_000_000, note: '活动期临时提升',
    },
  ];
  let rulesCreated = 0;
  for (const r of RULES) {
    const [exists] = await db
      .select({ id: schema.quotaExceptionRules.id }).from(schema.quotaExceptionRules)
      .where(and(eq(schema.quotaExceptionRules.customerId, corp1), eq(schema.quotaExceptionRules.modelName, r.modelName as string)));
    if (exists) continue;
    const [rule] = await db.insert(schema.quotaExceptionRules).values({
      customerId: corp1,
      modelName: r.modelName as string,
      rpm: r.rpm as number,
      tpm: r.tpm as number | null,
      period: r.period as 'forever' | 'range',
      startDate: r.startDate as string | null,
      endDate: r.endDate as string | null,
      status: 'active',
      reason: r.reason as string,
      createdBy: adminId,
    }).returning({ id: schema.quotaExceptionRules.id });
    await db.insert(schema.quotaExceptionHistory).values({
      ruleId: rule!.id, op: r.op as string, operatorId: adminId,
      beforeRpm: null, beforeTpm: null,
      afterRpm: r.afterRpm as number | null, afterTpm: r.afterTpm as number | null,
      note: r.note as string,
    });
    rulesCreated++;
  }
  if (rulesCreated > 0) console.log(`✅ 额度例外规则新增 ${rulesCreated} 条（客户 #${corp1}）`);

  /* ── 实名认证演示数据 ── */
  const now = new Date();
  const daysAgo = (d: number, h = 0) => new Date(now.getTime() - d * 86400_000 - h * 3600_000);

  /** 插入实名提交记录（userId 已存在则跳过） */
  async function ensureRealNameRecord(data: {
    userId: number; type: 'individual' | 'enterprise'; realName: string; idNumber: string;
    legalPerson?: string; companyAddress?: string; status: string; sim?: number;
    risk?: unknown; ocr?: Record<string, string>; createdAt: Date; approvedVia?: 'submit' | 'admin';
    directNote?: string; rejectReason?: string; reviewedAt?: Date;
  }) {
    const [exists] = await db
      .select({ id: schema.realNameRecords.id }).from(schema.realNameRecords)
      .where(eq(schema.realNameRecords.userId, data.userId));
    if (exists) return;
    await db.insert(schema.realNameRecords).values({
      userId: data.userId, type: data.type, realName: data.realName, idNumber: data.idNumber,
      legalPerson: data.legalPerson ?? null, companyAddress: data.companyAddress ?? null,
      status: data.status, simScore: data.sim != null ? String(data.sim).slice(0, 5) : null,
      risk: (data.risk as any) ?? [], ocrFields: (data.ocr as any) ?? null,
      images: [
        { id: 'front', type: '身份证 · 正面', url: '', masked: true },
        { id: 'back', type: '身份证 · 反面', url: '', masked: true },
      ],
      approvedVia: data.approvedVia ?? null, directNote: data.directNote ?? null,
      rejectReason: data.rejectReason ?? null, reviewerId: data.reviewedAt ? adminId : null,
      reviewedAt: data.reviewedAt ?? null, createdAt: data.createdAt,
    });
  }

  // 待审核（个人 ×3，含 1 单超 72h）
  const p1 = await ensureUser({ email: 'zhang3@example.com', name: '张三', customerType: 'personal', realNameStatus: 'pending_review', balance: '100' });
  await ensureRealNameRecord({
    userId: p1, type: 'individual', realName: '张三', idNumber: '110101199001011234',
    status: 'pending_review', sim: 0.96, createdAt: daysAgo(0, 5),
    ocr: { name: '张三', id_number: '110101199001011234', address: '北京市朝阳区示例路 88 号', birth_date: '1990-01-01' },
  });
  const p2 = await ensureUser({ email: 'li4@example.com', name: '李四', customerType: 'personal', realNameStatus: 'pending_review', balance: '200' });
  await ensureRealNameRecord({
    userId: p2, type: 'individual', realName: '李四', idNumber: '310101199506120018',
    status: 'pending_review', sim: 0.92, createdAt: daysAgo(0, 8),
    risk: ['该证件号已关联 2 个账户', '近 30 天该证件被驳回 1 次'],
    ocr: { name: '李四', id_number: '310101199506120018', birth_date: '1995-06-11', address: '上海市黄浦区示例路 2 号' },
  });
  const p3 = await ensureUser({ email: 'wang5@example.com', name: '王五', customerType: 'personal', realNameStatus: 'pending_review', balance: '300' });
  await ensureRealNameRecord({
    userId: p3, type: 'individual', realName: '王五', idNumber: '510104199211072714',
    status: 'pending_review', sim: 0.61, createdAt: daysAgo(3, 2),
    risk: ['人脸照与证件照相似度仅 61%，请重点核对'],
    ocr: { name: '王五', id_number: '510104199211072714', address: '成都市锦江区示例路 6 号' },
  });

  // 待审核（企业 ×1）
  const e1 = await ensureUser({ email: 'xingchen@corp-example.cn', name: '星辰科技有限公司', customerType: 'enterprise', isContract: true, realNameStatus: 'pending_review', balance: '80000' });
  await ensureRealNameRecord({
    userId: e1, type: 'enterprise', realName: '星辰科技有限公司', idNumber: '91110101MA01XXX0',
    legalPerson: '刘伟', companyAddress: '北京市海淀区示例路 12 号院 3 号楼',
    status: 'pending_review', sim: 0.88, createdAt: daysAgo(0, 3),
    ocr: { company_name: '星辰科技有限公司', credit_code: '91110101MA01XXX0', legal_person: '刘伟', company_address: '北京市海淀区示例路 12 号院 3 号楼' },
  });

  // 未认证（注册未提交）×4
  await ensureUser({ email: 'ops@nanjing-ai.cn', name: '南京智造科技', customerType: 'enterprise', isContract: true, realNameStatus: 'unverified', balance: '60000' }); // 合同客户
  const u1 = await ensureUser({ email: 'user13@example.com', name: '吴十', customerType: 'personal', realNameStatus: 'unverified', balance: '0' }); // 有 KEY
  await db.insert(schema.apiKeys).values({
    userId: u1, keyHash: `demo_key_${u1}`, keyPrefix: 'sk-demo1', name: '默认密钥', status: 'active', rateLimitPerMinute: 60,
  }).onConflictDoNothing({ target: schema.apiKeys.keyHash });
  const u2 = await ensureUser({ email: 'newbie@example.com', name: '郑十一', customerType: 'personal', realNameStatus: 'unverified', balance: '0' }); // 曾调用
  // ⚠️ P3-1 分区改造（migration 0025）：request_id 唯一约束改为复合 (request_id, created_at)
  // → ON CONFLICT 目标同步为两列，且 createdAt 固定以便重跑幂等（否则每次 now() 不同会插入重复）
  await db.insert(schema.consumptionRecords).values({
    userId: u2, requestId: `req_demo_${u2}`, model: 'gpt-4o', inputTokens: 1200, outputTokens: 300, totalTokens: 1500, cost: '0.015', errorCode: 'not_verified',
    createdAt: new Date('2026-08-01T00:00:00Z'),
  }).onConflictDoNothing({ target: [schema.consumptionRecords.requestId, schema.consumptionRecords.createdAt] });
  const u3 = await ensureUser({ email: 'hello@toy-project.cn', name: '冯十二', customerType: 'personal', realNameStatus: 'unverified', balance: '0' }); // 仅注册
  const [hasInvite] = await db
    .select({ id: schema.realNameInvites.id }).from(schema.realNameInvites)
    .where(sql`${schema.realNameInvites.userId} = ${u3} AND ${schema.realNameInvites.channel} = 'email'`);
  if (!hasInvite) {
    await db.insert(schema.realNameInvites).values({ userId: u3, channel: 'email', sentBy: adminId });
  }

  // 已通过 ×3
  const a1 = await ensureUser({ email: 'user7@example.com', name: '钱七', customerType: 'personal', realNameStatus: 'approved', balance: '5000' });
  await ensureRealNameRecord({
    userId: a1, type: 'individual', realName: '钱七', idNumber: '320102199309201019',
    status: 'approved', sim: 0.95, createdAt: daysAgo(1, 2), approvedVia: 'submit', reviewedAt: daysAgo(1, 1, ),
    ocr: { name: '钱七', id_number: '320102199309201019' },
  });
  const a2 = await ensureUser({ email: 'galaxy-ai@corp-example.cn', name: '银河智能科技', customerType: 'enterprise', realNameStatus: 'approved', balance: '90000' });
  await ensureRealNameRecord({
    userId: a2, type: 'enterprise', realName: '银河智能科技', idNumber: '91110105MA01BBB2W',
    legalPerson: '周涛', companyAddress: '北京市朝阳区示例街 21 号', status: 'approved', sim: 0.9, createdAt: daysAgo(1, 4),
    approvedVia: 'submit', reviewedAt: daysAgo(1, 3),
    ocr: { company_name: '银河智能科技', credit_code: '91110105MA01BBB2W', legal_person: '周涛' },
  });
  const a3 = await ensureUser({ email: 'huarui@corp-example.cn', name: '华睿软件（深圳）', customerType: 'enterprise', realNameStatus: 'approved', balance: '40000' });
  await ensureRealNameRecord({
    userId: a3, type: 'enterprise', realName: '华睿软件（深圳）', idNumber: '91440300MA01FFF8W',
    legalPerson: '林芳', companyAddress: '深圳市南山区示例路 3 号', status: 'approved', sim: 0.87, createdAt: daysAgo(3, 2),
    approvedVia: 'admin', directNote: '合同 3CL-2026-0315', reviewedAt: daysAgo(3, 1),
    ocr: { company_name: '华睿软件（深圳）', credit_code: '91440300MA01FFF8W', legal_person: '林芳' },
  });

  // 已驳回 ×2
  const r1u = await ensureUser({ email: 'zhoujiu@example.com', name: '周九', customerType: 'personal', realNameStatus: 'rejected', balance: '50' });
  await ensureRealNameRecord({
    userId: r1u, type: 'individual', realName: '周九', idNumber: '500103199807024466',
    status: 'rejected', sim: 0.88, createdAt: daysAgo(0, 6), approvedVia: 'submit', rejectReason: '证件照片不清晰', reviewedAt: daysAgo(0, 5),
    ocr: { name: '周九', id_number: '500103199807024466' },
  });
  const r2u = await ensureUser({ email: 'weiguang@corp-example.cn', name: '微光科技（上海）', customerType: 'enterprise', realNameStatus: 'rejected', balance: '20000' });
  await ensureRealNameRecord({
    userId: r2u, type: 'enterprise', realName: '微光科技（上海）', idNumber: '91310115MA01CCC4T',
    legalPerson: '何琳', companyAddress: '上海市浦东新区示例路 9 号', status: 'rejected', sim: 0.85, createdAt: daysAgo(2, 2),
    approvedVia: 'submit', rejectReason: '营业执照已过期', reviewedAt: daysAgo(2, 1),
    ocr: { company_name: '微光科技（上海）', credit_code: '91310115MA01CCC4T' },
  });

  console.log(`✅ 实名认证演示数据：待审核 4 · 未认证 4 · 已通过 3 · 已驳回 2`);

  console.log('\n✅ seed 完成');
  process.exit(0);
}

main().catch((e) => {
  console.error('seed 失败:', e);
  process.exit(1);
});
