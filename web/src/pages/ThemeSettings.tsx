// ============================================================
//  3cloud (3C) — 主题设置页面
//  在个人设置中提供主题切换功能
// ============================================================

import ThemeSwitcher from '@/components/ThemeSwitcher'

export default function ThemeSettings() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <ThemeSwitcher />
    </div>
  )
}
