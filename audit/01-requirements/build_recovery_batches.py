#!/usr/bin/env python3
"""Split reversible recovery candidates into review-only batches.

No canonical requirement CSV is modified. Batches are for human confirmation
of recovered section/quote/assertion before any reviewed dataset is produced.
"""
from __future__ import annotations

import csv
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQ_DIR = ROOT / "audit" / "01-requirements"
INPUT = REQ_DIR / "reversible-recovery-review.csv"
OUT_DIR = REQ_DIR / "recovery-batches"
BATCH_SIZE = 50


def safe_name(source_path: str) -> str:
    return source_path.replace("docs/", "").replace("/", "-").replace("\\", "-").replace(".", "-").replace("§", "section-")


def main() -> int:
    with INPUT.open(encoding="utf-8-sig", newline="") as handle:
        candidates = [row for row in csv.DictReader(handle) if row["status"] == "REVIEW_CANDIDATE"]
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in candidates:
        grouped[row["source_path"]].append(row)
    OUT_DIR.mkdir(exist_ok=True)
    for old in OUT_DIR.glob("*.csv"):
        old.unlink()
    manifest: list[tuple[str, str, int, int]] = []
    fields = list(candidates[0]) if candidates else ["req_id"]
    for source_path in sorted(grouped):
        rows = grouped[source_path]
        base = safe_name(source_path)
        for offset in range(0, len(rows), BATCH_SIZE):
            batch_no = offset // BATCH_SIZE + 1
            batch = rows[offset : offset + BATCH_SIZE]
            name = f"{base}-batch-{batch_no:02d}.csv"
            with (OUT_DIR / name).open("w", encoding="utf-8-sig", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(batch)
            manifest.append((source_path, name, batch_no, len(batch)))
    lines = [
        "# 可逆恢复人工复核批次",
        "",
        f"- 候选总数：{len(candidates)} 条",
        f"- 批次大小：{BATCH_SIZE} 条以内",
        f"- 批次数：{len(manifest)} 批",
        "- 所有批次均为人工复核输入，不覆盖 canonical v2 CSV。",
        "",
        "## 批次清单",
        "",
        "| 源文档 | 批次文件 | 批次号 | 条数 |",
        "|---|---|---:|---:|",
    ]
    lines.extend(f"| `{source}` | `{name}` | {no} | {count} |" for source, name, no, count in manifest)
    lines.extend([
        "",
        "## 复核规则",
        "",
        "1. 逐条确认 `recovered_section` 是当前源文档的真实章节标题或明确位置。",
        "2. 逐条确认 `recovered_quote` 是当前源文档可读原文，且 `quote_source_lines` 定位正确。",
        "3. 逐条确认 `recovered_assertion` 语义完整且只包含一个可独立验证断言。",
        "4. 发现语义错误、章节错配或残余乱码时标记 `REJECT`，不得直接写回。",
        "5. 只有人工确认后的条目才允许进入 reviewed CSV；当前批次不代表已修复。",
    ])
    (REQ_DIR / "recovery-batches.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"candidates={len(candidates)} batches={len(manifest)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
