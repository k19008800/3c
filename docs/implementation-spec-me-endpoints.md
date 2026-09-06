# Implementation Spec — 7 Missing `/api/v1` Endpoints

> Research report for `C:\Users\ZH\.openclaw\workspace\3cloud` (Fastify + TS monorepo).
> Scope: precise, zero-ambiguity backend route specs for endpoints that currently return 404.
> **No code changes were made — this is a spec only.**

Conventions used throughout (mirrored from existing routes):
- Envelope: most read endpoints reply `{ data: { ... } }`; errors reply `{ message }` with HTTP status (see `lib/errors.ts` → `AppError` / `UnauthorizedError`, and how `extractError` in `web-console/src/lib/api.ts:36-38` reads `err.response.data.message`).
- `userId(request)` = `request.userContext.userId`, injected by the `jwtAuth` preHandler.
- `jwtAuth` pattern (copy exactly): read `Authorization: Bearer`, call `verifyToken(token)`, set `request.userContext`. See `api/src/routes/me.ts:24-31`, `me-gap.ts:30-37`, `recharge.ts:49-55`.
- `adminAuth` = `jwtAuth` + `role ∈ {admin, super_admin}`. See `api/src/routes/suppliers.ts:40-46`, `admin-marketplace.ts:39-45`.
- Registration: add the new `app.register(xxxRoutes)` in `api/src/app.ts` (~line 200-266). Existing user-domain endpoints live in several files; new `/me/*` gap endpoints have precedent in `me-gap.ts` (a standalone file registered at app.ts:263).

---

## Summary table

| Endpoint | Page | Status now | Data source exists? | Auth |
|---|---|---|---|---|
| A `GET /me/recharge/records` | TopupRecordsPage | 404 | Yes (`recharge_orders`) | jwtAuth |
| B `GET /me/redemption/history` | RedemptionPage | 404 | Yes (`campaign_coupon_codes`+`coupon_codes`) | jwtAuth |
| C `GET /me/chat/history` | UserChatPage | 404 | Yes (`chat_conversations`+`chat_messages`) | jwtAuth |
| D `GET /me/login-history` | SecurityPage | 404 | **NO table** | jwtAuth |
| E `GET/PUT /me/preferences/notifications` + `reset` | NotificationSettingsPage | 404 | **NO table / NO route** | jwtAuth |
| F `GET /vendors/public` | (see note) VendorSelectorPage | 404 | **Premise wrong** — page does not call it | none |
| G `GET /admin/models` | AdminModelsPage | 404 | Partial (`supplier_models` aggregation) | adminAuth |

---

## A. `GET /api/v1/me/recharge/records`

### Frontend contract — `web-console/src/pages/TopupRecordsPage.tsx`
Type (lines 14-29):
```ts
interface TopupRecord {
  id: number;
  order_id: string;
  amount: number;            // NOTE: displayed as (amount/100).toFixed(2) "¥"
  payment_method: string;    // 'alipay'|'wechat'|'bank_transfer'|'bank'|'usdt'
  method_label?: string;
  status: string;            // 'completed'|'pending'|'rejected'|'cancelled'
  status_label?: string;
  create_time: string;
  complete_time: string | null;
  payer?: string;
  trade_no?: string | null;
  remark?: string | null;
  voucher?: string | null;
  reject_reason?: string | null;
}
```
Request (line 60-73):
```ts
const params: any = { page, page_size: pageSize };
if (timeRange === "custom" && startDate && endDate) {
  params.start_date = startDate; params.end_date = endDate;
} else if (timeRange !== "custom") {
  params.days = Number(timeRange);   // 7 | 30 | 90
}
const r = await api.get<{ data: { list: TopupRecord[]; total: number } }>("/me/recharge/records", { params });
return r.data.data;                  // => { list, total } (TOTAL REQUIRED)
```
- Response must include **`total`** (top margin shows `共 {total} 条记录`, line 321; pagination `page*pageSize>=total`, line 416).
- Export path also hits `/me/recharge/records` with `page_size=9999` (line 98-99) — cap page_size at **100** but note the export expects a large page; return up to 9999 when requested or the export silently truncates. (Prefer honoring `page_size` up to e.g. 10_000.)
- `status` label mapping in-page (lines 40-45): `completed`→已完成(success), `pending`→待审核(warning), `rejected`→驳回(danger), `cancelled`→已取消(default). `method_label` fallback map (lines 33-39): `alipay`, `wechat`, `bank_transfer`, `bank`, `usdt`.

### Data source
Table **`recharge_orders`** (`api/src/db/schema/recharge-orders.ts:12-36`):
- `id`, `userId` (fk none declared — plain int), `orderNo` (unique), `amount` numeric(18,2), `currency`, `method` varchar, `status` enum `pending|paid|failed|cancelled|refunded`, `paidAt`, `note`, `metadata` jsonb, `createdAt`, `updatedAt`.

Field map (DB → response):
| Response | Source |
|---|---|
| `id` | `rechargeOrders.id` |
| `order_id` | `rechargeOrders.orderNo` |
| `amount` | `Number(rechargeOrders.amount)` **(see risk below)** |
| `payment_method` | `rechargeOrders.method` |
| `method_label` | label map (bank_transfer→对公转账, alipay→支付宝, wechat→微信支付, usdt→USDT, ...) |
| `status` | `rechargeOrders.status` mapped: `paid→completed`, `pending→pending`, `failed→rejected`, `cancelled→cancelled`, `refunded→refunded` |
| `create_time` | `rechargeOrders.createdAt` |
| `complete_time` | `rechargeOrders.paidAt` (null when pending) |
| `trade_no` | `metadata->>'transfer_no'` (the ONLY "流水号" stored; see migration `0028_recharge_orders_transfer_no_unique.sql`) |
| `remark` | `rechargeOrders.note` |
| `reject_reason` | `metadata->>'review_note'` (written on reject, see `admin-finance-missing.ts:626`, `recharge.ts:689`) |
| `payer` | **NOT STORED** → return `null` |
| `voucher` | **NOT STORED** (only `metadata->>'evidence_remark'` string; `evidence_url` is explicitly rejected at `admin-finance-missing.ts:383-385`) → return `null` |

Query sketch (joins not needed):
```
SELECT * FROM recharge_orders WHERE user_id = :uid
  [ AND created_at >= NOW() - (:days) DAYS ]   -- when ?days given (7/30/90)
  [ AND created_at BETWEEN :start_date 00:00 AND (end_date 23:59:59) ] -- when custom
ORDER BY created_at DESC
LIMIT :page_size OFFSET (:page-1)*:page_size
-- total via SELECT count(*) ... same WHERE
```

### Reusable code
- **`GET /me/recharge-orders`** already exists at `api/src/routes/recharge.ts:235-267`. It returns a DIFFERENT field set/status mapping for `RechargePage` (uses `paidAt`→`paid_at`, `userStatus` maps `paid→success`, reports `can_retry`). **Do not reuse it for this route** — endpoint A is a new, richer, total-bearing contract. But copy its pagination parsing + count pattern.
- Status-mapping helper `userStatus()` at `recharge.ts:92-95` is the file-local analog to adapt.

### Auth + placement
- Auth: **jwtAuth** (user-scoped, own records only). Route body must be `{ data: { list, total } }`.
- Place: append to **`api/src/routes/recharge.ts`** (it already owns `/me/*` recharge domain; only `POST /api/v1/me/redemption/redeem` is there — a sibling GET here is consistent). Register via existing `app.register(rechargeRoutes)` at `app.ts:230` (no new registration needed).

### Gaps / risks
1. **`amount` unit conflict (⚠️ high).** TopupRecordsPage renders `(amount/100).toFixed(2)` (lines 350, 490) and CSV `(r.amount/100).toFixed(2)` (line 111). `rechargeOrders.amount` is yuan (e.g. `100.00` for ¥100; recharge POST stores `amount.toFixed(2)` at recharge.ts:159). Returning the raw yuan value will show ¥1.00 for a ¥100 order. **Decision needed:** return `amount` as integer 分 (yuan×100) to satisfy the page, OR the frontend has a latent bug. The existing `/me/recharge-orders` returns yuan (no /100), so the two endpoints are inconsistent on this page's assumption. Flag to implementer: make the two endpoints agree or adjust the page.
2. `payer` / `voucher` / real `trade_no` are not persisted; must be `null` (safe for optional chaining).
3. No status enum value maps to "充值成功" exactly; frontend already maps `completed`.

---

## B. `GET /api/v1/me/redemption/history`

### Frontend contract — `web-console/src/pages/RedemptionPage.tsx`
Type (lines 13-19):
```ts
interface RedeemHistory {
  id: number;
  code: string;
  amount: number;       // ✓ displayed as (v).toFixed(2) — yuan, NOT /100
  batch_name: string;
  created_at: string;
}
```
Request (line 35-39):
```ts
queryKey: ["me-redemption-history"],
queryFn: async () =>
  (await api.get<{ data: { list: RedeemHistory[] } }>("/me/redemption/history?page_size=50")).data.data,
```
- Expects **`{ data: { list: [...] } }`** (no `total` used). Passes `?page_size=50`; support a page_size cap (mirror `recharge.ts` page_size parsing). Order newest-first.
- `amount` rendered as `¥{v.toFixed(2)}` (line 68) and `created_at` parsed with `new Date(...)` (line 78) — return ISO strings.
- `code` display: `3C-XXXXXXXXXX` uppercase (input auto-uppercased, line 100). The redeemed code is stored as given — normalize to uppercase on query or trust stored value (redeem trims+uppercases at line 43).

### Data source
Two joined tables (`api/src/db/schema/coupons.ts`):
- **`campaign_coupon_codes`** (line 21-29): `id`, `campaignId`, `code` (unique), `status` (`unused`/`used`), `usedBy`, `usedAt`, `createdAt`.
- **`coupon_codes`** (batch template, line 3-19): `id`, `batchCode`, `batchName`, `faceValue` numeric(18,2), `status`, ... The redeem endpoint (`recharge.ts:284-364`) links `campaignCouponCodes.campaignId → couponCodes.id`.

Query sketch:
```
SELECT c.id AS id, c.code AS code, c.used_at AS used_at, b.face_value AS face_value, b.batch_name AS batch_name
FROM campaign_coupon_codes c
INNER JOIN coupon_codes b ON b.id = c.campaign_id
WHERE c.used_by = :uid AND c.status = 'used'
ORDER BY c.used_at DESC (or c.created_at DESC)
LIMIT :page_size
```
Field map: `id`→`campaignCouponCodes.id`, `code`→`campaignCouponCodes.code`, `amount`→`Number(couponCodes.faceValue)`, `batch_name`→`couponCodes.batchName ?? null`, `created_at`→`campaignCouponCodes.usedAt ?? campaignCouponCodes.createdAt`.

### Reusable code
- **`POST /api/v1/me/redemption/redeem`** at `recharge.ts:284-364` is the sibling write path; it demonstrates the exact join and the `campaign_coupon_codes` import (`import { campaignCouponCodes } from '../db/schema/coupons'`, line 45). Reuse that import + join.

### Auth + placement
- Auth: **jwtAuth**. Reply `{ data: { list } }`.
- Place: **`api/src/routes/recharge.ts`** (same file already owns `/me/redemption/redeem`), default page_size 20, cap 100 (or honor 50 as requested).

### Gaps / risks
- If a user's redemption was recorded with `status='used'` but `usedBy` is the id, this query is exact. No other source of redemption history exists. `amount` here is **yuan** (consistent with face_value and the redeem response `amount: Number(row.faceValue)` at recharge.ts:359) — no /100 here (contrast endpoint A).

---

## C. `GET /api/v1/me/chat/history`

### Frontend contract — `web-console/src/pages/UserChatPage.tsx`
Type (lines 30-35):
```ts
interface HistItem {
  session_id: number;
  status: string;        // expected 'closed'|'active'| else shown as 等待中
  created_at: string;
  msg_count: number;
}
```
Request (line 48-52):
```ts
queryKey: ["me-chat-history"],
queryFn: async () =>
  (await api.get<{ data: { list: HistItem[] } }>("/me/chat/history")).data.data,
```
- Expects **`{ data: { list: [...] } }`**.
- Rendering (lines 347-374): `会话 #{session_id}`; status badge maps `'closed'→已结束`, `'active'→进行中`, else `等待中`; line shows `created_at` via `new Date(...)` and `{msg_count} 条消息`.

### Data source — `chat-support.ts` (`api/src/db/schema/chat-support.ts`)
- **`chat_conversations`** (line 9-19): `id`, `userId`, `status` (`open`/`closed`), `lastMessage`, `createdAt`, `updatedAt`.
- **`chat_messages`** (line 26-33): `id`, `conversationId`, `role` (`user`/`staff`), `content`, `createdAt`. Index `idx_chat_messages_conversation` for filtering.

These are the real 在线客服 tables. ⚠️ These are NOT the AI-model conversation tables (`conversation-context.ts` / `conversation_context_records` are for model traffic — do not use those). Confirmed: `chat_conversations`/`chat_messages` are written by admin support routes (`admin-support-missing.ts:430-469`) and stats (`:150-169`).

Query sketch (per current user):
```
SELECT cc.id AS session_id, cc.status AS status, cc.created_at AS created_at,
       (SELECT COUNT(*) FROM chat_messages cm WHERE cm.conversation_id = cc.id) AS msg_count
FROM chat_conversations cc
WHERE cc.user_id = :uid
ORDER BY cc.updated_at DESC (or created_at DESC)
```

### Reusable code
- **`GET /admin/chat/conversations`** at `api/src/routes/admin-support-missing.ts:363-410` does the exact `chat_conversations` list query (plus user join). Mirror it, add `WHERE cc.user_id = :uid` and the `msg_count` correlated subquery, and drop the total (frontend doesn't read it, but returning it is harmless).

### Auth + placement
- Auth: **jwtAuth**. Reply `{ data: { list } }`.
- Place: **`api/src/routes/me-gap.ts`** (a user-domain gap endpoint; `meGapRoutes` already registered at app.ts:263) or a new dedicated file. `me-gap.ts` is the cleanest precedent for a `/me/chat/history` gap route.

### Gaps / risks
- `msg_count` requires a per-row subquery or `LEFT JOIN ... GROUP BY cc.id`. Confirm `chat_conversations` has `user_id` (yes) and that customer-service sessions are created there (admin writes confirm). If the WS chat currently writes elsewhere, this may return empty for live users — verify the WS write path separately.

---

## D. `GET /api/v1/me/login-history`

### Frontend contract — `web-console/src/pages/SecurityPage.tsx`
Type/request (lines 655-661):
```ts
function LoginHistoryPanel() {
  const histQ = useQuery({
    queryKey: ["me-login-history"],
    queryFn: async () => (await api.get<{ data: { records: any[] } }>("/me/login-history")).data.data,
  });
  const records = histQ.data?.records ?? [];
```
- Expects **`{ data: { records: [...] } }`** (`records`, not `list`).
Row fields read (lines 686-699):
```ts
r.login_at ? new Date(r.login_at).toLocaleString() : "—"   // time
r.ip ?? "—"                                                // ip
r.city ?? "未知"                                            // city
r.device_info ?? (r.browser ? `${r.os ?? ""} / ${r.browser}` : "—")  // device
r.success === false || r.risk_level === "blocked"           // 失败 (success=false or risk_level='blocked')
```
Includes **success and failure** attempts; unknown browser/os tolerated (optional).

### Data source — ⚠️ **NO TABLE EXISTS**
Search results: no `login-history`, `login_history`, `login_log`, `auth_log` table anywhere in `api/src/db/schema/`. The only login telemetry is **`users.last_login_at` / `users.last_login_ip`** (`api/src/db/schema/users.ts:27-28`), a single latest record — cannot satisfy a "records" history with success/failure/ip/city/device per event.
`user_sessions` (`sessions.ts`) is active-session rows, not login attempts, and has no success/risk marker.

### Required action
A **new table + migration is required** to implement this endpoint, e.g.:
```
login_history(
  id serial PK,
  user_id int not null,
  success boolean not null,
  ip varchar(50),
  city varchar(100),
  device_info jsonb,        -- { os, browser, user_agent }
  risk_level varchar(20),   -- 'blocked' | null
  login_at timestamptz default now()
)
-- index: (user_id, login_at desc)
```
Then backfill by writing rows from `auth.ts` `POST /auth/login` (currently the login path only updates `users.last_login` — see `auth.ts:134-168`) and any failed-login branch. Without writes, the endpoint returns `{ records: [] }`.

### Auth + placement
- Auth: **jwtAuth**; reply `{ data: { records: [...] } }`.
- Place: `api/src/routes/me-gap.ts` (or new `me-login-history.ts`). Register in app.ts.
- The writing side should be added to `auth.ts` login handler (out of scope but required for non-empty data).

### Gaps / risks
- **Blocking gap:** requires schema migration + write plumbing in `auth.ts`; pure GET route would always return `[]`. `risk_level:'blocked'`/`city` requires geo/IP lookup not currently present.
- The response field names are `records` (plural), NOT `list` — keep exact.

---

## E. `GET /me/preferences/notifications`, `PUT /me/preferences/notifications`, `POST /me/preferences/notifications/reset`

### Frontend contract — `web-console/src/pages/NotificationSettingsPage.tsx`
Type (lines 13-20):
```ts
interface NotificationPrefs {
  emailEnabled: boolean;
  emailFrequency: string;      // 'realtime'|'daily'|'off'
  emailDigestTime: string;     // e.g. '09:00'
  inAppPreferences: Record<string, boolean>;   // per EVENT key
  emailPreferences: Record<string, boolean>;   // per EVENT key
  balanceLowThreshold: number; // ¥ threshold (default 10)
}
```
All three calls:
- **GET** (line 71-75): `(await api.get<{ data: NotificationPrefs }>("/me/preferences/notifications")).data.data`
- **PUT** (line 80-88): `api.put("/me/preferences/notifications", data)` where `data` is the **full** `NotificationPrefs` (page posts `localPrefs`, line 121).
- **POST reset** (line 90-99): `api.post("/me/preferences/notifications/reset")` (no body) — then page refetches.
Default fallback in-page: every event in `emailPreferences`/`inAppPreferences` defaults to `true` when a key is absent (`?? true`, line 228-229), `balanceLowThreshold` default 10 (line 284).
Event keys (lines 22-48): finance `[recharge_success, consumption_notify, balance_low, refund_status]`; security `[login_reminder, key_created_deleted, login_anomaly(forced), 2fa_changed(forced)]`; system `[system_maintenance, api_changed, version_update]`; marketing `[campaign_notify, promotion_info, product_update]`.
Forced (always on, immutable in UI, lines 141, 227): `login_anomaly`, `2fa_changed`.

### Data source — ⚠️ **NO TABLE / NO ROUTE EXISTS**
- No `notification_preferences` table (schema glob has none).
- No `notification`-pref columns on `users` (only `language`, `twoFactorEnabled`, `lastLogin*`).
- **No `/me/preferences/*` route** of any kind (grep of `api/src` for `/me/preferences` → none). Closest existing things:
  - `GET /me/notification-settings` at `me.ts:598-600` returns `{ data: { types:{}, prefs:{} } }` — **different path and shape**, not used by this page.
  - `POST /me/notification-settings/:type/email` at `me-gap.ts:345-364` persists a per-event email toggle into **`system_config`** with key `notify_pref.<uid>.<type>` value `{"email": bool}` — a partial, single-channel mechanism only.

### Required design (recommend persistence in `system_config`)
Reuse the `system_config` kv pattern (`api/src/db/schema/system-config.ts`): store the whole prefs object under one key per user, e.g. `notify_pref.<uid>.prefs` with value `JSON.stringify(prefsObj)`; **GET** reads it (upsert defaults when missing), **PUT** replaces it (validate `emailFrequency`, force `login_anomaly`/`2fa_changed` true, clamp `balanceLowThreshold >= 1`), **reset** writes the default object and returns it.

Defaults to return when absent / on reset:
```json
{
  "emailEnabled": true,
  "emailFrequency": "realtime",
  "emailDigestTime": "09:00",
  "inAppPreferences": { "recharge_success":true,"consumption_notify":true,"balance_low":true,"refund_status":true,
                         "login_reminder":true,"key_created_deleted":true,"login_anomaly":true,"2fa_changed":true,
                         "system_maintenance":true,"api_changed":true,"version_update":true,
                         "campaign_notify":true,"promotion_info":true,"product_update":true },
  "emailPreferences": { /* same 14 keys, all true */ },
  "balanceLowThreshold": 10
}
```

### Auth + placement
- Auth: **jwtAuth** for all three (`GET`, `PUT`, `POST /reset`). Reply `{ data: prefs }`.
- Place: **`api/src/routes/me-gap.ts`** (it already owns `POST /me/notification-settings/:type/email` and writes `system_config`). Add the three endpoints there; `meGapRoutes` is already registered (app.ts:263).

### Gaps / risks
- No storage exists → pick `system_config` (zero-migration, precedent) as recommended; a dedicated table is the alternative (needs migration).
- Fire HTTP verbs exactly: PUT (not PATCH) for save, POST for reset.
- Forced events must be forced server-side too (defense against the disabled UI checkboxes).
- The existing `POST /me/notification-settings/:type/email` single-event toggle is separate; to avoid divergence, consider having it also update the prefs object, or leave as-is (document as legacy). Minimum for this task: the three new endpoints are self-contained.

---

## F. `GET /api/v1/vendors/public` — ⚠️ PREMISE DOES NOT MATCH THE CODE

### Critical correction
The claimed caller **`web-console/src/pages/VendorSelectorPage.tsx` does NOT call `/vendors/public`.** Search of the whole web-console and api source finds `/vendors/public` in **only one place**: `test-reports/drill-user-13819008800-20260819.md:147` (a stale drill report line), not in any React page.

What `VendorSelectorPage.tsx` actually calls:
- Line 109: `GET /me/models` → `api.get<MeModelRow[]>("/me/models")` (returns an array; exists at `me.ts:149-165` — hardcoded `DEFAULT_MODELS`).
- Line 117: `` `GET /models/${selectedModel}/channels` `` → `api.get<ModelChannelsResponse>(...)` and reads `.channels` (does **NOT** exist in the api — grep for `:name/channels` / `:model/channels` returns nothing).

So **neither** the claimed `/vendors/public` (F) **nor** the page's real `/models/:name/channels` exists. The target of any F work should actually be:
1. Either provide `GET /models/:name/channels` returning `{ model, channels: ChannelPricingRow[] }` (see `channelization.ts:1-21` for the shape: `channel_code, channel_name, input_price, output_price, cache_read/write_input_price, pricing_group, status, health, latency_ms, recommended, credit, maintenance`), **or**
2. If a `/vendors/public` endpoint is truly wanted, it was never wired to any current page — confirm with product owner before implementing.

### If `/vendors/public` is still required (speculative)
"Vendor" in this system = the **`suppliers` table** (`api/src/db/schema/suppliers.ts:13-32`: `id, name, code, baseUrl, apiType, status(active|maintenance|offline|deprecated), healthStatus, ...`). Precedents mapping suppliers→"vendors": `api/src/routes/admin-vendor-alias.ts` (all `/admin/vendors/*` operate on `suppliers`). A public vendor list would be, e.g.:
```
GET /api/v1/vendors/public  (NO auth)
SELECT id, name, code, status, health_status FROM suppliers
  WHERE status = 'active'   -- public-visible suppliers only
```
No page consumes it → shape is free-form; recommend `{ data: { list: [{ id, name, code, status }] } }` (or wrap as array — mirror `/public/models` which returns `{ list }`).

### Auth + placement
- If implemented: **no auth** (public domain, like `api/src/routes/public.ts`). Place in **`public.ts`** (`publicRoutes`, registered at app.ts:231).

### Gaps / risks
- **Do not implement `GET /vendors/public` for VendorSelectorPage** — it won't fix the 404 the page hits; the page needs `GET /models/:name/channels` (and reads `/me/models`). Confirm the true requirement first.

---

## G. `GET /api/v1/admin/models` (list)

### Frontend contract — `web-console/src/pages/AdminModelsPage.tsx`
Type (lines 6-15):
```ts
interface M {
  id: number;
  name: string;
  display_name: string;
  category: string;
  context_length: number;      // rendered as `${N}K`
  description: string;
  status: string;              // 'active' | 'offline'
  vendor_count: number;
}
```
Request (line 32-36):
```ts
queryKey: ["admin-models", keyword],
queryFn: async () =>
  (await api.get<{ data: { list: M[]; pagination: { total: number } } }>(`/admin/models?keyword=${keyword}&page_size=50`)).data.data,
```
- Params: `keyword` (name/display search) + `page_size` (fixed 50 by the page; support `page_size`+`page` generically). Reply `{ data: { list: M[], pagination: { total } } }`.
- `pagination.total` displayed at line 66 (`共 {n} 种模型`). Status toggle (line 51, 94) calls `PUT /admin/models/:id { status }` then refetches this list; create calls `POST /admin/models`, edit calls `PUT /admin/models/:id`.
- Note: existing `PUT /admin/models/:id` (`suppliers.ts:314-341`) and `PATCH /admin/models/:id/status` (`suppliers.ts:364-381`) operate on **`supplier_models`** rows. `POST /admin/models` **does not exist** — create path also missing (out of scope here, but flagged).

### Data source — no standalone `models` table
There is **no `models` table** (grep confirms). The canonical model catalog is **`supplier_models`** (`api/src/db/schema/supplier-models.ts:12-39`):
`id, supplierId(fk→suppliers), modelName, platformModel, inputPrice(varchar), outputPrice(varchar), costCache*, currency, priceUnit, status(active|inactive|deprecated|beta), capabilities(jsonb[]), maxTokens, description, createdAt, updatedAt`.

The page's "模型管理" list = distinct **platform models** aggregated across suppliers. Query sketch:
```
SELECT
  id            -- no stable platform-model id; pick modelName (or MIN(id))
  name          -- supplier_models.modelName (the platform model name)
  display_name  -- supplier_models.platformModel (used as display in other routes)
  category      -- NOT available -> derive from capabilities? default 'chat'
  context_length-- map maxTokens/1024 (page prints `${N}K`) or 0
  description   -- supplier_models.description
  status        -- 'active':'active', else 'offline' (map inactive/... -> 'offline'
  vendor_count  -- COUNT(DISTINCT supplier_id) GROUP BY modelName
FROM supplier_models
[ WHERE modelName ILIKE '%:keyword%' OR platformModel ILIKE '%:keyword%' ]
GROUP BY modelName ...
ORDER BY modelName
```
Distinctness key: `supplier_models` is per (supplier, model); the same logical model appears across suppliers — must `GROUP BY modelName` and aggregate `vendor_count`.

### Reusable code
- **`GET /public/models`** at `public.ts:91-123` aggregates `supplier_models` by supplier (returns `supplierModels.modelName`, `platformModel` as `display_name`, `maxTokens` as `context_length`) — reuse its column mapping and the R8 test-model filter (exclude `market-test-%`, `alias-%`, `compat-%`, `verify-%`, lines 115-118).
- **`GET /admin/models/marketplace`** (`admin-marketplace.ts:53-98`) and `PUT /admin/models/:id` (`suppliers.ts:314-341`) confirm the `adminAuth` pattern for the adminX routes.

### Auth + placement
- Auth: **adminAuth**. Reply `{ data: { list, pagination: { total } } }`.
- Place: **`api/src/routes/admin-marketplace.ts`** (it owns the `/admin/models/*` family — add `GET /admin/models` alongside `/admin/models/marketplace`) or `suppliers.ts`. `adminMarketplaceRoutes` registered at app.ts:235.

### Gaps / risks
1. **`category` and `display_name`/`name` semantics are ambiguous.** The page treats `name` as the model's canonical name and `display_name` as the label; `public.ts` maps `modelName`→`name`, `platformModel`→`display_name`. Reuse that mapping so admin list labels match the public catalog.
2. **`context_length` (K)** — `supplier_models.maxTokens` is an absolute token count, not "K"; either return `Math.round(maxTokens/1024)` (page prints `K`) or change the page. Flag for confirmation.
3. **`status`** — DB enum is `active|inactive|deprecated|beta`; page expects `active|offline`. Map `active`→`active`, everything else→`offline`.
4. **Stable `id`** — no single `models` PK; use `modelName` as the list id or `MIN(id)`. Existing `/admin/models/:id` routes take an `id` that is a `supplier_models.id` (per-supplier row), so a derived platform-model `id` will collide with those paths' semantics. **Careful:** creating a platform-level id that doesn't equal a `supplier_models.id` breaks `PUT /admin/models/:id`/`PATCH :id/status`. Recommend the implementer confirm whether the list id should be a real `supplier_models.id` (first row for that model) so the existing edit/toggle routes work.
5. `POST /admin/models` (create) is also missing — page has a create modal — flag as follow-up (not in the 7).

---

## Cross-cutting notes

- **Registration:** every new plugin must be registered in `api/src/app.ts` (lines 200-266). If adding to `me-gap.ts`/`recharge.ts`/`public.ts`/`admin-marketplace.ts`, they are already registered — no app.ts change needed.
- **Error contract:** throw `AppError(msg, status, code)` / `UnauthorizedError` / `ValidationError` from `lib/errors.ts`; the Fastify error handler serializes `{ message }` which `extractError` reads.
- **Naming discipline:** keep the exact snake_case field names and the exact envelope key (`list` vs `records`) the pages expect.
- **Amount scale:** TopupRecordsPage divides by 100 (endpoint A) while RedemptionPage does not (endpoint B) — do not "normalize" these independently; they reflect two different page assumptions and must be reconciled with the frontend owner.