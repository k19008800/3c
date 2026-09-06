# Frontend → Backend API Contract Gap Audit (2026-09)

> **Scope**: `web-console` (React) + `web-portal` (Next.js) frontends vs `api` (Fastify) backend.
> **Base path**: `api` axios client → `baseURL = "/api/v1"` (`web-console/src/lib/api.ts`); `vendorApi` wrapper → `/api/v1` too (`web-console/src/lib/vendor-api.ts`). All paths below are relative to `/api/v1` unless stated.
> **Method**: extracted every `api.get/post/put/patch/delete`, `vendorApi.*`, playground gateway `path:`/`fetch`, `MjSunoTasksPage` fetch, and portal public fetch across both frontends (~190 distinct path-prefixes), and cross-checked against the full backend route table (497 `app.<method>(...)` registrations across `api/src/routes/*.ts`).
> **Known gaps excluded**: the 7 previously-identified and now-implemented endpoints (`/me/recharge/records`, `/me/redemption/history`, `/me/chat/history`, `/me/login-history`, `/me/preferences/notifications`+PUT/reset, `/admin/models`, `/models/:name/channels`) are all registered in the current code and are NOT repeated here.
> **Read-only analysis** — no files were modified.

---

## Legend

- **Backend status**: `MISSING` = no route exists (would 404); `EXISTS` = route present (shape may or may not match).
- **Implementability**: `trivial` (clone an existing pattern, ~0.5–1 day) · `small` (~1–2 days) · `large` (multi-file, ~3–5 days) · `very-large` (new subsystem, ≥1 week).
- **Requirement doc**: best-fit SPEC/PRD/ref in `docs/`; where nothing exists, marked "no dedicated doc".

---

## A. CONFIRMED-MISSING (new gaps — likely 404)

### A1. User onboarding — `<family> /me/onboarding/*`
| Field | Value |
|---|---|
| Frontend | `web-console/src/components/OnboardingWizard.tsx:56, 63, 69, 80` |
| API paths | `GET /me/onboarding/status`; `POST /me/onboarding/step`; `POST /me/onboarding/skip`; `POST /me/onboarding/complete` |
| Backend status | MISSING (no `onboarding` registration anywhere in `api/src/routes`) |
| Source table | none; add `onboarding_state` / `onboarding_step` columns → `db/schema/users.ts` |
| Suggested auth | `jwtAuth` |
| Implementability | trivial–small |
| Requirement doc | `docs/SPEC-§18-用户端体验增强.md` §18.3 用户引导 (Onboarding), priority P1 |

### A2. Sales customer tags — `/me/customer-tags`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/SalesCustomerDetailPage.tsx:87` |
| API path | `GET /me/customer-tags` |
| Backend status | MISSING |
| Source table | `db/schema/agent-customers.ts` (tags column) or `db/schema/users.ts` |
| Suggested auth | `jwtAuth` |
| Implementability | trivial–small |
| Requirement doc | `docs/SPEC-§11-业务员支撑模块.md` §11.1 CRM — 客户标签 (多标签：企业客户/开发者/高价值/需跟进/流失预警/已签约) |

### A3. Admin affiliate/referral — `/admin/affiliate/*`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/AdminAffiliatePage.tsx:22, 23, 27` |
| API paths | `GET /admin/affiliate/config`; `GET /admin/affiliate/records`; `PUT /admin/affiliate/config` |
| Backend status | MISSING |
| Source table | `db/schema/system-config.ts` (config) + `db/schema/agent-invitations.ts` / `db/schema/agent-commissions.ts` (records) |
| Suggested auth | `adminAuth`; config PUT additionally `requireNotImpersonated()` + `requireOperation2fa` |
| Implementability | small |
| Requirement doc | `docs/SPEC-§8-运营增长模块.md` / `docs/SPEC-§19-代理商支撑增强.md` (推广/分销/等级权益) — noted D1/D2 model alignment in §8 |

### A4. Admin competitive monitor — `/admin/competitive/monitor`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/admin/AdminCompetitiveMonitorPage.tsx:28` |
| API path | `GET /admin/competitive/monitor?model_type=...` |
| Backend status | MISSING |
| Source table | `db/schema/model-health-stats.ts` + `db/schema/supplier-models.ts` (+ `db/schema/suppliers.ts`) |
| Suggested auth | `adminAuth` |
| Implementability | small |
| Requirement doc | closest: `docs/SPEC-§11-业务员支撑模块.md` 竞品对比 (销售侧) + `docs/SPEC-§5-核心引擎.md` 行情定价建议 — no dedicated admin competitive doc |

### A5. Admin marketplace listing — `/admin/marketplace` (path differs from backend)
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/admin/AdminMarketplacePage.tsx:14` |
| API path | `GET /admin/marketplace?keyword=...&category=...` |
| Backend status | MISSING — backend only registers `GET /admin/models/marketplace` and `GET /admin/models/marketplace/:model/suppliers` (`admin-marketplace.ts:138,185`); the `/admin/marketplace` plural is NOT routed |
| Source table | `db/schema/model-health-stats.ts` / `db/schema/supplier-models.ts` |
| Suggested auth | `adminAuth` |
| Implementability | small (either add alias route or align the frontend path) |
| Requirement doc | `docs/ref-4.18-kpi-drill-healthcheck.md` (渠道健康度 `vendor_health`) / `docs/ref-4.3-vendor-model.md` |

### A6. Admin coupon management — `/admin/coupons*`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/AdminCouponPage.tsx:37, 42` |
| API paths | `GET /admin/coupons?<params>`; `POST /admin/coupons/generate` |
| Backend status | MISSING (only the `campaignCouponCodes` schema column is imported, no coupon routes) |
| Source table | `db/schema/coupons.ts` (table `campaignCouponCodes`) + `db/schema/campaigns.ts` |
| Suggested auth | `adminAuth` |
| Implementability | small |
| Requirement doc | `docs/SPEC-§8-运营增长模块.md` §8.1 代理兑换码配额与激励 |

### A7. Agent dashboard — `/agent/dashboard`, `/agent/consumption/recent`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/AgentDashboardPage.tsx:23, 24` |
| API paths | `GET /agent/dashboard`; `GET /agent/consumption/recent` |
| Backend status | MISSING (agent.ts has commission/withdraw/settlement/invite/ranking/materials, but no dashboard or consumption) |
| Source table | `db/schema/consumption-records.ts` + `db/schema/agent-customers.ts` + `db/schema/agent-commissions.ts` |
| Suggested auth | `jwtAuth` (+ agent role guard) |
| Implementability | small |
| Requirement doc | `docs/SPEC-§3-代理商体系.md` / `docs/SPEC-代理商后台主导版.md` (代理看板/归属客户消费) |

### A8. Agent customers — `/agent/customers`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/AgentCustomersPage.tsx:12` |
| API path | `GET /agent/customers?search=...` |
| Backend status | MISSING |
| Source table | `db/schema/agent-customers.ts` + `db/schema/users.ts` |
| Suggested auth | `jwtAuth` (+ agent role guard) |
| Implementability | small |
| Requirement doc | `docs/SPEC-代理商后台主导版.md` (归属客户视图) / `docs/SPEC-§3-代理商体系.md` |

### A9. Agent consumption — `/agent/consumption`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/AgentConsumptionPage.tsx:14` |
| API path | `GET /agent/consumption?customer_name=...&date_start=...&date_end=...` |
| Backend status | MISSING |
| Source table | `db/schema/consumption-records.ts` + `db/schema/agent-customers.ts` |
| Suggested auth | `jwtAuth` (+ agent role guard) |
| Implementability | small |
| Requirement doc | `docs/SPEC-§3-代理商体系.md` / `docs/SPEC-代理商后台主导版.md` |

### A10. Agent self-service (settings/reports/withdraw) — `/me/agent/*` + `/agent/reports`
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/AgentSettingsPage.tsx:109, 113, 117, 121, 127, 134, 143, 157, 168, 188` |
| API paths | `GET /me/agent/profile`; `GET /me/agent/commission-rules`; `GET /me/agent/withdraw-summary`; `GET /me/agent/withdrawals`; `GET /me/agent/commissions`; `GET /me/agent/notif-prefs`; `PUT /me/agent/notif-prefs`; `GET /agent/reports`; `POST /agent/reports`; `POST /me/agent/withdraw` |
| Backend status | MISSING (agent.ts has `/api/v1/agent/{commission,withdraw/...,settlements,invite/...,ranking,materials}` but NOT `/me/agent/*` nor `/agent/reports`) |
| Source table | `db/schema/agents.ts`, `db/schema/agent-commissions.ts`, `db/schema/agent-withdrawals.ts`, `db/schema/user-notifications.ts` (notif-prefs) |
| Suggested auth | `jwtAuth` (+ agent role guard); `POST /me/agent/withdraw` likely needs `requireOperation2fa` |
| Implementability | small–large |
| Requirement doc | `docs/SPEC-§24-代理商增强.md` (素材库/查询/自定义) + `docs/SPEC-代理商后台主导版.md` (提现/佣金/通知) |

### A11. MJ / Suno task gateway — `/api/v1/v1/{mj,suno}/*` (alias missing)
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/MjSunoTasksPage.tsx:321, 376, 377` |
| API paths | `POST /api/v1/v1/mj/submit/:action`; `POST /api/v1/v1/suno/submit/:action`; `GET /api/v1/v1/mj/task/:id/fetch`; `GET /api/v1/v1/suno/fetch/:id` |
| Backend status | MISSING — `api/src/routes/task-relay.ts` registers only `/v1/mj/...` and `/v1/suno/...` (top-level). Unlike chat/messages/embeddings/completions/responses/rerank, **no `/api/v1/v1/` alias** is registered for MJ/Suno. Because these routes don't exist under `/api/v1/v1/`, the frontend 404s. |
| Source table | `db/schema/task-records.ts` |
| Suggested auth | `apiKeyAuth` (matches the gateway `/v1/*` convention) |
| Implementability | trivial (register `/api/v1/v1/mj|suno` alias routes mirroring task-relay.ts, or point frontend at `/v1/*` via a non-`/api/v1` base) — but verify which contract is intended |
| Requirement doc | no dedicated doc; captured in `docs/api-contract.md` gateway-alias convention (applies to all `/v1/*`) |

### A12. Vendor self-service portal — `/vendor/*` (whole subsystem)
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/vendor/VendorDashboardPage.tsx:15`; `VendorModelsPage.tsx:25, 29, 34`; `VendorSettlementsPage.tsx:30, 34, 38`; `VendorStatsPage.tsx:18`; `VendorRegisterPage.tsx:17` |
| API paths | `GET /vendor/dashboard`; `GET /vendor/models`; `POST /vendor/models`; `PUT /vendor/models/:id`; `GET /vendor/settlements`; `GET /vendor/settlements/:id`; `POST /vendor/settlements/:id/dispute`; `GET /vendor/stats`; `fetch("/api/v1/vendor/register")` |
| Backend status | MISSING — **no `/api/v1/vendor/*` routes exist** in any routes file, and no `vendorAuth` middleware exists (`api/src/middleware/`). The entire self-service vendor contract is unimplemented. |
| Source table | `db/schema/suppliers.ts` (vendor=supplier), `db/schema/supplier-models.ts`, `db/schema/vendor-settlements.ts`, `db/schema/vendor-pricing.ts` |
| Suggested auth | new `vendorAuth` middleware (vendor token / supplier session); register route as public+login for `/vendor/register` |
| Implementability | **very-large** — new backend subsystem (auth + CRUD + settlement + stats) |
| Requirement doc | `docs/ref-4.10-vendor-self-service.md` (§4.10 渠道自助管理) + `docs/SPEC-§25-供应商增强.md` (§25 渠道增强: 结算对账/公告/自助结算) |

### A13. Admin vendor CRUD - `/admin/vendors` collection/detail/create/approve-reject
| Field | Value |
|---|---|
| Frontend | `web-console/src/pages/AdminVendorsPage.tsx:47, 52, 57, 69` |
| API paths | `GET /admin/vendors`; `GET /admin/vendors/:id`; `POST /admin/vendors` (create); `POST /admin/vendors/:id/approve`; `POST /admin/vendors/:id/reject` |
| Backend status | MISSING — `api/src/routes/admin-vendor-alias.ts` mirrors only `POST /admin/vendors/:id/{toggle-status,models,keys}`. The equivalent supplier CRUD exists under `/admin/suppliers/*` (`suppliers.ts`), so this may be an alternate/parallel "vendors" UI that was never aliased. |
| Source table | `db/schema/suppliers.ts` (vendor = supplier) |
| Suggested auth | `adminAuth`; approve/reject muted adds `requireOperation2fa` |
| Implementability | small (alias the `/admin/suppliers` endpoints to `/admin/vendors` for list/detail/create/approve-reject) — but confirm whether it should be retired in favor of AdminSupplierListPage |
| Requirement doc | `docs/SPEC-§25-供应商增强.md` / `docs/ref-4.3-vendor-model.md` |

> Note: A12 and A13 both surface the "vendor/supplier" domain; A13 may be a superseded UI (AdminSupplierListPage owns `/admin/suppliers`). Triage A13 either as alias-creation or as UI consolidation; A12 is a genuine green-field backend subsystem.

---

## B. EXISTS, shape-only (not 404 — route present, method/payload differs)

| Frontend (file:line) | API path called | Backend route(s) | Issue |
|---|---|---|---|
| `pages/SecurityPage.tsx:213` | `PUT /me/change-password` | `POST /api/v1/me/change-password` (`me.ts:649`) | Method mismatch → would 405, not 404 |
| `pages/SecurityPage.tsx:131` | (commented) `PUT /me/change-email` | `POST /api/v1/me/change-email` (`me.ts:684`) | Dead code; commented out. Note only |
| `pages/StatisticsPage.tsx:210` | (commented) `GET /me/statistics` | — | Dead code; commented out. No backend route, but unreachable |

---

## C. Verified EXISTS (matched — no action) — summary

- **Admin**: `/admin/finance*`, `/admin/credit/*`, `/admin/customers*` (incl. batch, impersonate, reset-password), `/admin/agents*` (incl. approvals), `/admin/groups`, `/admin/balance-alerts*`, `/admin/consumption/*`, `/admin/conversation-records*`, `/admin/content*`, `/admin/i18n/*`, `/admin/invoices/*` + `invoice-stats/*`, `/admin/tickets*`, `/admin/knowledge-base`, `/admin/manual-topup*`, `/admin/notification-policies`, `/admin/price-changes*` + `/substitutability`, `/admin/real-name*`, `/admin/risk/*`, `/admin/security/*` (ip-blacklist, incidents, compliance/report), `/admin/settings*` (site/rate-limit/security/features/api/billing/smtp), `/admin/sys/*` (cache/db/logs/version/migrations), `/admin/undo*`, `/admin/webhooks*`, `/admin/audit-logs`, `/admin/audit/permissions`, `/admin/subscription/plans`, `/admin/vendor-profiles|pricing|costs|stats|performance|models|settlements|supplier-bill-match`, `/admin/support*` (kpi/tickets/assist/test-keys/audit-logs), `/admin/multimodal-models`, `/admin/deletion*`, `/admin/data-requests`, `/admin/discount-rules`, `/admin/tax-banking/*`, `/admin/marketplace-health`→`/admin/models/marketplace`.
- **User `/me`**: `/me/stats`, `/me/keys`, `/me/models`, `/me/logs`, `/me/billing/*`, `/me/real-name`, `/me/notifications*`, `/me/notification-settings*`, `/me/group`, `/me/group/models`, `/me/api-keys*` (+revoke-all), `/me/change-password`(POST), `/me/change-email`(POST), `/me/invoices*`, `/me/tickets*`, `/me/settings`, `/me/devices*`, `/me/consent/*`, `/me/data-export*`, `/me/deletion/*`, `/me/knowledge-base*`, `/me/announcements*`, `/me/webhooks*`, `/me/customers*`(+assign/contacts/status/tags/consumption/recharges), `/me/sales-performance`, `/me/follow-reminders*`.
- **Auth**: `/auth/{register,login,logout,refresh,me,forgot-password,reset-password,send-email-code}`, `/auth/2fa/*`, `/auth/oauth/*`, `/me`.
- **Public**: `/public/{stats,api-config,models,models/health,status,site-config,i18n/entries,blog,blog/:slug,pricing}`, `/health`, `/models/:name/channels`.
- **Gateway** (with `/api/v1/v1/` alias): `/v1/{chat/completions,messages,embeddings,completions,responses,rerank}`.
- **Agent (existing subset)**: `/agent/{commission,withdraw/*,settlements,invite/*,materials,ranking}` — only the A7–A10 ones above are missing.

---

## D. Coverage tally

- Distinct frontend GET+POST+PUT+PATCH+DELETE path-prefixes checked: **~190** (all `/admin/*`, `/me/*`, `/agent/*`, `/auth/*`, `/public/*`, `/vendor/*`, 7 playground gateway paths, 4 MJ/Suno paths, ~10 portal public calls, plus typed-client variants).
- **CONFIRMED-MISSING**: **13 endpoint families** → 47 distinct path-prefixes (A1–A13 above; A7+A9 are separate prefixes but related; A12 alone is ~9 prefixes).
- **EXISTS, shape-only**: 3 items (B).
- All other checked prefixes matched an existing backend route.

## E. Suggested implementation wave (priority by effort/impact)

1. **A11** MJ/Suno alias (trivial) — register `/api/v1/v1/mj|suno/*` aliases matching the other gateway endpoints.
2. **A13** `/admin/vendors` CRUD alias (small) — after confirming whether to consolidate with AdminSupplierListPage.
3. **A1, A2, A3, A6** user/admin trivial–small endpoints (onboarding, customer-tags, affiliate, coupons).
4. **A7–A10** agent dashboard/consumption/customers + `/me/agent/*` (small–large; needs agent schema reads).
5. **A4, A5** competitive monitor + `/admin/marketplace` (small).
6. **A12** `/vendor/*` self-service portal (very-large subsystem; plan as a dedicated workstream with `vendorAuth`).

## F. Backend conventions used (for implementers)

- User endpoints → `preHandler: [jwtAuth]`; admin → `[adminAuth]`; mutations often add `requireNotImpersonated()` and/or `requireOperation2fa` / `requirePerm('...')`; gateway → `apiKeyAuth` or `routeOptions` helper; public → none.
- Every new missing family requires a **new route file + an `import`/`register` entry in `api/src/app.ts`** (no existing file to extend, except A11 where the alias can be added inside `task-relay.ts`).
```