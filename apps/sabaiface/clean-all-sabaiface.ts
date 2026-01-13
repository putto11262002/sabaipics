import { createDb } from '@sabaipics/db';
import { sql } from 'drizzle-orm';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const db = createDb(process.env.DATABASE_URL);

  // Delete all sabaiface faces using direct SQL
  const result = await db.execute(sql`DELETE FROM faces WHERE provider = 'sabaiface'`);

  console.log('✅ Deleted all SabaiFace test faces');
  console.log(`   Rows affected: ${result.rowCount ?? 'unknown'}`);
}

main().catch(console.error);
