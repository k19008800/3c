#!/usr/bin/env python3
"""Build a conservative, review-only mojibake recovery queue.

Never modifies canonical v2 CSVs. A candidate requires every affected field to
be recovered by a complete reversible GB18030->UTF-8 conversion (not a partial
substring guess), and the converted quote/section to be found in a converted,
fully recoverable source line.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REQ_DIR = ROOT / "audit" / "01-requirements"
INPUTS = [REQ_DIR / f"{name}-v2.csv" for name in ("core-finance-atomic", "admin-portal-atomic", "user-agent-atomic")]
FIELDS = ("source_section", "source_quote", "atomic_assertion")
MARKERS = ("鈥", "锛", "鐨", "绯荤", "馃", "�")
# Residual mojibake that can survive one or more round-trips while leaving
# otherwise readable Chinese around it. Keep this explicit and conservative;
# it is a rejection list, never a repair dictionary.
RESIDUAL_MARKERS = (
    "灞傜", "闄愭祦", "鍒嗙", "璇︽", "鎺ュ", "閰嶇", "鏃ユ", "鎺ㄩ",
    "鑾峰", "鏌ョ", "鍒涘", "鐢ㄦ", "杩愯", "浠ヤ", "棰勪", "绠＄",
    "鍒楄", "鏂囩", "澶氶", "鎵€", "鍒嗙粍", "閰嶇疆", "鐢ㄦ埛鍒嗙",
)
# Common lead characters in UTF-8-as-GB18030 mojibake. Two such characters
# close together is a stronger signal than any single character (which may be
# legitimate Chinese), and catches residuals such as 鍚嶇О / 璇存槑.
MOJIBAKE_CHARS = "鍚嶇璇鎴浠娲閫寮€閲鏈鏇鍒絎瀹搴繙绔鍏姣暱鏃樁勬惰涔骞鏍哄噯妯瀹綆璧鎺鐩鍗澶璁绾甯灞闄愯"
MOJIBAKE_CHAR_PATTERN = re.compile(
    rf"[{re.escape(MOJIBAKE_CHARS)}]{{1}}.{{0,3}}[{re.escape(MOJIBAKE_CHARS)}]{{1}}"
)
COMPOUND = ("以及", "同时", "并且")


def obvious_damage(value: str) -> bool:
    return (
        any(marker in value for marker in MARKERS)
        or any(marker in value for marker in RESIDUAL_MARKERS)
        or MOJIBAKE_CHAR_PATTERN.search(value) is not None
        or "\ufffd" in value
        or any("\ue000" <= char <= "\uf8ff" for char in value)
    )


def variants(value: str) -> list[tuple[str, str]]:
    result = [("original", value)]
    current = value
    for index in range(1, 4):
        try:
            converted = current.encode("gb18030").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            break
        if converted == current:
            break
        current = converted
        result.append((f"gb18030->utf8 x{index}", current))
    return result


def recover_complete(value: str) -> tuple[str, str] | None:
    """Return a whole-field conversion only; never repair substrings."""
    for method, candidate in variants(value):
        if method != "original" and candidate.strip() and not obvious_damage(candidate):
            return method, candidate
    return None


def source_line_variants(line: str) -> list[tuple[str, str]]:
    # A source line is usable only when the complete line converts cleanly.
    result = []
    for method, candidate in variants(line):
        if method == "original" and not obvious_damage(line):
            result.append((method, candidate))
        elif method != "original" and not obvious_damage(candidate):
            result.append((method, candidate))
    return result


def locate(value: str, source_lines: list[str]) -> tuple[str, str, list[int]] | None:
    # Readable fields must stay literal; only damaged fields are candidates for
    # conversion. Otherwise a clean Chinese quote can be needlessly converted
    # into a different string merely because an encoding round-trip happens to
    # succeed.
    recovered = recover_complete(value) if obvious_damage(value) else ("original", value)
    if recovered is None:
        return None
    method, candidate = recovered
    hits: list[int] = []
    for number, line in enumerate(source_lines, 1):
        if any(candidate in converted_line for _, converted_line in source_line_variants(line)):
            hits.append(number)
    return (method, candidate, hits) if hits else None


def main() -> int:
    records: list[dict[str, str]] = []
    for input_path in INPUTS:
        with input_path.open(encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                recoveries = {field: recover_complete(row[field]) for field in FIELDS}
                # Queue only fields that are demonstrably damaged. A
                # successful GB18030 round-trip is not evidence of damage: it
                # can also transform ordinary readable Chinese.
                bad_fields = [field for field in FIELDS if obvious_damage(row[field])]
                if not bad_fields:
                    continue
                source_path = ROOT / row["source_path"]
                if not source_path.is_file():
                    continue
                source_lines = source_path.read_text(encoding="utf-8-sig", errors="replace").splitlines()
                converted = dict(row)
                methods: set[str] = set()
                field_ok = True
                for field in FIELDS:
                    recovered = recoveries[field]
                    if recovered is None:
                        if field in bad_fields:
                            field_ok = False
                    else:
                        method, value = recovered
                        # For a candidate, materialize every recoverable
                        # semantic field, not only the field that triggered the
                        # queue. This prevents mixed old-mojibake/new-readable
                        # rows such as a repaired section with a damaged
                        # assertion.
                        converted[field] = value
                        methods.add(method)
                quote_location = locate(row["source_quote"], source_lines)
                section_location = locate(row["source_section"], source_lines)
                all_changed = all(converted.get(field, "") != row[field] for field in bad_fields)
                all_fields_clean = all(not obvious_damage(converted.get(field, "")) for field in FIELDS)
                no_compound = not any(marker in converted.get("atomic_assertion", "") for marker in COMPOUND)
                # Do not mix repaired and unrepaired damaged fields. Clean
                # semantic fields are valid as-is; every damaged field must
                # have a complete reversible conversion. This rejects rows
                # where only a table header or short substring is recoverable.
                all_damaged_fields_recovered = all(recoveries[field] is not None for field in bad_fields)
                candidate = (
                    field_ok
                    and all_changed
                    and all_fields_clean
                    and all_damaged_fields_recovered
                    and quote_location is not None
                    and section_location is not None
                    and no_compound
                )
                records.append({
                    "req_id": row["req_id"],
                    "domain": row["domain"],
                    "source_path": row["source_path"],
                    "bad_fields": ";".join(bad_fields),
                    "recovered_section": converted.get("source_section", ""),
                    "recovered_quote": converted.get("source_quote", ""),
                    "recovered_assertion": converted.get("atomic_assertion", ""),
                    "quote_source_lines": ";".join(map(str, quote_location[2])) if quote_location else "",
                    "section_source_lines": ";".join(map(str, section_location[2])) if section_location else "",
                    "conversion": ";".join(sorted(methods)),
                    "compound_after_recovery": "NO" if no_compound else "YES",
                    "status": "REVIEW_CANDIDATE" if candidate else "MANUAL_REVIEW",
                    "basis": "所有受影响字段均完成整字段可逆转换，且引用/章节可定位；仍需人工确认" if candidate else "至少一个受影响字段无法整字段安全转换，或完整源行不可读/不可定位，或存在复合断言",
                })

    if not records:
        raise RuntimeError("no affected requirement rows found")
    output = REQ_DIR / "reversible-recovery-review.csv"
    with output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    candidates = sum(row["status"] == "REVIEW_CANDIDATE" for row in records)
    (REQ_DIR / "reversible-recovery-review.md").write_text(
        "# 可逆编码恢复人工复核清单\n\n"
        f"- 受影响需求：{len(records)} 条\n"
        f"- 整字段可逆转换且完整源行可定位：{candidates} 条\n"
        f"- 继续人工重建：{len(records) - candidates} 条\n\n"
        "本清单只提供候选，不覆盖 canonical v2 CSV。候选仍需人工确认章节边界、语义和原子性后才能写回。\n",
        encoding="utf-8",
    )
    print(f"affected={len(records)} review_candidates={candidates} manual_review={len(records)-candidates}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
