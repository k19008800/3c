import { useEffect, useState, useRef, useCallback } from 'react'
import { get, put, post } from '@/lib/api'
import {
  Loader2, AlertCircle, CheckCircle2, Upload, Save,
  ImageIcon, X, FileWarning,
} from 'lucide-react'
import FeatureDescription from '@/components/admin/FeatureDescription'

type SiteSettings = Record<string, string>

// ── 字段尺寸约束 ──
// ── 字段显示尺寸（服务器会自动缩放至此尺寸）──
const IMAGE_DISPLAY: Record<string, {
  label: string
  displayW: number
  displayH: number
  allowedTypes: string
}> = {
  site_logo_url: {
    label: 'Logo',
    displayW: 200, displayH: 60,
    allowedTypes: 'image/png,image/jpeg,image/jpg,image/webp,image/svg+xml',
  },
  site_favicon_url: {
    label: 'Favicon',
    displayW: 32, displayH: 32,
    allowedTypes: 'image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml',
  },
  site_wechat_qr_url: {
    label: '公众号二维码',
    displayW: 300, displayH: 300,
    allowedTypes: 'image/png,image/jpeg,image/jpg,image/webp',
  },
}

const FIELD_GROUPS = [
  {
    label: '平台标识',
    fields: [
      { key: 'site_logo_url', type: 'image' },
      { key: 'site_favicon_url', type: 'image' },
      { key: 'site_name', label: '平台名称', type: 'text', hint: '显示在浏览器标签和页面标题' },
      { key: 'site_company_name', label: '公司名称', type: 'text', hint: '显示在版权信息中' },
    ],
  },
  {
    label: '备案信息',
    fields: [
      { key: 'site_icp', label: 'ICP 备案号', type: 'text', hint: '如：京ICP备xxxxxx号' },
      { key: 'site_icp_link', label: 'ICP 备案链接', type: 'text', hint: 'https://beian.miit.gov.cn' },
      { key: 'site_police_icp', label: '公安备案号', type: 'text', hint: '如：京公网安备xxxxxx号' },
    ],
  },
  {
    label: '联系方式',
    fields: [
      { key: 'site_contact_email', label: '联系邮箱', type: 'text', hint: '' },
      { key: 'site_contact_phone', label: '联系电话', type: 'text', hint: '如：400-xxx-xxxx' },
      { key: 'site_wechat_qr_url', type: 'image' },
    ],
  },
  {
    label: '页脚信息',
    fields: [
      { key: 'site_copyright', label: '版权信息', type: 'text', hint: '如：© 2026 3Cloud. All rights reserved.' },
      { key: 'site_footer_html', label: '底部自定义 HTML', type: 'textarea', hint: '可自定义页脚内容（HTML）' },
    ],
  },
]

// 获取字段显示名 + 提示
function getFieldMeta(key: string): { label: string; hint: string } {
  const img = IMAGE_DISPLAY[key]
  if (img) {
    return {
      label: img.label,
      hint: `上传后自动缩放至 ${img.displayW}×${img.displayH}px 附近`,
    }
  }
  // 从 FIELD_GROUPS 中查找
  for (const g of FIELD_GROUPS) {
    for (const f of g.fields) {
      if (f.key === key) return { label: (f as any).label ?? key, hint: (f as any).hint ?? '' }
    }
  }
  return { label: key, hint: '' }
}

// 文件大小格式化
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ──────────────────────────────────────────

export default function AdminSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings>({})
  const [original, setOriginal] = useState<SiteSettings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [pendingFileKey, setPendingFileKey] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewInfo, setPreviewInfo] = useState<{ w: number; h: number; size: number } | null>(null)
  const [validationError, setValidationError] = useState('')
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await get<{ settings: SiteSettings }>('/api/v1/admin/site-settings')
      setSettings(data.settings || {})
      setOriginal({ ...(data.settings || {}) })
    } catch (err: any) {
      setError(err.message || '获取站点配置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const hasChanges = () => {
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        const key = field.key as string
        if ((settings[key] || '') !== (original[key] || '')) return true
      }
    }
    return false
  }

  const handleValueChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setMsg('')
    try {
      const payload: Record<string, string> = {}
      for (const group of FIELD_GROUPS) {
        for (const field of group.fields) {
          payload[field.key] = settings[field.key] || ''
        }
      }
      await put('/api/v1/admin/site-settings', payload)
      setMsg('站点配置保存成功')
      setOriginal({ ...settings })
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ── 图片选中 / 拖入 → 客户端预校验 + 预览 ──

  const processSelectedFile = (file: File, fieldKey: string) => {
    setValidationError('')
    setPreviewUrl(null)
    setPreviewInfo(null)

    const imgMeta = IMAGE_DISPLAY[fieldKey]

    // 前端基本校验
    if (imgMeta && !imgMeta.allowedTypes.split(',').includes(file.type) && file.type !== '') {
      setValidationError(`${imgMeta.label} 不支持 ${file.type || '该文件类型'}，仅支持图片格式`)
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setValidationError(`文件过大（${formatSize(file.size)}），不能超过 5MB`)
      return
    }

    // 读取图片预览
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const { width, height } = img
        setPreviewInfo({ w: width, h: height, size: file.size })
        setPreviewUrl(e.target?.result as string)

        // 前端不再限制尺寸，直接上传
        // 服务器 sharp 会自动缩放到合适的显示尺寸
        setPendingFileKey(fieldKey)
        doUpload(file)
      }
      img.onerror = () => {
        setValidationError('无法读取图片，请检查文件是否损坏')
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  // ── 执行上传 ──

  const doUpload = async (file: File) => {
    setUploading(pendingFileKey!)
    setUploadProgress(0)
    setValidationError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_type', pendingFileKey!)

      // 使用 XMLHttpRequest 实现上传进度
      const url = '/api/v1/admin/site-settings/upload'
      const token = localStorage.getItem('accessToken')

      const res = await new Promise<{ url: string; width: number; height: number; size: number; processed: boolean }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 80)) // 0-80% 是上传
          }
        }

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.code === 0) {
              setUploadProgress(100)
              resolve(data.data)
            } else {
              reject(new Error(data.message || '上传失败'))
            }
          } catch {
            reject(new Error('解析响应失败'))
          }
        }

        xhr.onerror = () => reject(new Error('网络错误'))
        xhr.send(formData)
      })

      handleValueChange(pendingFileKey!, res.url)
      const fieldLabel = IMAGE_DISPLAY[pendingFileKey!]?.label || '图片'
      setMsg(
        `${fieldLabel} 上传成功` +
        (res.processed
          ? `（已缩放至 ${res.width}×${res.height}px，压缩 ${formatSize(res.size)}）`
          : res.width
            ? `（${res.width}×${res.height}px）`
            : '')
      )
      setPreviewUrl(null)
      setPreviewInfo(null)
    } catch (err: any) {
      setError(err.message || '上传失败')
    } finally {
      setUploading(null)
      setUploadProgress(0)
      setPendingFileKey(null)
    }
  }

  // ── 点击上传区 ──

  const handleUploadClick = (key: string) => {
    setPendingFileKey(key)
    setValidationError('')
    setPreviewUrl(null)
    setPreviewInfo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.accept = IMAGE_DISPLAY[key]?.allowedTypes || 'image/*'
      fileInputRef.current.click()
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pendingFileKey) return
    processSelectedFile(file, pendingFileKey)
  }

  // ── 拖放 ──

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.add('border-blue-500', 'bg-blue-50')
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-blue-500', 'bg-blue-50')
    }
  }

  const handleDrop = (e: React.DragEvent, fieldKey: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.remove('border-blue-500', 'bg-blue-50')
    }
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setPendingFileKey(fieldKey)
    processSelectedFile(file, fieldKey)
  }

  const handleRemoveImage = (key: string) => {
    handleValueChange(key, '')
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">站点设置</h1>
          <p className="text-sm text-slate-500 mt-1">管理平台 Logo、备案信息、联系方式等基础信息</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <FeatureDescription page="admin/site-settings" className="ml-2" />

      {msg && (
        <div className="flex items-center gap-2 text-green-700 bg-green-50 p-3 rounded-lg text-sm">
          <CheckCircle2 size={16} />
          {msg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 隐藏的文件上传 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {FIELD_GROUPS.map((group) => {
          const hasImageFields = group.fields.some((f) => f.type === 'image')
          return (
            <div key={group.label} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${hasImageFields ? 'lg:col-span-2' : ''}`}>
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">{group.label}</h2>
              </div>
              <div className={`p-5 ${hasImageFields ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5' : 'space-y-5'}`}>
                {group.fields.map((field) => {
                  const meta = getFieldMeta(field.key)

                  if (field.type === 'image') {
                    const imgMeta = IMAGE_DISPLAY[field.key]
                    const isUploading = uploading === field.key

                    return (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          {meta.label}
                        </label>

                        {/* 拖放上传区 */}
                        <div
                          ref={dropZoneRef}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, field.key)}
                          onClick={() => !isUploading && handleUploadClick(field.key)}
                          className={`
                            relative border-2 border-dashed rounded-xl transition-all cursor-pointer
                            ${isUploading ? 'opacity-60 pointer-events-none' : ''}
                            ${settings[field.key] ? 'border-blue-300 bg-blue-50/30' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}
                          `}
                        >
                          {/* 已有图片预览 */}
                          {settings[field.key] && !previewUrl && (
                            <div className="p-3">
                              <div className="relative inline-block">
                                <img
                                  src={settings[field.key]}
                                  alt={meta.label}
                                  className="max-h-24 rounded-lg border border-slate-200 object-contain bg-white"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none'
                                    ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                                  }}
                                />
                                <div className="hidden text-center py-4 text-sm text-slate-400">加载失败</div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveImage(field.key) }}
                                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600 shadow-sm"
                                  title="移除图片"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <p className="text-xs text-slate-400 mt-2">{meta.hint}</p>
                            </div>
                          )}

                          {/* 新文件预览（上传前） */}
                          {previewUrl && pendingFileKey === field.key && previewInfo && (
                            <div className="p-3">
                              <img src={previewUrl} alt="预览" className="max-h-24 rounded-lg border border-slate-200 object-contain bg-white" />
                              <p className="text-xs text-slate-500 mt-1">
                                {previewInfo.w}×{previewInfo.h}px · {formatSize(previewInfo.size)}
                              </p>
                            </div>
                          )}

                          {/* 空状态 */}
                          {!settings[field.key] && !(previewUrl && pendingFileKey === field.key) && (
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

                          {/* 上传进度 */}
                          {isUploading && uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                              <div className="text-center">
                                <Loader2 className="animate-spin text-blue-500 mx-auto" size={24} />
                                <p className="text-xs text-blue-600 mt-1">上传中 {uploadProgress}%</p>
                                <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-1 mx-auto overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full transition-all"
                                    style={{ width: `${uploadProgress}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 已上传完成遮罩 */}
                          {isUploading && uploadProgress === 100 && (
                            <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-xl">
                              <CheckCircle2 size={28} className="text-green-500" />
                            </div>
                          )}
                        </div>

                        {/* 校验错误 */}
                        {validationError && pendingFileKey === field.key && (
                          <div className="flex items-start gap-1.5 mt-1.5 text-red-600 text-xs">
                            <FileWarning size={12} className="mt-0.5 shrink-0" />
                            <span>{validationError}</span>
                          </div>
                        )}

                        {/* 尺寸说明 */}
                        {imgMeta && (
                          <p className="text-xs text-slate-400 mt-1">
                            上传后自动缩放至 {imgMeta.displayW}×{imgMeta.displayH}px 附近
                          </p>
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={field.key}>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        {meta.label}
                      </label>
                      {field.type === 'textarea' ? (
                        <div>
                          <textarea
                            value={settings[field.key] || ''}
                            onChange={(e) => handleValueChange(field.key, e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                          />
                          {meta.hint && <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="text"
                            value={settings[field.key] || ''}
                            onChange={(e) => handleValueChange(field.key, e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          {meta.hint && <p className="text-xs text-slate-400 mt-1">{meta.hint}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
