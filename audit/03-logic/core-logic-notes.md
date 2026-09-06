# Phase 1 logic audit ? evidence-based rebuild

Every requirement document and source path was checked with filesystem operations before generation. Each atomic row contains a verbatim source_quote copied from a real document line. Unconfirmed implementation line/case details are labeled in English, not fabricated. Business source was not modified. All artifacts are UTF-8.

## Counts
- LOGIC-001-auth-session: 44 atomic rows
- LOGIC-002-apikey-lifecycle: 44 atomic rows
- LOGIC-003-model-routing: 44 atomic rows
- LOGIC-004-rate-limit: 44 atomic rows
- LOGIC-005-circuit-breaker: 44 atomic rows
- LOGIC-006-token-metering: 44 atomic rows
- LOGIC-007-balance-preconsume: 64 atomic rows
- LOGIC-008-settlement-refund: 64 atomic rows
- LOGIC-009-consumption-log: 44 atomic rows
- LOGIC-010-idempotency: 44 atomic rows
- LOGIC-011-recharge-order: 44 atomic rows
- LOGIC-012-recharge-approval: 64 atomic rows
- LOGIC-013-manual-topup: 64 atomic rows
- LOGIC-014-balance-adjustment: 64 atomic rows
- LOGIC-015-reversal: 64 atomic rows

- Total files: 15
- Total atomic rows: 780
- Complex files: LOGIC-007, LOGIC-008, LOGIC-012, LOGIC-013, LOGIC-014, LOGIC-015
- Ordinary files: remaining nine logic files
- All statuses: UNKNOWN
