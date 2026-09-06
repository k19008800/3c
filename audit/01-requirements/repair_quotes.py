import csv
from pathlib import Path
import collections
base=Path('.')
for fn in ['core-finance-atomic.csv','admin-portal-atomic.csv']:
 p=base/'audit/01-requirements'/fn
 rows=list(csv.DictReader(p.open(encoding='utf-8-sig',newline='')))
 match=missing=sect=0; by=collections.Counter(); paths=collections.Counter()
 for r in rows:
  q=base/r['source_path']; txt=q.read_text(encoding='utf-8') if q.exists() else ''
  ok=bool(r['source_quote'] and r['source_quote'] in txt)
  match+=ok; missing+=not ok; sect+=bool(r['source_section'] and r['source_section'] in txt)
  if not ok: by[r['source_path']]+=1
  paths[r['source_path']]+=1
 print(fn,len(rows),'quote',match,'missing',missing,'section-substring',sect,'missing-by',by.most_common(20),'paths',len(paths))
