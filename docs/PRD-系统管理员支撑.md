
> **閫傜敤瀵硅薄**锛氱郴缁熺鐞嗗憳/杩愮淮宸ョ▼甯?鈥?璐熻矗绯荤粺缁存姢銆侀厤缃鐞嗐€佺洃鎺с€佹晠闅滄帓鏌ャ€佸畨鍏ㄧ鐞?
> **鐘舵€?*锛歅0-P2 鏂板闇€姹?

### 12.1 鎿嶄綔瀹¤鎺у埗鍙?

#### 鑳屾櫙

绯荤粺鏈夊畬鏁寸殑 audit_logs 琛ㄨ褰曟墍鏈夋搷浣滄棩蹇楋紝浣嗙己灏戜竴涓笓闂ㄧ殑鎿嶄綔瀹¤鎺у埗鍙扮敤浜庡揩閫熷畾浣嶉棶棰樸€傜鐞嗗憳鎺掓煡"璋佸湪浠€涔堟椂鍊欏仛浜嗕粈涔?鍏ㄩ潬缈绘暟鎹簱锛屾晥鐜囦綆銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 瀹¤鏃ュ織鏌ヨ | 鎸夋椂闂?鎿嶄綔浜?鎿嶄綔绫诲瀷/璧勬簮绫诲瀷/褰卞搷鑼冨洿澶氱淮绛涢€?|
| 鎿嶄綔璇︽儏 | 鏌ョ湅姣忔鎿嶄綔鐨?before/after JSON diff锛岄珮浜彉鏇村瓧娈?|
| 寮傚父鎿嶄綔妯″紡璇嗗埆 | 鑷姩鏍囪寮傚父鏃舵鎿嶄綔锛堝鍑屾櫒鎵归噺鏀归厤缃級銆佹晱鎰熸搷浣滐紙濡傛敼鏉冮檺/鏀逛綑棰濓級 |
| 鎿嶄綔鍥炴粴 | 瀵归厤缃彉鏇寸被鎿嶄綔锛屼竴閿洖婊氬埌鍙樻洿鍓嶇姸鎬?|
| 瀵煎嚭 | 瀹¤鏃ュ織瀵煎嚭 CSV/JSON 鏍煎紡 |

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/audit-logs | 瀹¤鏃ュ織鍒楄〃锛堝缁寸瓫閫夛級 | 绠＄悊鍛?|
| GET | /api/v1/admin/audit-logs/:id | 瀹¤鏃ュ織璇︽儏锛堝惈 diff锛?| 绠＄悊鍛?|
| GET | /api/v1/admin/audit-logs/anomalies | 寮傚父鎿嶄綔妯″紡妫€娴嬬粨鏋?| 绠＄悊鍛?|
| POST | /api/v1/admin/audit-logs/:id/rollback | 鍥炴粴鎿嶄綔 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/audit-logs/export | 瀵煎嚭瀹¤鏃ュ織 | 瓒呯骇绠＄悊鍛?|

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 鏂板"瀹¤鏃ュ織"鍏ュ彛 | 澶氱淮绛涢€?鍒楄〃+璇︽儏闈㈡澘 |
| 绠＄悊鍚庡彴 -> 瀹¤鏃ュ織 -> 璇︽儏 | before/after diff 鍙鍖?|
| 绠＄悊鍚庡彴 -> 瀹¤鏃ュ織 -> 寮傚父妫€娴?| 寮傚父鎿嶄綔妯″紡鍒楄〃 |

---

### 12.2 鏁版嵁搴撶鐞嗛潰鏉?

#### 鑳屾櫙

绯荤粺绠＄悊鍛橀渶瑕佷簡瑙ｆ暟鎹簱鐨勮繍琛岀姸鎬侊細鍝簺琛ㄦ暟鎹噺澶с€佺储寮曟槸鍚︾敓鏁堛€佹參鏌ヨ鎯呭喌銆傚綋鍓嶅彧鑳?SSH 鍒版湇鍔″櫒鎵ц SQL 鏌ヨ锛屾病鏈夊彲瑙嗗寲鐣岄潰銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 琛ㄦ€昏 | 鏄剧ず鎵€鏈夎〃鍚?琛屾暟/鏁版嵁澶у皬/绱㈠紩澶у皬/鏈€鍚?VACUUM 鏃堕棿 |
| 绱㈠紩鐘舵€?| 绱㈠紩浣跨敤鐜?鏈娇鐢ㄧ储寮?閲嶅绱㈠紩妫€娴?|
| 鎱㈡煡璇㈠垎鏋?| 鎱㈡煡璇㈠垪琛紙鎵ц鏃堕棿/閿佺瓑寰?鎵弿琛屾暟/鏌ヨ鏂囨湰锛?|
| 杩炴帴鏌ョ湅 | 褰撳墠娲昏穬杩炴帴鏁?杩炴帴鏉ユ簮/IP 鍒嗗竷 |
| SQL 鎵ц | 鍙妯″紡 SQL 鎵ц鍣紙浠呭厑璁?SELECT锛岀姝?INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE锛?|
| Schema 娴忚鍣?| 鏌ョ湅琛ㄧ粨鏋?瀛楁绫诲瀷/榛樿鍊?绾︽潫/澶栭敭/绱㈠紩 |

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/database/tables | 琛ㄥ垪琛ㄥ強缁熻淇℃伅 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/database/tables/:name | 琛ㄧ粨鏋勮鎯?| 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/database/indexes | 绱㈠紩鐘舵€佹姤鍛?| 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/database/slow-queries | 鎱㈡煡璇㈠垪琛?| 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/database/connections | 褰撳墠杩炴帴 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/database/query | 鎵ц鍙 SQL | 瓒呯骇绠＄悊鍛?|

> 瀹夊叏绾︽潫锛歅OST /api/v1/admin/database/query 浠呭厑璁?SELECT 璇彞锛屾湇鍔＄瑙ｆ瀽 SQL 璇硶鏍戞嫤鎴墍鏈夊啓鎿嶄綔銆傛墍鏈夋煡璇㈣褰曞埌 audit_logs銆?

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鏁版嵁搴?鍏ュ彛 | 琛ㄦ€昏+绱㈠紩鐘舵€?鎱㈡煡璇?杩炴帴鏁?|
| 绠＄悊鍚庡彴 -> 鏁版嵁搴?-> Schema 娴忚鍣?| 琛ㄧ粨鏋勫睍绀?|
| 绠＄悊鍚庡彴 -> 鏁版嵁搴?-> SQL 鎵ц鍣?| 鍙 SQL 缂栬緫鍣紝甯﹁娉曢珮浜拰缁撴灉灞曠ず |

---

### 12.3 缂撳瓨绠＄悊鎺у埗鍙?

#### 鑳屾櫙

Redis 缂撳瓨鏄郴缁熸€ц兘鐨勫叧閿€傚綋鍓嶆病鏈夊彲瑙嗗寲鐣岄潰鏌ョ湅 Redis 鐘舵€併€佹竻鐞嗙紦瀛樸€佸垎鏋愮紦瀛樺懡涓巼銆傜鐞嗗憳鎺掓煡闂鏃讹紝鏃犳硶纭畾鏄惁鏄紦瀛橀棶棰樸€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| Redis 姒傝 | 鍐呭瓨浣跨敤閲?Key 鎬绘暟/鍛戒腑鐜?骞冲潎 TTL/杩炴帴鏁?|
| Key 妯″紡娴忚 | 鎸夊墠缂€鍒嗙粍灞曠ず Key 鏁伴噺锛坲ser:* / config:* / rate_limit:* / session:*锛?|
| 缂撳瓨娓呯悊 | 鎸夊墠缂€娓呯悊缂撳瓨锛堝娓呯悊鎵€鏈?user:* 缂撳瓨锛夛紝鏀寔纭寮圭獥 |
| 缂撳瓨鏌ヨ | 鏌ヨ鎸囧畾 Key 鐨勫€?|
| 缂撳瓨缁熻 | 鍚勭紦瀛樺尯鍩熺殑鍛戒腑鐜?杩囨湡鏁?椹遍€愭暟瓒嬪娍 |

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/cache/info | Redis 姒傝淇℃伅 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/cache/keys | Key 鎸夊墠缂€鍒嗙粍缁熻 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/cache/keys/:key | 鏌ヨ鎸囧畾 Key 鐨勫€?| 瓒呯骇绠＄悊鍛?|
| DELETE | /api/v1/admin/cache/keys | 鎸夊墠缂€娓呯悊缂撳瓨 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/cache/stats | 缂撳瓨鍛戒腑鐜囩粺璁?| 瓒呯骇绠＄悊鍛?|

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"缂撳瓨绠＄悊"鍏ュ彛 | Redis 姒傝+Key 鍒嗙粍娴忚+娓呯悊鎿嶄綔 |

---

### 12.4 浠诲姟璋冨害涓績

#### 鑳屾櫙

绯荤粺涓湁澶ч噺瀹氭椂浠诲姟锛堟瘡鏃ョ粨绠椼€佸浠姐€佸憡璀︽鏌ャ€佽嚜鍔ㄥ璐︺€佹暟鎹竻鐞嗐€佹棩鎶ユ帹閫佺瓑锛夛紝褰撳墠娌℃湁缁熶竴绠＄悊鐣岄潰銆備换鍔℃墽琛屽け璐ュ彧鑳藉湪鏃ュ織閲岀炕鏌ワ紝鏃犳硶鍙婃椂鍙戠幇鍜屽鐞嗐€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 浠诲姟鍒楄〃 | 鎵€鏈夊畾鏃朵换鍔″悕绉?绫诲瀷/璋冨害琛ㄨ揪寮?涓婃鎵ц鏃堕棿/涓婃缁撴灉/鐘舵€?|
| 浠诲姟鎵ц鍘嗗彶 | 姣忔鎵ц鐨勫紑濮嬫椂闂?缁撴潫鏃堕棿/鑰楁椂/缁撴灉/閿欒淇℃伅 |
| 鎵嬪姩瑙﹀彂 | 绠＄悊鍛樻墜鍔ㄨЕ鍙戞煇涓换鍔＄珛鍗虫墽琛?|
| 鍚敤/绂佺敤 | 涓存椂绂佺敤鏌愪釜浠诲姟锛堝缁存姢鏈熼棿鏆傚仠澶囦唤锛?|
| 澶辫触鍛婅 | 浠诲姟杩炵画澶辫触 N 娆″悗鑷姩鍛婅 |
| 浠诲姟渚濊禆 | 閰嶇疆浠诲姟闂翠緷璧栧叧绯伙紙濡傦細瀵硅处渚濊禆缁撶畻鍏堝畬鎴愶級 |

#### 鏁版嵁琛ㄨ璁?

```typescript
// scheduled_tasks -- 瀹氭椂浠诲姟閰嶇疆
export const scheduledTasks = pgTable("scheduled_tasks", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  description: varchar("description", { length: 200 }),
  taskType: varchar("task_type", { length: 32 }).notNull(),
  // billing_daily | billing_monthly | backup | alert_check | reconciliation | data_cleanup | daily_report
  cronExpr: varchar("cron_expr", { length: 32 }).notNull(),
  timeoutSeconds: integer("timeout_seconds").default(300),
  maxRetries: integer("max_retries").default(3),
  retryInterval: integer("retry_interval").default(60),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunStatus: varchar("last_run_status", { length: 16 }),
  lastRunError: text("last_run_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// task_run_history -- 浠诲姟鎵ц鍘嗗彶
export const taskRunHistory = pgTable("task_run_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => scheduledTasks.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  duration: integer("duration"),
  status: varchar("status", { length: 16 }).notNull(),
  error: text("error"),
  result: jsonb("result"),
  triggeredBy: varchar("triggered_by", { length: 20 }).default("cron"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/tasks | 浠诲姟鍒楄〃 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/tasks/:id | 浠诲姟璇︽儏 | 瓒呯骇绠＄悊鍛?|
| PATCH | /api/v1/admin/tasks/:id | 鏇存柊浠诲姟閰嶇疆 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/tasks/:id/trigger | 鎵嬪姩瑙﹀彂浠诲姟 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/tasks/:id/toggle | 鍚敤/绂佺敤浠诲姟 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/tasks/:id/history | 鎵ц鍘嗗彶 | 瓒呯骇绠＄悊鍛?|

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"浠诲姟璋冨害"鍏ュ彛 | 浠诲姟鍒楄〃+鎵ц鍘嗗彶+鎵嬪姩瑙﹀彂 |

---

### 12.5 鍦ㄧ嚎鏃ュ織鏌ョ湅鍣?

#### 鑳屾櫙

鎺掓煡闂鏃讹紝绠＄悊鍛橀渶瑕佹煡鐪嬫湇鍔″櫒鏃ュ織銆傚綋鍓嶅彧鑳?SSH 鍒版湇鍔″櫒鐢?tail/less 鏌ョ湅锛屼笉鏂逛究涓斾笉瀹夊叏銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 鏃ュ織鏂囦欢鍒楄〃 | 灞曠ず鏈嶅姟鍣ㄤ笂鍏抽敭鏃ュ織鏂囦欢鍒楄〃锛坅pi-error.log / api-access.log / nginx-error.log / deploy.log锛?|
| 瀹炴椂 tail | 瀹炴椂婊氬姩鏌ョ湅鏃ュ織灏鹃儴锛岀被浼?tail -f |
| 鏃堕棿鑼冨洿绛涢€?| 鎸夋椂闂磋寖鍥存煡鐪嬫棩蹇楃墖娈?|
| 鍏抽敭璇嶆悳绱?| 鎼滅储鏃ュ織涓寘鍚叧閿瘝鐨勮 |
| 鏃ュ織绾у埆杩囨护 | 鎸?error/warn/info/debug 绾у埆杩囨护 |
| 鏃ュ織涓嬭浇 | 鎸夋椂闂磋寖鍥村鍑烘棩蹇楁枃浠?|

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/logs/files | 鍙煡鐪嬬殑鏃ュ織鏂囦欢鍒楄〃 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/logs/read | 璇诲彇鏃ュ織鍐呭锛堟敮鎸?offset/limit/level/鍏抽敭璇嶏級 | 瓒呯骇绠＄悊鍛?|
| WS | /ws/logs | WebSocket 瀹炴椂鏃ュ織娴?| 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/logs/download | 涓嬭浇鏃ュ織鏂囦欢 | 瓒呯骇绠＄悊鍛?|

> 瀹夊叏闄愬埗锛氭棩蹇?API 浠呮毚闇查閰嶇疆鐨勬棩蹇楃洰褰曪紙濡?/root/3cloud/logs/锛夛紝涓嶆敮鎸佽矾寰勯亶鍘嗐€?

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鏃ュ織鏌ョ湅"鍏ュ彛 | 鏃ュ織鏂囦欢閫夋嫨+瀹炴椂 tail+鎼滅储+杩囨护 |

---

### 12.6 鍋ュ悍妫€鏌ュぇ鐩?

#### 鑳屾櫙

褰撳墠鏈夊仴搴锋鏌ユ帴鍙ｏ紝浣嗗彧鏄畝鍗曠殑 /health 杩斿洖 200銆傜郴缁熺鐞嗗憳闇€瑕佷竴涓叏闈㈢殑鏈嶅姟鍋ュ悍鐘舵€佷华琛ㄧ洏锛屼竴鐪肩湅鍒版墍鏈夋湇鍔＄殑杩愯鐘舵€併€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 鏈嶅姟鐘舵€佹€昏 | API 鏈嶅姟/鏁版嵁搴?Redis/鍚勪緵搴斿晢 API 鐨勫疄鏃剁姸鎬侊紙缁胯壊/榛勮壊/绾㈣壊锛?|
| 6 缁村害鍋ュ悍璇勫垎 | API 鍙敤鎬?30%)/寤惰繜(25%)/閿欒鐜?20%)/鏁版嵁搴?10%)/Redis(10%)/瀹夊叏(5%) |
| 鍘嗗彶鍙敤鎬ц秼鍔?| 杩?7 澶╂瘡鏃ュ仴搴疯瘎鍒嗚秼鍔垮浘 |
| 渚涘簲鍟嗛€氶亾鍋ュ悍 | 鎵€鏈変緵搴斿晢閫氶亾鐨勫仴搴风姸鎬佺粺璁★紙鍋ュ悍鏁?閫氶亾鎬绘暟/鍋ュ悍鐜囷級 |
| 璧勬簮鐩戞帶 | CPU/鍐呭瓨/纾佺洏/绯荤粺璐熻浇/杩涚▼鍫嗗唴瀛樺疄鏃剁洃鎺?|
| 鑷姩璇婃柇 | 6 椤硅瘖鏂細鏁版嵁搴撹繛鎺?Redis杩炴帴/渚涘簲鍟嗚繛閫氭€?纾佺洏鍐欏叆/杩涚▼鍐呭瓨/绯荤粺璧勬簮 |

#### 鍚庣瀹炵幇鐘舵€?

| 绔偣 | 瀹炵幇鐘舵€?| 璇存槑 |
|------|---------|------|
| `GET /api/v1/admin/health/overview` | 鉁?宸插疄鐜?| 鏈嶅姟鐘舵€佹€昏 + 渚涘簲鍟嗛€氶亾鍋ュ悍缁熻 |
| `GET /api/v1/admin/health-score` | 鉁?宸插疄鐜?| 6 缁村害鍋ュ悍璇勫垎 + 鍔犳潈鎬诲垎 |
| `GET /api/v1/admin/health-score/history` | 鉁?宸插疄鐜?| 杩?7 澶╄秼鍔?|
| `GET /api/v1/admin/health/service/:name` | 鉁?宸插疄鐜?| 鍗曚釜鏈嶅姟璇︽儏 (api/database/redis) |
| `GET /api/v1/admin/health/resources` | 鉁?宸插疄鐜?| CPU/鍐呭瓨/纾佺洏/绯荤粺淇℃伅 |
| `POST /api/v1/admin/health/diagnose` | 鉁?宸插疄鐜?| 6 椤硅嚜鍔ㄨ瘖鏂?+ 鎬荤粨 |

#### 寰呭疄鐜?

| 鍔熻兘 | 璇存槑 | 浼樺厛绾?|
|------|------|--------|
| 渚濊禆鎷撴墤鍥?| 鏈嶅姟渚濊禆鍏崇郴鍙鍖?| P2 |
| 渚涘簲鍟嗗搷搴旀椂闂磋秼鍔?| 鍚勪緵搴斿晢 API 鍝嶅簲鏃堕棿瓒嬪娍鍥?| P2 |
| 缃戠粶 IO 鐩戞帶 | 瀵规帴鏈嶅姟鍣ㄧ洃鎺ч噰闆嗙綉缁?IO | P2 |

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/health/overview | 鎵€鏈夋湇鍔＄姸鎬佹瑙?| security_view |
| GET | /api/v1/admin/health-score | 6 缁村害鍋ュ悍璇勫垎 | security_view |
| GET | /api/v1/admin/health-score/history | 杩?7 澶╄秼鍔?| security_view |
| GET | /api/v1/admin/health/service/:name | 鍗曚釜鏈嶅姟璇︽儏 | security_view |
| GET | /api/v1/admin/health/resources | 鏈嶅姟鍣ㄨ祫婧愮洃鎺?| security_view |
| POST | /api/v1/admin/health/diagnose | 瑙﹀彂鑷姩璇婃柇 | security_view |

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鍋ュ悍妫€鏌?鍏ュ彛 | 鏈嶅姟鐘舵€佹€昏+鍋ュ悍璇勫垎+璧勬簮鐩戞帶+璇婃柇 |
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鍋ュ悍妫€鏌?-> 璇︽儏 | 鏈嶅姟璇︽儏+鍝嶅簲鏃堕棿瓒嬪娍 |
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鍋ュ悍妫€鏌?-> 璇婃柇 | 鑷姩璇婃柇缁撴灉灞曠ず |

---

### 12.7 鍙樻洿璁″垝涓庢矙绠遍瑙?

#### 鑳屾櫙

绠＄悊鍛樿繘琛屾壒閲忔搷浣滄垨閰嶇疆鍙樻洿鏃讹紝缂哄皯棰勮鍜岃鍒掑姛鑳姐€傚綋鍓嶄慨鏀归厤缃洿鎺ョ敓鏁堬紝濡傛灉閰嶇疆閿欒鍙兘褰卞搷绾夸笂鏈嶅姟銆?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 鍙樻洿棰勮 | 淇敼閰嶇疆鍓嶏紝棰勮褰卞搷鑼冨洿锛氬摢浜涙ā鍧?鐢ㄦ埛浼氬彈褰卞搷 |
| 鍙樻洿璁″垝 | 缂栨帓涓€缁勫彉鏇存搷浣滐紝璁惧畾鎵ц鏃堕棿锛屽埌鏃惰嚜鍔ㄦ墽琛?|
| 娌欑妯℃嫙 | 閰嶇疆鍙樻洿鍦ㄦ矙绠变腑妯℃嫙鎵ц锛屼笉鐪熸鏀规暟鎹紝灞曠ず棰勬湡缁撴灉 |
| 鍙樻洿瀹℃壒 | 楂橀闄╁彉鏇达紙濡傛敼瀹氫环/鏀瑰畨鍏ㄧ瓥鐣ワ級闇€瀹℃壒鍚庢墠鑳芥墽琛?|
| 鍙樻洿鍥炴粴 | 鎵ц澶辫触鐨勫彉鏇磋鍒掕嚜鍔ㄥ洖婊氭墍鏈夊凡鎵ц姝ラ |

#### 鏁版嵁琛ㄨ璁?

```typescript
// change_plans -- 鍙樻洿璁″垝
export const changePlans = pgTable("change_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  steps: jsonb("steps").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // draft | pending_review | approved | scheduled | executing | completed | failed | rolled_back
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  executedAt: timestamp("executed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  riskLevel: varchar("risk_level", { length: 10 }).notNull().default("low"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// change_plan_logs -- 鍙樻洿鎵ц鏃ュ織
export const changePlanLogs = pgTable("change_plan_logs", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => changePlans.id),
  stepIndex: integer("step_index").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| POST | /api/v1/admin/change-plans | 鍒涘缓鍙樻洿璁″垝 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/change-plans | 鍙樻洿璁″垝鍒楄〃 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/change-plans/:id | 璁″垝璇︽儏 | 瓒呯骇绠＄悊鍛?|
| PATCH | /api/v1/admin/change-plans/:id | 鏇存柊璁″垝 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/change-plans/:id/preview | 娌欑棰勮 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/change-plans/:id/submit-review | 鎻愪氦瀹℃壒 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/change-plans/:id/approve | 瀹℃壒閫氳繃 | 绠＄悊鍛?|
| POST | /api/v1/admin/change-plans/:id/reject | 椹冲洖 | 绠＄悊鍛?|
| POST | /api/v1/admin/change-plans/:id/execute | 绔嬪嵆鎵ц | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/change-plans/:id/rollback | 鍥炴粴 | 瓒呯骇绠＄悊鍛?|

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鍙樻洿璁″垝"鍏ュ彛 | 璁″垝鍒楄〃+鍒涘缓鍚戝 |
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鍙樻洿璁″垝 -> 璇︽儏 | 姝ラ鍒楄〃+棰勮+鎵ц/鍥炴粴 |
| 绠＄悊鍚庡彴 -> 瀹℃壒涓績 | 鍙樻洿璁″垝瀹℃壒寰呭姙 |

---

### 12.8 绯荤粺鍗囩骇涓庣増鏈鐞?

#### 鑳屾櫙

绯荤粺鍗囩骇鏃讹紝绠＄悊鍛橀渶瑕佷簡瑙ｅ綋鍓嶇増鏈€佸崌绾у巻鍙层€佸洖婊氳兘鍔涖€傚綋鍓嶆病鏈夌増鏈鐞嗭紝鍗囩骇鍏ㄩ潬 git log 鍜屼汉宸ヨ蹇嗐€?

#### 鍔熻兘瑙勬牸

| 妯″潡 | 璇存槑 |
|------|------|
| 鐗堟湰淇℃伅 | 鏄剧ず褰撳墠閮ㄧ讲鐗堟湰锛坓it commit hash + tag + 閮ㄧ讲鏃堕棿锛?|
| 鐗堟湰鍙戝竷璁板綍 | 鎸夋椂闂村€掑簭鐨勭増鏈彂甯冨垪琛細鐗堟湰鍙?鍙戝竷鍐呭/鍙戝竷鏃堕棿/鍙戝竷浜?|
| 鍗囩骇鎿嶄綔 | 涓€閿Е鍙戦儴缃叉祦绋嬶紙璋冪敤 deploy.sh锛?|
| 鍥炴粴鎿嶄綔 | 涓€閿洖婊氬埌涓婁竴涓増鏈?|
| 鐏板害寮€鍏?| 鎸夌敤鎴锋瘮渚?鐢ㄦ埛 ID 鑼冨洿鐏板害鍙戝竷鏂板姛鑳?|

#### 鏁版嵁琛ㄨ璁?

```typescript
// deployment_records -- 閮ㄧ讲璁板綍
export const deploymentRecords = pgTable("deployment_records", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 20 }).notNull(),
  commitHash: varchar("commit_hash", { length: 40 }).notNull(),
  branch: varchar("branch", { length: 50 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 16 }).notNull(),
  deployedBy: integer("deployed_by").notNull().references(() => users.id),
  deployedAt: timestamp("deployed_at", { withTimezone: true }).notNull().defaultNow(),
  rollbackFrom: integer("rollback_from"),
  duration: integer("duration"),
});

// feature_flags -- 鍔熻兘鐏板害寮€鍏?
export const featureFlags = pgTable("feature_flags", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 200 }),
  enabled: boolean("enabled").notNull().default(false),
  rolloutPercentage: integer("rollout_percentage").default(0),
  userWhitelist: jsonb("user_whitelist"),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/deployments/current | 褰撳墠鐗堟湰淇℃伅 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/deployments | 閮ㄧ讲鍘嗗彶鍒楄〃 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/deployments/deploy | 瑙﹀彂閮ㄧ讲 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/deployments/:id/rollback | 鍥炴粴鍒版寚瀹氱増鏈?| 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/feature-flags | 鍔熻兘寮€鍏冲垪琛?| 瓒呯骇绠＄悊鍛?|
| PATCH | /api/v1/admin/feature-flags/:key | 鏇存柊鍔熻兘寮€鍏?| 瓒呯骇绠＄悊鍛?|

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鐗堟湰绠＄悊"鍏ュ彛 | 褰撳墠鐗堟湰淇℃伅+閮ㄧ讲鍘嗗彶+涓€閿儴缃?鍥炴粴 |
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鍔熻兘寮€鍏?鍏ュ彛 | 鐏板害鍙戝竷寮€鍏冲垪琛?閰嶇疆 |

---

### 12.9 绯荤粺绠＄悊鍛樻ā鍧楁€昏

| 妯″潡 | 浼樺厛绾?| 棰勪及宸ヤ綔閲?| 鏍稿績浠峰€?|
|------|--------|-----------|---------|
| 鎿嶄綔瀹¤鎺у埗鍙?| P0 | 鍚庣 3d + 鍓嶇 4d | 鎿嶄綔杩芥函+寮傚父妯″紡璇嗗埆锛屽畨鍏ㄥ悎瑙?|
| 鍋ュ悍妫€鏌ュぇ鐩?| P0 | 鍚庣 3d + 鍓嶇 4d | 涓€鐪兼帉鎻＄郴缁熺姸鎬侊紝鏁呴殰蹇€熷畾浣?|
| 浠诲姟璋冨害涓績 | P1 | 鍚庣 4d + 鍓嶇 4d | 瀹氭椂浠诲姟缁熶竴绠＄悊锛屽け璐ュ強鏃跺彂鐜?|
| 鍦ㄧ嚎鏃ュ織鏌ョ湅鍣?| P1 | 鍚庣 3d + 鍓嶇 3d | 鏃犻渶 SSH 鍗冲彲鏌ョ湅鏃ュ織锛屽畨鍏ㄤ究鎹?|
| 缂撳瓨绠＄悊鎺у埗鍙?| P1 | 鍚庣 2d + 鍓嶇 3d | 缂撳瓨鍙鍖?鎸夐渶娓呯悊 |
| 鏁版嵁搴撶鐞嗛潰鏉?| P2 | 鍚庣 4d + 鍓嶇 4d | 鏁版嵁搴撶姸鎬佸彲瑙嗗寲锛岃緟鍔╂€ц兘璋冧紭 |
| 鍙樻洿璁″垝涓庢矙绠遍瑙?| P2 | 鍚庣 4d + 鍓嶇 4d | 闄嶄綆鍙樻洿椋庨櫓锛屾敮鎸佽鍒掔紪鎺?|
| 绯荤粺鍗囩骇涓庣増鏈鐞?| P2 | 鍚庣 3d + 鍓嶇 3d | 鐗堟湰鍙拷婧紝涓€閿洖婊?鐏板害鍙戝竷 |

**鍚堣**锛氬悗绔?26 浜哄ぉ + 鍓嶇 29 浜哄ぉ = 绾?7 鍛?

> 鏉冮檺璇存槑锛氱郴缁熺鐞嗗憳妯″潡鎿嶄綔褰卞搷绯荤粺绋冲畾鎬э紝鎵€鏈?API 鍧囬渶瓒呯骇绠＄悊鍛樻潈闄愩€傞儴鍒嗛珮鍗辨搷浣滐紙濡傚洖婊?閮ㄧ讲/鎵ц SQL锛夐渶棰濆浜屾纭寮圭獥銆?


---

