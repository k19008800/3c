/**
 * 权限点鉴权 preHandler — requirePerm(permKey)（P0-3 假授权修复）
 *
 * 替代资金路由的 adminAuth 角色白名单：JWT 登录校验 + 权限点判定（组合守卫）。
 * 与 adminAuth 的区别：adminAuth 只认 admin/super_admin 两个硬编码角色；
 * 本守卫按 ROLE_PERMS 静态映射（lib/permissions.ts）判定，支持 finance 等
 * 细粒度角色，使权限树授予的权限点真实生效。
 *
 * 登录失败 401（UNAUTHORIZED），无权限 403（FORBIDDEN），与现状 adminAuth
 * 越权同码，前端 extractError 无需改动。
 *
 * @see docs/ARCH-整改R1-R4-技术方案.md §5.3
 * @see lib/permissions.ts hasPerm
 * @module middleware/require-perm
 */

import { verifyToken } from '../services/auth/jwt';
import { hasPerm } from '../lib/permissions';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

/**
 * 权限点鉴权 preHandler 工厂。
 *
 * @param permKey - 权限点 key，如 'finance.topup' / 'finance.adjust'
 * @returns Fastify preHandler（request / reply）
 * @throws {UnauthorizedError} 401 未登录 / Token 缺失或失效
 * @throws {ForbiddenError} 403 无该权限点（越权）
 */
export function requirePerm(permKey: string) {
  return async (request: any, _reply: any) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) throw new UnauthorizedError('Missing token');
    const payload = verifyToken(token);
    if (!payload) throw new UnauthorizedError('Invalid or expired token');
    request.userContext = payload;                       // 与 adminAuth 一致注入
    const { role } = payload as { role: string };
    if (!hasPerm(role, permKey)) {
      throw new ForbiddenError(`无权限执行该操作（需要权限点 ${permKey}）`);
    }
  };
}
