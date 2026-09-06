from pathlib import Path
import csv
import datetime
import os
import re
import tempfile

root = Path(__file__).resolve().parent.parent
reqdir = root / "audit" / "01-requirements"
outdir = root / "audit" / "reports"
outdir.mkdir(exist_ok=True)

MATRIX_FIELDS = [
    "req_id", "domain", "requirement_source", "source_section",
    "page_logic_artifact", "status", "evidence_basis", "classification",
]
INPUT_FIELDS = [
    "req_id", "domain", "source_path", "source_section", "source_quote",
    "category", "priority", "atomic_assertion", "expected_evidence", "notes",
]
INPUTS = [
    reqdir / "core-finance-atomic-v2.csv",
    reqdir / "admin-portal-atomic-v2.csv",
    reqdir / "user-agent-atomic-v2.csv",
]
ERROR_FIELDS = ["original_line", "file", "req_id", "error", "raw_fragment"]


def text_ok(value: str) -> bool:
    return bool(value.strip()) and "\ufffd" not in value


def parse_inputs():
    rows = []
    errors = []
    seen_ids = {}
    counts = {}
    for path in INPUTS:
        counts[path.name] = {"physical": 0, "valid": 0, "invalid": 0}
        if not path.is_file():
            errors.append([0, path.name, "", "missing input file", ""])
            continue
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle, strict=True)
            try:
                header = next(reader)
            except (StopIteration, csv.Error) as exc:
                errors.append([1, path.name, "", f"invalid or empty CSV: {exc}", ""])
                continue
            if header != INPUT_FIELDS:
                errors.append([1, path.name, "", "unexpected header", repr(header)])
            for line_no, raw in enumerate(reader, 2):
                counts[path.name]["physical"] += 1
                fragment = repr(raw)
                rid = raw[0].strip() if raw else ""
                problems = []
                if len(raw) != 10:
                    problems.append(f"expected 10 columns, got {len(raw)}")
                if len(raw) >= 1 and not text_ok(raw[0]):
                    problems.append("req_id is empty or contains Unicode replacement")
                elif len(raw) >= 1 and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", raw[0].strip()):
                    problems.append("req_id has invalid syntax")
                if len(raw) >= 2 and not text_ok(raw[1]):
                    problems.append("domain is empty or contains Unicode replacement")
                if len(raw) >= 3 and not text_ok(raw[2]):
                    problems.append("source_path is empty or contains Unicode replacement")
                elif len(raw) >= 3 and ("|" in raw[2] or "\\x00" in raw[2]):
                    problems.append("source_path contains delimiter/control corruption")
                if any("\ufffd" in x for x in raw):
                    problems.append("row contains Unicode replacement character")
                if rid in seen_ids:
                    problems.append(f"duplicate req_id (first seen in {seen_ids[rid]})")
                if problems:
                    errors.append([line_no, path.name, rid, "; ".join(problems), fragment])
                    counts[path.name]["invalid"] += 1
                    continue
                seen_ids[rid] = f"{path.name}:{line_no}"
                counts[path.name]["valid"] += 1
                section = raw[3].strip()
                # Do not propagate long canonical prose; trace keys are authoritative.
                damaged = any(token in section for token in ("鎴", "鐨", "锛", "鈥", "馃"))
                section_out = "(section text withheld: canonical source_section contains encoding damage)" if damaged else section
                rows.append([rid, raw[1].strip(), raw[2].strip(), section_out, "", "UNKNOWN", "No verified implementation file:line/symbol and test-case evidence is present in the current audit materials.", "UNKNOWN"])
    return rows, errors, counts


def atomic_count(path):
    n = 0
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.lstrip().startswith("|") and not re.match(r"^\|\s*:?-{2,}", line):
            cells = [x.strip() for x in line.strip().strip("|").split("|")]
            # Atomic IDs include page/logic-specific IDs and compact batch
            # IDs such as M-001. Count uppercase hyphenated IDs only.
            if cells and re.fullmatch(r"[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+", cells[0]):
                n += 1
    return n


def write_text(path, content):
    # Write beside the destination and replace atomically so a stale or
    # concurrent reader can never observe a half-written report.
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def write_csv(path, header, data):
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(header)
            writer.writerows(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


rows, errors, counts = parse_inputs()
# Strict output gate: fail loudly rather than emit a malformed or silently shifted matrix.
for row in rows:
    if len(row) != 8 or any(value is None for value in row):
        raise RuntimeError(f"matrix row failed 8-column gate: {row!r}")
write_csv(outdir / "traceability-matrix.csv", MATRIX_FIELDS, rows)
write_csv(outdir / "traceability-parse-errors.csv", ERROR_FIELDS, errors)

pages = sorted((root / "audit" / "02-pages").glob("PAGE-*.md"))
# Exclude only the reusable audit template.  A real page such as
# AdminEmailTemplatesPage legitimately contains "templates" in its name.
pages = [p for p in pages if p.name != "PAGE-AUDIT-TEMPLATE.md"]
logic = sorted((root / "audit" / "03-logic").glob("LOGIC-[0-9][0-9][0-9]-*.md"))
pc = [(p.name, atomic_count(p)) for p in pages]
lc = [(p.name, atomic_count(p)) for p in logic]
baseline_page_inventory = root / "audit" / "00-baseline" / "page-inventory.csv"
if baseline_page_inventory.is_file():
    with baseline_page_inventory.open("r", encoding="utf-8-sig", newline="") as handle:
        baseline_page_count = sum(1 for _ in csv.DictReader(handle))
else:
    baseline_page_count = len(pc)
page_report_gap = max(0, baseline_page_count - len(pc))
now = datetime.date.today().isoformat()
summary = "; ".join(f"{name}: {v['valid']} valid/{v['invalid']} invalid (physical {v['physical']})" for name, v in counts.items())
error_note = f"- 解析异常：{len(errors)} 条，逐条写入 `traceability-parse-errors.csv`；异常记录未进入矩阵。\n" if errors else "- 解析异常：0 条；已完成逐行结构与语义校验。\n"

write_text(outdir / "page-coverage-report.md", f"""# Page Coverage Report\n\n只读重建（{now}）。本报告仅描述审计产物覆盖，不把页面文档存在视为业务实现通过。\n\n## 形式门禁\n\n- 基线页面数：{baseline_page_count}（以 `audit/00-baseline/page-inventory.csv` 为准）。\n- 页面审计明细：{len(pc)} 个非模板 `PAGE-*.md` 文件。\n- 原子行计数：{sum(n >= 100 for _, n in pc)}/{len(pc)} 达到每文件 100 行形式阈值。\n- 基线与报告文件差异：{page_report_gap} 个页面未能通过当前报告文件名口径映射；该差异不等于页面实现缺失。\n- 形式门禁只检查文件、表格结构和计数；不等于功能验收。\n\n## 文件覆盖明细\n\n| 文件 | 原子行 | 形式结果 | 实质状态 |\n|---|---:|---|---|\n""" + "\n".join(f"| `{n}` | {c} | {'达到阈值' if c >= 100 else '低于阈值'} | UNKNOWN（证据未成对确认） |" for n, c in pc) + "\n")
write_text(outdir / "logic-coverage-report.md", f"""# Logic Coverage Report\n\n只读重建（{now}）。不引用历史 validation-report 结论。\n\n- 编号逻辑审计文件：{len(lc)} 个。\n- 原子行计数结构阈值：每文件至少 60 行；{sum(n >= 60 for _, n in lc)}/{len(lc)} 达到阈值。\n- 要求通过必须同时给出真实实现文件:行号/符号和测试用例；当前矩阵使用 UNKNOWN。\n\n| 文件 | 原子行 | 形式结果 | 实质状态 |\n|---|---:|---|---|\n""" + "\n".join(f"| `{n}` | {c} | {'达到阈值' if c >= 60 else '低于阈值'} | UNKNOWN（需实现定位+测试证据） |" for n, c in lc) + "\n")
write_text(outdir / "full-gap-report.md", f"""# Full Gap Report\n\n只读重建（{now}），未修改业务源码、需求原文或审计明细。\n\n## 结论\n\n- 三份 canonical requirement CSV 逐条计数：{summary}。有效记录 **{len(rows)}** 条进入 `traceability-matrix.csv`。\n{error_note}- 矩阵每行严格 8 列，输出为 UTF-8 BOM，Python `utf-8-sig` 可读；未生成 None、错位列或 Unicode replacement。\n- 没有真实实现文件:行号/符号与测试用例的完整证据，状态保持 UNKNOWN。\n\n## 解析异常\n\n异常记录不可静默丢弃。异常原始行号、文件、req_id、错误及原始片段见 `traceability-parse-errors.csv`。\n\n## 实质门禁\n\n只有“真实实现定位 + 测试用例”同时存在时才允许 PASS；明确缺失为 GAP/DOC_CODE_GAP，漂移为 CODE_DOC_DRIFT，资料不足为 UNKNOWN。页面级和按钮级 `[?]` 帮助必须以代码与测试验证。\n""")
write_text(outdir / "p0-p1-remediation-list.md", f"""# P0/P1 Remediation List\n\n只读重建（{now}）。\n\n1. 为 {len(rows)} 条有效要求补齐真实实现文件:行号/符号与测试用例；证据齐全前保持 UNKNOWN。\n2. 处理 `traceability-parse-errors.csv` 中的 {len(errors)} 条输入异常，修复源数据前不得回填矩阵。\n3. 补齐权限、异常、事务、并发、幂等、回滚、审计和金额/余额安全证据。\n""")
write_text(outdir / "traceability-rebuild-notes.md", f"""# Traceability Rebuild Notes\n\n- 重建日期：{now}\n- 输入逐条计数：{summary}\n- 有效矩阵记录：{len(rows)}；解析异常：{len(errors)}。\n- 异常行完整写入 `traceability-parse-errors.csv`，未静默丢弃；矩阵输出前执行 8 列/None 严格门禁。\n- 所有新 CSV/汇总报告采用 UTF-8 BOM（`utf-8-sig`）；未修改业务源码或 canonical CSV。\n""")
print(f"rows={len(rows)} errors={len(errors)}; {summary}")
