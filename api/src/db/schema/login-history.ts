import { pgTable, serial, integer, varchar, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * 用户登录历史（SecurityPage 登录历史面板数据源，migration 0035）
 *
 * 由 auth.ts 登录处理器在登录成功/失败时写入；GET /me/login-history 按用户读取。
 * success=false 或 risk_level='blocked' 视为失败记录（前端渲染）。
 * city 无地理反查，默认 NULL。
 */
export const loginHistory = pgTable(
  'login_history',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    /** 登录是否成功：true 成功 / false 失败 */
    success: boolean('success').notNull().default(true),
    ip: varchar('ip', { length: 50 }),
    city: varchar('city', { length: 100 }),
    browser: varchar('browser', { length: 100 }),
    os: varchar('os', { length: 100 }),
    /** 设备信息（jsonb）：{ os, browser, user_agent, ... } */
    deviceInfo: jsonb('device_info'),
    /** 风控等级，如 'blocked' / null */
    riskLevel: varchar('risk_level', { length: 20 }),
    loginAt: timestamp('login_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_login_history_user').on(t.userId, t.loginAt),
  ],
);