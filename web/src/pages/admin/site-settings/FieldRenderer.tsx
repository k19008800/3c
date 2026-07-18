// ============================================================
//  FieldRenderer — 设置字段渲染器（文本/图片上传）
// ============================================================

import { Upload, Loader2, CheckCircle2, X, FileWarning } from 'lucide-react'
import { SiteSettings, IMAGE_DISPLAY, FieldGroup, getFieldMeta, formatSize } from './types'

interface FieldMeta { label: string; hint: string }

/** 渲染文本/文本域字段 */
export function renderTextField(
  key: string,
  type: 'text' | 'textarea',
  meta: FieldMeta,
  settings: SiteSettings,
  onChange: (k: string, v: string) => void,
) {
  return (
    <div key={key}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{meta.label}</label>
      {type === 'textarea' ? (
        <div>
          <textarea
            value={settings[key] || ''}
            onChange={(e) => onChange(key, e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
          {meta.hint && <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>}
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={settings[key] || ''}
            onChange={(e) => onChange(key, e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {meta.hint && <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>}
        </div>
      )}
    </div>
  )
}

interface ImageFieldProps {
  key: string
  meta: FieldMeta
  settings: SiteSettings
  uploading: string | null
  pendingFileKey: string | null
  previewUrl: string | null
  previewInfo: { w: number; h: number; size: number } | null
  validationError: string
  uploadProgress: number
  onUploadClick: (k: string) => void
  onRemoveImage: (k: string) => void
  onProcessFile: (f: File, k: string) => void
}

/** 渲染图片上传字段 */
export function renderImageField(props: ImageFieldProps) {
  const {
    key, meta, settings, uploading, pendingFileKey,
    previewUrl, previewInfo, validationError, uploadProgress,
    onUploadClick, onRemoveImage, onProcessFile,
  } = props

  const isUploading = uploading === key
  const imgMeta = IMAGE_DISPLAY[key]

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).classList.add('border-blue-500', 'bg-blue-50')
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).classList.remove('border-blue-500', 'bg-blue-50')
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).classList.remove('border-blue-500', 'bg-blue-50')
    const file = e.dataTransfer.files?.[0]
    if (file) onProcessFile(file, key)
  }

  return (
    <div key={key}>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{meta.label}</label>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && onUploadClick(key)}
        className={`
          relative border-2 border-dashed rounded-xl transition-all cursor-pointer
          ${isUploading ? 'opacity-60 pointer-events-none' : ''}
          ${settings[key] ? 'border-blue-300 bg-blue-50/30' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}
        `}
      >
        {settings[key] && !previewUrl && (
          <div className="p-3">
            <div className="relative inline-block">
              <img
                src={settings[key]}
                alt={meta.label}
                className="max-h-24 rounded-lg border border-slate-200 object-contain bg-white"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                  ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                }}
              />
              <div className="hidden text-center py-4 text-sm text-slate-400">加载失败</div>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveImage(key) }}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm"
                title="移除图片"
              >
                <X size={14} />
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">{meta.hint}</p>
          </div>
        )}

        {previewUrl && pendingFileKey === key && previewInfo && (
          <div className="p-3">
            <img src={previewUrl} alt="预览" className="max-h-24 rounded-lg border border-slate-200 object-contain bg-white" />
            <p className="text-xs text-slate-500 mt-1">
              {previewInfo.w}×{previewInfo.h}px · {formatSize(previewInfo.size)}
            </p>
          </div>
        )}

        {!settings[key] && !(previewUrl && pendingFileKey === key) && (
          <div className="flex flex-col items-center justify-center py-6 px-4">
            {isUploading ? (
              <Loader2 className="animate-spin text-blue-500" size={28} />
            ) : (
              <>
                <Upload size={28} className="text-slate-300" />
                <p className="text-xs text-slate-400 mt-2 text-center">
                  点击或拖拽上传<br />{meta.label}
                </p>
              </>
            )}
          </div>
        )}

        {isUploading && uploadProgress > 0 && uploadProgress < 100 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
            <div className="text-center">
              <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
              <p className="text-xs text-blue-600 mt-1">上传中 {uploadProgress}%</p>
              <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-1 mx-auto overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          </div>
        )}

        {isUploading && uploadProgress === 100 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
            <CheckCircle2 size={28} className="text-green-500" />
          </div>
        )}
      </div>

      {validationError && pendingFileKey === key && (
        <div className="flex items-start gap-1.5 mt-1.5 text-red-600 text-xs">
          <FileWarning size={12} className="mt-0.5 shrink-0" />
          <span>{validationError}</span>
        </div>
      )}

      {imgMeta && (
        <p className="text-xs text-slate-400 mt-1">
          上传后自动缩放至 {imgMeta.displayW}×{imgMeta.displayH}px 附近
        </p>
      )}
    </div>
  )
}

/** 渲染通用字段分组（无图片） */
export function renderFieldGroup(
  group: { label: string; fields: { key: string; type: string; label?: string; hint?: string }[] },
  settings: SiteSettings,
  groups: FieldGroup[],
  onChange: (k: string, v: string) => void,
  icon?: React.ReactNode,
) {
  return (
    <div key={group.label} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className={`px-5 py-4 border-b border-slate-100 ${icon ? 'flex items-center gap-2' : ''}`}>
        {icon}
        <h2 className="text-base font-semibold text-slate-800">{group.label}</h2>
      </div>
      <div className="p-5 space-y-5">
        {group.fields.map((field) => {
          const meta = getFieldMeta(field.key, groups)
          return renderTextField(field.key, field.type as 'text' | 'textarea', meta, settings, onChange)
        })}
      </div>
    </div>
  )
}
