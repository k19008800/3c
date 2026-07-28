# 3Cloud (3C) AI Token 聚合平台 — 运营级产品需求说明书

> **状态**：这是运营级 PRD 的总入口。各章节已拆分为独立子文档，点击链接跳转。
> **版本**：V4.1-用户视角增强 | **最后更新**：2026-07-29
> **文档定位**：每个功能点覆盖字段级规格、配置项、边界条件、运营策略、数据追踪五个维度
> **适用对象**：产品、开发、测试、运营、销售、客服
> 
> **⚠️ 产品设计基础要求（所有功能开发前必须阅读）：**
> [`PRODUCT-DESIGN-PRINCIPLES.md`](PRODUCT-DESIGN-PRINCIPLES.md) 定义了每页每按钮必须有 `[?]` 帮助说明等底层设计原则，**所有 PRD/SPEC 在进入开发前必须满足**。
## 鐩稿叧鏂囨。绱㈠紩

> 馃帹 **鏍稿績娴佺▼娉抽亾鍥?*锛歔`docs/flowcharts/`](flowcharts/) 鈥?6 浠芥吵閬撳浘瑕嗙洊鍏呭€笺€佹彁鐜板弻瀹°€佸疄鍚嶅鏍搞€佷緵搴斿晢鐘舵€佸垏鎹€佽嚜鍔ㄥ璐︺€佷唬鐞嗘檵鍗囧叏娴佺▼銆?> 姣忎釜娉抽亾鍥惧寘鍚?sequenceDiagram + 鍏抽敭鍐崇瓥鐐?+ 寮傚父鍦烘櫙鍒嗘瀽
> 馃摉 **鏁版嵁瀛楀吀**锛歔`docs/data-dictionary.md`](data-dictionary.md) 鈥?瑕嗙洊 19 椤规灇涓惧畾涔?+ 13 寮犳牳蹇冭〃瀛楁璇存槑 + 涓氬姟瑙勫垯涓庣害鏉?> 馃摗 **API 鍙傝€冩墜鍐?*锛歔`docs/api-reference.md`](api-reference.md) 鈥?闈㈠悜寮€鍙戣€呯殑 API 鏂囨。锛屽惈璁よ瘉/妯″瀷/Key/浣欓/鏃ュ織/閫氱煡/閿欒鐮?WebSocket/鏈€浣冲疄璺?> 馃И **娴嬭瘯鐢ㄤ緥涓庨獙鏀舵爣鍑?*锛歔`docs/test-cases.md`](test-cases.md) 鈥?180+ 鏉℃祴璇曠敤渚嬭鐩?P0/P1/P2 绾у埆锛屽惈鍔熻兘/闆嗘垚/杈圭晫/寮傚父鍏ㄥ満鏅?> 馃椇锔?**鍓嶇璺敱缁撴瀯**锛歔`docs/frontend-routes.md`](frontend-routes.md) 鈥?87+ 椤甸潰璺敱鎬昏銆? 绉嶅竷灞€缁撴瀯銆佺粍浠舵爲銆佸叕鍏辩粍浠跺簱
> 馃敡 **閮ㄧ讲杩愮淮鎵嬪唽**锛歔`docs/ops-guide.md`](ops-guide.md) 鈥?鏈嶅姟鍣ㄦ竻鍗曘€侀儴缃叉祦绋嬨€丳M2/Nginx 閰嶇疆銆佸浠界瓥鐣ャ€佹晠闅滄帓鏌ャ€佸畨鍏ㄩ厤缃?> 馃搵 **杩愯惀鎵嬪唽锛圫OP锛?*锛歔`docs/ops-manual.md`](ops-manual.md) 鈥?鏃ュ父妫€鏌ユ竻鍗曘€佺敤鎴?浠ｇ悊/璐㈠姟/瀹夊叏鎿嶄綔 SOP銆佸鏈?FAQ
> 馃彈锔?**绯荤粺鏋舵瀯姒傝**锛歔`docs/architecture.md`](architecture.md) 鈥?绯荤粺鏋舵瀯鍥俱€侀儴缃叉灦鏋勩€佹ā鍧椾緷璧栥€佹暟鎹祦銆佸畨鍏ㄦ灦鏋?
---

## PRD 绔犺妭瀵艰埅

| 绔犺妭 | 鏂囨。 | 娣卞寲鍙傝€?|
|------|------|---------|
| **搂1** 骞冲彴瀹氫綅涓庤繍钀ユā鍨?| [`PRD-姒傝涓庤繍钀ユā鍨?md`](PRD-姒傝涓庤繍钀ユā鍨?md) | [`ref-1-operational-summary.md`](ref-1-operational-summary.md) |
| **搂2** 鐢ㄦ埛浣撶郴 | [`PRD-鐢ㄦ埛浣撶郴.md`](PRD-鐢ㄦ埛浣撶郴.md) | [`ref-2.1-roles-permissions.md`](ref-2.1-roles-permissions.md) + [`ref-2.2-user-dashboard.md`](ref-2.2-user-dashboard.md) + [`ref-2.2.2-model-center.md`](ref-2.2.2-model-center.md) + [`ref-2.2.3-api-keys.md`](ref-2.2.3-api-keys.md) + [`ref-2.2.4-call-logs.md`](ref-2.2.4-call-logs.md) + [`ref-2.2.6-recharge.md`](ref-2.2.6-recharge.md) + [`ref-2.2.8-redemption-invoices.md`](ref-2.2.8-redemption-invoices.md) |
| **搂3** 浠ｇ悊鍟嗕綋绯?| [`PRD-浠ｇ悊鍟嗕綋绯?md`](PRD-浠ｇ悊鍟嗕綋绯?md) | [`ref-3-agent-system.md`](ref-3-agent-system.md) |
| **搂4** 绠＄悊鍚庡彴 | [`PRD-绠＄悊鍚庡彴.md`](PRD-绠＄悊鍚庡彴.md) | [`ref-4.1-admin-dashboard.md`](ref-4.1-admin-dashboard.md) + [`ref-4.2-user-management.md`](ref-4.2-user-management.md) + [`ref-4.3-vendor-model.md`](ref-4.3-vendor-model.md) + [`ref-4.4-finance.md`](ref-4.4-finance.md) + [`ref-4.5-marketing.md`](ref-4.5-marketing.md) + [`ref-4.6-security.md`](ref-4.6-security.md) + [`ref-4.7-monitor-logs.md`](ref-4.7-monitor-logs.md) + [`ref-4.8-system-config.md`](ref-4.8-system-config.md) + [`ref-4.9-report-testing.md`](ref-4.9-report-testing.md) + [`ref-4.10-vendor-self-service.md`](ref-4.10-vendor-self-service.md) + [`ref-4.10-user-segmentation.md`](ref-4.10-user-segmentation.md) + [`ref-4.11-ticketing.md`](ref-4.11-ticketing.md) + [`ref-4.12-dashboard-pro.md`](ref-4.12-dashboard-pro.md) + [`ref-4.13-operation-timeline.md`](ref-4.13-operation-timeline.md) + [`ref-4.14-report-push.md`](ref-4.14-report-push.md) + [`ref-4.14.5-notification-rules.md`](ref-4.14.5-notification-rules.md) + [`ref-4.15-vendor-settlement.md`](ref-4.15-vendor-settlement.md) + [`ref-4.16-resource-placement.md`](ref-4.16-resource-placement.md) + [`ref-4.17-template-library.md`](ref-4.17-template-library.md) + [`ref-4.18-kpi-drill-healthcheck.md`](ref-4.18-kpi-drill-healthcheck.md) + [`ref-4.19-open-api-platform.md`](ref-4.19-open-api-platform.md) |
| **搂5** 鏍稿績寮曟搸 | [`PRD-鏍稿績寮曟搸.md`](PRD-鏍稿績寮曟搸.md) | [`ref-5.1-routing.md`](ref-5.1-routing.md) + [`ref-5.2-billing.md`](ref-5.2-billing.md) + [`ref-5.3-rate-limiter.md`](ref-5.3-rate-limiter.md) + [`ref-5.4-alert-rules.md`](ref-5.4-alert-rules.md) + [`ref-5.5-open-api-platform.md`](ref-5.5-open-api-platform.md) + [`ref-5.5-user-quota-budget.md`](ref-5.5-user-quota-budget.md) + [`ref-5.6-auto-ops.md`](ref-5.6-auto-ops.md) + [`ref-5.7-load-test-design.md`](ref-5.7-load-test-design.md) |
| **搂6** Portal 闂ㄦ埛 | [`PRD-Portal闂ㄦ埛.md`](PRD-Portal闂ㄦ埛.md) | [`ref-6-portal.md`](ref-6-portal.md) |
| **搂7** 闈炲姛鑳介渶姹?| [`PRD-闈炲姛鑳介渶姹?md`](PRD-闈炲姛鑳介渶姹?md) | [`ref-7-nfr.md`](ref-7-nfr.md) |
| **搂8** 杩愯惀澧為暱妯″潡 | [`PRD-杩愯惀澧為暱妯″潡.md`](PRD-杩愯惀澧為暱妯″潡.md) | 鈥?|
| **搂9** 璐㈠姟妯″潡澧炲己 | [`PRD-璐㈠姟妯″潡澧炲己.md`](PRD-璐㈠姟妯″潡澧炲己.md) | 鈥?|
| **搂10** 瀹㈡湇鏀拺妯″潡 | [`PRD-瀹㈡湇鏀拺妯″潡.md`](PRD-瀹㈡湇鏀拺妯″潡.md) | 鈥?|
| **搂11** 涓氬姟鍛樻敮鎾?| [`PRD-涓氬姟鍛樻敮鎾?md`](PRD-涓氬姟鍛樻敮鎾?md) | 鈥?|
| **搂12** 绯荤粺绠＄悊鍛樻敮鎾?| [`PRD-绯荤粺绠＄悊鍛樻敮鎾?md`](PRD-绯荤粺绠＄悊鍛樻敮鎾?md) | 鈥?|
| **搂13** 鏁版嵁杩佺Щ鏂规 | [`PRD-鏁版嵁杩佺Щ鏂规.md`](PRD-鏁版嵁杩佺Щ鏂规.md) | 鈥?|
| **搂14** 閿欒鐮佷笌寮傚父澶勭悊瑙勮寖 | [`PRD-閿欒鐮佽鑼?md`](PRD-閿欒鐮佽鑼?md) | 鈥?|
| **搂15** 鍓嶇缁勪欢搴撹鑼?| [`PRD-缁勪欢搴撹鑼?md`](PRD-缁勪欢搴撹鑼?md) | 鈥?|
| **搂16** 绗笁鏂归泦鎴愭枃妗?| [`PRD-绗笁鏂归泦鎴?md`](PRD-绗笁鏂归泦鎴?md) | 鈥?|
| **搂17** 浜у搧杩唬璺嚎鍥?| [`PRD-浜у搧璺嚎鍥?md`](PRD-浜у搧璺嚎鍥?md) | 鈥?|
| **搂18** 鐢ㄦ埛绔綋楠屽寮?| [`PRD-鐢ㄦ埛绔綋楠屽寮?md`](PRD-鐢ㄦ埛绔綋楠屽寮?md) | 鈥?|
| **搂19** 浠ｇ悊鍟嗘敮鎾戝寮?| [`PRD-浠ｇ悊鍟嗘敮鎾戝寮?md`](PRD-浠ｇ悊鍟嗘敮鎾戝寮?md) | 鈥?|
| **搂20** 鐢ㄦ埛绔畨鍏ㄤ笌棰勭畻澧炲己 | 鈥?| [`SPEC-搂20-鐢ㄦ埛绔畨鍏ㄤ笌棰勭畻澧炲己.md`](SPEC-搂20-鐢ㄦ埛绔畨鍏ㄤ笌棰勭畻澧炲己.md) 鈥?娑堣垂棰勭畻/鐔旀柇銆?FA锛堝悗鍙?鐢ㄦ埛鍙岃瀹氾級銆佽澶囩鐞嗐€並ey 鏉冮檺鎺у埗銆佺櫥褰曞紓甯告娴嬪睍绀?|
| **搂21** Portal 闂ㄦ埛澧炲己 | 鈥?| [`SPEC-搂21-Portal闂ㄦ埛澧炲己.md`](SPEC-搂21-Portal闂ㄦ埛澧炲己.md) 鈥?SEO 浼樺寲銆丅log/Changelog銆佸府鍔╀腑蹇冦€佽仈绯绘垜浠?閿€鍞挩璇€佷环鏍艰绠楀櫒銆佷骇鍝佹洿鏂伴€氱煡 |
| **搂22** 鐢ㄦ埛绔綋楠屽寮?| 鈥?| [`SPEC-搂22-鐢ㄦ埛绔綋楠屽寮?md`](SPEC-搂22-鐢ㄦ埛绔綋楠屽寮?md) 鈥?Onboarding 鍚戝銆佷华琛ㄧ洏澧炲己锛堟垚鏈娴?寮傚父鍛婅/璐﹀崟鍛ㄦ湡/瀹炴椂娲诲姩娴?鏁版嵁瀵煎嚭锛夈€佺敤鎴风 Playground銆乄ebhook 閰嶇疆銆佺涓夋柟鐧诲綍銆侀€氱煡鍋忓ソ澧炲己銆丄PI Key 鎿嶄綔鏃ュ織銆侀個璇锋満鍒躲€佺敤閲忓姣斿垎鏋愩€侀敊璇爜鑷姪鎺掓煡銆佹壒閲忔搷浣溿€佺粺涓€鏁版嵁瀵煎嚭 |

| **搂23** 绯荤粺绾ц兘鍔涘寮?| 鈥?| [`SPEC-搂23-绯荤粺绾ц兘鍔涘寮?md`](SPEC-搂23-绯荤粺绾ц兘鍔涘寮?md) 鈥?鎿嶄綔瀹¤杩芥函澧炲己銆佸叏灞€鎼滅储 Cmd+K銆佸揩鎹烽敭鏀寔銆乮18n 鏋舵瀯銆佺Щ鍔ㄧ閫傞厤 |
| **搂24** 浠ｇ悊鍟嗗寮?| 鈥?| [`SPEC-搂24-浠ｇ悊鍟嗗寮?md`](SPEC-搂24-浠ｇ悊鍟嗗寮?md) 鈥?閭€璇疯鍙樸€佺礌鏉愬簱銆佷笟缁╂帓琛屾銆佸鎴烽璀︺€佸绾т剑閲戙€佽嚜瀹氫箟瀹氫环 |
| **搂25** 渚涘簲鍟嗗寮?| 鈥?| [`SPEC-搂25-渚涘簲鍟嗗寮?md`](SPEC-搂25-渚涘簲鍟嗗寮?md) 鈥?缁撶畻瀵硅处銆佸叕鍛婇€氱煡銆佹€ц兘鎺掕姒溿€佽嚜鍔╃粨绠?|
| **搂26** 宸ュ崟绯荤粺 | 鈥?| [`SPEC-搂26-宸ュ崟绯荤粺.md`](SPEC-搂26-宸ュ崟绯荤粺.md) 鈥?鐢ㄦ埛绔伐鍗曞垱寤?鏌ョ湅/鍥炲銆佸鏈嶇宸ュ崟闃熷垪/Kanban/鍒嗛厤娴佽浆銆佹悳绱㈢瓫閫夈€佺粺璁°€佹弧鎰忓害璇勪环 |
| **搂27** 鍦ㄧ嚎瀹㈡湇涓庡鏈嶆晥鑳?| 鈥?| [`SPEC-搂27-鍦ㄧ嚎瀹㈡湇涓庡鏈嶆晥鑳?md`](SPEC-搂27-鍦ㄧ嚎瀹㈡湇涓庡鏈嶆晥鑳?md) 鈥?鎺掗槦鏈哄埗銆佸鏈嶇姸鎬佺鐞嗐€佽嚜鍔ㄥ垎閰嶃€侀璁炬秷鎭€佸凡璇诲洖鎵с€佽浆宸ュ崟銆佸巻鍙茶褰曘€佺哗鏁堢粺璁°€佹搷浣滃璁?|
| **搂28** 鏅鸿兘瀹㈡湇杈呭姪涓庢祴璇曞伐鍏?| 鈥?| [`SPEC-搂28-鏅鸿兘瀹㈡湇涓庢祴璇曞伐鍏?md`](SPEC-搂28-鏅鸿兘瀹㈡湇涓庢祴璇曞伐鍏?md) 鈥?鎰忓浘璇嗗埆銆佺煡璇嗘帹鑽愩€佸紓甯歌嚜鍔ㄨ瘖鏂€佺敤鎴疯瑙掓煡鐪嬨€佹ā鎷熻皟鐢ㄣ€佷复鏃舵祴璇?Key |

| **搂29** 璧勯噾涓庡璐︾鐞?| 鈥?| [`SPEC-搂29-璧勯噾涓庡璐︾鐞?md`](SPEC-搂29-璧勯噾涓庡璐︾鐞?md) 鈥?璧勯噾娴佹按銆佽祫閲戣处鎴风鐞嗐€佸璐﹀樊寮傚鐞嗗伐浣滃彴銆佽储鍔￠攣璐︿笌缁撹浆銆佽祫閲戞姤琛ㄤ腑蹇冦€侀€炬湡绠＄悊銆佸甯佺缁撶畻 |

> 娣卞寲鏂囨。鎬昏妯★細**18 浠芥繁鍖栧弬鑰冩枃妗ｏ紙~360 KB锛?* + **19 浠?PRD 绔犺妭鏂囨。锛垀1 MB锛?* + **11 浠芥柊澧?SPEC 鏂囨。锛埪?0-搂30锛?*锛岃鐩栧叏閮ㄧ珷鑺傘€


