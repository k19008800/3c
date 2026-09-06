/**
 * 控制台格式化本地化封装 — P1 骨架（方案 §2.5）
 *
 * 语言只改显示层格式化，不做汇率换算、本币结算口径不变（方案决策）。
 * 时区与语言解耦：语言决定 locale 与文案，时区仍由浏览器/设备决定。
 *
 * @see docs/多语言i18n改造方案.md §2.5
 * @module lib/fmt
 */

import { getI18nLang } from "./i18n";

/**
 * 当前展示 locale：en 映射为 en-US（Intl 更完整支持），其余直接用语言代码。
 * 用于 toLocaleString / Intl.NumberFormat 等。
 */
export const curLocale = (): string => (getI18nLang() === "en" ? "en-US" : getI18nLang());

/** 数字格式化（千分位 + 本地化小数位） */
export const fmtNumber = (n: number, opts?: Intl.NumberFormatOptions): string =>
  n.toLocaleString(curLocale(), opts);

/** 金额格式化（货币样式）；默认本币 CNY，仅显示层格式化不做汇率换算 */
export const fmtMoney = (n: number, currency = "CNY"): string =>
  new Intl.NumberFormat(curLocale(), { style: "currency", currency }).format(n);

/** 日期/时间格式化 */
export const fmtDate = (d: Date | number | string, opts?: Intl.DateTimeFormatOptions): string =>
  new Date(d).toLocaleString(curLocale(), opts);