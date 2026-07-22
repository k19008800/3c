// ============================================================
//  3cloud (3C) — 实名认证路由
//  POST  /api/v1/auth/real-name/upload                — 上传证件
//  POST  /api/v1/auth/real-name/personal               — 个人实名
//  POST  /api/v1/auth/real-name/enterprise              — 企业实名
//  GET   /api/v1/auth/real-name/status                 — 实名状态
//  GET   /api/v1/auth/real-name/file/:filename          — 查看证件文件
//  GET   /api/v1/auth/real-name/last-submission         — 最近提交记录
//  GET   /api/v1/auth/real-name/history                 — 审核历史
// ============================================================



import { FastifyInstance } from "fastify";

import { eq, sql, and, desc } from "drizzle-orm";

import { getDb } from "../../db/index.js";

import { users, userRealNameReviews } from "../../db/schema.js";

import { authenticateJWT } from "../../middleware/auth.js";

import {

  realNamePersonalSchema,

  realNameEnterpriseSchema,

} from "../../schemas.js";

import { AppError } from "../../services/auth-service/index.js";

import fs from "node:fs";

import path from "node:path";

import {

  validateIdNumber,

  saveUploadedFile,

  getFileAbsolutePath,

  getMimeType,

  checkSubmitRateLimit,

  markSubmitRateLimit,

  autoVerifyRealName,

} from "../../services/real-name-service.js";



export async function authRealNameRoutes(app: FastifyInstance) {

  // 鈹€鈹€ 涓婁紶璇佷欢鍥剧墖 鈹€鈹€

  // POST /api/v1/auth/real-name/upload

  app.post("/api/v1/auth/real-name/upload", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

    const userId = request.user!.userId;



    try {

      const file = await request.file();

      if (!file) {

        reply.status(400).send({ code: 400, data: null, message: "璇蜂笂浼犳枃浠? " });

        return;

      }



      const body = request.body as Record<string, string>;

      const fileType = body?.fileType ?? (request.query as any)?.fileType;

      if (!fileType || !["id_front", "id_back", "business_license"].includes(fileType)) {

        reply.status(400).send({ code: 400, data: null, message: "缂哄皯鎴栨棤鏁堢殑 fileType 鍙傛暟" });

        return;

      }



      const db = getDb();

      const [verResult] = await db

        .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })

        .from(userRealNameReviews)

        .where(eq(userRealNameReviews.userId, userId));

      const currentVersion = (verResult?.maxVer ?? 0) + 1;



      const buffer = await file.toBuffer();

      const result = await saveUploadedFile(userId, currentVersion, fileType, buffer, file.filename);



      reply.status(200).send({

        code: 0,

        data: { relativePath: result.relativePath, type: fileType, version: currentVersion },

        message: "涓婁紶鎴愬姛",

      });

    } catch (err: any) {

      if (err instanceof AppError) {

        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });

        return;

      }

      throw err;

    }

  });



  // 鈹€鈹€ 鎻愪氦涓实汉瀹炲悕 鈹€鈹€

  // POST /api/v1/auth/real-name/personal

  app.post("/api/v1/auth/real-name/personal", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

    const db = getDb();

    const userId = request.user!.userId;



    try {

      const parsed = realNamePersonalSchema.parse(request.body);



      if (!validateIdNumber(parsed.idNumber)) {

        reply.status(400).send({ code: 400, data: null, message: "缂哄皯楠岃瘉鐮? " });

        return;

      }



      const [user] = await db

        .select({ realNameStatus: users.realNameStatus })

        .from(users)

        .where(eq(users.id, userId))

        .limit(1);



      if (!user) {

        reply.status(404).send({ code: 404, data: null, message: "鐢ㄦ埛涓嶅瓨鍦?" });

        return;

      }



      if (user.realNameStatus === "approved") {

        reply.status(400).send({ code: 400, data: null, message: "缂哄皯楠岃瘉鐮? " });

        return;

      }



      if (user.realNameStatus === "pending_review") {

        reply.status(400).send({ code: 400, data: null, message: "宸叉湁瀹炲悕鐢宠上姝ｅ湪瀹℃牳涓传紝璇风瓑寰呭名鏍哥粨鏋?" });

        return;

      }



      await checkSubmitRateLimit(userId);



      const [verResult] = await db

        .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })

        .from(userRealNameReviews)

        .where(eq(userRealNameReviews.userId, userId));

      const nextVersion = (verResult?.maxVer ?? 0) + 1;



      await db.transaction(async (tx) => {

        await tx.insert(userRealNameReviews).values({

          userId,

          version: nextVersion,

          realName: parsed.realName,

          idNumber: parsed.idNumber,

          idFrontImage: parsed.idFrontImage ?? null,

          idBackImage: parsed.idBackImage ?? null,

          status: "pending_review",

        });



        await tx

          .update(users)

          .set({

            realNameStatus: "pending_review",

            realName: parsed.realName,

            idNumber: parsed.idNumber,

            idFrontImage: parsed.idFrontImage ?? null,

            idBackImage: parsed.idBackImage ?? null,

          })

          .where(eq(users.id, userId));

      });



      await markSubmitRateLimit(userId);



      autoVerifyRealName(userId, nextVersion).then((result) => {

        if (result.autoVerified) {

          console.log(`[RealName] 鐢ㄦ埛 ${userId} 瀹炲悕鑷文姩${result.passed ? "閫氳繃" : "鏍搁獙鏈件€氳繃锛岃浆浜哄伐瀹℃牳"}`);

        }

      }).catch((err) => {

        console.error(`[RealName] 鑷文姩鏍搁獙鍑洪敊 (userId=${userId}):`, err);

      });



      reply.status(200).send({

        code: 0,

        data: { version: nextVersion },

        message: "瀹炲悕淇℃伅宸叉彁浜わ紝绛夊緟瀹℃牳",

      });

    } catch (err: any) {

      if (err instanceof AppError) {

        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });

        return;

      }

      if (err?.name === "ZodError") {

        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "鍙傛暟鏍￠獙澶辫触" });

        return;

      }

      throw err;

    }

  });



  // 鈹€鈹€ 鎻愪氦浼佷笟瀹炲悕 鈹€鈹€

  // POST /api/v1/auth/real-name/enterprise

  app.post("/api/v1/auth/real-name/enterprise", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

    const db = getDb();

    const userId = request.user!.userId;



    try {

      const parsed = realNameEnterpriseSchema.parse(request.body);



      if (!validateIdNumber(parsed.idNumber)) {

        reply.status(400).send({ code: 400, data: null, message: "缂哄皯楠岃瘉鐮? " });

        return;

      }



      const [user] = await db

        .select({ realNameStatus: users.realNameStatus })

        .from(users)

        .where(eq(users.id, userId))

        .limit(1);



      if (!user) {

        reply.status(404).send({ code: 404, data: null, message: "鐢ㄦ埛涓嶅瓨鍦?" });

        return;

      }



      if (user.realNameStatus === "approved") {

        reply.status(400).send({ code: 400, data: null, message: "缂哄皯楠岃瘉鐮? " });

        return;

      }



      if (user.realNameStatus === "pending_review") {

        reply.status(400).send({ code: 400, data: null, message: "宸叉湁瀹炲悕鐢宠上姝ｅ湪瀹℃牳涓传紝璇风瓑寰呭名鏍哥粨鏋?" });

        return;

      }



      await checkSubmitRateLimit(userId);



      const [verResult] = await db

        .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })

        .from(userRealNameReviews)

        .where(eq(userRealNameReviews.userId, userId));

      const nextVersion = (verResult?.maxVer ?? 0) + 1;



      await db.transaction(async (tx) => {

        await tx.insert(userRealNameReviews).values({

          userId,

          version: nextVersion,

          status: "pending_review",

          realName: parsed.realName,

          idNumber: parsed.idNumber,

          idFrontImage: parsed.idFrontImage ?? null,

          idBackImage: parsed.idBackImage ?? null,

          businessLicense: parsed.businessLicense ?? null,

          companyName: parsed.companyName,

          companyRegNumber: parsed.companyRegNumber,

          bankName: parsed.bankName ?? null,

          bankAccount: parsed.bankAccount ?? null,

          bankAddress: parsed.bankAddress ?? null,

          invoiceTitle: parsed.invoiceTitle ?? null,

          invoiceTaxId: parsed.invoiceTaxId ?? null,

        });



        await tx

          .update(users)

          .set({

            realNameStatus: "pending_review",

            realName: parsed.realName,

            idNumber: parsed.idNumber,

            idFrontImage: parsed.idFrontImage ?? null,

            idBackImage: parsed.idBackImage ?? null,

            businessLicense: parsed.businessLicense ?? null,

            companyName: parsed.companyName,

            companyRegNumber: parsed.companyRegNumber,

            bankName: parsed.bankName ?? null,

            bankAccount: parsed.bankAccount ?? null,

            bankAddress: parsed.bankAddress ?? null,

            invoiceTitle: parsed.invoiceTitle ?? null,

            invoiceTaxId: parsed.invoiceTaxId ?? null,

            userType: "enterprise",

          })

          .where(eq(users.id, userId));

      });



      await markSubmitRateLimit(userId);



      autoVerifyRealName(userId, nextVersion).then((result) => {

        if (result.autoVerified) {

          console.log(`[RealName] 鐢ㄦ埛 ${userId} 浼佷笟瀹炲悕鑷文姩${result.passed ? "閫氳繃" : "鏍搁獙鏈件€氳繃锛岃浆浜哄伐瀹℃牳"}`);

        }

      }).catch((err) => {

        console.error(`[RealName] 鑷文姩鏍搁獙鍑洪敊 (userId=${userId}):`, err);

      });



      reply.status(200).send({

        code: 0,

        data: { version: nextVersion },

        message: "浼佷笟瀹炲悕淇℃伅宸叉彁浜わ紝绛夊緟瀹℃牳",

      });

    } catch (err: any) {

      if (err instanceof AppError) {

        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });

        return;

      }

      if (err?.name === "ZodError") {

        reply.status(400).send({ code: 400, data: null, message: err.errors?.[0]?.message || "鍙傛暟鏍￠獙澶辫触" });

        return;

      }

      throw err;

    }

  });



  // 鈹€鈹€ 鏌ヨ息瀹炲悕璁よ瘉鐘舵€佲攢鈹€

  // GET /api/v1/auth/real-name/status

  app.get("/api/v1/auth/real-name/status", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

    const db = getDb();

    const userId = request.user!.userId;



    try {

      const [user] = await db

        .select({

          realNameStatus: users.realNameStatus,

          userType: users.userType,

          realName: users.realName,

          idNumber: users.idNumber,

          idFrontImage: users.idFrontImage,

          idBackImage: users.idBackImage,

          companyName: users.companyName,

          companyRegNumber: users.companyRegNumber,

          businessLicense: users.businessLicense,

          rejectReason: users.rejectReason,

        })

        .from(users)

        .where(eq(users.id, userId))

        .limit(1);



      if (!user) {

        reply.status(404).send({ code: 404, data: null, message: "鐢ㄦ埛涓嶅瓨鍦?" });

        return;

      }



      const [verResult] = await db

        .select({ maxVer: sql<number>`coalesce(max(${userRealNameReviews.version}), 0)` })

        .from(userRealNameReviews)

        .where(eq(userRealNameReviews.userId, userId));

      const currentVersion = verResult?.maxVer ?? null;



      reply.status(200).send({

        code: 0,

        data: { ...user, reviewVersion: currentVersion },

        message: "ok",

      });

    } catch (err) {

      if (err instanceof AppError) {

        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });

        return;

      }

      throw err;

    }

  });



  // 鈹€鈹€ 鏌ョ湅鑷文繁鐨勫疄鍚嶈瘉浠舵枃浠垛攢鈹€

  // GET /api/v1/auth/real-name/file/:filename

  app.get("/api/v1/auth/real-name/file/:filename", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

    const params = request.params as { filename: string };

    const filename = params.filename;



    if (

      filename.includes("..") ||

      filename.includes("/") ||

      filename.includes("\\") ||

      !filename.match(/^\d+_(id_front|id_back|business_license)\.\w+$/)

    ) {

      reply.status(400).send({ code: 400, data: null, message: "闈炴硶鏂囦欢鍚? " });

      return;

    }



    try {

      const relativePath = `/real-name/${request.user!.userId}/${filename}`;

      const filePath = getFileAbsolutePath(relativePath);



      if (!fs.existsSync(filePath)) {

        reply.status(404).send({ code: 404, data: null, message: "鏂囦欢涓嶅瓨鍦? " });

        return;

      }



      const ext = path.extname(filename).toLowerCase();

      reply.type(getMimeType(ext));

      reply.send(fs.createReadStream(filePath));

    } catch (err) {

      if (err instanceof AppError) {

        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });

        return;

      }

      throw err;

    }

  });



  // 鈹€鈹€ 鏈€杩戜竴娆¤路鎷掓彁浜も攢鈹€

  // GET /api/v1/auth/real-name/last-submission

  app.get("/api/v1/auth/real-name/last-submission", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

    const db = getDb();

    const userId = request.user!.userId;



    try {

      const [last] = await db

        .select({

          id: userRealNameReviews.id,

          version: userRealNameReviews.version,

          realName: userRealNameReviews.realName,

          idNumber: userRealNameReviews.idNumber,

          idFrontImage: userRealNameReviews.idFrontImage,

          idBackImage: userRealNameReviews.idBackImage,

          companyName: userRealNameReviews.companyName,

          companyRegNumber: userRealNameReviews.companyRegNumber,

          businessLicense: userRealNameReviews.businessLicense,

          bankName: userRealNameReviews.bankName,

          bankAccount: userRealNameReviews.bankAccount,

          bankAddress: userRealNameReviews.bankAddress,

          invoiceTitle: userRealNameReviews.invoiceTitle,

          invoiceTaxId: userRealNameReviews.invoiceTaxId,

          status: userRealNameReviews.status,

          rejectReason: userRealNameReviews.rejectReason,

        })

        .from(userRealNameReviews)

        .where(

          and(

            eq(userRealNameReviews.userId, userId),

            eq(userRealNameReviews.status, "rejected"),

          ),

        )

        .orderBy(desc(userRealNameReviews.version))

        .limit(1);



      if (!last) {

        reply.status(200).send({ code: 0, data: null, message: "鏃犳渶杩戣路鎷掕证褰? " });

        return;

      }



      reply.status(200).send({ code: 0, data: last, message: "ok" });

    } catch (err) {

      if (err instanceof AppError) {

        reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });

        return;

      }

      throw err;

    }

  });



  // 鈹€鈹€ 瀹炲悕瀹℃牳鍘嗗彶 鈹€鈹€

  // GET /api/v1/auth/real-name/history

  app.get("/api/v1/auth/real-name/history", {

    preHandler: [authenticateJWT],

  }, async (request, reply) => {

    const db = getDb();

    const userId = request.user!.userId;



    const rows = await db

      .select()

      .from(userRealNameReviews)

      .where(eq(userRealNameReviews.userId, userId))

      .orderBy(desc(userRealNameReviews.version));



    reply.status(200).send({

      code: 0,

      data: {

        list: rows.map((r) => ({

          id: r.id,

          userId: r.userId,

          version: r.version,

          realName: r.realName,

          idNumber: r.idNumber ? r.idNumber.substring(0, 6) + "********" + r.idNumber.substring(14) : null,

          companyName: r.companyName,

          companyRegNumber: r.companyRegNumber,

          status: r.status,

          reviewerId: r.reviewerId,

          rejectReason: r.rejectReason,

          createdAt: r.createdAt.toISOString(),

          reviewedAt: r.reviewedAt?.toISOString() ?? null,

        })),

      },

      message: "ok",

    });

  });

}

