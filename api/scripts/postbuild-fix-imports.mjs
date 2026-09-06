#!/usr/bin/env node
/**
 * postbuild-fix-imports — 修复 tsc 在 `moduleResolution: "bundler"` 下输出的无扩展名相对导入。
 *
 * 背景（ISSUE #22）：api/tsconfig 继承 `tsconfig.base.json` 的 `moduleResolution: "bundler"`，
 * `tsc` 生成的 ESM `.js` 保留 `from './db'` 这类无扩展名相对导入，Node ESM 无法解析，
 * 导致 `node dist/index.js`（`pnpm start` 与 deploy/ecosystem）启动即 `ERR_MODULE_NOT_FOUND`。
 *
 * 本脚本在 `tsc` 之后运行：把 dist 下所有 `.js` 里的**相对**导入说明符解析为真实文件路径：
 *   - 若 `<spec>.js` 存在 → 说明符补 `.js`（`./lib/env` → `./lib/env.js`）
 *   - 否则若 `<spec>/index.js` 存在 → 说明符补 `/index.js`（`./db` → `./db/index.js`）
 * 非相对导入、非 `.js` 相对目标（.json/.css 等）、及无法解析的说明符保持不动。幂等。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function collectJs(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectJs(p, acc);
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

const EXTS = /\.(js|json|css|svg|png|wasm|node)$/;

/**
 * 解析相对说明符 spec 相对 importer（dist 下某 .js 文件）的实际文件。
 * 返回重写后的说明符；无法解析返回 null（保持原样）。
 */
function resolveSpec(importer, spec) {
  if (!/^\.\.?\//.test(spec) || EXTS.test(spec)) return null;
  const base = path.resolve(path.dirname(importer), spec);
  if (fs.existsSync(base + '.js')) return spec + '.js';
  if (fs.existsSync(path.join(base, 'index.js'))) return spec.replace(/\/$/, '') + '/index.js';
  return null;
}

function transform(src, importer) {
  src = src.replace(/(\b(?:from|import)\s+['"])(\.\.?\/[^'"]+)(['"])/g, (_, pre, spec, post) => {
    const r = resolveSpec(importer, spec);
    return r ? pre + r + post : _;
  });
  src = src.replace(/(import\(\s*['"])(\.\.?\/[^'"]+)(['"]\s*\))/g, (_, pre, spec, post) => {
    const r = resolveSpec(importer, spec);
    return r ? pre + r + post : _;
  });
  return src;
}

const files = collectJs(dist);
let changed = 0, replaced = 0;
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  const after = transform(before, f);
  if (after !== before) {
    fs.writeFileSync(f, after, 'utf8');
    changed++;
    const beforeCount = (before.match(/(?:from|import)\s+['"]\.\.?\//g) || []).length;
    replaced += beforeCount;
  }
}
console.log(`[postbuild-fix-imports] scanned ${files.length} .js files; patched ${changed} files (${replaced} relative specifiers).`);
