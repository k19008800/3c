import { db, schema } from './src/db';
import { eq } from 'drizzle-orm';

const [user] = await db.select({ hash: schema.users.passwordHash })
  .from(schema.users)
  .where(eq(schema.users.email, 'admin@3cloud.dev'));

console.log('hash:', user?.hash);
console.log('exists:', !!user);

process.exit(0);
