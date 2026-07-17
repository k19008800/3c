// ============================================================
//  Playground — Types
// ============================================================

export interface ModelItem {
  id: number
  name: string
  displayName?: string
  provider?: string
  status: boolean
}

export interface ChainStep {
  step: number
  name: string
  status: 'ok' | 'error' | 'skip'
  detail: string
  candidates?: any[]
  vendorName?: string
  upstreamModel?: string
}

export interface PlaygroundResponse {
  _chain: ChainStep[]
  _testMode: boolean
  _warning: string
  choices?: { index: number; message: { role: string; content: string } }[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  error?: { message: string; type: string }
  id?: string
  model?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
