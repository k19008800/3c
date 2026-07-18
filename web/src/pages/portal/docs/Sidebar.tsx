import { useCallback } from 'react'
import { ChevronRight } from 'lucide-react'
import type { DocSection } from './types'

interface SidebarProps {
  sections: DocSection[]
  activeSection: string
  onSectionChange: (id: string) => void
  /** 是否有搜索过滤正在生效 */
  searching: boolean
}

/** 桌面端侧边栏导航 */
function DesktopSidebar({ sections, activeSection, onSectionChange }: SidebarProps) {
  if (sections.length === 0) {
    return (
      <div className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-24">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            文档目录
          </h3>
          <p className="text-xs text-slate-400 px-3 py-2">无匹配结果</p>
        </div>
      </div>
    )
  }

  return (
    <div className="hidden lg:block w-56 shrink-0">
      <div className="sticky top-24 space-y-1">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          文档目录
        </h3>
        {sections.map((sec) => {
          const Icon = sec.icon
          return (
            <button
              key={sec.id}
              onClick={() => onSectionChange(sec.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                activeSection === sec.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon size={16} />
              {sec.label}
              {activeSection === sec.id && <ChevronRight size={14} className="ml-auto" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** 移动端横向标签导航 */
function MobileTabs({ sections, activeSection, onSectionChange }: SidebarProps) {
  if (sections.length === 0) return null

  return (
    <div className="lg:hidden w-full overflow-x-auto -mx-1 px-1 pb-2">
      <div className="flex gap-2 min-w-max">
        {sections.map((sec) => {
          const Icon = sec.icon
          return (
            <button
              key={sec.id}
              onClick={() => onSectionChange(sec.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeSection === sec.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} />
              {sec.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Sidebar(props: SidebarProps) {
  const handleSectionChange = useCallback(
    (id: string) => {
      props.onSectionChange(id)
    },
    [props.onSectionChange],
  )

  return (
    <>
      <DesktopSidebar {...props} onSectionChange={handleSectionChange} />
      <MobileTabs {...props} onSectionChange={handleSectionChange} />
    </>
  )
}
