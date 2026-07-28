/**
 * RiskTags — 风险标签展示
 *
 * 使用 Ant Design Tag 组件展示标签列表，不同类别不同颜色。
 */

// 使用内联标签替代 antd Tag，避免依赖问题
import React from 'react'

interface RiskTagsProps {
  tags: string[]
}

/** 根据标签关键词选取颜色 */
function getTagColor(tag: string): string {
  if (/敏感|泄露|隐私|违规|涉政|涉黄/i.test(tag)) return 'red'
  if (/异常|频率|批量|爬虫|自动化/i.test(tag)) return 'orange'
  if (/注入|sql|xss|攻击|恶意|漏洞/i.test(tag)) return 'volcano'
  if (/越权|越级|未授权|鉴权/i.test(tag)) return 'purple'
  if (/敏感词|违禁|违规内容/i.test(tag)) return 'magenta'
  if (/可疑|试探|行为异常/i.test(tag)) return 'gold'
  return 'blue'
}

export default function RiskTags({ tags }: RiskTagsProps) {
  if (!tags || tags.length === 0) return <span className="text-slate-400 text-xs">暂无标签</span>

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag, i) => {
        const color = getTagColor(tag);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              padding: '0 7px',
              fontSize: 12,
              lineHeight: '20px',
              borderRadius: 4,
              border: `1px solid ${color}`,
              color,
              backgroundColor: `${color}10`,
              margin: '0 4px 4px 0',
            }}
          >
            {tag}
          </span>
        );
      })}
    </div>
  )
}