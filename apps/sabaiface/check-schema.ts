import { createDb } from '@sabaipics/db';

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const result = await db.execute(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'faces'
    ORDER BY ordinal_position
  `);

  console.log('Faces table columns:');
  result.rows.forEach((r: any) => {
    console.log(`  ${r.column_name}: ${r.data_type} (nullable: ${r.is_nullable})`);
  });
}

main().catch(console.error);
