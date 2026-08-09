import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/threecloud_v3';

const client = postgres(connectionString, { max: 20 });

export const db = drizzle(client, { schema });
export { schema };
export default db;
