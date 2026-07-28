/**
 * ContentCategoryChart — 请求内容分类图
 *
 * Recharts PieChart，从请求 body 中的 messages 做关键词分类。
 * 图例 + 百分比。
 */

import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts'
import type { ContentCategory } from '../types'
import { CATEGORY_KEYWORDS } from '../types'

interface ContentCategoryChartProps {
  /** 请求记录列表，用于从中提取 messages 归类 */
  requestBodies: any[]
  loading?: boolean
}

/** 从消息内容中猜测分类 */
function guessCategory(messages: any[]): ContentCategory {
  if (!messages || !Array.isArray(messages)) return '其他'

  const text = messages
    .map((m: any) => (typeof m.content === 'string' ? m.content : ''))
    .join(' ')
    .toLowerCase()

  const scores: Record<ContentCategory, number> = {
    '代码生成': 0,
    '文本创作': 0,
    '数据分析': 0,
    '翻译': 0,
    '其他': 0,
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        scores[category as ContentCategory]++
      }
    }
  }

  // 找出得分最高的类别
  let best: ContentCategory = '其他'
  let bestScore = 0
  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      best = category as ContentCategory
    }
  }

  return bestScore > 0 ? best : '其他'
}

/** 从 body 中提取 messages */
function extractMessages(body: any): any[] {
  if (!body) return []
  if (Array.isArray(body.messages)) return body.messages
  if (Array.isArray(body)) return body
  return []
}

const COLORS: Record<ContentCategory, string> = {
  '代码生成': '#3B82F6',
  '文本创作': '#8B5CF6',
  '数据分析': '#10B981',
  '翻译': '#F59E0B',
  '其他': '#94A3B8',
}

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  '代码生成': '代码生成',
  '文本创作': '文本创作',
  '数据分析': '数据分析',
  '翻译': '翻译',
  '其他': '其他',
}

export default function ContentCategoryChart({ requestBodies, loading }: ContentCategoryChartProps) {
  const chartData = useMemo(() => {
    const counts: Record<ContentCategory, number> = {
      '代码生成': 0,
      '文本创作': 0,
      '数据分析': 0,
      '翻译': 0,
      '其他': 0,
    }

    for (const body of requestBodies) {
      const messages = extractMessages(body)
      const category = guessCategory(messages)
      counts[category]++
    }

    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => ({
        name: CATEGORY_LABELS[category as ContentCategory],
        value: count,
        color: COLORS[category as ContentCategory],
      }))
  }, [requestBodies])

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="h-64 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-sm font-medium text-slate-700 mb-4">请求内容分类</p>
        <div className="h-64 flex items-center justify-center text-sm text-slate-400">
          暂无数据
        </div>
      </div>
    )
  }

  const total = chartData.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <p className="text-sm font-medium text-slate-700 mb-4">请求内容分类</p>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value: any) => [`${value}`, '']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}