import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface RunRow {
  [key: string]: string | number | boolean | null | undefined;
}

function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export async function writeRunMetadata(filePath: string, metadata: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(metadata, null, 2) + '\n', 'utf8');
}

export async function appendRunCsv(csvPath: string, header: string[], rows: RunRow[]) {
  await fs.mkdir(path.dirname(csvPath), { recursive: true });

  const exists = await fs
    .access(csvPath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    await fs.writeFile(csvPath, header.join(',') + '\n', 'utf8');
  }

  const lines = rows.map((row) => {
    const values = header.map((k) => {
      const v = row[k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return csvEscape(String(v));
    });
    return values.join(',');
  });

  await fs.appendFile(csvPath, lines.join('\n') + '\n', 'utf8');
}
