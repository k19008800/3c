export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface StreamState {
  lastValidUsage: TokenUsage | null;
  generatedText: string;
  finishReason: string | null;
  totalChunks: number;
}

export interface SupplierKey {
  id: number;
  supplierId: number;
  keyValue: string;
  name: string | null;
  status: string;
  selectMode: 'single' | 'polling' | 'random';
  currentBalance: string | null;
  balanceCheckedAt: Date | null;
  priority: number;
  lastUsedAt: Date | null;
}

export interface Supplier {
  id: number;
  name: string;
  code: string;
  baseUrl: string;
  apiType: string;
  status: string;
  healthStatus: string | null;
  healthLastCheck: Date | null;
  description: string | null;
}

export interface SupplierModel {
  id: number;
  supplierId: number;
  modelName: string;
  platformModel: string;
  inputPrice: string;
  outputPrice: string;
  currency: string | null;
  priceUnit: string | null;
  status: string;
  capabilities: string[];
  maxTokens: number | null;
  description: string | null;
}

export interface ChannelSelection {
  supplier: Supplier;
  key: SupplierKey;
  modelMapping: SupplierModel;
}
