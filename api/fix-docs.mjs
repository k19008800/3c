import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function fixFile(relativePath) {
  const filePath = resolve(__dirname, "..", relativePath);
  const content = readFileSync(filePath, "utf-8");
  const beforeQ = (content.match(/\?/g) || []).length;

  let r = content;

  // 表格行尾 ?
  r = r.replace(/\?(\s*)$/gm, "|$1");
  r = r.replace(/\?(\s*)\|/g, "|$1|");
  r = r.replace(/\|(\s*)\?/g, "|$1|");

  // 中文字符后的 ?
  r = r.replace(/([\u4e00-\u9fff])\?(\s*)$/gm, "$1$2");
  r = r.replace(/([\u4e00-\u9fff])\?(\s*)\|/g, "$1$2|");
  r = r.replace(/([\u4e00-\u9fff])\?(\s*)\n/g, "$1$2\n");
  r = r.replace(/\?([\u4e00-\u9fff])/g, "$1");
  r = r.replace(/([\u4e00-\u9fff])\?(\s*)\r/g, "$1$2\r");

  // 英文连接
  r = r.replace(/([a-zA-Z])\?([a-zA-Z])/g, "$1 $2");
  r = r.replace(/(\d)\?(\d)/g, "$1$2");

  // 表格内 ? 在非 ASCII 前后
  r = r.replace(/([^\x00-\x7F])\?(\s*)\|/g, "$1$2|");
  r = r.replace(/\|(\s*)\?([^\x00-\x7F])/g, "|$1$2");

  // 行首 ?
  r = r.replace(/^\?/gm, "");

  // 连续 ??
  r = r.replace(/\?{2,}/g, "");

  // 表格内剩余 ?
  r = r.replace(/\|([^|]*)\?([^|]*)\|/g, "|$1$2|");

  // 剩余 ? 在非空白字符间
  r = r.replace(/(\S)\?(\S)/g, "$1$2");

  // 最后的单个 ? 移除
  r = r.replace(/\?(\s*)/g, "$1");

  const afterQ = (r.match(/\?/g) || []).length;
  console.log(`${relativePath}: ${beforeQ} -> ${afterQ} ?`);

  writeFileSync(filePath, r, "utf-8");
  return afterQ;
}

// 修复所有损坏文件
const files = [
  "docs/PRD-README.md",
  "docs/PRD-业务员支撑.md",
  "docs/PRD-用户体系.md",
  "docs/PRD-用户端体验增强.md",
  "docs/SPEC-§33-合规法务与成本分析.md",
];

let totalBefore = 0;
let totalAfter = 0;
files.forEach((f) => {
  const after = fixFile(f);
  // re-read to get before count
  const content = readFileSync(resolve(__dirname, "..", f), "utf-8");
  const before = (content.match(/\?/g) || []).length;
  totalBefore += before;
  totalAfter += after;
});
console.log(`\nTotal: ${totalBefore} -> ${totalAfter} ?`);