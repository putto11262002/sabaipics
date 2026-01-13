import { createDb } from '@sabaipics/db';
import { sql } from 'drizzle-orm';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const db = createDb(process.env.DATABASE_URL);
  const result = await db.execute(sql`DELETE FROM faces WHERE event_id LIKE 'test-%'`);
  console.log('✅ Cleaned up test data');
}

main().catch(console.error);
