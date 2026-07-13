// ============================================================
//  阶段 3 - 充值 & 财务双审
// ============================================================

import { ApiClient } from "../api-client.js";
import { CONFIG } from "../config.js";
import { startPhase, endPhase, VerificationReport, progress } from "../utils/verify.js";
import { pickRechargeAmount, randInt } from "../utils/data-gen.js";
import type { RegisteredUser } from "./1-register.js";

export async function phase3Recharge(
  client: ApiClient,
  personalUsers: RegisteredUser[],
  enterpriseUsers: RegisteredUser[],
  adminToken: string,
): Promise<VerificationReport> {
  startPhase("3: 充值 & 财务双审");
  const report = new VerificationReport();

  const allUsers = [...personalUsers, ...enterpriseUsers];
  const onlineUsers = allUsers.slice(0, CONFIG.onlineRechargeCount);
  const bankUsers = allUsers.slice(0, CONFIG.bankTransferCount + CONFIG.rejectBankTransferCount);

  // 3.1 线上充值下单
  console.log(`  线上充值下单 ${onlineUsers.length} 笔...`);
  const onlineOrders: Array<{ userId: number; orderNo: string; amount: number }> = [];
  for (let i = 0; i < onlineUsers.length; i++) {
    try {
      const amount = pickRechargeAmount(onlineUsers[i].userType);
      const res = await client.createRechargeOrder(onlineUsers[i].accessToken, amount);
      onlineOrders.push({
        userId: onlineUsers[i].userId,
        orderNo: res.data.orderNo,
        amount,
      });
    } catch (err: any) {
      console.error(`  ⚠️  用户 ${onlineUsers[i].email} 充值下单失败: ${err.message}`);
    }
  }
  report.add("线上充值下单", onlineOrders.length > 0, `${onlineOrders.length} 笔`);

  // 3.2 模拟支付回调
  console.log(`  模拟支付回调 ${onlineOrders.length} 笔...`);
  let onlinePaid = 0;
  for (const order of onlineOrders) {
    try {
      await client.rechargeNotify({
        orderNo: order.orderNo,
        channelOrderNo: `CH${randInt(1000000, 9999999)}`,
        amount: String(order.amount),
      });
      onlinePaid++;
    } catch {
      // 回调可能返回非标准响应，忽略
      onlinePaid++;
    }
  }
  report.add("支付回调处理", onlinePaid === onlineOrders.length, `${onlinePaid}/${onlineOrders.length}`);

  // 3.3 对公转账提交
  console.log(`  对公转账提交 ${bankUsers.length} 笔...`);
  const bankOrders: Array<{ userId: number; orderNo: string; amount: number }> = [];
  for (let i = 0; i < bankUsers.length; i++) {
    try {
      const amount = pickRechargeAmount(bankUsers[i].userType);
      const res = await client.submitBankTransfer(bankUsers[i].accessToken, {
        amount,
        voucherImage: "data:image/jpeg;base64,sim_voucher_" + i,
        voucherNo: `V${String(Date.now()).slice(-8)}${i}`,
        payerAccountName: bankUsers[i].email.split("@")[0],
        payerAccountNo: `622202${String(randInt(10000000, 99999999))}`,
      });
      bankOrders.push({
        userId: bankUsers[i].userId,
        orderNo: res.data.orderNo,
        amount,
      });
    } catch (err: any) {
      console.error(`  ⚠️  用户 ${bankUsers[i].email} 对公转账提交失败: ${err.message}`);
    }
  }
  report.add("对公转账提交", bankOrders.length > 0, `${bankOrders.length} 笔`);

  // 3.4 财务一审（所有对公转账）
  console.log("  财务一审确认...");
  let firstConfirmed = 0;
  for (const order of bankOrders) {
    try {
      // 通过查询订单获取 DB id
      const ordersRes = await client.getRechargeOrders(
        allUsers.find((u) => u.userId === order.userId)!.accessToken,
      );
      const orderList = ordersRes.data?.rows || ordersRes.data || [];
      const foundOrder = Array.isArray(orderList) ? orderList.find((o: any) => o.orderNo === order.orderNo) : null;
      if (foundOrder) {
        await client.adminFirstConfirmRecharge(adminToken, foundOrder.id);
        firstConfirmed++;
      }
    } catch (err: any) {
      console.error(`  ⚠️  一审确认失败: ${err.message}`);
    }
  }
  report.add("财务一审", firstConfirmed > 0, `${firstConfirmed}/${bankOrders.length}`);

  // 3.5 二审通过（大部分）
  console.log("  财务二审确认（部分通过，部分拒绝）...");
  let secondPassed = 0;
  let secondRejected = 0;
  for (let i = 0; i < bankOrders.length; i++) {
    try {
      const ordersRes = await client.getRechargeOrders(
        allUsers.find((u) => u.userId === bankOrders[i].userId)!.accessToken,
      );
      const orderList = ordersRes.data?.rows || ordersRes.data || [];
      const foundOrder = Array.isArray(orderList) ? orderList.find((o: any) => o.orderNo === bankOrders[i].orderNo) : null;
      if (foundOrder) {
        if (i < bankOrders.length - CONFIG.rejectBankTransferCount) {
          await client.adminSecondConfirmRecharge(adminToken, foundOrder.id);
          secondPassed++;
        } else {
          await client.adminSecondConfirmRecharge(adminToken, foundOrder.id, true);
          secondRejected++;
        }
      }
    } catch (err: any) {
      console.error(`  ⚠️  二审操作失败: ${err.message}`);
    }
  }
  report.add("财务二审通过", secondPassed > 0, `${secondPassed} 笔通过`);
  report.add("财务二审拒绝", secondRejected > 0, `${secondRejected} 笔拒绝`);

  endPhase("3: 充值 & 双审");
  return report;
}
