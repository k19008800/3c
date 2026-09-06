/**
 * 控制台 App 壳层语言 Provider — P1 骨架（评审要点 A/B：覆盖登录前后 + 防闪现抖动）
 *
 * 三合一 SPA 的登录页/注册页/Vendor 登录注册**不在 ConsoleLayout 内**，因此语言上下文
 * 必须挂在本应用壳层（main.tsx 中 BrowserRouter 内、<App/> 外），覆盖登录前后全部页面。
 *
 * 持久化优先级（评审要点 B 防抖）：
 *   挂载时**同步**读 localStorage（含 ?lang 参数优先）立即渲染 → 
 *   登录后（有 token 时）异步拉 GET /me/settings 的 language 再整体切换一次，
 *   避免「闪现默认 → 切用户语言」抖动。
 *
 * 切换：setLanguage(lang) → 写 localStorage + 拉词典，登录态下 best-effort 调 PUT /me/settings。
 *
 * @see docs/多语言i18n改造方案.md §2.2 / §2.3(3)
 * @module lib/i18n-context
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";
import { useAuthStore } from "../store/auth";
import {
  normalizeLang,
  resolveLang,
  loadDicts,
  getDict,
  makeT,
  LANG_KEY,
  PORTAL_LANG_COOKIE,
  readPortalLang,
  type I18nLang,
} from "./i18n";

interface I18nContextValue {
  /** 当前语言（已规范化，8 语言白名单） */
  lang: I18nLang;
  /** 翻译函数：dict[key] ?? EN_DEFAULTS[key] ?? key；支持可选 {param} 参数插值 */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 是否已就绪（词典加载完成或已回退兜底；首期保证框架可用，不渲染用不到但保留供未来 P2 门控） */
  isReady: boolean;
  /** 切换语言：写 localStorage + 拉词典；登录态下 best-effort 写后端 /me/settings */
  setLanguage: (lang: I18nLang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** 从 localStorage 同步读取持久化语言（浏览器环境守卫，便于测试/SSR） */
function readPersistedLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

/**
 * 同步读取「会话前」默认语言：?lang > localStorage > 门户 cookie > navigator.language > zh-CN。
 * 挂载首帧同步调用，避免闪现默认语言。
 * 门户 cookie（readPortalLang，写于首页 LanguageSwitcher）作为兜底源插入 localStorage 与
 * navigator 之间，保证「用户先在首页切换语言 → 进入控制台登录页时语言跟随」的一致性。
 */
function initialLangFromUrl(param: string | null): I18nLang {
  const persisted = readPersistedLang() ?? readPortalLang() ?? null;
  const nav = typeof navigator !== "undefined" ? navigator.language : undefined;
  return resolveLang(param, persisted, nav);
}

/** 校验某值是否属于合法语言（8 语言白名单；供 server /me/settings 覆盖判断） */
function isLegalLang(v: unknown): v is I18nLang {
  return (
    typeof v === "string" &&
    ["zh-CN", "en", "ja-JP", "ko-KR", "vi", "th", "id", "fil"].includes(v)
  );
}

/**
 * App 壳层语言 Provider。
 *
 * @param children - 应用子树（<App/>）
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);

  // ?lang 查询参数（html > 其它）— 仅在 Router 内解析
  const [searchParams] = useSearchParams();
  const urlLangParam = searchParams.get("lang");

  // 首帧同步选定语言；lang 变更时同步切换状态
  const [lang, setLang] = useState<I18nLang>(() => initialLangFromUrl(urlLangParam));
  const [dict, setDict] = useState<Record<string, string>>(() => getDict());
  const [isReady, setIsReady] = useState(false);

  // ── 切入某语言的词典（异步拉取 + 更新） ──
  const applyLang = useCallback(async (next: I18nLang) => {
    setLang(next);
    const merged = await loadDicts(next); // 模块级缓存；失败保持旧缓存返回 {}
    setDict(merged);
    setIsReady(true);
  }, []);

  // ── 首次挂载：同步值已用 useState 初始化；这里负责拉词典 + 标记就绪 ──
  useEffect(() => {
    // 若 ?lang= 与初始化不一致（理论上同源，防御）则以 ?lang 为准
    let active = true;
    (async () => {
      const merged = await loadDicts(lang);
      if (active) {
        setDict(merged);
        setIsReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [lang]);

  // ── 登录后：异步覆盖用户语言（防「默认→用户语言」闪现） ──
  useEffect(() => {
    if (!token) return;
    let active = true;
    (async () => {
      try {
        const res = await api.get<{ language?: string }>("/me/settings");
        const serverLang = res?.data?.language;
        if (active && serverLang && isLegalLang(serverLang)) {
          const next = normalizeLang(serverLang);
          try {
            window.localStorage.setItem(LANG_KEY, next);
          } catch {
            /* localStorage 不可用时忽略 */
          }
          await applyLang(next);
        }
      } catch {
        /* /me/settings 未就绪或后端未实现 → 保持当前语言（被 localStorage/navigator 兜底） */
      } finally {
        // isReady 已由词典加载标记；Get settings 失败无需额外处理
      }
    })();
    return () => {
      active = false;
    };
    // 依赖只在 token 变化时触发；applyLang 稳定
  }, [token]);

  // ── 切换语言（顶栏语言下拉调用） ──
  const setLanguage = useCallback(
    (next: I18nLang) => {
      // 先写本地（同步可见），再拉词典；全局重渲染但保持当前路由，不破坏表单
      try {
        window.localStorage.setItem(LANG_KEY, next);
      } catch {
        /* 忽略 */
      }
      // 同步门户首页 cookie（path=/，与首页 LanguageSwitcher 同域同 key），保证首页/登录页语言一致
      try {
        document.cookie = `${PORTAL_LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      } catch {
        /* cookie 不可用时忽略，不影响 localStorage 兜底 */
      }
      void applyLang(next);
      // 登录态下 best-effort 写后端（不同步等待；失败静默）
      if (token) {
        void api.put("/me/settings", { language: next }).catch(() => {});
      }
    },
    [token, applyLang],
  );

  const t = useMemo(() => makeT(dict), [dict]);

  const value = useMemo<I18nContextValue>(
    () => ({ lang, t, isReady, setLanguage }),
    [lang, t, isReady, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * 消费语言上下文。必须在 <I18nProvider> 内调用。
 *
 * @returns { lang, t, isReady, setLanguage }
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within <I18nProvider>");
  }
  return ctx;
}

// getI18nLang 供 fmt.ts 等非 React 环境读取，已由 ./i18n 直接导出，此处不重复 re-export。