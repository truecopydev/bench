import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { nommeUnePersonne, pieceNommeUnePersonne } from '../src/personnes.mjs';

const racine = join(import.meta.dirname, '..');
const pieces = readdirSync(join(racine, 'pieces')).filter((f) => f.endsWith('.json'));

test('the check sees a person: a title and a name, or a first name and a surname', () => {
	assert.equal(nommeUnePersonne('M. Dupont | 120 | 130'), true);
	assert.equal(nommeUnePersonne('Remuneration of Mrs Smith'), true);
	assert.equal(nommeUnePersonne('Marie SOUCLIER, Presidente'), true);
	assert.equal(nommeUnePersonne('Hans Müller | 1 200'), true);
	assert.equal(pieceNommeUnePersonne({ verite: { lignes: [['1', '2']] } }, '<td>Jean</td><td><span>Dupont</span></td>'), true);
});

test('the check leaves a company, a street and a plain table alone', () => {
	assert.equal(nommeUnePersonne('Christian Dior SE | 1 234'), false);
	assert.equal(nommeUnePersonne('12 rue Jean Jaures'), false);
	assert.equal(nommeUnePersonne('Revenue | 1 234 | 5 678'), false);
	assert.equal(nommeUnePersonne('Earnings per share | 1.20'), false);
});

test('no piece of the bench names a person, in its truth or in its published table', () => {
	const nommees = [];
	for (const f of pieces) {
		const p = JSON.parse(readFileSync(join(racine, 'pieces', f), 'utf8'));
		const html = readFileSync(join(racine, 'pieces', `${p.id}.html`), 'utf8');
		if (pieceNommeUnePersonne(p, html)) nommees.push(p.id);
	}
	assert.deepEqual(nommees, []);
});
