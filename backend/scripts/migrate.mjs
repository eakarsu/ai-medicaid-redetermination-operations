// migrate.mjs — applies every SQL migration in backend/migrations in lexicographic order.
// Used by containers and cloud images where the psql CLI is unavailable.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const backendRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationsDir = path.join(backendRoot, 'migrations');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();
for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  process.stdout.write(`Applying ${file}… `);
  await pool.query(sql);
  console.log('done');
}
await pool.end();
console.log(`Applied ${files.length} migration(s).`);
