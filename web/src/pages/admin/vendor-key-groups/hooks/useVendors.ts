import { useState, useEffect } from 'react'
import { get } from '@/lib/api'
import type { Vendor } from '@/types'
import type { VendorSummary } from '../types'

export function useVendors() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [summaries, setSummaries] = useState<VendorSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      get<any>('/api/v1/admin/vendors', { page: 1, pageSize: 200 }),
      get<VendorSummary[]>('/api/v1/admin/vendors/key-group-summary'),
    ])
      .then(([vData, summaryData]) => {
        setVendors(Array.isArray(vData?.list) ? vData.list : [])
        setSummaries(Array.isArray(summaryData) ? summaryData : [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { vendors, summaries, loading }
}