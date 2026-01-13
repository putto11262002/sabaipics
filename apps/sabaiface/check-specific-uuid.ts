import { createDb } from '@sabaipics/db';
import { sql } from 'drizzle-orm';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const db = createDb(process.env.DATABASE_URL);

  // Check the UUID from the first error
  const uuid1 = '386cfdb1-5bb4-418b-919f-a4420d1c257a';
  const result1 = await db.execute(sql`
    SELECT id, event_id, provider
    FROM faces
    WHERE id = ${uuid1}
  `);

  console.log(`Checking UUID: ${uuid1}`);
  if (result1.rows.length > 0) {
    console.log('  FOUND:', result1.rows[0]);
  } else {
    console.log('  NOT FOUND');
  }

  // Check total faces again
  const total = await db.execute(sql`SELECT COUNT(*) as count FROM faces`);
  console.log(`\nTotal faces in database: ${total.rows[0].count}`);
}

main().catch(console.error);
