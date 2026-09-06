import csv
from pathlib import Path

root = Path(__file__).parents[2]
reqdir = root / "audit" / "01-requirements"
archives = {
    "docs/PRD-核心引擎.md": root / "docs/_archive/DRD-核心引擎.md",
    "docs/PRD-管理后台.md": root / "docs/_archive/DRD-管理后台.md",
}
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")
fields = ["source_section", "source_quote", "atomic_assertion"]
out = []
for filename in ("core-finance-atomic-v2.csv", "admin-portal-atomic-v2.csv", "user-agent-atomic-v2.csv"):
    with (reqdir / filename).open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            source = row["source_path"]
            archive = archives.get(source)
            if not archive or not archive.is_file():
                continue
            text = archive.read_text(encoding="utf-8-sig", errors="replace")
            suspect = [field for field in fields if any(marker in row[field] for marker in markers)]
            exact = [field for field in suspect if row[field].strip() and row[field].strip() in text]
            out.append({
                "req_id": row["req_id"],
                "domain": row["domain"],
                "current_source": source,
                "archive_source": str(archive.relative_to(root)).replace("\\", "/"),
                "suspect_fields": ";".join(suspect),
                "exact_archive_fields": ";".join(exact),
                "recovery_status": "CANDIDATE_EXACT" if exact else "MANUAL_REVIEW",
            })
output = reqdir / "archive-recovery-candidates.csv"
with output.open("w", encoding="utf-8-sig", newline="") as fh:
    writer = csv.DictWriter(fh, fieldnames=[
        "req_id", "domain", "current_source", "archive_source",
        "suspect_fields", "exact_archive_fields", "recovery_status",
    ])
    writer.writeheader()
    writer.writerows(out)

from collections import Counter
print("rows=", len(out))
print("status=", Counter(row["recovery_status"] for row in out))
print("exact_fields=", Counter(field for row in out for field in row["exact_archive_fields"].split(";") if field))
