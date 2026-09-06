#!/usr/bin/env python3
"""Read-only quality gate for audit artifacts.

The script only reads audit/source files and writes two reports. It never edits
business source code or audit detail files.
"""
from __future__ import annotations

import argparse
import csv
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

REQ_FIELDS = (
    "req_id", "domain", "source_path", "source_section", "source_quote",
    "category", "priority", "atomic_assertion", "expected_evidence", "notes",
)
PAGE_ID = re.compile(r"^\|\s*([^|\s][^|]*)\s*\|")
LOGIC_ID = re.compile(r"^\|\s*(LOGIC-[^|]+)\s*\|")
TEMPLATE_PHRASES = (
    "Requirement quote is independently verifiable",
    "Requirement source line", "Single verifiable assertion",
    "TODO", "TBD", "待补", "待核对", "待确认",
)
UNCONFIRMED = re.compile(r"\bunconfirmed\b|未确认|待确认", re.I)
MOJIBAKE_MARKERS = ("鈥", "锛", "鐨", "绯荤", "馃", "�")
COMPOUND_MARKERS = ("以及", "同时", "并且")
EVIDENCE_COLUMNS = ("实现证据", "测试证据", "前端证据", "后端证据", "DB证据", "证据")
MISSING_EVIDENCE = re.compile(r"^(?:|UNKNOWN|N/A|MISSING|无|未找到|不适用)$", re.I)

@dataclass
class Finding:
    kind: str
    path: str
    detail: str
    severity: str = "P1"

@dataclass
class Audit:
    findings: list[Finding] = field(default_factory=list)
    counts: Counter = field(default_factory=Counter)
    page_counts: dict[str, int] = field(default_factory=dict)
    logic_counts: dict[str, int] = field(default_factory=dict)


def read_text(path: Path) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=enc)
        except UnicodeDecodeError:
            pass
    return path.read_text(encoding="utf-8", errors="replace")


def csv_files(root: Path) -> list[Path]:
    """Return canonical requirement datasets, excluding superseded drafts.

    Files ending in ``-v2.csv`` are the repaired datasets.  The legacy files
    remain on disk for audit history but must not contaminate the current gate.
    ``admin-portal-atomic.csv`` is retained until its repaired v2 sibling is
    produced.
    """
    directory = root / "audit" / "01-requirements"
    # Select one current dataset per domain. A partial v2 rollout must not
    # silently hide the still-current core/admin datasets.
    selected: list[Path] = []
    for base in ("core-finance-atomic", "admin-portal-atomic", "user-agent-atomic"):
        repaired = directory / f"{base}-v2.csv"
        legacy = directory / f"{base}.csv"
        if repaired.is_file():
            selected.append(repaired)
        elif legacy.is_file():
            selected.append(legacy)
    return selected


def check_requirements(root: Path, audit: Audit) -> None:
    seen: dict[str, str] = {}
    for path in csv_files(root):
        try:
            with path.open("r", encoding="utf-8-sig", newline="") as fh:
                rows = list(csv.DictReader(fh))
        except Exception as exc:
            audit.findings.append(Finding("csv-read", str(path.relative_to(root)), str(exc), "P0"))
            continue
        if not rows:
            audit.findings.append(Finding("csv-empty", str(path.relative_to(root)), "CSV has no data rows", "P1"))
        for line_no, row in enumerate(rows, 2):
            rel = str(path.relative_to(root))
            missing = [f for f in REQ_FIELDS if not (row.get(f) or "").strip()]
            for f in missing:
                audit.findings.append(Finding("required-field", rel, f"line {line_no}: missing {f}", "P0"))
            rid = (row.get("req_id") or "").strip()
            if rid:
                if rid in seen:
                    audit.findings.append(Finding("duplicate-id", rel, f"line {line_no}: {rid}; first seen in {seen[rid]}", "P0"))
                else:
                    seen[rid] = f"{rel}:{line_no}"
            # Content that merely round-trips through a damaged source file is
            # not a usable requirement quote. Keep it as a finding for manual
            # repair rather than silently treating it as valid evidence.
            for field_name in ("source_section", "source_quote", "atomic_assertion"):
                value = (row.get(field_name) or "").strip()
                if any(marker in value for marker in MOJIBAKE_MARKERS):
                    audit.findings.append(Finding("suspect-encoding", rel, f"line {line_no}: {field_name} contains suspected encoding damage", "P1"))
            assertion = (row.get("atomic_assertion") or "").strip()
            if any(marker in assertion for marker in COMPOUND_MARKERS):
                audit.findings.append(Finding("compound-assertion", rel, f"line {line_no}: atomic_assertion contains a compound marker; split and review", "P1"))
            source = (row.get("source_path") or "").strip()
            if source:
                source_path = root / source
                if not source_path.is_file():
                    audit.findings.append(Finding("missing-source", rel, f"line {line_no}: {source}", "P0"))
                else:
                    quote = (row.get("source_quote") or "").strip()
                    section = (row.get("source_section") or "").strip()
                    line_match = re.search(r"(?:^|:)(\d+)\s*$", section)
                    lines = read_text(source_path).splitlines()
                    if line_match:
                        n = int(line_match.group(1))
                        actual = lines[n - 1].strip() if 1 <= n <= len(lines) else ""
                        if not quote or quote not in actual:
                            audit.findings.append(Finding("quote-mismatch", rel, f"line {line_no}: {source}:{n}; quote not found on referenced line", "P1"))
                    elif quote and quote not in read_text(source_path):
                        audit.findings.append(Finding("quote-mismatch", rel, f"line {line_no}: quote not found in {source} (no line number in source_section)", "P1"))
    audit.counts["requirement_rows"] = sum(1 for p in csv_files(root) for _ in csv.DictReader(p.open(encoding="utf-8-sig", newline="")))


def table_rows(text: str, prefix: str) -> list[tuple[int, str]]:
    rows = []
    for no, line in enumerate(text.splitlines(), 1):
        if not line.lstrip().startswith("|") or re.match(r"^\|\s*:?-{2,}", line):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and not cells[0].startswith("ID") and (
            cells[0].startswith(prefix) or (prefix == "" and re.fullmatch(r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+", cells[0]))
        ):
            rows.append((no, line))
    return rows


def check_audit_markdown(root: Path, audit: Audit) -> None:
    for directory, prefix, minimum, label, out in (
        ("02-pages", ("",), 100, "page", audit.page_counts),
        ("03-logic", ("LOGIC-",), 60, "logic", audit.logic_counts),
    ):
        file_glob = "PAGE-*.md" if label == "page" else "LOGIC-*.md"
        for path in sorted((root / "audit" / directory).glob(file_glob)):
            # Only numbered business logic reports are auditable here;
            # templates and notes are supporting artifacts, not logic files.
            if label == "logic" and not re.match(r"^LOGIC-\d{3}-.+\.md$", path.name):
                continue
            if path.name == "PAGE-AUDIT-TEMPLATE.md":
                continue
            text = read_text(path)
            rows = []
            for p in prefix:
                rows.extend(table_rows(text, p))
            # A page may use IDs without PAGE prefix (e.g. ADMIN-ADJUST).
            count = len(set(line for _, line in rows))
            rel = str(path.relative_to(root))
            out[path.name] = count
            if count < minimum:
                audit.findings.append(Finding(f"{label}-count", rel, f"{count} atomic rows; minimum is {minimum}", "P0"))
            for no, line in rows:
                if any(phrase.lower() in line.lower() for phrase in TEMPLATE_PHRASES):
                    audit.findings.append(Finding("template-language", rel, f"line {no}: template phrasing in atomic row", "P0"))
                if label == "logic" and UNCONFIRMED.search(line):
                    audit.findings.append(Finding("unconfirmed", rel, f"line {no}: unconfirmed placeholder", "P0"))
            # Status gate: PASS requires concrete implementation and test evidence.
            for no, line in rows:
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                statuses = {"UNKNOWN", "PASS", "FAIL", "DEMO", "DEFERRED", "N/A"}
                status_indexes = [i for i, c in enumerate(cells) if c in statuses]
                for status_i in status_indexes:
                    status = cells[status_i]
                    if status == "PASS":
                        evidence = cells[4:status_i]
                        if not evidence or any(MISSING_EVIDENCE.match(x) or UNCONFIRMED.search(x) for x in evidence):
                            audit.findings.append(Finding("invalid-pass", rel, f"line {no}: PASS lacks concrete evidence", "P0"))
                    elif status in {"N/A", "DEMO", "DEFERRED"}:
                        tail = cells[status_i + 1:]
                        if not tail or all(MISSING_EVIDENCE.match(x) for x in tail):
                            audit.findings.append(Finding("missing-status-basis", rel, f"line {no}: {status} requires a written basis", "P1"))
                # Catch statuses outside the permitted vocabulary in likely status cells.
                for i, cell in enumerate(cells):
                    if i >= 4 and cell.lower() in {"pass", "fail", "unknown", "demo", "deferred", "n/a"}:
                        continue
                    if i >= 4 and cell.lower() in {"pending", "todo", "tbd", "in progress"}:
                        audit.findings.append(Finding("invalid-status", rel, f"line {no}: unsupported status {cell!r}", "P1"))


def md_report(root: Path, audit: Audit) -> str:
    by_kind = Counter(f.kind for f in audit.findings)
    status = "PASS" if not audit.findings else "FAIL"
    lines = ["# 审计产物质量报告", "", f"- 结论：**{status}**", f"- 需求 CSV 行数：{audit.counts.get('requirement_rows', 0)}", f"- 发现数：{len(audit.findings)}", "", "## 校验范围", "", "- 需求 CSV：必填字段、req_id 唯一、source_path 存在、source_quote 与源文件行/内容对应，并检查疑似编码损坏及复合断言。", "- 页面审计：非模板 PAGE 文件原子项不少于 100 条，并拒绝模板话术。", "- 逻辑审计：非模板 LOGIC 文件原子项不少于 60 条，拒绝模板话术和 `unconfirmed` 占位。", "- 状态规则：PASS 必须带具体证据；UNKNOWN 不被提升为 PASS。", ""]
    lines += ["## 页面与逻辑条数", "", "| 类型 | 文件 | 原子项 | 门槛 | 结果 |", "|---|---|---:|---:|---|"]
    for name, count in sorted(audit.page_counts.items()): lines.append(f"| page | `{name}` | {count} | 100 | {'PASS' if count >= 100 else 'FAIL'} |")
    for name, count in sorted(audit.logic_counts.items()): lines.append(f"| logic | `{name}` | {count} | 60 | {'PASS' if count >= 60 else 'FAIL'} |")
    lines += ["", "## 发现分类", "", "| 类别 | 数量 |", "|---|---:|"] + [f"| `{k}` | {v} |" for k, v in sorted(by_kind.items())]
    lines += ["", "## 发现明细", "", "| 严重度 | 类别 | 文件 | 详情 |", "|---|---|---|---|"]
    lines += [f"| {f.severity} | `{f.kind}` | `{f.path}` | {f.detail.replace('|', '\\|')} |" for f in audit.findings]
    return "\n".join(lines) + "\n"


def progress_report(audit: Audit) -> str:
    total_pages, good_pages = len(audit.page_counts), sum(v >= 100 for v in audit.page_counts.values())
    total_logic, good_logic = len(audit.logic_counts), sum(v >= 60 for v in audit.logic_counts.values())
    gate = 'PASS' if not audit.findings else 'FAIL'
    return "\n".join(["# 审计进度汇总", "", "> 本报告由只读校验工具生成；不代表业务实现已通过验收。", "", "## 覆盖概览", "", f"- 需求原子项：{audit.counts.get('requirement_rows', 0)} 条", f"- 页面审计：{good_pages}/{total_pages} 个文件达到 100 条门槛", f"- 逻辑审计：{good_logic}/{total_logic} 个文件达到 60 条门槛", f"- 质量发现：{len(audit.findings)} 项", f"- 形式质量门禁：{gate}", "- 实质业务验收：BLOCKED（需求证据、源码定位和测试证据仍需逐项闭环）", "", "## 处理原则", "", "- 任何缺少源码/测试定位的条目保持 `UNKNOWN`，不得判 `PASS`。", "- 发现模板话术、`unconfirmed` 占位、疑似编码损坏、复合断言、缺失源文件或引用不匹配时，先修订审计产物再进入验收。", "- 本次工具未修改业务源码、已有审计明细或模板文件。", ""]) 


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    root = args.root.resolve()
    audit = Audit()
    check_requirements(root, audit)
    check_audit_markdown(root, audit)
    (root / "audit" / "09-reviews").mkdir(parents=True, exist_ok=True)
    (root / "audit" / "reports").mkdir(parents=True, exist_ok=True)
    (root / "audit" / "09-reviews" / "artifact-quality-report.md").write_text(md_report(root, audit), encoding="utf-8")
    (root / "audit" / "reports" / "audit-progress-summary.md").write_text(progress_report(audit), encoding="utf-8")
    print(f"{('PASS' if not audit.findings else 'FAIL')}: {len(audit.findings)} findings")
    return 0 if not audit.findings else 1

if __name__ == "__main__":
    raise SystemExit(main())
