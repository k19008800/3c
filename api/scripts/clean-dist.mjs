#!/usr/bin/env node
/** Remove the TypeScript compiler output before a production build.
 *
 * The post-build import rewriter resolves specifiers against dist. Keeping
 * stale files there can make a directory entry (for example ./db/index.js)
 * look like a sibling file (./db.js), producing an invalid Node ESM build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
fs.rmSync(dist, { recursive: true, force: true });
