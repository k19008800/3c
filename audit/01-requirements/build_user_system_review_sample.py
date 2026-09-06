import csv
import re
from pathlib import Path
from difflib import SequenceMatcher

root = Path(__file__).parents[2]
reqdir = root / "audit/01-requirements"
source = root / "docs/PRD-用户体系.md"
reference = root / "docs/SPEC-§2-用户体系.md"
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")

def clean(value):
    return re.sub(r"[`*_>#|：:，。！？、（）()\[\]{}\-—/\\\s]+", "", value).lower()

def nearest_heading(lines, no):
    headings = [(i, line.strip()) for i, line in enumerate(lines, 1) if line.strip().startswith("#") and i <= no]
    return headings[-1] if headings else ("", "")

source_lines = source.read_text(encoding="utf-8-sig", errors="replace").splitlines()
ref_lines = reference.read_text(encoding="utf-8-sig", errors="replace").splitlines()
ref_candidates = [(i, line.strip()) for i, line in enumerate(ref_lines, 1) if len(clean(line.strip())) >= 10]
rows = []
files = [reqdir / n for n in ("core-finance-atomic-v2.csv", "admin-portal-atomic-v2.csv", "user-agent-atomic-v2.csv")]
for path in files:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["source_path"] != "docs/PRD-用户体系.md":
                continue
            bad = [f for f in ("source_section", "source_quote", "atomic_assertion") if any(m in row[f] for m in markers)]
            if not bad:
                continue
            quote = row["source_quote"].strip()
            line_no = next((i for i, line in enumerate(source_lines, 1) if quote and quote in line), "")
            heading_no, heading = nearest_heading(source_lines, line_no if line_no else 1)
            target = clean(row["atomic_assertion"] or row["source_quote"])
            ranked = sorted(
                ((SequenceMatcher(None, target, clean(line)).ratio(), i, line) for i, line in ref_candidates),
                reverse=True,
            )
            best = ranked[0] if ranked else (0, "", "")
            rows.append({
                "req_id": row["req_id"],
                "domain": row["domain"],
                "bad_fields": ";".join(bad),
                "current_prd_line": line_no,
                "current_prd_heading": f"{heading_no}: {heading}" if heading else "",
                "spec_reference_line": best[1],
                "spec_reference_quote": best[2],
                "spec_similarity": f"{best[0]:.3f}",
                "action": "人工重摘 source_quote/source_section；确认后再拆 atomic_assertion",
                "status": "OPEN",
            })
            if len(rows) >= 30:
                break
    if len(rows) >= 30:
        break

out = reqdir / "user-system-review-sample-001.csv"
with out.open("w", encoding="utf-8-sig", newline="") as fh:
    writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
print("sample_rows=", len(rows))
print("located_in_prd=", sum(bool(r["current_prd_line"]) for r in rows))
print("with_spec_reference=", sum(bool(r["spec_reference_line"]) for r in rows))
