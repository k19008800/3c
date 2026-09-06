#!/usr/bin/env node
/**
 * req-completeness-check.cjs
 * 3cloud 需求文档完整性自动核对（可复用）
 *
 * 用法：
 *   node scripts/req-completeness-check.cjs <目标目录>
 *   node scripts/req-completeness-check.cjs          # 默认扫 docs/00-index + 正式文档目录
 *
 * 核对项（见 docs/00-index/completeness-checklist.md）：
 *   [F1] 文件存在且非空
 *   [F2] 文档状态 = approved / accepted（ADR）
 *   [F3] 无空壳/占位标记（待补充/待迁移/TBD/待从…拆分等）作为正文
 *   [F4] 含 [?] 帮助（页面级[?]）；SPEC 底部含 "[?] 页面帮助与按钮级帮助对照表"
 *   [F5] 含文档 ID 头、语义化版本（vMAJOR.MINOR.PATCH）
 *   [F6] 相对链接可解析（命中的 .md 存在）
 * 无参数依赖、纯 Node（fs/path），可随处复用。
 */
const fs = require("fs");
const path = require("path");

const PROJ = process.cwd();
const PLACEHOLDERS = [
  "待补充", "待迁移", "待从", "待拆分", "待建立真实", "待核验", "TBD",
  "待冻结", "待从来源", "NEEDS-MANUAL-RECOVERY",
];
const VERSION_RE = /v\d+\.\d+\.\d+/;

function listMd(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listMd(p));
    else if (ent.name.endsWith(".md")) out.push(p);
  }
  return out.sort();
}

function resolveLink(fromFile, target) {
  // 去掉 #anchor 与查询
  const clean = target.replace(/#.*$/, "").replace(/\?.*$/, "");
  if (!clean) return true;
  let base = path.dirname(fromFile);
  let cand = path.resolve(base, clean);
  if (fs.existsSync(cand)) return true;
  // 大小写不敏感兜底（Windows）与扩展名补齐
  cand = path.resolve(base, clean + ".md");
  if (fs.existsSync(cand)) return true;
  const dir = fs.existsSync(path.dirname(cand)) ? fs.readdirSync(path.dirname(cand)) : [];
  return dir.some((f) => f.toLowerCase() === path.basename(cand).toLowerCase());
}

function checkFile(file) {
  const rel = path.relative(PROJ, file);
  const raw = fs.readFileSync(file, "utf8");
  const lines = raw.split(/\r?\n/);
  const results = [];

  // F1 非空
  results.push({ id: "F1", name: "非空文件", pass: raw.trim().length > 100 });

  // F2 状态
  const stLine = lines.find((l) => /^\s*[-*]\s*状态\s*[:：]/.test(l)) || "状态：draft";
  const st = (stLine.split(/[:：]/)[1] || "").trim().toLowerCase();
  const statusOk = st === "approved" || st === "accepted" || st === "review" && rel.includes("ADR");
  // 严格：正式正文须 approved；ADR 须 accepted。index/checklist 允许 review/superseded 例外另行判断
  const isAdr = /ADR-\d+/.test(rel || file);
  let statusPass;
  if (isAdr) statusPass = st === "accepted";
  else if (/00-index|checklist/.test(rel)) statusPass = true; // 治理索引按单独标准
  else statusPass = st === "approved";
  results.push({ id: "F2", name: `状态=${st}`, pass: statusPass });

  // F3 占位（仅对实质需求正文做硬门槛；治理/索引/ADR 允许引用这些词）
  const isGovernance = /00-index|README|checklist|glossary|decision-register/.test(rel || path.basename(file)) || isAdr;
  const hits = PLACEHOLDERS.filter((p) => raw.includes(p));
  const phPass = isGovernance || hits.length === 0;
  results.push({ id: "F3", name: "无空壳占位", pass: phPass, note: phPass ? (isGovernance ? "(元文档，跳过)" : "") : `命中:${hits.join(",")}` });

  // F4 [?] 帮助
  const qMark = (raw.match(/\[?\]/g) || []).length;
  const specButtonTable = /按钮级帮助对照表/.test(raw);
  const pageHelpNote = /页面帮助/.test(raw) || /\[?\] 帮助/.test(raw) || qMark > 0;
  // [?] 帮助是 UI 层要求：SPEC/PRD/前端交互文档需要页面级+按钮级；纯 API 契约与地图/索引/含 REVIEW/overview 类文档豁免。
  const isSpec = /03-functional-spec/.test(rel || file) || /SPEC-/.test(path.basename(file));
  const isApiDoc = /05-api/.test(rel || file) || /api-reference/.test(path.basename(file));
  const isOverview = /overview|README|INDEX|map|inventory|checklist|register|glossary|open-issues|issues/.test(path.basename(file));
  let helpPass;
  if (isApiDoc || isOverview) helpPass = true;
  else if (isSpec) helpPass = pageHelpNote && specButtonTable;
  else helpPass = pageHelpNote;
  results.push({ id: "F4", name: "[?]帮助", pass: helpPass, note: (isApiDoc||isOverview) ? "(API/索引文档，豁免?帮助)" : `页面标记×${qMark}${specButtonTable ? "；含按钮级对照表" : "；缺按钮级对照表"}` });

  // F5 ID 与版本
  const hasId = /文档 ?ID\s*[:：]/.test(raw) || /决策 ?ID\s*[:：]/.test(raw);
  const hasVer = VERSION_RE.test(raw);
  results.push({ id: "F5", name: "ID+版本", pass: hasId && hasVer, note: `ID:${hasId} 版本:${hasVer}` });

  // F6 相对链接
  const broken = [];
  const linkRe = /\]\(([^)]+)\)/g;
  let m;
  while ((m = linkRe.exec(raw))) {
    const t = m[1];
    if (t.startsWith("http") || t.startsWith("#")) continue;
    if (!resolveLink(file, t)) broken.push(t);
  }
  results.push({ id: "F6", name: "链接可解析", pass: broken.length === 0, note: broken.length ? `断链:${broken.slice(0, 5).join(",")}` : "" });

  return { file: rel, results };
}

function main() {
  let target = process.argv[2] || "docs";
  const root = path.resolve(PROJ, target);
  const files = listMd(root);
  if (!files.length) {
    console.log(`GRADE=F (no md files under ${target})`);
    process.exit(1);
  }
  console.log(`# req-completeness-check  ${target}  (${files.length} files)\n`);
  let fails = 0;
  for (const f of files) {
    const { file, results } = checkFile(f);
    const bad = results.filter((r) => !r.pass);
    fails += bad.length;
    console.log(`## ${file}`);
    for (const r of results) {
      console.log(`  [${r.pass ? "PASS" : "FAIL"}] ${r.id} ${r.name}${r.note ? " — " + r.note : ""}`);
    }
    if (!bad.length) console.log("   → 该文件核对通过");
    else console.log(`   → ${bad.length} 项未通过`);
    process.stdout.write("\n");
  }
  const total = files.length * 6;
  const grade = fails === 0 ? "A" : fails <= Math.ceil(total * 0.2) ? "B" : fails <= Math.ceil(total * 0.5) ? "C" : "F";
  console.log(`GRADE=${grade}  (${files.length} files, ${total} checks, ${fails} FAIL)`);
  console.log("有任一 FAIL → 该目录不满足'可开发'准入，按 completeness-checklist.md 逐项关闭。");
  return fails ? 1 : 0;
}

process.exit(main());