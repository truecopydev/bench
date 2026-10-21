import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lecturesGardees, lignesLues, lireParLots } from '../src/temoins.mjs';

const pieces = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
const lecture = (p) => ({ id: p.id, rows: [[p.id]] });

test('every lot is on disk as soon as it is read: a lot that dies loses only itself', () => {
	const fichier = join(mkdtempSync(join(tmpdir(), 'temoins-')), 'docling.jsonl');
	const vues = [];
	assert.throws(() =>
		lireParLots(pieces, {
			taille: 2,
			fichier,
			lire: (lot) => {
				if (lot[0].id === 'e') throw new Error('killed');
				vues.push(lot.map((p) => p.id).join(''));
				return lot.map(lecture);
			}
		})
	);
	assert.deepEqual(vues, ['ab', 'cd']);
	assert.deepEqual(lecturesGardees(fichier).map((l) => l.id), ['a', 'b', 'c', 'd']);
});

test('a run that resumes after a death reads only what is missing and returns everything in bench order', () => {
	const fichier = join(mkdtempSync(join(tmpdir(), 'temoins-')), 'docling.jsonl');
	writeFileSync(fichier, ['b', 'd'].map((id) => JSON.stringify(lecture({ id }))).join('\n') + '\n');
	const lus = [];
	const lots = [];
	const lectures = lireParLots(pieces, { taille: 2, fichier, reprendre: true, lire: (lot) => (lus.push(...lot.map((p) => p.id)), lot.map(lecture)), surLot: (n, total) => lots.push(`${n}/${total}`) });
	assert.deepEqual(lus, ['a', 'c', 'e']);
	assert.deepEqual(lots, ['2/3', '3/3']);
	assert.deepEqual(lectures.map((l) => l.id), ['a', 'b', 'c', 'd', 'e']);
	assert.deepEqual(lecturesGardees(fichier).map((l) => l.id), ['a', 'b', 'c', 'd', 'e']);
	assert.equal(readFileSync(fichier, 'utf8').split('\n').filter(Boolean).length, 5);
});

test('without --reprendre a replay reads every piece again, whatever is on disk', () => {
	const fichier = join(mkdtempSync(join(tmpdir(), 'temoins-')), 'camelot.jsonl');
	writeFileSync(fichier, JSON.stringify({ id: 'a', rows: [['old']] }) + '\n');
	const lus = [];
	lireParLots(pieces, { taille: 5, fichier, lire: (lot) => (lus.push(...lot.map((p) => p.id)), lot.map(lecture)) });
	assert.deepEqual(lus, ['a', 'b', 'c', 'd', 'e']);
	assert.deepEqual(lecturesGardees(fichier)[0], { id: 'a', rows: [['a']] });
});

test('a witness that prints its own lines on stdout leaves only the readings', () => {
	assert.deepEqual(lignesLues('Loading weights: 100%\n{"id": "a", "rows": []}\nwarning\n{"id": "b", "rows": [["1"]]}\n'), [{ id: 'a', rows: [] }, { id: 'b', rows: [['1']] }]);
	assert.deepEqual(lecturesGardees('/nonexistent/docling.jsonl'), []);
});
