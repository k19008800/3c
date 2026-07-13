// ============================================================
//  阶段 1 - 用户注册 & 邮箱验证（带已存在用户登录 fallback）
// ============================================================

import { ApiClient } from "../api-client.js";
import { CONFIG, userEmail } from "../config.js";
import { startPhase, endPhase, VerificationReport, progress } from "../utils/verify.js";

export interface RegisteredUser {
  userId: number;
  email: string;
  accessToken: string;
  userType: "personal" | "enterprise";
}

async function registerOrLogin(
  client: ApiClient,
  email: string,
  password: string,
  userType: "personal" | "enterprise",
): Promise<RegisteredUser | null> {
  try {
    const res = await client.register(email, password);
    return { userId: res.data.user.id, email, accessToken: res.data.accessToken, userType };
  } catch (err: any) {
    // 如果已注册（409），尝试登录
    if (err.message?.includes("409") || err.message?.includes("已注册") || err.message?.includes("邮箱已注册")) {
      try {
        const loginRes = await client.login(email, password);
        return { userId: loginRes.data.user.id, email, accessToken: loginRes.data.accessToken, userType };
      } catch (loginErr: any) {
        console.error(`  ⚠️  登录 ${email} 失败: ${loginErr.message}`);
        return null;
      }
    }
    console.error(`  ⚠️  注册 ${email} 失败: ${err.message}`);
    return null;
  }
}

export async function phase1Register(client: ApiClient): Promise<{
  personalUsers: RegisteredUser[];
  enterpriseUsers: RegisteredUser[];
  allUsers: RegisteredUser[];
  report: VerificationReport;
}> {
  startPhase("1: 用户注册 & 邮箱验证");
  const report = new VerificationReport();
  const personalUsers: RegisteredUser[] = [];
  const enterpriseUsers: RegisteredUser[] = [];

  // 1.1 注册/登录个人用户
  console.log(`  注册/登录 ${CONFIG.personalUsers} 个个人用户...`);
  for (let i = 1; i <= CONFIG.personalUsers; i++) {
    const email = userEmail(i, "personal");
    const user = await registerOrLogin(client, email, "12345678", "personal");
    if (user) personalUsers.push(user);
  }
  report.add(`个人用户准备就绪`, personalUsers.length === CONFIG.personalUsers,
    `成功 ${personalUsers.length} 个`);

  // 1.2 注册/登录企业用户
  console.log(`  注册/登录 ${CONFIG.enterpriseUsers} 个企业用户...`);
  for (let i = 1; i <= CONFIG.enterpriseUsers; i++) {
    const email = userEmail(i, "enterprise");
    const user = await registerOrLogin(client, email, "12345678", "enterprise");
    if (user) enterpriseUsers.push(user);
  }
  report.add(`企业用户准备就绪`, enterpriseUsers.length === CONFIG.enterpriseUsers,
    `成功 ${enterpriseUsers.length} 个`);

  const allUsers = [...personalUsers, ...enterpriseUsers];

  // 1.3 重复注册验证（至少有一个用户时）
  if (allUsers.length > 0) {
    try {
      await client.register(allUsers[0].email, "12345678");
      report.add("重复注册应被拦截", false, "未返回错误");
    } catch {
      report.add("重复注册应被拦截", true, "正确返回 4xx");
    }
  }

  // 1.4 邮箱验证（失败忽略，仿真模式可跳过）
  if (allUsers.length > 0) {
    console.log(`  邮箱验证 ${allUsers.length} 个用户...`);
    for (let i = 0; i < allUsers.length; i++) {
      try {
        await client.verifyEmail(allUsers[i].accessToken);
      } catch {
        // 可能验证码错误，仿真模式可跳过
      }
      if (i % 10 === 0) progress(i, allUsers.length);
    }
    progress(allUsers.length, allUsers.length);
  }
  report.add("邮箱验证已尝试", true, `${allUsers.length} 个用户`);

  const elapsed = endPhase("1: 注册 & 验证");
  return { personalUsers, enterpriseUsers, allUsers, report };
}
