// ============================================================
//  3cloud (3C) — Fastify Application barrel
//  Split into app/ by concern; this file re-exports everything.
//  All existing `from "./app.js"` imports continue to work.
// ============================================================

export { buildApp, startServer } from "./app/index.js";
