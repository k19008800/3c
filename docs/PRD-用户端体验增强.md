
> **閫傜敤瀵硅薄**锛氱粓绔敤鎴凤紙寮€鍙戣€?浼佷笟鐢ㄦ埛/API 璋冪敤鑰咃級
> **鐘舵€?*锛歅0-P2 鏂板闇€姹?

### 18.1 API 鍦ㄧ嚎璋冭瘯宸ュ叿

#### 鑳屾櫙

鐢ㄦ埛鎺ュ叆骞冲彴鏃讹紝闇€瑕佽皟璇?API 璋冪敤銆傚綋鍓嶅彧鑳介€氳繃 Playground 鍋氱畝鍗曟祴璇曪紝娌℃湁瀹屾暣鐨?API 璋冭瘯宸ュ叿銆傜敤鎴烽渶瑕佺湅鍒拌姹?鍝嶅簲/璐圭敤/Tokens/鑰楁椂绛夊畬鏁翠俊鎭紝杩樿鑳藉揩閫熺敓鎴愯皟鐢ㄤ唬鐮併€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 璇锋眰缂栬緫鍣?| 閫夋嫨妯″瀷 + 杈撳叆鍙傛暟锛坢odel/messages/temperature/max_tokens/stream锛?|
| 鍝嶅簲灞曠ず | 鏍煎紡鍖栧睍绀哄搷搴斿唴瀹?+ 鑰楁椂 + 杈撳叆 Tokens + 杈撳嚭 Tokens + 璐圭敤鏄庣粏 |
| 閾捐矾杩借釜 | 璋冭瘯妯″紡鑷姩杩斿洖 `_chain` 閾捐矾杩借釜淇℃伅锛屽睍绀烘瘡涓€姝ワ細妯″瀷瑙ｆ瀽鈫掕矾鐢卞€欓€夆啋闄愭祦妫€鏌モ啋涓婃父杞彂 |
| 渚涘簲鍟嗗姣?| 璋冭瘯杩斿洖鎵€鏈夊€欓€変緵搴斿晢鐨勫敭浠?鍋ュ悍鍒?鐘舵€侊紝鏀寔鎸夋渶浣庝环/鍔犳潈闅忔満/鎵嬪姩绛栫暐閫夋嫨 |
| 妯″瀷绫诲瀷鏀寔 | 鏀寔 chat/completions锛堝惈娴佸紡锛? embeddings + rerank 涓夌璋冭瘯妯″紡 |
| 浠ｇ爜鐢熸垚 | 鑷姩鐢熸垚 Curl / Python / Node.js 璋冪敤浠ｇ爜锛屼竴閿鍒?|
| 娴佸紡鍝嶅簲 | 鏀寔 SSE 娴佸紡鍝嶅簲灞曠ず锛屽疄鏃舵樉绀?Token 杈撳嚭 |

#### 鍚庣瀹炵幇鐘舵€?

| 绔偣 | 瀹炵幇鐘舵€?| 璇存槑 |
|------|---------|------|
| `POST /api/v1/playground/chat/completions` | 鉁?宸插疄鐜?| 鏀寔娴佸紡 + 闈炴祦寮忥紝`_chain` 閾捐矾杩借釜锛岀瓥鐣ラ€夋嫨鍙傛暟 |
| `POST /api/v1/playground/embeddings` | 鉁?宸插疄鐜?| 鍚戦噺宓屽叆璋冭瘯锛岃繑鍥炲€欓€変緵搴斿晢璇︽儏 |
| `POST /api/v1/playground/rerank` | 鉁?宸插疄鐜?| 閲嶆帓搴忚皟璇曪紝閾捐矾杩借釜 |
| `GET /api/v1/playground/models` | 鉁?宸插疄鐜?| 鎸夌被鍨嬪垎缁勮繑鍥炲彲璋冭瘯妯″瀷鍒楄〃 |
| `GET /api/v1/playground/models/:id/vendors` | 鉁?宸插疄鐜?| 鍗曚釜妯″瀷渚涘簲鍟嗚鎯?|

#### 寰呭疄鐜?

| 鍔熻兘 | 璇存槑 | 浼樺厛绾?|
|------|------|--------|
| 璋冭瘯鍘嗗彶璁板綍 | 淇濆瓨鏈€杩?100 鏉¤皟璇曡褰曪紝鏀寔閲嶆斁鍜屽姣?| P1 |
| 澶氭ā鍨嬪姣?| 鍚屼竴璇锋眰鍙戦€佸埌澶氫釜妯″瀷锛屾í鍚戝姣?| P1 |
| 浠ｇ爜鐢熸垚 | 涓€閿敓鎴愬悇璇█璋冪敤浠ｇ爜 | P1 |

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| POST | /api/v1/playground/chat/completions | 瀵硅瘽璋冭瘯锛堟祦寮?闈炴祦寮忥紝甯﹂摼璺拷韪級 | model_manage |
| POST | /api/v1/playground/embeddings | 鍚戦噺宓屽叆璋冭瘯 | model_manage |
| POST | /api/v1/playground/rerank | 閲嶆帓搴忚皟璇?| model_manage |
| GET | /api/v1/playground/models | 鍙皟璇曟ā鍨嬪垪琛紙鎸夌被鍨嬪垎缁勶級 | model_manage |
| GET | /api/v1/playground/models/:id/vendors | 妯″瀷渚涘簲鍟嗚鎯?| model_manage |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 鈫?鏂板"API 璋冭瘯"鍏ュ彛 | 璇锋眰缂栬緫鍣?+ 鍝嶅簲灞曠ず + 閾捐矾杩借釜闈㈡澘 + 绛栫暐閫夋嫨 |
| 绠＄悊鍚庡彴 鈫?API 璋冭瘯 鈫?渚涘簲鍟嗗姣?| 灞曠ず鍊欓€変緵搴斿晢鍒楄〃鍙婂敭浠?鍋ュ悍鍒?|
| 妯″瀷涓績 鈫?妯″瀷鍗＄墖 | 鏂板"璋冭瘯"鎸夐挳锛屽揩鎹疯烦杞埌 API 璋冭瘯椤?|

---

### 18.2 鐢ㄩ噺棰勭畻鎺у埗

#### 鑳屾櫙

鐢ㄦ埛锛堝挨鍏舵槸浼佷笟鐢ㄦ埛锛夐渶瑕佹帶鍒?API 娑堣垂棰勭畻锛岄伩鍏嶆剰澶栬秴鏀€傚綋鍓嶅彧鏈変綑棰濆憡璀︼紝涓嶈兘璁剧疆棰勭畻涓婇檺鍜岃嚜鍔ㄦ殏鍋溿€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 棰勭畻璁剧疆 | 鏃ラ绠?/ 鏈堥绠?/ 鎬婚绠楋紝瓒呴檺鑷姩鏆傚仠璋冪敤 |
| 棰勭畻閫氱煡 | 娑堣垂杈惧埌 50%/80%/90%/100% 鏃堕€氱煡 |
| 瀛?Key 棰勭畻 | 浼佷笟鐢ㄦ埛涓烘瘡涓?Key 璁剧疆鐙珛棰勭畻 |
| 棰勭畻鍛ㄦ湡 | 鎸夎嚜鐒舵湀/鑷畾涔夊懆鏈熼噸缃?|
| 瓒呴澶勭悊 | 瓒呴绠楁椂锛氭殏鍋?闄嶇骇锛堝垏鎹㈠埌渚垮疁妯″瀷锛?浠呭憡璀?涓夌妯″紡鍙€?|
| 棰勭畻鎶ヨ〃 | 灞曠ず棰勭畻浣跨敤杩涘害銆佸墿浣欓搴︺€侀浼版秷鑰楁椂闂?|

#### 鏁版嵁琛ㄨ璁?

```typescript
// budget_rules 鈥?棰勭畻瑙勫垯
export const budgetRules = pgTable("budget_rules", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  apiKeyId: integer("api_key_id").references(() => apiKeys.id), // null = 鍏ㄥ眬棰勭畻
  name: varchar("name", { length: 50 }).notNull(),
  period: varchar("period", { length: 10 }).notNull(), // daily | monthly | total
  limit: numeric("limit", { precision: 14, scale: 4 }).notNull(),
  notifyAt: jsonb("notify_at").notNull().default([50, 80, 90]), // 閫氱煡闃堝€肩櫨鍒嗘瘮
  action: varchar("action", { length: 16 }).notNull().default("warn"),
  // warn | pause | downgrade
  downgradeModel: varchar("downgrade_model", { length: 50 }), // 闄嶇骇鐩爣妯″瀷
  resetDay: integer("reset_day").default(1), // 鏈堥绠楅噸缃棩
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// budget_usage 鈥?棰勭畻浣跨敤璁板綍
export const budgetUsage = pgTable("budget_usage", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => budgetRules.id),
  period: varchar("period", { length: 10 }).notNull(), // "2026-07"
  consumed: numeric("consumed", { precision: 14, scale: 4 }).notNull().default(0),
  lastNotifyAt: timestamp("last_notify_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 鍞竴绾︽潫锛?ruleId, period)
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| POST | /api/v1/me/budget-rules | 鍒涘缓棰勭畻瑙勫垯 | 鐢ㄦ埛 |
| GET | /api/v1/me/budget-rules | 棰勭畻瑙勫垯鍒楄〃 | 鐢ㄦ埛 |
| PATCH | /api/v1/me/budget-rules/:id | 鏇存柊棰勭畻瑙勫垯 | 鐢ㄦ埛 |
| DELETE | /api/v1/me/budget-rules/:id | 鍒犻櫎棰勭畻瑙勫垯 | 鐢ㄦ埛 |
| GET | /api/v1/me/budget-usage | 褰撳墠棰勭畻浣跨敤鎯呭喌 | 鐢ㄦ埛 |
| GET | /api/v1/me/budget-usage/history | 棰勭畻浣跨敤鍘嗗彶 | 鐢ㄦ埛 |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 鐢ㄦ埛鎺у埗鍙?-> 鏂板"棰勭畻绠＄悊"鍏ュ彛 | 棰勭畻瑙勫垯鍒楄〃 + 鍒涘缓/缂栬緫琛ㄥ崟 |
| 鐢ㄦ埛鎺у埗鍙?-> 浠〃鐩?| 棰勭畻杩涘害鏉＄粍浠讹紙鍏ㄥ眬棰勭畻浣跨敤鐜囷級 |
| 鐢ㄦ埛鎺у埗鍙?-> API Key 绠＄悊 -> Key 璇︽儏 | 鏂板"鐙珛棰勭畻"璁剧疆 |

---

### 18.3 鐢ㄦ埛寮曞锛圤nboarding锛?

#### 鑳屾櫙

鏂扮敤鎴锋敞鍐屽悗锛岄潰瀵圭┖鐧界殑鎺у埗鍙颁笉鐭ラ亾浠庡摢寮€濮嬨€傚綋鍓嶇己灏戜氦浜掑紡寮曞锛屽緢澶氱敤鎴锋敞鍐屽悗娌℃湁瀹屾垚绗竴娆¤皟鐢ㄥ氨娴佸け浜嗐€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 浜や簰寮忓紩瀵?| 娉ㄥ唽鍚庡脊绐楀紩瀵硷細鍒涘缓 Key -> 澶嶅埗浠ｇ爜 -> 鍙戣捣绗竴娆¤皟鐢?-> 鏌ョ湅鐢ㄩ噺 |
| 鎺ュ叆妫€鏌ユ竻鍗?| 娉ㄥ唽 / 鍒涘缓 Key / 璋冭瘯璋冪敤 / 璁剧疆棰勭畻 / 鍏呭€?/ 鏌ョ湅鏂囨。锛屽畬鎴愮姸鎬佹爣璁?|
| 绀轰緥浠ｇ爜 | 棰勭疆澶氳瑷€绀轰緥浠ｇ爜锛岀敤鎴峰彲鐩存帴澶嶅埗浣跨敤 |
| 蹇€熸帴鍏ユā鏉?| 閫夋嫨浣跨敤鍦烘櫙锛堣亰澶?鏂囨湰鐢熸垚/宓屽叆锛夛紝鑷姩鐢熸垚瀵瑰簲鐨勪唬鐮佸拰閰嶇疆 |
| 鏂扮敤鎴蜂华琛ㄧ洏 | 鏂扮敤鎴烽娆＄櫥褰曞睍绀哄紩瀵奸潰鏉匡紝寮曞瀹屾垚鍚庢秷澶?|

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/me/onboarding/progress | 鑾峰彇寮曞杩涘害 | 鐢ㄦ埛 |
| PATCH | /api/v1/me/onboarding/progress | 鏇存柊寮曞杩涘害 | 鐢ㄦ埛 |
| GET | /api/v1/me/onboarding/examples | 鑾峰彇绀轰緥浠ｇ爜鍒楄〃 | 鐢ㄦ埛 |
| GET | /api/v1/me/onboarding/examples/:lang | 鑾峰彇鎸囧畾璇█绀轰緥浠ｇ爜 | 鐢ㄦ埛 |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 鐢ㄦ埛鎺у埗鍙?-> 棣栨鐧诲綍 | 寮曞寮圭獥锛堟楠ゅ紡锛?|
| 鐢ㄦ埛鎺у埗鍙?-> 浠〃鐩?| 鏂扮敤鎴峰睍绀哄紩瀵奸潰鏉匡紝鑰佺敤鎴烽殣钘?|
| 鐢ㄦ埛鎺у埗鍙?-> 鏂板"蹇€熸帴鍏?鍏ュ彛 | 鍦烘櫙閫夋嫨 + 浠ｇ爜鐢熸垚 + 浣跨敤璇存槑 |

---

### 18.4 璐﹀崟涓庢秷璐瑰垎鏋?

#### 鑳屾櫙

鐢ㄦ埛闇€瑕佷簡瑙ｈ嚜宸辩殑娑堣垂鏄庣粏鍜岃秼鍔匡紝褰撳墠鍙湁璋冪敤鏃ュ織锛岀己灏戞湀搴﹁处鍗曞拰娑堣垂鍒嗘瀽鑳藉姏銆備紒涓氱敤鎴峰挨鍏堕渶瑕佽处鍗曞鍑虹敤浜庡唴閮ㄦ姤閿€銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 鏈堝害璐﹀崟 | 鐢熸垚 PDF 鏈堝害璐﹀崟锛氭秷璐规€婚 / 妯″瀷鍒嗗竷 / 姣忔棩瓒嬪娍 / Key 鍒嗗竷 |
| 璐﹀崟涓嬭浇 | 鏀寔 PDF / CSV 鏍煎紡涓嬭浇 |
| 娑堣垂鍒嗘瀽 | 鎸夋ā鍨?/ 鎸?Key / 鎸夋棩 / 鎸夊皬鏃跺缁存秷璐瑰垎甯冨浘琛?|
| 鎴愭湰浼樺寲寤鸿 | 鍩轰簬鐢ㄩ噺鎺ㄨ崘鏇寸粡娴庣殑妯″瀷锛岄浼拌妭鐪侀噾棰?|
| 璐圭敤棰勬祴 | 鍩轰簬褰撳墠娑堣垂瓒嬪娍棰勬祴鏈湀鏈€绘秷璐癸紝鏍囪鏄惁瓒呴绠?|
| 瀵规瘮鍒嗘瀽 | 鏈湀 vs 涓婃湀娑堣垂瀵规瘮锛岀幆姣斿闀跨巼 |

#### 鏁版嵁琛ㄨ璁?

```typescript
// user_billing_summaries 鈥?鐢ㄦ埛鏈堝害璐﹀崟姹囨€?
export const userBillingSummaries = pgTable("user_billing_summaries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  billingPeriod: varchar("billing_period", { length: 7 }).notNull(), // "2026-07"
  totalConsumption: numeric("total_consumption", { precision: 14, scale: 4 }).notNull().default(0),
  totalCalls: integer("total_calls").notNull().default(0),
  totalTokens: bigint("total_tokens", { mode: "number" }).notNull().default(0),
  modelBreakdown: jsonb("model_breakdown"),
  // [{model: "gpt-4o", calls: 100, tokens: 500000, cost: 5.00}]
  dailyBreakdown: jsonb("daily_breakdown"),
  // [{"date": "2026-07-01", calls: 50, cost: 0.50}]
  keyBreakdown: jsonb("key_breakdown"),
  // [{keyId: 1, prefix: "sk-abc", calls: 80, cost: 4.00}]
  prevPeriodTotal: numeric("prev_period_total", { precision: 14, scale: 4 }), // 涓婃湀鎬婚
  billGeneratedAt: timestamp("bill_generated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 鍞竴绾︽潫锛?userId, billingPeriod)
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/me/billing/summaries | 鏈堝害璐﹀崟鍒楄〃 | 鐢ㄦ埛 |
| GET | /api/v1/me/billing/summaries/:period | 鎸囧畾鏈堜唤璐﹀崟璇︽儏 | 鐢ㄦ埛 |
| GET | /api/v1/me/billing/summaries/:period/download | 涓嬭浇璐﹀崟 PDF | 鐢ㄦ埛 |
| GET | /api/v1/me/billing/analysis | 娑堣垂鍒嗘瀽鏁版嵁锛堝缁达級 | 鐢ㄦ埛 |
| GET | /api/v1/me/billing/forecast | 璐圭敤棰勬祴 | 鐢ㄦ埛 |
| GET | /api/v1/me/billing/optimization-tips | 鎴愭湰浼樺寲寤鸿 | 鐢ㄦ埛 |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 鐢ㄦ埛鎺у埗鍙?-> 鏂板"璐﹀崟涓庢秷璐?鍏ュ彛 | 璐﹀崟鍒楄〃 + 涓嬭浇 + 娑堣垂鍒嗘瀽鍥捐〃 |
| 鐢ㄦ埛鎺у埗鍙?-> 璐﹀崟璇︽儏 | 妯″瀷鍒嗗竷楗煎浘 + 姣忔棩瓒嬪娍鍥?+ Key 鍒嗗竷琛?|
| 鐢ㄦ埛鎺у埗鍙?-> 浠〃鐩?| 鏂板"璐圭敤棰勬祴"鍜?浼樺寲寤鸿"鍗＄墖 |

---

### 18.5 閫氱煡鍋忓ソ绠＄悊

#### 鑳屾櫙

鐢ㄦ埛鏀跺埌澶ч噺閫氱煡锛屼絾鏃犳硶鎺у埗鍝簺閫氱煡鍙戦€併€侀€氳繃浠€涔堟笭閬撳彂閫併€傛湁浜涚敤鎴疯寰楅€氱煡澶锛屾湁浜涚敤鎴疯寰楀叧閿€氱煡娌℃敹鍒般€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 浜嬩欢绫诲瀷 | 浣欓涓嶈冻 / Key 杩囨湡 / 寮傚父鐧诲綍 / 娑堣垂瓒呴绠?/ 妯″瀷涓嬬嚎 / 宸ュ崟鍥炲 / 鍏憡 / 娲诲姩 |
| 閫氱煡娓犻亾 | 绔欏唴閫氱煡 / 閭欢 / 鐭俊 / Webhook |
| 閫氱煡棰戠巼 | 瀹炴椂 / 姣忔棩姹囨€?/ 鍏抽棴 |
| 闈欓粯鏃舵 | 璁剧疆瀹夐潤鏃舵锛堝 23:00-08:00 涓嶆帹閫侊級 |
| 閫氱煡鍘嗗彶 | 鏌ョ湅鎵€鏈夊凡鍙戦€侀€氱煡璁板綍 |

#### 鏁版嵁琛ㄨ璁?

```typescript
// notification_preferences 鈥?閫氱煡鍋忓ソ
export const notificationPreferences = pgTable("notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id).unique(),
  eventSettings: jsonb("event_settings").notNull().default({
    balance_low: { channels: ["notification", "email"], frequency: "realtime" },
    key_expiring: { channels: ["notification", "email"], frequency: "realtime" },
    abnormal_login: { channels: ["notification", "email"], frequency: "realtime" },
    budget_exceeded: { channels: ["notification", "email"], frequency: "realtime" },
    model_deprecated: { channels: ["notification"], frequency: "realtime" },
    ticket_reply: { channels: ["notification", "email"], frequency: "realtime" },
    announcement: { channels: ["notification", "email"], frequency: "daily_summary" },
    promotion: { channels: ["notification"], frequency: "weekly" },
  }),
  quietStart: varchar("quiet_start", { length: 5 }), // "23:00"
  quietEnd: varchar("quiet_end", { length: 5 }), // "08:00"
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/me/notification-preferences | 鑾峰彇閫氱煡鍋忓ソ | 鐢ㄦ埛 |
| PATCH | /api/v1/me/notification-preferences | 鏇存柊閫氱煡鍋忓ソ | 鐢ㄦ埛 |
| GET | /api/v1/me/notifications | 閫氱煡鍘嗗彶鍒楄〃 | 鐢ㄦ埛 |
| PATCH | /api/v1/me/notifications/:id/read | 鏍囪宸茶 | 鐢ㄦ埛 |
| POST | /api/v1/me/notifications/read-all | 鍏ㄩ儴鏍囪宸茶 | 鐢ㄦ埛 |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 鐢ㄦ埛鎺у埗鍙?-> 鏂板"閫氱煡璁剧疆"鍏ュ彛 | 浜嬩欢绫诲瀷鍒楄〃 + 娓犻亾/棰戠巼閫夋嫨 + 闈欓粯鏃舵璁剧疆 |
| 鐢ㄦ埛鎺у埗鍙?-> 閫氱煡闈㈡澘 | 閫氱煡鍘嗗彶鍒楄〃 + 绛涢€?+ 鏍囪宸茶 |

---

### 18.6 璐﹀彿瀹夊叏涓績

#### 鑳屾櫙

鐢ㄦ埛闇€瑕佺鐞嗚嚜宸辩殑璐﹀彿瀹夊叏璁剧疆銆傚綋鍓嶆湁 2FA 鍜屽瘑鐮佷慨鏀癸紝浣嗙己灏戠櫥褰曡澶囩鐞嗐€佺櫥褰曟椿鍔ㄦ棩蹇楃瓑瀹夊叏鍔熻兘銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 鐧诲綍璁惧绠＄悊 | 鏌ョ湅鎵€鏈夊凡鐧诲綍璁惧锛堣澶囧悕 / IP / 鏈€鍚庢椿璺冩椂闂达級锛屾敮鎸佽繙绋嬬櫥鍑?|
| 鐧诲綍娲诲姩鏃ュ織 | 鏈€杩?30 澶╃櫥褰曡褰曪紙鏃堕棿 / IP / 鍦扮偣 / 璁惧 / 鎴愬姛/澶辫触锛?|
| 瀹夊叏璁剧疆 | 淇敼瀵嗙爜 / 缁戝畾鎵嬫満 / 缁戝畾閭 / 2FA 绠＄悊 |
| 寮傚父鐧诲綍鍛婅 | 鏂拌澶?鏂板湴鐐圭櫥褰曟椂涓诲姩閫氱煡 |
| 瀹夊叏璇勫垎 | 缁煎悎瀹夊叏璁剧疆瀹屾垚搴﹁瘎鍒嗭紝寮曞瀹屽杽瀹夊叏閰嶇疆 |

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/me/security/devices | 鐧诲綍璁惧鍒楄〃 | 鐢ㄦ埛 |
| POST | /api/v1/me/security/devices/:id/logout | 杩滅▼鐧诲嚭璁惧 | 鐢ㄦ埛 |
| GET | /api/v1/me/security/login-history | 鐧诲綍娲诲姩鏃ュ織 | 鐢ㄦ埛 |
| POST | /api/v1/me/security/change-password | 淇敼瀵嗙爜 | 鐢ㄦ埛 |
| POST | /api/v1/me/security/bind-phone | 缁戝畾鎵嬫満 | 鐢ㄦ埛 |
| POST | /api/v1/me/security/bind-email | 缁戝畾閭 | 鐢ㄦ埛 |
| GET | /api/v1/me/security/score | 瀹夊叏璇勫垎 | 鐢ㄦ埛 |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 鐢ㄦ埛鎺у埗鍙?-> 鏂板"瀹夊叏涓績"鍏ュ彛 | 瀹夊叏璁剧疆 + 鐧诲綍璁惧 + 鐧诲綍娲诲姩鏃ュ織 |
| 鐢ㄦ埛鎺у埗鍙?-> 瀹夊叏涓績 -> 璁惧绠＄悊 | 璁惧鍒楄〃 + 杩滅▼鐧诲嚭 |
| 鐢ㄦ埛鎺у埗鍙?-> 瀹夊叏涓績 -> 瀹夊叏璇勫垎 | 璇勫垎灞曠ず + 瀹屽杽寮曞 |

---

### 18.7 鍏紑 API 鐘舵€侀〉

#### 鑳屾櫙

鐢ㄦ埛璋冪敤 API 澶辫触鏃讹紝闇€瑕佸揩閫熷垽鏂槸鍚︽槸骞冲彴闂銆傚綋鍓嶆病鏈変竴涓叕寮€鐨勭姸鎬侀〉灞曠ず鍚勬湇鍔＄殑鍋ュ悍鐘跺喌銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 鏈嶅姟鐘舵€佸睍绀?| API 鏈嶅姟 / 鍚勬ā鍨嬩緵搴斿晢 / 鏁版嵁搴?/ 鍏ㄩ儴/閮ㄥ垎/鏁呴殰 鐘舵€佹寚绀虹伅 |
| 鍘嗗彶鍙敤鎬?| 杩?7 澶?/ 30 澶?/ 90 澶╁悇鏈嶅姟鍙敤鐜囪秼鍔垮浘 |
| 鏁呴殰浜嬩欢璁板綍 | 鍘嗗彶鏁呴殰浜嬩欢鍒楄〃锛氭椂闂?/ 褰卞搷鑼冨洿 / 鍘熷洜 / 淇鏃堕棿 |
| 鐘舵€佽闃?| 璁㈤槄鐘舵€佸彉鏇撮€氱煡锛堥偖浠?/ Webhook锛?|
| 鍝嶅簲鏃堕棿 | 鍚?API 绔偣杩?24 灏忔椂鍝嶅簲鏃堕棿瓒嬪娍 |

#### 鏁版嵁琛ㄨ璁?

```typescript
// service_incidents 鈥?鏈嶅姟鏁呴殰浜嬩欢
export const serviceIncidents = pgTable("service_incidents", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 16 }).notNull().default("investigating"),
  // investigating | identified | monitoring | resolved
  severity: varchar("severity", { length: 10 }).notNull(),
  // minor | major | critical
  affectedServices: jsonb("affected_services"),
  // ["api", "vendor:openai", "database"]
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  updates: jsonb("updates"),
  // [{time, status, description}]
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// status_subscribers 鈥?鐘舵€佽闃呰€?
export const statusSubscribers = pgTable("status_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 100 }),
  webhookUrl: varchar("webhook_url", { length: 500 }),
  token: varchar("token", { length: 64 }).notNull().unique(), // 閫€璁护鐗?
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/public/status | 褰撳墠鏈嶅姟鐘舵€?| 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/status/services | 鍚勬湇鍔¤缁嗙姸鎬?| 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/status/history | 鍙敤鎬у巻鍙茶秼鍔?| 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/status/incidents | 鍘嗗彶鏁呴殰浜嬩欢 | 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/status/latency | 鍝嶅簲鏃堕棿瓒嬪娍 | 鏃犻渶鐧诲綍 |
| POST | /api/v1/public/status/subscribe | 璁㈤槄鐘舵€侀€氱煡 | 鏃犻渶鐧诲綍 |
| DELETE | /api/v1/public/status/unsubscribe | 閫€璁?| 鏃犻渶鐧诲綍 |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| Portal -> 鏂板 /status 鐘舵€侀〉 | 鏈嶅姟鐘舵€佸睍绀?+ 鍙敤鎬ц秼鍔?+ 鏁呴殰浜嬩欢 |
| Portal -> 鐘舵€侀〉 | 璁㈤槄琛ㄥ崟锛堥偖绠?/ Webhook锛?|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鏁呴殰浜嬩欢绠＄悊" | 鍒涘缓/鏇存柊鏁呴殰浜嬩欢 |

---

### 18.8 瀹樻柟 SDK 涓庡璇█鏀寔

#### 鑳屾櫙

鐢ㄦ埛闇€瑕?SDK 鏉ュ揩閫熸帴鍏ュ钩鍙般€傚綋鍓嶅彧鏈?API 鏂囨。锛屾病鏈夊畼鏂?SDK 鍖咃紝鐢ㄦ埛闇€瑕佽嚜宸卞疄鐜?HTTP 璋冪敤锛屽鍔犱簡鎺ュ叆闂ㄦ銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| Python SDK | pip install 3cloud-sdk锛屾敮鎸?chat/completions/embeddings |
| Node.js SDK | npm install 3cloud-sdk锛屾敮鎸?chat/completions/embeddings |
| 浠ｇ爜绀轰緥椤?| 澶氳瑷€瀹屾暣绀轰緥锛歅ython / JS / Java / Go / Curl |
| 閿欒鎺掓煡鎸囧崡 | 甯歌閿欒鐮佸強瑙ｅ喅鏂规娓呭崟 |
| SDK 鐗堟湰绠＄悊 | 鍙戝竷鐗堟湰璁板綍 + 鏇存柊鏃ュ織 |

#### 鏁版嵁琛ㄨ璁?

```typescript
// sdk_versions 鈥?SDK 鐗堟湰鍙戝竷璁板綍
export const sdkVersions = pgTable("sdk_versions", {
  id: serial("id").primaryKey(),
  language: varchar("language", { length: 20 }).notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  changelog: text("changelog"),
  downloadUrl: varchar("download_url", { length: 500 }),
  packageUrl: varchar("package_url", { length: 500 }), // npm/pip 鍦板潃
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/public/sdks | SDK 鐗堟湰鍒楄〃 | 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/sdks/:language/latest | 鏈€鏂扮増鏈俊鎭?| 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/examples | 浠ｇ爜绀轰緥鍒楄〃 | 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/examples/:language | 鎸囧畾璇█绀轰緥 | 鏃犻渶鐧诲綍 |
| GET | /api/v1/public/error-guide | 閿欒鎺掓煡鎸囧崡 | 鏃犻渶鐧诲綍 |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| Portal -> 寮€鍙戣€呮枃妗?| 鏂板"SDK 涓庣ず渚?绔犺妭 |
| Portal -> 寮€鍙戣€呮枃妗?-> SDK | 鍚勮瑷€ SDK 瀹夎璇存槑 + 蹇€熷紑濮嬩唬鐮?|
| Portal -> 寮€鍙戣€呮枃妗?-> 閿欒鎺掓煡 | 閿欒鐮佸鐓ц〃 + 瑙ｅ喅鏂规 |

---

### 18.9 鐢ㄦ埛绔綋楠屽寮烘€昏

| 妯″潡 | 浼樺厛绾?| 棰勪及宸ヤ綔閲?| 鏍稿績浠峰€?|
|------|--------|-----------|---------|
| API 鍦ㄧ嚎璋冭瘯宸ュ叿 | P0 | 鍚庣 3d + 鍓嶇 5d | 闄嶄綆鎺ュ叆闂ㄦ锛岀敤鎴烽娆′綋楠?|
| 鐢ㄩ噺棰勭畻鎺у埗 | P0 | 鍚庣 4d + 鍓嶇 3d | 闃叉鎰忓瓒呮敮锛屼紒涓氱敤鎴峰垰闇€ |
| 鐢ㄦ埛寮曞 Onboarding | P0 | 鍚庣 2d + 鍓嶇 4d | 鎻愬崌娉ㄥ唽杞寲鐜囷紝鍑忓皯娴佸け |
| 璐﹀崟涓庢秷璐瑰垎鏋?| P1 | 鍚庣 4d + 鍓嶇 4d | 閫忔槑娑堣垂锛屼紒涓氭姤閿€ |
| 閫氱煡鍋忓ソ绠＄悊 | P1 | 鍚庣 2d + 鍓嶇 2d | 鐢ㄦ埛浣撻獙浼樺寲 |
| 璐﹀彿瀹夊叏涓績 | P1 | 鍚庣 3d + 鍓嶇 3d | 璐﹀彿瀹夊叏锛岀敤鎴蜂俊浠?|
| 鍏紑 API 鐘舵€侀〉 | P1 | 鍚庣 2d + 鍓嶇 3d | 閫忔槑搴︼紝闄嶄綆瀹㈡湇鍜ㄨ閲?|
| 瀹樻柟 SDK 涓庡璇█鏀寔 | P2 | 鍚庣 5d + 鍓嶇 2d | 闄嶄綆鎺ュ叆闂ㄦ锛岄暱鏈熶环鍊?|

**鍚堣**锛氬悗绔?25 浜哄ぉ + 鍓嶇 26 浜哄ぉ = 绾?6.5 鍛?

> 澶囨敞锛毬?8 鐢ㄦ埛绔綋楠屽寮虹洿鎺ラ潰鍚戠粓绔敤鎴凤紝P0 涓夐」锛堣皟璇曞伐鍏?棰勭畻鎺у埗/Onboarding锛夋槸鎻愬崌鐢ㄦ埛鐣欏瓨鍜岃浆鍖栫殑鍏抽敭銆?


---

