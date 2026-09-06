from pathlib import Path
import csv,re
root=Path(__file__).parents[2]
# Explicit scope, as requested; refs are the user/agent/sales/channel reference docs.
files = [
'PRD-用户体系.md','PRD-代理商体系.md','PRD-代理商支撑增强.md','PRD-业务员支撑.md','PRD-渠道化术语统一与用户自选渠道定价.md','PRD-用户端体验增强.md',
'SPEC-§2-用户体系.md','SPEC-§3-代理商体系.md','SPEC-§11-业务员支撑模块.md','SPEC-§18-用户端体验增强.md','SPEC-§19-代理商支撑增强.md','SPEC-§22-用户端体验增强.md','SPEC-§24-代理商增强.md','SPEC-§25-供应商增强.md','SPEC-渠道化术语统一与用户自选渠道定价.md',
'ref-2.1-roles-permissions.md','ref-2.2-user-dashboard.md','ref-2.2.2-model-center.md','ref-2.2.3-api-keys.md','ref-2.2.4-call-logs.md','ref-2.2.6-recharge.md','ref-2.2.8-redemption-invoices.md','ref-3-agent-system.md','ref-24-agent-enhance.md','ref-30-permission-management.md','ref-11.1-crm.md','ref-11.2-leads.md','ref-11.3-follow-up.md','ref-11.4-opportunity.md','ref-11.5-performance.md','ref-11.6-quote-contract.md','ref-11.7-sales-knowledge.md','ref-11.8-team-collaboration.md']
# preserve exact source text; only trim outer Markdown list/table decoration for quote selection.
def cat(t):
    for terms,c in [(['权限','角色','可见范围','operator','scope'],'permission'),(['API','接口','路由','HTTP','/api/'],'api'),(['数据库','数据表','字段','落库','schema'],'db'),(['并发','竞态'],'concurrency'),(['幂等','重复提交'],'idempotency'),(['事务'],'transaction'),(['回滚'],'rollback'),(['审计','日志'],'audit'),(['加密','脱敏','密钥','安全','实名'],'security'),(['超时','异常','错误','失败','不可用'],'exception'),(['边界','上限','下限','限制'],'boundary'),(['状态','启用','禁用','下线','过期','待审核'],'state'),(['按钮','页面','入口','展示','弹窗','列表','详情','路由'],'page'),(['输入','填写','校验','格式','金额','名称','邮箱'],'field'),(['通知','邮件','短信','推送'],'action'),(['性能','延迟','QPS','监控'],'performance'),(['测试','验收','验证'],'test')]:
        if any(x.lower() in t.lower() for x in terms): return c
    return 'logic'
def pri(t):
    m=re.search(r'\bP([0-3])\b',t,re.I)
    if m:return 'P'+m.group(1)
    return 'P0' if any(x in t for x in ['必须','不得','强制','核心']) else 'P1'
def split_text(s):
    # split only explicit sentence/semicolon boundaries, retaining punctuation in each quote.
    out=[]
    for x in re.split(r'(?<=[。！？；])\s*|(?<=[;])\s+',s):
        x=x.strip()
        if x: out.append(x)
    return out
rows=[]; n=1; counts={}
for fn in files:
    p=root/'docs'/fn
    if not p.exists(): continue
    sec='文档正文'; header=None; fence=False
    for raw in p.read_text(encoding='utf-8-sig',errors='strict').splitlines():
        s=raw.strip()
        if not s: continue
        if s.startswith('```'): fence=not fence; continue
        if fence: continue
        if s.startswith('#'):
            sec=s.lstrip('#').strip(); header=None; continue
        if s.startswith('|') and s.endswith('|'):
            cells=[c.strip() for c in s[1:-1].split('|')]
            if all(not c or set(c)<=set('-: ') for c in cells): continue
            if header is None: header=cells; continue
            # each cell is a separate source quote; cell text is verbatim substring of source row.
            for i,c in enumerate(cells):
                if len(c)<3 or c in ('—','-','N/A'): continue
                q=c
                a=q
                rows.append([f'UA2-{n:05d}','user-agent',f'docs/{fn}',sec,q,cat(q),pri(q),a,'对应源码路径与行号；相关测试名称/运行结果；必要时提供数据库、队列或审计日志证据','源自表格单元格；本阶段仅登记需求，不判定实现']); n+=1; counts[fn]=counts.get(fn,0)+1
            continue
        q=re.sub(r'^\s*[-*+]\s+','',s); q=re.sub(r'^\s*>\s*','',q)
        q=q.strip('`')
        for part in split_text(q):
            if len(part)<8 or re.fullmatch(r'[-\d. ()]+',part): continue
            rows.append([f'UA2-{n:05d}','user-agent',f'docs/{fn}',sec,part,cat(part),pri(part),part,'对应源码路径与行号；相关测试名称/运行结果；必要时提供数据库、队列或审计日志证据','源自原文段落；本阶段仅登记需求，不判定实现']); n+=1; counts[fn]=counts.get(fn,0)+1
# exact duplicate source assertions are not useful; retain first occurrence only.
seen=set(); unique=[]
for r in rows:
 k=(r[2],r[3],r[4],r[7])
 if k not in seen: seen.add(k); unique.append(r)
rows=unique
header=['req_id','domain','source_path','source_section','source_quote','category','priority','atomic_assertion','expected_evidence','notes']
out=root/'audit/01-requirements/user-agent-atomic-v2.csv'
with out.open('w',encoding='utf-8-sig',newline='') as f:
 w=csv.writer(f); w.writerow(header); w.writerows(rows)
notes=root/'audit/01-requirements/user-agent-rebuild-notes.md'
notes.write_text('# 用户/代理商/业务员/渠道需求原子化返工说明\n\n- 输出：`user-agent-atomic-v2.csv`。\n- 范围覆盖用户、代理商、业务员、渠道 PRD；用户/代理/权限/模型/充值/发票/CRM/销售协作等相关 ref；未修改业务源码。\n- 每条记录来自目标文档的实际段落或 Markdown 表格单元格；段落仅按原文句号、问号、感叹号、分号边界拆分，表格按单元格拆分。`source_quote` 保留源文本，不把表格竖线改成斜线。\n- `atomic_assertion` 每行只引用一个来源片段作为一个可验证断言；未把实现现状当作通过结论。\n- 证据字段要求源码路径/行号和测试或动态证据；缺证据时后续标记 UNKNOWN。\n- 数量：'+str(len(rows))+' 条；按文档计数：\n'+''.join(f'  - `{k}`：{v}\n' for k,v in counts.items())+'\n- 原有 `user-agent-atomic.csv` 未覆盖本次返工结果，v2 作为完整交付文件。\n',encoding='utf-8')
print(len(rows))
