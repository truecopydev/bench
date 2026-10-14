import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const racine = join(import.meta.dirname, '..');
const pieces = readdirSync(join(racine, 'pieces')).filter((f) => f.endsWith('.json'));
const sources = JSON.parse(readFileSync(join(racine, 'sources.json'), 'utf8'));

test('the bench holds at least 300 pieces', () => {
	assert.ok(pieces.length >= 300, `${pieces.length}`);
});

test('every piece names its public address, open terms and truth, and its table is the one published', () => {
	for (const f of pieces) {
		const p = JSON.parse(readFileSync(join(racine, 'pieces', f), 'utf8'));
		assert.equal(`${p.id}.json`, f);
		assert.match(p.source.rapport, /^https:\/\/filings\.xbrl\.org\//, f);
		assert.ok(sources.ouvertes[p.source.registre], f);
		assert.deepEqual(p.source.termes, sources.ouvertes[p.source.registre], f);
		assert.ok(p.verite.lignes.length > 0, f);
		const html = readFileSync(join(racine, 'pieces', `${p.id}.html`));
		assert.equal(createHash('sha256').update(html).digest('hex'), p.source.sha256Page, f);
	}
});
