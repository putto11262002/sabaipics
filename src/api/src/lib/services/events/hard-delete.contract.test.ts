import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EVENT_RELATION_STRATEGIES } from './hard-delete';

interface TableMeta {
	varName: string;
	tableName: string;
	refs: string[];
}

function loadSchemaTables(): TableMeta[] {
	const schemaDir = resolve(
		fileURLToPath(new URL('.', import.meta.url)),
		'../../../../../db/schema'
	);
	const indexFile = resolve(schemaDir, 'index.ts');
	const indexContent = readFileSync(indexFile, 'utf8');
	const exportedModules = new Set(
		Array.from(indexContent.matchAll(/export \* from '\.\/([^']+)'/g), (m) => `${m[1]}.ts`)
	);
	const files = readdirSync(schemaDir).filter((file) => extname(file) === '.ts');

	const tables: TableMeta[] = [];

	for (const file of files) {
		if (file === 'index.ts' || !exportedModules.has(basename(file))) continue;

		const content = readFileSync(resolve(schemaDir, file), 'utf8');
		const tableMatch = content.match(
			/export const (\w+)\s*=\s*pgTable\(\s*['"]([^'"]+)['"]/
		);
		if (!tableMatch) continue;

		const [, varName, tableName] = tableMatch;
		const refs = Array.from(
			content.matchAll(/references\(\(\)\s*=>\s*(\w+)\.id/g),
			(m) => m[1]
		);
		tables.push({ varName, tableName, refs });
	}

	return tables;
}

describe('hard-delete relationship coverage', () => {
	it('covers all direct and transitive event-linked FK tables', () => {
		const tables = loadSchemaTables();
		const varToTable = new Map(tables.map((t) => [t.varName, t.tableName]));
		const directEventOwned = new Set(
			tables.filter((t) => t.refs.includes('events')).map((t) => t.tableName)
		);

		const coveredDirect = new Set(Object.keys(EVENT_RELATION_STRATEGIES.direct));
		const coveredTransitive = new Set(Object.keys(EVENT_RELATION_STRATEGIES.transitive));
		const coveredAll = new Set([...coveredDirect, ...coveredTransitive]);

		for (const tableName of directEventOwned) {
			expect(
				coveredDirect.has(tableName),
				`Direct event FK table "${tableName}" is missing from EVENT_RELATION_STRATEGIES.direct`
			).toBe(true);
		}

		for (const table of tables) {
			for (const refSymbol of table.refs) {
				const referencedTable = varToTable.get(refSymbol);
				if (!referencedTable) continue;
				if (!directEventOwned.has(referencedTable)) continue;

				expect(
					coveredAll.has(table.tableName),
					`Transitive event FK table "${table.tableName}" (via "${referencedTable}") is missing from EVENT_RELATION_STRATEGIES`
				).toBe(true);
			}
		}

		expect(coveredDirect.has('feedback')).toBe(true);
	});
});
