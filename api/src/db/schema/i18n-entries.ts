import { pgTable, serial, varchar, text, integer, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * 国际化翻译条目（P2-3，对齐 SPEC-§23 §23.4 i18n 国际化架构）
 *
 * 管理端 /admin/i18n/entries CRUD 维护；Portal 前端按 key + lang 拉取渲染。
 * 语言策略：URL 子路径 /zh/pricing、/en/pricing（利于 SEO）；未翻译 key 英文 fallback。
 *
 * @see docs/SPEC-§23-系统级能力增强.md §23.4
 * @see docs/iteration-plan-v2.md P2-3
 */
export const i18nEntries = pgTable('i18n_entries', {
  id: serial('id').primaryKey(),
  /** 翻译键，如 'nav.pricing' / 'home.hero.title' */
  key: varchar('key', { length: 200 }).notNull(),
  /** 语言代码，如 'zh-CN' / 'en' */
  lang: varchar('lang', { length: 10 }).notNull().default('zh-CN'),
  /** 翻译文本 */
  value: text('value').notNull(),
  /** 作用域：'portal'（默认）/ 'console'（预留） */
  scope: varchar('scope', { length: 50 }).notNull().default('portal'),
  /** 'active' | 'disabled' */
  status: varchar('status', { length: 20 }).notNull().default('active'),
  /** 最后更新人（admin 用户 id） */
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  /** 同 key 同语言唯一 */
  keyLangUnique: uniqueIndex('idx_i18n_key_lang_unique').on(table.key, table.lang),
}));
