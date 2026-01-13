import { createDb } from '@sabaipics/db';
import { sql } from 'drizzle-orm';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const db = createDb(process.env.DATABASE_URL);

  // Check all faces by eventId
  const result = await db.execute(sql`
    SELECT event_id, COUNT(*) as count
    FROM faces
    GROUP BY event_id
    ORDER BY event_id
  `);

  console.log('Faces by eventId:');
  if (result.rows.length === 0) {
    console.log('  (no faces in database)');
  } else {
    result.rows.forEach((r: any) => {
      console.log(`  ${r.event_id}: ${r.count} faces`);
    });
  }

  // Check for sabaiface provider
  const sabaifaceCount = await db.execute(sql`
    SELECT COUNT(*) as count FROM faces WHERE provider = 'sabaiface'
  `);
  console.log(`\nTotal SabaiFace faces: ${sabaifaceCount.rows[0].count}`);
}

main().catch(console.error);
