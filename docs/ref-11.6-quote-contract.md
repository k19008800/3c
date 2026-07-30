# 娣卞寲鍙傝€冿細搂11.6 鎶ヤ环涓庡悎鍚岀鐞?
> **瀵瑰簲**锛歔`PRD-涓氬姟鍛樻敮鎾?md`](PRD-涓氬姟鍛樻敮鎾?md) 搂11.4 鎶ヤ环鍗?+ 搂11.6 鍚堝悓绠＄悊
> **鍏宠仈**锛歔`ref-11.4-opportunity.md`](ref-11.4-opportunity.md)銆乕`ref-11.1-crm.md`](ref-11.1-crm.md)銆乕`ref-4.17-template-library.md`](ref-4.17-template-library.md)
> **浼樺厛绾?*锛歅1 | **鐘舵€?*锛氶渶姹傛枃妗ｏ紙寰呭紑鍙戯級
> **鏈€鍚庢洿鏂?*锛?026-07-30

---

## 姒傝堪

涓氬姟鍛樺湪璺熻繘鍟嗘満杩囩▼涓渶瑕佸揩閫熺敓鎴愭爣鍑嗘姤浠峰崟鍜屽悎鍚屻€傚綋鍓嶆姤浠峰拰鍚堝悓渚濊禆绾夸笅 Excel/Markdown 鎵嬪姩缂栧埗锛屾晥鐜囦綆涓斿鏄撳嚭閿欍€傛姤浠疯繃鏈熺姸鎬侀渶鎵嬪姩璺熻釜锛屽悎鍚屽埌鏈熸棤娉曡嚜鍔ㄦ彁閱掋€?
**鏍稿績浠峰€?*锛氬湪绾挎姤浠风敓鎴?鈫?瀹℃壒 鈫?鍙戦€?鈫?鍚堝悓妯℃澘 鈫?鍚堝悓鐢熸垚 鈫?绛剧讲 鈫?鍒版湡鎻愰啋锛屽叏娴佺▼绾夸笂鍖栵紝鍑忓皯鎵嬪伐鎿嶄綔銆?
---

## 鍔熻兘妯″潡

### 1. 鎶ヤ环绠＄悊

**鍒涘缓鎶ヤ环鍗?*

| 瀛楁 | 璇存槑 |
|------|------|
| 鍏宠仈鍟嗘満 | 浠庡凡鏈夊晢鏈鸿嚜鍔ㄥ～鍏呭鎴峰悕绉?鑱旂郴浜猴紝鍙€変笉鍏宠仈鐩存帴杈撳叆 |
| 鎶ヤ环椤圭洰 | 澶氳娣诲姞锛堜骇鍝佸悕绉般€佸崟浠枫€佹暟閲忋€佹姌鎵ｃ€佸皬璁★級 |
| 鎬婚噾棰?| 鑷姩姹囨€昏绠?|
| 鎶樻墸鐜?| 鏁翠綋鎶樻墸鐜囷紙0-100%锛夛紝鑷姩璋冩暣鎬婚噾棰?|
| 鏈夋晥鏈?| 閫夋嫨鎴鏃ユ湡锛堥粯璁?30 澶╋級 |
| 澶囨敞 | 闄勫姞璇存槑 |

**鎶ヤ环鍗曠姸鎬佹祦杞?*

```
draft 鈹€鈹€鈫?pending_approval 鈹€鈹€鈫?approved 鈹€鈹€鈫?sent 鈹€鈹€鈫?accepted
              鈹?                    鈹?                     鈹?              鈹斺攢鈹€鈫?rejected          鈹斺攢鈹€鈫?expired           鈹?                                                           鈹斺攢鈹€鈫?expired
```

| 鐘舵€?| 璇存槑 | 鍙搷浣?|
|------|------|--------|
| draft | 鑽夌锛屼粎鍒涘缓鑰呭彲瑙?| 缂栬緫 / 鍒犻櫎 / 鎻愪氦瀹℃壒 |
| pending_approval | 寰呭鎵?| 绠＄悊鍛樺彲瀹℃壒锛涘垱寤鸿€呭彲鎾ゅ洖 |
| approved | 瀹℃壒閫氳繃 | 鍙戦€佺粰瀹㈡埛 |
| rejected | 瀹℃壒椹冲洖 | 鏌ョ湅椹冲洖鍘熷洜锛屼慨鏀瑰悗閲嶆柊鎻愪氦 |
| sent | 宸插彂閫佺粰瀹㈡埛 | 鏍囪涓哄凡鎺ュ彈 / 杩囨湡 |
| accepted | 瀹㈡埛宸叉帴鍙?| 鍙熀浜庢鎶ヤ环鐢熸垚鍚堝悓 |
| expired | 宸茶繃鏈?| 鍙鏌ョ湅 |

**PDF 涓嬭浇**锛氭姤浠峰崟浠?PDF 鏍煎紡涓嬭浇锛屽惈鍏徃 Logo銆佹姤浠风紪鍙枫€佹槑缁嗐€佹€婚噾棰濄€佹湁鏁堟湡銆佹潯娆捐鏄庛€?
**杩囨湡鐘舵€佽嚜鍔ㄥ鐞?*锛氬畾鏃朵换鍔℃瘡澶╁噷鏅ㄦ鏌?`validUntil` 宸茶繃鏈熺殑鎶ヤ环鍗曪紝灏?`sent` 鍜?`pending_approval` 鐘舵€佽嚜鍔ㄥ彉鏇翠负 `expired`銆?
### 2. 鍚堝悓妯℃澘绠＄悊

绠＄悊鍛樺湪鍚庡彴绠＄悊鍚堝悓妯℃澘锛?
| 瀛楁 | 璇存槑 |
|------|------|
| 妯℃澘鍚嶇О | 濡?鏍囧噯 AI API 鏈嶅姟鍚堝悓" |
| 鍐呭 | Markdown 鏍煎紡鍚堝悓姝ｆ枃 |
| 鍙橀噺 | JSON 瀹氫箟鍙敤鍗犱綅绗︼紝濡?`{{customerName}}`銆乣{{contractNo}}`銆乣{{effectiveDate}}`銆乣{{expiryDate}}` |
| 鐗堟湰 | 閫掑鐗堟湰鍙?|
| 鍚敤鐘舵€?| 鏄惁褰撳墠鐢熸晥 |

**鍙橀噺鍗犱綅绗︾ず渚?*锛?
| 鍙橀噺 | 璇存槑 | 绀轰緥鍊?|
|------|------|--------|
| `{{customerName}}` | 瀹㈡埛鍚嶇О | 寮犱笁绉戞妧鏈夐檺鍏徃 |
| `{{customerContact}}` | 鑱旂郴浜?| 寮犱笁 |
| `{{contractNo}}` | 鍚堝悓缂栧彿 | CON-260801-001 |
| `{{effectiveDate}}` | 鐢熸晥鏃ユ湡 | 2026-08-01 |
| `{{expiryDate}}` | 鍒版湡鏃ユ湡 | 2027-07-31 |
| `{{serviceDesc}}` | 鏈嶅姟鎻忚堪 | AI 妯″瀷 API 璋冪敤鏈嶅姟 |
| `{{totalAmount}}` | 鍚堝悓閲戦 | 楼50,000.00 |
| `{{paymentTerms}}` | 浠樻鏉℃ | 鎸夋湀缁撶畻 |

### 3. 鍚堝悓绠＄悊

**鍚堝悓鐘舵€佹祦杞?*

```
draft 鈹€鈹€鈫?pending_approval 鈹€鈹€鈫?approved 鈹€鈹€鈫?signed 鈹€鈹€鈫?(鎵ц涓?
              鈹?                    鈹?                     鈹?              鈹斺攢鈹€鈫?rejected          鈹?                     鈹?                                     鈹斺攢鈹€鈫?expired           鈹?                                                            鈹斺攢鈹€鈫?terminated
                                                                    鈹?                                                                    鈹斺攢鈹€鈫?expired
```

| 鐘舵€?| 璇存槑 |
|------|------|
| draft | 鑽夌 |
| pending_approval | 寰呭鎵?|
| approved | 瀹℃壒閫氳繃锛屽緟绛剧讲 |
| signed | 宸茬缃诧紝姝ｅ父鎵ц |
| expired | 鍚堝悓鍒版湡 |
| terminated | 鎻愬墠缁堟 |

**鐢熸垚鍚堝悓**锛氶€夋嫨涓€涓ā鏉?鈫?濉啓鍙橀噺鍊?鈫?绯荤粺鑷姩鐢熸垚瀹屾暣鍚堝悓鍐呭锛圡arkdown 鈫?鏍煎紡鍖栨枃鏈級銆?
**绛剧讲鏂瑰紡**锛?
| 鏂瑰紡 | 璇存槑 |
|------|------|
| 绾夸笅绛剧讲 | 涓嬭浇 PDF 绾夸笅绛惧瓧鐩栫珷鍚庝笂浼犳壂鎻忎欢 |
| 鐢靛瓙绛剧讲 | 绯荤粺鍐呯數瀛愮鍚嶏紙鏈潵鎵╁睍锛墊

**褰掓。**锛氬凡绛剧讲鍚堝悓鐢熸垚鏈€缁?PDF锛屼笂浼犺嚦鏂囦欢瀛樺偍锛宍fileUrl` 璁板綍鏂囦欢璺緞銆?
**缁**锛歚POST /api/v1/agent/contracts/:id/renew` 鈫?鍒涘缓鏂板悎鍚岋紝`renewalContractId` 鎸囧悜涓婁竴涓悎鍚屻€?
**鍒版湡鎻愰啋**锛?
| 鎻愰啋鏃舵満 | 瑙﹀彂鏂瑰紡 | 鍐呭 |
|-----------|----------|--------|
| 鍒版湡鍓?30 澶?| 绯荤粺閫氱煡 + 閭欢 | "鎮ㄤ笌 XX 瀹㈡埛鐨勫悎鍚屽皢浜?30 澶╁悗鍒版湡" |
| 鍒版湡鍓?15 澶?| 绯荤粺閫氱煡 + 閭欢 | "鍚堝悓鍗冲皢鍒版湡锛岃灏藉揩瀹夋帓缁" |
| 鍒版湡鍓?7 澶?| 绯荤粺閫氱煡 + 閭欢 | "鍚堝悓浠呭墿 7 澶╁埌鏈? |
| 鍒版湡褰撳ぉ | 绯荤粺閫氱煡 + 閭欢 | "鍚堝悓宸蹭簬浠婃棩鍒版湡" |

---

## 鏁版嵁琛ㄥ畾涔?
### quotations锛堟姤浠峰崟锛?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|------|------|------|
| id | serial | 涓婚敭 |
| quotationNo | varchar(30) | 鎶ヤ环缂栧彿锛岃嚜鍔ㄧ敓鎴愶紙Q-鏃ユ湡-搴忓彿锛墊
| opportunityId | integer | 鍏宠仈鍟嗘満 ID锛屽彲绌?|
| customerName | varchar(100) | 瀹㈡埛鍚嶇О |
| customerContact | varchar(100) | 鑱旂郴浜?|
| items | jsonb | 鎶ヤ环椤圭洰鍒楄〃 [{product, unitPrice, quantity, discount, subtotal}] |
| totalAmount | decimal(12,2) | 鎬婚噾棰?|
| discountRate | decimal(5,2) | 鎶樻墸鐜囷紙0-100锛墊
| validUntil | date | 鏈夋晥鏈熸埅姝㈡棩鏈?|
| status | enum | draft/pending_approval/approved/rejected/sent/accepted/expired |
| approverId | integer | 瀹℃壒浜?ID |
| approvalNote | text | 瀹℃壒澶囨敞 |
| createdBy | integer | 鍒涘缓浜?|
| createdAt | timestamp | 鍒涘缓鏃堕棿 |
| updatedAt | timestamp | 鏇存柊鏃堕棿 |

### contractTemplates锛堝悎鍚屾ā鏉匡級

| 瀛楁 | 绫诲瀷 | 璇存槑 |
|------|------|------|
| id | serial | 涓婚敭 |
| name | varchar(100) | 妯℃澘鍚嶇О |
| content | text | Markdown 姝ｆ枃 |
| variables | jsonb | 鍙橀噺瀹氫箟 [{key, label, type, required, defaultValue}] |
| version | integer | 鐗堟湰鍙?|
| isActive | boolean | 鏄惁鍚敤 |
| createdBy | integer | 鍒涘缓浜?|
| createdAt | timestamp | 鍒涘缓鏃堕棿 |
| updatedAt | timestamp | 鏇存柊鏃堕棿 |

### contracts锛堝悎鍚岋級

| 瀛楁 | 绫诲瀷 | 璇存槑 |
|------|------|------|
| id | serial | 涓婚敭 |
| contractNo | varchar(30) | 鍚堝悓缂栧彿锛岃嚜鍔ㄧ敓鎴愶紙CON-鏃ユ湡-搴忓彿锛墊
| templateId | integer | 浣跨敤鐨勬ā鏉?ID |
| customerId | integer | 瀹㈡埛 ID锛堝叧鑱?CRM锛墊
| customerName | varchar(100) | 瀹㈡埛鍚嶇О |
| customerContact | varchar(100) | 鑱旂郴浜?|
| salespersonId | integer | 涓氬姟鍛?ID |
| content | text | 鏈€缁堝悎鍚屽唴瀹?|
| variables | jsonb | 鍙橀噺濉厖鍊?|
| status | enum | draft/pending_approval/approved/signed/expired/terminated |
| effectiveDate | date | 鐢熸晥鏃ユ湡 |
| expiryDate | date | 鍒版湡鏃ユ湡 |
| signedAt | timestamp | 绛剧讲鏃堕棿 |
| signMethod | varchar(20) | 绛剧讲鏂瑰紡锛坥ffline/electronic锛墊
| fileUrl | varchar(500) | 宸茬缃插悎鍚屾枃浠惰矾寰?|
| renewalContractId | integer | 缁鍚庣殑鏂板悎鍚?ID |
| createdBy | integer | 鍒涘缓浜?|
| createdAt | timestamp | 鍒涘缓鏃堕棿 |
| updatedAt | timestamp | 鏇存柊鏃堕棿 |

---

## API 鎺ュ彛

### 鎶ヤ环

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| `POST` | `/api/v1/agent/quotations` | 鍒涘缓鎶ヤ环鍗?| 涓氬姟鍛?|
| `GET` | `/api/v1/agent/quotations` | 鎶ヤ环鍗曞垪琛?| 涓氬姟鍛?|
| `GET` | `/api/v1/agent/quotations/:id` | 鎶ヤ环鍗曡鎯?| 涓氬姟鍛?|
| `GET` | `/api/v1/agent/quotations/:id/download` | 涓嬭浇鎶ヤ环鍗?PDF | 涓氬姟鍛?|
| `POST` | `/api/v1/agent/quotations/:id/submit-approval` | 鎻愪氦瀹℃壒 | 涓氬姟鍛?|
| `POST` | `/api/v1/admin/quotations/:id/approve` | 瀹℃壒閫氳繃 | 绠＄悊鍛?|
| `POST` | `/api/v1/admin/quotations/:id/reject` | 椹冲洖 | 绠＄悊鍛?|

### 鍚堝悓妯℃澘

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| `POST` | `/api/v1/admin/contract-templates` | 鍒涘缓妯℃澘 | 绠＄悊鍛?|
| `GET` | `/api/v1/admin/contract-templates` | 妯℃澘鍒楄〃 | 绠＄悊鍛?|

### 鍚堝悓

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| `POST` | `/api/v1/agent/contracts/generate` | 鐢熸垚鍚堝悓锛堝熀浜庢ā鏉匡級 | 涓氬姟鍛?|
| `GET` | `/api/v1/agent/contracts` | 鍚堝悓鍒楄〃 | 涓氬姟鍛?|
| `GET` | `/api/v1/agent/contracts/:id` | 鍚堝悓璇︽儏 | 涓氬姟鍛?|
| `GET` | `/api/v1/agent/contracts/:id/download` | 涓嬭浇鍚堝悓 PDF | 涓氬姟鍛?|
| `POST` | `/api/v1/agent/contracts/:id/submit-approval` | 鎻愪氦鍚堝悓瀹℃壒 | 涓氬姟鍛?|
| `POST` | `/api/v1/admin/contracts/:id/approve` | 瀹℃壒鍚堝悓 | 绠＄悊鍛?|
| `POST` | `/api/v1/admin/contracts/:id/reject` | 椹冲洖鍚堝悓 | 绠＄悊鍛?|
| `POST` | `/api/v1/agent/contracts/:id/renew` | 锟斤拷锟界鍚堝悓 | 涓氬姟鍛?|

---

## 鍓嶇缁勪欢 Props

```tsx
// 鎶ヤ环鍗曞垪琛?interface QuotationListProps {
  data: QuotationSummary[];
  onView: (id: number) => void;
  onCreate: () => void;
  statusFilter?: QuotationStatus[];
}

// 鎶ヤ环鍗曠紪杈?鍒涘缓琛ㄥ崟
interface QuotationEditorProps {
  mode: 'create' | 'edit';
  initialData?: Partial<Quotation>;
  opportunityId?: number; // 浠庡晢鏈轰紶鍏?  onSave: (data: QuotationInput) => void;
  onSubmit: (data: QuotationInput) => void;
}

interface QuotationInput {
  customerName: string;
  customerContact: string;
  items: QuotationItem[];
  discountRate: number;
  validUntil: string;
  notes?: string;
}

interface QuotationItem {
  productName: string;
  unitPrice: number;
  quantity: number;
  discount: number; // 鍗曡鎶樻墸鐜?0-100
}

// 鎶ヤ环鍗曞鎵癸紙绠＄悊鍛樼锛?interface QuotationApprovalProps {
  quotation: QuotationDetail;
  onApprove: (note?: string) => void;
  onReject: (note: string) => void;
}

// 鍚堝悓妯℃澘绠＄悊
interface ContractTemplateListProps {
  data: TemplateSummary[];
  onCreate: () => void;
  onEdit: (id: number) => void;
}

// 鍚堝悓鐢熸垚
interface ContractGeneratorProps {
  templates: TemplateSummary[];
  quotationId?: number; // 浠庢姤浠峰崟鍒涘缓鏃朵紶鍏?  customerId?: number;
  onGenerate: (data: ContractGenerateInput) => void;
}

interface ContractGenerateInput {
  templateId: number;
 rame: string; // 鍚堝悓鍚嶇О
  customerId: number;
  effectiveDate: string;
  expiryDate: string;
  variables: Record<string, string>; // 妯℃澘鍙橀噺濉厖
}

// 鍚堝悓鍒楄〃
interface ContractListProps {
  data: ContractSummary[];
  statusFilter?: ContractStatus[];
  onView: (id: number) => void;
  onCreate: () => void;
  onRenew: (id: number) => void;
}

// 鍚堝悓鍒版湡鎻愰啋
interface ContractExpiryAlertProps {
  expiringSoon: ContractSummary[]; // 30/15/7 澶?  expired: ContractSummary[];
}
```

---

## 杈圭晫鏉′欢

| 鍦烘櫙 | 澶勭悊鏂瑰紡 |
|------|---------|
| 鎶ヤ环鍗曟湁鏁堟湡宸茶繃浣嗘湭澶勭悊 | 瀹氭椂浠诲姟姣忓ぉ鍑屾櫒鑷姩灏嗚繃鏈熷緟澶勭悊鐘舵€佸彉鏇翠负 `expired` |
| 鎶ヤ环鍗曞凡杩囨湡鍚庢彁浜ゅ鎵?| 鎺ュ彛鎷掔粷锛屾彁绀?鎶ヤ环鍗曞凡杩囨湡锛岃閲嶆柊鍒涘缓" |
| 鍚堝悓妯℃澘鍙橀噺鏈～鍏呭畬鏁?| 鐢熸垚鏃舵牎楠屾墍鏈?`required` 鍙橀噺锛岀己澶卞垯鎻愮ず |
| 鎶ヤ环鍗曢噾棰濅负闆?| 鍏佽鍒涘缓锛堣禒閫佸満鏅級锛屼絾鎻愪氦瀹℃壒鏃舵彁绀?閲戦涓?0锛岃纭" |
| 鍚堝悓鍒版湡鑷姩鎻愰啋 | 瀹氭椂浠诲姟姣忓ぉ妫€鏌?`expiryDate`锛岃Е鍙?30/15/7 澶╁墠閫氱煡 |
| 鍚堝悓缁鏃跺師鍚堝悓鏈埌鏈?| 缁鍚庡師鍚堝悓鍒版湡鏃ユ湡涓嶅彉锛屾柊鍚堝悓浠庡師鍚堝悓鍒版湡鍚庝竴澶╁紑濮?|
| 鍚堝悓妯℃澘鐗堟湰鏇存柊 | 宸茬敓鎴愮殑鍚堝悓涓嶅彈褰卞搷锛屼粎鏂板悎鍚屼娇鐢ㄦ柊鐗堟湰 |
| PDF 鐢熸垚澶辫触 | 杩斿洖閿欒淇℃伅锛屽厑璁搁噸璇曪紝淇濈暀宸茬敓鎴愮殑瀛楁鏁版嵁 |
| 鍚堝悓鏂囦欢涓婁紶澶辫触 | 鎻愮ず"鏂囦欢涓婁紶澶辫触锛岃閲嶈瘯"锛屽悎鍚岀姸鎬佷繚鎸?`signed` 浣?`fileUrl` 涓虹┖ |

---

## 鍏宠仈妯″潡

| 妯″潡 | 鍏宠仈鏂瑰紡 |
|------|---------|
| 搂11.4 鍟嗘満绠＄悊 | 鎶ヤ环鍗曞彲鍏宠仈鍟嗘満锛屽晢鏈鸿鎯呴〉鎻愪緵"鍒涘缓鎶ヤ环鍗?蹇嵎鍏ュ彛 |
| 搂11.1 CRM | 鍚堝悓鍏宠仈瀹㈡埛锛屽鎴疯鎯呴〉灞曠ず鍚堝悓鍒楄〃 |
| 搂4.17 妯℃澘搴?| 鍚堝悓妯℃澘鍙鐢ㄦā鏉垮簱鐨?Markdown 缂栬緫鍣?|
| 搂12.4 浠诲姟璋冨害 | 鎶ヤ环杩囨湡鍜屽悎鍚屽埌鏈熸彁閱掔敱瀹氭椂浠诲姟椹卞姩 |
| 搂4.7 鏂囦欢瀛樺偍 | PDF 鎶ヤ环鍗曞拰鍚堝悓鏂囦欢瀛樺偍鍦ㄥ璞″瓨鍌ㄦ湇鍔?|
| 搂4.6 瀹夊叏瀹¤ | 鎶ヤ环鍗曞鎵广€佸悎鍚岀缃插潎璁板綍鎿嶄綔鏃ュ織 |

---

### [?] 椤甸潰甯姪
**椤甸潰鍚嶇О**锛氭姤浠蜂笌鍚堝悓绠＄悊
**鏍稿績鎿嶄綔**锛氬垱寤烘姤浠峰崟 鈫?鎻愬鎵?鈫?鍙戦€佸鎴?鈫?閫夋嫨妯℃澘鐢熸垚鍚堝悓 鈫?鎻愬鎵?鈫?绛剧讲褰掓。 鈫?鍒版湡鍓嶈嚜鍔ㄧ画绛?**娉ㄦ剰浜嬮」**锛氭姤浠峰崟鏈夋晥鏈熷唴鏈鐞嗚嚜鍔ㄨ繃鏈燂紱鍚堝悓鍒版湡鍓嶇郴缁熶細鍙?3 娆℃彁閱掞紙30/15/7 澶╁墠锛夛紱缁灏嗗垱寤烘柊鍚堝悓鑰岄潪淇敼鍘熷悎鍚?
### [?] 鎸夐挳绾у府鍔╁鐓ц〃
| 鎸夐挳/鎿嶄綔 | 甯姪璇存槑 |
|----------|---------|
| 鍒涘缓鎶ヤ环鍗?| 濉啓浜у搧鏄庣粏鍜屾姌鎵ｅ悗鐢熸垚鎶ヤ环鍗曪紝鍙叧鑱斿晢鏈鸿嚜鍔ㄥ～鍏呭鎴蜂俊鎭?|
| 鎻愪氦瀹℃壒 | 灏嗘姤浠峰崟鎻愪氦缁欑鐞嗗憳瀹℃壒锛屽鎵归€氳繃鍚庢柟鍙彂閫佺粰瀹㈡埛 |
| 涓嬭浇 PDF | 鐢熸垚鍚叕鍙?Logo 鍜屽畬鏁存槑缁嗙殑鎶ヤ环鍗?PDF 鏂囦欢 |
| 鐢熸垚鍚堝悓 | 閫夋嫨妯℃澘骞跺～鍏呭彉閲忓悗鑷姩鐢熸垚鏍囧噯鍚堝悓鍐呭 |
| 绛剧讲鍚堝悓 | 涓嬭浇 PDF 绾夸笅绛剧讲鍚庝笂浼犳壂鎻忎欢锛屾垨鍦ㄧ郴缁熷唴鐢靛瓙绛剧讲 |
| 缁 | 鍩轰簬鐜版湁鍚堝悓鍒涘缓涓€浠芥柊鍚堝悓锛岃嚜鍔ㄥ～鍏呭師鍚堝悓淇℃伅 |