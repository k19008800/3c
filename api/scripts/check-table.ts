import { Pool } from 'pg';

async function check() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'threecloud',
    user: 'postgres',
    password: 'postgres',
  });

  const result = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'agent_customer_consumption'
    ORDER BY ordinal_position
  `);
  
  console.log('agent_customer_consumption 表结构:');
  console.table(result.rows);
  
  await pool.end();
}

check().catch(console.error);
