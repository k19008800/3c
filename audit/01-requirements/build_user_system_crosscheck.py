import csv
import re
from pathlib import Path
from difflib import SequenceMatcher

root = Path(__file__).parents[2]
reqdir = root / "audit/01-requirements"
source_path = root / "docs/PRD-用户体系.md"
reference_path = root / "docs/SPEC-§2-用户体系.md"
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")

def clean(text: str) -> str:
    text = re.sub(r"[`*_>#|：:，。！？、（）()\[\]{}\-—/\\]+", "", text)
    return re.sub(r"\s+", "", text).lower()

def readable(text: str) -> bool:
    return not any(marker in text for marker in markers) and "\ufffd" not in text

def lines(path: Path):
    return [(no, line.strip()) for no, line in enumerate(path.read_text(encoding="utf-8-sig", errors="replace").splitlines(), 1) if line.strip()]

source_lines = lines(source_path)
reference_lines = lines(reference_path)
reference_readable = [(no, line, clean(line)) for no, line in reference_lines if readable(line) and len(clean(line)) >= 8]
rows = []
for filename in ("core-finance-atomic-v2.csv", "admin-portal-atomic-v2.csv", "user-agent-atomic-v2.csv"):
    with (reqdir / filename).open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["source_path"] != "docs/PRD-用户体系.md":
                continue
            bad = [f for f in ("source_section", "source_quote", "atomic_assertion") if any(marker in row[f] for marker in markers)]
            if not bad:
                continue
            target = clean(row["atomic_assertion"] or row["source_quote"])
            scored = []
            if target:
                for no, line, normalized in reference_readable:
                    ratio = SequenceMatcher(None, target, normalized).ratio()
                    if ratio >= 0.42:
                        scored.append((ratio, no, line))
            scored.sort(reverse=True)
            top = scored[:3]
            # A cross-check is only a candidate when the source section can be
            # recovered from a readable current PRD line and the reference has
            # a meaningful semantic match. It is never an automatic rewrite.
            section_candidates = [
                (no, line) for no, line in source_lines
                if line.startswith("#") and readable(line)
            ]
            rows.append({
                "req_id": row["req_id"],
                "current_source": row["source_path"],
                "bad_fields": ";".join(bad),
                "best_reference_score": f"{top[0][0]:.3f}" if top else "",
                "reference_lines": ";".join(str(x[1]) for x in top),
                "reference_quotes": " || ".join(x[2] for x in top),
                "status": "MANUAL_REVIEW_WITH_REFERENCE" if top else "MANUAL_REVIEW",
            })

out = reqdir / "user-system-crosscheck.csv"
with out.open("w", encoding="utf-8-sig", newline="") as fh:
    fields = list(rows[0])
    writer = csv.DictWriter(fh, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)

from collections import Counter
print("affected=", len(rows))
print("with_reference_candidate=", sum(r["status"] == "MANUAL_REVIEW_WITH_REFERENCE" for r in rows))
print("status=", Counter(r["status"] for r in rows))
