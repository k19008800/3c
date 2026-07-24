// ── Shared types & helpers for vendor-models subcomponents ──

import type { VendorModel, Vendor, AdminModel } from '@/types'
import type { MiniChartDataPoint } from '@/components/ui/MiniChart'

/* ── Interfaces ── */

export interface ModelStats {
  total: number
  active: number
  down: number
  disabled: number
}

export interface VendorOption {
  value: string
  label: string
}

/* ── Form state (shared by Create & Edit modals) ── */

export interface FormState {
  vendorId: string
  modelId: string
  upstreamModelName: string
  apiEndpoint: string
  apiKey?: string
  costPriceInput: string
  costPriceOutput: string
  sellPriceInput: string
  sellPriceOutput: string
  weight: string
  rpmLimit: string
  tpmLimit: string
  status?: string
}

export function emptyForm(): FormState {
  return {
    vendorId: '',
    modelId: '',
    upstreamModelName: '',
    apiEndpoint: '',
    apiKey: '',
    costPriceInput: '',
    costPriceOutput: '',
    sellPriceInput: '',
    sellPriceOutput: '',
    weight: '100',
    rpmLimit: '',
    tpmLimit: '',
  }
}

export function fromItem(item: VendorModel): FormState {
  return {
    vendorId: item.vendorId.toString(),
    modelId: item.modelId.toString(),
    upstreamModelName: item.upstreamModelName,
    apiEndpoint: item.apiEndpoint,
    costPriceInput: item.costPriceInput,
    costPriceOutput: item.costPriceOutput,
    sellPriceInput: item.sellPriceInput,
    sellPriceOutput: item.sellPriceOutput,
    weight: item.weight.toString(),
    rpmLimit: item.rpmLimit?.toString() || '',
    tpmLimit: item.tpmLimit?.toString() || '',
    status: item.status ? 'true' : 'false',
  }
}

export function buildPayload(form: FormState, withKey = false): Record<string, any> {
  const body: Record<string, any> = {
    vendorId: parseInt(form.vendorId),
    modelId: parseInt(form.modelId),
    upstreamModelName: form.upstreamModelName,
    apiEndpoint: form.apiEndpoint,
    weight: parseInt(form.weight) || 100,
  }
  if (withKey && form.apiKey) body.apiKey = form.apiKey
  if (form.costPriceInput) body.costPriceInput = parseFloat(form.costPriceInput)
  if (form.costPriceOutput) body.costPriceOutput = parseFloat(form.costPriceOutput)
  if (form.sellPriceInput) body.sellPriceInput = parseFloat(form.sellPriceInput)
  if (form.sellPriceOutput) body.sellPriceOutput = parseFloat(form.sellPriceOutput)
  if (form.rpmLimit) body.rpmLimit = parseInt(form.rpmLimit)
  if (form.tpmLimit) body.tpmLimit = parseInt(form.tpmLimit)
  if (form.status !== undefined) body.status = form.status === 'true'
  return body
}

/* ── Price helpers ── */

export function fmtPrice(val: string | number): string {
  const n = Number(val)
  if (n === 0) return '—'
  if (n < 0.0001) return '<0.0001'
  return n.toFixed(4)
}

export function fullPrice(val: string | number): string {
  return Number(val).toFixed(6)
}

/* ── Deterministic MiniChart data generator ── */

export function generateTrendData(
  baseValue: number,
  points = 7,
  seed = 0
): MiniChartDataPoint[] {
  const base = Number(baseValue) || 0
  if (base === 0) return []
  return Array.from({ length: points }, (_, i) => ({
    value: base * (1 + Math.sin(i * 1.7 + (seed % 100) * 0.3) * 0.12),
    label: `d${i + 1}`,
  }))
}

/* ── Props for new components ── */

export interface ModelTableProps {
  items: VendorModel[]
  loading: boolean
  onEdit: (item: VendorModel) => void
  onDelete: (item: VendorModel) => void
}

export interface CreateModalProps {
  onClose: () => void
  onSuccess: () => void
}

export interface EditModalProps {
  item: VendorModel
  onClose: () => void
  onSuccess: () => void
}

export interface DeleteModalProps {
  item: VendorModel
  onClose: () => void
  onSuccess: () => void
}

export interface ModelOptions {
  vendors: Vendor[]
  models: AdminModel[]
}