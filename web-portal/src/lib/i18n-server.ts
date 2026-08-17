/**
 * Portal i18n 服务端专属工具（P2-3）
 *
 * 与 lib/i18n.ts 分离的原因：lib/i18n.ts 会被客户端组件（LanguageSwitcher）引用，
 * 而本文件使用 next/headers（cookies）属于 Server Component 专属 API，
 * 混在一起会导致客户端打包报错（"next/headers only works in a Server Component"）。
 *
 * @module lib/i18n-server
 */

import { cookies } from "next/headers";
import { normalizeLang, DEFAULT_LANG, LANG_COOKIE, type PortalLang } from "./i18n";

/** 服务端读取语言 cookie（Next 15 cookies() 为异步 API） */
export async function getCookieLang(): Promise<PortalLang> {
  try {
    const store = await cookies();
    return normalizeLang(store.get(LANG_COOKIE)?.value);
  } catch {
    return DEFAULT_LANG;
  }
}
