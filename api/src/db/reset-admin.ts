import "dotenv/config";
import { eq } from "drizzle-orm";
import { createDb, closeDb, getDb } from "./index.js";
import { users } from "./schema.js";
import bcrypt from "bcryptjs";

async function main() {
  await createDb();
  const db = getDb();
  const hash = await bcrypt.hash("Admin@123456", 10);
  await db.update(users).set({ passwordHash: hash, status: "active" }).where(eq(users.id, 41));
  console.log("Admin 41 password reset to Admin@123456, status set to active");
  await closeDb();
}
main().catch(console.error);
