import { createDb, faces } from '@sabaipics/db';
import crypto from 'crypto';

async function main() {
  const db = createDb(process.env.DATABASE_URL!);

  console.log('Testing direct insert into faces table...');

  const testFace = {
    id: crypto.randomUUID(),
    eventId: 'test-event',
    photoId: null,
    provider: 'sabaiface' as const,
    confidence: 0.95,
    boundingBox: { Width: 0.1, Height: 0.1, Left: 0.5, Top: 0.5 },
    descriptor: [0.1, 0.2, 0.3, ...Array(125).fill(0)], // 128-D vector
    attributes: {
      age: { low: 20, high: 30 },
      gender: { value: 'male', confidence: 0.9 },
    },
    rawResponse: {
      provider: 'sabaiface',
      faceApiResponse: { detections: [], modelVersion: 'test' },
    },
  };

  try {
    await db.insert(faces).values(testFace);
    console.log('✅ Insert successful!');
  } catch (error) {
    console.error('❌ Insert failed:');
    console.error(error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
