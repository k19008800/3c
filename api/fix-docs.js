const fs = require("fs");
const path = require("path");

const filePath = path.resolve(__dirname, "..", "docs", "PRD-用户端体验增强.md");
const content = fs.readFileSync(filePath, "utf-8");

function smartFix(text) {
  let r = text;

  // 修复表格行尾的 ?
  r = r.replace(/\?(\s*)$/gm, "|$1");
  r = r.replace(/\?(\s*)\|/g, "|$1|");
  r = r.replace(/\|(\s*)\?/g, "|$1|");

  // 修复中文字符后的 ?（通常应该是 ）、或中文字符的结尾）
  r = r.replace(/([\u4e00-\u9fff])\?(\s*)$/gm, "$1$2");
  r = r.replace(/([\u4e00-\u9fff])\?(\s*)\|/g, "$1$2|");
  r = r.replace(/([\u4e00-\u9fff])\?(\s*)\n/g, "$1$2\n");
  r = r.replace(/\?([\u4e00-\u9fff])/g, "$1");

  // 修复英文单词连接处的 ?（通常是空格或连字符）
  r = r.replace(/([a-zA-Z])\?([a-zA-Z])/g, "$1 $2");

  // 修复数字/符号间的 ?
  r = r.replace(/(\d)\?(\d)/g, "$1$2");

  // 修复表格单元格中的 ? 在非 ASCII 前后
  // 这些可能是 、 或 ：
  r = r.replace(/([^\x00-\x7F])\?(\s*)\|/g, "$1$2|");
  r = r.replace(/\|(\s*)\?([^\x00-\x7F])/g, "|$1$2");

  // 修复行首的 ?
  r = r.replace(/^\?/gm, "");

  // 修复连续多个 ?? 为空
  r = r.replace(/\?{2,}/g, "");

  // 最后，剩余的单个 ? 在表格中替换为 ｜
  r = r.replace(/\|([^|]*)\?([^|]*)\|/g, "|$1$2|");

  // 剩余 ? 在中文上下文中
  r = r.replace(/(\S)\?(\S)/g, "$1$2");

  return r;
}

const fixed = smartFix(content);
const afterQ = (fixed.match(/\?/g) || []).length;
console.log("After smart fix ? count:", afterQ);

// 显示剩余的 ? 行
const lines = fixed.split("\n");
lines.forEach((line, i) => {
  if (line.includes("?")) {
    console.log("L" + (i + 1) + " (remaining): " + line.replace(/\?/g, "【?】"));
  }
});

if (afterQ < 20) {
  fs.writeFileSync(filePath, fixed, "utf-8");
  console.log("\nSaved fixed version. Remaining ?:", afterQ);
} else {
  console.log("\nToo many remaining ?, not saving");
}