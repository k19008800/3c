import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index";
import { ssoConfigs, enterpriseOAuthConfigs } from "../db/schema/sso";

interface SSOConfigBody {
  provider?: string;
  label?: string;
  config?: string;
  forcedDomains?: string;
  defaultRole?: string;
  isEnabled?: boolean;
}

interface EnterpriseOAuthBody {
  platform?: string;
  label?: string;
  config?: string;
  autoCreateUser?: boolean;
  defaultRole?: string;
  syncContacts?: boolean;
  isEnabled?: boolean;
}

/**
 * §32.2 SSO 单点登录 + §32.3 企业通讯录 OAuth
 * 对齐 docs/ref-32-sso-integration.md
 */
export function ssoRoutes(app: FastifyInstance) {
  // ========== §32.2 SSO ==========

  app.get("/admin/sso/configs", async () => {
    const list = await db.select().from(ssoConfigs).orderBy(desc(ssoConfigs.createdAt));
    return { data: { list } };
  });

  app.get<{ Params: { provider: string } }>("/admin/sso/configs/:provider", async (req, rep) => {
    const row = await db.select().from(ssoConfigs).where(eq(ssoConfigs.provider, req.params.provider)).then((r) => r[0]);
    if (!row) return rep.status(404).send({ error: "SSO config not found" });
    return { data: row };
  });

  app.post<{ Body: SSOConfigBody }>("/admin/sso/configs", async (req, rep) => {
    const { provider, label, config, forcedDomains, defaultRole, isEnabled } = req.body;
    if (!provider || !config) return rep.status(400).send({ error: "provider, config 必填" });
    const [row] = await db
      .insert(ssoConfigs)
      .values({
        provider: provider!,
        label: label ?? "SSO",
        config,
        forcedDomains: forcedDomains ?? null,
        defaultRole: defaultRole ?? null,
        isEnabled: isEnabled ?? false,
        createdBy: (req as any).user?.id,
      })
      .returning();
    return { data: row };
  });

  app.put<{ Params: { provider: string }; Body: SSOConfigBody }>("/admin/sso/configs/:provider", async (req, rep) => {
    const existing = await db.select().from(ssoConfigs).where(eq(ssoConfigs.provider, req.params.provider)).then((r) => r[0]);
    if (!existing) return rep.status(404).send({ error: "SSO config not found" });
    const { label, config, forcedDomains, defaultRole, isEnabled } = req.body;
    const [row] = await db
      .update(ssoConfigs)
      .set({
        ...(label !== undefined && { label }),
        ...(config !== undefined && { config }),
        ...(forcedDomains !== undefined && { forcedDomains }),
        ...(defaultRole !== undefined && { defaultRole }),
        ...(isEnabled !== undefined && { isEnabled }),
        updatedAt: new Date(),
      })
      .where(eq(ssoConfigs.provider, req.params.provider))
      .returning();
    return { data: row };
  });

  app.delete<{ Params: { provider: string } }>("/admin/sso/configs/:provider", async (req, rep) => {
    const [row] = await db.delete(ssoConfigs).where(eq(ssoConfigs.provider, req.params.provider)).returning();
    if (!row) return rep.status(404).send({ error: "SSO config not found" });
    return { data: row };
  });

  app.put<{ Params: { provider: string }; Body: { isEnabled: boolean } }>("/admin/sso/configs/:provider/toggle", async (req, rep) => {
    const [row] = await db
      .update(ssoConfigs)
      .set({ isEnabled: req.body.isEnabled, updatedAt: new Date() })
      .where(eq(ssoConfigs.provider, req.params.provider))
      .returning();
    if (!row) return rep.status(404).send({ error: "SSO config not found" });
    return { data: row };
  });

  // ========== §32.3 企业通讯录 OAuth ==========

  app.get("/admin/enterprise-oauth", async () => {
    const list = await db.select().from(enterpriseOAuthConfigs).orderBy(desc(enterpriseOAuthConfigs.createdAt));
    return { data: { list } };
  });

  app.get<{ Params: { platform: string } }>("/admin/enterprise-oauth/:platform", async (req, rep) => {
    const row = await db.select().from(enterpriseOAuthConfigs).where(eq(enterpriseOAuthConfigs.platform, req.params.platform)).then((r) => r[0]);
    if (!row) return rep.status(404).send({ error: "Enterprise OAuth config not found" });
    return { data: row };
  });

  app.post<{ Body: EnterpriseOAuthBody }>("/admin/enterprise-oauth", async (req, rep) => {
    const { platform, label, config, autoCreateUser, defaultRole, syncContacts, isEnabled } = req.body;
    if (!platform || !config) return rep.status(400).send({ error: "platform, config 必填" });
    const [row] = await db
      .insert(enterpriseOAuthConfigs)
      .values({
        platform: platform!,
        label: label ?? null,
        config,
        autoCreateUser: autoCreateUser ?? true,
        defaultRole: defaultRole ?? null,
        syncContacts: syncContacts ?? false,
        isEnabled: isEnabled ?? false,
        createdBy: (req as any).user?.id,
      })
      .returning();
    return { data: row };
  });

  app.put<{ Params: { platform: string }; Body: EnterpriseOAuthBody }>("/admin/enterprise-oauth/:platform", async (req, rep) => {
    const existing = await db.select().from(enterpriseOAuthConfigs).where(eq(enterpriseOAuthConfigs.platform, req.params.platform)).then((r) => r[0]);
    if (!existing) return rep.status(404).send({ error: "Enterprise OAuth config not found" });
    const { label, config, autoCreateUser, defaultRole, syncContacts, isEnabled } = req.body;
    const [row] = await db
      .update(enterpriseOAuthConfigs)
      .set({
        ...(label !== undefined && { label }),
        ...(config !== undefined && { config }),
        ...(autoCreateUser !== undefined && { autoCreateUser }),
        ...(defaultRole !== undefined && { defaultRole }),
        ...(syncContacts !== undefined && { syncContacts }),
        ...(isEnabled !== undefined && { isEnabled }),
        updatedAt: new Date(),
      })
      .where(eq(enterpriseOAuthConfigs.platform, req.params.platform))
      .returning();
    return { data: row };
  });

  app.delete<{ Params: { platform: string } }>("/admin/enterprise-oauth/:platform", async (req, rep) => {
    const [row] = await db.delete(enterpriseOAuthConfigs).where(eq(enterpriseOAuthConfigs.platform, req.params.platform)).returning();
    if (!row) return rep.status(404).send({ error: "Enterprise OAuth config not found" });
    return { data: row };
  });

  app.put<{ Params: { platform: string }; Body: { isEnabled: boolean } }>("/admin/enterprise-oauth/:platform/toggle", async (req, rep) => {
    const [row] = await db
      .update(enterpriseOAuthConfigs)
      .set({ isEnabled: req.body.isEnabled, updatedAt: new Date() })
      .where(eq(enterpriseOAuthConfigs.platform, req.params.platform))
      .returning();
    if (!row) return rep.status(404).send({ error: "Enterprise OAuth config not found" });
    return { data: row };
  });
}
