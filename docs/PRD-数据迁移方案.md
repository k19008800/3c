
> **閫傜敤鍦烘櫙**锛氫粠鏃х増绯荤粺杩佺Щ鏁版嵁銆佷粠绗笁鏂瑰钩鍙板鍏ユ暟鎹€佹暟鎹簱琛ㄧ粨鏋勫彉鏇存椂鐨勬暟鎹縼绉?
> **鐘舵€?*锛歅0 鏂板闇€姹?

### 13.1 杩佺Щ鍦烘櫙

| 鍦烘櫙 | 璇存槑 | 浼樺厛绾?|
|------|------|--------|
| 闆跺熀纭€鍒濆鍖?| 鍏ㄦ柊绯荤粺锛屼粠绌烘暟鎹簱寮€濮?| P0 |
| 鏃х増鏁版嵁杩佺Щ | 浠庢棫鐗?3cloud 鎴栧叾浠栧钩鍙拌縼绉诲凡鏈夌敤鎴?璁㈠崟/娑堣垂璁板綍 | P1 |
| 绗笁鏂瑰鍏?| 浠庡叾浠栬仛鍚堝钩鍙版壒閲忓鍏ョ敤鎴峰拰 Key | P2 |
| 琛ㄧ粨鏋勫彉鏇?| 鏁版嵁搴?migration 鍚庣殑鏁版嵁杩佺Щ鍜屾牎楠?| P0 |

### 13.2 杩佺Щ鑴氭湰瑙勮寖

#### 鐩綍缁撴瀯

```
api/src/migrations/
鈹溾攢鈹€ seeds/                  鈫?鍒濆鍖栫瀛愭暟鎹?
鈹?  鈹溾攢鈹€ seed-roles.ts       鈫?棰勭疆瑙掕壊鏉冮檺
鈹?  鈹溾攢鈹€ seed-admin.ts       鈫?鍒濆绠＄悊鍛樿处鍙?
鈹?  鈹溾攢鈹€ seed-categories.ts  鈫?宸ュ崟棰勭疆鍒嗙被
鈹?  鈹溾攢鈹€ seed-templates.ts   鈫?閭欢妯℃澘/蹇嵎鍥炲妯℃澘
鈹?  鈹斺攢鈹€ seed-configs.ts     鈫?绯荤粺榛樿閰嶇疆
鈹溾攢鈹€ transforms/             鈫?鏁版嵁杞崲鑴氭湰
鈹?  鈹溾攢鈹€ migrate-users.ts    鈫?鐢ㄦ埛鏁版嵁杩佺Щ
鈹?  鈹溾攢鈹€ migrate-orders.ts   鈫?璁㈠崟/鍏呭€艰褰曡縼绉?
鈹?  鈹斺攢鈹€ migrate-keys.ts     鈫?API Key 杩佺Щ
鈹斺攢鈹€ validate/               鈫?杩佺Щ鏍￠獙鑴氭湰
    鈹溾攢鈹€ check-counts.ts     鈫?琛屾暟鏍￠獙
    鈹溾攢鈹€ check-balances.ts   鈫?浣欓鏍￠獙
    鈹斺攢鈹€ check-relations.ts  鈫?澶栭敭瀹屾暣鎬ф牎楠?
```

#### 杩佺Щ鑴氭湰瑕佹眰

| 瑕佹眰 | 璇存槑 |
|------|------|
| 骞傜瓑鎬?| 鍚屼竴鑴氭湰鍙噸澶嶆墽琛岋紝涓嶄細浜х敓閲嶅鏁版嵁 |
| 鍙洖婊?| 姣忎釜杩佺Щ鑴氭湰閰嶅鍥炴粴鑴氭湰 |
| 鍒嗘壒鎵ц | 澶ф暟鎹噺杩佺Щ鏀寔 --batch 鍙傛暟鍒嗘壒澶勭悊 |
| 鏃ュ織杈撳嚭 | 璇︾粏璁板綍姣忔潯杩佺Щ鐨勬墽琛岀粨鏋滃拰閿欒 |
| 杩涘害鎶ュ憡 | 闀胯€楁椂杩佺Щ鏀寔杩涘害鐧惧垎姣旀樉绀?|

### 13.3 杩佺Щ娴佺▼

```mermaid
flowchart TD
    A[澶囦唤鐩爣鏁版嵁搴揮 --> B[鎵ц杩佺Щ鑴氭湰]
    B --> C[鎵ц鏍￠獙鑴氭湰]
    C --> D{鏍￠獙閫氳繃?}
    D -->|鏄瘄 E[楠岃瘉涓氬姟鍙敤鎬
    D -->|鍚 F[鎵ц鍥炴粴鑴氭湰]
    F --> G[鍒嗘瀽閿欒鍘熷洜]
    G --> H[淇鍚庨噸鏂拌縼绉籡
    E --> I[鏍囪杩佺Щ瀹屾垚]
```

### 13.4 鏁版嵁鏍￠獙瑙勫垯

| 鏍￠獙椤?| 鏂规硶 | 閫氳繃鏍囧噯 |
|--------|------|---------|
| 琛屾暟涓€鑷?| SELECT COUNT(*) 瀵规瘮婧愯〃鍜岀洰鏍囪〃 | 璇樊 < 0.1% |
| 浣欓涓€鑷?| 姹囨€?users.balance 涓?recharge_orders 宸瀵规瘮 | 瀹屽叏涓€鑷?|
| 澶栭敭瀹屾暣鎬?| 妫€鏌ユ墍鏈夊閿紩鐢?| 鏃犲绔嬪紩鐢?|
| 鏃堕棿杩炵画鎬?| 妫€鏌?created_at 鏃堕棿鎴抽『搴?| 鏃犳湭鏉ユ椂闂存垨寮傚父璺宠穬 |
| 鍞竴绾︽潫 | 妫€鏌ユ墍鏈?unique 瀛楁 | 鏃犻噸澶嶅€?|

### 13.5 API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/migrations | 杩佺Щ浠诲姟鍒楄〃 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/migrations/run | 鎵ц杩佺Щ鑴氭湰 | 瓒呯骇绠＄悊鍛?|
| POST | /api/v1/admin/migrations/rollback | 鍥炴粴杩佺Щ | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/migrations/validate | 鎵ц鏁版嵁鏍￠獙 | 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/migrations/history | 杩佺Щ鍘嗗彶璁板綍 | 瓒呯骇绠＄悊鍛?|

#### 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"鏁版嵁杩佺Щ"鍏ュ彛 | 杩佺Щ浠诲姟鍒楄〃+鎵ц/鍥炴粴/鏍￠獙 |

#### 鏁版嵁琛ㄨ璁?

```typescript
// migration_records - 杩佺Щ浠诲姟璁板綍
export const migrationRecords = pgTable("migration_records", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  scriptPath: varchar("script_path", { length: 255 }).notNull(),
  batchSize: integer("batch_size").default(1000),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  // pending | running | completed | failed | rolled_back
  totalRows: integer("total_rows"),
  processedRows: integer("processed_rows"),
  errorRows: integer("error_rows"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorLog: jsonb("error_log"),
  // [{row, reason, detail}]
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// migration_validation_results - 杩佺Щ鏍￠獙缁撴灉
export const migrationValidationResults = pgTable("migration_validation_results", {
  id: serial("id").primaryKey(),
  migrationId: integer("migration_id").notNull().references(() => migrationRecords.id),
  checkType: varchar("check_type", { length: 32 }).notNull(),
  // row_count | balance | fk_integrity | unique_constraint | timestamp
  tableName: varchar("table_name", { length: 64 }),
  expectedValue: varchar("expected_value", { length: 64 }),
  actualValue: varchar("actual_value", { length: 64 }),
  passed: boolean("passed").notNull(),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### 鍔熻兘瑙勬牸琛?

| 妯″潡 | 璇存槑 |
|------|------|
| 杩佺Щ浠诲姟绠＄悊 | 鍒涘缓/鏌ョ湅/鎵ц杩佺Щ浠诲姟锛屾敮鎸佸垎鎵规墽琛?|
| 杩佺Щ杩涘害灞曠ず | 瀹炴椂鏄剧ず澶勭悊琛屾暟/鎬昏鏁?閿欒琛屾暟/杩涘害鐧惧垎姣?|
| 閿欒鏃ュ織鏌ョ湅 | 鏌ョ湅杩佺Щ澶辫触鐨勫叿浣撹鍜屽師鍥狅紝鏀寔閲嶈瘯 |
| 鏍￠獙缁撴灉灞曠ず | 灞曠ず鍚勬牎楠岄」鐨勬墽琛岀粨鏋滐紙閫氳繃/澶辫触/璇︽儏锛?|
| 鍥炴粴鎿嶄綔 | 涓€閿洖婊氬凡鎵ц鐨勮縼绉讳换鍔?|

---



