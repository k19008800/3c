import csv
from collections import Counter, defaultdict
from pathlib import Path

root = Path(__file__).parents[2]
reqdir = root / "audit/01-requirements"
files = [reqdir / n for n in ("core-finance-atomic-v2.csv", "admin-portal-atomic-v2.csv", "user-agent-atomic-v2.csv")]
markers = ("鈥", "锛", "鐨", "绯荤", "馃", "�")
fields = ("source_section", "source_quote", "atomic_assertion")
by_path = defaultdict(lambda: {"requirements": set(), "field_counts": Counter()})
for path in files:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            bad = [field for field in fields if any(marker in row[field] for marker in markers)]
            if bad:
                by_path[row["source_path"]]["requirements"].add(row["req_id"])
                by_path[row["source_path"]]["field_counts"].update(bad)

rows = []
for source_name, item in by_path.items():
    source = root / source_name
    text = source.read_text(encoding="utf-8-sig", errors="replace") if source.is_file() else ""
    source_lines = text.splitlines()
    damaged_lines = sum(any(marker in line for marker in markers) for line in source_lines)
    readable_lines = len(source_lines) - damaged_lines
    rows.append({
        "source_path": source_name,
        "affected_requirements": len(item["requirements"]),
        "source_lines": len(source_lines),
        "damaged_source_lines": damaged_lines,
        "readable_source_lines": readable_lines,
        "source_damage_ratio": f"{damaged_lines / len(source_lines):.3f}" if source_lines else "1.000",
        "damaged_source_section_fields": item["field_counts"]["source_section"],
        "damaged_source_quote_fields": item["field_counts"]["source_quote"],
        "damaged_assertion_fields": item["field_counts"]["atomic_assertion"],
        "automatic_action": "MANUAL_REBUILD" if damaged_lines else "AUTO_REVIEW_ALLOWED",
    })
rows.sort(key=lambda row: (-row["affected_requirements"], row["source_path"]))
out = reqdir / "source-integrity-report.csv"
with out.open("w", encoding="utf-8-sig", newline="") as fh:
    writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)

lines = [
    "# 需求源文档完整性报告", "", "复核日期：2026-08-30", "",
    "本报告按 canonical v2 需求清单的 `source_path` 汇总源文档可读性。疑似乱码只作为阻断信号，不尝试推测原文。", "",
    "## 门禁规则", "", "- 源文档存在疑似编码损坏行时，相关需求不得自动清除内容质量问题。",
    "- 只有源文档可读、引用可定位、语义可交叉验证时，才允许进入自动修复候选。",
    "- `source-integrity-report.csv` 中 `MANUAL_REBUILD` 的文档必须人工逐段重建。", "",
    "## 汇总", "",
    "| source_path | 受影响需求 | 源文档行数 | 损坏行 | 可读行 | 损坏比例 | 自动处理 |",
    "|---|---:|---:|---:|---:|---:|---|",
]
for row in rows:
    lines.append(
        f"| `{row['source_path']}` | {row['affected_requirements']} | {row['source_lines']} | "
        f"{row['damaged_source_lines']} | {row['readable_source_lines']} | {row['source_damage_ratio']} | {row['automatic_action']} |"
    )
lines += [
    "", "## 结论", "",
    f"- 涉及问题需求的源文档：{len(rows)} 份。",
    f"- 需要人工重建的源文档：{sum(row['automatic_action'] == 'MANUAL_REBUILD' for row in rows)} 份。",
    "- 本报告不覆盖源文档、不覆盖 canonical CSV，不把历史归档或辅助 SPEC 直接替换为当前需求出处。", "",
]
(reqdir / "source-integrity-report.md").write_text("\n".join(lines), encoding="utf-8")
print("paths=", len(rows), "manual_rebuild=", sum(row["automatic_action"] == "MANUAL_REBUILD" for row in rows))
