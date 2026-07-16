/**
 * FormField — 统一表单字段组件
 *
 * 每个输入框提供 inline hint；每条错误信息附带可操作的解决方案。
 *
 * @example
 * <FormField label="厂商名称" hint="建议使用英文名称" required
 *   error={fieldErrors.name?.message}
 *   solution={fieldErrors.name?.solution}>
 *   <input ... />
 * </FormField>
 */

import { ReactNode } from 'react'
import { AlertCircle, Lightbulb, Wrench } from 'lucide-react'

interface FormFieldProps {
  label: string
  /** 字段说明文字（显示在 label 下方） */
  hint?: string | ReactNode
  /** 错误信息 */
  error?: string
  /** 错误对应的解决方案 */
  solution?: string | ReactNode
  /** 是否必需 */
  required?: boolean
  children: ReactNode
  className?: string
}

export default function FormField({
  label,
  hint,
  error,
  solution,
  required,
  children,
  className = '',
}: FormFieldProps) {
  const hasError = !!error

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>

      {/* 输入区域 */}
      <div className={hasError ? 'child-input-error' : ''}>
        {children}
      </div>

      {/* 提示文字 */}
      {hint && !hasError && (
        <div className="flex items-start gap-1.5 mt-1.5 text-xs text-slate-400">
          <Lightbulb size={12} className="mt-0.5 shrink-0 text-slate-400" />
          <span>{hint}</span>
        </div>
      )}

      {/* 错误信息 */}
      {hasError && (
        <div className="flex items-start gap-1.5 mt-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0 text-red-500" />
          <span className="text-xs text-red-600">{error}</span>
        </div>
      )}

      {/* 解决方案 */}
      {hasError && solution && (
        <div className="flex items-start gap-1.5 mt-1">
          <Wrench size={12} className="mt-0.5 shrink-0 text-blue-500" />
          <span className="text-xs text-blue-600">{solution}</span>
        </div>
      )}

      {/* 全局样式：子输入框错误边框 */}
      <style>{`
        .child-input-error input,
        .child-input-error select,
        .child-input-error textarea {
          border-color: #ef4444 !important;
          --tw-ring-color: #fecaca !important;
        }
        .child-input-error input:focus,
        .child-input-error select:focus,
        .child-input-error textarea:focus {
          border-color: #ef4444 !important;
          --tw-ring-color: #fca5a5 !important;
        }
      `}</style>
    </div>
  )
}
