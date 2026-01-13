import { createDb } from '@sabaipics/db';

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const result = await db.execute(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'faces'
    ORDER BY indexname
  `);

  console.log('Indexes on faces table:');
  result.rows.forEach((r: any) => {
    console.log(`  - ${r.indexname}`);
  });
}

main().catch(console.error);
