/**
 * 终局打磨：页面级描边图标集（规范 §8 原创性 —— 替换残留 emoji）
 * 几何与 ConsoleLayout ICON_PATHS 同源：24×24 viewBox，stroke=currentColor，
 * strokeWidth 1.8，round cap/join。颜色随父级 currentColor。
 *
 * 仅用于 pages/ 内各页面；不改动 shared-ui。
 */
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  doc: <><path d="M7 3h7l5 5v13H7V3z"/><path d="M14 3v5h5M10 13h4M10 17h4"/></>,
  coin: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.6-2.5 1.7-2.5.7-2.5 1.7 1 1.7 2.5 1.7 2.5-.7 2.5-1.7"/></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  rocket: <><path d="M12 15c4-4 5.5-9 5.5-9S13 7 9 11l3 4z"/><circle cx="12" cy="9" r="1.5"/><path d="M9 15l-3 1 1.5 3M12 15l.5 4 3-1.5"/></>,
  scale: <><path d="M12 4v16M8 20h8M6 6h12"/><path d="M6 6l-3 6a3 3 0 006 0L6 6zM18 6l-3 6a3 3 0 006 0l-3-6z"/></>,
  alert: <><path d="M12 3L2 20h20L12 3z"/><path d="M12 10v4M12 17h.01"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
  ticket: <><path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 000-4V8z"/><path d="M13 7v10" strokeDasharray="2 2"/></>,
  trendUp: <><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
  trendDown: <><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></>,
  chart: <><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></>,
  signal: <path d="M4 20v-4M9 20v-7M14 20v-10M19 20V4"/>,
  plug: <><path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 01-10 0V8zM12 17v4"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>,
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></>,
  users: <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 010 7"/><path d="M17.5 14.6c2 .8 3.4 2.4 4 5.4"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></>,
  key: <><circle cx="8" cy="15" r="4"/><path d="M11 12L20 3M16 7l3 3"/></>,
  receipt: <><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3z"/><path d="M9 8h6M9 12h6"/></>,
  download: <><path d="M12 4v11M7 11l5 5 5-5"/><path d="M4 20h16"/></>,
  id: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.8 1.8-2.7 3-2.7s2.5.9 3 2.7M15 9h4M15 13h4"/></>,
  ban: <><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></>,
  edit: <><path d="M4 20h4L20 8l-4-4L4 16v4z"/><path d="M13 7l4 4"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></>,
  banknote: <><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></>,
  bank: <><path d="M3 10l9-6 9 6"/><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18"/></>,
  ruler: <path d="M3 15L15 3l6 6L9 21l-6-6z"/>,
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"/>,
  link: <><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.5-1.5"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></>,
  bell: <><path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 20a2 2 0 004 0"/></>,
  megaphone: <><path d="M3 10v4h4l9 5V5L7 10H3z"/><path d="M18 9a4 4 0 010 6"/></>,
  chat: <path d="M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z"/>,
  book: <><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z"/><path d="M4 19a2 2 0 012-2h13"/></>,
  scroll: <><path d="M8 3h11v18H8a3 3 0 01-3-3V6a3 3 0 013-3z"/><path d="M8 3a3 3 0 00-3 3M10 8h6M10 12h6"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></>,
  building: <><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></>,
  phone: <><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></>,
  bot: <><rect x="4" y="8" width="16" height="11" rx="2"/><path d="M12 8V4M8 3h8M2 12v3M22 12v3"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/></>,
  sliders: <><path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/></>,
  crystal: <><path d="M12 3l4 6-4 12-4-12 4-6z"/><path d="M8 9h8"/></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 18a2 2 0 001.8 3h11.4a2 2 0 001.8-3L14 9V3"/><path d="M7 15h10"/></>,
  palette: <><path d="M12 3a9 9 0 000 18h2a2.5 2.5 0 000-5h-1.5a1.5 1.5 0 010-3H16a5 5 0 000-10h-4z"/><circle cx="7.5" cy="10" r="1"/><circle cx="10" cy="7" r="1"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></>,
  refresh: <><path d="M4 12a8 8 0 0114-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 01-14 5.3L4 15"/><path d="M4 20v-5h5"/></>,
  swap: <><path d="M7 4L3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/></>,
  trophy: <><path d="M8 4h8v5a4 4 0 01-8 0V4z"/><path d="M8 5H5a3 3 0 003 4M16 5h3a3 3 0 01-3 4M12 13v4M8 21h8M9 17h6"/></>,
  send: <path d="M22L2 10l7 2.5L13 20l2.5-6.5L22 14z"/>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8s-1.5-5-4-5-3 3-1.5 4H12zM12 8s1.5-5 4-5 3 3 1.5 4H12z"/></>,
  camera: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7l1.5-3h5L16 7"/><circle cx="12" cy="13" r="3.5"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  upload: <><path d="M12 16V5M7 10l5-5 5 5"/><path d="M4 20h16"/></>,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="1"/><path d="M2 20h20"/></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>,
  video: <><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3"/></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></>,
  volume: <><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/></>,
  star: <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z"/>,
  pin: <><path d="M9 4h6l-1 6 3 3H7l3-3-1-6z"/><path d="M12 13v8"/></>,
  save: <><path d="M5 3h11l3 3v15H5V3z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></>,
  paperclip: <path d="M20 12l-8.5 8.5a5 5 0 01-7-7L13 5a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L15 7"/>,
  box: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></>,
  hand: <path d="M8 12V5.5a1.5 1.5 0 013 0V11M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7-3 0-4.5-1.5-6-4l-1.8-3.5c-.5-1 .2-2 1.3-1.6L8 12z"/>,
  snow: <path d="M12 2v20M4 6l16 12M20 6L4 18"/>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M3 17l5-5 4 4 3-3 6 6"/></>,
  tag: <><path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="8" cy="9" r="1.3"/></>,
  close: <path d="M6 6l12 12M18 6L6 18"/>,
};

export function PIcon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, verticalAlign: "-3px" }}
    >
      {PATHS[name] ?? PATHS.doc}
    </svg>
  );
}
