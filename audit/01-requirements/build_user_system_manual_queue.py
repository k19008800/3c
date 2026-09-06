import csv
from pathlib import Path

root = Path(__file__).parents[2]
reqdir = root / "audit/01-requirements"
source = root / "docs/PRD-用户体系.md"
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")
fields = ("source_section", "source_quote", "atomic_assertion")
source_lines = source.read_text(encoding="utf-8-sig", errors="replace").splitlines()
headings = [(no, line.strip()) for no, line in enumerate(source_lines, 1) if line.strip().startswith("#")]

queue = []
for filename in ("core-finance-atomic-v2.csv", "admin-portal-atomic-v2.csv", "user-agent-atomic-v2.csv"):
    with (reqdir / filename).open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            if row["source_path"] != "docs/PRD-用户体系.md":
                continue
            bad = [field for field in fields if any(marker in row[field] for marker in markers)]
            if not bad:
                continue
            quote = row["source_quote"].strip()
            source_line = next((no for no, line in enumerate(source_lines, 1) if quote and quote in line), "")
            if source_line:
                prior = [(no, title) for no, title in headings if no <= source_line]
                heading_no, heading = prior[-1] if prior else ("", "")
                context = source_lines[source_line - 1].strip()
            else:
                heading_no, heading, context = "", "", ""
            queue.append({
                "req_id": row["req_id"],
                "domain": row["domain"],
                "source_path": row["source_path"],
                "bad_fields": ";".join(bad),
                "current_source_line": source_line,
                "current_heading": f"{heading_no}: {heading}" if heading else "",
                "current_source_context": context,
                "source_line_readability": "CORRUPTED" if any(marker in context for marker in markers) else "READABLE",
                "atomic_assertion_original": row["atomic_assertion"],
                "review_action": "重摘可读 source_quote；确认 source_section；必要时拆分 atomic_assertion；不能沿用乱码行", 
                "review_status": "OPEN",
                "reviewer_note": "",
            })

out = reqdir / "user-system-manual-review-queue.csv"
with out.open("w", encoding="utf-8-sig", newline="") as fh:
    writer = csv.DictWriter(fh, fieldnames=list(queue[0]))
    writer.writeheader()
    writer.writerows(queue)
print("queue_rows=", len(queue))
print("source_line_located=", sum(bool(row["current_source_line"]) for row in queue))
print("heading_located=", sum(bool(row["current_heading"]) for row in queue))
