# 娣卞寲鍙傝€冿細搂12.7 鍙樻洿璁″垝

> **瀵瑰簲**锛歔`PRD-绯荤粺绠＄悊鍛樻敮鎾?md`](PRD-绯荤粺绠＄悊鍛樻敮鎾?md) 搂12.7
> **鍏宠仈**锛歔`ref-12.4-task-scheduler.md`](ref-12.4-task-scheduler.md)銆乕`ref-12.8-version-manager.md`](ref-12.8-version-manager.md)銆乕`ref-4.8-system-config.md`](ref-4.8-system-config.md)
> **浼樺厛绾?*锛歅1 | **鐘舵€?*锛氶渶姹傛枃妗ｏ紙寰呭紑鍙戯級
> **鏈€鍚庢洿鏂?*锛?026-07-30

---

## 姒傝堪

鐢熶骇鐜鍙樻洿锛堥厤缃慨鏀广€佺増鏈崌绾с€佺淮鎶ゆ搷浣溿€佸洖婊氾級闇€瑕佽鑼冨寲娴佺▼锛氬厛璁″垝 鈫?璇勫 鈫?鎵ц 鈫?楠岃瘉 鈫?瀹屾垚銆傚綋鍓嶅彉鏇翠緷璧栧彛澶存矡閫氭垨绂荤嚎鏂囨。锛岀己灏戞爣鍑嗗寲鐨勬祦绋嬬鐞嗗拰鎵ц璁板綍銆?
**鏍稿績浠峰€?*锛氬彉鏇村叏娴佺▼绾夸笂鍖栵紝鍚闄╄瘎浼般€佹楠ゅ垎瑙ｃ€佸浜鸿瘎瀹°€佹寜姝ラ鎵ц銆佸洖婊氭柟妗堛€佺粨鏋滆褰曪紝闄嶄綆鍙樻洿椋庨櫓銆?
---

## 鍔熻兘妯″潡

### 1. 鍙樻洿璁″垝鍒涘缓

绠＄悊鍛樺垱寤哄彉鏇磋鍒掞紝濉啓浠ヤ笅淇℃伅锛?
| 瀛楁 | 璇存槑 |
|------|------|
| 鏍囬 | 鍙樻洿鍚嶇О锛屽"璺敱閰嶇疆鏇存柊 - 鏂板 DeepSeek V4 璺敱" |
| 鎻忚堪 | 鍙樻洿鐩殑鍜岄鏈熸晥鏋?|
| 绫诲埆 | `config`锛堥厤缃彉鏇达級/ `upgrade`锛堢増鏈崌绾э級/ `maintenance`锛堢淮鎶ゆ搷浣滐級/ `rollback`锛堝洖婊氭搷浣滐級|
| 浼樺厛绾?| `low` / `normal` / `high` / `urgent` |
| 椋庨櫓绛夌骇 | `low` / `medium` / `high` |
| 璁″垝寮€濮?缁撴潫鏃堕棿 | 鍙樻洿绐楀彛鏃堕棿 |
| 鎵ц姝ラ | 鏈夊簭姝ラ鍒楄〃 |

**鎵ц姝ラ瀹氫箟**锛?
| 瀛楁 | 璇存槑 |
|------|------|
| 姝ラ椤哄簭 | 1, 2, 3... |
| 鎿嶄綔鎻忚堪 | 濡?淇敼 nginx 閰嶇疆" |
| 鎿嶄綔璇︽儏 | 鍏蜂綋鍛戒护鎴栨搷浣滆鏄?|
| 棰勬湡缁撴灉 | 璇ユ楠ゆ墽琛屽悗搴旇揪鍒扮殑鐘舵€?|
| 鐘舵€?| `pending` / `running` / `success` / `failed` / `skipped` |

**鍥炴粴鏂规**锛?
- 姣忎竴姝ラ搴斿寘鍚搴旂殑鍥炴粴鎿嶄綔
- 鍏ㄥ眬鍥炴粴鏂规锛氭暣涓彉鏇村け璐ユ椂鏁翠綋鍥炴粴绛栫暐
- 鍥炴粴鏂规闇€鍦ㄥ垱寤烘椂濉啓锛屼綔涓哄鎵逛緷鎹?
**椋庨櫓璇勪及**锛?
| 椋庨櫓绛夌骇 | 瀹氫箟 | 瀹℃壒瑕佹眰 |
|---------|------|---------|
| low | 褰卞搷鑼冨洿灏忥紝鍙揩閫熸仮澶?| 鍗曞鎵逛汉 |
| medium | 褰卞搷閮ㄥ垎鐢ㄦ埛锛屾仮澶嶉渶 30 鍒嗛挓鍐?| 鍙屽鎵逛汉 |
| high | 褰卞搷澶ч儴鍒嗙敤鎴凤紝鎭㈠鍙兘闇€ 1 灏忔椂+ | 涓変汉浠ヤ笂瀹℃壒 |

### 2. 鍙樻洿璇勫娴佺▼

```
draft 鈹€鈹€鈫?pending_approval 鈹€鈹€鈫?approved 鈹€鈹€鈫?in_progress 鈹€鈹€鈫?completed
              鈹?                    鈹?                          鈹?              鈹斺攢鈹€鈫?rejected         鈹?                          鈹?                                    鈹斺攢鈹€鈫?rolled_back            鈹?                                                                鈹斺攢鈹€鈫?failed
```

| 鐘舵€?| 璇存槑 |
|------|------|
| draft | 鑽夌锛屽垱寤鸿€呭彲缂栬緫 |
| pending_approval | 宸叉彁浜よ瘎瀹★紝绛夊緟瀹℃壒浜哄鏍?|
| approved | 瀹℃壒閫氳繃锛屽彲寮€濮嬫墽琛?|
| rejected | 瀹℃壒椹冲洖锛岄檮甯﹂┏鍥炲師鍥?|
| in_progress | 姝ｅ湪鎵ц |
| completed | 鎵ц瀹屾垚锛岄獙璇侀€氳繃 |
| rolled_back | 宸叉墽琛屽洖婊?|
| failed | 鎵ц澶辫触锛堜笖鏈洖婊氾級|

**澶氫汉璇勫**锛?
- `reviewResult` 瀛楁璁板綍姣忎釜璇勫浜烘剰瑙侊細`[{reviewer, approved, comment}]`
- 楂橀闄╁彉鏇撮渶鍏ㄩ儴瀹℃壒浜洪€氳繃
- 涓綆椋庨櫓鍙樻洿鑷冲皯鍗婃暟瀹℃壒浜洪€氳繃
- 瀹℃壒閫氳繃鍚庤嚜鍔ㄥ彂閫侀€氱煡缁欐墽琛屼汉

### 3. 鍙樻洿鎵ц

鎵ц浜烘寜姝ラ渚濇鎿嶄綔锛?
```
姝ラ 1/5: 澶囦唤褰撳墠閰嶇疆鏂囦欢
  鐘舵€? 鉁?宸插畬鎴?  鑰楁椂: 2s
  缁撴灉: 宸插浠藉埌 /root/backup/cfg-20260730.tar.gz

姝ラ 2/5: 淇敼 nginx 璺敱閰嶇疆
  鐘舵€? 鈴?鎵ц涓?  鑰楁椂: -
  鎿嶄綔: sed -i 's/old_upstream/new_upstream/' /etc/nginx/conf.d/api.conf

姝ラ 3/5: 閲嶆柊鍔犺浇 nginx
  鐘舵€? 鈴?寰呮墽琛?  鎿嶄綔: nginx -s reload

...
```

| 鎵ц瑙勫垯 | 璇存槑 |
|----------|------|
| 鎸夊簭鎵ц | 涓婁竴姝ユ垚鍔熷悗鎵嶈兘鎵ц涓嬩竴姝?|
| 姝ラ澶辫触 | 鍙噸璇曞綋鍓嶆楠わ紝鎴栭€夋嫨鍥炴粴 |
| 璺宠繃姝ラ | 鍏佽璺宠繃闈炲叧閿楠わ紙闇€澶囨敞鍘熷洜锛墊
| 姝ラ澶囨敞 | 姣忎釜姝ラ鍙坊鍔犳墽琛屽娉?|

### 4. 鍙樻洿鍥炴粴

| 鍥炴粴鍦烘櫙 | 鎿嶄綔 |
|----------|------|
| 鍗曟楠ゅけ璐?| 鍙粎鍥炴粴褰撳墠姝ラ锛屾垨鍥炴粴鑷虫寚瀹氭楠?|
| 鏁翠綋澶辫触 | 鎵ц鍏ㄥ眬鍥炴粴鏂规 |
| 鎵嬪姩鍥炴粴 | 閫夋嫨鍥炴粴鎿嶄綔锛屽～鍐欏洖婊氬師鍥?|

鍥炴粴鍚庯細
- 鍙樻洿鐘舵€佸彉鏇翠负 `rolled_back`
- 璁板綍鍥炴粴缁撴灉鑷?`result` 瀛楁
- 閫氱煡鎵€鏈夊鎵逛汉鍜屽垱寤轰汉

### 5. 鍙樻洿鍘嗗彶褰掓。

| 褰掓。鍐呭 | 璇存槑 |
|----------|------|
| 鍙樻洿璁″垝 | 瀹屾暣鍙樻洿淇℃伅 |
| 璇勫璁板綍 | 鎵€鏈夊鎵逛汉鎰忚 |
| 鎵ц璁板綍 | 姣忎竴姝ョ殑鎵ц缁撴灉鍜屾椂闂?|
| 鍥炴粴璁板綍 | 鍥炴粴鍘熷洜鍜岀粨鏋?|
| 鍙樻洿鎬荤粨 | 鎵ц浜哄～鍐欑殑鍙樻洿鎬荤粨 |

宸插綊妗ｇ殑鍙樻洿涓哄彧璇伙紝涓嶅彲淇敼銆?
### 6. 鍙樻洿绐楀彛鏃ュ巻

鏃ュ巻瑙嗗浘灞曠ず璁″垝涓殑鍙樻洿锛?
```
2026骞?鏈?鈹屸攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹攢鈹€鈹€鈹€鈹?          鈹?涓€  鈹?浜? 鈹?涓? 鈹?鍥? 鈹?浜? 鈹?鍏? 鈹?鏃? 鈹?          鈹溾攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹?          鈹?   鈹?   鈹? 1 鈹? 2 鈹? 3 鈹? 4 鈹? 5 鈹?          鈹?   鈹?   鈹?   鈹?   鈹?璺敱鈹?   鈹?   鈹?          鈹?   鈹?   鈹?   鈹?   鈹傛洿鏂扳攤    鈹?   鈹?          鈹溾攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹尖攢鈹€鈹€鈹€鈹?          鈹? 6 鈹? 7 鈹? 8 鈹? 9 鈹?10 鈹?11 鈹?12 鈹?          鈹?   鈹?   鈹傚崌绾р攤    鈹?   鈹?   鈹?   鈹?          鈹?   鈹?   鈹侱B  鈹?   鈹?   鈹?   鈹?   鈹?          鈹斺攢鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹?```

- 姣忎釜鍙樻洿浠ラ鑹叉爣绛惧睍绀哄湪璁″垝鎵ц鏃ユ湡涓?- 棰滆壊鏍囪瘑椋庨櫓绛夌骇锛氱豢鑹?low / 榛勮壊 medium / 绾㈣壊 high
- 鐐瑰嚮鏍囩鏌ョ湅鍙樻洿璇︽儏
- 鎺ㄨ崘绐楀彛锛氬彉鏇村畨鎺掑湪闈為珮宄版湡锛堝鍑屾櫒 2:00-6:00锛?
---

## 鏁版嵁琛ㄥ畾涔?
### changePlans锛堝彉鏇磋鍒掞級

| 瀛楁 | 绫诲瀷 | 璇存槑 |
|------|------|------|
| id | serial | 涓婚敭 |
| title | varchar(100) | 鍙樻洿鏍囬 |
| description | text | 鍙樻洿鎻忚堪 |
| category | varchar(20) | 绫诲埆锛歚config` / `upgrade` / `maintenance` / `rollback` |
| priority | varchar(10) | 浼樺厛绾э細`low` / `normal` / `high` / `urgent`锛岄粯璁?`normal` |
| status | varchar(20) | 鐘舵€侊細`draft` / `pending_approval` / `approved` / `in_progress` / `completed` / `rolled_back` / `failed` |
| plannedStartAt | timestamp | 璁″垝寮€濮嬫椂闂?|
| plannedEndAt | timestamp | 璁″垝缁撴潫鏃堕棿 |
| actualStartAt | timestamp | 瀹為檯寮€濮嬫椂闂?|
| actualEndAt | timestamp | 瀹為檯缁撴潫鏃堕棿 |
| steps | jsonb | 鎵ц姝ラ鍒楄〃 [{order, action, description, status}] |
| riskLevel | varchar(10) | 椋庨櫓绛夌骇锛歚low` / `medium` / `high`锛岄粯璁?`low` |
| rollbackPlan | text | 鍥炴粴鏂规 |
| approverId | integer | 瀹℃壒浜?ID |
| executorId | integer | 鎵ц浜?ID |
| reviewResult | jsonb | 璇勫缁撴灉 [{reviewer, approved, comment}] |
| result | jsonb | 鎵ц缁撴灉 {success, metrics, issues} |
| createdBy | integer | 鍒涘缓浜?|
| createdAt | timestamp | 鍒涘缓鏃堕棿 |
| updatedAt | timestamp | 鏇存柊鏃堕棿 |

---

## API 鎺ュ彛

| 鏂规硶 | 璺緞 | 璇存槑 | 鏉冮檺 |
|------|------|------|------|
| `POST` | `/api/v1/admin/change-plans` | 鍒涘缓鍙樻洿璁″垝 | 绠＄悊鍛?|
| `GET` | `/api/v1/admin/change-plans` | 鍙樻洿璁″垝鍒楄〃 | 绠＄悊鍛?|
| `GET` | `/api/v1/admin/change-plans/:id` | 鍙樻洿璁″垝璇︽儏 | 绠＄悊鍛?|
| `PATCH` | `/api/v1/admin/change-plans/:id` | 鏇存柊鍙樻洿璁″垝 | 绠＄悊鍛?|
| `POST` | `/api/v1/admin/change-plans/:id/submit-review` | 鎻愪氦璇勫 | 绠＄悊鍛?|
| `POST` | `/api/v1/admin/change-plans/:id/approve` | 瀹℃壒閫氳繃 | 瀹℃壒浜?|
| `POST` | `/api/v1/admin/change-plans/:id/reject` | 椹冲洖 | 瀹℃壒浜?|
| `POST` | `/api/v1/admin/change-plans/:id/execute` | 寮€濮嬫墽琛?| 鎵ц浜?|
| `POST` | `/api/v1/admin/change-plans/:id/rollback` | 鍥炴粴 | 鎵ц浜?|
| `POST` | `/api/v1/admin/change-plans/:id/complete` | 瀹屾垚鍙樻洿 | 鎵ц浜?|

---

## 鍓嶇缁勪欢 Props

```tsx
// 鍙樻洿璁″垝鍒楄〃
interface ChangePlanListProps {
  plans: ChangePlanSummary[];
  statusFilter?: string;
  onView: (id: number) => void;
  onCreate: () => void;
}

interface ChangePlanSummary {
  id: number;
  title: string;
  category: string;
  priority: string;
  riskLevel: string;
  status: string;
  plannedStartAt: string;
  plannedEndAt: string;
  createdBy: string;
  createdAt: string;
}

// 鍒涘缓/缂栬緫鍙樻洿璁″垝
interface ChangePlanEditorProps {
  mode: 'create' | 'edit';
  initialData?: Partial<ChangePlanInput>;
  onSave: (data: ChangePlanInput) => void;
  onSubmit: (data: ChangePlanInput) => void;
}

interface ChangePlanInput {
  title: string;
  description: string;
  category: string;
  priority: string;
  riskLevel: string;
  plannedStartAt: string;
  plannedEndAt: string;
  steps: StepInput[];
  rollbackPlan: string;
  approverIds: number[];
}

interface StepInput {
  order: number;
  action: string; // 鎿嶄綔鍚嶇О
  description: string; // 鎿嶄綔鎻忚堪
  rollbackAction?: string; // 鍥炴粴鎿嶄綔
  expectedResult?: string; // 棰勬湡缁撴灉
}

// 鍙樻洿瀹℃壒
interface ChangePlanApprovalProps {
  plan: ChangePlanDetail;
  onApprove: (comment?: string) => void;
  onReject: (comment: string) => void;
  currentUserId: number;
}

// 鍙樻洿鎵ц
interface ChangePlanExecutionProps {
  plan: ChangePlanDetail;
  currentStep: number;
  onStepExecute: (stepId: number) => void;
  onStepSkip: (stepId: number) => void;
  onRollback: (reason: string) => void;
  onComplete: (summary: string, issues?: string[]) => void;
}

// 鍙樻洿绐楀彛鏃ュ巻
interface ChangeCalendarProps {
  month: string; // "2026-07"
  events: ChangeCalendarEvent[];
  onEventClick: (planId: number) => void;
  onMonthChange: (month: string) => void;
}

interface ChangeCalendarEvent {
  planId: number;
  title: string;
  date: string;
  riskLevel: 'low' | 'medium' | 'high';
  status: string;
}

// 鍙樻洿鍘嗗彶
interface ChangePlanHistoryProps {
  plans: ChangePlanSummary[];
  onFilter: (filter: HistoryFilter) => void;
}

interface HistoryFilter {
  dateRange?: { start: string; end: string };
  category?: string;
  status?: string;
}
```

---

## 杈圭晫鏉′欢

| 鍦烘櫙 | 澶勭悊鏂瑰紡 |
|------|---------|
| 璁″垝寮€濮嬫椂闂村凡杩囦絾鏈墽琛?| 鍒楄〃鏄剧ず"宸茶秴鏈?鏍囩锛屽厑璁告墽琛岋紙闇€澶囨敞寤惰繜鍘熷洜锛墊
| 瀹℃壒浜烘湭閰嶇疆 | 鎻愪氦璇勫鏃舵牎楠岋紝鑷冲皯闇€閫夋嫨涓€涓鎵逛汉 |
| 瀹℃壒浜鸿嚜宸辨彁浜ゅ彉鏇?| 鑷繁涓嶈兘瀹℃壒鑷繁鐨勫彉鏇达紙闃叉鍒╃泭鍐茬獊锛墊
| 鎵ц姝ラ涓煇涓€姝ュけ璐?| 鏍囪璇ユ楠や负 failed锛屽厑璁搁噸璇曟垨鍥炴粴 |
| 鍥炴粴鍚庣姸鎬?| 鍙樻洿涓?`rolled_back`锛岃褰曞洖婊氬師鍥犲拰缁撴灉 |
| 鍚屾椂鏈夊涓彉鏇磋鍒掑啿绐?| 绯荤粺妫€娴嬪悓涓€鏃堕棿娈电浉鍚岀被鍒殑鍙樻洿锛屾彁绀?瀛樺湪鍐茬獊鍙樻洿" |
| 鍙樻洿鎵ц涓€旀祻瑙堝櫒鍏抽棴 | 鐘舵€佷繚鎸?`in_progress`锛岄噸鏂版墦寮€鍚庣户缁墽琛?|
| 鎵ц瓒呮椂锛堣秴杩囪鍒掔粨鏉熸椂闂达級| 鏍囪涓鸿秴鏃讹紝鍏佽鎵ц浜虹‘璁ゆ槸鍚︾户缁?|
| 楂橈拷锟斤拷鍙樻洿鏈瘎瀹￠€氳繃灏濊瘯鎵ц | API 鎷掔粷锛屾彁绀?楂橀闄╁彉鏇撮渶璇勫閫氳繃鍚庢柟鍙墽琛? |

---

## 鍏宠仈妯″潡

| 妯″潡 | 鍏宠仈鏂瑰紡 |
|------|---------|
| 搂12.8 鐗堟湰绠＄悊 | 閰嶇疆鐗堟湰閮ㄧ讲鍙綔涓哄彉鏇磋鍒掍腑鐨勬楠?|
| 搂12.4 浠诲姟璋冨害 | 鍙樻洿鍚庡彲鑳介渶瑕佹墜鍔ㄨЕ鍙戜换鍔?|
| 搂12.6 鍋ュ悍鐩戞帶 | 鍙樻洿鎵ц鍓嶅悗瀵规瘮鍋ュ悍鎸囨爣 |
| 搂4.8 绯荤粺閰嶇疆 | 閰嶇疆绫诲彉鏇存秹鍙婄郴缁熼厤缃慨鏀?|
| 搂4.6 瀹夊叏瀹¤ | 鍙樻洿鎿嶄綔鍏ㄧ▼璁板綍瀹¤鏃ュ織 |

---

### [?] 椤甸潰甯姪
**椤甸潰鍚嶇О**锛氬彉鏇磋鍒?**鏍稿績鎿嶄綔**锛氬垱寤哄彉鏇磋鍒掞紙鍚楠ゅ拰鍥炴粴鏂规锛夆啋 鎻愪氦璇勫 鈫?瀹℃壒閫氳繃鍚庢墽琛?鈫?鎸夋楠ゆ搷浣?鈫?瀹屾垚鍚庡綊妗?**娉ㄦ剰浜嬮」**锛氶珮椋庨櫓鍙樻洿闇€涓変汉浠ヤ笂瀹℃壒锛涜嚜宸变笉鑳藉鎵硅嚜宸辩殑鍙樻洿锛涙瘡涓€姝ユ墽琛屽悗纭缁撴灉鍐嶇户缁笅涓€姝ワ紱鍥炴粴鎿嶄綔闇€濉啓鍘熷洜

### [?] 鎸夐挳绾у府鍔╁鐓ц〃
| 鎸夐挳/鎿嶄綔 | 甯姪璇存槑 |
|----------|---------|
| 鍒涘缓鍙樻洿 | 濉啓鍙樻洿鏍囬銆佹弿杩般€佺被鍒€佹楠ゅ拰鍥炴粴鏂规鍚庡垱寤哄彉鏇磋鍒?|
| 鎻愪氦璇勫 | 灏嗗彉鏇磋鍒掓彁浜ょ粰瀹℃壒浜鸿瘎瀹★紝鎻愪氦鍚庝笉鍙紪杈?|
| 瀹℃壒閫氳繃 | 鍚屾剰鎵ц璇ュ彉鏇磋鍒掞紙楂橀闄╁彉鏇撮渶澶氫汉瀹℃壒锛墊
| 椹冲洖 | 閫€鍥炲彉鏇磋鍒掞紝濉啓椹冲洖鍘熷洜渚涘垱寤鸿€呬慨鏀?|
| 寮€濮嬫墽琛?| 鎸夋楠や緷娆℃墽琛屽彉鏇存搷浣滐紙鍙湁瀹℃壒閫氳繃鍚庢柟鍙墽琛岋級|
| 鎵ц姝ラ | 鎵ц褰撳墠姝ラ鎿嶄綔锛屾墽琛屽畬鎴愬悗纭缁撴灉 |
| 鍥炴粴 | 鎵ц鍥炴粴鏂规锛屾仮澶嶅埌鍙樻洿鍓嶇殑鐘舵€?|
| 瀹屾垚鍙樻洿 | 锟斤拷锟借瘉鍙樻洿鎴愬姛锛屽～鍐欐€荤粨鍚庡畬鎴愬綊妗?|