/**
 * 系统级 IP 黑名单服务 — 校验 + 匹配 + 网关拦截查询（P2-4）
 *
 * 职责：
 * - IP / CIDR 格式校验（管理端 CRUD 复用）
 * - 单 IP 精确匹配 + IPv4 CIDR 网段匹配（手写掩码，禁止新增依赖）
 * - checkIpBlocked：网关 onRequest hook 的拦截查询（status=active 且未过期）
 *
 * 拦截语义（对齐 kb/3cloud/admin-security-ip-blacklist.md）：
 * - scope='api'   → 仅拦截 AI 网关路径（/v1/*、/anthropic/v1/*）
 * - scope='admin' → 仅拦截管理后台路径（/api/v1/admin/*）
 * - scope='all'   → 两者都拦截
 * - expires_at 过期自动失效（status 仍为 active 但不再命中，管理端可续期/解禁）
 *
 * @module services/security
 * @see kb/3cloud/admin-security-ip-blacklist.md
 * @see docs/iteration-plan-v2.md P2-4
 */

import { db, schema } from '../../db';
import { and, eq, inArray, isNull, or, gt, sql } from 'drizzle-orm';

/** IPv4 段数 */
const IPV4_PARTS = 4;

/**
 * 解析 IPv4 为 32 位整数（大端）。
 *
 * @param ip - IPv4 点分十进制字符串，如 '192.168.1.1'
 * @returns 32 位无符号整数；非法格式返回 null
 */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== IPV4_PARTS) return null;
  let result = 0;
  for (const part of parts) {
    // 拒绝前导零（'01'）与空段，避免 '1.2.3.04' 之类歧义输入
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null;
    const n = Number(part);
    if (n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/**
 * 校验 IPv4 地址格式。
 *
 * @param ip - 待校验字符串
 * @returns true = 合法 IPv4
 */
export function isValidIpv4(ip: string): boolean {
  return ipv4ToInt(ip) !== null;
}

/**
 * 校验 IPv6 地址格式（基础启发式，仅支持单 IP 精确匹配；CIDR 仅支持 IPv4）。
 *
 * 不做完整 RFC 4291 解析：只要包含 ':'、字符集合法、段数合理即视为合法，
 * 足够防止脏数据入库；匹配侧为字符串精确比较。
 *
 * @param ip - 待校验字符串
 * @returns true = 形如合法 IPv6
 */
export function isValidIpv6(ip: string): boolean {
  if (!ip.includes(':')) return false;
  if (!/^[0-9a-fA-F:]+$/.test(ip)) return false;
  const parts = ip.split(':');
  if (parts.length < 3 || parts.length > 8) return false;
  // 至多一个 '::'（空段压缩）
  const emptyCount = parts.filter((p) => p === '').length;
  return emptyCount <= 1;
}

/**
 * 校验 IPv4 CIDR 网段格式（如 192.168.1.0/24）。
 *
 * @param value - 待校验字符串
 * @returns true = 合法 IPv4 CIDR（前缀 0–32）
 */
export function isValidCidr(value: string): boolean {
  const idx = value.indexOf('/');
  if (idx <= 0) return false;
  const base = value.slice(0, idx);
  const prefixStr = value.slice(idx + 1);
  if (!/^\d{1,2}$/.test(prefixStr)) return false;
  const prefix = Number(prefixStr);
  if (prefix < 0 || prefix > 32) return false;
  return isValidIpv4(base);
}

/**
 * 校验单 IP 或 CIDR 网段（管理端添加/批量导入复用）。
 *
 * @param value - 待校验字符串
 * @returns true = 合法单 IP（IPv4/IPv6）或 IPv4 CIDR
 */
export function isValidIpOrCidr(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.includes('/')) return isValidCidr(v);
  return isValidIpv4(v) || isValidIpv6(v);
}

/**
 * 判断网段是否包含某 IPv4 地址（手写掩码匹配）。
 *
 * 算法：base 与 ip 各自转 32 位整数，prefix 位掩码后相等即命中。
 * 例如 192.168.1.0/24 包含 192.168.1.55：0xC0A80100 & 0xFFFFFF00 == 0xC0A80100。
 *
 * @param cidr - IPv4 CIDR 网段，如 '192.168.1.0/24'
 * @param ip - IPv4 地址，如 '192.168.1.55'
 * @returns true = 命中网段
 */
export function cidrContains(cidr: string, ip: string): boolean {
  const idx = cidr.indexOf('/');
  if (idx <= 0) return false;
  const base = ipv4ToInt(cidr.slice(0, idx));
  const prefix = Number(cidr.slice(idx + 1));
  const target = ipv4ToInt(ip);
  if (base === null || target === null || Number.isNaN(prefix)) return false;
  // prefix=0 → 掩码 0，匹配所有 IPv4（0.0.0.0/0）
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (base & mask) === (target & mask);
}

/**
 * 单条黑名单规则匹配：单 IP 精确比较；CIDR 走掩码匹配。
 *
 * @param ip - 请求来源 IP
 * @param entryIp - 黑名单规则 IP / 网段
 * @param entryType - 规则类型 'single' | 'cidr'
 * @returns true = 命中
 */
export function ipMatches(ip: string, entryIp: string, entryType: 'single' | 'cidr'): boolean {
  if (entryType === 'cidr') {
    // CIDR 仅支持 IPv4；IPv6 CIDR 入库时已被校验拦截，此处兜底不命中
    return isValidCidr(entryIp) && cidrContains(entryIp, ip);
  }
  // 单 IP：规范化后精确比较（IPv6 大小写归一）
  return ip.trim().toLowerCase() === entryIp.trim().toLowerCase();
}

/**
 * 网关拦截查询：给定来源 IP 与请求类别，判断是否命中生效中的黑名单。
 *
 * 命中条件：status='active' 且（expires_at IS NULL 或 expires_at > NOW()）
 * 且 scope ∈ {'all', 请求类别}，且 IP 匹配规则。
 *
 * 性能说明：每个网关/管理请求一次 DB 查询（走 idx_ip_blacklist_active 索引，
 * 黑名单行数级通常 < 100），正确性优先。
 * OPTIMIZE: 命中集稳定时可加 60s 内存缓存（按 ip+scope 键），
 * 前提：管理端写操作（增/改/解禁）后主动失效缓存；当前阶段黑名单量级无需缓存。
 *
 * @param ip - 请求来源 IP（Fastify request.ip）
 * @param scope - 请求类别：'api'（AI 网关）| 'admin'（管理后台）
 * @returns true = 应拦截（403）
 */
export async function checkIpBlocked(ip: string, scope: 'api' | 'admin'): Promise<boolean> {
  if (!ip) return false;
  const rows = await db
    .select({ ip: schema.ipBlacklist.ip, type: schema.ipBlacklist.type })
    .from(schema.ipBlacklist)
    .where(and(
      eq(schema.ipBlacklist.status, 'active'),
      inArray(schema.ipBlacklist.scope, ['all', scope]),
      or(
        isNull(schema.ipBlacklist.expiresAt),
        gt(schema.ipBlacklist.expiresAt, sql`NOW()`),
      ),
    ));

  for (const row of rows) {
    if (ipMatches(ip, row.ip, (row.type as 'single' | 'cidr') || 'single')) {
      return true;
    }
  }
  return false;
}
