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
import { UnauthorizedError, ForbiddenError, AppError } from '../lib/errors';

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

/**
 * 敏感写操作「模拟身份拦截」守卫（D1，kb/3cloud/admin-impersonate.md）。
 *
 * 管理员以用户身份登录后签发「模拟令牌」（payload 带 impersonateBy）。凡该令牌访问
 * 资金/权限敏感写端点 → 直接 403 IMPERSONATION_BLOCKED，禁止以模拟身份执行资金变动、
 * 权限变更、删除账号等高风险写操作。只读 GET 不拦截。
 *
 * 用法（建议放在 preHandler 数组最前，先于 adminAuth/requirePerm 执行，返回独立错误码）：
 *   app.patch('/api/v1/admin/customers/:id/status',
 *     { preHandler: [requireNotImpersonated(), adminAuth] }, ...)
 *
 * 该守卫自行校验 JWT 并注入 request.userContext（仿 requirePerm），因此对已带
 * adminAuth / requirePerm 的端点叠加也安全；普通令牌（无 impersonateBy）直接放行。
 *
 * @throws {UnauthorizedError} 401 未登录 / Token 缺失或失效
 * @throws {AppError} 403 IMPERSONATION_BLOCKED 模拟令牌访问敏感写端点
 */
export function requireNotImpersonated() {
  return async (request: any, _reply: any) => {
    const authHeader = request.headers.authorization;
    const token = authHeader?.split(' ')[1];
    if (!token) throw new UnauthorizedError('Missing token');
    const payload = verifyToken(token);
    if (!payload) throw new UnauthorizedError('Invalid or expired token');
    request.userContext = payload;
    if (payload.impersonateBy) {
      throw new AppError(
        '模拟身份下禁止执行敏感资金/权限写操作（如需操作请先退出模拟）',
        403,
        'IMPERSONATION_BLOCKED',
      );
    }
  };
}
