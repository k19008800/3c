import { pgTable, serial, varchar, pgEnum, timestamp, boolean } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'customer',
  'agent',
  'admin',
  'super_admin',
]);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  role: userRoleEnum('role').notNull().default('customer'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  customerType: varchar('customer_type', { length: 20 }).notNull().default('personal'),
  realNameStatus: varchar('real_name_status', { length: 20 }).notNull().default('unverified'),
  isContract: boolean('is_contract').notNull().default(false),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  phone: varchar('phone', { length: 30 }),
  emailVerified: timestamp('email_verified'),
  twoFactorEnabled: varchar('two_factor_enabled', { length: 1 }).default('0'),
  lastLoginAt: timestamp('last_login_at'),
  lastLoginIp: varchar('last_login_ip', { length: 50 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
