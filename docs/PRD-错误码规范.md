
> **閫傜敤瀵硅薄**锛氬墠鍚庣寮€鍙戣€呫€丄PI 璋冪敤鑰?
> **鐘舵€?*锛歅0 鏂板瑙勮寖

### 14.1 鍏ㄥ眬閿欒鐮佽鑼?

#### 閿欒鐮佹牸寮?

```
閿欒鐮?= 妯″潡鍓嶇紑(2浣? + 閿欒绫诲瀷(2浣? + 搴忓彿(2浣?
绀轰緥锛欰UTH_01_001
```

| 妯″潡鍓嶇紑 | 妯″潡 | 璇存槑 |
|---------|------|------|
| AU | Auth | 璁よ瘉鐩稿叧 |
| US | User | 鐢ㄦ埛绠＄悊 |
| AK | ApiKey | API Key 绠＄悊 |
| BI | Billing | 璁¤垂缁撶畻 |
| RE | Recharge | 鍏呭€?|
| MO | Model | 妯″瀷绠＄悊 |
| VE | Vendor | 渚涘簲鍟嗙鐞?|
| AG | Agent | 浠ｇ悊鍟?|
| TI | Ticket | 宸ュ崟绯荤粺 |
| RT | Route | 璺敱寮曟搸 |
| RL | RateLimit | 闄愭祦 |
| AL | Alert | 鍛婅 |
| NO | Notification | 閫氱煡 |
| CF | Config | 绯荤粺閰嶇疆 |
| SE | Security | 瀹夊叏椋庢帶 |
| CO | Common | 閫氱敤閿欒 |

#### 閿欒鐮佸畾涔?

```typescript
// api/src/errors/codes.ts
export const ErrorCodes = {
  // 閫氱敤閿欒
  COMMON_01_001: { code: 'COMMON_01_001', message: '璇锋眰鍙傛暟閿欒', httpStatus: 400 },
  COMMON_01_002: { code: 'COMMON_01_002', message: '璧勬簮涓嶅瓨鍦?, httpStatus: 404 },
  COMMON_01_003: { code: 'COMMON_01_003', message: '璇锋眰棰戠巼杩囬珮', httpStatus: 429 },
  COMMON_02_001: { code: 'COMMON_02_001', message: '鏈嶅姟鍣ㄥ唴閮ㄩ敊璇?, httpStatus: 500 },
  COMMON_02_002: { code: 'COMMON_02_002', message: '鏈嶅姟鏆備笉鍙敤', httpStatus: 503 },

  // 璁よ瘉閿欒
  AUTH_01_001: { code: 'AUTH_01_001', message: '鏈櫥褰曟垨鐧诲綍宸茶繃鏈?, httpStatus: 401 },
  AUTH_01_002: { code: 'AUTH_01_002', message: '鏉冮檺涓嶈冻', httpStatus: 403 },
  AUTH_01_003: { code: 'AUTH_01_003', message: '璐﹀彿宸茶绂佺敤', httpStatus: 403 },
  AUTH_01_004: { code: 'AUTH_01_004', message: '鐧诲綍澶辫触娆℃暟杩囧', httpStatus: 429 },
  AUTH_02_001: { code: 'AUTH_02_001', message: 'API Key 鏃犳晥', httpStatus: 401 },
  AUTH_02_002: { code: 'AUTH_02_002', message: 'API Key 宸茶繃鏈?, httpStatus: 401 },
  AUTH_02_003: { code: 'AUTH_02_003', message: 'API Key 宸茶绂佺敤', httpStatus: 403 },
  AUTH_02_004: { code: 'AUTH_02_004', message: 'IP 涓嶅湪鐧藉悕鍗曚腑', httpStatus: 403 },

  // 璁¤垂閿欒
  BILLING_01_001: { code: 'BILLING_01_001', message: '浣欓涓嶈冻', httpStatus: 402 },
  BILLING_01_002: { code: 'BILLING_01_002', message: '瓒呭嚭鏈堝害棰勭畻', httpStatus: 402 },
  BILLING_01_003: { code: 'BILLING_01_003', message: '妯″瀷鏈畾浠?, httpStatus: 400 },
  BILLING_02_001: { code: 'BILLING_02_001', message: '鍏呭€艰鍗曚笉瀛樺湪', httpStatus: 404 },
  BILLING_02_002: { code: 'BILLING_02_002', message: '鍏呭€奸噾棰濅綆浜庢渶灏忛檺棰?, httpStatus: 400 },
  BILLING_02_003: { code: 'BILLING_02_003', message: '閫€娆鹃噾棰濊秴鍑哄彲閫€浣欓', httpStatus: 400 },

  // 闄愭祦閿欒
  RATE_LIMIT_01_001: { code: 'RATE_LIMIT_01_001', message: 'API 璋冪敤棰戠巼瓒呴檺', httpStatus: 429 },
  RATE_LIMIT_01_002: { code: 'RATE_LIMIT_01_002', message: '姣忓垎閽熻皟鐢ㄦ鏁拌秴闄?, httpStatus: 429 },
  RATE_LIMIT_01_003: { code: 'RATE_LIMIT_01_003', message: '姣忔棩 Token 閰嶉瓒呴檺', httpStatus: 429 },
  RATE_LIMIT_01_004: { code: 'RATE_LIMIT_01_004', message: '骞跺彂璇锋眰鏁拌秴闄?, httpStatus: 429 },

  // 宸ュ崟閿欒
  TICKET_01_001: { code: 'TICKET_01_001', message: '宸ュ崟涓嶅瓨鍦?, httpStatus: 404 },
  TICKET_01_002: { code: 'TICKET_01_002', message: '鏃犳潈鎿嶄綔姝ゅ伐鍗?, httpStatus: 403 },
  TICKET_01_003: { code: 'TICKET_01_003', message: '宸ュ崟鐘舵€佷笉鍏佽姝ゆ搷浣?, httpStatus: 400 },

  // 瀹夊叏閿欒
  SECURITY_01_001: { code: 'SECURITY_01_001', message: '鎿嶄綔琚鎺ц鍒欐嫤鎴?, httpStatus: 403 },
  SECURITY_01_002: { code: 'SECURITY_01_002', message: '寮傚湴鐧诲綍锛岄渶浜屾楠岃瘉', httpStatus: 401 },
  SECURITY_01_003: { code: 'SECURITY_01_003', message: 'IP 宸茶灏佺', httpStatus: 403 },
};
```

### 14.2 API 鍝嶅簲鏍煎紡缁熶竴

```json
// 鎴愬姛鍝嶅簲
{
  "code": 0,
  "data": { ... },
  "message": "success"
}

// 閿欒鍝嶅簲
{
  "code": "AUTH_01_001",
  "message": "鏈櫥褰曟垨鐧诲綍宸茶繃鏈?,
  "details": { ... }  // 鍙€夛紝闄勫姞閿欒璇︽儏
}

// 鍒嗛〉鍝嶅簲
{
  "code": 0,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}

// 鏍￠獙閿欒鍝嶅簲
{
  "code": "COMMON_01_001",
  "message": "璇锋眰鍙傛暟閿欒",
  "details": {
    "fields": [
      { "field": "email", "message": "閭鏍煎紡涓嶆纭? },
      { "field": "amount", "message": "閲戦蹇呴』澶т簬 0" }
    ]
  }
}
```

### 14.3 鍓嶇寮傚父澶勭悊绛栫暐

| 閿欒鐮?| 鍓嶇澶勭悊 |
|--------|---------|
| 401 | 璺宠浆鐧诲綍椤?|
| 403 | 鏄剧ず鏃犳潈闄愭彁绀?|
| 402 | 寮圭獥寮曞鍏呭€?|
| 429 | 鏄剧ず"璇锋眰杩囦簬棰戠箒"鎻愮ず锛岃嚜鍔ㄩ噸璇?|
| 500 | 鏄剧ず"绯荤粺寮傚父锛岃绋嶅悗閲嶈瘯" |
| AUTH_02_* | 璋冪敤 API 鏃堕潤榛樺垏鎹㈠埌涓嬩竴涓?Key |
| RATE_LIMIT_* | 鏄剧ず闄愭祦鎻愮ず锛屽缓璁檷棰戞垨鍗囩骇 |
| SECURITY_01_* | 寮圭獥鎻愮ず瀹夊叏鎷︽埅璇︽儏 |

### 14.4 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 鍏ㄥ眬 | 缁熶竴閿欒鎷︽埅鍣紝鏍规嵁閿欒鐮佹墽琛屽搴旂瓥鐣?|
| 鍏呭€奸〉 | 402 浣欓涓嶈冻鏃惰嚜鍔ㄨ烦杞厖鍊奸〉 |
| API 璋冪敤 | 402 瓒呴绠楁椂灞曠ず鎻愮ず |

#### 14.5 閿欒鐮佺鐞?API

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| GET | /api/v1/admin/error-codes | 鏌ヨ鎵€鏈夐敊璇爜瀹氫箟 | 绠＄悊鍛樹互涓?|
| GET | /api/v1/admin/error-codes/:code | 鏌ヨ鍗曚釜閿欒鐮佽鎯?| 绠＄悊鍛樹互涓?|
| POST | /api/v1/admin/error-codes | 娣诲姞鑷畾涔夐敊璇爜 | 瓒呯骇绠＄悊鍛?|
| PATCH | /api/v1/admin/error-codes/:code | 鏇存柊閿欒鐮佷俊鎭?| 瓒呯骇绠＄悊鍛?|
| GET | /api/v1/admin/error-codes/stats | 閿欒鐮佽Е鍙戠粺璁★紙杩?澶╁悇閿欒鐮佸嚭鐜伴鐜囷級 | 绠＄悊鍛樹互涓?|

#### 14.6 鍓嶇鍙樻洿

| 椤甸潰 | 鍙樻洿 |
|------|------|
| 绠＄悊鍚庡彴 -> 杩愮淮 -> 鏂板"閿欒鐮佺鐞?鍏ュ彛 | 閿欒鐮佸垪琛?璇︽儏+瑙﹀彂缁熻 |
| 绠＄悊鍚庡彴 -> 閿欒鐮佽鎯?| 鏄剧ず閿欒鐮佸畾涔夈€丠TTP 鐘舵€佺爜銆佽Е鍙戦鐜囪秼鍔?|

---

