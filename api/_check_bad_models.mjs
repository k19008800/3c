import pg from 'pg';
const p = new pg.Pool({connectionString:'postgres://postgres@localhost:5432/threecloud'});
const r = await p.query("SELECT model_name, count(*)::int as cnt FROM call_logs WHERE model_name IN ('gpt-4o-mini','claude-3.5-sonnet','gpt-4o') AND user_agent LIKE 'stress-%' GROUP BY model_name");
r.rows.forEach(x => console.log(x.model_name + ': ' + x.cnt));

const t = await p.query("SELECT count(*)::int as total FROM call_logs WHERE model_name IN ('gpt-4o-mini','claude-3.5-sonnet','gpt-4o') AND user_agent LIKE 'stress-%'");
console.log('total bad model records: ' + t.rows[0].total);

// Check which models are actually active
const vm = await p.query("SELECT m.name FROM vendor_models vm JOIN models m ON m.id=vm.model_id WHERE vm.status=true AND vm.is_down=false");
console.log('Active models in DB: ' + vm.rows.map(r => r.name).join(', '));

p.end();
