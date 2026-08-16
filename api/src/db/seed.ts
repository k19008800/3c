/**
 * 3cloud v3 Seed — 初始化超级管理员 + 演示数据（客户/额度/实名认证/限流配置）
 * 用法: pnpm --filter @3cloud/api db:seed
 * 幂等：重复执行会跳过已存在项 / 更新密码
 */
import bcrypt from 'bcryptjs';
import { sql, eq, and } from 'drizzle-orm';
import { db, schema } from '.';

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
  await db.insert(schema.consumptionRecords).values({
    userId: u2, requestId: `req_demo_${u2}`, model: 'gpt-4o', inputTokens: 1200, outputTokens: 300, totalTokens: 1500, cost: '0.015', errorCode: 'not_verified',
  }).onConflictDoNothing({ target: schema.consumptionRecords.requestId });
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
