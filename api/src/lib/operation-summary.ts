import crypto from 'node:crypto';

/** A deterministic JSON representation used to bind an operation 2FA token. */
export type OperationSummary = unknown;

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('operation summary contains non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  throw new Error('operation summary contains unsupported value');
}

export function canonicalizeOperationSummary(summary: OperationSummary): string {
  return canonical(summary);
}

export function hashOperationSummary(summary: OperationSummary): string {
  return crypto.createHash('sha256').update(canonicalizeOperationSummary(summary), 'utf8').digest('hex');
}

/** Reject absent/empty summaries; an empty summary cannot prove user intent. */
export function assertOperationSummary(summary: OperationSummary): string {
  if (summary === undefined || summary === null) throw new Error('operation summary is required');
  if (Array.isArray(summary) && summary.length === 0) throw new Error('operation summary is required');
  if (typeof summary === 'object' && !Array.isArray(summary) && Object.keys(summary as object).length === 0) throw new Error('operation summary is required');
  return hashOperationSummary(summary);
}
