import { useState } from 'react'
import { del } from '@/lib/api'

interface UseModelActionsReturn {
  deleting: boolean
  deleteError: string | null
  handleDelete: (id: number) => Promise<void>
}

export function useModelActions(): UseModelActionsReturn {
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async (id: number): Promise<void> => {
    setDeleting(true)
    setDeleteError(null)
    
    try {
      await del(`/api/v1/admin/vendor-models/${id}`)
    } catch (err: any) {
      setDeleteError(err.message || '删除失败')
      throw err
    } finally {
      setDeleting(false)
    }
  }

  return {
    deleting,
    deleteError,
    handleDelete,
  }
}