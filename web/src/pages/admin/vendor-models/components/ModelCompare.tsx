import { useState, useMemo } from 'react'
import { X, Check, Crown, Trash2 } from 'lucide-react'
import type { VendorModel } from '@/types'

// 扩展对比数据类型
export interface ModelCompareItem {
  id: number
  name: string
  vendor: string
  inputPrice: number
  outputPrice: number
  contextLength: number
  maxOutput: number
  capabilities: string[]
}

// 将 VendorModel 转换为对比项
export function toCompareItem(vm: VendorModel): ModelCompareItem {
  return {
    id: vm.id,
    name: vm.modelName || vm.upstreamModelName,
    vendor: vm.vendorName || '未知',
    inputPrice: parseFloat(vm.sellPriceInput) || 0,
    outputPrice: parseFloat(vm.sellPriceOutput) || 0,
    contextLength: getContextLength(vm),
    maxOutput: getMaxOutput(vm),
    capabilities: getCapabilities(vm),
  }
}

// 获取上下文长度（基于模型类型估算）
function getContextLength(vm: VendorModel): number {
  const name = (vm.modelName || vm.upstreamModelName).toLowerCase()
  if (name.includes('gpt-4') || name.includes('claude-3')) return 128000
  if (name.includes('gpt-3.5')) return 16385
  if (name.includes('deepseek')) return 64000
  if (name.includes('qwen') || name.includes('通义')) return 32000
  if (name.includes('embedding')) return 8191
  return 4096
}

// 获取最大输出（基于模型类型估算）
function getMaxOutput(vm: VendorModel): number {
  const name = (vm.modelName || vm.upstreamModelName).toLowerCase()
  if (name.includes('gpt-4') || name.includes('claude-3')) return 4096
  if (name.includes('deepseek')) return 8000
  if (name.includes('qwen')) return 6000
  if (name.includes('embedding')) return 0
  return 2048
}

// 获取支持能力
function getCapabilities(vm: VendorModel): string[] {
  const caps: string[] = []
  const type = vm.modelType || 'chat'
  
  if (type === 'chat') caps.push('对话')
  if (type === 'embedding') caps.push('嵌入')
  if (type === 'image') caps.push('图像')
  if (type === 'audio') caps.push('音频')
  if (type === 'video') caps.push('视频')
  if (type === 'rerank') caps.push('重排')
  
  // 默认至少有对话
  if (caps.length === 0) caps.push('对话')
  
  return caps
}

interface ModelCompareProps {
  selectedModels: VendorModel[]
  onClose: () => void
  onClear: () => void
}

export default function ModelCompare({ selectedModels, onClose, onClear }: ModelCompareProps) {
  const items = useMemo(() => selectedModels.map(toCompareItem), [selectedModels])
  
  // 计算最优值
  const bestValues = useMemo(() => {
    if (items.length < 2) return null
    
    return {
      lowestInputPrice: Math.min(...items.map(i => i.inputPrice)),
      lowestOutputPrice: Math.min(...items.map(i => i.outputPrice)),
      longestContext: Math.max(...items.map(i => i.contextLength)),
      largestOutput: Math.max(...items.map(i => i.maxOutput)),
    }
  }, [items])
  
  if (items.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl p-6" onClick={e => e.stopPropagation()}>
          <div className="text-center py-8">
            <p className="text-slate-500">请先选择要对比的模型（2-4个）</p>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div 
        className="bg-white rounded-xl w-full max-w-5xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">模型对比</h2>
            <span className="text-sm text-slate-500">({items.length} 个模型)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <Trash2 size={14} />
              清空选择
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        
        {/* Table */}
        <div className="flex-1 overflow-auto p-6">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="text-left text-sm font-medium text-slate-500 p-3 bg-slate-50 border border-slate-200 w-32">
                  对比维度
                </th>
                {items.map(item => (
                  <th key={item.id} className="text-left text-sm font-medium text-slate-700 p-3 bg-slate-50 border border-slate-200">
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-xs text-slate-400 font-normal">{item.vendor}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* 输入价格 */}
              <tr>
                <td className="text-sm text-slate-600 p-3 border border-slate-200 bg-slate-50 font-medium">
                  输入价格
                  <span className="text-xs text-slate-400 ml-1">(元/百万token)</span>
                </td>
                {items.map(item => (
                  <td 
                    key={item.id} 
                    className={`text-sm p-3 border border-slate-200 ${
                      bestValues && item.inputPrice === bestValues.lowestInputPrice && item.inputPrice > 0
                        ? 'bg-green-50 text-green-700 font-semibold'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {bestValues && item.inputPrice === bestValues.lowestInputPrice && item.inputPrice > 0 && (
                        <Crown size={14} className="text-green-600" />
                      )}
                      {item.inputPrice > 0 ? item.inputPrice.toFixed(6) : '-'}
                    </div>
                  </td>
                ))}
              </tr>
              
              {/* 输出价格 */}
              <tr>
                <td className="text-sm text-slate-600 p-3 border border-slate-200 bg-slate-50 font-medium">
                  输出价格
                  <span className="text-xs text-slate-400 ml-1">(元/百万token)</span>
                </td>
                {items.map(item => (
                  <td 
                    key={item.id} 
                    className={`text-sm p-3 border border-slate-200 ${
                      bestValues && item.outputPrice === bestValues.lowestOutputPrice && item.outputPrice > 0
                        ? 'bg-green-50 text-green-700 font-semibold'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {bestValues && item.outputPrice === bestValues.lowestOutputPrice && item.outputPrice > 0 && (
                        <Crown size={14} className="text-green-600" />
                      )}
                      {item.outputPrice > 0 ? item.outputPrice.toFixed(6) : '-'}
                    </div>
                  </td>
                ))}
              </tr>
              
              {/* 上下文长度 */}
              <tr>
                <td className="text-sm text-slate-600 p-3 border border-slate-200 bg-slate-50 font-medium">
                  上下文长度
                  <span className="text-xs text-slate-400 ml-1">(tokens)</span>
                </td>
                {items.map(item => (
                  <td 
                    key={item.id} 
                    className={`text-sm p-3 border border-slate-200 ${
                      bestValues && item.contextLength === bestValues.longestContext && item.contextLength > 0
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {bestValues && item.contextLength === bestValues.longestContext && item.contextLength > 0 && (
                        <Crown size={14} className="text-blue-600" />
                      )}
                      {item.contextLength > 0 ? item.contextLength.toLocaleString() : '-'}
                    </div>
                  </td>
                ))}
              </tr>
              
              {/* 最大输出 */}
              <tr>
                <td className="text-sm text-slate-600 p-3 border border-slate-200 bg-slate-50 font-medium">
                  最大输出
                  <span className="text-xs text-slate-400 ml-1">(tokens)</span>
                </td>
                {items.map(item => (
                  <td 
                    key={item.id} 
                    className={`text-sm p-3 border border-slate-200 ${
                      bestValues && item.maxOutput === bestValues.largestOutput && item.maxOutput > 0
                        ? 'bg-blue-50 text-blue-700 font-semibold'
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {bestValues && item.maxOutput === bestValues.largestOutput && item.maxOutput > 0 && (
                        <Crown size={14} className="text-blue-600" />
                      )}
                      {item.maxOutput > 0 ? item.maxOutput.toLocaleString() : '-'}
                    </div>
                  </td>
                ))}
              </tr>
              
              {/* 供应商 */}
              <tr>
                <td className="text-sm text-slate-600 p-3 border border-slate-200 bg-slate-50 font-medium">
                  供应商
                </td>
                {items.map(item => (
                  <td key={item.id} className="text-sm p-3 border border-slate-200">
                    {item.vendor}
                  </td>
                ))}
              </tr>
              
              {/* 支持能力 */}
              <tr>
                <td className="text-sm text-slate-600 p-3 border border-slate-200 bg-slate-50 font-medium">
                  支持能力
                </td>
                {items.map(item => (
                  <td key={item.id} className="text-sm p-3 border border-slate-200">
                    <div className="flex flex-wrap gap-1.5">
                      {item.capabilities.map(cap => (
                        <span 
                          key={cap}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700"
                        >
                          <Check size={10} />
                          {cap}
                        </span>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          
          {/* Legend */}
          <div className="mt-4 flex items-center gap-6 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Crown size={12} className="text-green-600" />
              <span>最低价格</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Crown size={12} className="text-blue-600" />
              <span>最大容量</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}