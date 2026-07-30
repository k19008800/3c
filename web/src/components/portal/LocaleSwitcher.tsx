import { useI18n } from '@/hooks/useI18n'
import { Globe } from 'lucide-react'

export default function LocaleSwitcher() {
  const { locale, setLocale, locales } = useI18n()

  const displayNames: Record<string, string> = {
    'zh-CN': '中文',
    'en-US': 'English',
  }

  return (
    <div className="relative group">
      <button
        className="flex items-center gap-1 text-sm text-gray-300 hover:text-white transition-colors"
      >
        <Globe className="w-4 h-4" />
        <span>{displayNames[locale] || locale}</span>
      </button>
      <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 min-w-[120px]">
        {locales.map(l => (
          <button
            key={l}
            onClick={() => setLocale(l)}
            className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-700 ${
              locale === l ? 'text-indigo-400 font-medium' : 'text-gray-300'
            }`}
          >
            {displayNames[l] || l}
          </button>
        ))}
      </div>
    </div>
  )
}