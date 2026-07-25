// ============================================================
//  3cloud (3C) — 主题切换组件
//  支持 light / dark / system 三种模式
// ============================================================

import { useTheme } from '@/contexts/ThemeContext'
import { Sun, Moon, Monitor, Check } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun; description: string }[] = [
  {
    value: 'light',
    label: '亮色模式',
    icon: Sun,
    description: '始终使用亮色主题',
  },
  {
    value: 'dark',
    label: '暗色模式',
    icon: Moon,
    description: '始终使用暗色主题',
  },
  {
    value: 'system',
    label: '跟随系统',
    icon: Monitor,
    description: '根据系统设置自动切换',
  },
]

export default function ThemeSwitcher() {
  const { theme, setTheme, loading } = useTheme()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Monitor size={18} className="text-slate-600" />
        <h2 className="font-semibold text-slate-800">主题设置</h2>
      </div>

      <p className="text-sm text-slate-500">
        选择您偏好的界面主题。选择"跟随系统"将根据您的系统设置自动切换亮色和暗色模式。
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon
          const isSelected = theme === option.value

          return (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              disabled={loading}
              className={`
                relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                ${isSelected
                  ? 'border-blue-500 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }
                ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {/* 选中标记 */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check size={16} className="text-blue-600" />
                </div>
              )}

              {/* 图标 */}
              <div
                className={`
                  p-3 rounded-lg transition-colors
                  ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}
                `}
              >
                <Icon size={24} />
              </div>

              {/* 标签 */}
              <span
                className={`text-sm font-medium ${isSelected ? 'text-blue-700' : 'text-slate-700'}`}
              >
                {option.label}
              </span>

              {/* 描述 */}
              <span className="text-xs text-slate-500 text-center">
                {option.description}
              </span>
            </button>
          )
        })}
      </div>

      {/* 当前状态提示 */}
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-lg">
        <Monitor size={14} />
        <span>
          当前主题：<strong className="text-slate-700">
            {theme === 'system' ? '跟随系统' : theme === 'dark' ? '暗色模式' : '亮色模式'}
          </strong>
        </span>
      </div>
    </div>
  )
}
