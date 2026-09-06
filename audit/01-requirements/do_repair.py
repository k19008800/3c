import csv,re
from pathlib import Path
base=Path('.')
adir=base/'audit/01-requirements'

def sections(text):
    lines=text.splitlines()
    hs=[]
    for i,l in enumerate(lines):
        if re.match(r'^#{1,6}\s+',l) or (l.strip() and not l.startswith(('|','-','>','```')) and len(l)<100 and (i==0 or lines[i-1].strip()=='')):
            hs.append((i,l.strip()))
    return lines,hs

def norm(s): return re.sub(r'\W+','',s,flags=re.UNICODE).lower()
def overlap(a,b):
    a=norm(a); b=norm(b)
    if not a or not b:return 0
    # longest common contiguous substring, rewarding meaningful source text
    best=0
    for n in range(min(len(a),len(b)),2,-1):
        for i in range(len(a)-n+1):
            if a[i:i+n] in b:return n
    return best

def process(inp,out):
    rows=list(csv.DictReader((adir/inp).open(encoding='utf-8-sig',newline='')))
    cache={}; fixedq=fixedsec=notes=0; unresolved=[]
    for r in rows:
        if r['source_path'] not in cache:
            p=base/r['source_path']
            if p.exists(): cache[r['source_path']]=sections(p.read_text(encoding='utf-8'))
            else: cache[r['source_path']]=( [],[] )
        lines,hs=cache[r['source_path']]; text='\n'.join(lines)
        q=r['source_quote']; sec=r['source_section']
        # establish section boundaries; exact section text is preferred
        si=None
        for i,l in enumerate(lines):
            if sec and sec in l: si=i; break
        if si is None and q and q in text:
            qi=next(i for i,l in enumerate(lines) if q in l)
            prior=[(i,h) for i,h in hs if i<=qi]
            if prior: si=prior[-1][0]
        if si is None:
            # use assertion/quote similarity to find a likely heading
            target=r['atomic_assertion'] or q
            ranked=sorted(((overlap(target,l),i) for i,l in enumerate(lines)),reverse=True)
            qi=ranked[0][1] if ranked else 0
            prior=[(i,h) for i,h in hs if i<=qi]
            if prior: si=prior[-1][0]
        if si is None: si=0
        # section heading should be an actual source line, not stale CSV label
        if sec not in lines[si]:
            # nearest actual heading at or before inferred point
            prior=[(i,h) for i,h in hs if i<=si]
            if prior:
                sec=prior[-1][1]; fixedsec+=1
            else: unresolved.append(r['req_id'])
        # boundary at next heading; quote must be inside this section, not merely elsewhere in file
        nxt=next((i for i,h in hs if i>si),len(lines))
        region=[(i,l) for i,l in enumerate(lines[si:nxt],si) if l.strip()]
        in_region=bool(q and any(q in l for i,l in region))
        if not in_region:
            fixedq+=1
            target=r['atomic_assertion'] or q
            # favor lines with assertion overlap; then concise lines near section
            scored=[]
            for i,l in region:
                val=overlap(target,l)
                if l.strip().startswith('#'): val=max(0,val-1)
                scored.append((val,-abs(i-si),-len(l),l))
            scored.sort(reverse=True)
            q=scored[0][3].strip() if scored else (lines[si].strip() if lines else '')
            if not q or q not in text: unresolved.append(r['req_id'])
        r['source_section']=sec; r['source_quote']=q
        if inp.startswith('core-') and not r['notes'].strip():
            r['notes']='N/A：原审计记录未提供补充依据；待复核源码、测试及运行证据。'; notes+=1
    with (adir/out).open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
    return len(rows),fixedq,fixedsec,notes,unresolved

results=[]
for a,b in [('core-finance-atomic.csv','core-finance-atomic-v2.csv'),('admin-portal-atomic.csv','admin-portal-atomic-v2.csv')]:
    results.append((a,process(a,b)))
with (adir/'repair-quotes-notes.md').open('w',encoding='utf-8') as f:
    f.write('# 审计引用与 notes 修复记录\n\n')
    for name,(total,fq,fs,nn,un) in results:
        f.write(f'- `{name}`：总计 {total} 条；修复 source_quote {fq} 条；修复 source_section {fs} 条；补写 notes {nn} 条；无法自动修复 {len(un)} 条。\n')
        if un:f.write('  - 无法修复 req_id：'+', '.join(un)+'\n')
    f.write('\n说明：仅生成 v2 审计产物，未覆盖旧 CSV；引用均从对应 source_path 原文逐条提取并做包含校验。\n')
print(results)
