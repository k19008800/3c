import csv
from pathlib import Path

root = Path(__file__).parents[2]
reqdir = root / "audit/01-requirements"
files = [reqdir / n for n in ("core-finance-atomic-v2.csv", "admin-portal-atomic-v2.csv", "user-agent-atomic-v2.csv")]
markers = ("以及", "同时", "并且")
rows = []
for path in files:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            assertion = row["atomic_assertion"]
            found = [marker for marker in markers if marker in assertion]
            if not found:
                continue
            # A concurrency/state condition may remain one assertion. Multiple
            # imperative/result clauses need manual splitting.
            condition_only = (
                "同时到达" in assertion or "同时触发" in assertion or
                "同时被" in assertion or "同时存在" in assertion or
                "同时超限" in assertion or "同时申请" in assertion or
                "同时运行" in assertion or "同时访问" in assertion or
                "同时启用" in assertion or "同时修改" in assertion or
                "同时对" in assertion or "同时并发" in assertion
            )
            classification = "CONDITION_SINGLE_REVIEW" if condition_only else "COMPOUND_ACTION_REVIEW"
            rows.append({
                "req_id": row["req_id"],
                "domain": row["domain"],
                "source_path": row["source_path"],
                "atomic_assertion": assertion,
                "markers": ";".join(found),
                "classification": classification,
                "review_status": "OPEN",
                "review_note": "确认是否一个条件断言；若含多个独立动作/结果则拆分并建立 derived_from 关系。",
            })

output = reqdir / "compound-assertion-triage.csv"
with output.open("w", encoding="utf-8-sig", newline="") as fh:
    fields = list(rows[0])
    writer = csv.DictWriter(fh, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
print("rows=", len(rows))
print("condition_single_review=", sum(r["classification"] == "CONDITION_SINGLE_REVIEW" for r in rows))
print("compound_action_review=", sum(r["classification"] == "COMPOUND_ACTION_REVIEW" for r in rows))
