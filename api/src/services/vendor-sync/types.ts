// ============================================================
//  3cloud (3C) — 供应商同步 类型定义
// ============================================================

export interface SyncReport {
  vendorId: number;
  vendorName: string;
  startedAt: string;
  finishedAt: string;
  upstreamModelCount: number;
  existingModelCount: number;
  newModels: string[];
  newMappings: string[];
  updatedPrices: string[];
  removedModels: string[];
  errors: string[];
  pricingSource: 'known_price_map' | 'default_price' | 'none';
}

interface UpstreamModel { id: string; object?: string; owned_by?: string }
