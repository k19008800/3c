import { useState, useEffect, useMemo, useCallback } from 'react'
import axios from 'axios'
import type { ModelItem } from '@/types'
import { sections, type DocSection } from './docs/types'
import Sidebar from './docs/Sidebar'
import SearchBar from './docs/SearchBar'
import ContentRenderer from './docs/ContentRenderer'

export default function PortalDocs() {
  const [models, setModels] = useState<ModelItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeSection, setActiveSection] = useState('models')
  const [searchQuery, setSearchQuery] = useState('')

  /* ── 数据获取 ── */
  useEffect(() => {
    axios
      .get('/api/v1/models')
      .then((res) => {
        const list = res.data?.data?.list || res.data?.list || []
        setModels(list)
      })
      .catch((err) => setError(err.message || '获取模型列表失败'))
      .finally(() => setLoading(false))
  }, [])

  /* ── 计算属性 ── */
  const baseUrl = useMemo(
    () =>
      typeof window !== 'undefined'
        ? `${window.location.protocol}//${window.location.hostname}`
        : 'https://api.unmisa.com',
    [],
  )

  const filteredSections = useMemo<DocSection[]>(() => {
    if (!searchQuery.trim()) return sections
    const q = searchQuery.trim().toLowerCase()
    return sections.filter(
      (s) => s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    )
  }, [searchQuery])

  /* 搜索时如果当前章节被过滤掉，自动切换到第一个匹配项 */
  const resolvedSection = useMemo(() => {
    if (filteredSections.length > 0) {
      const stillValid = filteredSections.some((s) => s.id === activeSection)
      return stillValid ? activeSection : filteredSections[0].id
    }
    return activeSection
  }, [filteredSections, activeSection])

  const handleSectionChange = useCallback((id: string) => {
    setActiveSection(id)
  }, [])

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query)
  }, [])

  /* ── 渲染 ── */
  return (
    <div className="py-12 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 页面标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">API 文档</h1>
          <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
            快速了解如何接入 3Cloud API，查看可用模型和代码示例
          </p>
        </div>

        {/* 搜索栏 */}
        <div className="max-w-md mx-auto mb-8">
          <SearchBar value={searchQuery} onChange={handleSearch} />
        </div>

        <div className="flex gap-8">
          {/* 侧边栏（含桌面端 + 移动端标签导航） */}
          <Sidebar
            sections={filteredSections}
            activeSection={resolvedSection}
            onSectionChange={handleSectionChange}
            searching={searchQuery.trim().length > 0}
          />

          {/* 内容区 */}
          <div className="flex-1 min-w-0">
            <ContentRenderer
              activeSection={resolvedSection}
              models={models}
              loading={loading}
              error={error}
              baseUrl={baseUrl}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
