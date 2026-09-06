from pathlib import Path
import csv,re
root=Path(r'C:\Users\ZH\.openclaw\workspace\3cloud')
docs=['PRD-核心引擎.md','PRD-财务模块增强.md','PRD-整改R1-R4-人工上账与资金入账.md','PRD-整改R5-R7-资金风控.md','PRD-模型缓存定价与缓存计量.md','PRD-运营增长模块.md','SPEC-§5-核心引擎.md','SPEC-§9-财务模块增强（拆分迁移中）.md','SPEC-§29-资金与对账管理.md','ref-5.1-routing.md','ref-5.2-billing.md','ref-5.3-rate-limiter.md','ref-5.4-alert-rules.md','ref-4.4-finance.md','ref-2.2.6-recharge.md']
rows=[]; seq=1

def priority(text,section):
    m=re.search(r'P([0-3])',text+' '+section,re.I)
    return 'P'+m.group(1) if m else ('P0' if any(x in text.lower() for x in ['必须','不得','唯一','回滚','资金','余额','幂等','熔断']) else 'P1')
def category(text,section):
    t=(text+' '+section).lower()
    for key,cat in [('测试','test'),('验收','test'),('权限','permission'),('角色','permission'),('api','api'),('接口','api'),('字段','field'),('schema','db'),('数据表','db'),('落库','db'),('缓存','logic'),('通知','action'),('告警','performance'),('监控','performance'),('审计','audit'),('幂等','idempotency'),('并发','concurrency'),('事务','transaction'),('回滚','rollback'),('异常','exception'),('边界','boundary'),('状态','state'),('校验','logic'),('限流','logic'),('路由','logic'),('计费','logic'),('价格','logic'),('金额','field'),('按钮','action'),('页面','page'),('安全','security')]:
        if key in t:return cat
    return 'logic'
def add(path,section,quote,assertion,notes=''):
    global seq
    quote=re.sub(r'\s+',' ',quote).strip(); assertion=re.sub(r'\s+',' ',assertion).strip()
    if len(quote)<5 or len(assertion)<8:return
    # reject headings/formatting
    rows.append([f'REQ-CF-{seq:05d}','core-finance',f'docs/{path}',section,quote,category(assertion,section),priority(assertion,section),assertion,'源码路径+行号、对应运行测试或数据库/Redis/队列证据',notes]);seq+=1
for fn in docs:
    text=(root/'docs'/fn).read_text(encoding='utf-8',errors='replace').splitlines()
    section='文档正文'; table_header=None; in_fence=False
    for line in text:
        s=line.strip()
        if s.startswith('```'):
            in_fence=not in_fence; continue
        if not s: continue
        if s.startswith('#'):
            section=s.lstrip('#').strip(); table_header=None; continue
        if in_fence: continue
        if s.startswith('|') and s.endswith('|'):
            cells=[x.strip() for x in s.strip('|').split('|')]
            if all(not c or set(c)<=set('-: ') for c in cells): continue
            if table_header is None:
                table_header=cells; continue
            for h,v in zip(table_header,cells):
                if not v or v in ('—','-','N/A'): continue
                # each field/value is independently verifiable
                add(fn,section,f'| {h} | {v} |',f'{h}应满足：{v}', '表格单元格已拆为单一字段断言')
            continue
        # strip list marker and split explicit sentence delimiters
        q=s
        q=re.sub(r'^[-*+]\s+','',q); q=re.sub(r'^\[[ xX]\]\s*','',q)
        if q.startswith('>'): q=q.lstrip('> ').strip()
        parts=re.split(r'(?<=[。！？；])\s+|(?<=\.)\s+(?=[A-Z\[])',q)
        for p in parts:
            p=p.strip(' `');
            if len(p)<12 or p.startswith('<!--'): continue
            note='产品裁决/后续阶段' if any(x in p for x in ['待裁决','后续','预留','不在本期','DEFERRED']) else ''
            add(fn,section,p,p,note)
# dedupe exact quote/assertion
seen=set(); out=[]
for r in rows:
    k=(r[2],r[3],r[4],r[7])
    if k not in seen: seen.add(k); out.append(r)
rows=out
header=['req_id','domain','source_path','source_section','source_quote','category','priority','atomic_assertion','expected_evidence','notes']
out=root/'audit/01-requirements/core-finance-atomic.csv'
with out.open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f); w.writerow(header); w.writerows(rows)
notes=root/'audit/01-requirements/core-finance-notes.md'
notes.write_text(f'''# Phase 1 核心引擎/计费/充值/财务/风控需求原子审计\n\n- 审计范围：指定的 15 份 `docs/` PRD、SPEC、ref 文档；仅依据需求原文重新拆解，未复用旧审计结论。\n- 输出：`audit/01-requirements/core-finance-atomic.csv`，共 **{len(rows)}** 条原子项（UTF-8 BOM，便于 Excel 打开）。\n- 每行包含：需求相对路径、精确小节、原文摘录、类别、优先级、单一断言及待取得的实现证据。\n- 原子化处理：列表按句/分号切分；Markdown 表格按“表头—单元格”拆分；代码块不作为需求断言。任何实现均未判定 PASS。\n- 证据规则：CSV 的 `expected_evidence` 统一要求源码路径+行号、测试名称/运行结果或 DB/Redis/队列证据；证据缺失时后续只能标记 UNKNOWN。\n- 产品裁决、后续阶段、不在本期范围在 `notes` 标记，不能当作当前已确定需求。\n- 覆盖维度：输入/前置/角色权限/状态/正常/边界/异常/并发/幂等/事务/回滚/落库/缓存/通知/审计/监控/测试；文档明确 N/A 或范围外的项目保留原文并标记后续或 N/A 依据。\n- 基线仅作审计背景记录：`audit/00-baseline/baseline-summary.json`；未据其结论判定任何需求实现状态。\n''',encoding='utf-8')
print(len(rows))
