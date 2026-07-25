import { useState } from 'react'
import api from '@/lib/api'
import { Loader2, AlertCircle, Trash2, Upload } from 'lucide-react'

export interface FileState {
  file: File | null
  preview: string          // objectURL for preview
  uploadedPath: string      // backend relativePath after upload
  status: 'idle' | 'uploading' | 'success' | 'error'
  errorMsg: string
}

export function FileUploadBlock({
  label, hint, accept, state, disabled, onSelect, onRemove
}: {
  label: string; hint: string; accept: string
  state: FileState; disabled: boolean
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemove: () => void
}) {
  const inputId = `file-${label.replace(/\s/g, '')}`

  if (state.status === 'uploading') {
    return (
      <div className="border-2 border-dashed border-blue-200 rounded-lg p-4 flex flex-col items-center justify-center gap-2 bg-blue-50/50 min-h-[130px]">
        <Loader2 size={24} className="animate-spin text-blue-500" />
        <span className="text-xs text-blue-600">正在上传...</span>
      </div>
    )
  }

  if (state.status === 'success' && state.preview) {
    return (
      <div className="relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50 min-h-[130px]">
        <img src={state.preview} alt={label} className="w-full h-[130px] object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
          <span className="text-xs text-white font-medium">{label}</span>
        </div>
        {!disabled && (
          <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 p-1 bg-white/80 hover:bg-white rounded-full shadow transition"
            title="删除"
          >
            <Trash2 size={14} className="text-red-500" />
          </button>
        )}
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="border-2 border-dashed border-red-200 rounded-lg p-4 flex flex-col items-center justify-center gap-1.5 bg-red-50/50 min-h-[130px]">
        <AlertCircle size={20} className="text-red-400" />
        <span className="text-xs text-red-500 text-center">{state.errorMsg}</span>
        {!disabled && (
          <label htmlFor={inputId} className="cursor-pointer text-xs text-blue-600 hover:underline">
            重新选择
            <input id={inputId} type="file" accept={accept} className="hidden" onChange={onSelect} />
          </label>
        )}
      </div>
    )
  }

  // idle state
  return (
    <label htmlFor={inputId} className={`block border-2 border-dashed border-slate-200 rounded-lg p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition min-h-[130px] ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <Upload size={22} className="text-slate-400" />
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <span className="text-xs text-slate-400">{hint}</span>
      <input id={inputId} type="file" accept={accept} className="hidden" disabled={disabled} onChange={onSelect} />
    </label>
  )
}

export function useFileUpload() {
  const emptyFileState = (): FileState => ({ file: null, preview: '', uploadedPath: '', status: 'idle', errorMsg: '' })

  const doUpload = async (file: File, fileType: string): Promise<FileState> => {
    const formData = new FormData()
    formData.append('fileType', fileType)
    formData.append('file', file)

    const initialState: FileState = { file, preview: URL.createObjectURL(file), uploadedPath: '', status: 'uploading', errorMsg: '' }

    try {
      const res = await api.post<{ code: number; data: { relativePath: string }; message: string }>(
        '/api/v1/auth/real-name/upload',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      const relativePath = res.data.data.relativePath
      return { ...initialState, uploadedPath: relativePath, status: 'success' }
    } catch (err: any) {
      return { file: null, preview: '', uploadedPath: '', status: 'error', errorMsg: err.message || '上传失败' }
    }
  }

  return { emptyFileState, doUpload }
}