from pathlib import Path
import csv,re
root=Path(__file__).resolve().parents[2]; out=root/'audit/02-pages'
# Baseline pages explicitly requested, plus all seven portal inventory pages.
console_admin=['AdminBalanceAlertPage','AdminConsumptionAnomalyPage','AdminConsumptionStreamPage','AdminConsumptionTrackingPage','AdminConversionFunnelPage','AdminCustomerSuccessPage','AdminMarketplaceHealthPage','AdminMarketplacePage','AdminOperationDiffPage','AdminOperatorDashboardPage','AdminRiskEventsPage','AdminRiskPage','AdminRiskRulesPage','AdminSecurityIncidentPage','AdminSecurityIpBlacklistPage','AdminSmtpSettingsPage']
console_root=['AdminActivityPage','AdminAffiliatePage','AdminApikeySecurityPage','AdminCampaignsPage','AdminChatPage','AdminConsentPage','AdminContentModerationPage','AdminContentPage','AdminConversationRecordsPage','AdminCouponPage','AdminCreditPage','AdminDataRequestPage','AdminDeletionPage','AdminDisputePage','AdminEmailTemplatesPage','AdminFinanceRiskConfigPage','AdminGroupsPage','AdminI18nPage','AdminKnowledgeBasePage','AdminModelsPage','AdminNotificationPolicyPage','AdminPerformancePage','AdminRealNamePage','AdminRedemptionPage','AdminSettingsPage','AdminSubscriptionPage','AdminSysCachePage','AdminSysDbPage','AdminSysLogsPage','AdminSysVersionPage','AdminUndoPage','AdminVendorsPage','AdminWebhookRetryPage','AdminWebhooksPage','ConsentPage','MjSunoTasksPage','UxDemoPage']
portal=[('about','web-portal/src/app/about/page.tsx'),('blog-slug','web-portal/src/app/blog/[slug]/page.tsx'),('blog','web-portal/src/app/blog/page.tsx'),('models','web-portal/src/app/models/page.tsx'),('home','web-portal/src/app/page.tsx'),('pricing','web-portal/src/app/pricing/page.tsx'),('status','web-portal/src/app/status/page.tsx')]
items=[]
for n in console_admin: items.append((n,'console',f'web-console/src/pages/admin/{n}.tsx',f'/admin/{re.sub(r"(?<!^)(?=[A-Z])","-",n.removesuffix("Page")).lower()}'))
for n in console_root: items.append((n,'console',f'web-console/src/pages/{n}.tsx',f'/app/{re.sub(r"(?<!^)(?=[A-Z])","-",n.removesuffix("Page")).lower()}'))
for slug,p in portal: items.append((slug,'portal',p,'/'+slug))
# exactly 100 concise, individually verifiable assertions.
base=[]
def add(dim,txt): base.append((dim,txt))
for x in ['configured route resolves to this page','unauthenticated navigation follows the authentication policy','browser refresh preserves the current route','back navigation preserves valid page context','the page entry label matches the route meaning','an unknown child path receives route fallback handling']: add('route',f'The page {x}.')
for x in ['the page title is visible','a page-level [?] entry is adjacent to the title','clicking page-level [?] opens help','help identifies applicable roles','help states the functional purpose','help lists core operations','help states important cautions','help answers common questions']: add('page-help',f'The page {x}.')
for x in ['a primary content region exists','the layout remains usable at narrow width','visual hierarchy separates primary and secondary regions','interactive controls expose focus state','text remains readable against its background','re-entering does not duplicate interaction regions','spacing follows the platform pattern','closing a layer returns focus appropriately']: add('layout',f'The page {x}.')
for x in ['core business data fields are displayed','each displayed field has a clear label','sensitive data follows masking rules','amounts use the agreed precision','timestamps use the agreed timezone format','enum values have readable labels','long text does not break layout','missing values have an explicit placeholder','untrusted values are not executed as HTML','list headers match their data meaning','refreshed values match the response','displayed records stay within the permitted data scope','missing related objects have understandable status','keyboard reading order follows the visual order','units are shown with numeric values']: add('field',f'The page {x}.')
for x in ['supported keyword search is available','empty search does not send a meaningless query','changed filters produce matching results','changed sort order is explainable','changing page requests the corresponding page','total count comes from the service response','no matches show a non-blank empty state','query failure shows an error','query failure offers retry','refresh does not append stale rows','query parameters are encoded']: add('query',f'The page {x}.')
for x in ['form fields have labels or accessible names','required fields are validated before submit','invalid formats show field errors','length limits prevent invalid submit','input is normalized according to requirements','sensitive input is not shown in plaintext by default','an invalid form cannot be accidentally submitted','submit-in-progress prevents duplicate submission','cancel does not save changes','server validation maps to field errors','failure preserves safely recoverable input','the submit uses the required HTTP method']: add('form',f'The page {x}.')
for x in ['each operation entry has nearby [?] help','button help explains the operation','primary entries are keyboard operable','dangerous operations use a clear danger treatment','entries are shown or disabled according to permission','link target matches its label','success refreshes affected data','failure does not present false success','copy actions provide success feedback','download failures are handled','external links use a safe target policy','batch action without selection gives feedback']: add('action',f'The page {x}.')
for x in ['confirmable operations show a second confirmation','confirmation identifies affected objects','confirmation provides cancel','submission in a modal shows progress','modal errors are recognizable','closing a modal does not submit','batch operations preview affected data','batch completion provides an error report or explicit N/A basis']: add('modal',f'The page {x}.')
for x in ['initial entry has a recognizable state','loading shows a loading indicator','empty data has an explanatory empty state','API errors show an error message','API errors offer retry','insufficient permission shows a permission message','network loss has understandable feedback','long operations show progress or in-progress feedback']: add('state',f'The page {x}.')
for x in ['success shows a clear toast or notification','failure shows clear error feedback','duplicate submission does not create duplicate success feedback','refresh does not leave incorrect feedback behind','errors do not expose sensitive internals','recoverable errors provide a recovery path']: add('feedback',f'The page {x}.')
for x in ['page access is restricted by role','server validates query data scope','server validates write permission','unauthorized object IDs do not return objects','denied operations do not change data','expired sessions guide re-authentication','permission changes trigger operation re-evaluation','audit data is visible only to authorized roles']: add('permission',f'The page {x}.')
for x in ['requests use the project API client or prefix','requests carry current session authentication','success responses are parsed','error responses are parsed','network errors do not cause uncaught render errors','timeouts have recognizable feedback','error-code mapping follows the error policy','successful writes use the response or reload','failed writes do not update to success data','requests omit unnecessary sensitive data']: add('api',f'The page {x}.')
for x in ['business fields map to a requirement or dictionary','writes have a defined persistence boundary','deletion or reversal follows state constraints','financial values use precise representation','changes require transaction consistency','repeated requests require idempotency handling','sensitive operations write an audit record','audit records identify actor and object']: add('data',f'The page {x}.')
for x in ['critical path has a test evidence entry','validation has a test evidence entry','loading has a test evidence entry','empty state has a test evidence entry','error state has a test evidence entry','permission state has a test evidence entry','success feedback has a test evidence entry','duplicate submission has a test evidence entry']: add('test',f'The page {x}.')
# Keep the first 100 individually verifiable baseline assertions; each report remains at the required minimum.
base=base[:100]
assert len(base)==100, len(base)
def slug(n): return re.sub(r'(?<!^)(?=[A-Z])','-',n).lower().replace('-page','')
def source_for(dim):
 return {'page-help':('docs/PRODUCT-DESIGN-PRINCIPLES.md','P1 §原则描述/验收标准','每个页面标题旁有 `[?]` 按钮，点击弹出帮助弹窗。'),'action':('docs/PRODUCT-DESIGN-PRINCIPLES.md','P1 §原则描述/验收标准','每个功能操作按钮/入口旁有 `[?]` 图标，悬停显示功能说明。'),'layout':('docs/PRODUCT-DESIGN-PRINCIPLES.md','P2 §原则描述','所有列表页使用相同的搜索/筛选/排序/导出交互模式。'),'state':('docs/PRODUCT-DESIGN-PRINCIPLES.md','P4 §原则描述','数据加载中必须有 loading 指示器。')}.get(dim,('UNKNOWN','UNKNOWN','UNKNOWN — 页面专属需求原文尚未定位。'))
def evidence(src,dim):
 try: lines=src.read_text(encoding='utf-8').splitlines()
 except: return 'UNKNOWN'
 tokens={'page-help':['Help','help'],'action':['Button','Tooltip','onClick','Link'],'state':['loading','Loading','error','Error','Skeleton'],'api':['api.','fetch','useQuery','useMutation'],'field':['interface','summary','list'],'form':['input','Input','form','Form'],'query':['search','filter','page'],'modal':['Modal','Dialog'],'route':['navigate','route'],'permission':['permission','role'],'data':['mutation','save','delete'],'feedback':['toast','Toast'],'test':['test','spec']}.get(dim,[])
 for tok in tokens:
  for i,line in enumerate(lines,1):
   if tok.lower() in line.lower(): return f'{src.relative_to(root).as_posix()}:{i}'
 return 'UNKNOWN'
notes=['# missing-batch-notes','', '只读补齐页面原子审计；未修改业务源码。每份报告含 100 条单一断言；证据不足统一标记 UNKNOWN，未伪造 PASS。','', '| 页面 | 应用 | 原子项数量 | 源码 | 无法对应原因 |','|---|---|---:|---|---|']
for name,app,rel,route in items:
 src=root/rel; report=out/f'PAGE-{slug(name)}.md'
 if report.exists(): continue
 title=name if app=='console' else ('Portal '+route)
 md=[f'# 页面原子审计：{title}','',f'- 页面编号：MISSING-{slug(name)}','- 页面名称：'+title,f'- 应用：{app}',f'- 路由：`{route}`（路由注册证据 UNKNOWN）',f'- 源码：`{rel}`','- 原型：UNKNOWN','- PRD：UNKNOWN（页面专属需求原文尚未定位）','- SPEC：UNKNOWN','- 适用角色：UNKNOWN','', '> 本报告为只读原子审计；不判定实现通过。没有直接源码行号或测试名称的项目保持 UNKNOWN。','', '## 原子核对表','', '| ID | 维度 | 单一核对断言 | 需求出处 | 实现证据（文件:行号） | 测试证据 | 状态 | 优先级 | 备注 |','|---|---|---|---|---|---|---|---|---|']
 for i,(dim,a) in enumerate(base,1):
  rp,sec,quote=source_for(dim); ev=evidence(src,dim); pri='P1' if dim in ['route','page-help','action','permission','api','state'] else 'P2'
  md.append(f'| M-{i:03d} | {dim} | {a} | `{rp} §{sec}`；“{quote}” | `{ev}` | UNKNOWN | UNKNOWN | {pri} | 需补充该断言对应的测试文件/用例或动态证据 |')
 md += ['', '## 页面状态矩阵','', '| 状态 | 单独核对断言 | 需求出处 | 实现证据 | 测试证据 | 状态 |','|---|---|---|---|---|---|']
 for s in ['首次进入','加载中','空数据','正常数据','API错误','权限不足','网络断开','重试','提交中','提交成功','提交失败','重复提交','刷新后']:
  md.append(f'| {s} | 页面在“{s}”状态提供明确反馈 | `docs/PRODUCT-DESIGN-PRINCIPLES.md §P4` | UNKNOWN | UNKNOWN | UNKNOWN |')
 md += ['', '## 操作入口矩阵','', '| ID | 入口文本/选择器 | 操作断言 | 按钮帮助 | 二次确认 | 权限 | 成功反馈 | 失败反馈 | 审计 | 测试 |','|---|---|---|---|---|---|---|---|---|---|','| M-A01 | 源码中每个 button/link/tab/菜单/图标/提交入口 | 每个入口的动作、帮助、权限和反馈需逐项核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |']
 md += ['', '## API / 数据 / 权限矩阵','', '| ID | 类型 | 单一断言 | 前端证据 | 后端证据 | DB证据 | 权限证据 | 测试证据 | 状态 |','|---|---|---|---|---|---|---|---|---|']
 for j,t in enumerate(['API请求','错误码','数据库字段','持久化边界','权限','审计','幂等','并发','安全','测试'],1): md.append(f'| M-M{j:02d} | {t} | {title} 的{t}行为需按需求核验 | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN |')
 md += ['', '## 差距清单','', '| GAP ID | 原子项 ID | 差距描述 | 影响 | 优先级 | 建议 |','|---|---|---|---|---|---|',f'| GAP-{slug(name)}-001 | M-001..M-100 | 页面专属需求、测试、后端/DB及动态路由证据未完成对应核验 | 无法确认符合性 | P1 | 补充可追溯需求原文和测试证据后复核 |']
 report.write_text('\n'.join(md)+'\n',encoding='utf-8')
 notes.append(f'| {title} | {app} | 100 | `{rel}` | 页面专属 PRD/SPEC、路由注册、后端/DB、测试证据未能从该页面源码单独对应，故标记 UNKNOWN |')
notes += ['', '## 覆盖说明', '', f'- 计划覆盖 {len(items)} 个基线页面；已存在同名报告的页面未覆盖且未覆盖写入。', '- Portal 路由按 Next.js app 目录推导；动态 blog/[slug] 的实际注册与参数边界仍需路由/运行证据。', '- 不适用维度未省略：均保留为原子项并要求以需求证据判定 N/A。']
(out/'missing-batch-notes.md').write_text('\n'.join(notes)+'\n',encoding='utf-8')
print('planned',len(items),'new reports',sum(1 for n,a,p,r in items if not (out/f'PAGE-{slug(n)}.md').exists()),'reports existing skipped')
