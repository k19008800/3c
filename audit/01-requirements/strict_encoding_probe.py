import csv
from pathlib import Path

root = Path(__file__).parents[2]
req_files = [root / "audit/01-requirements" / n for n in (
    "core-finance-atomic-v2.csv", "admin-portal-atomic-v2.csv", "user-agent-atomic-v2.csv")]
target = "docs/PRD-用户体系.md"
source = root / target
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")
fields = ("source_section", "source_quote", "atomic_assertion")

def recover(value):
    current = value
    for _ in range(2):
        try:
            candidate = current.encode("gb18030").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            return None
        if candidate == current:
            break
        current = candidate
    if any(marker in current for marker in markers) or "\ufffd" in current:
        return None
    return current

lines = source.read_text(encoding="utf-8-sig", errors="replace").splitlines()
recovered_lines = [(no, recover(line)) for no, line in enumerate(lines, 1)]
rows = []
for req in req_files:
    with req.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["source_path"] != target:
                continue
            bad = [f for f in fields if any(marker in row[f] for marker in markers)]
            if not bad:
                continue
            recovered = {f: recover(row[f]) for f in fields}
            quote_hits = [str(no) for no, line in recovered_lines if line and recovered["source_quote"] and recovered["source_quote"] in line]
            section_hits = [str(no) for no, line in recovered_lines if line and recovered["source_section"] and recovered["source_section"] in line]
            ok = bool(recovered["source_quote"] and quote_hits and recovered["source_section"] and section_hits)
            rows.append({
                "req_id": row["req_id"],
                "bad_fields": ";".join(bad),
                "recovered_section": recovered["source_section"] or "",
                "recovered_quote": recovered["source_quote"] or "",
                "recovered_assertion": recovered["atomic_assertion"] or "",
                "quote_source_lines": ";".join(quote_hits),
                "section_source_lines": ";".join(section_hits),
                "status": "STRICT_CANDIDATE" if ok else "MANUAL_REVIEW",
            })

out = root / "audit/01-requirements/user-system-strict-encoding-probe.csv"
with out.open("w", encoding="utf-8-sig", newline="") as fh:
    fields_out = list(rows[0])
    writer = csv.DictWriter(fh, fieldnames=fields_out)
    writer.writeheader()
    writer.writerows(rows)
print("affected=", len(rows), "strict_candidates=", sum(r["status"] == "STRICT_CANDIDATE" for r in rows))
