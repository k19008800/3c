// ============================================================
//  GeneralSettings — 站点基本设置（Logo、备案、联系方式、页脚）
// ============================================================

import { useEffect, useState, useRef, useCallback } from 'react'
import { get, put } from '@/lib/api'
import { Loader2, AlertCircle, CheckCircle2, Save } from 'lucide-react'
import {
  SiteSettings, UploadResult,
  IMAGE_DISPLAY, GENERAL_FIELD_GROUPS,
  getFieldMeta,
} from './types'
import { renderTextField, renderImageField } from './FieldRenderer'

export default function GeneralSettings() {
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

  const hasChanges = useCallback(() => {
    for (const group of GENERAL_FIELD_GROUPS) {
      for (const field of group.fields) {
        const key = field.key
        if ((settings[key] || '') !== (original[key] || '')) return true
      }
    }
    return false
  }, [settings, original])

  const handleValueChange = useCallback((key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setMsg('')
    try {
      const payload: Record<string, string> = {}
      for (const group of GENERAL_FIELD_GROUPS) {
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

  // ── 图片上传 ──

  const processSelectedFile = useCallback((file: File, fieldKey: string) => {
    setValidationError('')
    setPreviewUrl(null)
    setPreviewInfo(null)

    const imgMeta = IMAGE_DISPLAY[fieldKey]

    if (imgMeta && !imgMeta.allowedTypes.split(',').includes(file.type) && file.type !== '') {
      setValidationError(`${imgMeta.label} 不支持 ${file.type || '该文件类型'}，仅支持图片格式`)
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setValidationError(`文件过大（${(file.size / (1024 * 1024)).toFixed(1)}MB），不能超过 5MB`)
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        setPreviewInfo({ w: img.width, h: img.height, size: file.size })
        setPreviewUrl(e.target?.result as string)
        setPendingFileKey(fieldKey)
        doUpload(file, fieldKey)
      }
      img.onerror = () => setValidationError('无法读取图片，请检查文件是否损坏')
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [])

  const doUpload = useCallback(async (file: File, fieldKey: string) => {
    setUploading(fieldKey)
    setUploadProgress(0)
    setValidationError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('upload_type', fieldKey)

      const url = '/api/v1/admin/site-settings/upload'
      const token = localStorage.getItem('accessToken')

      const res = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', url)
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 80))
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

      handleValueChange(fieldKey, res.url)
      const fieldLabel = IMAGE_DISPLAY[fieldKey]?.label || '图片'
      setMsg(
        `${fieldLabel} 上传成功` +
        (res.processed
          ? `（已缩放至 ${res.width}×${res.height}px，压缩 ${(res.size / 1024).toFixed(1)}KB）`
          : res.width ? `（${res.width}×${res.height}px）` : '')
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
  }, [handleValueChange])

  const handleUploadClick = useCallback((key: string) => {
    setPendingFileKey(key)
    setValidationError('')
    setPreviewUrl(null)
    setPreviewInfo(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.accept = IMAGE_DISPLAY[key]?.allowedTypes || 'image/*'
      fileInputRef.current.click()
    }
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !pendingFileKey) return
    processSelectedFile(file, pendingFileKey)
  }, [pendingFileKey, processSelectedFile])

  const handleRemoveImage = useCallback((key: string) => {
    handleValueChange(key, '')
  }, [handleValueChange])

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-end mb-2">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
        >
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {GENERAL_FIELD_GROUPS.map((group) => {
          const hasImageFields = group.fields.some((f) => f.type === 'image')
          return (
            <div key={group.label} className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${hasImageFields ? 'lg:col-span-2' : ''}`}>
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-800">{group.label}</h2>
              </div>
              <div className={`p-5 ${hasImageFields ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5' : 'space-y-5'}`}>
                {group.fields.map((field) => {
                  const meta = getFieldMeta(field.key, GENERAL_FIELD_GROUPS)
                  if (field.type === 'image') return renderImageField({
                    key: field.key, meta, settings, uploading, pendingFileKey,
                    previewUrl, previewInfo, validationError, uploadProgress,
                    onUploadClick: handleUploadClick,
                    onRemoveImage: handleRemoveImage,
                    onProcessFile: processSelectedFile,
                  })
                  return renderTextField(field.key, field.type as 'text' | 'textarea', meta, settings, handleValueChange)
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
