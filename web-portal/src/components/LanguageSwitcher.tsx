"use client";

import { useState } from "react";
import { PORTAL_LANGS, LANG_COOKIE, type PortalLang } from "../lib/i18n";
import { ButtonHelp } from "./Help";

/**
 * Portal 语言切换器（客户端组件）
 *
 * 写入 cookie `3cloud_portal_lang`（path=/，1 年），并跳到当前路径（去掉 query，
 * 避免 ?lang= 查询参数覆盖 cookie）；页面为服务端渲染，跳转后整体刷新。
 * 按钮旁带 [?] 帮助（对齐 PRODUCT-DESIGN-PRINCIPLES.md P1 按钮级帮助）。
 *
 * @module components/LanguageSwitcher
 */

const LANG_LABELS: Record<PortalLang, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

export function LanguageSwitcher({ current }: { current: PortalLang }) {
  const [lang, setLang] = useState<PortalLang>(current);

  const switchLang = (next: PortalLang) => {
    if (next === lang) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    window.location.href = window.location.pathname;
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <select
        value={lang}
        onChange={(e) => switchLang(e.target.value as PortalLang)}
        aria-label="语言 / Language"
        title="语言 / Language"
        style={{
          padding: "6px 8px",
          borderRadius: 6,
          border: "1px solid #cbd5e1",
          background: "#fff",
          fontSize: 13,
          color: "#0f172a",
          cursor: "pointer",
        }}
      >
        {PORTAL_LANGS.map((l) => (
          <option key={l} value={l}>
            {LANG_LABELS[l]}
          </option>
        ))}
      </select>
      <ButtonHelp text="切换门户显示语言；未翻译的文案将显示英文原文。" />
    </span>
  );
}
