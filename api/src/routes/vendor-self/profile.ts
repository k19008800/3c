// ============================================================

//  3cloud (3C) —供应商资料管理路由//  POST   /api/vendor/register     —供应商注册（公开）//  POST   /api/vendor/login        —供应商登录（公开）//  GET    /api/vendor/me           —查看自己信息

//  PUT    /api/vendor/me           —更新信息

//  PUT    /api/vendor/password     —修改/设置密码

//  GET    /api/vendor/profile      —获取供应商信息（JWT）//  PUT    /api/vendor/profile      —更新供应商信息（JWT）//  GET    /api/vendor/api-keys     —获取 API Key 列表（JWT）// ============================================================



import { FastifyInstance } from "fastify";

import { eq, and, desc } from "drizzle-orm";

import bcrypt from "bcryptjs";

import { getDb } from "../../db/index.js";

import {

  vendors,

  vendorApiKeys,

} from "../../db/schema.js";

import { generateTokens } from "../../services/auth-service/index.js";

import "./types.js";



// ── 公共路由（不需要鉴权）──



export async function publicVendorRoutes(app: FastifyInstance) {

  const db = getDb();



  // ──────────────────────────────────────────────

  //  POST /api/vendor/register —供应商注册  // ──────────────────────────────────────────────

  app.post("/api/vendor/register", async (request, reply) => {

    const body = request.body as any;

    const { name, baseUrl, description, companyName, contactName, contactPhone, contactEmail, email, password } = body || {};



    if (!name || !baseUrl) {

      reply.status(400).send({ code: 400, data: null, message: "name 和baseUrl 必填" });

      return;

    }



    if (email && !password) {

      reply.status(400).send({ code: 400, data: null, message: "提供 email 时必须同时提供password" });

      return;

    }



    try {

      if (email) {

        const [existing] = await db

          .select({ id: vendors.id })

          .from(vendors)

          .where(eq(vendors.email, email.toLowerCase()))

          .limit(1);

        if (existing) {

          reply.status(409).send({ code: 409, data: null, message: "该邮箱已被其他供应商使用" });

          return;

        }

      }



      const values: any = {

        name,

        baseUrl,

        description,

        status: "pending",

        companyName,

        contactName,

        contactPhone,

        contactEmail,

      };



      if (email) {

        values.email = email.toLowerCase();

        values.passwordHash = await bcrypt.hash(password, 10);

      }



      const [vendor] = await db

        .insert(vendors)

        .values(values)

        .returning();



      reply.status(200).send({

        code: 0,

        data: { id: vendor.id, name: vendor.name, status: "pending" },

        message: "注册成功，请等待管理员审核"

      });

    } catch (err: any) {

      if (err?.code === "23505") {

        reply.status(409).send({ code: 409, data: null, message: "厂商名称已存在" });

        return;

      }

      throw err;

    }

  });



  // ──────────────────────────────────────────────

  //  POST /api/vendor/login —供应商登录  // ──────────────────────────────────────────────

  app.post("/api/vendor/login", async (request, reply) => {

    const body = request.body as any;

    const { email, password } = body || {};



    if (!email || !password) {

      reply.status(400).send({ code: 400, data: null, message: "email 和password 必填" });

      return;

    }



    const [vendor] = await db

      .select()

      .from(vendors)

      .where(eq(vendors.email, email.toLowerCase()))

      .limit(1);



    if (!vendor) {

      reply.status(401).send({ code: 401, data: null, message: "邮箱或密码错误" });

      return;

    }



    if (!vendor.passwordHash) {

      reply.status(401).send({ code: 401, data: null, message: "邮箱或密码错误" });

      return;

    }



    const valid = await bcrypt.compare(password, vendor.passwordHash);

    if (!valid) {

      reply.status(401).send({ code: 401, data: null, message: "邮箱或密码错误" });

      return;

    }



    if (vendor.status !== "active") {

      reply.status(403).send({

        code: 403,

        data: null,

        message: vendor.status === "pending"

          ? "您的账号正在审核中，请耐心等待"

          : vendor.status === "rejected"

            ? `您的账号已被拒绝：${vendor.rejectReason || "未提供原因"}`

            : `供应商状态异常 ${vendor.status}`,

      });

      return;

    }



    const tokens = generateTokens(vendor.id, "vendor");



    const [keyRecord] = await db

      .select({ keyPrefix: vendorApiKeys.keyPrefix, status: vendorApiKeys.status })

      .from(vendorApiKeys)

      .where(eq(vendorApiKeys.vendorId, vendor.id))

      .limit(1);



    reply.status(200).send({

      code: 0,

      data: {

        vendor: {

          id: vendor.id,

          name: vendor.name,

          baseUrl: vendor.baseUrl,

          status: vendor.status,

          description: vendor.description,

          companyName: vendor.companyName,

          contactName: vendor.contactName,

          contactPhone: vendor.contactPhone,

          contactEmail: vendor.contactEmail,

          email: vendor.email,

          createdAt: vendor.createdAt.toISOString(),

          vendorKeyPrefix: keyRecord?.keyPrefix ?? null,

          vendorKeyActive: keyRecord?.status ?? false,

        },

        token: tokens,

      },

      message: "ok",

    });

  });

}



// ── 受保护的个人资料路由（X-Vendor-Key / JWT）──



export async function meRoutes(app: FastifyInstance) {

  const db = getDb();



  // ──────────────────────────────────────────────

  //  GET /api/vendor/me —查看自己的信息  // ──────────────────────────────────────────────

  app.get("/api/vendor/me", async (request, reply) => {

    const vendorId = request.vendor!.id;



    const [vendor] = await db

      .select()

      .from(vendors)

      .where(eq(vendors.id, vendorId))

      .limit(1);



    if (!vendor) {

      reply.status(404).send({ code: 404, data: null, message: "供应商不存在" });

      return;

    }



    const [keyRecord] = await db

      .select({ keyPrefix: vendorApiKeys.keyPrefix, status: vendorApiKeys.status })

      .from(vendorApiKeys)

      .where(eq(vendorApiKeys.vendorId, vendorId))

      .limit(1);



    reply.status(200).send({

      code: 0,

      data: {

        id: vendor.id,

        name: vendor.name,

        baseUrl: vendor.baseUrl,

        status: vendor.status,

        description: vendor.description,

        companyName: vendor.companyName,

        contactName: vendor.contactName,

        contactPhone: vendor.contactPhone,

        contactEmail: vendor.contactEmail,

        email: vendor.email,

        approvedAt: vendor.approvedAt?.toISOString() ?? null,

        rejectReason: vendor.rejectReason,

        createdAt: vendor.createdAt.toISOString(),

        vendorKeyPrefix: keyRecord?.keyPrefix ?? null,

        vendorKeyActive: keyRecord?.status ?? false,

      },

      message: "ok",

    });

  });



  // ──────────────────────────────────────────────

  //  PUT /api/vendor/me —更新信息

  // ──────────────────────────────────────────────

  app.put("/api/vendor/me", async (request, reply) => {

    const vendorId = request.vendor!.id;

    const body = request.body as any;



    const allowedFields = ["name", "baseUrl", "description", "companyName", "contactName", "contactPhone", "contactEmail"] as const;

    const updates: Record<string, any> = {};

    for (const field of allowedFields) {

      if (body[field] !== undefined) updates[field] = body[field];

    }



    if (Object.keys(updates).length === 0) {

      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });

      return;

    }



    try {

      const [vendor] = await db

        .update(vendors)

        .set(updates)

        .where(eq(vendors.id, vendorId))

        .returning();



      reply.status(200).send({ code: 0, data: vendor, message: "ok" });

    } catch (err: any) {

      if (err?.code === "23505") {

        reply.status(409).send({ code: 409, data: null, message: "厂商名称已存在" });

        return;

      }

      throw err;

    }

  });



  // ──────────────────────────────────────────────

  //  PUT /api/vendor/password —修改/设置密码

  // ──────────────────────────────────────────────

  app.put("/api/vendor/password", async (request, reply) => {

    const vendorId = request.vendor!.id;

    const body = request.body as any;

    const { oldPassword, newPassword } = body || {};



    if (!newPassword) {

      reply.status(400).send({ code: 400, data: null, message: "newPassword 必填" });

      return;

    }



    if (newPassword.length < 6) {

      reply.status(400).send({ code: 400, data: null, message: "密码长度不能小于 6 位" });

      return;

    }



    const [vendor] = await db

      .select({ passwordHash: vendors.passwordHash })

      .from(vendors)

      .where(eq(vendors.id, vendorId))

      .limit(1);



    if (!vendor) {

      reply.status(404).send({ code: 404, data: null, message: "供应商不存在" });

      return;

    }



    if (vendor.passwordHash) {

      if (!oldPassword) {

        reply.status(400).send({ code: 400, data: null, message: "oldPassword 必填" });

        return;

      }

      const valid = await bcrypt.compare(oldPassword, vendor.passwordHash);

      if (!valid) {

        reply.status(400).send({ code: 400, data: null, message: "原密码错误" });

        return;

      }

    }



    const passwordHash = await bcrypt.hash(newPassword, 10);



    await db

      .update(vendors)

      .set({ passwordHash })

      .where(eq(vendors.id, vendorId));



    reply.status(200).send({

      code: 0,

      data: null,

      message: vendor.passwordHash ? "密码已修改" : "密码已设置",

    });

  });

}



// ── JWT 供应商路由──



export async function jwtVendorRoutes(app: FastifyInstance) {

  const db = getDb();



  // ──────────────────────────────────────────────

  //  GET /api/vendor/profile —获取当前供应商信息（JWT）  // ──────────────────────────────────────────────

  app.get("/api/vendor/profile", async (request, reply) => {

    const vendorId = request.vendor!.id;



    const [vendor] = await db

      .select()

      .from(vendors)

      .where(eq(vendors.id, vendorId))

      .limit(1);



    if (!vendor) {

      reply.status(404).send({ code: 404, data: null, message: "供应商不存在" });

      return;

    }



    const [keyRecord] = await db

      .select({ keyPrefix: vendorApiKeys.keyPrefix, status: vendorApiKeys.status })

      .from(vendorApiKeys)

      .where(eq(vendorApiKeys.vendorId, vendorId))

      .limit(1);



    reply.status(200).send({

      code: 0,

      data: {

        id: vendor.id,

        name: vendor.name,

        baseUrl: vendor.baseUrl,

        status: vendor.status,

        description: vendor.description,

        companyName: vendor.companyName,

        contactName: vendor.contactName,

        contactPhone: vendor.contactPhone,

        contactEmail: vendor.contactEmail,

        email: vendor.email,

        approvedAt: vendor.approvedAt?.toISOString() ?? null,

        rejectReason: vendor.rejectReason,

        createdAt: vendor.createdAt.toISOString(),

        vendorKeyPrefix: keyRecord?.keyPrefix ?? null,

        vendorKeyActive: keyRecord?.status ?? false,

      },

      message: "ok",

    });

  });



  // ──────────────────────────────────────────────

  //  PUT /api/vendor/profile —更新供应商信息（JWT）  // ──────────────────────────────────────────────

  app.put("/api/vendor/profile", async (request, reply) => {

    const vendorId = request.vendor!.id;

    const body = request.body as any;



    const allowedFields = ["name", "baseUrl", "description", "companyName", "contactName", "contactPhone", "contactEmail"] as const;

    const updates: Record<string, any> = {};

    for (const field of allowedFields) {

      if (body[field] !== undefined) updates[field] = body[field];

    }



    if (Object.keys(updates).length === 0) {

      reply.status(400).send({ code: 400, data: null, message: "没有可更新的字段" });

      return;

    }



    try {

      const [vendor] = await db

        .update(vendors)

        .set(updates)

        .where(eq(vendors.id, vendorId))

        .returning();

      reply.status(200).send({ code: 0, data: vendor, message: "ok" });

    } catch (err: any) {

      if (err?.code === "23505") {

        reply.status(409).send({ code: 409, data: null, message: "厂商名称已存在" });

        return;

      }

      throw err;

    }

  });



  // ──────────────────────────────────────────────

  //  GET /api/vendor/api-keys —获取所有API Key（JWT）  // ──────────────────────────────────────────────

  app.get("/api/vendor/api-keys", async (request, reply) => {

    const vendorId = request.vendor!.id;



    const keys = await db

      .select({

        id: vendorApiKeys.id,

        keyPrefix: vendorApiKeys.keyPrefix,

        status: vendorApiKeys.status,

        permissions: vendorApiKeys.permissions,

        createdAt: vendorApiKeys.createdAt,

      })

      .from(vendorApiKeys)

      .where(eq(vendorApiKeys.vendorId, vendorId))

      .orderBy(desc(vendorApiKeys.createdAt));



    reply.status(200).send({

      code: 0,

      data: keys.map((k) => ({ ...k, createdAt: k.createdAt.toISOString() })),

      message: "ok",

    });

  });

}

