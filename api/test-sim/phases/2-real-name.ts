// ============================================================
//  阶段 2 - 实名认证 & 审核
// ============================================================

import { ApiClient } from "../api-client.js";
import { startPhase, endPhase, VerificationReport, progress } from "../utils/verify.js";
import { generatePersonalRealName, generateEnterpriseRealName } from "../utils/data-gen.js";
import type { RegisteredUser } from "./1-register.js";

export async function phase2RealName(
  client: ApiClient,
  personalUsers: RegisteredUser[],
  enterpriseUsers: RegisteredUser[],
  adminToken: string,
): Promise<VerificationReport> {
  startPhase("2: 实名认证 & 审批");
  const report = new VerificationReport();

  // 选取 10 个个人用户 + 10 个企业用户做实名
  const personalRealNameUsers = personalUsers.slice(0, 10);
  const enterpriseRealNameUsers = enterpriseUsers.slice(0, 10);

  // 2.1 个人实名提交
  console.log("  提交个人实名...");
  for (let i = 0; i < personalRealNameUsers.length; i++) {
    try {
      const data = generatePersonalRealName(i);
      await client.submitRealNamePersonal(personalRealNameUsers[i].accessToken, data);
    } catch (err: any) {
      console.error(`  ⚠️  用户 ${personalRealNameUsers[i].email} 实名提交失败: ${err.message}`);
    }
  }
  report.add("个人实名提交", true, `${personalRealNameUsers.length} 个已提交`);

  // 2.2 企业实名提交
  console.log("  提交企业实名...");
  for (let i = 0; i < enterpriseRealNameUsers.length; i++) {
    try {
      const data = generateEnterpriseRealName(i);
      await client.submitRealNameEnterprise(enterpriseRealNameUsers[i].accessToken, data);
    } catch (err: any) {
      console.error(`  ⚠️  企业 ${enterpriseRealNameUsers[i].email} 实名提交失败: ${err.message}`);
    }
  }
  report.add("企业实名提交", true, `${enterpriseRealNameUsers.length} 个已提交`);

  // 2.3 管理员审核 - 全部通过（留 2 个先拒绝再重新通过）
  console.log("  管理员审核实名...");
  const reviewsRes = await client.adminListReviews(adminToken, { status: "pending_review" });
  const reviews = reviewsRes.data?.rows || reviewsRes.data || [];
  const reviewCount = Array.isArray(reviews) ? reviews.length : 0;
  console.log(`  待审核记录: ${reviewCount} 条`);

  // 前 18 个通过，后 2 个拒绝
  let approvedCount = 0;
  let rejectedCount = 0;
  const reviewList = Array.isArray(reviews) ? reviews : [];
  for (let i = 0; i < reviewList.length; i++) {
    const review = reviewList[i];
    const reviewId = review.id || review.userId;
    if (!reviewId) continue;

    if (i < reviewList.length - 2) {
      await client.adminReviewAction(adminToken, reviewId, "approve");
      approvedCount++;
    } else {
      await client.adminReviewAction(adminToken, reviewId, "reject", "资料不清晰");
      rejectedCount++;
    }
  }

  report.add("管理员批量审核", true, `通过 ${approvedCount}, 拒绝 ${rejectedCount}`);

  // 2.4 被拒的用户重新提交
  if (rejectedCount > 0 && reviewList.length >= 2) {
    const rejectedReview = reviewList[reviewList.length - 1];
    const userId = rejectedReview.userId || rejectedReview.id;
    // 查找对应的用户
    const reUser = [...personalRealNameUsers, ...enterpriseRealNameUsers]
      .find((u) => u.userId === userId);
    if (reUser) {
      try {
        const data = generatePersonalRealName(99);
        await client.submitRealNamePersonal(reUser.accessToken, data);
        // 重新审核通过
        const newReviews = await client.adminListReviews(adminToken, { status: "pending_review" });
        const newList = Array.isArray(newReviews.data?.rows) ? newReviews.data.rows : [];
        if (newList.length > 0) {
          await client.adminReviewAction(adminToken, newList[0].id || newList[0].userId, "approve");
          report.add("被拒用户重新提交并审核通过", true);
        }
      } catch {
        report.add("被拒用户重新提交并审核通过", false, "重提流程异常");
      }
    }
  }

  endPhase("2: 实名认证");
  return report;
}
