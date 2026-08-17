import { NextRequest, NextResponse } from "next/server";
import { LANG_COOKIE } from "./lib/i18n";

/**
 * Portal 语言中间件（P2-3）
 *
 * 作用：当请求携带 ?lang=en|zh-CN 时，把该语言写入 cookie（3cloud_portal_lang），
 * 使 Layout（导航/页脚/<html lang>）与页面正文语言保持一致——页面已按 searchParams
 * 渲染，Layout 只读 cookie，二者必须同源。
 *
 * 不做重定向：保留 ?lang= URL（hreflang/SEO 直链可被爬虫抓取对应语言变体）。
 * 语言切换器本身直接写 cookie 并跳转 pathname（去掉 query），不依赖本中间件。
 *
 * 排除路径：控制台 SPA（/app/*）、API 代理（/api /v1 /anthropic /health）、
 * 静态资源与 Next 内部路径。
 *
 * @see docs/SPEC-§23-系统级能力增强.md §23.4
 * @module middleware
 */

export function middleware(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang");
  if (lang === "en" || lang === "zh-CN") {
    const response = NextResponse.next();
    response.cookies.set(LANG_COOKIE, lang, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return response;
  }
  return NextResponse.next();
}

export const config = {
  // 只拦截门户页面路由；跳过控制台 SPA、API 代理与静态资源
  matcher: [
    "/((?!api/|app/|v1/|anthropic/|health|_next/|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)",
  ],
};
