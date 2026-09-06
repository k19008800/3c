/**
 * 控制台 i18n 层单元测试 — 覆盖 normalizeLang / resolveLang / makeT / fetchDictionary。
 * 纯 TS 逻辑，不依赖 DOM/axios 实体；fetch 通过 globalThis.fetch mock 注入。
 *
 * @module lib/i18n.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CONSOLE_LANGS,
  normalizeLang,
  resolveLang,
  makeT,
  fetchDictionary,
  EN_DEFAULTS,
  getI18nLang,
  readPortalLang,
  readCookie,
} from "./i18n";

describe("normalizeLang", () => {
  it("接受 8 个合法语言白名单", () => {
    // 8 语言：zh-CN / en / ja-JP / ko-KR / vi / th / id / fil
    expect(normalizeLang("zh-CN")).toBe("zh-CN");
    expect(normalizeLang("en")).toBe("en");
    expect(normalizeLang("ja-JP")).toBe("ja-JP");
    expect(normalizeLang("ko-KR")).toBe("ko-KR");
    expect(normalizeLang("vi")).toBe("vi");
    expect(normalizeLang("th")).toBe("th");
    expect(normalizeLang("id")).toBe("id");
    expect(normalizeLang("fil")).toBe("fil");
    // CONSOLE_LANGS 长度与内容断言，防误改
    expect(CONSOLE_LANGS).toEqual(["zh-CN", "en", "ja-JP", "ko-KR", "vi", "th", "id", "fil"]);
  });

  it("非法/未归一化语言回落 zh-CN", () => {
    expect(normalizeLang("zh_cn")).toBe("zh-CN");
    expect(normalizeLang("en_US")).toBe("zh-CN");
    expect(normalizeLang("fr")).toBe("zh-CN");
    expect(normalizeLang("")).toBe("zh-CN");
    expect(normalizeLang(null)).toBe("zh-CN");
    expect(normalizeLang(undefined)).toBe("zh-CN");
    expect(normalizeLang("  ")).toBe("zh-CN");
  });
});

describe("resolveLang 优先级 (?lang > localStorage > navigator > 默认)", () => {
  it("?lang 合法时最高优先", () => {
    expect(resolveLang("ja-JP", "en", "th")).toBe("ja-JP");
    expect(resolveLang("ko-KR", "en", "id")).toBe("ko-KR");
  });

  it("无 ?lang 时 localStorage 优先于 navigator", () => {
    expect(resolveLang(null, "en", "vi")).toBe("en");
    expect(resolveLang(undefined, "ja-JP", "th")).toBe("ja-JP");
  });

  it("无 ?lang 且无 localStorage 时 navigator.language 生效", () => {
    expect(resolveLang(null, null, "vi")).toBe("vi");
    expect(resolveLang(undefined, undefined, "th")).toBe("th");
  });

  it("全部缺失/非法时回落 zh-CN", () => {
    expect(resolveLang(null, null, null)).toBe("zh-CN");
    expect(resolveLang("", "", "")).toBe("zh-CN");
    expect(resolveLang("fr", "de", "es")).toBe("zh-CN");
  });

  it("?lang 非法时不吞掉后续 localStorage/navigator 判定", () => {
    expect(resolveLang("fr", "en", "th")).toBe("en");
    expect(resolveLang("fr", null, "ja-JP")).toBe("ja-JP");
  });
});

describe("makeT（回退链 dict → EN_DEFAULTS → key 原文）", () => {
  it("命中词典 key 返回翻译值", () => {
    const t = makeT({ "nav.dashboard": "控制台" });
    expect(t("nav.dashboard")).toBe("控制台");
  });

  it("词典缺 key 回退 EN_DEFAULTS 英文源语", () => {
    const t = makeT({});
    expect(t("common.login")).toBe(EN_DEFAULTS["common.login"]); // "Sign in"
    expect(t("nav.billing")).toBe("Billing");
  });

  it("EN_DEFAULTS 也缺则回退 key 原文", () => {
    const t = makeT({});
    expect(t("some.unknown.key")).toBe("some.unknown.key");
  });

  it("合并词典 + 回退共存", () => {
    const t = makeT({ "nav.dashboard": "仪表盘" });
    expect(t("nav.dashboard")).toBe("仪表盘");
    expect(t("common.logout")).toBe(EN_DEFAULTS["common.logout"]); // 词典没有，回退英文
    expect(t("nope.key")).toBe("nope.key");
  });

  it("支持 {param} 参数插值（方案 §2.3 参数化 message key 约定）", () => {
    const t = makeT({ "dashboard.subs.estimatedDays": "Est. available {days} days" });
    expect(t("dashboard.subs.estimatedDays", { days: "7" })).toBe("Est. available 7 days");
    // 未传参数时保留占位符原样
    expect(t("dashboard.subs.estimatedDays")).toBe("Est. available {days} days");
    // 中文模板插值
    const tZh = makeT({ "x.y": "预计可用 {days} 天" });
    expect(tZh("x.y", { days: 30 })).toBe("预计可用 30 天");
  });
});

describe("readPortalLang / 门户 cookie 兜底（首页语言 → 登录页一致性）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readCookie 解析 document.cookie 中的目标值", () => {
    vi.stubGlobal("document", { cookie: "foo=1; 3cloud_portal_lang=en; bar=2" });
    expect(readCookie("3cloud_portal_lang")).toBe("en");
    expect(readPortalLang()).toBe("en");
    expect(readCookie("missing")).toBeNull();
  });

  it("getI18nLang：localStorage 为空时读门户 cookie 生效", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null } });
    vi.stubGlobal("document", { cookie: "3cloud_portal_lang=ja-JP" });
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(getI18nLang()).toBe("ja-JP");
  });

  it("getI18nLang：localStorage 已有值时优先于门户 cookie", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "vi" } });
    vi.stubGlobal("document", { cookie: "3cloud_portal_lang=en" });
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(getI18nLang()).toBe("vi");
  });
});

describe("fetchDictionary（scope 合并 + 失败兜底）", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("多 scope 逗号合并并返回合并 key->value 映射", async () => {
    const requestedScopes: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      const u = new URL(url, "http://localhost");
      requestedScopes.push(u.searchParams.get("scope") ?? "");
      if (u.searchParams.get("scope") === "console") {
        return { ok: true, json: async () => ({ data: { "nav.dashboard": "仪表盤", "nav.billing": "請求" } }) };
      }
      if (u.searchParams.get("scope") === "common") {
        return { ok: true, json: async () => ({ data: { "common.login": "ログイン" } }) };
      }
      return { ok: false, json: async () => ({}) };
    }) as unknown as typeof fetch;
    globalThis.fetch = fetchMock as any;

    const consoleDict = await fetchDictionary("ja-JP", ["console"]);
    const commonDict = await fetchDictionary("ja-JP", ["common"]);
    expect(consoleDict["nav.dashboard"]).toBe("仪表盤");
    expect(commonDict["common.login"]).toBe("ログイン");

    // 验证每个请求确实带上了对应 scope（逗号合并逻辑见下一用例）
    expect(requestedScopes).toContain("console");
    expect(requestedScopes).toContain("common");
  });

  it("多 scope 传入时单个请求逗号合并成一条 scope 参数", async () => {
    const spy = vi.fn(async (url: string) => {
      const u = new URL(url, "http://localhost");
      expect(u.searchParams.get("scope")).toBe("console,common");
      return { ok: true, json: async () => ({ data: { "common.login": "Sign in", "nav.dashboard": "Dashboard" } }) };
    }) as unknown as typeof fetch;
    globalThis.fetch = spy as any;
    const dict = await fetchDictionary("en", ["console", "common"]);
    expect(dict["common.login"]).toBe("Sign in");
    expect(dict["nav.dashboard"]).toBe("Dashboard");
  });

  it("HTTP 非 2xx 返回 {}（回退兜底）", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false })) as any;
    const dict = await fetchDictionary("en", ["console", "common"]);
    expect(dict).toEqual({});
  });

  it("网络异常（fetch 抛错）返回 {}（回退兜底）", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); }) as any;
    const dict = await fetchDictionary("ja-JP", ["console"]);
    expect(dict).toEqual({});
  });

  it("无 scope 返回空映射", async () => {
    const dict = await fetchDictionary("en", []);
    expect(dict).toEqual({});
  });
});