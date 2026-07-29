# 鍔熻兘璇存槑涔︼細搂22 鐢ㄦ埛绔綋楠屽寮?

> **📖 页面功能说明帮助**
>
> **页面用途**：用户端体验增强（第二批） 功能说明书。本文档详细定义了该模块各功能点的字段规格、校验规则、边界条件、交互方式和注意事项。
>
> **适用角色**：所有平台用户
>
> **核心操作**：
- 了解用户端新增体验改进
- 查看优化后的操作流程
>
> **注意事项**：本 SPEC 文档面向开发者和测试人员，包含字段级定义和校验规则。页面标题旁的 `[?]` 帮助气泡引用本文档内容，点击可查看当前页面功能说明。
>
> **关联组件**：页面标题右侧 `[?]` 帮助按钮，悬停/点击弹出帮助弹窗。



> **瀵瑰簲鏂囨。**锛歔`PRD-鐢ㄦ埛绔綋楠屽寮?md`](PRD-鐢ㄦ埛绔綋楠屽寮?md)
> **娣卞寲鍙傝€?*锛歚ref-22.1-onboarding.md` + `ref-22.2-dashboard-enhance.md` + `ref-22.3-playground.md` + `ref-22.4-webhook.md` + `ref-22.5-oauth.md` + `ref-22.6-notifications.md`

---

## 22.0 鐢ㄦ埛绔綋楠屽寮烘€昏

| 妯″潡 | 浼樺厛绾?| 鏍稿績浠峰€?| 璺敱 |
|------|--------|---------|------|
| 娉ㄥ唽寮曞 Onboarding | P1 | 闄嶄綆鏂扮敤鎴蜂笂鎵嬮棬妲?| 鍏ㄥ睆寮圭獥 |
| Dashboard 浣撻獙澧炲己 | P1 | 琛ラ綈鎴愭湰棰勬祴/鍛婅/璐﹀崟/娲诲姩娴?瀵煎嚭 | `/console` |
| 鐢ㄦ埛绔?Playground | P1 | 闆朵唬鐮佸湪绾胯皟璇?API | `/console/playground` |
| Webhook 閰嶇疆 | P1 | 浜嬩欢涓诲姩鎺ㄩ€?| `/console/webhooks` |
| 绗笁鏂?OAuth 鐧诲綍 | P2 | 闄嶄綆娉ㄥ唽闂ㄦ | `/login` |
| 閫氱煡鍋忓ソ澧炲己 | P1 | 绮剧粏鍖栭€氱煡鎺у埗 | `/console/settings/notifications` |

---

## 22.1 娉ㄥ唽寮曞涓?Onboarding 鍚戝

### 鍔熻兘鎻忚堪

鏂扮敤鎴锋敞鍐屽悗锛岄€氳繃 5 姝ヤ氦浜掑紡寮曞瀹屾垚棣栨浣跨敤閰嶇疆锛堝垱寤?API Key 鈫?浜嗚В妯″瀷 鈫?娴嬭瘯璋冪敤 鈫?鑾峰彇鎺ュ叆浠ｇ爜锛夛紝闄嶄綆浜у搧涓婃墜闂ㄦ锛屽噺灏戞柊鐢ㄦ埛鍥?涓嶇煡閬撲笅涓€姝ュ仛浠€涔?瀵艰嚧鐨勬祦澶辩巼銆?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**Step 1锛氭杩庝笌浠嬬粛锛堝叏灞忔ā鎬佸脊绐楋級**
- 鏄剧ず"馃帀 娆㈣繋浣跨敤 3Cloud锛?澶ф爣棰?- 涓夋鍗＄墖寮忎粙缁嶏細
  - 缁熶竴 API 鈥?"涓€涓?Key 璋冪敤鏁板崄瀹?AI 渚涘簲鍟嗘ā鍨嬶紝鏃犻渶鍒嗗埆瀵规帴"
  - 鏅鸿兘璺敱 鈥?"鑷姩閫夋嫨鏈€浼樹緵搴斿晢锛屼繚璇佸彲鐢ㄦ€у拰鏈€浣庢垚鏈?
  - 绮剧粏杩愯惀 鈥?"瀹炴椂鐩戞帶鐢ㄩ噺銆佽垂鐢ㄣ€侀绠楋紝鏁版嵁灏藉湪鎺屾彙"
- 姝ｄ腑闂村睍绀轰綋楠岄搴︼細"娉ㄥ唽鍗抽€?楼5.00 浣撻獙棰濆害锛岀珛鍗冲紑濮嬫偍鐨?AI 涔嬫梾"
- 搴曢儴涓や釜鎸夐挳锛歚[涓嬩竴姝?鈫抅`锛堜富鎸夐挳锛岃摑鑹诧級 `[璺宠繃寮曞]`锛堟鎸夐挳锛岀伆鑹叉枃瀛楋級

**Step 2锛氬垱寤虹涓€涓?API Key锛堝紩瀵煎脊绐?+ 鑷姩鎵撳紑鍒涘缓 Key 寮圭獥锛?*
- 寮曞鎻愮ず锛氶珮浜伄缃╂寚鍚?鍒涘缓 API Key"鍖哄煙
- 娴姩鎻愮ず姘旀场锛氭枃瀛?棣栧厛锛岃鎴戜滑鍒涘缓涓€涓?API Key锛岃繖鏄偍浣跨敤 3Cloud 鏈嶅姟鐨勫嚟璇?馃攽"
- 鑷姩瑙﹀彂锛氬垱寤?Key 鐨勬娊灞?寮圭獥鑷姩鎵撳紑锛坢ounted锛?- 棰勫～鍐呭锛?  - Key 鍚嶇О杈撳叆妗嗭細鑷姩濉?鎴戠殑绗竴涓?Key"锛堢敤鎴峰彲淇敼锛?  - 妯″瀷鏉冮檺锛氶粯璁ゅ嬀閫?鍏ㄩ儴妯″瀷鍙闂?锛屼笉闄愬埗
- 鍒涘缓鎴愬姛鍚庯細
  - 鍒涘缓寮圭獥鍏抽棴
  - 椤甸潰涓婃柟鏄剧ず 3 绉?Toast锛?鉁?API Key 鍒涘缓鎴愬姛锛佽濡ュ杽淇濈锛歴k-3c-xxxx...xxxx"
  - Key 鍒楄〃鍗＄墖鏂板涓€鏉¤褰曪紝甯︾豢鑹?鏂板缓"鏍囩闂儊鏁堟灉
- 搴曢儴鎸夐挳锛歚[涓嬩竴姝?鈫抅` `[璺宠繃寮曞]`

**Step 3锛氭煡鐪嬫ā鍨嬩笌瀹氫环锛堥〉闈㈣烦杞?+ 鍏冪礌楂樹寒锛?*
- 鑷姩璺宠浆鍒版ā鍨嬪垪琛ㄩ〉 `/console/models`
- 楂樹寒鏁堟灉锛氭ā鍨嬫悳绱㈡杈规鑴夊啿鍔ㄧ敾锛? 娆★級锛岃儗鏅厜鏅曟墿鏁?- 娴姩鎻愮ず姘旀场锛氭枃瀛?鎮ㄥ彲浠ュ湪杩欓噷鎼滅储闇€瑕佺殑妯″瀷锛屾煡鐪嬩环鏍煎拰涓婁笅鏂囬暱搴?馃搳"
- 鎺ㄨ崘妯″瀷鍖哄煙楂樹寒锛氬崱鐗囦笂鏂规爣娉?馃煝 鎴戜滑涓烘偍鎺ㄨ崘杩欎簺鐑棬妯″瀷"
  - 鍒楄〃鏄剧ず锛歞eepseek-chat锛埪?.001/K input锛夈€乹wen-plus銆乬pt-4o-mini 绛?- 搴曢儴鎸夐挳锛歚[涓嬩竴姝?鈫抅` `[璺宠繃寮曞]`

**Step 4锛氬湪绾挎祴璇?API锛堣烦杞埌 Playground锛?*
- 鑷姩璺宠浆鍒?`/console/playground`
- 棰勫～鐘舵€侊細
  - API Key 閫夋嫨鍣細鑷姩閫変腑姝ラ 2 鍒涘缓鐨?Key
  - 妯″瀷閫夋嫨鍣細棰勯€?`deepseek-chat`锛堟垨骞冲彴棣栦釜鍙敤妯″瀷锛?  - 娑堟伅妗嗭細棰勫～娴嬭瘯娑堟伅 鈥?System: "You are a helpful assistant." / User: "璇风敤涓€鍙ヨ瘽浠嬬粛浠€涔堟槸 AI"
- 鍙戦€佹寜閽梺娴姩鎻愮ず姘旀场锛氭枃瀛?鐐瑰嚮鍙戦€侊紝娴嬭瘯鎮ㄧ殑绗竴涓?API 璋冪敤鍚э紒馃殌"
- 鐢ㄦ埛鐐瑰嚮鍙戦€佸悗锛?  - 鍙抽潰鏉垮疄鏃舵樉绀烘祦寮忓搷搴旓紙閫愬瓧杈撳嚭锛?  - 瀹屾垚鍚庡睍绀猴細鍝嶅簲鍐呭锛堟牸寮忓寲 JSON锛? 杈撳叆 Token 鏁?+ 杈撳嚭 Token 鏁?+ 璐圭敤 楼X.XXXX
  - 寮曞姘旀场鏇存柊锛?鉁?澶浜嗭紒鎮ㄥ凡鎴愬姛瀹屾垚绗竴娆?API 璋冪敤"
- 鑻ヨ皟鐢ㄥけ璐ワ細
  - 鍙抽潰鏉挎樉绀洪敊璇俊鎭紙绾㈣壊鑳屾櫙锛?  - 鏄剧ず閿欒鍘熷洜 + 瑙ｅ喅鏂规寤鸿锛堝"璇锋鏌?Key 鏉冮檺"銆?妯″瀷褰撳墠涓嶅彲鐢紝璇锋崲涓€涓瘯璇?锛?  - 寮曞姘旀场鏇存柊锛?馃槙 璋冪敤鏈兘鎴愬姛锛岃鏌ョ湅鍙充晶鐨勯敊璇俊鎭紝鎴栨崲涓ā鍨嬪啀璇曚竴娆?
  - 鎻愪緵"閲嶈瘯"鎸夐挳
- 搴曢儴鎸夐挳锛歚[涓嬩竴姝?鈫抅` `[璺宠繃寮曞]`

**Step 5锛氭煡鐪嬫帴鍏ヤ唬鐮侊紙璺宠浆鍒版枃妗ｉ〉锛?*
- 鑷姩璺宠浆鍒?`/console/docs` 鎴栨枃妗?蹇€熷紑濮嬮〉闈?- 鑷姩鐢熸垚浠ｇ爜绀轰緥鍖洪珮浜紝鏍囬锛?馃搵 鎮ㄧ殑涓撳睘鎺ュ叆浠ｇ爜"
- 灞曠ず涓変釜璇█鏍囩鍒囨崲锛歅ython | JavaScript | cURL
- 棰勭敓鎴愮殑浠ｇ爜绀轰緥锛堜互鎵€閫?Key 鍜屽父鐢ㄥ弬鏁颁负渚嬶級锛?  - Python锛歚from threecloud import ThreeCloud; client = ThreeCloud(api_key="sk-3c-xxx"); ...`
  - JavaScript锛歚import { ThreeCloud } from '3cloud-sdk'; const client = new ThreeCloud({ apiKey: 'sk-3c-xxx' }); ...`
  - cURL锛歚curl https://api.3cloud.dev/v1/chat/completions -H "Authorization: Bearer sk-3c-xxx" ...`
- 姣忔浠ｇ爜鍙充笅瑙掓湁"馃搵 澶嶅埗"鎸夐挳锛岀偣鍑诲悗 Toast锛?宸插鍒跺埌鍓创鏉?
- 娴姩鎻愮ず姘旀场锛?馃帀 鎭枩瀹屾垚寮曞锛佸鍒朵唬鐮佸嵆鍙湪鎮ㄧ殑椤圭洰涓泦鎴?AI 鑳藉姏锛屾煡鐪嬪畬鏁存枃妗ｈ幏鍙栨洿澶氱帺娉?
- 搴曢儴鎸夐挳锛歚[鉁?瀹屾垚]`锛堜富鎸夐挳锛?`[馃摉 鏌ョ湅瀹屾暣鏂囨。]`锛堟鎸夐挳锛屽閾惧埌鏂囨。绔欙級

### Onboarding 鐘舵€佺鐞?
**鐘舵€佹祦杞細**
```
not_started 鈫掞紙棣栨寮瑰嚭 Step 1锛夆啋 in_progress锛堣褰曞綋鍓嶆楠わ級
                                          鈹溾啋 瀹屾垚 Step 5 鈫?completed
                                          鈹斺啋 鐐瑰嚮"璺宠繃寮曞" 鈫?skipped
```

**瀛樺偍浣嶇疆锛?* `users` 琛ㄦ柊澧?3 涓瓧娈碉細
```typescript
onboarding_status: 'not_started' | 'in_progress' | 'completed' | 'skipped'
onboarding_step: number  // 1-5锛屽綋鍓嶆墍鍦ㄦ楠?onboarding_completed_at: timestamp | null
```

| 鍦烘櫙 | 琛屼负 |
|------|------|
| 鏂扮敤鎴烽娆＄櫥褰?| `onboarding_status = 'not_started'` 鈫?鑷姩寮瑰嚭 Step 1 |
| 寮曞杩涜涓叧闂脊绐?| 鐘舵€佷繚鎸?`in_progress`锛屼笅娆＄櫥褰曚华琛ㄧ洏椤堕儴鏄剧ず妯箙 |
| 瀹屾垚鍏ㄩ儴 5 姝?| 鐘舵€佸彉涓?`completed`锛屼笉鍐嶅脊鍑哄紩瀵?|
| 鐐瑰嚮"璺宠繃寮曞" | 鐘舵€佸彉涓?`skipped`锛屼华琛ㄧ洏鏄剧ず寮曞妯箙 |
| 涓诲姩閲嶆柊鎵撳紑 | 浠?`in_progress` 鐨勫綋鍓嶆楠ょ户缁紱`skipped` 浠?Step 1 閲嶆柊寮€濮?|
| 鏃х敤鎴凤紙宸叉湁 Key锛?| 鍙樉绀?Step 1 娆㈣繋浠嬬粛锛岃烦杩?Step 2锛堜笉寮哄埗鍒涘缓鏂?Key锛?|

### 寮曞妯箙锛堟湭瀹屾垚鐢ㄦ埛锛?- 浣嶇疆锛氫华琛ㄧ洏 `/console` 椤堕儴锛屽鑸爮涓嬫柟
- 鏍峰紡锛氳摑鑹叉笎鍙樿儗鏅紝宸︿晶 "馃殌 蹇€熸帴鍏ュ紩瀵? + 褰撳墠姝ラ杩涘害锛堝 "绗?2/5 姝?锛夛紝鍙充晶鎸夐挳 `[缁х画寮曞]`
- 琛屼负锛氱偣鍑绘í骞?鈫?鎵撳紑 Onboarding 鍚戝锛屼粠褰撳墠姝ラ寮€濮?- 鍏抽棴锛氬彸渚?脳 鎸夐挳鍙复鏃跺叧闂紝涓嬫鐧诲綍閲嶆柊鏄剧ず

### 涓婁笅娓稿叧绯?
```
涓婃父锛?  users 琛?鈫?onboarding_status / onboarding_step
  鐢ㄦ埛娉ㄥ唽 鈫?not_started 鈫?棣栨鐧诲綍瑙﹀彂
  api_keys 琛?鈫?鍒涘缓 Key
  vendor_models 琛?鈫?鎺ㄨ崘妯″瀷鍒楄〃
  鏂囨。鏈嶅姟 鈫?浠ｇ爜绀轰緥
涓嬫父锛?  onboarding_status 鏇存柊 鈫?鍐冲畾鏄惁寮瑰嚭寮曞寮圭獥
  鍒涘缓 Key 鍚?鈫?api_keys 琛ㄦ柊澧炶褰?  寮曞瀹屾垚 鈫?鐢ㄦ埛椤甸潰琛屼负鍩嬬偣涓婃姤
```

### 鏁版嵁琛ㄧ粨鏋?
```typescript
// users 琛ㄦ柊澧炲瓧娈?ALTER TABLE users ADD COLUMN onboarding_status VARCHAR(20) DEFAULT 'not_started'
  CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed', 'skipped'));
ALTER TABLE users ADD COLUMN onboarding_step INTEGER DEFAULT 1;
ALTER TABLE users ADD COLUMN onboarding_completed_at TIMESTAMPTZ;

// 绱㈠紩锛氬揩閫熸煡璇㈡湭瀹屾垚寮曞鐢ㄦ埛锛堢敤浜庤繍钀ョ粺璁★級
CREATE INDEX idx_users_onboarding_status ON users(onboarding_status) WHERE onboarding_status != 'completed';
```

### API 鎺ュ彛

```
GET    /api/v1/me/onboarding/status     鈥?鑾峰彇 Onboarding 鐘舵€?  鍝嶅簲锛歿 status: 'in_progress', step: 3, completedAt: null }

POST   /api/v1/me/onboarding/step       鈥?鏇存柊褰撳墠姝ラ
  璇锋眰锛歿 step: 3 }
  鍝嶅簲锛歿 status: 'in_progress', step: 3 }

POST   /api/v1/me/onboarding/complete   鈥?鏍囪瀹屾垚
  璇锋眰锛歿}
  鍝嶅簲锛歿 status: 'completed', completedAt: '2026-07-28T12:00:00Z' }

POST   /api/v1/me/onboarding/skip       鈥?璺宠繃寮曞
  璇锋眰锛歿}
  鍝嶅簲锛歿 status: 'skipped' }

POST   /api/v1/me/onboarding/reset      鈥?閲嶆柊寮€濮嬪紩瀵硷紙浠〃鐩樺叆鍙ｏ級
  璇锋眰锛歿}
  鍝嶅簲锛歿 status: 'not_started', step: 1 }
```

### 鍓嶇缁勪欢 Props

```typescript
// OnboardingWizard 鈥?椤跺眰鍚戝瀹瑰櫒
interface OnboardingWizardProps {
  isOpen: boolean;
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void;
  onSkip: () => void;
  onClose: () => void;
  apiKeys: ApiKey[];           // 鐢ㄦ埛宸叉湁鐨?API Keys
  recentlyCreatedKey: string;  // 鍒氬垱寤虹殑瀹屾暣 Key
}

// OnboardingStep 鈥?鍗曟瀹氫箟
interface OnboardingStep {
  id: number;                  // 姝ラ缂栧彿 1-5
  title: string;               // 姝ラ鏍囬
  description: string;         // 姝ラ璇存槑
  target?: string;             // 楂樹寒鐩爣 DOM 鍏冪礌鐨?CSS selector
  targetRoute?: string;        // 闇€瑕佽烦杞殑鐩爣璺敱
  targetAction?: string;       // 鑷姩瑙﹀彂鐨勬搷浣滃悕
  prefillData?: Record<string, any>;  // 棰勫～鏁版嵁
  component?: ReactNode;       // 鑷畾涔夊紩瀵肩粍浠?}

// OnboardingBanner 鈥?浠〃鐩橀《閮ㄥ紩瀵兼í骞?interface OnboardingBannerProps {
  currentStep: number;
  totalSteps: number;
  onContinue: () => void;
  onDismiss: () => void;
}
```

### 杈圭晫鏉′欢

| 鍦烘櫙 | 琛屼负 |
|------|------|
| 寮曞杩囩▼涓叧闂脊绐?| 鐘舵€佷繚鎸?`in_progress`锛屼笅娆＄櫥褰曚华琛ㄧ洏鏄剧ず妯箙 |
| 寮曞杩囩▼涓埛鏂伴〉闈?| 寮圭獥鍏抽棴锛岀姸鎬佷繚鎸侊紝涓嬫鐧诲綍鏄剧ず妯箙 |
| Step 4 API 璋冪敤澶辫触 | 鏄剧ず鍙嬪ソ閿欒鎻愮ず + 瑙ｅ喅鏂规寤鸿 + [閲嶈瘯] 鎸夐挳 + 鍏佽璺宠繃 |
| Step 4 鏃犲彲鐢?Key | 鎻愮ず"璇峰厛鍒涘缓 API Key"锛屾彁渚涜烦杞摼鎺ュ埌 Step 2 |
| 鏃х敤鎴凤紙闈炴柊娉ㄥ唽锛屽凡鏈?Key锛?| 鍙樉绀?Step 1 娆㈣繋浠嬬粛锛屼笉寮哄埗杩涜 Step 2 鍒涘缓 Key |
| 鐢ㄦ埛瀹屾垚寮曞鍚庣鐞嗗憳閲嶇疆 | 鐘舵€佸洖鍒?`not_started`锛屼笅娆＄櫥褰曞啀娆″紩瀵?|
| 骞跺彂璇锋眰 step/completed | 鍚庣骞傜瓑澶勭悊锛屽娆℃彁浜ゅ悓涓€鐘舵€佷笉鎶ラ敊 |
| 瀵煎悜鍓嶇缁勪欢鍔犺浇澶辫触 | 闈欓粯闄嶇骇锛屼笉闃诲椤甸潰锛屼华琛ㄧ洏妯箙涓嶆樉绀?|

### 楠屾敹鏍囧噯

| 缂栧彿 | 楠屾敹椤?| 棰勬湡缁撴灉 |
|------|--------|---------|
| AC-1 | 鏂扮敤鎴锋敞鍐岀櫥褰?| 鑷姩寮瑰嚭 Onboarding 鍚戝 Step 1 鍏ㄥ睆娆㈣繋寮圭獥 |
| AC-2 | 瀹屾垚 5 姝ュ紩瀵?+ 鐐瑰嚮"瀹屾垚" | 寮圭獥鍏抽棴锛宍onboarding_status = 'completed'`锛屼笉鍐嶆樉绀?|
| AC-3 | 寮曞涓偣鍑?璺宠繃寮曞" | 鐘舵€佸彉涓?`skipped`锛屼华琛ㄧ洏椤堕儴鏄剧ず寮曞妯箙 |
| AC-4 | 鏈畬鎴愬紩瀵肩敤鎴蜂笅娆＄櫥褰?| 浠〃鐩橀《閮ㄦ樉绀哄紩瀵兼í骞咃紝鐐瑰嚮缁х画浠庝笂娆℃楠ゅ紑濮?|
| AC-5 | Step 2 鍒涘缓 Key | Key 鍒楄〃鍑虹幇"鎴戠殑绗竴涓?Key"锛屽垱寤烘垚鍔?Toast 鎻愮ず |
| AC-6 | Step 4 鍙戦€?API 璇锋眰鎴愬姛 | 鍙充晶闈㈡澘鏄剧ず鏍煎紡鍖栧搷搴?+ Token 鏁?+ 璐圭敤鏄庣粏 |
| AC-7 | Step 4 鍙戦€?API 璇锋眰澶辫触 | 绾㈣壊閿欒淇℃伅 + 瑙ｅ喅鏂规寤鸿 + "閲嶈瘯"鎸夐挳 |
| AC-8 | Step 5 浠ｇ爜澶嶅埗 | 鐐瑰嚮"澶嶅埗"鎸夐挳鍚?Toast "宸插鍒跺埌鍓创鏉? |
| AC-9 | 鏃х敤鎴凤紙宸叉湁 Key锛夋敞鍐岀櫥褰?| 鍙樉绀?Step 1 浠嬬粛锛孲tep 2 璺宠繃 |
| AC-10 | 浠〃鐩?蹇€熸帴鍏ュ紩瀵?鍏ュ彛鐐瑰嚮 | 浠庝笂娆′腑鏂楠ょ户缁紩瀵?|

---

## 22.2 鐢ㄦ埛绔?Dashboard 浣撻獙澧炲己

### 鍔熻兘鎻忚堪

鍦ㄧ幇鏈変华琛ㄧ洏 16 涓姛鑳藉尯鍩虹涓婏紝琛ラ綈 5 涓叧閿崱鐗囩粍浠垛€斺€旀垚鏈娴嬪崱鐗囥€佸紓甯稿憡璀﹀崱鐗囥€佽处鍗曞懆鏈熸瑙堛€佸疄鏃舵椿鍔ㄦ祦銆佹暟鎹鍑猴紝璁╃敤鎴峰湪涓€涓〉闈笂鍏ㄩ潰鎺屾帶鑷繁鐨勭敤閲忔垚鏈€佸紓甯稿姩鎬佸拰璐㈠姟鍏ㄨ矊銆?
### 22.2.1 鎴愭湰棰勬祴鍗＄墖锛圕ostForecastCard锛?
#### 鍔熻兘鎻忚堪

鍩轰簬鍘嗗彶娑堣垂鏁版嵁锛屾櫤鑳介娴嬫湰鏈堟€绘秷璐归噾棰濆拰浣欓鑰楀敖鏃堕棿锛屽府鍔╃敤鎴锋彁鍓嶈鍒掗绠椼€?
#### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鍗＄墖浣嶇疆锛?* 浠〃鐩樻牳蹇冩寚鏍囧尯鍩熶笅鏂癸紝4 寮犳牳蹇冩寚鏍囧崱鐗囧彸渚?
**鍗＄墖鍐呭甯冨眬锛?*
```
鈹屸攢 鎴愭湰棰勬祴 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                                                   鈹?鈹? 鏈湀宸叉秷璐?                 棰勪及鏈湀鎬绘秷璐?        鈹?鈹?  楼 156.32                   楼 289.50              鈹?鈹?                                                   鈹?鈹? 棰勭畻涓婇檺: 楼500.00    鈻堚枅鈻堚枅鈻堚枅鈻堚枅鈻戔枒 57.9%            鈹?鈹? 宸茬敤 鈹€鈹€鈹€ 棰勪及 鈻勨杽鈻?棰勭畻 鈹€ 路 鈹€                     鈹?鈹?                                                   鈹?鈹? 鈴?鎸夊綋鍓嶉€熷害锛屼綑棰濆皢鍦?12 澶╁悗鑰楀敖               鈹?鈹? 馃搳 鐜瘮涓婃湀鍚屾湡 鈫?23.5%                           鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**姣忔潯鏁版嵁灞曠ず缁嗚妭锛?*
- **鏈湀宸叉秷璐?*锛氬ぇ瀛楀姞绮?楼156.32锛屼笅闈㈢伆搴﹀皬瀛?宸茬粨绠?
- **棰勪及鏈湀鎬绘秷璐?*锛氳绠楃粨鏋?楼289.50锛屽皬瀛楁爣娉?鍩轰簬杩?30 澶╂棩鍧囨秷璐归娴?
- **棰勭畻杩涘害鏉?*锛?  - 涓夋潯瀵规瘮绾匡細钃濊壊瀹炵嚎锛堝凡鐢級銆佹鑹茶櫄绾匡紙棰勪及锛夈€佺孩鑹茬偣绾匡紙棰勭畻涓婇檺锛?  - 宸茬敤娈靛～鍏呭埌瀹為檯娑堣垂浣嶇疆
  - 褰撻浼拌秴杩囬绠楁椂锛岃秴鍑烘鏄剧ず绾㈣壊
  - 涓夋潯绾垮浘渚嬪湪杩涘害鏉′笅鏂?- **浣欓鑰楀敖棰勬祴**锛?  - 鍙?`褰撳墠浣欓 梅 杩?30 澶╂棩鍧囨秷璐筦 寰楀嚭鍓╀綑澶╂暟
  - 棰滆壊鍙樺寲锛?30 澶╃豢鑹?/ 7-30 澶╅粍鑹?/ <7 澶╃孩鑹查棯鐑?  - <3 澶╂椂鏂囧瓧鍙樹负"鈿狅笍 浣欓涓嶈冻 3 澶╋紒璇峰強鏃跺厖鍊?
- **鐜瘮鍙樺寲**锛氬姣斾笂鏈堝悓鏈燂紙1鏃?褰撳ぉ锛夛紝姝ｅ闀跨豢鑹?鈫戯紝璐熷闀跨孩鑹?鈫?
#### 鍚庣璁＄畻閫昏緫

```
杩?30 澶╂棩鍧囨秷璐?= SUM(consumption_logs.cost WHERE created_at >= NOW() - INTERVAL '30 days') / 30
鏈湀鍓╀綑澶╂暟 = DAY(LAST_DAY(NOW())) - DAY(NOW()) + 1
棰勪及鏈湀鎬绘秷璐?= 鏈湀宸叉秷璐?+ (杩?0澶╂棩鍧囨秷璐?脳 鏈湀鍓╀綑澶╂暟)

杩?30 澶╂棩鍧囨秷璐癸紙鍒濆鍖栦紭鍖栵級锛?  鈫?缂撳瓨姣忓皬鏃舵洿鏂颁竴娆★紝瀛樺偍鍦?Redis: forecast:daily_avg:{userId}
  鈫?鐢ㄦ埛閲?< 100 鏃剁洿鎺ュ疄鏃惰绠?
浣欓鑰楀敖澶╂暟 = 褰撳墠浣欓 / 杩?0澶╂棩鍧囨秷璐?  鈫?鏃ュ潎娑堣垂 = 0 鈫?鏄剧ず"浣跨敤绋冲畾"涓嶈绠楀ぉ鏁?  鈫?浣欓鑰楀敖澶╂暟 > 365 鈫?鏄剧ず"鍏呰冻"
```

**鐜瘮鍙樺寲璁＄畻锛?*
```
涓婃湀鍚屾湡娑堣垂 = SUM(consumption_logs.cost WHERE created_at BETWEEN 涓婃湀1鏃?AND 涓婃湀褰撳ぉ)
鏈湀鍚屾湡娑堣垂 = 鏈湀宸叉秷璐癸紙鎴嚦褰撳ぉ锛?鐜瘮鍙樺寲 = (鏈湀 - 涓婃湀) / 涓婃湀 脳 100%
```

#### API 鎺ュ彛

```
GET /api/v1/me/stats/forecast

鍝嶅簲锛?{
  "currentMonthSpent": 156.32,
  "forecastTotal": 289.50,
  "monthlyBudget": 500.00,      // null 琛ㄧず鏈缃?  "budgetUsagePercent": 31.26,  // 宸茬敤/棰勭畻
  "forecastUsagePercent": 57.9, // 棰勪及/棰勭畻
  "dailyAvgCost": 4.52,
  "balance": 350.00,
  "balanceRunoutDays": 12,
  "monthOverMonthChange": 23.5,
  "monthOverMonthTrend": "up",  // "up" | "down" | "flat"
  "currentBalance": 350.00
}
```

#### 鍓嶇缁勪欢 Props

```typescript
interface CostForecastCardProps {
  currentMonthSpent: number;
  forecastTotal: number;
  monthlyBudget?: number | null;
  balanceRunoutDays: number;
  dailyAvgCost: number;
  monthOverMonthChange: number;
  monthOverMonthTrend: 'up' | 'down' | 'flat';
  currentBalance: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}
```

---

### 22.2.2 寮傚父鍛婅鍗＄墖锛圓lertCenter锛?
#### 鍔熻兘鎻忚堪

闆嗕腑灞曠ず鐢ㄦ埛鐨勫紓甯镐簨浠跺憡璀︼紙澶辫触鐜囩獊澧炪€佷綑棰濅笉瓒炽€佸紓甯哥櫥褰曘€侀绠楄秴闄愶級锛岃鐢ㄦ埛鍙婃椂鍙戠幇闂骞跺揩閫熷畾浣嶃€?
#### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鍗＄墖浣嶇疆锛?* 浠〃鐩樺彸渚ц竟鏍?
**鍗＄墖鍐呭甯冨眬锛?*
```
鈹屸攢 鈿狅笍 鍛婅涓績 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ [鏌ョ湅鍏ㄩ儴 鈫抅 鈹€鈹€鈹?鈹?                                       鈹?鈹?馃敶 澶辫触鐜囩獊澧?            10鍒嗗墠      鈹?鈹?   杩?灏忔椂 澶辫触鐜囪揪 8.2%锛岃秴杩?%闃堝€? 鈹?鈹?                     [鏌ョ湅璇︽儏] [宸茶]鈹?鈹?                                       鈹?鈹?鈿狅笍 浣欓涓嶈冻                1灏忔椂鍓?    鈹?鈹?   浣欓浠呭墿 楼8.50锛屼綆浜?楼10 闃堝€?     鈹?鈹?                     [鍘诲厖鍊糫  [宸茶] 鈹?鈹?                                       鈹?鈹?馃煛 棰勭畻瓒呴檺                3灏忔椂鍓?    鈹?鈹?   鏈湀娑堣垂宸茶揪棰勭畻鐨?92%              鈹?鈹?                     [棰勭畻璁剧疆] [宸茶]鈹?鈹?                                       鈹?鈹?馃煚 寮傚父鐧诲綍                5灏忔椂鍓?    鈹?鈹?   妫€娴嬪埌鏂拌澶囩櫥褰曪細涓婃捣 117.x.x.x    鈹?鈹?                     [瀹夊叏涓績] [宸茶]鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**鍛婅鍒嗙被涓庡睍绀猴細**

| 鍛婅绫诲瀷 | 鍥炬爣 | 瑙﹀彂鏉′欢 | 涓ラ噸绛夌骇 | 灞曠ず璺敱 |
|---------|------|---------|---------|---------|
| `rate_spike` | 馃敶 | 杩?1 灏忔椂璋冪敤澶辫触鐜?> 5% | 楂?| 璺宠浆璋冪敤鏃ュ織 |
| `low_balance` | 鈿狅笍 | 浣欓 < 楼10 | 楂?| 璺宠浆鍏呭€奸〉 |
| `abnormal_login` | 馃煚 | IP 褰掑睘鍦拌法鐪?璺ㄥ鐧诲綍 | 涓?| 瀹夊叏涓績鐧诲綍璁板綍 |
| `budget_exceeded` | 馃煛 | 鏈堟秷璐硅揪棰勭畻鐨?50%/80%/90%/100% | 涓?| 璺宠浆棰勭畻璁剧疆 |

**浜や簰琛屼负锛?*
- 鏈鍛婅瑙掓爣锛氬崱鐗囨爣棰樺彸渚ф樉绀虹孩鑹叉暟瀛楀窘绔狅紙濡?`鈶锛夛紝涓烘湭璇诲憡璀︽暟
- 姣忔潯鍛婅鍙充晶鎸夐挳锛氱偣鍑?宸茶"鈫?鏍囪璇ユ潯涓哄凡璇伙紝浠庡崱鐗囦腑娑堝け锛堟垨鍙樼伆锛?- 鐐瑰嚮鍛婅涓讳綋 鈫?璺宠浆鍒板搴旇鎯呴〉锛堣皟鐢ㄦ棩蹇?鍏呭€奸〉/瀹夊叏涓績/棰勭畻璁剧疆锛?- 鐐瑰嚮"鏌ョ湅鍏ㄩ儴"鈫?璺宠浆鍒板憡璀﹀垪琛ㄩ〉 `/console/alerts`锛堝彲缈婚〉锛屾樉绀烘墍鏈夊巻鍙插憡璀︼級

#### API 鎺ュ彛

```
GET /api/v1/me/alerts?limit=10&offset=0&includeRead=false

鍝嶅簲锛?{
  "alerts": [
    {
      "id": "alert_001",
      "type": "rate_spike",
      "level": "high",
      "message": "杩?灏忔椂璋冪敤澶辫触鐜囪揪 8.2%锛岃秴杩?%闃堝€?,
      "detail": {
        "failureRate": 8.2,
        "totalCalls": 122,
        "failedCalls": 10,
        "period": "1h"
      },
      "route": "/console/logs?filter=error",
      "read": false,
      "createdAt": "2026-07-28T20:20:00Z"
    }
  ],
  "unreadCount": 3,
  "total": 15
}

POST /api/v1/me/alerts/:id/read     鈥?鏍囪鍗曟潯宸茶
  鍝嶅簲锛歿 "success": true }

POST /api/v1/me/alerts/read-all     鈥?鍏ㄩ儴鏍囪宸茶
```

#### 鍓嶇缁勪欢 Props

```typescript
interface AlertCenterProps {
  alerts: AlertItem[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onViewAll: () => void;
  loading?: boolean;
}

interface AlertItem {
  id: string;
  type: 'rate_spike' | 'low_balance' | 'abnormal_login' | 'budget_exceeded';
  level: 'high' | 'medium';
  message: string;
  detail: Record<string, any>;
  route: string;
  read: boolean;
  createdAt: string;
}
```

#### 鍚庣鍛婅鐢熸垚閫昏緫

```
rate_spike 鍛婅闃堝€兼鏌ワ紙姣忓垎閽?cron锛夛細
  鈫?鏌ヨ杩?1 灏忔椂 call_logs
  鈫?IF (澶辫触鐜?> 5%) AND (璇ョ敤鎴蜂粖澶╂湭瑙﹁繃姝ゅ憡璀?
  鈫?鍐欏叆 user_alerts 琛?+ 鎺ㄩ€?WebSocket

low_balance 鍛婅锛堝疄鏃舵秷璐圭粨绠楁椂妫€鏌ワ級锛?  鈫?IF (缁撶畻鍚庝綑棰?< 10)
  鈫?鍐欏叆 user_alerts

abnormal_login锛堢櫥褰曟椂瀹炴椂妫€鏌ワ級锛?  鈫?IF (鐧诲綍 IP 褰掑睘鍩庡競 鈮?涓婃鐧诲綍 IP 褰掑睘鍩庡競)
  鈫?鍐欏叆 user_alerts + 鍐欏叆 login_history 鏍囩孩

budget_exceeded锛堟秷璐圭粨绠楁椂妫€鏌ワ級锛?  鈫?IF (鏈堟秷璐硅揪鍒伴绠楃殑 50%/80%/90%/100%)
  鈫?鍐欏叆 user_alerts锛屽彧鍦ㄤ竴绾цЕ鍙戞椂鍛婅锛堝 90% 瑙︿簡锛?0% 涓嶅啀瑙﹀彂锛?```

#### 鏁版嵁琛ㄧ粨鏋?
```typescript
export const userAlerts = pgTable("user_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 30 }).notNull(),
  level: varchar("level", { length: 10 }).notNull().default("medium"),
  message: varchar("message", { length: 500 }).notNull(),
  detail: jsonb("detail"),
  route: varchar("route", { length: 200 }),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdReadIdx: index("idx_alerts_user_read").on(table.userId, table.read),
  typeIdx: index("idx_alerts_type").on(table.userId, table.type),
}));
```

---

### 22.2.3 璐﹀崟鍛ㄦ湡姒傝锛圔illingCycleCard锛?
#### 鍔熻兘鎻忚堪

灞曠ず褰撳墠璁¤垂鍛ㄦ湡鐨勮处鍗曟憳瑕佷俊鎭€斺€斿凡鍑鸿处閲戦銆佸緟缁撶畻璐圭敤銆佸懆鏈熻繘搴︺€佷笅鏈熼浼帮紝甯姪鐢ㄦ埛鎺屾彙璐㈠姟鐘跺喌銆?
#### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鍗＄墖浣嶇疆锛?* 浠〃鐩樿储鍔″尯鍩燂紙鎴愭湰棰勬祴鍗＄墖涓嬫柟鎴栧苟鎺掞級

**鍗＄墖鍐呭甯冨眬锛?*
```
鈹屸攢 璐﹀崟鍛ㄦ湡姒傝 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                                                   鈹?鈹? 璁¤垂鍛ㄦ湡锛?026-07-01 鑷?2026-07-31              鈹?鈹? 鈻堚枅鈻堚枅鈻堚枅鈻堚枅鈻堚枅鈻堚枅鈻戔枒鈻戔枒鈻戔枒鈻戔枒鈻戔枒鈻戔枒鈻戔枒 60%                   鈹?鈹?                                                   鈹?鈹? 宸插嚭璐﹂噾棰?          寰呯粨绠楄垂鐢?                  鈹?鈹? 楼 327.80             楼 12.35                     鈹?鈹? 锛堟埅鑷?7鏈?6鏃ワ級     锛堣繎48灏忔椂鏈粨绠楄皟鐢級       鈹?鈹?                                                   鈹?鈹? 涓嬫湡棰勪及锛毬?352.50                               鈹?鈹? 锛堝熀浜庢湰鏈堟棩鍧囨秷璐?楼12.68 棰勬祴锛?                鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**杩涘害鏉¤鏄庯細**
- 杩涘害鏉￠暱搴?= 褰撳墠鏃ユ湡鍦ㄥ懆鏈熶腑鐨勪綅缃紙濡?7/18 鈫?58%锛?- 濉厖鑹插垎娈碉細
  - 宸插嚭璐﹂儴鍒嗭細瀹炲績娣辫摑 `鈻堚枅`锛堝崰宸叉秷鑰楅噾棰濈殑姣斾緥锛?  - 鍓╀綑閮ㄥ垎锛氭祬鐏板簳鑹?- 濡傛灉宸叉秷璐归噾棰濊秴杩囦笅鏈熼浼帮細杩涘害鏉℃湯灏炬樉绀虹孩鑹茶绀烘

**"宸插嚭璐?涓?寰呯粨绠?鐨勮绠楅€昏緫锛?*
- 宸插嚭璐﹂噾棰濓細SUM(call_logs WHERE created_at < NOW() - INTERVAL '24h' AND billing_cycle = current)
- 寰呯粨绠楄垂鐢細SUM(call_logs WHERE created_at >= NOW() - INTERVAL '24h' AND billing_cycle = current)
- 濡傛灉璇ョ敤鎴锋寜鏃ョ粺璁★紙浠?consumption_logs 鍙栵級锛屽垯鑱氬悎閫昏緫鐩稿悓

#### API 鎺ュ彛

```
GET /api/v1/me/billing/cycle

鍝嶅簲锛?{
  "cycleStart": "2026-07-01",
  "cycleEnd": "2026-07-31",
  "billedAmount": 327.80,
  "pendingAmount": 12.35,
  "cycleTotalSoFar": 340.15,     // billed + pending
  "dailyAvgThisCycle": 12.68,
  "remainingDays": 3,
  "nextEstimate": 352.50,        // dailyAvg 脳 totalDaysInCycle
  "progress": 60                 // 褰撳墠鏃ユ湡鍦ㄥ懆鏈熶腑鐨勭櫨鍒嗘瘮
}
```

#### 鍓嶇缁勪欢 Props

```typescript
interface BillingCycleCardProps {
  cycleStart: string;
  cycleEnd: string;
  billedAmount: number;
  pendingAmount: number;
  nextEstimate: number;
  progress: number;        // 0-100
  loading?: boolean;
}
```

---

### 22.2.4 瀹炴椂娲诲姩娴侊紙LiveActivityFeed锛?
#### 鍔熻兘鎻忚堪

閫氳繃 WebSocket 瀹炴椂鎺ㄩ€佺敤鎴锋渶鏂扮殑 API 璋冪敤璁板綍锛岃鐢ㄦ埛鍦ㄤ华琛ㄧ洏鐩存帴鐪嬪埌璋冪敤娴佸姩锛屽寮轰骇鍝?娲?鐨勪綋鎰熴€?
#### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鍗＄墖浣嶇疆锛?* 浠〃鐩樺簳閮ㄥ叏瀹藉尯鍩?
**鍗＄墖鍐呭甯冨眬锛?*
```
鈹屸攢 馃摗 瀹炴椂娲诲姩娴?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ [鈴?鏆傚仠婊氬姩] 鈹€[娓呯┖] 鈹€鈹?鈹?                                                              鈹?鈹? 21:29:32  deepseek-chat    杈撳叆 256 / 杈撳嚭 1,024    鎴愬姛    鈹?鈹?           楼 0.0008               512ms                       鈹?鈹?                                                              鈹?鈹? 21:29:28  qwen-plus        杈撳叆 128 / 杈撳嚭 512      澶辫触    鈹?鈹?           楼 0.0004               timeout                     鈹?鈹?                                                              鈹?鈹? 21:29:15  gpt-4o-mini      杈撳叆 512 / 杈撳嚭 2,048    鎴愬姛    鈹?鈹?           楼 0.0021               1,248ms                     鈹?鈹?                                                              鈹?鈹? ... 鏈€澶?50 鏉?                                             鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**姣忔潯璁板綍鐨勫睍绀烘晥鏋滐細**
- 鏃堕棿锛欻H:MM:SS 鏍煎紡锛岀伆瀛?- 妯″瀷鍚嶏細鍙偣鍑昏烦杞埌璇ユā鍨嬬殑璇︽儏椤?- Token 缁熻锛氳摑鑹叉爣璇嗚緭鍏ャ€佺豢鑹叉爣璇嗚緭鍑?- 璐圭敤锛毬?鏍煎紡锛屼繚鐣?4 浣嶅皬鏁?- 鑰楁椂锛氭绉?- **鐘舵€侀鑹?*锛?  - 鎴愬姛锛圚TTP 2xx锛夛細缁胯壊鍦嗙偣 `馃煝` + 缁胯壊"鎴愬姛"鏍囩
  - 澶辫触锛圚TTP 4xx/5xx/write锛夛細绾㈣壊鍦嗙偣 `馃敶` + 绾㈣壊"澶辫触"鏍囩锛岄檮鍔犵畝鐭け璐ュ師鍥?- **鏂拌褰曞姩鐢?*锛氶《閮ㄦ彃鍏ユ椂婊戝叆 + 娣″叆鍔ㄧ敾锛?00ms锛夛紝鑷姩鍚戜笅婊氬姩
- **鏆傚仠婊氬姩鎸夐挳**锛氱偣鍑诲垏鎹?鏆傚仠婊氬姩"/"鎭㈠婊氬姩"锛屾殏鍋滄椂鎸夐挳涓烘鑹查珮浜姸鎬?- **"娓呯┖"鎸夐挳**锛氭竻绌哄綋鍓嶉〉闈㈢殑娲诲姩鍒楄〃璁板綍锛堜笉褰卞搷鍚庣鏁版嵁锛?- **婊?50 鏉?*锛氭棫璁板綍浠庡簳閮ㄧЩ鍑猴紝涓嶄繚鐣欏巻鍙?
#### 鎶€鏈柟妗?
**鏂规 A锛堜富锛夛細WebSocket 鎺ㄩ€?*
- 鍓嶇寤虹珛 WebSocket 杩炴帴鍒?`wss://api.3cloud.dev/ws/console`
- 鐢ㄦ埛鐧诲綍鍚庡彂閫佽闃呮秷鎭細`{ type: "subscribe", channel: "user:logs:{userId}" }`
- 鍚庣姣忔璁板綍 call_logs 鍚庯紝鍙戝竷 Redis Pub/Sub锛歚publish user:logs:{userId} {activityJson}`
- WebSocket 鏈嶅姟锛坵s-router锛夎闃?Redis 棰戦亾锛屾帹閫佺粰杩炴帴鐨勫鎴风

**鏂规 B锛堥檷绾э級锛氳疆璇?*
- WebSocket 杩炴帴澶辫触鏃讹紙3 娆￠噸璇曞け璐ワ級锛岃嚜鍔ㄥ垏鎹㈠埌杞妯″紡
- 姣?5 绉掕皟鐢?`GET /api/v1/me/logs/recent?limit=20&since={lastId}`
- 鑾峰彇澧為噺璁板綍杩藉姞鍒板垪琛?- WebSocket 鎭㈠杩炴帴鍚庤嚜鍔ㄥ垏鍥炴帹閫佹ā寮?- 妯″紡鍒囨崲鏃堕潤榛樺垏鎹紝涓嶆彁绀虹敤鎴?
#### API 鎺ュ彛

```
# WebSocket 杩炴帴
wss://api.3cloud.dev/ws/console

# 瀹㈡埛绔秷鎭?{ "type": "subscribe", "channel": "user:logs:{userId}" }

# 鏈嶅姟绔帹閫?{ "type": "activity", "data": { ...ActivityItem } }

# 闄嶇骇杞
GET /api/v1/me/logs/recent?limit=20&since={lastId}

鍝嶅簲锛?{
  "activities": [
    {
      "id": "log_12345",
      "model": "deepseek-chat",
      "inputTokens": 256,
      "outputTokens": 1024,
      "cost": 0.0008,
      "status": "success",
      "errorMessage": null,
      "timestamp": "2026-07-28T21:29:32Z",
      "duration": 512
    }
  ],
  "hasMore": true
}
```

#### 鍓嶇缁勪欢 Props

```typescript
interface LiveActivityFeedProps {
  activities: ActivityItem[];
  paused: boolean;
  connectionMode: 'ws' | 'polling';
  onTogglePause: () => void;
  onClear: () => void;
  onViewDetail: (id: string) => void;
  maxItems?: number; // default 50
}

interface ActivityItem {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  status: 'success' | 'error';
  errorMessage?: string;
  timestamp: string;
  duration: number;
}
```

---

### 22.2.5 鏁版嵁瀵煎嚭

#### 鍔熻兘鎻忚堪

鐢ㄦ埛鍙皢鍦ㄥ钩鍙扮殑鐢ㄩ噺鏁版嵁锛堣皟鐢ㄦ鏁般€乀oken 娑堣€椼€佽垂鐢ㄦ槑缁嗭級瀵煎嚭涓?CSV 鎴?JSON 鏂囦欢锛岀敤浜庢湰鍦板垎鏋愩€佹姤閿€鎴栧瓨妗ｃ€?
#### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鍏ュ彛浣嶇疆锛?*
- 浠〃鐩樺彸涓婅 `[馃摜 瀵煎嚭鏁版嵁]` 鎸夐挳
- 璋冪敤鏃ュ織椤?`/console/logs` 椤堕儴宸ュ叿鏍?`[瀵煎嚭]` 鎸夐挳
- 娑堣垂缁熻椤甸《閮?`[瀵煎嚭]` 鎸夐挳
- 浜ゆ槗娴佹按/鍏呭€艰褰曢〉 `[瀵煎嚭]` 鎸夐挳

**瀵煎嚭鎶藉眽/寮圭獥锛?*
```
鈹屸攢 瀵煎嚭鐢ㄩ噺鏁版嵁 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ [脳] 鈹€鈹?鈹?                                          鈹?鈹?鏃堕棿鑼冨洿                                  鈹?鈹?鈼?浠婃棩  鈼?鏈懆  鈼?鏈湀  鈼?鑷畾涔?       鈹?鈹?鑷畾涔夛細[2026-07-01] 鑷?[2026-07-28]     鈹?鈹?                                          鈹?鈹?鏁版嵁鑼冨洿                                  鈹?鈹?鈼?鍏ㄩ儴锛堣皟鐢?+ Token + 璐圭敤锛?            鈹?鈹?鈼?浠呰皟鐢ㄧ粺璁★紙鎸夋ā鍨嬫眹鎬伙級               鈹?鈹?鈼?浠呰垂鐢ㄦ槑缁嗭紙鎸夊ぉ姹囨€伙級                 鈹?鈹?                                          鈹?鈹?瀵煎嚭鏍煎紡                                  鈹?鈹?鈼?CSV锛圗xcel 鍏煎锛? 鈼?JSON              鈹?鈹?                                          鈹?鈹?鍖呭惈鍒楋紙CSV 鍙閫夛級                      鈹?鈹?鈽?鏃堕棿  鈽?妯″瀷  鈽?渚涘簲鍟?                鈹?鈹?鈽?API Key  鈽?杈撳叆 Token  鈽?杈撳嚭 Token   鈹?鈹?鈽?璐圭敤  鈽?鐘舵€? 鈽?鑰楁椂                   鈹?鈹?                                          鈹?鈹?馃搳 棰勪及瀵煎嚭 8,532 鏉¤褰?                鈹?鈹?鈿狅笍 鍗曟鏈€澶氬鍑?100,000 鏉?               鈹?鈹?                                          鈹?鈹?[鍙栨秷]                    [鐢熸垚瀵煎嚭鏂囦欢]  鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**瀵煎嚭娴佺▼锛堢偣鍑?鐢熸垚瀵煎嚭鏂囦欢"鍚庯級锛?*
1. 鍓嶇鍙戦€?`POST /api/v1/me/stats/export`
2. 鍚庣鏍￠獙 鈫?鏌ヨ鏁版嵁搴?鈫?娴佸紡鍐欏叆鏂囦欢鍒版湇鍔＄涓存椂鐩綍
3. 鏂囦欢鐢熸垚瀹屾瘯 鈫?杩斿洖棰勭鍚嶄笅杞介摼鎺ワ紙鏈夋晥鏈?30 鍒嗛挓锛?4. 鍓嶇寮圭獥鏇存柊锛?鉁?瀵煎嚭鏂囦欢宸茬敓鎴? + `[涓嬭浇 CSV]` 鎸夐挳
5. 鐐瑰嚮"涓嬭浇"鈫?鏂囦欢鑷姩涓嬭浇锛屽脊绐楀叧闂?6. 鑻ョ敓鎴愯繃绋嬭秴杩?10 绉掞紝鍓嶇鏄剧ず杩涘害鎻愮ず"姝ｅ湪瀵煎嚭鏁版嵁锛岃绋嶅€?.."

**鏂囦欢鏍煎紡锛?*

CSV 绀轰緥锛圲TF-8 BOM锛屽吋瀹?Excel锛夛細
```csv
鏃堕棿,妯″瀷,渚涘簲鍟?API Key,杈撳叆 Token,杈撳嚭 Token,璐圭敤(CNY),鐘舵€?鑰楁椂(ms)
2026-07-28 21:29:32,deepseek-chat,DeepSeek,sk-3c-xxxx,256,1024,0.0012,鎴愬姛,512
2026-07-28 21:02:15,gpt-4o-mini,OpenAI,sk-3c-yyyy,512,2048,0.0035,鎴愬姛,1248
...
```

JSON 绀轰緥锛?```json
[
  {
    "time": "2026-07-28T21:29:32+08:00",
    "model": "deepseek-chat",
    "vendor": "DeepSeek",
    "apiKey": "sk-3c-xxxx",
    "inputTokens": 256,
    "outputTokens": 1024,
    "cost": 0.0012,
    "status": "success",
    "duration": 512
  }
]
```

#### 鏁版嵁閲忛檺鍒朵笌浣撻獙璁捐

| 鍦烘櫙 | 琛屼负 |
|------|------|
| 璁板綍鏁?鈮?10,000 | 鍗虫椂鍚屾鐢熸垚锛? 绉掑唴杩斿洖涓嬭浇閾炬帴 |
| 璁板綍鏁?10,001-50,000 | 寮傛鐢熸垚锛屾樉绀鸿繘搴︽潯锛岃繑鍥?`taskId`锛岃疆璇换鍔＄姸鎬?|
| 璁板綍鏁?50,001-100,000 | 寮傛鐢熸垚锛屾樉绀鸿繘搴︽潯 + 棰勮鍓╀綑鏃堕棿 |
| 璁板綍鏁?> 100,000 | 鍓嶇闃绘柇锛?瀵煎嚭璁板綍瓒呰繃 10 涓囨潯锛岃缂╁皬鏃堕棿鑼冨洿鎴栧垎鎵瑰鍑? |
| 瀵煎嚭浠诲姟涓柇 | 淇濈暀鐢熸垚涓€鍗婄殑鏂囦欢 鈫?涓嬫璇锋眰鍚屽弬鏁版椂澶嶇敤 |

#### API 鎺ュ彛

```
POST /api/v1/me/stats/export

璇锋眰锛?{
  "startDate": "2026-07-01",
  "endDate": "2026-07-28",
  "format": "csv",                 // "csv" | "json"
  "columns": ["time", "model", "vendor", "apiKey", "inputTokens", "outputTokens", "cost", "status", "duration"],
  "dataScope": "full",             // "full" | "summary_models" | "summary_daily"
  "apiKeyId": null                 // 鍙€夛紝鎸?Key 绛涢€?}

鍚屾鍝嶅簲锛堚墹10000鏉★級锛?{
  "status": "ready",
  "downloadUrl": "https://cdn.3cloud.dev/exports/export_abc123.csv",
  "expiresAt": "2026-07-28T22:00:00Z",
  "recordCount": 8532,
  "fileSize": 1254400              // bytes
}

寮傛鍝嶅簲锛?10000鏉★級锛?{
  "status": "processing",
  "taskId": "export_task_xyz",
  "estimatedTime": 30              // 棰勮绉掓暟
}

GET /api/v1/me/stats/export/:taskId/status     鈥?杞寮傛浠诲姟鐘舵€?鍝嶅簲锛?{
  "status": "processing" | "ready" | "failed",
  "progress": 65,                              // 0-100
  "downloadUrl": null | "https://...",         // ready 鏃惰繑鍥?  "errorMessage": null | "瀵煎嚭澶辫触锛氭煡璇㈣秴鏃?,
}
```

#### 鍓嶇缁勪欢 Props

```typescript
interface ExportDialogProps {
  open: boolean;
  defaultTimeRange?: 'today' | 'week' | 'month' | 'custom';
  maxRecords: number;            // 100000
  availableColumns: string[];
  onExport: (params: ExportParams) => void;
  onClose: () => void;
  exporting?: boolean;
  progress?: number;
  downloadUrl?: string;
}

interface ExportParams {
  startDate: string;
  endDate: string;
  format: 'csv' | 'json';
  columns: string[];
  dataScope: 'full' | 'summary_models' | 'summary_daily';
  apiKeyId?: string;
}
```

#### 鍚庣瀵煎嚭瀹炵幇姒傝

```
POST /api/v1/me/stats/export:
  1. 鏍￠獙 JWT 鈫?鎻愬彇 userId
  2. 鏍￠獙鏃堕棿鑼冨洿锛坰tartDate 鈮?endDate锛屼笉瓒呰繃 366 澶╋級
  3. 鎵ц COUNT(*) 鏌ヨ棰勪及璁板綍鏁?  4. IF count > 100000 鈫?杩斿洖 422 {"error":"EXCEED_LIMIT","limit":100000,"actual":count}
  5. IF count 鈮?10000 鈫?鍚屾娴佸紡鍐欏叆鏂囦欢锛岃繑鍥?downloadUrl
  6. ELSE 鈫?鍒涘缓寮傛浠诲姟锛屽悗鍙板啓鍏ワ紝杩斿洖 taskId
  7. 鏂囦欢鍛藉悕锛歟xport_{userId}_{timestamp}_{hash}.{csv|json}
  8. 鏂囦欢涓存椂瀛樺偍锛氭湰鍦扮鐩?/tmp/exports/锛?0 鍒嗛挓杩囨湡鑷姩娓呯悊
  9. 涓嬭浇閾炬帴锛氶绛惧悕 URL锛屾湁鏁?30 鍒嗛挓
```

---

### 22.2 Dashboard 澧炲己 鈥?杈圭晫鏉′欢

| 鍦烘櫙 | 琛屼负 |
|------|------|
| 鎴愭湰棰勬祴鈥旂敤鎴锋棤鍘嗗彶娑堣垂鏁版嵁 | 鏄剧ず"鏆傛棤瓒冲鏁版嵁棰勬祴锛屼娇鐢ㄤ竴娈垫椂闂村悗灏嗗睍绀洪娴? |
| 鎴愭湰棰勬祴鈥旀棩鍧囨秷璐逛负 楼0 | 浣欓鑰楀敖棰勬祴鏄剧ず"浣跨敤绋冲畾"锛屼笉鏄剧ず澶╂暟 |
| 鎴愭湰棰勬祴鈥旈浼拌秴杩囬绠?| 棰勭畻杩涘害鏉￠浼版鍙樼孩锛屾枃瀛楄鍛?棰勪及灏嗚秴鍑洪绠? |
| 鍛婅鈥旀棤鍛婅 | 鏄剧ず绌虹姸鎬佹彃鍥?+ "涓€鍒囨甯?馃憤" |
| 鍛婅鈥旈槇鍊兼湭瑙﹀彂 | 涓嶇敓鎴愬憡璀﹁褰?|
| 璐﹀崟鍛ㄦ湡鈥旇法鏈?| 鏈堟湯鏈€鍚庝竴澶╋紝涓嬫湡棰勪及鍙栨湀鏈渶鍚庣姸鎬?|
| 娲诲姩娴佲€擶ebSocket 鏂紑 | 闈欓粯鍒囪疆璇紝杩炰笂鍚庡垏鍥?WS |
| 娲诲姩娴佲€旀殏鏃犺皟鐢?| 鏄剧ず"绛夊緟 API 璋冪敤..."鑴夊啿鍔ㄧ敾 |
| 瀵煎嚭鈥旀湭閫夋嫨鍒?| 瀵煎嚭鎸夐挳缃伆 disabled |
| 瀵煎嚭鈥旂綉缁滀腑鏂?| 涓嬭浇澶辫触鎻愮ず"涓嬭浇澶辫触锛岃閲嶈瘯"锛屼繚鐣欐渶杩戜竴娆?taskId |
| 瀵煎嚭鈥旀枃浠惰繃鏈燂紙30min锛?| 閲嶆柊璋冪敤瀵煎嚭 API 鐢熸垚鏂版枃浠?|

### 22.2 Dashboard 澧炲己 鈥?楠屾敹鏍囧噯

| 缂栧彿 | 楠屾敹椤?| 棰勬湡缁撴灉 |
|------|--------|---------|
| AC-11 | 浠〃鐩樻樉绀烘垚鏈娴嬪崱鐗?| 鏁版嵁涓庡疄闄呮秷璐逛竴鑷达紝棰勪及閫昏緫姝ｇ‘ |
| AC-12 | 璁剧疆棰勭畻鍚庨娴嬪崱鐗囨樉绀洪绠楃嚎 | 宸茬敤/棰勪及/棰勭畻涓夋潯绾挎纭樉绀?|
| AC-13 | 浣欓鑰楀敖澶╂暟 < 7 澶?| 鏂囨湰鍙樼孩鑹查棯鐑?|
| AC-14 | 璋冨害浠诲姟瑙﹀彂 rate_spike 鍛婅 | 鍛婅鍗＄墖鍑虹幇鏂板憡璀︼紝绾㈣壊瑙掓爣鏁板瓧 +1 |
| AC-15 | 鐐瑰嚮鍛婅"宸茶" | 璇ユ潯鍛婅浠庡崱鐗囨秷澶憋紝瑙掓爣鏁?-1 |
| AC-16 | 璐﹀崟鍛ㄦ湡姒傝鏄剧ず | 宸插嚭璐﹂噾棰?+ 寰呯粨绠?+ 涓嬫湡棰勪及鏁版嵁姝ｇ‘ |
| AC-17 | 杩涜 API 璋冪敤 鈫?WebSocket 鎺ㄩ€?| 娲诲姩娴佸嵆鏃惰拷鍔犳柊璁板綍锛屽甫鍔ㄧ敾 |
| AC-18 | 鏆傚仠婊氬姩 鈫?鏂拌褰曞埌杈?| 璁板綍杩藉姞浣嗕笉婊氬姩 |
| AC-19 | WebSocket 鏂紑 | 鑷姩鍒囪疆璇紝鎭㈠鍚庡垏鍥?WS |
| AC-20 | 瀵煎嚭 CSV锛? 10000 鏉★級 | 3 绉掑唴鐢熸垚涓嬭浇閾炬帴锛屾枃浠跺彲 Excel 鎵撳紑 |
| AC-21 | 瀵煎嚭 > 100,000 鏉?| 寮圭獥鎻愮ず"缂╁皬鏃堕棿鑼冨洿" |
| AC-22 | 寮傛瀵煎嚭 30,000 鏉?| 鏄剧ず杩涘害鏉★紝瀹屾垚鍚庡彲涓嬭浇 |

---

## 22.3 鐢ㄦ埛绔?Playground锛圓PI 鍦ㄧ嚎璋冭瘯锛?
### 鍔熻兘鎻忚堪

鐢ㄦ埛绔彁渚涘湪绾?API 璋冭瘯宸ュ叿锛岀敤鎴峰湪缃戦〉涓婇€夋嫨 API Key 鈫?閫夋嫨妯″瀷 鈫?缂栧啓娑堟伅 鈫?鍙戦€佽姹?鈫?鏌ョ湅鍝嶅簲鍜岃垂鐢?鈫?涓€閿敓鎴愯皟鐢ㄤ唬鐮侊紝鏃犻渶鍐欎竴琛屼唬鐮佸嵆鍙畬鎴?API 娴嬭瘯鍜屾帴鍏ヨ瘎浼般€?
### 涓庣鐞嗗憳 Playground 鐨勫尯鍒?
| 缁村害 | 绠＄悊鍛?Playground | 鐢ㄦ埛绔?Playground |
|------|------------------|------------------|
| 閴存潈鏂瑰紡 | 鍙€?Admin Key 鎴栨寚瀹?Key | 鐢ㄦ埛鑷繁鐨?API Key |
| 閾捐矾杩借釜 `_chain` | 鍙煡鐪嬪畬鏁磋矾鐢遍摼璺?| 涓嶅彲瑙?|
| 绠＄悊绛栫暐閫夋嫨 | 鍙墜鍔ㄩ€夋嫨渚涘簲鍟?绛栫暐 | 涓嶅彲閫夛紝鑷姩璺敱 |
| 璐圭敤鏄庣粏 | 鎴愭湰浠?| 鐢ㄦ埛渚у敭浠?+ 瀹為檯鎵ｈ垂 |
| 浠ｇ爜鐢熸垚 | 鏃?| Python / JS / cURL |
| 杈撳叆 Token 闄愬埗 | 鏃犻檺鍒?| 鍗曟 鈮?4,096 Token |
| 棰戠巼闄愬埗 | 鏃?| 10 娆?鍒嗛挓锛?00 娆?澶?|
| 璋冪敤璁″叆姝ｅ父璁¤垂 | 鏄?| 鏄紙娑堣€楅搴︼紝璧版甯告墸璐癸級 |

### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鏁翠綋椤甸潰甯冨眬锛堝乏鍙充袱鏍忥級锛?*
```
鈹屸攢鈹€ 宸︿晶闈㈡澘锛堣姹傜紪杈戝櫒锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹攢鈹€ 鍙充晶闈㈡澘锛堝搷搴斿睍绀猴級 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                               鈹?                             鈹?鈹?API Key                        鈹? 鍝嶅簲鍐呭                      鈹?鈹?[馃攽 鎴戠殑绗竴涓?Key 鈻糫        鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?  鈹?鈹?                               鈹? 鈹?{                        鈹?  鈹?鈹?妯″瀷                           鈹? 鈹?  "id": "chatcmpl-xxx",  鈹?  鈹?鈹?[馃 deepseek-chat 鈻糫         鈹? 鈹?  "choices": [{          鈹?  鈹?鈹?                               鈹? 鈹?    "message": {         鈹?  鈹?鈹?璇锋眰妯″紡                       鈹? 鈹?      "role": "...",     鈹?  鈹?鈹?鈼?Chat  鈼?Embeddings  鈼?Rerank鈹? 鈹?      "content": "..."   鈹?  鈹?鈹?                               鈹? 鈹?    }                    鈹?  鈹?鈹?娑堟伅锛圡essages锛?              鈹? 鈹?  }],                    鈹?  鈹?鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?   鈹? 鈹?  "usage": {...}         鈹?  鈹?鈹?鈹?system 鈻?               鈹?   鈹? 鈹?}                        鈹?  鈹?鈹?鈹?You are a helpful      鈹?   鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?  鈹?鈹?鈹?assistant.             鈹?   鈹?                             鈹?鈹?鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?   鈹? 杈撳叆 Token:        256       鈹?鈹?鈹?user 鈻?                 鈹?   鈹? 杈撳嚭 Token:      1,024      鈹?鈹?鈹?浠€涔堟槸 AI锛?    脳     鈹?   鈹? 璐圭敤:           楼0.0012      鈹?鈹?鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?   鈹? 鑰楁椂:            512ms      鈹?鈹?鈹?[锛?娣诲姞娑堟伅]          鈹?   鈹?                             鈹?鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?   鈹? 馃搵 浠ｇ爜鐢熸垚                  鈹?鈹?                               鈹? [Python] [JS] [curl]        鈹?鈹?鍙傛暟                           鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?  鈹?鈹?Temperature: [鈹佲攣鈹佲攣鈼忊攣鈹?0.7]    鈹? 鈹?import requests      鈹?  鈹?鈹?Max Tokens:  [2048       鈻糫   鈹? 鈹?...                  鈹?  鈹?鈹?Top P:       [鈹佲攣鈹佲攣鈼忊攣鈹?1.0]    鈹? 鈹?                     鈹?  鈹?鈹?Stream:      [鈼?寮€鍚痌         鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?  鈹?鈹?                               鈹? [馃搵 澶嶅埗浠ｇ爜]              鈹?鈹?[鈻?鍙戦€佽姹俔  [馃棏 娓呯┖]       鈹?                             鈹?鈹?                               鈹?                             鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹粹攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

### 鍚勭粍浠惰缁嗘晥鏋?
**API Key 閫夋嫨鍣細**
- 涓嬫媺妗嗘樉绀虹敤鎴锋墍鏈?`active` 鐘舵€?Key
- 鏍煎紡锛欿ey 鍚嶇О + 鎺╃爜鍓嶇紑锛堝 `鎴戠殑绗竴涓?Key 鈥?sk-3c-a1b2...x9y0`锛?- 榛樿閫変腑锛氭渶杩戜竴娆″湪 Playground 浣跨敤鐨?Key锛堝瓨鍌ㄥ湪鍓嶇 localStorage `playground_last_key`锛?- 鏃?Key 鏃讹細涓嬫媺妗嗘樉绀虹伆鑹叉枃瀛?璇峰厛鍒涘缓 API Key"锛屼笅鏂瑰嚭鐜伴摼鎺ユ寜閽?`[鍓嶅線鍒涘缓 鈫抅`
- 涓嬫媺妗嗗彸渚ф湁 Key 鍒锋柊灏忔寜閽紙馃攧锛?
**妯″瀷閫夋嫨鍣細**
- 鏀寔鎼滅储锛堣緭鍏ユā鍨嬪悕杩囨护锛屽疄鏃朵笅鎷夛級
- 鍒楄〃椤规樉绀猴細渚涘簲鍟?Logo + 妯″瀷鍚?+ context 绐楀彛澶у皬
- 閫変腑鍚庢樉绀哄湪杈撳叆妗嗕腑锛氫緵搴斿晢 Logo锛?2px锛? 妯″瀷鍚?- 榛樿閫変腑锛歚deepseek-chat`锛堝鏋滃彲鐢級锛屽惁鍒欏彇绗竴涓彲鐢ㄦā鍨?
**璇锋眰妯″紡鍒囨崲锛堜笁涓?Tab锛夛細**
- Chat Completions锛氶粯璁わ紝娑堟伅缂栬緫鍣ㄥ彲瑙?- Embeddings锛氭秷鎭紪杈戝櫒鏇挎崲涓哄崟琛屾枃鏈緭鍏ユ + "杈撳叆鏂囨湰"
- Rerank锛氭樉绀?Query + Documents 缂栬緫鍣?
**娑堟伅缂栬緫鍣紙Chat 妯″紡锛夛細**
- 姣忔潯娑堟伅涓虹嫭绔嬪崱鐗囷紝鍙姌鍙?灞曞紑
- Role 閫夋嫨鍣細`system` / `user` / `assistant`锛屽僵鑹叉爣绛惧尯鍒嗭紙绱壊/钃濊壊/缁胯壊锛?- 榛樿棰勮锛? 鏉?system 娑堟伅锛堝唴瀹?"You are a helpful assistant."锛? 1 鏉?user 娑堟伅锛堢┖锛宲laceholder "杈撳叆鎮ㄧ殑闂..."锛?- 姣忔潯娑堟伅鍙充笂瑙?`脳` 鎸夐挳鍒犻櫎璇ユ潯
- 鐐瑰嚮 `[+ 娣诲姞娑堟伅]`锛氬湪褰撳墠鏈€鍚庝竴鏉′笅鏂规彃鍏ユ柊鐨?user 瑙掕壊娑堟伅
- 蹇嵎閿?Ctrl+Enter 鈫?鍙戦€佽姹?
**鍙傛暟闈㈡澘锛?*
- Temperature锛氳寖鍥存粦鍧?0-2锛宻tep 0.1锛岄粯璁?0.7锛屽彸渚ф暟瀛楄緭鍏ユ
- Max Tokens锛氫笅鎷夐€夋嫨 128/256/512/1024/2048/4096锛屾垨鑷畾涔夎緭鍏ワ紝榛樿 2048
- Top P锛氳寖鍥存粦鍧?0-1锛宻tep 0.05锛岄粯璁?1.0
- Stream锛堝紑鍏筹級锛氶粯璁ゅ叧闂?
**鍙戦€佽姹傛寜閽涓猴細**
- 鐘舵€侊細
  - 榛樿锛氳摑鑹?`[鈻?鍙戦€佽姹俔`
  - 鍙戦€佷腑锛氱伆鑹?`[鈼?璇锋眰涓?..]` + 鏃嬭浆 spinner锛屾寜閽?disabled
  - 娴佸紡鍙戦€佷腑锛氳剦鍔?`[鈼?Streaming...]`
  - 娴佸紡缁撴潫锛氭仮澶嶈摑鑹?- 鍙戦€佸墠鏍￠獙锛?  - 鑷冲皯 1 鏉?user 娑堟伅
  - user 娑堟伅涓嶈兘涓虹┖
  - Token 鏁帮紙绮楃暐浼扮畻锛夆墹 4,096 鈫?寮瑰嚭纭妗嗭細"杈撳叆 Token 绾?XXX锛岀‘瀹氬彂閫侊紵" 涓嶉樆鏂?  - Token 鏁?> 4,096 鈫?闃绘柇锛?杈撳叆 Token 绾?XXX锛岃秴杩?4,096 闄愬埗锛岃缂╃煭娑堟伅"

**鍝嶅簲灞曠ず锛堝彸渚ч潰鏉匡級锛?*
- **闈炴祦寮忓搷搴?*锛?  - 鍔犺浇鐘舵€侊細楠ㄦ灦灞忛棯鐑?  - 瀹屾垚鍚庯細鏍煎紡鍖栫殑 JSON 灞曠ず锛堣娉曢珮浜紝鍙姌鍙犺妭鐐癸級锛屼娇鐢ㄤ唬鐮侀珮浜粍浠?  - 搴曢儴缁熻鏍忥細杈撳叆 Token 鏁般€佽緭鍑?Token 鏁般€佽垂鐢紙楼0.XXXX锛夈€佽€楁椂锛坢s锛?  - 缁熻鏍忛鑹诧細鎴愬姛缁垮簳 / 澶辫触绾㈠簳
- **娴佸紡鍝嶅簲**锛?  - 瀹炴椂閫愬瓧杩藉姞鍐呭锛堟墦瀛楁満鏁堟灉锛夛紝鍏夋爣闂儊
  - 娴佸紡缁撴潫鍚庢樉绀哄畬鏁村唴瀹?+ 缁熻
  - Stream 妯″紡涓嬬敤鎴峰彲鐐瑰嚮"鍋滄鐢熸垚"鎸夐挳涓柇
- **澶辫触鍝嶅簲**锛?  - 绾㈣壊鑳屾櫙鍖烘樉绀猴細
    ```
    鉂?璇锋眰澶辫触

    閿欒绫诲瀷锛歳ate_limit_exceeded
    閿欒淇℃伅锛氭瘡鍒嗛挓璋冭瘯璇锋眰涓嶈秴杩?10 娆★紝璇风◢鍚庡啀璇?    瑙ｅ喅鏂规锛氱瓑寰?1 鍒嗛挓鍚庨噸璇曪紝鎴栧墠寰€鏂囨。鏌ョ湅 API 鐩存帴璋冪敤鏂瑰紡
    ```
  - 閿欒鐮佹槧灏勫埌鍙嬪ソ鏂囨锛?    | 閿欒鐮?| 鍙嬪ソ鏂囨 | 瑙ｅ喅鏂规 |
    |--------|---------|---------|
    | `rate_limit_exceeded` | 璇锋眰棰戠巼杩囬珮 | 绛夊緟鍚庨噸璇?|
    | `insufficient_balance` | 浣欓涓嶈冻 | 鍓嶅線鍏呭€?|
    | `key_disabled` | API Key 宸茬鐢?| 鍚敤 Key 鎴栧垱寤烘柊 Key |
    | `model_unavailable` | 妯″瀷鏆備笉鍙敤 | 閫夋嫨鍏朵粬鍙敤妯″瀷 |
    | `timeout` | 璇锋眰瓒呮椂锛?0 绉掞級 | 缂╃煭娑堟伅鎴栭檷浣?max_tokens |
    | `server_error` | 鏈嶅姟寮傚父 | 绋嶅悗閲嶈瘯锛屽凡閫氱煡鎶€鏈洟闃?|
    | `input_too_long` | 杈撳叆瓒呭嚭闄愬埗 | 缂╃煭娑堟伅鍐呭 |

**浠ｇ爜鐢熸垚鍣細**
- 涓変釜璇█ Tab锛歚[Python]` `[JavaScript]` `[cURL]`
- 鍒囨崲 Tab 鈫?浠ｇ爜鍐呭鏇存柊
- 鐢熸垚鐨勪唬鐮佸熀浜庡綋鍓嶈姹傚弬鏁帮細
  - API URL 鍥哄畾 `https://api.3cloud.dev/v1/chat/completions`
  - 璁よ瘉澶村寘鍚綋鍓嶉€変腑鐨勫畬鏁?API Key锛堥娆″睍绀猴紝鍚庣画鍙敤鎺╃爜锛?  - 璇锋眰浣撳寘鍚綋鍓?messages 鍜?parameters
- 浠ｇ爜鍖哄煙锛氭繁鑹茶儗鏅紙`#1e1e1e`锛夛紝璇硶楂樹寒锛岀瓑瀹藉瓧浣?- `[馃搵 澶嶅埗浠ｇ爜]` 鎸夐挳锛氱偣鍑诲鍒?鈫?Toast 寮瑰嚭"鉁?宸插鍒跺埌鍓创鏉?锛? 绉掓秷澶憋級
- 澶嶅埗浣跨敤 `navigator.clipboard.writeText()`

### 涓婁笅娓稿叧绯?
```
涓婃父锛?  api_keys 琛?鈫?鐢ㄦ埛 Key 鍒楄〃
  models + vendor_models 琛?鈫?妯″瀷鍒楄〃
  鐢ㄦ埛杈撳叆 鈫?messages + parameters
涓嬫父锛?  璺敱寮曟搸 鈫?鍙戦€佸埌渚涘簲鍟?API 鈫?杩斿洖鍝嶅簲
  call_logs 琛?鈫?璁板綍璋冪敤
  consumption_logs 琛?鈫?璁板綍鎵ｈ垂
  璁¤垂寮曟搸 鈫?瀹炴椂鎵ｆ
```

### API 鎺ュ彛

```
# 澶嶇敤绠＄悊鍛?Playground API锛堥壌鏉冧负褰撳墠鐢ㄦ埛 JWT + 鎸囧畾 apiKeyId锛?POST /api/v1/playground/chat/completions
  璇锋眰澶达細Authorization: Bearer {userJwt}
  璇锋眰浣擄細
  {
    "apiKeyId": 123,            // 鐢ㄦ埛閫変腑鐨?Key ID
    "model": "deepseek-chat",
    "messages": [...],
    "temperature": 0.7,
    "max_tokens": 2048,
    "top_p": 1.0,
    "stream": false
  }
  鍝嶅簲锛氭爣鍑?OpenAI Chat Completions 鏍煎紡 + 璐圭敤/鑰楁椂鎵╁睍瀛楁

POST /api/v1/playground/embeddings
  { "apiKeyId": 123, "model": "text-embedding-3-small", "input": "Hello" }

POST /api/v1/playground/rerank
  { "apiKeyId": 123, "model": "bge-reranker-v2-m3", "query": "test", "documents": [...] }

GET  /api/v1/playground/models
  鍝嶅簲锛氬彲鐢ㄦā鍨嬪垪琛?```

### 鍓嶇缁勪欢 Props

```typescript
// UserPlayground 鈥?椤甸潰瀹瑰櫒
interface UserPlaygroundProps {
  apiKeys: ApiKey[];
  models: Model[];
  defaultKey?: string;
  defaultModel?: string;
}

// RequestEditor 鈥?宸︿晶璇锋眰缂栬緫闈㈡澘
interface RequestEditorProps {
  selectedKey: string;              // apiKeyId
  selectedModel: string;            // model slug
  requestMode: 'chat' | 'embedding' | 'rerank';
  messages: ChatMessage[];          // Chat 妯″紡
  textInput: string;                // Embedding 妯″紡
  queryInput: string;               // Rerank 妯″紡
  documentInputs: string[];         // Rerank 妯″紡
  parameters: RequestParameters;
  onKeyChange: (keyId: string) => void;
  onModelChange: (model: string) => void;
  onModeChange: (mode: string) => void;
  onMessagesChange: (messages: ChatMessage[]) => void;
  onParametersChange: (params: RequestParameters) => void;
  onSend: () => void;
  onClear: () => void;
  loading: boolean;
  validationErrors: string[];
}

interface ChatMessage {
  id: string;             // 鍓嶇鐢熸垚鐨勫敮涓€ID
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface RequestParameters {
  temperature: number;    // 0-2, default 0.7
  maxTokens: number;      // 1-4096, default 2048
  topP: number;           // 0-1, default 1.0
  stream: boolean;        // default false
}

// ResponseViewer 鈥?鍙充晶鍝嶅簲灞曠ず闈㈡澘
interface ResponseViewerProps {
  response: PlaygroundResponse | null;
  error: PlaygroundError | null;
  isStreaming: boolean;
  streamContent: string;
  stats: ResponseStats | null;
}

interface PlaygroundResponse {
  id: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

interface PlaygroundError {
  code: string;
  message: string;
  friendlyMessage: string;
  solution: string;
}

interface ResponseStats {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  duration: number;
}

// CodeGenerator 鈥?浠ｇ爜鐢熸垚鍣?interface CodeGeneratorProps {
  apiKey: string;                  // 瀹為檯闇€瑕佸睍绀虹殑瀹屾暣 Key
  model: string;
  messages: ChatMessage[];
  parameters: RequestParameters;
  language: 'python' | 'javascript' | 'curl';
  onLanguageChange: (lang: string) => void;
}
```

### 杈圭晫鏉′欢

| 鍦烘櫙 | 琛屼负 |
|------|------|
| 鏃犲彲鐢?API Key | 涓嬫媺妗嗘樉绀?璇峰厛鍒涘缓 API Key"锛屾彁渚涜烦杞摼鎺?|
| 鏃犲彲鐢ㄦā鍨?| 妯″瀷閫夋嫨鍣ㄦ樉绀?鏆傛棤鍙敤妯″瀷"锛屼絾淇濈暀鐣岄潰 |
| 杈撳叆 Token > 4,096 | 闃绘柇鍙戦€侊紝鏄剧ず绾㈣壊鎻愮ず"杈撳叆 Token 棰勪及 XXX锛岃秴杩?4,096 闄愬埗" |
| 姣忓垎閽?> 10 娆?| 杩斿洖 429 rate_limit_exceeded |
| 姣忔棩 > 100 娆?| 杩斿洖 429锛屾彁绀?浠婃棩璋冭瘯娆℃暟宸茬敤瀹岋紝鏄庡ぉ鍐嶆潵鍚? |
| 璇锋眰瓒呮椂锛?0 绉掞級 | 鏄剧ず瓒呮椂閿欒 + 寤鸿缂╃煭娑堟伅 |
| 娴佸紡璇锋眰涓柇 | 鏄剧ず宸叉帴鏀跺唴瀹?+ 璀﹀憡"娴佸紡杈撳嚭涓柇" |
| 椤甸潰鍏抽棴/鍒锋柊 | 涓嶆竻绌烘湰鍦扮紦瀛樼殑閫変腑 Key 鍜屾ā鍨?|

### 楠屾敹鏍囧噯

| 缂栧彿 | 楠屾敹椤?| 棰勬湡缁撴灉 |
|------|--------|---------|
| AC-23 | 鐢ㄦ埛閫夋嫨 Key 鈫?閫夋嫨妯″瀷 鈫?杈撳叆娑堟伅 鈫?鍙戦€?| 鍙充晶鏄剧ず鏍煎紡鍖栧搷搴?+ Token 缁熻 + 璐圭敤 |
| AC-24 | Stream 妯″紡鍙戦€?| 閫愬瓧杩藉姞杈撳嚭锛屾墦瀛楁満鏁堟灉 |
| AC-25 | 璇锋眰澶辫触锛堜綑棰濅笉瓒筹級 | 绾㈣壊鑳屾櫙鏄剧ず閿欒鐮?+ 鍙嬪ソ鏂囨 + 瑙ｅ喅鏂规 |
| AC-26 | 浠ｇ爜鐢熸垚 鈫?鍒囨崲鍒?Python | 浠ｇ爜鍐呭鏇存柊涓?Python SDK 璋冪敤 |
| AC-27 | 鐐瑰嚮"澶嶅埗浠ｇ爜" | Toast "宸插鍒跺埌鍓创鏉?锛岀矘璐村悗浠ｇ爜姝ｇ‘ |
| AC-28 | 鏃?API Key 鐢ㄦ埛杩涘叆 | 涓嬫媺妗嗘彁绀?璇峰厛鍒涘缓 API Key" |
| AC-29 | 1 鍒嗛挓鍐呭彂閫佺 11 娆¤姹?| 杩斿洖 rate_limit_exceeded锛屾樉绀烘彁绀?|
| AC-30 | 杈撳叆瓒呴暱 Token锛? 4,096锛?| 闃绘柇鍙戦€侊紝绾㈣壊鎻愮ず |
| AC-31 | 娣诲姞/鍒犻櫎娑堟伅 | 鐣岄潰鍗虫椂鏇存柊锛屾秷鎭簭鍙烽噸鏂扮紪鎺?|

---

## 22.4 鐢ㄦ埛绔?Webhook 閰嶇疆

### 鍔熻兘鎻忚堪

鐢ㄦ埛鍙厤缃?Webhook 鍥炶皟鍦板潃锛屽綋鐗瑰畾涓氬姟浜嬩欢鍙戠敓鏃讹紙浣欓涓嶈冻銆侀绠楄秴闄愩€佸紓甯哥櫥褰曘€佽皟鐢ㄩ噺绐佸绛夛級锛屽钩鍙颁富鍔ㄦ帹閫侀€氱煡鍒扮敤鎴锋寚瀹氱殑 URL锛屽疄鐜拌嚜鍔ㄥ寲鐩戞帶鍜屽憡璀﹂泦鎴愩€?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鍏ュ彛锛?* 鎺у埗鍙颁晶杈规爮 `/console/webhooks`

**Webhook 鍒楄〃椤碉細**
```
鈹屸攢 Webhook 閰嶇疆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ [+ 鏂板缓 Webhook] 鈹€鈹€鈹?鈹?                                                      鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹? 鈹?鐢熶骇鐜鍛婅              [鍚敤]           ...   鈹? 鈹?鈹? 鈹?https://myapp.com/api/3cloud-webhook           鈹? 鈹?鈹? 鈹?浜嬩欢锛氫綑棰濅笉瓒炽€侀绠楄秴闄愩€佽皟鐢ㄥけ璐ョ巼             鈹? 鈹?鈹? 鈹?鏈€杩戞帹閫侊細4灏忔椂鍓?鉁?鎴愬姛                     鈹? 鈹?鈹? 鈹?瀵嗛挜锛?c_wh_sec_xxxxxxxx    [鏄剧ず] [閲嶆柊鐢熸垚]   鈹? 鈹?鈹? 鈹?[娴嬭瘯] [缂栬緫] [鍒犻櫎]          [鏌ョ湅鏃ュ織 鈫抅     鈹? 鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹?                                                      鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹? 鈹?寮€鍙戠幆澧冪洃鎺?             [宸茬鐢?鈿狅笍]    ...   鈹? 鈹?鈹? 鈹?http://localhost:3000/webhook                  鈹? 鈹?鈹? 鈹?杩炵画 10 娆℃帹閫佸け璐ワ紝宸茶嚜鍔ㄧ鐢?                  鈹? 鈹?鈹? 鈹?浜嬩欢锛氳皟鐢ㄩ噺绐佸銆佸紓甯哥櫥褰?                      鈹? 鈹?鈹? 鈹?[娴嬭瘯] [缂栬緫] [鍒犻櫎] [閲嶆柊鍚敤]                  鈹? 鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**鍒涘缓/缂栬緫 Webhook 琛ㄥ崟锛堟娊灞夊脊绐楋級锛?*
```
鈹屸攢 鏂板缓 Webhook 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ [脳] 鈹€鈹?鈹?                                                  鈹?鈹? 鍥炶皟 URL *                                       鈹?鈹? [https://myapp.com/api/webhook        ]         鈹?鈹? 鈿狅笍 蹇呴』浣跨敤 HTTPS                            鈹?鈹?                                                  鈹?鈹? 璁㈤槄浜嬩欢 *                                       鈹?鈹? 鈽?浣欓涓嶈冻锛坆alance.low锛?                闃堝€硷細楼 [10.00]
鈹? 鈽?棰勭畻瓒呴檺锛坆udget.exceeded锛?                    鈹?鈹? 鈽?API Key 鍗冲皢杩囨湡锛坘ey.expired锛?                鈹?鈹? 鈽?璋冪敤閲忕獊澧烇紙key.usage_spike锛?            鍊嶆暟锛歔3]脳
鈹? 鈽?寮傚父鐧诲綍锛坅ccount.login_anomaly锛?              鈹?鈹? 鈽?璋冪敤澶辫触鐜囧憡璀︼紙call.failure_rate锛?    闃堝€硷細[5]%
鈹?                                                  鈹?鈹? 瀵嗛挜                                              鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?        鈹?鈹? 鈹?3c_wh_sec_a1b2c3d4e5f6g7h8i9j0k1l2  鈹?[馃搵]    鈹?鈹? 鈹?鈩癸笍 鐢ㄤ簬楠岃瘉鎺ㄩ€佺鍚嶏紝璇蜂繚绠″ソ            鈹?[馃攧]    鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?        鈹?鈹?                                                  鈹?鈹? [鍙栨秷]                           [淇濆瓨 Webhook]  鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

### 浜嬩欢绫诲瀷璇﹁В

| 浜嬩欢绫诲瀷 | 浜嬩欢鍚?| 瑙﹀彂鏉′欢 | 榛樿闃堝€?| 鎺ㄩ€侀鐜囬檺鍒?|
|---------|--------|---------|---------|------------|
| 浣欓涓嶈冻 | `balance.low` | 瀹炴椂娑堣垂缁撶畻鍚庝綑棰?< 鐢ㄦ埛璁惧畾闃堝€?| 楼10.00 | 姣?1 灏忔椂 1 娆?|
| 棰勭畻瓒呴檺 | `budget.exceeded` | 鏈堟秷璐硅揪鍒伴绠楃殑 90% 鍜?100% | - | 姣忕骇 1 娆?鍛ㄦ湡 |
| Key 鍗冲皢杩囨湡 | `key.expired` | Key 鍒版湡鏃堕棿 < 7 澶?| - | 姣忔棩 1 娆?Key |
| 璋冪敤閲忕獊澧?| `key.usage_spike` | 1 灏忔椂璋冪敤閲?> 3脳鏃ュ潎灏忔椂璋冪敤閲?| 3 鍊?| 姣?30 鍒嗛挓 1 娆?|
| 寮傚父鐧诲綍 | `account.login_anomaly` | 鐧诲綍 IP 褰掑睘鍦颁笌涓婃涓嶅悓 + 璺濈 > 500km | - | 姣忔瑙﹀彂閮芥帹閫?|
| 璋冪敤澶辫触鐜囧憡璀?| `call.failure_rate` | 杩?1 灏忔椂璋冪敤澶辫触鐜?> 5% | 5% | 姣?30 鍒嗛挓 1 娆?|

### 鎺ㄩ€佹牸寮忎笌绛惧悕

**HTTP 璇锋眰鏍煎紡锛?*
```
POST {webhook_url}
Content-Type: application/json
User-Agent: 3Cloud-Webhook/1.0
X-3Cloud-Event: balance.low
X-3Cloud-Signature: sha256=abc123def456...
X-3Cloud-Delivery: del_xxxxxxxx
X-3Cloud-Timestamp: 2026-07-28T12:00:00Z
```

**璇锋眰浣撶ず渚嬶細**
```json
{
  "event": "balance.low",
  "deliveryId": "del_xxxxxxxx",
  "timestamp": "2026-07-28T12:00:00Z",
  "data": {
    "userId": 123,
    "userEmail": "user@example.com",
    "balance": 8.50,
    "threshold": 10.00,
    "currency": "CNY",
    "estimatedRunoutDays": 3,
    "suggestedAction": "recharge"
  }
}
```

**绛惧悕鐢熸垚閫昏緫锛?*
```typescript
// 瀵硅姹備綋璁＄畻 HMAC-SHA256 绛惧悕
const payload = JSON.stringify(requestBody);
const signature = crypto.createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');
// 鏀惧叆璇锋眰澶?headers['X-3Cloud-Signature'] = `sha256=${signature}`;
```

**绛惧悕楠岃瘉锛堢敤鎴蜂晶寤鸿锛夛細**
```python
import hmac, hashlib

def verify_signature(payload: str, signature: str, secret: str) -> bool:
    expected = f"sha256={hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()}"
    return hmac.compare_digest(expected, signature)
```

### 閲嶈瘯绛栫暐

```
绗竴娆℃帹閫佸け璐?鈫?绛夊緟 5 绉?鈫?閲嶈瘯 1
绗簩娆℃帹閫佸け璐?鈫?绛夊緟 30 绉?鈫?閲嶈瘯 2
绗笁娆℃帹閫佸け璐?鈫?绛夊緟 5 鍒嗛挓 鈫?閲嶈瘯 3
绗笁娆′粛澶辫触 鈫?鏍囪涓烘渶缁堝け璐?
杩炵画澶辫触璁℃暟锛氳窡韪渶杩?10 娆℃帹閫佺殑鎴愬姛鐜?杩炵画 10 娆″叏閮ㄥけ璐?鈫?鑷姩绂佺敤 Webhook 鈫?鍙戦€佺珯鍐呴€氱煡 + 閭欢閫氱煡鐢ㄦ埛
```

**绂佺敤閫氱煡妯℃澘锛?*
```
馃摟 閭欢鏍囬锛歔3Cloud] Webhook 宸茶嚜鍔ㄧ鐢?
鎮ㄧ殑 Webhook "鐢熶骇鐜鍛婅"锛坔ttps://myapp.com/api/3cloud-webhook锛?鍥犺繛缁?10 娆℃帹閫佸け璐ワ紝宸茶鑷姩绂佺敤銆?
鏈€鍚庝竴娆″け璐ュ師鍥狅細Connection timeout (10s)
澶辫触鏃堕棿锛?026-07-28 14:35:00

璇锋鏌ユ偍鐨勬湇鍔″櫒鏄惁鍙闂紝淇鍚庡彲鍦ㄦ帶鍒跺彴閲嶆柊鍚敤銆?鈫?鍓嶅線鎺у埗鍙帮細https://3cloud.dev/console/webhooks
```

### 鎶曢€掓棩蹇?
**鏃ュ織鍒楄〃椤碉紙鐐瑰嚮 Webhook 鍗＄墖"鏌ョ湅鏃ュ織"杩涘叆锛夛細**
```
鈹屸攢 Webhook 鎶曢€掓棩蹇?鈥?鐢熶骇鐜鍛婅 鈹€鈹€鈹€鈹€鈹€ [绛涢€塢 鈹€鈹€鈹?鈹?                                                   鈹?鈹?2026-07-28 14:35:00  balance.low  鉂?澶辫触         鈹?鈹?  鐘舵€佺爜锛?--  鑰楁椂锛?0,023ms  鍘熷洜锛歍imeout      鈹?鈹?  [灞曞紑璇︽儏]                                       鈹?鈹?                                                   鈹?鈹?2026-07-28 13:30:00  balance.low  鉁?鎴愬姛         鈹?鈹?  鐘舵€佺爜锛?00  鑰楁椂锛?42ms                         鈹?鈹?  [灞曞紑璇︽儏]                                       鈹?鈹?                                                   鈹?鈹?2026-07-28 12:00:00  call.failure_rate  鉁?鎴愬姛   鈹?鈹?  鐘舵€佺爜锛?00  鑰楁椂锛?85ms                         鈹?鈹?  [灞曞紑璇︽儏]                                       鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

鐐瑰嚮"灞曞紑璇︽儏"鍚庢樉绀猴細
- 璇锋眰 URL
- 璇锋眰澶达紙瀹屾暣锛屽彲澶嶅埗锛?- 璇锋眰浣擄紙JSON 鏍煎紡鍖栧睍绀猴級
- 鍝嶅簲鐘舵€佺爜
- 鍝嶅簲浣?- 鑰楁椂

### 鏁版嵁琛ㄧ粨鏋?
```typescript
// user_webhooks 鈥?Webhook 閰嶇疆
export const userWebhooks = pgTable("user_webhooks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),          // Webhook 鍚嶇О
  url: varchar("url", { length: 500 }).notNull(),
  secret: varchar("secret", { length: 100 }).notNull(),      // HMAC 瀵嗛挜
  events: jsonb("events").notNull(),                         // ["balance.low", "budget.exceeded"]
  balanceThreshold: integer("balance_threshold"),             // 浣欓涓嶈冻闃堝€硷紝榛樿 10
  usageSpikeMultiplier: integer("usage_spike_multiplier"),   // 璋冪敤閲忕獊澧炲€嶆暟锛岄粯璁?3
  failureRateThreshold: integer("failure_rate_threshold"),   // 澶辫触鐜囬槇鍊硷紝榛樿 5
  enabled: boolean("enabled").default(true),
  consecutiveFailures: integer("consecutive_failures").default(0),
  lastSentAt: timestamp("last_sent_at"),
  lastStatus: varchar("last_status", { length: 20 }),        // 'success' | 'failed'
  lastResponseCode: integer("last_response_code"),
  lastFailedReason: varchar("last_failed_reason", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdEnabledIdx: index("idx_webhooks_user_enabled").on(table.userId, table.enabled),
}));

// webhook_delivery_logs 鈥?鎶曢€掓棩蹇?export const webhookDeliveryLogs = pgTable("webhook_delivery_logs", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull().references(() => userWebhooks.id),
  deliveryId: varchar("delivery_id", { length: 50 }).notNull(),  // 鍞竴鎶曢€扞D
  event: varchar("event", { length: 50 }).notNull(),
  requestUrl: varchar("request_url", { length: 500 }),
  requestHeaders: jsonb("request_headers"),
  requestBody: text("request_body"),
  responseCode: integer("response_code"),
  responseBody: text("response_body"),
  duration: integer("duration"),          // ms
  attempt: integer("attempt").default(1), // 绗嚑娆￠噸璇?  status: varchar("status", { length: 20 }).notNull(),  // 'success' | 'failed' | 'timeout'
  attemptedAt: timestamp("attempted_at").defaultNow(),
}, (table) => ({
  webhookIdIdx: index("idx_delivery_webhook").on(table.webhookId),
  deliveryIdIdx: index("idx_delivery_id").on(table.deliveryId),
}));

// user_webhook_events_log (涓棿琛? 鈥?璁板綍鍝簺浜嬩欢琚帹閫佺粰鍝簺 webhook锛岀敤浜庨鐜囨帶鍒跺拰鍘婚噸
export const userWebhookEventsLog = pgTable("user_webhook_events_log", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id").notNull().references(() => userWebhooks.id),
  event: varchar("event", { length: 50 }).notNull(),
  userId: integer("user_id").notNull(),
  triggeredAt: timestamp("triggered_at").defaultNow(),
}, (table) => ({
  dedupIdx: index("idx_webhook_dedup").on(table.webhookId, table.event, table.triggeredAt),
}));
```

### API 鎺ュ彛

```
GET    /api/v1/me/webhooks                        鈥?Webhook 鍒楄〃
  鍝嶅簲锛歿 webhooks: Webhook[], total: number }

POST   /api/v1/me/webhooks                        鈥?鍒涘缓 Webhook
  璇锋眰锛歿 name, url, events[], balanceThreshold?, usageSpikeMultiplier?, failureRateThreshold? }
  鍝嶅簲锛歿 webhook: Webhook, secret: string }     // 杩斿洖鑷姩鐢熸垚鐨?secret

PUT    /api/v1/me/webhooks/:id                    鈥?鏇存柊 Webhook
  璇锋眰锛歿 name?, url?, events?..., enabled? }
  鍝嶅簲锛歿 webhook: Webhook }

DELETE /api/v1/me/webhooks/:id                    鈥?鍒犻櫎 Webhook
  鍝嶅簲锛歿 success: true }

POST   /api/v1/me/webhooks/:id/regenerate-secret  鈥?閲嶆柊鐢熸垚瀵嗛挜
  鍝嶅簲锛歿 secret: string }

POST   /api/v1/me/webhooks/:id/test               鈥?鍙戦€佹祴璇曚簨浠?  璇锋眰锛歿 event?: string }  // 榛樿 balance.low
  鍝嶅簲锛歿 success: true, deliveryId: string }

GET    /api/v1/me/webhooks/:id/logs               鈥?鎶曢€掓棩蹇?  鍙傛暟锛歭imit, offset, event?, status?
  鍝嶅簲锛歿 logs: DeliveryLog[], total: number }

GET    /api/v1/me/webhooks/:id/logs/:deliveryId   鈥?鎶曢€掓棩蹇楄鎯?  鍝嶅簲锛歿 log: DeliveryLog }
```

### 鍓嶇缁勪欢

| 缁勪欢 | 璺緞 | 璇存槑 |
|------|------|------|
| `WebhookList.tsx` | `/console/webhooks` | Webhook 閰嶇疆鍒楄〃椤?|
| `WebhookForm.tsx` | 寮圭獥/鎶藉眽 | 鍒涘缓/缂栬緫 Webhook 琛ㄥ崟 |
| `WebhookCard.tsx` | 宓屽叆鍦?WebhookList 涓?| 鍗曚釜 Webhook 鍗＄墖 |
| `WebhookTestButton.tsx` | 宓屽叆鍦?WebhookCard 涓?| 娴嬭瘯鎸夐挳锛堝惈缁撴灉鎻愮ず锛?|
| `WebhookLogs.tsx` | `/console/webhooks/:id/logs` | 鎶曢€掓棩蹇楀垪琛?|
| `WebhookLogDetail.tsx` | 寮圭獥 | 鍗曟潯鎶曢€掓棩蹇楄鎯?|

### 杈圭晫鏉′欢

| 鍦烘櫙 | 琛屼负 |
|------|------|
| URL 闈?HTTPS | 鍓嶇鏍￠獙锛屾彁浜ゆ寜閽?disabled锛屾彁绀?璇蜂娇鐢?HTTPS 鍦板潃" |
| URL 涓虹┖ | 琛ㄥ崟鏍￠獙鎻愮ず"璇疯緭鍏ュ洖璋?URL" |
| 鏈€夋嫨浠讳綍浜嬩欢 | 淇濆瓨鎸夐挳 disabled锛屾彁绀?璇疯嚦灏戦€夋嫨涓€涓闃呬簨浠? |
| 鎺ㄩ€佽秴鏃讹紙10 绉掞級 | 璁板綍 timeout锛岃繘鍏ラ噸璇曟祦绋?|
| 鎺ㄩ€佸悗鐩爣杩斿洖闈?2xx | 璁板綍 failed + 鍝嶅簲鐘舵€佺爜锛岃繘鍏ラ噸璇?|
| 杩炵画 10 娆″け璐?| 鑷姩绂佺敤 鈫?鍙戦€佺珯鍐呴€氱煡 + 閭欢閫氱煡 |
| 鍚屼竴浜嬩欢 1 鍒嗛挓鍐呴噸澶嶈Е鍙?| 涓嶆帹閫佺浜屾锛堝幓閲嶄繚鎶わ級 |
| Secret 閲嶆柊鐢熸垚 | 鏃?Secret 绔嬪嵆澶辨晥锛屾墍鏈夌瓑寰呯鍚嶇殑鎺ㄩ€佹敼鐢ㄦ柊 Secret |
| 娴嬭瘯浜嬩欢鎺ㄩ€?| 涓嶈蛋棰戠巼闄愬埗锛屽疄鏃跺彂閫侊紱澶辫触涓嶈鍏ヨ繛缁け璐ヨ鏁?|
| 鐢ㄦ埛鍒犻櫎 Webhook | 鍏宠仈鎶曢€掓棩蹇椾繚鐣?30 澶╋紝涔嬪悗娓呯悊 |
| 鐢ㄦ埛姣忓ぉ鏈€澶氬垱寤?Webhook | 20 涓?|

### 楠屾敹鏍囧噯

| 缂栧彿 | 楠屾敹椤?| 棰勬湡缁撴灉 |
|------|--------|---------|
| AC-32 | 鍒涘缓 Webhook 閰嶇疆 | 淇濆瓨鎴愬姛锛屽垪琛ㄥ嚭鐜版柊鍗＄墖 |
| AC-33 | 杈撳叆闈?HTTPS URL 鈫?鎻愪氦 | 鍓嶇闃绘柇锛岀孩鑹叉彁绀?璇蜂娇鐢?HTTPS" |
| AC-34 | 浣欓浣庝簬闃堝€?鈫?瑙﹀彂 balance.low | 鎺ㄩ€佸埌鐩爣 URL锛孹-3Cloud-Signature 姝ｇ‘ |
| AC-35 | 鐢ㄦ埛绔獙璇佺鍚?| HMAC-SHA256 楠岃瘉閫氳繃 |
| AC-36 | 鎺ㄩ€佺 1 娆″け璐?| 5 绉掑悗閲嶈瘯 鈫?30 绉掑悗閲嶈瘯 鈫?5 鍒嗛挓鍚庨噸璇?|
| AC-37 | 杩炵画 10 娆℃帹閫佸け璐?| Webhook 鑷姩绂佺敤锛岀敤鎴锋敹鍒伴€氱煡 |
| AC-38 | 鐐瑰嚮"鍙戦€佹祴璇? | 娴嬭瘯浜嬩欢鍙戦€佸埌 URL锛岄〉闈㈠睍绀虹粨鏋?|
| AC-39 | 鏌ョ湅鎶曢€掓棩蹇?| 鏃ュ織鍒楄〃鏄剧ず姣忔潯鎺ㄩ€佺姸鎬併€佽€楁椂銆佸搷搴旂爜 |
| AC-40 | 灞曞紑鎶曢€掕鎯?| 鏄剧ず瀹屾暣璇锋眰澶村拰鍝嶅簲浣?|

---

## 22.5 绀句氦濯掍綋 / 绗笁鏂?OAuth 鐧诲綍

### 鍔熻兘鎻忚堪

鏀寔寰俊鎵爜鐧诲綍銆丟itHub OAuth 鐧诲綍銆丟oogle OAuth 鐧诲綍涓夌绗笁鏂圭櫥褰曟柟寮忥紝闄嶄綆娉ㄥ唽闂ㄦ锛屾彁楂樻柊鐢ㄦ埛杞寲鐜囥€傚凡鏈夐偖绠辨敞鍐岀殑璐﹀彿鍙互缁戝畾绗笁鏂圭櫥褰曟柟寮忋€?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鐧诲綍椤垫寜閽竷灞€锛?*
```
鈹屸攢 鐧诲綍 3Cloud 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                                             鈹?鈹? 閭鐧诲綍                                    鈹?鈹? [閭鍦板潃        ]                          鈹?鈹? [瀵嗙爜           ]                          鈹?鈹? [鐧诲綍]                                       鈹?鈹?                                             鈹?鈹? 鈹€鈹€鈹€鈹€鈹€鈹€鈹€ 鎴栦娇鐢ㄧ涓夋柟璐﹀彿鐧诲綍 鈹€鈹€鈹€鈹€鈹€鈹€鈹€          鈹?鈹?                                             鈹?鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?    鈹?鈹? 鈹?馃悪 GitHub 鈹?鈹?馃數 Google 鈹?鈹?馃挌 寰俊   鈹?    鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?    鈹?鈹?                                             鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**涓夌鐧诲綍鏂瑰紡鐨勬寜閽氦浜掞細**

| 骞冲彴 | 鎸夐挳鏍峰紡 | 鐐瑰嚮琛屼负 | 鎺堟潈鏂瑰紡 |
|------|---------|---------|---------|
| GitHub | 榛戣壊搴?+ 鐧借壊 Octicon 鍥炬爣 | 璺宠浆 GitHub 鎺堟潈椤?| OAuth 2.0 寮圭獥/椤甸潰璺宠浆 |
| Google | 鐧借壊搴?+ Google G 褰╄壊鍥炬爣 + 鐏拌壊杈规 | 璺宠浆 Google 鎺堟潈椤?| OAuth 2.0 椤甸潰璺宠浆 |
| 寰俊 | 缁胯壊搴?+ 鐧借壊寰俊鍥炬爣 | 寮瑰嚭浜岀淮鐮佹ā鎬佹 | 鎵爜鎺堟潈 |

**寰俊鎵爜鐧诲綍寮圭獥锛?*
```
鈹屸攢 寰俊鎵爜鐧诲綍 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ [脳] 鈹€鈹?鈹?                                             鈹?鈹?          鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?              鈹?鈹?          鈹?                鈹?              鈹?鈹?          鈹?  [浜岀淮鐮佸浘鐗嘳   鈹?              鈹?鈹?          鈹?                鈹?              鈹?鈹?          鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?              鈹?鈹?                                             鈹?鈹?       璇蜂娇鐢ㄥ井淇℃壂鎻忎簩缁寸爜鐧诲綍                鈹?鈹?       浜岀淮鐮佹湁鏁堟湡涓?5 鍒嗛挓                   鈹?鈹?                                             鈹?鈹?       [鍒锋柊浜岀淮鐮乚                          鈹?鈹?       鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€                  鈹?鈹?       鎵弿鎴愬姛鍚庯紝椤甸潰灏嗚嚜鍔ㄨ烦杞?              鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```
- 鍓嶇杞妫€鏌ワ紙姣?2 绉掞級鎵爜鐘舵€?- 鎵爜鎴愬姛 鈫?妯℃€佹鑷姩鍏抽棴 鈫?璺宠浆鍒颁华琛ㄧ洏
- 5 鍒嗛挓瓒呮椂 鈫?鏄剧ず"浜岀淮鐮佸凡杩囨湡锛岃鐐瑰嚮鍒锋柊"
- 杞鎺ュ彛锛歚GET /api/v1/auth/oauth/wechat/status?ticket={ticket}`

### OAuth 瀹屾暣娴佺▼锛堜互 GitHub 涓轰緥锛?
```
Step 1: 鐢ㄦ埛鐐瑰嚮 "GitHub 鐧诲綍"
  鈫?鍓嶇 GET /api/v1/auth/oauth/github/url?redirect={returnUrl}
  鈫?鍚庣杩斿洖 { url: "https://github.com/login/oauth/authorize?client_id=xxx&redirect_uri=..." }

Step 2: 鍓嶇璺宠浆鍒?GitHub 鎺堟潈椤?  鈫?window.location.href = url

Step 3: 鐢ㄦ埛鍦?GitHub 椤甸潰鎺堟潈
  鈫?GitHub 鍥炶皟 3cloud 鍚庣锛欸ET /api/v1/auth/oauth/github/callback?code=xxx&state=yyy

Step 4: 鍚庣澶勭悊鍥炶皟
  鈫?鐢?code 鎹㈠彇 access_token (POST https://github.com/login/oauth/access_token)
  鈫?鐢?access_token 鑾峰彇鐢ㄦ埛淇℃伅 (GET https://api.github.com/user)
  鈫?寰楀埌 GitHub userId銆乪mail銆乶ame銆乤vatar_url

Step 5: 鏌ユ壘鎴栧垱寤虹敤鎴?  鈫?鏌?user_oauth_connections 琛細provider='github' AND provider_user_id={githubId}
  鈫?鎵惧埌 鈫?鍙?userId 鈫?鐢熸垚 JWT 鈫?璺宠浆鍓嶇锛堝甫 token锛?  鈫?鏈壘鍒?鈫?鏌?users 琛細email = {githubEmail}

    5a. 宸叉湁姝?email 鐨勭敤鎴凤細
      鈫?鑷姩缁戝畾锛氬湪 user_oauth_connections 琛ㄦ彃鍏ュ叧鑱?      鈫?鐢熸垚 JWT 鈫?璺宠浆鍓嶇

    5b. 娌℃湁姝?email 鐨勭敤鎴凤紙鍏ㄦ柊娉ㄥ唽锛夛細
      鈫?鍒涘缓鐢ㄦ埛锛坰tatus='active', onboarding_status='not_started'锛?      鈫?鍒涘缓鍏宠仈 (user_oauth_connections)
      鈫?鐢熸垚涓€涓粯璁?API Key "鑷姩鐢熸垚鐨?Key"
      鈫?鍙戞斁 楼5 浣撻獙棰濆害
      鈫?鐢熸垚 JWT 鈫?璺宠浆鍒板墠绔?鈫?瑙﹀彂 Onboarding 寮曞

    5c. GitHub 鏈繑鍥?email锛堥殣绉佽缃級锛?      鈫?璺宠浆鍒拌ˉ鍏呬俊鎭〉 /complete-profile
      鈫?瑕佹眰濉啓閭 + 鏄电О
      鈫?琛ュ厖瀹屾垚鍚?鈫?鐢熸垚 JWT 鈫?浠〃鐩?
Step 6: 鍓嶇鎺ユ敹缁撴灉
  鈫?瑙ｆ瀽 URL hash #token=xxx 鎴?cookie
  鈫?瀛樺偍 JWT 鈫?璺宠浆浠〃鐩?/console
```

### OAuth 缁戝畾绠＄悊锛堢敤鎴疯缃〉锛?
鍏ュ彛锛歚/console/settings` 鈫?"绗笁鏂硅处鍙风粦瀹?鏍囩椤?
```
鈹屸攢 绗笁鏂硅处鍙风粦瀹?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                                                 鈹?鈹? 馃悪 GitHub                                       鈹?鈹?   宸茬粦瀹氾細octocat 锛圥rimary Email锛?            鈹?鈹?   缁戝畾鏃堕棿锛?026-06-15                          鈹?鈹?   [瑙ｇ粦 GitHub]                                 鈹?鈹?                                                 鈹?鈹? 馃數 Google                                       鈹?鈹?   宸茬粦瀹氾細user@gmail.com                         鈹?鈹?   缁戝畾鏃堕棿锛?026-07-20                          鈹?鈹?   [瑙ｇ粦 Google]                                 鈹?鈹?                                                 鈹?鈹? 馃挌 寰俊                                         鈹?鈹?   鏈粦瀹?                                       鈹?鈹?   [缁戝畾寰俊]  鈫?寮瑰嚭鎵爜浜岀淮鐮?                 鈹?鈹?                                                 鈹?鈹? 鈿狅笍 鑷冲皯淇濈暀涓€涓櫥褰曟柟寮忥紙閭鎴栫涓夋柟锛?          鈹?鈹?                                                 鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**瑙ｇ粦閫昏緫锛?*
- 妫€鏌ョ敤鎴锋槸鍚︽湁鍏朵粬鐧诲綍鏂瑰紡锛堥偖绠卞瘑鐮佸凡璁剧疆 鎴?宸茬粦瀹氬叾浠?OAuth锛?- 濡傛灉杩欐槸鍞竴鐧诲綍鏂瑰紡 鈫?闃绘柇锛?鏃犳硶瑙ｇ粦鍞竴鐨勭櫥褰曟柟寮忥紝璇峰厛璁剧疆瀵嗙爜鎴栫粦瀹氬叾浠栬处鍙?
- 鏈夊叾浠栫櫥褰曟柟寮?鈫?寮圭獥浜屾纭 鈫?瑙ｇ粦 鈫?鍒犻櫎 user_oauth_connections 璁板綍
- 鐢ㄦ埛宸叉湁瀵嗙爜 鈫?鍗充娇瑙ｇ粦鎵€鏈?OAuth 涔熷彲閫氳繃閭鐧诲綍

### 鏁版嵁琛ㄧ粨鏋?
```typescript
// user_oauth_connections 鈥?OAuth 璐﹀彿鍏宠仈
export const userOAuthConnections = pgTable("user_oauth_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 20 }).notNull(),  // 'wechat' | 'github' | 'google'
  providerUserId: varchar("provider_user_id", { length: 100 }).notNull(),
  providerEmail: varchar("provider_email", { length: 255 }),
  providerName: varchar("provider_name", { length: 100 }),
  providerAvatar: varchar("provider_avatar", { length: 500 }),
  accessToken: text("access_token"),          // 鍔犲瘑瀛樺偍
  refreshToken: text("refresh_token"),        // 鍔犲瘑瀛樺偍
  tokenExpiresAt: timestamp("token_expires_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqProvider: uniqueIndex("uq_oauth_provider").on(table.provider, table.providerUserId),
  userIdProviderIdx: index("idx_oauth_user_provider").on(table.userId, table.provider),
}));
```

### API 鎺ュ彛

```
GET    /api/v1/auth/oauth/:provider/url             鈥?鑾峰彇 OAuth 鎺堟潈 URL
  鍙傛暟锛歳edirect 鈥?鎺堟潈鍚庡洖璋冪殑椤甸潰璺緞
  鍝嶅簲锛歿 url: "https://..." }

GET    /api/v1/auth/oauth/:provider/callback        鈥?OAuth 鍥炶皟锛堝悗绔鐞嗭級
  鍙傛暟锛歝ode, state
  澶勭悊锛氭煡鎵?鍒涘缓鐢ㄦ埛 鈫?鐢熸垚 JWT 鈫?閲嶅畾鍚戝埌鍓嶇

GET    /api/v1/auth/oauth/wechat/qrcode             鈥?鑾峰彇寰俊浜岀淮鐮?+ ticket
  鍝嶅簲锛歿 ticket: "xxx", qrcodeUrl: "https://...", expiresAt: "..." }

GET    /api/v1/auth/oauth/wechat/status             鈥?杞鎵爜鐘舵€?  鍙傛暟锛歵icket
  鍝嶅簲锛歿 status: 'waiting' | 'scanned' | 'confirmed' | 'expired' }

GET    /api/v1/me/oauth/connections                 鈥?鏌ョ湅宸茬粦瀹?OAuth
  鍝嶅簲锛歿 connections: OAuthConnection[] }

POST   /api/v1/me/oauth/:provider/bind              鈥?缁戝畾 OAuth 鍒板綋鍓嶇敤鎴?  璇锋眰锛歿 code }   // OAuth 鍥炶皟杩斿洖鐨?code
  鍝嶅簲锛歿 connection: OAuthConnection }

DELETE /api/v1/me/oauth/:provider/unbind            鈥?瑙ｇ粦
  鍝嶅簲锛歿 success: true }
  閿欒锛氬鏋滆繖鏄敮涓€鐧诲綍鏂瑰紡 鈫?杩斿洖 400 {"error": "LAST_LOGIN_METHOD"}
```

### 鍓嶇缁勪欢

```typescript
// OAuthLoginButtons 鈥?鐧诲綍椤电涓夋柟鎸夐挳缁?interface OAuthLoginButtonsProps {
  providers: ('github' | 'google' | 'wechat')[];
  redirectUrl?: string;
  onWechatQrCode: () => void;       // 寰俊鐗规畩娴佺▼
}

// OAuthBindSettings 鈥?璁剧疆椤电粦瀹氱鐞?interface OAuthBindSettingsProps {
  connections: OAuthConnection[];
  canUnbind: boolean;               // 鏄惁鍏佽瑙ｇ粦锛堣嚦灏戜竴涓櫥褰曟柟寮忥級
  onBind: (provider: string) => void;
  onUnbind: (provider: string) => void;
}

// WechatLoginModal 鈥?寰俊鎵爜寮圭獥
interface WechatLoginModalProps {
  open: boolean;
  qrcodeUrl: string;
  expiresAt: string;
  status: 'waiting' | 'scanned' | 'confirmed' | 'expired';
  onRefresh: () => void;
  onClose: () => void;
}

interface OAuthConnection {
  provider: 'github' | 'google' | 'wechat';
  providerUserId: string;
  providerEmail: string | null;
  providerName: string | null;
  providerAvatar: string | null;
  lastLoginAt: string;
  createdAt: string;
}
```

### 绠＄悊鍛橀厤缃紙site_settings锛?
```
oauth_enabled: boolean              // 鍏ㄥ眬 OAuth 寮€鍏?oauth_wechat_appid: string          // 寰俊寮€鏀惧钩鍙?AppID
oauth_wechat_secret: string         // 寰俊寮€鏀惧钩鍙?AppSecret
oauth_github_client_id: string      // GitHub OAuth App Client ID
oauth_github_client_secret: string  // GitHub OAuth App Client Secret
oauth_google_client_id: string      // Google OAuth Client ID
oauth_google_client_secret: string  // Google OAuth Client Secret
oauth_callback_base_url: string     // 鍥炶皟鍩虹 URL锛屽 https://3cloud.dev/api/v1/auth/oauth
```

### 杈圭晫鏉′欢

| 鍦烘櫙 | 琛屼负 |
|------|------|
| OAuth 鎺堟潈琚敤鎴锋嫆缁?| 鍥炶皟 error=access_denied锛岃烦杞櫥褰曢〉锛孴oast "鎺堟潈宸插彇娑? |
| OAuth 鍥炶皟 state 涓嶅尮閰?| 杩斿洖 400 "invalid state"锛岄槻 CSRF |
| 棣栨 GitHub 鐧诲綍 | 鑷姩鍒涘缓鐢ㄦ埛 + 鐢熸垚榛樿 API Key + 楼5 棰濆害 + 瑙﹀彂 Onboarding |
| GitHub 缁戝畾鐨?email 宸茶鍏朵粬鐢ㄦ埛浣跨敤 | 鎻愮ず"璇ラ偖绠卞凡琚处鍙?xxx 浣跨敤"锛岃闂槸鍚﹀悎骞舵垨浣跨敤鍏朵粬鏂瑰紡 |
| 瑙ｇ粦鍞竴鐨勭櫥褰曟柟寮?| 闃绘柇锛屾彁绀?璇峰厛璁剧疆瀵嗙爜鎴栫粦瀹氬叾浠栬处鍙? |
| OAuth 閰嶇疆鏈畬鎴愶紙鐜鍙橀噺缂哄け锛?| 鐧诲綍椤甸殣钘忓搴旀寜閽?|
| OAuth 鍏ㄥ眬寮€鍏冲叧闂?| 鐧诲綍椤典笉鏄剧ず绗笁鏂规寜閽?|
| 寰俊浜岀淮鐮?5 鍒嗛挓杩囨湡 | 杞 status=expired 鈫?鏄剧ず"宸茶繃鏈? + 鍒锋柊鎸夐挳 |

### 楠屾敹鏍囧噯

| 缂栧彿 | 楠屾敹椤?| 棰勬湡缁撴灉 |
|------|--------|---------|
| AC-41 | 鐧诲綍椤垫樉绀轰笁涓涓夋柟鐧诲綍鎸夐挳 | 鐐瑰嚮璺宠浆鍒板搴旀巿鏉冮〉 |
| AC-42 | 棣栨 GitHub 鐧诲綍 鈫?鎺堟潈鎴愬姛 | 鍒涘缓鏂扮敤鎴?鈫?鑷姩鐢熸垚 API Key 鈫?璺宠浆浠〃鐩?+ Onboarding |
| AC-43 | 宸叉湁璐﹀彿 GitHub 鐧诲綍锛坋mail 鍖归厤锛?| 鑷姩缁戝畾 鈫?鐩存帴鐧诲綍 |
| AC-44 | 鐢ㄦ埛璁剧疆椤垫煡鐪嬪凡缁戝畾 OAuth | 鏄剧ず鎵€鏈夊凡缁戝畾骞冲彴鍙婅鎯?|
| AC-45 | 瑙ｇ粦 GitHub锛堟湁瀵嗙爜 + 鍙︿竴涓?OAuth锛?| 瑙ｇ粦鎴愬姛锛屽垪琛ㄦ洿鏂?|
| AC-46 | 瑙ｇ粦鍞竴鐨勭櫥褰曟柟寮?| 闃绘柇锛屾彁绀鸿缃瘑鐮佹垨缁戝畾鍏朵粬鏂瑰紡 |
| AC-47 | 寰俊鎵爜鐧诲綍 | 浜岀淮鐮佹樉绀?鈫?鎵爜 鈫?椤甸潰鑷姩璺宠浆鐧诲綍 |
| AC-48 | GitHub 鎺堟潈鎷掔粷 | 璺冲洖鐧诲綍椤碉紝Toast "鎺堟潈宸插彇娑? |

---

## 22.6 鐢ㄦ埛绔€氱煡鍋忓ソ澧炲己

### 鍔熻兘鎻忚堪

澧炲己閫氱煡鍋忓ソ璁剧疆锛岀敤鎴峰彲瀵?4 澶х被锛堣储鍔?瀹夊叏/绯荤粺/钀ラ攢锛夊叡 14 绉嶄簨浠惰繘琛岀簿缁嗗寲鐨勬笭閬撴帶鍒垛€斺€旂珯鍐呴€氱煡锛堝己鍒跺紑鍚級銆侀偖浠堕€氱煡锛堝彲閰嶇疆棰戠巼锛夈€乄ebhook 閫氱煡锛堢嫭绔嬮厤缃級锛屼娇閫氱煡瑙﹁揪绮惧噯鍖归厤鐢ㄦ埛闇€姹傘€?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鍏ュ彛锛?* `/console/settings/notifications`锛堢敤鎴疯缃?鈫?閫氱煡鍋忓ソ Tab锛?
**椤甸潰鏁翠綋甯冨眬锛?*
```
鈹屸攢 閫氱煡鍋忓ソ璁剧疆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?                                                      鈹?鈹? 鈹?閭欢閫氱煡鍏ㄥ眬 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹? 鈹? 閭欢閫氱煡                           [馃煝 宸插紑鍚痌  鈹?鈹?鈹? 鈹? 鎺ユ敹棰戠巼锛? 鈼?瀹炴椂  鈼?姣忔棩鎽樿锛堟棭 9:00锛?鈼?鍏抽棴鈹?鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹?鈹?                                                      鈹?鈹? 鈹?璐㈠姟閫氱煡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹? 鈹? 绔欏唴 鈽?鍏呭€兼垚鍔?   鈽?娑堣垂閫氱煡                鈹? 鈹?鈹? 鈹?      鈽?浣欓涓嶈冻                        楼[10]  鈹? 鈹?鈹? 鈹?      鈽?閫€娆剧姸鎬?                               鈹? 鈹?鈹? 鈹? 閭欢 鈽?鍏呭€兼垚鍔?   鈽?娑堣垂閫氱煡                鈹? 鈹?鈹? 鈹?      鈽?浣欓涓嶈冻                                鈹? 鈹?鈹? 鈹?      鈽?閫€娆剧姸鎬?                               鈹? 鈹?鈹? 鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹? 鈹? 浣欓涓嶈冻闃堝€硷細楼[10.00]           [馃敀 淇濆瓨]     鈹? 鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹?                                                      鈹?鈹? 鈹?瀹夊叏閫氱煡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹? 鈹? 绔欏唴 鈽?鐧诲綍鎻愰啋    鈽?Key 鍒涘缓/鍒犻櫎            鈹? 鈹?鈹? 鈹?      鈽?寮傚父鐧诲綍    鈽?2FA 鍙樻洿 锛堝己鍒跺紑鍚煍掞級  鈹? 鈹?鈹? 鈹? 閭欢 鈽?鐧诲綍鎻愰啋    鈽?Key 鍒涘缓/鍒犻櫎            鈹? 鈹?鈹? 鈹?      鈽?寮傚父鐧诲綍    鈽?2FA 鍙樻洿                 鈹? 鈹?鈹? 鈹? 鈿狅笍 寮傚父鐧诲綍閫氱煡鏃犳硶鍏抽棴锛堝畨鍏ㄧ瓥鐣ヨ姹傦級         鈹? 鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹?                                                      鈹?鈹? 鈹?绯荤粺閫氱煡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹? 鈹? 绔欏唴 鈽?绯荤粺缁存姢    鈽?API 鍙樻洿    鈽?鐗堟湰鏇存柊  鈹? 鈹?鈹? 鈹? 閭欢 鈽?绯荤粺缁存姢    鈽?API 鍙樻洿    鈽?鐗堟湰鏇存柊  鈹? 鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹?                                                      鈹?鈹? 鈹?钀ラ攢閫氱煡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹? 鈹? 绔欏唴 鈽?娲诲姩閫氱煡    鈽?浼樻儬淇℃伅    鈽?浜у搧鏇存柊  鈹? 鈹?鈹? 鈹? 閭欢 鈽?娲诲姩閫氱煡    鈽?浼樻儬淇℃伅    鈽?浜у搧鏇存柊  鈹? 鈹?鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈹?鈹?                                                      鈹?鈹? [鎭㈠榛樿]                           [淇濆瓨鎵€鏈夎缃甝 鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**鍚勫厓绱犱氦浜掔粏鑺傦細**
- 閭欢鍏ㄥ眬寮€鍏筹細鍏抽棴 鈫?涓嬫柟鎵€鏈?閭欢"澶嶉€夋缃伆 disabled锛岄鐜囬€夋嫨涔熼殣钘?- 棰戠巼閫夋嫨锛氫粎褰?閭欢閫氱煡"鍏ㄥ眬寮€鍏冲紑鍚椂鍙
  - 瀹炴椂锛氫簨浠跺彂鐢熷嵆鍙戦偖浠?  - 姣忔棩鎽樿锛氭瘡澶╂棭涓?9:00锛堢敤鎴疯缃腑鍙敼鏃堕棿锛夊彂閫佷竴灏佹眹鎬婚偖浠?  - 鍏抽棴锛氶€夋嫨鍚庣瓑鍚屼簬鍏抽棴閭欢鍏ㄥ眬寮€鍏?- 绔欏唴閫氱煡锛氭墍鏈夌被鍨嬮粯璁ゅ紑鍚紝閮ㄥ垎瀹夊叏绫讳笉鍙叧闂紙濡?寮傚父鐧诲綍"銆?2FA 鍙樻洿"锛夛紝鍙充晶 馃敀 鍥炬爣
- 浣欓涓嶈冻闃堝€硷細浠呭綋"浣欓涓嶈冻"閫氱煡寮€鍚椂锛岃緭鍏ユ鍙紪杈戯紝榛樿 楼10.00
- 鎵归噺淇濆瓨锛氫慨鏀瑰悗鐐瑰嚮"淇濆瓨鎵€鏈夎缃?锛屽彂閫佸崟娆?PUT 璇锋眰锛屾垚鍔熷悗 Toast "鉁?閫氱煡鍋忓ソ宸蹭繚瀛?
- 鎭㈠榛樿锛氬脊鍑轰簩娆＄‘璁?纭鎭㈠榛樿閫氱煡璁剧疆锛?锛岀‘璁ゅ悗 PUT 榛樿鍊?
### 閫氱煡浜嬩欢瀹屾暣鍒楄〃

| 鍒嗙被 | 浜嬩欢鏍囪瘑 | 浜嬩欢鍚嶇О | 绔欏唴榛樿 | 閭欢榛樿 | 鍙惁鍏抽棴 |
|------|---------|---------|---------|---------|---------|
| 璐㈠姟 | `recharge_success` | 鍏呭€兼垚鍔?| 鉁?寮€ | 鉁?寮€ | 鏄?|
| 璐㈠姟 | `consumption_notify` | 娑堣垂閫氱煡 | 鉁?寮€ | 鉁?寮€ | 鏄?|
| 璐㈠姟 | `balance_low` | 浣欓涓嶈冻 | 鉁?寮€ | 鉁?寮€ | 鏄?|
| 璐㈠姟 | `refund_status` | 閫€娆剧姸鎬?| 鉁?寮€ | 鉁?寮€ | 鏄?|
| 瀹夊叏 | `login_reminder` | 鐧诲綍鎻愰啋 | 鉁?寮€ | 鉁?寮€ | 鏄?|
| 瀹夊叏 | `key_created_deleted` | Key 鍒涘缓/鍒犻櫎 | 鉁?寮€ | 鉁?寮€ | 鏄?|
| 瀹夊叏 | `login_anomaly` | 寮傚父鐧诲綍 | 鉁?寮€锛堝己鍒讹級 | 鉁?寮€锛堝己鍒讹級 | 鍚?馃敀 |
| 瀹夊叏 | `2fa_changed` | 2FA 鍙樻洿 | 鉁?寮€锛堝己鍒讹級 | 鉁?寮€锛堝己鍒讹級 | 鍚?馃敀 |
| 绯荤粺 | `system_maintenance` | 绯荤粺缁存姢 | 鉁?寮€ | 鈽?鍏?| 鏄?|
| 绯荤粺 | `api_changed` | API 鍙樻洿 | 鉁?寮€ | 鈽?鍏?| 鏄?|
| 绯荤粺 | `version_update` | 鐗堟湰鏇存柊 | 鉁?寮€ | 鈽?鍏?| 鏄?|
| 钀ラ攢 | `campaign_notify` | 娲诲姩閫氱煡 | 鉁?寮€ | 鈽?鍏?| 鏄?|
| 钀ラ攢 | `promotion_info` | 浼樻儬淇℃伅 | 鉁?寮€ | 鈽?鍏?| 鏄?|
| 钀ラ攢 | `product_update` | 浜у搧鏇存柊 | 鉁?寮€ | 鈽?鍏?| 鏄?|

### 鏁版嵁琛ㄧ粨鏋?
```typescript
// user_notification_preferences 鈥?鐢ㄦ埛閫氱煡鍋忓ソ
// 閲囩敤 JSONB 鍒楀瓨鍌紝閬垮厤姣忕被浜嬩欢涓€涓垪
export const userNotificationPreferences = pgTable("user_notification_preferences", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  // 閭欢鍏ㄥ眬璁剧疆
  emailEnabled: boolean("email_enabled").default(true),
  emailFrequency: varchar("email_frequency", { length: 20 }).default("daily"),  // 'realtime' | 'daily' | 'off'
  emailDigestTime: varchar("email_digest_time", { length: 5 }).default("09:00"),  // HH:MM, UTC+8
  
  // 鍚勭被浜嬩欢鍦ㄧ珯鍐?閭欢娓犻亾鐨勫紑鍏?  inAppPreferences: jsonb("in_app_preferences").default({}),   // { recharge_success: true, ... }
  emailPreferences: jsonb("email_preferences").default({}),    // { recharge_success: false, ... }
  
  // 浣欓涓嶈冻闃堝€硷紙鍗曚綅鍏冿級
  balanceLowThreshold: integer("balance_low_threshold").default(10),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdUniq: uniqueIndex("uq_user_notif_prefs").on(table.userId),
}));

// inAppPreferences / emailPreferences 鐨?JSONB 缁撴瀯锛?interface NotificationPreferences {
  recharge_success: boolean;
  consumption_notify: boolean;
  balance_low: boolean;
  refund_status: boolean;
  login_reminder: boolean;
  key_created_deleted: boolean;
  login_anomaly: boolean;       // 涓嶅彲鍏抽棴锛屽墠绔笉鍙紪杈?  "2fa_changed": boolean;       // 涓嶅彲鍏抽棴锛屽墠绔笉鍙紪杈?  system_maintenance: boolean;
  api_changed: boolean;
  version_update: boolean;
  campaign_notify: boolean;
  promotion_info: boolean;
  product_update: boolean;
}
```

### API 鎺ュ彛

```
GET /api/v1/me/preferences/notifications
  鍝嶅簲锛?  {
    "emailEnabled": true,
    "emailFrequency": "daily",
    "emailDigestTime": "09:00",
    "inAppPreferences": {
      "recharge_success": true,
      "consumption_notify": true,
      "balance_low": true,
      "refund_status": true,
      "login_reminder": true,
      "key_created_deleted": true,
      "login_anomaly": true,
      "2fa_changed": true,
      "system_maintenance": true,
      "api_changed": true,
      "version_update": true,
      "campaign_notify": true,
      "promotion_info": true,
      "product_update": true
    },
    "emailPreferences": {
      "recharge_success": true,
      "consumption_notify": true,
      "balance_low": true,
      "refund_status": true,
      "login_reminder": true,
      "key_created_deleted": true,
      "login_anomaly": true,
      "2fa_changed": true,
      "system_maintenance": false,
      "api_changed": false,
      "version_update": false,
      "campaign_notify": false,
      "promotion_info": false,
      "product_update": false
    },
    "balanceLowThreshold": 10
  }

PUT /api/v1/me/preferences/notifications
  璇锋眰锛?  {
    "emailEnabled": false,
    "emailFrequency": "off",
    "emailDigestTime": "09:00",
    "inAppPreferences": { ... },
    "emailPreferences": { ... },
    "balanceLowThreshold": 20
  }
  鍝嶅簲锛歿 success: true }

POST /api/v1/me/preferences/notifications/reset  鈥?鎭㈠榛樿
  鍝嶅簲锛歿 success: true }  // 閲嶇疆涓洪粯璁ゅ€?```

### 鍚庣鎺ㄩ€侀€昏緫

```
鍙戦€侀€氱煡鍓嶆鏌ュ亸濂斤細

function shouldSendEmail(userId, eventType):
  prefs = getNotificationPreferences(userId)
  if not prefs.emailEnabled: return false
  if not prefs.emailPreferences[eventType]: return false
  
  if prefs.emailFrequency == 'daily':
    // 鍔犲叆浠婃棩鎽樿闃熷垪锛屼笉绔嬪嵆鍙戦€?    addToDailyDigest(userId, eventType, payload)
    return false
  
  if prefs.emailFrequency == 'off':
    return false
  
  return true  // realtime 鈫?绔嬪嵆鍙戦€?
function shouldSendInApp(userId, eventType):
  prefs = getNotificationPreferences(userId)
  return prefs.inAppPreferences[eventType] !== false  // 榛樿 true

姣忔棩鎽樿閭欢锛坈ron锛夛細姣忓ぉ 9:00 AM 鎵弿
  鈫?SELECT 鎵€鏈?emailFrequency='daily' 鐨勭敤鎴?  鈫?鑱氬悎杩囧幓 24 灏忔椂鎺掗槦鐨勬憳瑕佷簨浠?  鈫?娓叉煋閭欢妯℃澘 鈫?鍙戦€?  鈫?鎽樿閭欢鍐呭绀轰緥锛?    [3Cloud] 姣忔棩娑堣垂鎽樿 鈥?2026骞?鏈?8鏃?    浠婃棩璋冪敤锛?,234 娆?    浠婃棩娑堣垂锛毬?2.50
    璐︽埛浣欓锛毬?50.00
    浠婃棩鍛婅锛? 鏉?```

### 鍓嶇缁勪欢 Props

```typescript
interface NotificationPreferencesPageProps {
  preferences: NotificationPreferences;
  loading: boolean;
  onSave: (prefs: NotificationPreferences) => void;
  onReset: () => void;
  saving: boolean;
}

interface NotificationCategoryProps {
  title: string;
  icon: string;
  events: NotificationEventToggle[];
  emailEnabled: boolean;
  onChange: (eventKey: string, channel: 'inApp' | 'email', value: boolean) => void;
}

interface NotificationEventToggle {
  key: string;
  label: string;
  inAppEnabled: boolean;       // 褰撳墠绔欏唴寮€鍏崇姸鎬?  emailEnabled: boolean;       // 褰撳墠閭欢寮€鍏崇姸鎬?  inAppLocked?: boolean;       // 鏄惁寮哄埗寮€鍚紙涓嶅彲鍏抽棴锛?  emailLocked?: boolean;       // 鏄惁寮哄埗寮€鍚紙涓嶅彲鍏抽棴锛?  showThreshold?: boolean;     // 鏄惁鏄剧ず闃堝€艰緭鍏ユ锛坆alance_low锛?  thresholdValue?: number;     // 褰撳墠闃堝€?  onThresholdChange?: (value: number) => void;
}

interface NotificationPreferences {
  emailEnabled: boolean;
  emailFrequency: 'realtime' | 'daily' | 'off';
  emailDigestTime: string;
  inAppPreferences: Record<string, boolean>;
  emailPreferences: Record<string, boolean>;
  balanceLowThreshold: number;
}
```

### 杈圭晫鏉′欢

| 鍦烘櫙 | 琛屼负 |
|------|------|
| 鍏抽棴閭欢鍏ㄥ眬 鈫?淇濆瓨 | 閭欢棰戠巼鑷姩璁句负 `off`锛屾墍鏈夐偖浠跺閫夋缃伆 |
| 鍏抽棴閭欢鍏ㄥ眬 鈫?寮€鍚?| 閭欢棰戠巼鎭㈠涓轰笂娆￠潪 `off` 鍊硷紙榛樿 `daily`锛?|
| 鍙栨秷鎵€鏈夌珯鍐呴€氱煡锛堥櫎寮哄埗椤癸級 | 鍏佽锛屼繚瀛樻垚鍔?|
| 寮哄埗椤癸紙寮傚父鐧诲綍/2FA锛?| 澶嶉€夋鏄剧ず涓哄嬀閫?+ 鐏拌壊 disabled + 馃敀 鍥炬爣锛屼笉鍙偣鍑?|
| 浣欓涓嶈冻闃堝€间负 0 | 鏍￠獙鎷︽埅锛?闃堝€煎繀椤诲ぇ浜?0" |
| 浣欓涓嶈冻闃堝€?> 99999 | 鏍￠獙鎷︽埅锛?闃堝€间笉鑳借秴杩?楼99,999" |
| 鏃犲亸濂借褰曠殑鏂扮敤鎴?| 鍚庣杩斿洖榛樿鍊硷紙鍏ㄩ儴寮€鍚紝閭欢姣忔棩鎽樿锛?|
| 姣忔棩鎽樿鏃堕棿涓虹┖ | 榛樿 09:00锛屾牎楠屽繀濉?|
| 鎭㈠榛樿鍚?| 鐩存帴 PUT 榛樿鍊硷紝椤甸潰鍗虫椂鏇存柊锛孴oast "宸叉仮澶嶉粯璁よ缃? |

### 楠屾敹鏍囧噯

| 缂栧彿 | 楠屾敹椤?| 棰勬湡缁撴灉 |
|------|--------|---------|
| AC-49 | 鐢ㄦ埛鍏抽棴閭欢閫氱煡鍏ㄥ眬 | 涓嶅啀鏀跺埌閭欢 |
| AC-50 | 閭欢棰戠巼璁句负"姣忔棩鎽樿" | 姣忓ぉ 9:00 鏀跺埌姹囨€婚偖浠讹紝涓嶅疄鏃舵帹閫?|
| AC-51 | 鍏抽棴"娑堣垂閫氱煡"绔欏唴閫氱煡 | 涓嬫璋冪敤瀹屾垚鍚庝笉鍐嶇敓鎴愮珯鍐呮秷璐归€氱煡 |
| AC-52 | 鍏抽棴鎵€鏈夎惀閿€閫氱煡 | 涓嶅啀鏀跺埌娲诲姩/浼樻儬/浜у搧鏇存柊閫氱煡 |
| AC-53 | 灏濊瘯鍏抽棴"寮傚父鐧诲綍"绔欏唴閫氱煡 | 澶嶉€夋涓嶅彲鐐瑰嚮锛屾樉绀?馃敀 寮哄埗寮€鍚?|
| AC-54 | 淇敼浣欓涓嶈冻闃堝€间负 楼20 | 浣欓 楼15 鏃惰Е鍙戜綆浣欓鍛婅锛屄?2 鏃朵笉瑙﹀彂 |
| AC-55 | "鎭㈠榛樿" 鈫?纭 | 鎵€鏈夊亸濂介噸缃负榛樿鍊硷紝椤甸潰鍒锋柊 |

---

## 22.7 鐢ㄦ埛绔綋楠屽寮烘€昏

| 妯″潡 | 灏忚妭 | 瀹炵幇 | 鏍稿績浠峰€?|
|------|------|------|---------|
| Onboarding 鍚戝 | 搂22.1 | 鍏ㄥ姛鑳藉疄鐜?| 5 姝ュ紩瀵奸檷浣庢柊鐢ㄦ埛涓婃墜闂ㄦ |
| Dashboard 澧炲己鈥旀垚鏈娴?| 搂22.2.1 | 瀹炵幇 | 鍩轰簬鍘嗗彶鏁版嵁棰勬祴鏈堟秷璐?浣欓鑰楀敖澶╂暟 |
| Dashboard 澧炲己鈥斿憡璀︿腑蹇?| 搂22.2.2 | 瀹炵幇 | 4 绉嶅憡璀﹀疄鏃剁洃鎺?|
| Dashboard 澧炲己鈥旇处鍗曞懆鏈?| 搂22.2.3 | 瀹炵幇 | 鍛ㄦ湡杩涘害+宸插嚭璐?寰呯粨绠?涓嬫湡棰勪及 |
| Dashboard 澧炲己鈥斿疄鏃舵椿鍔ㄦ祦 | 搂22.2.4 | 瀹炵幇 | WebSocket 鎺ㄩ€?杞闄嶇骇 |
| Dashboard 澧炲己鈥旀暟鎹鍑?| 搂22.2.5 | 瀹炵幇 | CSV/JSON 瀵煎嚭锛屾渶澶?10 涓囨潯 |
| 鐢ㄦ埛绔?Playground | 搂22.3 | 鍏ㄥ姛鑳藉疄鐜?| 鍦ㄧ嚎璋冭瘯+娴佸紡鍝嶅簲+浠ｇ爜鐢熸垚 |
| Webhook 閰嶇疆 | 搂22.4 | 鍏ㄥ姛鑳藉疄鐜?| 6 绉嶄簨浠舵帹閫?3 娆￠噸璇?绛惧悕楠岃瘉 |
| 绗笁鏂?OAuth 鐧诲綍 | 搂22.5 | 瀹炵幇 | GitHub/Google/寰俊鐧诲綍+缁戝畾绠＄悊 |
| 閫氱煡鍋忓ソ澧炲己 | 搂22.6 | 鍏ㄥ姛鑳藉疄鐜?| 14 绉嶄簨浠睹? 娓犻亾绮剧粏鍖栨帶鍒?|
| API Key 鎿嶄綔鏃ュ織 | 搂22.7 | 寰呭疄鐜?| 鐢ㄦ埛鏌ョ湅 Key 鐨勫垱寤?鍒犻櫎/鏉冮檺鍙樻洿璁板綍 |
| 鐢ㄦ埛閭€璇锋満鍒?| 搂22.8 | 寰呭疄鐜?| 閭€璇风爜/閭€璇烽摼鎺?琚個璇蜂汉鑷姩鍏宠仈+濂栧姳 |
| 鐢ㄩ噺瀵规瘮鍒嗘瀽 | 搂22.9 | 寰呭疄鐜?| 鏈湀 vs 涓婃湀銆佹ā鍨?Key/鏃堕棿缁村害鍚屾瘮鐜瘮 |
| 閿欒鐮佽嚜鍔╂帓鏌?| 搂22.10 | 寰呭疄鐜?| 璋冪敤澶辫触鏃跺睍绀洪敊璇爜+鍘熷洜+淇姝ラ |
| 鎵归噺鎿嶄綔 | 搂22.11 | 寰呭疄鐜?| 鎵归噺鍒犻櫎 Key/瀵煎嚭鏃ュ織/涓嬭浇鍙戠エ |
| 缁熶竴鏁版嵁瀵煎嚭 | 搂22.12 | 寰呭疄鐜?| 鎵€鏈夊垪琛ㄩ〉缁熶竴瀵煎嚭鎸夐挳+澶氭牸寮忔敮鎸?|


## 22.7 API Key 鎿嶄綔鏃ュ織

### 鍔熻兘鎻忚堪

鐢ㄦ埛绔彁渚?API Key 鐨勬搷浣滄棩蹇楁煡鐪嬪姛鑳斤紝灞曠ず姣忎釜 Key 鐨勫垱寤恒€佸垹闄ゃ€佹潈闄愬彉鏇淬€佺姸鎬佸彉鏇寸瓑鎿嶄綔璁板綍锛堝惈鎿嶄綔鏃堕棿銆佹搷浣?IP銆佹搷浣滆€咃級锛屽府鍔╃敤鎴疯拷婧?Key 鐨勫彉鏇村巻鍙诧紝闃叉璇搷浣滄垨瀹夊叏浜嬩欢鍚庤拷鏌ャ€傜鐞嗗憳渚у彲鍦ㄥ悗鍙版煡鐪嬩换鎰忕敤鎴风殑 Key 鎿嶄綔鏃ュ織銆?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鐢ㄦ埛绔?Key 鎿嶄綔鏃ュ織鍏ュ彛锛?*

```
API Key 绠＄悊椤?鈫?姣忎釜 Key 琛屾湯鐨?鎿嶄綔鍘嗗彶"鎸夐挳
  鈫?  鎿嶄綔鍘嗗彶寮圭獥锛堟垨鐙珛椤甸潰锛夛細
  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?  鈹? Key: sk-abc123...xyz (鎴戠殑鐢熶骇 Key)             鈹?  鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?  鈹? 2026-07-28 10:23  鏉冮檺鍙樻洿  闄愬埗妯″瀷: GPT-4     鈹? 127.0.0.1
  鈹? 2026-07-25 14:12  鐘舵€佸彉鏇? 鍚敤 鈫?绂佺敤          鈹? 192.168.1.1
  鈹? 2026-07-20 09:00  鍒涘缓 Key  "鎴戠殑鐢熶骇 Key"       鈹? 127.0.0.1
  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**绠＄悊鍚庡彴鐢ㄦ埛 Key 鏃ュ織锛?*

```
绠＄悊鍛?鈫?鐢ㄦ埛璇︽儏 鈫?API Key 鍒楄〃 鈫?鏌?Key 鎿嶄綔鍘嗗彶
  锛堝唴瀹瑰悓涓婏紝棰濆鏄剧ず鎿嶄綔鑰呰韩浠斤級
```

### 鏁版嵁鏉ユ簮

澶嶇敤鐜版湁 `operation_logs` 琛紝绛涢€?`targetType='api_key'` 鐨勮褰曘€傚褰撳墠 `operation_logs` 鏈褰?Key 绾у埆鐨勬搷浣滐紝鍒欐柊澧炰互涓嬫搷浣滅被鍨嬶細

| 鎿嶄綔绫诲瀷 | 璇存槑 |
|---------|------|
| `api_key.created` | 鍒涘缓 Key |
| `api_key.deleted` | 鍒犻櫎 Key |
| `api_key.enabled` / `api_key.disabled` | 鍚敤/绂佺敤 |
| `api_key.permission_changed` | 鏉冮檺鍙樻洿锛堟ā鍨嬮檺鍒?IP 鐧藉悕鍗曠瓑锛?|
| `api_key.name_changed` | 鍚嶇О鍙樻洿 |
| `api_key.rotated` | Key 杞崲 |

### API 鎺ュ彛

```
GET /api/v1/me/api-keys/:id/logs
  鏌ヨ鍙傛暟: ?page=1&limit=20
  鍝嶅簲: { logs: ApiKeyLog[], total, page }

GET /api/v1/admin/users/:userId/api-keys/:id/logs
  绠＄悊鍚庡彴鏌ヨ鏌愮敤鎴?Key 鐨勬搷浣滄棩蹇?```

### 鍓嶇缁勪欢

```tsx
interface ApiKeyLogListProps {
  keyId: string;
  logs: ApiKeyLog[];
  loading: boolean;
  onPageChange: (page: number) => void;
  totalPages: number;
}

interface ApiKeyLog {
  id: string;
  action: string;     // created / deleted / enabled / disabled / permission_changed / name_changed / rotated
  detail: string;     // 鎿嶄綔鎻忚堪
  operator?: string;  // 鎿嶄綔鑰咃紙绠＄悊鍛樻搷浣滄椂鏄剧ず admin 鍚嶇О锛?  ip: string;
  createdAt: string;
}
```

### 楠屾敹鏍囧噯

1. 鐢ㄦ埛鏌ョ湅鏌愪釜 Key 鐨勬搷浣滃巻鍙?鈫?鏄剧ず鎸夋椂闂村€掑簭鐨勬搷浣滆褰?2. 姣忎竴鏉¤褰曞寘鍚搷浣滅被鍨嬨€佽缁嗘弿杩般€佹椂闂淬€両P
3. 绠＄悊鍛樺湪鍚庡彴鍙煡鐪嬩换鎰忕敤鎴风殑 Key 鎿嶄綔鏃ュ織
4. 鎿嶄綔鏃ュ織璁板綍浜嗘搷浣滆€呬俊鎭紙鐢ㄦ埛鏈汉鎴栫鐞嗗憳锛?
---

## 22.8 鐢ㄦ埛閭€璇锋満鍒?
### 鍔熻兘鎻忚堪

鐢ㄦ埛绔彁渚涢個璇风爜/閭€璇烽摼鎺ュ姛鑳斤紝宸叉敞鍐岀敤鎴峰彲閭€璇蜂粬浜烘敞鍐?3Cloud銆傝閭€璇蜂汉瀹屾垚娉ㄥ唽鍚庯紝閭€璇蜂汉鍜岃閭€璇蜂汉鍧囪幏寰楀鍔憋紙浣撻獙棰濆害锛夈€傞€氳繃绀句氦瑁傚彉闄嶄綆鑾峰鎴愭湰銆?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鐢ㄦ埛绔個璇烽〉闈細**

```
鎴戠殑閭€璇?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?  鈹? 浣犵殑涓撳睘閭€璇烽摼鎺?                     鈹?  鈹? https://unmisa.com/register?ref=abc  鈹?[澶嶅埗] [鍒嗕韩]
  鈹?                                       鈹?  鈹? 浣犵殑閭€璇风爜: ABC123                    鈹?[澶嶅埗]
  鈹?                                       鈹?  鈹? 姣忛個璇蜂竴浣嶅ソ鍙嬫敞鍐? 鍙屾柟鍚勫緱 楼2 浣撻獙棰濆害 鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
  閭€璇疯褰曪紙30 澶╋級
  閭€璇锋椂闂?       琚個璇蜂汉      鐘舵€?        鎴戠殑濂栧姳
  2026-07-25      test@...     鉁?宸叉敞鍐?   +楼2.00
  2026-07-24      user@...     鉁?宸插厖鍊?   +楼2.00
  2026-07-20      new@...      鈴?寰呮敞鍐?
  鎬婚個璇? 12浜?| 宸叉敞鍐? 8浜?| 鎬诲鍔? 楼16.00
```

**琚個璇蜂汉娉ㄥ唽浣撻獙锛?*

```
1. 琚個璇蜂汉鐐瑰嚮閭€璇烽摼鎺ヨ闂敞鍐岄〉
2. URL 鑷姩鎼哄甫 ref 鍙傛暟锛坮eferral code锛?3. 娉ㄥ唽椤垫樉绀?"鎮ㄥ凡琚?xxx 閭€璇峰姞鍏?3Cloud" 鎻愮ず
4. 娉ㄥ唽鏃惰嚜鍔ㄥ叧鑱旈個璇蜂汉
5. 娉ㄥ唽鎴愬姛鍚庡弻鏂圭珛鍗宠幏寰椾綋楠岄搴?```

### 鏁版嵁琛ㄧ粨鏋?
```typescript
// referrals 鈥?閭€璇疯褰?export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => users.id),
  referredEmail: varchar("referred_email", { length: 255 }),
  referredUserId: integer("referred_user_id").references(() => users.id),
  status: varchar("status", { length: 20 }).default("pending"),
    // pending / registered / reward_issued
  referrerReward: numeric("referrer_reward", { precision: 10, scale: 2 }).default("0"),
  referredReward: numeric("referred_reward", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  registeredAt: timestamp("registered_at"),
  rewardIssuedAt: timestamp("reward_issued_at"),
});
```

### API 鎺ュ彛

```
GET  /api/v1/me/referral/info        鈥?鑾峰彇鎴戠殑閭€璇烽摼鎺?鐮?+ 缁熻鏁版嵁
GET  /api/v1/me/referral/history     鈥?閭€璇疯褰曞垪琛?POST /api/v1/me/referral/claim       鈥?鎵嬪姩棰嗗彇濂栧姳锛堝鏋滆嚜鍔ㄥ彂鏀惧け璐ワ級

// 娉ㄥ唽鏃舵惡甯?ref 鍙傛暟锛屽悗绔湪娉ㄥ唽鎺ュ彛涓鐞?POST /api/v1/auth/register
  璇锋眰浣? { email, password, ref?: string }  // ref 涓洪個璇风爜
```

### 濂栧姳绛栫暐锛堣繍钀ュ彲閰嶇疆锛?
```
site_configs 涓厤缃?
鈹溾攢鈹€ referral_reward_enabled: boolean
鈹溾攢鈹€ referral_reward_amount: number (榛樿 2.00, 鍗曚綅 楼)
鈹溾攢鈹€ referral_reward_both: boolean (榛樿 true, 鍙屾柟鍧囪幏濂栧姳)
鈹溾攢鈹€ referral_reward_min_purchase: number (榛樿 0, 琚個璇蜂汉闇€鍏呭€?>= 璇ュ€煎鍔辨墠鍙戞斁)
鈹斺攢鈹€ referral_reward_expiry_days: number (榛樿 30, 閭€璇烽摼鎺ユ湁鏁堝ぉ鏁?
```

### 鍓嶇缁勪欢

```tsx
interface ReferralInfoProps {
  referralLink: string;
  referralCode: string;
  totalInvited: number;
  totalRegistered: number;
  totalReward: number;
  rewardPerReferral: number;
  onCopy: (text: string) => void;
  onShare: () => void;
}

interface ReferralHistoryProps {
  records: ReferralRecord[];
  loading: boolean;
  onPageChange: (page: number) => void;
}
```

### 杈圭晫鏉′欢

| 鍦烘櫙 | 澶勭悊鏂瑰紡 |
|------|---------|
| 琚個璇蜂汉浣跨敤鑷繁鐨勯個璇风爜娉ㄥ唽 | 涓嶅厑璁歌嚜閭€锛屾敞鍐屾椂鏍￠獙 referrerId != userId |
| 琚個璇蜂汉宸茶鍏朵粬浜洪個璇?| 鍏堝埌鍏堝緱锛岀涓€涓個璇烽摼鎺ヤ负鍑?|
| 閲嶅浣跨敤鍚屼竴閭€璇烽摼鎺ユ敞鍐屽涓处鍙?| 姣忎釜閭€璇风爜鍙叧鑱旂涓€涓敞鍐屾垚鍔熺殑鐢ㄦ埛 |
| 娉ㄥ唽鍚庡垹闄よ处鍙?| 閭€璇峰鍔变笉鍥炴敹锛堝鍔卞凡鍙戞斁鍒欎笉杩藉洖锛?|
| 閭€璇烽摼鎺ヨ繃鏈燂紙瓒?30 澶╋級 | 娉ㄥ唽浠嶇劧鍙互瀹屾垚锛屼絾涓嶅叧鑱旈個璇蜂汉 |

### 楠屾敹鏍囧噯

1. 鐢ㄦ埛鍦ㄩ個璇烽〉闈㈠鍒堕個璇烽摼鎺?鈫?鍙戦€佺粰濂藉弸 鈫?濂藉弸鐐瑰嚮閾炬帴娉ㄥ唽 鈫?鍙屾柟鑾峰緱濂栧姳
2. 鐢ㄦ埛澶嶅埗閭€璇风爜 鈫?濂藉弸鍦ㄦ敞鍐岄〉杈撳叆閭€璇风爜 鈫?鍙屾柟鑾峰緱濂栧姳
3. 閭€璇峰巻鍙茶褰曟樉绀烘墍鏈夐個璇风殑璇︾粏鐘舵€?4. 杩愯惀鍚庡彴鍙厤缃鍔遍噾棰濆拰鏄惁鍚敤閭€璇峰姛鑳?5. 琚個璇蜂汉娉ㄥ唽鍚庨個璇锋柟鏀跺埌閫氱煡

---

## 22.9 鐢ㄩ噺瀵规瘮鍒嗘瀽

### 鍔熻兘鎻忚堪

鍦ㄧ敤鎴风粺璁￠〉闈㈠鍔犲缁村害鐢ㄩ噺瀵规瘮鍒嗘瀽鍔熻兘锛屾敮鎸佹湰鏈?vs 涓婃湀銆佸悓姣?鐜瘮銆佹寜妯″瀷/Key/鏃堕棿缁村害瀵规瘮锛屽府鍔╃敤鎴风悊瑙ｆ秷璐瑰彉鍖栧師鍥犮€?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**缁熻椤靛姣斿尯鍩燂細**

```
鐢ㄩ噺瀵规瘮鍒嗘瀽
  瀵规瘮鍛ㄦ湡: [鏈湀 vs 涓婃湀 鈻糫

  鎬昏:
    鏈湀娑堣垂: 楼1,234.56         涓婃湀娑堣垂: 楼1,100.20
    澧為暱: +12.2%                鈻?澧炲姞 楼134.36

  妯″瀷缁村害瀵规瘮:
    妯″瀷            鏈湀        涓婃湀        鍙樺寲
    deepseek-chat   楼512.30    楼420.10    +21.9% 鈻?    qwen-plus       楼388.20    楼390.50    -0.6%  鈻?    glm-4-flash     楼234.06    楼189.60    +23.4% 鈻?
  API Key 缁村害瀵规瘮:
    Key             鏈湀        涓婃湀        鍙樺寲
    鐢熶骇鐜 Key     楼890.40    楼780.20    +14.1% 鈻?    娴嬭瘯鐜 Key     楼344.16    楼320.00    +7.6%  鈻?
  鏃ユ秷璐硅秼鍔垮姣旓紙鎶樼嚎鍥撅級:
    鈹屸攢 鏈湀 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€ 涓婃湀 鈹€鈹?    鈹?   鈺扁暡                            鈹?    鈹?  鈺? 鈺?    鈺扁暡                     鈹?    鈹? 鈺?   鈺?  鈺? 鈺测攢鈹€鈹€鈹€               鈹?    鈹?鈺?     鈺测暠      鈺?                 鈹?    鈹傗攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€           鈹?    鈹?1  5  10  15  20  25  30          鈹?    鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

### 瀵规瘮缁村害

| 缁村害 | 鏁版嵁绮掑害 | 灞曠ず鏂瑰紡 |
|------|---------|---------|
| 鏃堕棿缁村害 | 鏈湀 vs 涓婃湀 / 鏈懆 vs 涓婂懆 / 鑷畾涔?| 鏁板瓧 + 鐧惧垎姣斿彉鍖?+ 瓒嬪娍鍥?|
| 妯″瀷缁村害 | 鍚勬ā鍨嬫秷璐瑰姣?| 琛ㄦ牸 + 鏌辩姸鍥?|
| Key 缁村害 | 鍚?Key 娑堣垂瀵规瘮 | 琛ㄦ牸 + 楗煎浘 |
| 鏃ヨ秼鍔?| 姣忔棩娑堣垂鏄庣粏 | 鎶樼嚎鍥鹃噸鍙犲姣?|

### API 鎺ュ彛

```
GET /api/v1/me/stats/compare
  鏌ヨ鍙傛暟: { period: 'month' | 'week' | 'custom', startDate?, endDate? }
  鍝嶅簲: {
    overview: { current, previous, change, changePercent },
    byModel: [{ model, current, previous, change }],
    byKey: [{ keyId, keyName, current, previous, change }],
    dailyTrend: { current: [{ date, amount }], previous: [{ date, amount }] }
  }
```

### 鍓嶇缁勪欢

```tsx
interface UsageCompareProps {
  comparison: UsageComparison;
  period: ComparisonPeriod;
  onPeriodChange: (period: ComparisonPeriod) => void;
  loading: boolean;
}

interface ComparisonOverview {
  currentAmount: number;
  previousAmount: number;
  change: number;           // +/- amount
  changePercent: number;    // +/- percentage
}

interface ModelCompareRow {
  model: string;
  current: number;
  previous: number;
  changePercent: number;
}
```

### 楠屾敹鏍囧噯

1. 缁熻椤垫樉绀?鏈湀 vs 涓婃湀"瀵规瘮鎬昏
2. 妯″瀷缁村害瀵规瘮鏄剧ず鍚勬ā鍨嬬殑娑堣垂鍙樺寲
3. Key 缁村害瀵规瘮鏄剧ず鍚?Key 鐨勬秷璐瑰彉鍖?4. 鏃ヨ秼鍔挎姌绾垮浘閲嶅彔鏄剧ず涓や釜鍛ㄦ湡鐨勬秷璐硅秼鍔?5. 鐢ㄦ埛鍙垏鎹㈠姣斿懆鏈燂紙鏈湀/鏈懆/鑷畾涔夛級

---

## 22.10 閿欒鐮佽嚜鍔╂帓鏌?
### 鍔熻兘鎻忚堪

鐢ㄦ埛绔寮洪敊璇爜灞曠ず鍜岃嚜鍔╂帓鏌ヨ兘鍔涖€傝皟鐢ㄥけ璐ユ椂锛堟棩蹇?Playground/瀹炴椂娲诲姩娴侊級涓嶄粎鏄剧ず閿欒鐮侊紝杩樺睍绀洪敊璇師鍥犮€佸父瑙佸満鏅拰淇姝ラ銆傜敤鎴锋棤闇€鏌ラ槄澶栭儴鏂囨。鍗冲彲鑷富瑙ｅ喅澶ч儴鍒嗗父瑙侀敊璇€?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鏃ュ織椤甸敊璇睍绀哄寮猴細**

```
璋冪敤澶辫触璁板綍锛堢偣鍑昏灞曞紑璇︽儏锛夛細
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? 2026-07-28 14:23:45  deepseek-chat  [澶辫触]       鈹?鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?鈹? 鐘舵€佺爜: 401                                     鈹?鈹? 閿欒绫诲瀷: authentication_error                  鈹?鈹? 閿欒娑堟伅: Invalid API Key                       鈹?鈹?                                                 鈹?鈹? 馃挕 鑷姪鎺掓煡:                                     鈹?鈹? 1. 妫€鏌?API Key 鏄惁宸插鍒跺畬鏁达紙鍖呭惈 sk- 鍓嶇紑锛?   鈹?鈹? 2. Key 鍙兘宸茶绂佺敤锛屽墠寰€ API Key 绠＄悊椤垫鏌?      鈹?鈹? 3. 濡傛灉鍒氬垰鍒涘缓 Key锛屽彲鑳介渶瑕佺瓑寰呭嚑绉掔敓鏁?          鈹?鈹?                                                 鈹?鈹? [鏌ョ湅瀹屾暣閿欒鐮佸弬鑰僝                               鈹?鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?```

**閿欒鐮佺煡璇嗗簱棰勭疆鍐呭锛堢鐞嗗悗鍙板彲缁存姢锛夛細**

| 閿欒鐮?| 甯歌鍘熷洜 | 淇姝ラ |
|--------|---------|---------|
| 400 | 璇锋眰鍙傛暟涓嶅畬鏁?| 妫€鏌?model/messages 绛夊繀濉弬鏁?|
| 401 | API Key 鏃犳晥 | 妫€鏌?Key 鏄惁瀹屾暣/宸插惎鐢?鏈繃鏈?|
| 403 | 妯″瀷鏃犳潈闄?| 妫€鏌?Key 鏄惁鏈夎妯″瀷鐨勮闂潈闄?|
| 429 | 瓒呰繃閫熺巼闄愬埗 | 闄嶄綆璇锋眰棰戠巼锛屾垨鍗囩骇濂楅 |
| 502 | 涓婃父渚涘簲鍟嗗紓甯?| 绛夊緟鑷姩閲嶈瘯锛屾垨鑱旂郴瀹㈡湇 |

### API 鎺ュ彛

```
GET /api/v1/public/error-codes     鈥?閿欒鐮佸垪琛紙鍏紑锛岀敤浜庤嚜鍔╂帓鏌ラ〉闈級
GET /api/v1/public/error-codes/:code 鈥?鍗曚釜閿欒鐮佽鎯?```

### 鍓嶇缁勪欢

```tsx
interface ErrorSelfHelpProps {
  statusCode: number;
  errorType?: string;
  errorMessage: string;
  model?: string;
}

// 鏍规嵁閿欒鐮佸拰绫诲瀷锛岃嚜鍔ㄥ睍绀哄搴旂殑鎺掓煡寤鸿
// 鍐呭祵鍦?LogRow / PlaygroundResponse / AlertCenter 涓?```

### 楠屾敹鏍囧噯

1. 璋冪敤鏃ュ織涓け璐ョ殑璁板綍 鈫?鐐瑰嚮灞曞紑 鈫?鏄剧ず閿欒鐮?+ 鎺掓煡姝ラ
2. Playground 璇锋眰澶辫触 鈫?鍝嶅簲鍖哄煙鏄剧ず閿欒淇℃伅 + 淇寤鸿
3. 鐢ㄦ埛鍙偣鍑?鏌ョ湅瀹屾暣閿欒鐮佸弬鑰? 鈫?璺宠浆鍒伴敊璇爜鍙傝€冮〉闈?
---

## 22.11 鎵归噺鎿嶄綔

### 鍔熻兘鎻忚堪

鐢ㄦ埛绔涓垪琛ㄩ〉澧炲姞鎵归噺鎿嶄綔鍔熻兘锛屾敮鎸佹壒閲忛€変腑澶氭潯璁板綍鍚庢墽琛岀粺涓€鎿嶄綔锛屽噺灏戦噸澶嶅姵鍔ㄣ€?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**鎵归噺鎿嶄綔閫傜敤椤甸潰锛?*

| 椤甸潰 | 鎵归噺鎿嶄綔鍐呭 | 鎿嶄綔鍚庢晥鏋?|
|------|------------|-----------|
| API Key 鍒楄〃 | 鎵归噺鍒犻櫎 / 鎵归噺鍚敤 / 鎵归噺绂佺敤 | 鎿嶄綔鍚庡埛鏂板垪琛?|
| 璋冪敤鏃ュ織 | 鎵归噺閫変腑 鈫?瀵煎嚭涓?CSV/JSON | 寮瑰嚭涓嬭浇 |
| 缁熻椤?| 鎵归噺閫変腑妯″瀷 鈫?瀵煎嚭璇ユ壒妯″瀷鐨勭敤閲忓強璐圭敤 | 寮瑰嚭涓嬭浇 |
| 浜ゆ槗璁板綍 | 鎵归噺閫変腑 鈫?瀵煎嚭 | 寮瑰嚭涓嬭浇 |

**UI 浜や簰锛?*

```
API Key 鍒楄〃锛堝嬀閫夋ā寮忥級锛?  鈽?鍏ㄩ€? |  宸查€夋嫨 3 椤? [鎵归噺鍒犻櫎] [鎵归噺鍚敤] [鎵归噺绂佺敤]
  鈽?sk-abc... (鐢熶骇 Key)    娲昏穬  2026-01-01
  鈽?sk-def... (娴嬭瘯 Key)    娲昏穬  2026-01-15
  鈽?sk-ghi... (寮€鍙?Key)    绂佺敤  2026-02-01

  鐐瑰嚮"鎵归噺鍒犻櫎" 鈫?浜屾纭寮圭獥:
  "纭鍒犻櫎閫変腑鐨?2 涓?API Key锛熸鎿嶄綔涓嶅彲鎾ら攢銆?  鍏宠仈鐨勫簲鐢ㄥ皢鏃犳硶缁х画浣跨敤銆?
  [鍙栨秷] [纭鍒犻櫎]
```

### API 鎺ュ彛

```
POST /api/v1/me/api-keys/batch-delete     鈥?鎵归噺鍒犻櫎 Key
POST /api/v1/me/api-keys/batch-enable     鈥?鎵归噺鍚敤
POST /api/v1/me/api-keys/batch-disable    鈥?鎵归噺绂佺敤
POST /api/v1/me/logs/batch-export         鈥?鎵归噺瀵煎嚭鏃ュ織
```

### 鍓嶇缁勪欢

```tsx
interface BatchActionsProps {
  selectedIds: string[];
  actions: BatchAction[];
  onAction: (action: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

interface BatchAction {
  key: string;
  label: string;
  variant: 'primary' | 'danger' | 'default';
  confirmMessage?: string;    // 浜屾纭鏂囨
}
```

### 楠屾敹鏍囧噯

1. 鍒楄〃椤垫樉绀哄閫夋 鈫?鍕鹃€夊鏉?鈫?椤堕儴鏄剧ず鎵归噺鎿嶄綔鏍?2. 鎵归噺鍚敤 Key 鈫?鎵€鏈夐€変腑 Key 鐘舵€佸彉涓哄惎鐢?3. 鎵归噺鍒犻櫎 鈫?寮瑰嚭浜屾纭 鈫?纭鍚庡垹闄?4. 鎵归噺瀵煎嚭 鈫?涓嬭浇鍖呭惈閫変腑璁板綍鐨?CSV 鏂囦欢

---

## 22.12 缁熶竴鏁版嵁瀵煎嚭

### 鍔熻兘鎻忚堪

鎵€鏈夊垪琛ㄩ〉缁熶竴鎻愪緵鏁版嵁瀵煎嚭鍔熻兘锛圕SV/JSON/Excel锛夛紝鐢ㄦ埛涓嶅啀闇€瑕佹墜鍔ㄥ鍒剁矘璐淬€傛瘡涓垪琛ㄩ〉鍙充笂瑙掗兘鏈夌粺涓€鐨?瀵煎嚭"鎸夐挳锛岀粺涓€鐨勫鍑烘祦绋嬪拰浜や簰浣撻獙銆傚皢鐜版湁鍚勯〉闈㈤浂鏁ｇ殑瀵煎嚭鑳藉姏缁熶竴鏁村悎銆?
### 瀹屾垚鑳藉姏 / 灞曠ず鏁堟灉

**缁熶竴瀵煎嚭鎸夐挳浣嶇疆锛?*

```
[椤甸潰鏍囬]                   [绛涢€夋潯浠禲  [鎼滅储]  [瀵煎嚭 鈻糫
                                                    鈹溾攢鈹€ 瀵煎嚭涓?CSV
                                                    鈹溾攢鈹€ 瀵煎嚭涓?JSON
                                                    鈹斺攢鈹€ 瀵煎嚭涓?Excel锛堝彲閫夛級

鐐瑰嚮瀵煎嚭鍚庯細
  1. 寮圭獥閫夋嫨: 鏃堕棿鑼冨洿 / 瀵煎嚭鍒?/ 瀵煎嚭鏍煎紡
  2. 鐐瑰嚮"瀵煎嚭" 鈫?鍚庣寮傛鐢熸垚
  3. 澶ф枃浠讹紙>10 涓囨潯锛夆啋 鐢熸垚鍚庡彂閫氱煡 鈫?鐢ㄦ埛鍦ㄩ€氱煡涓績涓嬭浇
  4. 灏忔枃浠讹紙鈮?0 涓囨潯锛夆啋 鐩存帴涓嬭浇
```

**閫傜敤椤甸潰锛?*

| 椤甸潰 | 瀵煎嚭鍐呭 | 榛樿鍒?|
|------|---------|--------|
| 璋冪敤鏃ュ織 | 璋冪敤璁板綍 | 鏃堕棿/妯″瀷/Key/渚涘簲鍟?杈撳叆 Token/杈撳嚭 Token/璐圭敤/鐘舵€?鑰楁椂 |
| 浜ゆ槗璁板綍 | 鍏呭€?娑堣垂娴佹按 | 鏃堕棿/绫诲瀷/閲戦/浣欓/鐘舵€?|
| 缁熻椤?| 鐢ㄩ噺缁熻 | 鏃ユ湡/妯″瀷/璋冪敤娆℃暟/Token/璐圭敤 |
| API Key | Key 鍒楄〃 | Key 鍚嶇О/鎺╃爜/鐘舵€?鍒涘缓鏃堕棿/鏈€鍚庤皟鐢ㄦ椂闂?|
| 鍙戠エ | 鍙戠エ璁板綍 | 鍙戠エ鍙?閲戦/鐘舵€?寮€绁ㄦ棩鏈?|

### 鍚庣瀹炵幇

```typescript
// 缁熶竴瀵煎嚭鎺ュ彛
POST /api/v1/me/stats/export
  璇锋眰浣? {
    page: 'logs' | 'transactions' | 'stats' | 'api-keys' | 'invoices',
    filters: { ... },               // 褰撳墠椤甸潰鐨勭瓫閫夋潯浠?    columns: string[],               // 閫変腑鐨勫鍑哄垪
    format: 'csv' | 'json' | 'xlsx', // 瀵煎嚭鏍煎紡
    timeRange?: { start, end }
  }
  鍝嶅簲: {
    downloadUrl: string,             // 鏂囦欢涓嬭浇 URL
    estimatedRows: number,
    fileSize?: string
  }
```

### 鍓嶇缁勪欢

```tsx
interface ExportButtonProps {
  page: ExportPageType;
  currentFilters: Record<string, any>;
  onExport?: (result: ExportResult) => void;
}

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (options: ExportOptions) => void;
  columns: ColumnOption[];      // 鍙€夊鍑哄垪
  defaultFormat: ExportFormat;
  rowCount: number;              // 褰撳墠绛涢€夋潯浠朵笅鐨勮褰曟暟
}
```

### 楠屾敹鏍囧噯

1. 璋冪敤鏃ュ織椤?鈫?瀵煎嚭 CSV 鈫?鏂囦欢鍖呭惈鎵€閫夊垪鐨勮皟鐢ㄨ褰?2. 浜ゆ槗璁板綍椤?鈫?瀵煎嚭 CSV 鈫?鏂囦欢鍖呭惈鍏呭€?娑堣垂娴佹按
3. 瀵煎嚭瓒呰繃 10 涓囨潯 鈫?鎻愮ず"鐢熸垚涓紝瀹屾垚鍚庨€氱煡鎮?
4. 瀵煎嚭鏍煎紡鏀寔 CSV 鍜?JSON
5. 鍚勫垪琛ㄩ〉鐨勭粺涓€瀵煎嚭鎸夐挳浜や簰涓€鑷?

---

### [?] 页面帮助

**页面名称**：鍔熻兘璇存槑涔︼細搂22 鐢ㄦ埛绔綋楠屽寮?

**适用角色**：视具体功能而定（参见总览中的优先级和适用角色说明）

**功能定位**：该页面提供 鍔熻兘璇存槑涔︼細搂22 鐢ㄦ埛绔綋楠屽寮? 相关的配置、查询和管理能力。

**核心操作**：
1. 查看列表 / 详情
2. 创建 / 编辑 / 删除条目
3. 筛选 / 搜索 / 导出

**注意事项**：
- 部分操作涉及敏感数据，需二次确认或 2FA 身份验证
- 操作记录会写入操作日志

**常见问题**：
Q: 为什么某些操作不可用？
A: 请检查当前账号的权限角色是否包含对应操作权限。

### [?] 按钮级帮助对照表

| 按钮/操作 | 帮助说明 |
|----------|---------|
| 创建/新增 | 添加一条新记录 |
| 编辑 | 修改已有记录的字段内容 |
| 删除 | 删除选中的记录（不可恢复，需确认） |
| 搜索 | 按关键词搜索匹配的记录 |
| 筛选 | 按选中条件过滤列表 |
| 导出 CSV | 将当前列表数据导出为 CSV 文件 |
| 查看详情 | 查看选中记录的完整信息 |
