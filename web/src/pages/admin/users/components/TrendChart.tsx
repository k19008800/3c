import React from 'react'

interface TrendChartProps {
  /** 趋势类型：balance | calls */
  type: 'balance' | 'calls'
  /** 图表高度 */
  height?: number
  /** 图表宽度 */
  width?: number
  /** 趋势数据（模拟） */
  data?: number[]
}

const TrendChart: React.FC<TrendChartProps> = ({ 
  type, 
  height = 30, 
  width = 80,
  data = [30, 40, 35, 60, 50, 70, 45, 80, 65, 75]
}) => {
  // 简单模拟图表
  const max = Math.max(...data)
  const min = Math.min(...data)
  const normalized = data.map(value => ((value - min) / (max - min)) * (height - 4))
  
  // 图表颜色
  const color = type === 'balance' ? '#10b981' : '#3b82f6' // green for balance, blue for calls
  
  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="overflow-visible">
        {/* 背景线 */}
        <line 
          x1="0" y1={height / 2} 
          x2={width} y2={height / 2} 
          stroke="#e2e8f0" 
          strokeWidth="1" 
          strokeDasharray="2,2"
        />
        
        {/* 趋势线 */}
        {normalized.map((y, i) => {
          const x = (i / (normalized.length - 1)) * (width - 2)
          const nextY = normalized[i + 1]
          const nextX = ((i + 1) / (normalized.length - 1)) * (width - 2)
          
          return (
            <React.Fragment key={i}>
              {/* 数据点 */}
              <circle 
                cx={x + 1} 
                cy={height - y - 2} 
                r="1.5" 
                fill={color}
                fillOpacity="0.8"
              />
              
              {/* 连接线 */}
              {nextY !== undefined && (
                <line 
                  x1={x + 1} y1={height - y - 2}
                  x2={nextX + 1} y2={height - nextY - 2}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeOpacity="0.6"
                />
              )}
            </React.Fragment>
          )
        })}
      </svg>
      
      {/* 简单趋势指示器 */}
      <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 text-xs">
        {normalized[normalized.length - 1] > normalized[0] ? (
          <span className="text-green-600">↗</span>
        ) : normalized[normalized.length - 1] < normalized[0] ? (
          <span className="text-red-600">↘</span>
        ) : (
          <span className="text-gray-400">→</span>
        )}
      </div>
    </div>
  )
}

export default TrendChart