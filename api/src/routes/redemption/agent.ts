// ============================================================


//  3cloud (3C) — 兑换码系统：代理相关路由
//  POST   /api/v1/redemption/codes/batch — 生成兑换码批次
//  DELETE /api/v1/redemption/codes/:id — 作废兑换码
//  GET    /api/v1/redemption/agent-wallet — 代理商钱包
//  PATCH  /api/v1/redemption/batches/:id — 更新批次


// ============================================================





import { FastifyInstance } from "fastify";


import { eq, and, sql } from "drizzle-orm";


import { getDb } from "../../db/index.js";


import {


  users,


  agents,


  redemptionBatches,


  redemptionCodes,


  balanceLogs,


} from "../../db/schema.js";


import { authenticateJWT, guardNotImpersonating, guardNotImpersonatingWrite } from "../../middleware/auth.js";


import { AppError } from "../../services/auth-service/index.js";


import { notifyCodeRevoked } from "../../services/redemption-notify.js";


import { isAdminRole, generateCodes } from "./types.js";





export function registerAgentRoutes(app: FastifyInstance): void {


  // ════════════════════════════════════════════════
  //  POST /api/v1/redemption/codes/batch 批量生成兑换码
  //  管理员/代理商可用。代理商生成从代理余额预扣总额
  // ════════════════════════════════════════════════


  app.post("/api/v1/redemption/codes/batch", {


    preHandler: [authenticateJWT, guardNotImpersonating],


    handler: async (request, reply) => {


      try {


        const body = request.body as {


          name?: string;


          amount?: string | number;


          count?: number;


          expiresAt?: string;


          maxUses?: number;


          note?: string;


        };





        if (!body.name || !body.amount || !body.count) {


          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });


          return;


        }





        const name = String(body.name).trim();


        const amount = String(body.amount);


        const totalCount = parseInt(String(body.count), 10);


        const maxUses = body.maxUses ? parseInt(String(body.maxUses), 10) : 1;


        const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;


        const note = body.note || null;





        if (totalCount <= 0 || totalCount > 100000) {


          reply.status(400).send({ code: 400, data: null, message: "count 必须在 1~100000 之间" });

          return;


        }





        if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {


          reply.status(400).send({ code: 400, data: null, message: "amount 必须为正数" });

          return;


        }





        const db = getDb();


        const userId = request.user!.userId;


        const userRole = request.user!.role;





        const isAdmin = isAdminRole(userRole);


        const isAgent = userRole === "agent";





        if (!isAdmin && !isAgent) {


          reply.status(403).send({ code: 403, data: null, message: "仅管理员和代理商可生成兑换码" });


          return;


        }





        // ── 代理商：预扣余额 ──


        if (isAgent) {


          const totalAmount = (parseFloat(amount) * totalCount).toFixed(6);





          // 查代理信息
          const [agent] = await db
            .select({


              id: agents.id,


              status: agents.status,


              settledCommission: agents.settledCommission,


              pendingWithdraw: agents.pendingWithdraw,


              frozenAmount: agents.frozenAmount,


              redemptionLocked: agents.redemptionLocked,


            })


            .from(agents)


            .where(eq(agents.userId, userId))


            .limit(1);





          if (!agent) {


            reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });


            return;


          }





          if (!agent.status) {


            reply.status(403).send({ code: 403, data: null, message: "仅管理员和代理商可生成兑换码" });


            return;


          }





          // 可用余额 = settledCommission - pendingWithdraw - frozenAmount - redemptionLocked


          const available = parseFloat(agent.settledCommission as string ?? "0")


            - parseFloat(agent.pendingWithdraw as string ?? "0")


            - parseFloat(agent.frozenAmount as string ?? "0")


            - parseFloat(agent.redemptionLocked as string ?? "0");





          if (available < parseFloat(totalAmount)) {


            reply.status(400).send({


              code: 400,


              data: null,


              message: `代理商余额不足。需 ${totalAmount}，可用 ${available.toFixed(6)}`,

            });


            return;


          }


        }





        // ── 创建批次 ──


        const [batch] = await db


          .insert(redemptionBatches)


          .values({


            creatorId: userId,


            name,


            amount,


            totalCount,


            maxUses,


            expiresAt,


            status: "active",


            note,


          })


          .returning();





        // ── 代理商：预扣余额 ──

        const uniqueCodes = generateCodes(totalCount);


        const codeValues = Array.from(uniqueCodes).map((code) => ({


          batchId: batch.id,


          code,


          amount,


          usesLeft: maxUses,


          status: "unused" as const,


        }));





        // 批量插入


        const CHUNK_SIZE = 500;


        for (let i = 0; i < codeValues.length; i += CHUNK_SIZE) {


          const chunk = codeValues.slice(i, i + CHUNK_SIZE);


          await db.insert(redemptionCodes).values(chunk);


        }





        // ── 代理商：锁定兑换资金 ──


        if (isAgent) {


          const totalAmount = (parseFloat(amount) * totalCount).toFixed(6);





          // 可用余额 = settledCommission - pendingWithdraw - frozenAmount - redemptionLocked

          await db


            .update(agents)


            .set({


              settledCommission: sql`GREATEST(0, ${agents.settledCommission} - ${totalAmount})`,


              redemptionLocked: sql`${agents.redemptionLocked} + ${totalAmount}`,


            })


            .where(eq(agents.userId, userId));





          // 记录余额日志（代理商余额在 agents.settledCommission，非 users.balance）
          const [updated] = await db
            .select({ settledCommission: agents.settledCommission })


            .from(agents)


            .where(eq(agents.userId, userId))


            .limit(1);





          await db.insert(balanceLogs).values({


            userId,


            amount: `-${totalAmount}`,


            balanceAfter: updated?.settledCommission ?? "0",


            type: "redemption_prepay",


            refType: "redemption_batch",


            refId: batch.id,


            description: `生成兑换码批次 #${batch.id}，锁定 ${totalAmount} 元（redemptionLocked 托管）`,

          });


        }





        reply.status(200).send({


          code: 0,


          data: {


            batchId: batch.id,


            name: batch.name,


            totalCount,


            createdAt: batch.createdAt.toISOString(),


          },


          message: "兑换码批次创建成功",

        });


      } catch (err: any) {


        if (err instanceof AppError) {


          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });


          return;


        }


        throw err;


      }


    },


  });





  // ════════════════════════════════════════════════
  //  DELETE /api/v1/redemption/codes/:id 作废兑换码
  //  管理员或创建者可操作
  // ════════════════════════════════════════════════


  app.delete("/api/v1/redemption/codes/:id", {


    preHandler: [authenticateJWT, guardNotImpersonating],


    handler: async (request, reply) => {


      try {


        const db = getDb();


        const { id } = request.params as { id: string };


        const codeId = parseInt(id, 10);





        if (isNaN(codeId)) {


          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });

          return;


        }





        const userId = request.user!.userId;


        const userRole = request.user!.role;


        const isAdmin = isAdminRole(userRole);





        // 查询兑换码
        const [codeRecord] = await db
          .select({


            id: redemptionCodes.id,


            code: redemptionCodes.code,


            status: redemptionCodes.status,


            batchId: redemptionCodes.batchId,


            creatorId: redemptionBatches.creatorId,


            amount: redemptionCodes.amount,


            usesLeft: redemptionCodes.usesLeft,


          })


          .from(redemptionCodes)


          .innerJoin(redemptionBatches, eq(redemptionCodes.batchId, redemptionBatches.id))


          .where(eq(redemptionCodes.id, codeId))


          .limit(1);





        if (!codeRecord) {


          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });


          return;


        }





        // 权限检查：管理员或创建者可操作
        if (!isAdmin && codeRecord.creatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "仅管理员和创建者可作废兑换码" });
          return;
        }





        if (codeRecord.status !== "unused") {


          reply.status(400).send({ code: 400, data: null, message: "只能作废未使用的兑换码" });


          return;


        }





        // ── 代理商：预扣余额 ──

        await db.transaction(async (tx) => {


          await tx


            .update(redemptionCodes)


            .set({ status: "revoked" })


            .where(eq(redemptionCodes.id, codeId));





          // 查代理信息
          const [creator] = await tx
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, codeRecord.creatorId))


            .limit(1);





          if (creator?.role === "agent") {


            await tx


              .update(agents)


              .set({


                settledCommission: sql`${agents.settledCommission} + ${codeRecord.amount}`,


                redemptionLocked: sql`GREATEST(0, ${agents.redemptionLocked} - ${codeRecord.amount})`,


              })


              .where(eq(agents.userId, codeRecord.creatorId));





            // 查实际余额写入 balance_logs

            const [updated] = await tx


              .select({ settledCommission: agents.settledCommission })


              .from(agents)


              .where(eq(agents.userId, codeRecord.creatorId))


              .limit(1);





            await tx.insert(balanceLogs).values({


              userId: codeRecord.creatorId,


              amount: `+${codeRecord.amount}`,


              balanceAfter: updated?.settledCommission ?? codeRecord.amount,


              type: "redemption_refund",


              refType: "redemption_code",


              refId: codeId,


              description: `兑换码 ${codeId} 作废，退还锁定金额 ${codeRecord.amount} 元`,

            });


          }


        });





        reply.status(200).send({


          code: 0,


          data: null,


          message: "兑换码已作废",


        });





        // 发送通知
        notifyCodeRevoked({
          codeId: codeRecord.id,


          code: codeRecord.code,


          batchId: codeRecord.batchId,


          revokedBy: userId,
        }).catch((err) => {


          request.log.error({ err }, "[Notif] 兑换通知发送失败");

        });


      } catch (err: any) {


        if (err instanceof AppError) {


          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });


          return;


        }


        throw err;


      }


    },


  });





  // ════════════════════════════════════════════════


  //  返回 settledCommission / redemptionLocked / frozenAmount / pendingWithdraw

  // ════════════════════════════════════════════════


  app.get("/api/v1/redemption/agent-wallet", {


    preHandler: [authenticateJWT, guardNotImpersonatingWrite],


    handler: async (request, reply) => {


      try {


        const db = getDb();


        const userId = request.user!.userId;


        const userRole = request.user!.role;





        if (userRole !== "agent") {


          reply.status(403).send({ code: 403, data: null, message: "仅管理员和代理商可生成兑换码" });

          return;


        }





        const [agent] = await db


          .select({


            settledCommission: agents.settledCommission,


            pendingWithdraw: agents.pendingWithdraw,


            frozenAmount: agents.frozenAmount,


            redemptionLocked: agents.redemptionLocked,


          })


          .from(agents)


          .where(eq(agents.userId, userId))


          .limit(1);





        if (!agent) {


          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });


          return;


        }





        const settled = parseFloat(agent.settledCommission as string ?? "0");


        const pending = parseFloat(agent.pendingWithdraw as string ?? "0");


        const frozen = parseFloat(agent.frozenAmount as string ?? "0");


        const locked = parseFloat(agent.redemptionLocked as string ?? "0");


        const available = settled - pending - frozen - locked;





        reply.status(200).send({


          code: 0,


          data: {


            settledCommission: settled.toFixed(6),


            pendingWithdraw: pending.toFixed(6),


            frozenAmount: frozen.toFixed(6),


            redemptionLocked: locked.toFixed(6),


            available: Math.max(0, available).toFixed(6),


          },


          message: "ok",


        });


      } catch (err: any) {


        if (err instanceof AppError) {


          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });


          return;


        }


        throw err;


      }


    },


  });





  // ════════════════════════════════════════════════


  //  PATCH /api/v1/redemption/batches/:id 更新批次信息


  //  管理员或创建者可操作


  // ════════════════════════════════════════════════


  app.patch("/api/v1/redemption/batches/:id", {


    preHandler: [authenticateJWT, guardNotImpersonating],


    handler: async (request, reply) => {


      try {


        const db = getDb();


        const { id } = request.params as { id: string };


        const batchId = parseInt(id, 10);





        if (isNaN(batchId)) {


          reply.status(400).send({ code: 400, data: null, message: "参数不完整：name, amount, count 必填" });

          return;


        }





        const userId = request.user!.userId;


        const userRole = request.user!.role;


        const isAdmin = isAdminRole(userRole);





        // 查询批次


        const [batch] = await db


          .select()


          .from(redemptionBatches)


          .where(eq(redemptionBatches.id, batchId))


          .limit(1);





        if (!batch) {


          reply.status(404).send({ code: 404, data: null, message: "兑换码不存在" });

          return;


        }





        // 权限检查：管理员或创建者可操作
        if (!isAdmin && batch.creatorId !== userId) {
          reply.status(403).send({ code: 403, data: null, message: "仅管理员和创建者可更新批次" });
          return;
        }





        const body = request.body as {


          name?: string;


          status?: "active" | "disabled";


          expiresAt?: string;


          note?: string;


          maxUses?: number;


        };





        const updateData: Record<string, any> = {};





        if (body.name !== undefined) {


          updateData.name = String(body.name).trim();


        }


        if (body.status !== undefined) {


          if (!["active", "disabled"].includes(body.status)) {


            reply.status(400).send({ code: 400, data: null, message: "status 仅支持 active/disabled" });

            return;


          }


          updateData.status = body.status;


        }


        if (body.expiresAt !== undefined) {


          updateData.expiresAt = new Date(body.expiresAt);


        }


        if (body.note !== undefined) {


          updateData.note = body.note;


        }


        if (body.maxUses !== undefined) {


          updateData.maxUses = parseInt(String(body.maxUses), 10);


        }





        // 如果没有要更新的字段


        if (Object.keys(updateData).length === 0) {


          reply.status(400).send({ code: 400, data: null, message: "代理商信息不存在" });


          return;


        }





        // 设置更新时间


        updateData.updatedAt = new Date();





        // 执行更新


        await db


          .update(redemptionBatches)


          .set(updateData)


          .where(eq(redemptionBatches.id, batchId));











        reply.status(200).send({


          code: 0,


          data: {


            id: batchId,


            name: updateData.name ?? batch.name,


            status: updateData.status ?? batch.status,


            updatedAt: updateData.updatedAt.toISOString(),


          },


          message: "ok",


        });


      } catch (err: any) {


        if (err instanceof AppError) {


          reply.status(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });


          return;


        }


        throw err;


      }


    },


  });


}


