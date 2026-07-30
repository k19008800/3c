// run: npx tsx src/db/seed-admin-exec.ts
import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb, closeDb, getDb } from "./index.js";
import { users } from "./schema.js";
import bcrypt from "bcryptjs";

async function main() {
  await createDb();
  const db = getDb();

  const existing = await db.select().from(users).where(eq(users.email, "admin@3cloud.ai")).limit(1);
  if (existing.length > 0) {
    console.log("Admin already exists:", existing[0].id, existing[0].email);
    return;
  }

  const hash = await bcrypt.hash("***", 10);
  const [user] = await db.insert(users).values({
    email: "admin@3cloud.ai",
    passwordHash: hash,
    nickname: "Admin",
    userType: "personal",
    role: "admin",
    status: "active",
  }).returning();
  console.log("Admin created:", user.id, user.email);
}

main().catch(console.error).finally(() => closeDb());
