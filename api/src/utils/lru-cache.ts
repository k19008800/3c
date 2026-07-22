/**
 * LRU Cache 实现
 * 用于替代无限增长的 Map，防止内存泄漏
 */
export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; expiresAt: number }>()
  private maxSize: number
  private ttlMs: number

  constructor(maxSize: number = 1000, ttlMs: number = 60_000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key)
      return undefined
    }
    // LRU: 移到末尾（最近使用）
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.value
  }

  set(key: K, value: V): void {
    // 超出容量，删除最老的（Map 头部）
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) this.cache.delete(oldestKey)
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  has(key: K): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false
    if (Date.now() >= entry.expiresAt) {
      this.cache.delete(key)
      return false
    }
    return true
  }

  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }

  /** 清理过期条目 */
  prune(): number {
    const now = Date.now()
    let pruned = 0
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) {
        this.cache.delete(key)
        pruned++
      }
    }
    return pruned
  }
}
