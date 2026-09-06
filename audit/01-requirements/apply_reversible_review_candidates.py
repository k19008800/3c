#!/usr/bin/env python3
"""Materialize mechanically recoverable rows as separate reviewed-v1 drafts.

This is not an approval tool and never replaces canonical v2 CSVs. Each output
row keeps the original 10-column schema, updates only fields that passed the
strict reversible-recovery queue, and records the mechanical basis in notes.
"""
from __future__ import annotations

import csv
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQ_DIR = ROOT / "audit" / "01-requirements"
CANDIDATE_FILE = REQ_DIR / "reversible-recovery-review.csv"
INPUTS = {
    "core-finance": REQ_DIR / "core-finance-atomic-v2.csv",
    "admin-portal": REQ_DIR / "admin-portal-atomic-v2.csv",
    "user-agent": REQ_DIR / "user-agent-atomic-v2.csv",
}
FIELDS = ("source_section", "source_quote", "atomic_assertion")
OUTPUT_FIELDS = (
    "req_id", "domain", "source_path", "source_section", "source_quote",
    "category", "priority", "atomic_assertion", "expected_evidence", "notes",
)


def main() -> int:
    with CANDIDATE_FILE.open(encoding="utf-8-sig", newline="") as handle:
        candidates = {
            row["req_id"]: row
            for row in csv.DictReader(handle)
            if row["status"] == "REVIEW_CANDIDATE"
        }
    if not candidates:
        raise RuntimeError("no mechanically recoverable candidates")

    counts: Counter[str] = Counter()
    outputs: list[dict[str, int | str]] = []
    for domain, input_path in INPUTS.items():
        with input_path.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
        reviewed = 0
        for row in rows:
            candidate = candidates.get(row["req_id"])
            if not candidate:
                continue
            # Candidate file is generated from the same canonical rows; refuse
            # to apply if its identity or source path drifted.
            if candidate["source_path"] != row["source_path"] or candidate["domain"] != row["domain"]:
                raise RuntimeError(f"candidate identity drift: {row['req_id']}")
            for field, candidate_field in (
                ("source_section", "recovered_section"),
                ("source_quote", "recovered_quote"),
                ("atomic_assertion", "recovered_assertion"),
            ):
                row[field] = candidate[candidate_field]
            basis = (
                f"MECHANICAL_RECOVERY_REVIEW: {candidate['conversion']}; "
                f"source_section_lines={candidate['section_source_lines']}; "
                f"source_quote_lines={candidate['quote_source_lines']}; "
                "人工语义确认前保持 UNKNOWN，不代表需求验收通过。"
            )
            row["notes"] = f"{row['notes'].strip()} {basis}".strip()
            reviewed += 1
        output = REQ_DIR / f"{domain}-atomic-reviewed-v1.csv"
        with output.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=OUTPUT_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        counts[domain] = reviewed
        outputs.append({"file": output.name, "rows": len(rows), "reviewed": reviewed})

    manifest = [
        "# 可逆恢复 reviewed-v1 草稿",
        "",
        f"- 机械恢复候选总数：{len(candidates)} 条",
        "- 输出为新的 reviewed-v1 草稿，未覆盖 canonical v2 CSV。",
        "- 所有恢复条目在 notes 中保留转换方法和源行位置。",
        "- `MECHANICAL_RECOVERY_REVIEW` 不是人工语义确认，也不是 PASS。",
        "",
        "| 文件 | 总行数 | 机械恢复行数 |",
        "|---|---:|---:|",
    ]
    manifest.extend(f"| `{item['file']}` | {item['rows']} | {item['reviewed']} |" for item in outputs)
    (REQ_DIR / "reviewed-v1-manifest.md").write_text("\n".join(manifest) + "\n", encoding="utf-8")
    print(f"candidates={len(candidates)} applied={sum(counts.values())} by_domain={dict(counts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
