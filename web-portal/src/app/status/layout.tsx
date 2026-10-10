import type { Metadata } from "next";

/**
 * 系统状态页 segment metadata（status/page.tsx 为客户端组件，无法导出 metadata，
 * 故在此段布局中声明；对齐 P2-3「每页 SEO 元数据」要求）
 */
export const metadata: Metadata = {
  title: "系统状态 — 3Cloud",
  description: "实时查看 3Cloud 各 API 端点与服务状态",
  openGraph: {
    title: "系统状态 — 3Cloud",
    description: "实时查看 3Cloud 各 API 端点与服务状态",
    type: "website",
  },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
