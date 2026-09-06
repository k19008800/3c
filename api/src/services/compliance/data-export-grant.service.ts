/**
 * 数据导出授权服务 — 用户端「数据导出」能力开关的授权校验（PRD-数据导出授权管理 §4）
 *
 * 职责：
 * - assertDataExportGranted(userId)：未授权（无记录或 is_enabled=false）抛 403
 *   DATA_EXPORT_NOT_GRANTED。用于用户端 /me/data-export/* 四接口（download 例外）。
 * - getGrantStatus(userId)：返回 { granted, isEnabled }，供前端判断菜单显隐
 *   （菜单显示条件 = granted && enabled）。
 *
 * 关键取舍（PRD §4.3）：授权是「能力开关」，已生成的导出文件是历史成果。
 * download 接口不调用本服务（或查询但仅当 exported 放行），避免授权查询失败/
 * 缺失误 403 download。本服务只做能力入口校验，不涉及导出文件下载。
 *
 * @module services/compliance
 * @see docs/PRD-数据导出授权管理.md §4 用户端规则
 */
import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { DataExportNotGrantedError } from '../../lib/errors.js';

/** 授权状态查询结果 */
export interface DataExportGrantStatus {
  /** 是否有授权记录 */
  granted: boolean;
  /** 当前是否启用 */
  isEnabled: boolean;
}

/**
 * 断言当前用户已获数据导出授权（有记录且 is_enabled=true）。
 *
 * 未授权（无记录或 is_enabled=false）抛 403 DATA_EXPORT_NOT_GRANTED。
 * 用于用户端能力入口（request / requests / :id / :id/cancel），download 例外。
 *
 * @param userId - 目标用户 id
 * @throws {DataExportNotGrantedError} 403 未授权使用数据导出功能
 */
export async function assertDataExportGranted(userId: number): Promise<void> {
  const status = await getGrantStatus(userId);
  if (!status.granted || !status.isEnabled) {
    throw new DataExportNotGrantedError();
  }
}

/**
 * 查询当前用户的授权状态（granted=是否有记录；isEnabled=当前是否启用）。
 *
 * 不抛异常：无论有无记录都返回结构化结果，供前端菜单显隐判断
 * （前端用 granted && isEnabled）。查询失败/无记录返回 granted=false。
 *
 * @param userId - 目标用户 id
 * @returns {DataExportGrantStatus} 授权状态
 */
export async function getGrantStatus(userId: number): Promise<DataExportGrantStatus> {
  const [row] = await db
    .select({ isEnabled: schema.dataExportGrants.isEnabled })
    .from(schema.dataExportGrants)
    .where(eq(schema.dataExportGrants.userId, userId))
    .limit(1);
  if (!row) return { granted: false, isEnabled: false };
  return { granted: true, isEnabled: row.isEnabled };
}
