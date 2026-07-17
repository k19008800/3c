// ============================================================
//  3cloud (3C) — 登录风控 封禁管理
// ============================================================

import { getRedis } from "../../redis.js";

const KEY = {
  banIp: (ip: string) => `risk:ban:ip:${ip}`,
  banUser: (uid: number) => `risk:ban:user:${uid}`,
  failIp: (ip: string) => `risk:fail:ip:${ip}`,
  failUser: (uid: number) => `risk:fail:user:${uid}`,
};

/**
 * 检查用户是否被封禁
 */
export async function isUserBanned(userId: number): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(KEY.banUser(userId))) === 1;
}

/**
 * 检查 IP 是否被封禁
 */
export async function isIpBanned(ip: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(KEY.banIp(ip))) === 1;
}

/**
 * 手动解封 IP（管理后台调用）
 */
export async function clearIpBan(ip: string): Promise<void> {
  const redis = getRedis();
  await redis.del(KEY.banIp(ip));
  await redis.del(KEY.failIp(ip));
}

/**
 * 手动解封用户（管理后台调用）
 */
export async function clearUserBan(userId: number): Promise<void> {
  const redis = getRedis();
  await redis.del(KEY.banUser(userId));
  await redis.del(KEY.failUser(userId));
}
