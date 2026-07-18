import type { LucideIcon } from 'lucide-react'
import { Cpu, LinkIcon, DollarSign, BookOpen, Code } from 'lucide-react'

export interface DocSection {
  id: string
  label: string
  icon: LucideIcon
}

export const sections: DocSection[] = [
  { id: 'models', label: '模型列表', icon: Cpu },
  { id: 'access', label: '接入方式', icon: LinkIcon },
  { id: 'pricing', label: '定价收费', icon: DollarSign },
  { id: 'usage', label: '使用指南', icon: BookOpen },
  { id: 'codes', label: '代码示例', icon: Code },
]

export type { ModelItem } from '@/types'
